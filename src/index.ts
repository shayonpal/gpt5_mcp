#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import dotenv from 'dotenv';
import winston from 'winston';

import { GPT5Client } from './openai-client.js';
import { CostManager } from './cost-manager.js';
import { ConversationManager } from './conversation.js';

// Load environment variables
dotenv.config();

// Configure logging
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Validate environment
const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) {
  logger.error('OPENAI_API_KEY environment variable is required');
  process.exit(1);
}

// Initialize components
const gpt5Client = new GPT5Client(
  API_KEY,
  parseFloat(process.env.DEFAULT_TEMPERATURE || '0.7'),
  (process.env.DEFAULT_REASONING_EFFORT as any) || 'high'
  // maxTokensDefault removed - using dynamic budget-aware limits
);

const costManager = new CostManager(
  {
    daily: parseFloat(process.env.DAILY_COST_LIMIT || '10'),
    perTask: parseFloat(process.env.TASK_COST_LIMIT || '5')
    // tokenLimit removed - using dynamic budget-aware limits
  },
  process.env.DATA_DIR || './data'
);

const conversationManager = new ConversationManager(
  parseInt(process.env.MAX_CONVERSATIONS || '50'),
  parseInt(process.env.MAX_CONVERSATION_HISTORY || '100')
);

// Define tool schemas
const ConsultGPT5Schema = z.object({
  prompt: z.string().describe('The prompt to send to GPT-5'),
  context: z.string().optional().describe('Additional context for the prompt'),
  temperature: z.number().min(0).max(2).default(0.7).describe('Sampling temperature'),
  reasoning_effort: z.enum(['minimal', 'low', 'medium', 'high']).default('high').describe('Reasoning effort level'),
  max_tokens: z.number().min(1).max(50000).default(20000).describe('Maximum tokens in response'),
  task_budget: z.number().optional().describe('Budget limit for this specific task in USD'),
  confirm_spending: z.boolean().default(false).describe('User confirmation to proceed with spending that exceeds daily limit'),
  stream: z.boolean().optional().describe('Enable streaming mode (server aggregates, client still returns final text)')
});

const StartConversationSchema = z.object({
  topic: z.string().describe('The topic or purpose of the conversation'),
  instructions: z.string().optional().describe('System instructions for the conversation'),
  budget_limit: z.number().optional().describe('Per-conversation budget limit in USD')
});

const ContinueConversationSchema = z.object({
  conversation_id: z.string().describe('The ID of the conversation to continue'),
  message: z.string().describe('The message to send in the conversation'),
  confirm_spending: z.boolean().default(false).describe('User confirmation to proceed with spending if budget is tight'),
  max_tokens: z.number().min(1).max(50000).optional().describe('Optional cap for this single response'),
  budget_limit: z.number().optional().describe('Set or override per-conversation budget in USD'),
  stream: z.boolean().optional().describe('Enable streaming mode (server aggregates, client still returns final text)')
});

const CostReportSchema = z.object({
  period: z.enum(['current_task', 'today', 'week', 'month']).describe('The period to report on')
});

const CostLimitSchema = z.object({
  daily_limit: z.number().optional().describe('Daily spending limit in USD'),
  task_limit: z.number().optional().describe('Per-task spending limit in USD')
});

const SetConversationOptionsSchema = z.object({
  conversation_id: z.string().describe('Conversation ID'),
  budget_limit: z.number().optional().describe('Per-conversation budget limit in USD'),
  context_limit: z.number().int().min(1).max(1000).optional().describe('Messages to keep in context window')
});

const GetConversationMetadataSchema = z.object({
  conversation_id: z.string().describe('Conversation ID')
});

const SummarizeConversationSchema = z.object({
  conversation_id: z.string().describe('Conversation ID'),
  keep_last_n: z.number().int().min(0).max(50).default(5).describe('How many recent messages to keep verbatim'),
  max_tokens: z.number().int().min(500).max(8000).default(2000).describe('Max tokens to allocate for summary generation')
});

// Create MCP server
const server = new Server(
  {
    name: 'gpt5-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Helper function to estimate token count (more accurate approximation)
function estimateTokenCount(text: string): number {
  // Better approximation considering:
  // - English text: ~4 chars per token
  // - Code: ~3 chars per token
  // - Special chars: higher ratio
  const avgCharsPerToken = text.includes('function') || text.includes('class') || text.includes('import') ? 3 : 4;
  return Math.ceil(text.length / avgCharsPerToken);
}

// Helper function to calculate max tokens based on remaining daily budget
async function calculateMaxTokensFromBudget(costManager: CostManager, promptTokens: number): Promise<number> {
  const report = await costManager.getDailyReport();
  const remainingBudget = Math.max(0, report.limits.daily - report.usage.daily);
  
  // GPT-5 pricing: $0.00125 per 1K input tokens, $0.01 per 1K output tokens
  // Reserve 70% of budget for output (since output is 8x more expensive than input)
  const inputBudget = remainingBudget * 0.3;
  const outputBudget = remainingBudget * 0.7;
  
  // Calculate max input tokens from input budget
  const maxInputFromBudget = Math.floor(inputBudget / 0.00125 * 1000);
  
  // Calculate max output tokens from output budget  
  const maxOutputFromBudget = Math.floor(outputBudget / 0.01 * 1000);
  
  // Total tokens = input + output, but we need to account for prompt tokens already calculated
  const maxTotalTokens = maxInputFromBudget + maxOutputFromBudget + promptTokens;
  
  // Minimum reasonable limit (always allow some usage)
  const minimumTokens = 5000;
  
  return Math.max(minimumTokens, maxTotalTokens);
}

// Helper function to calculate safe input token limit considering expected output
function calculateSafeInputTokens(maxTokens: number, promptTokens: number): number {
  // Reserve tokens for output (GPT-5 output can be 2-4x input size for complex reasoning)
  const outputReserve = Math.max(1000, promptTokens * 2);
  const safeInput = maxTokens - outputReserve - promptTokens;
  return Math.max(500, safeInput); // Always leave minimum 500 tokens for content
}

// Helper function to truncate text to fit within token limits
function truncateText(text: string, maxTokens: number): string {
  const estimatedTokens = estimateTokenCount(text);
  if (estimatedTokens <= maxTokens) return text;
  
  const maxChars = maxTokens * 4;
  return text.substring(0, maxChars) + '\n\n[... content truncated to prevent token waste - file too large for current task budget ...]';
}

function truncateInstructions(text: string | undefined, maxTokens: number = parseInt(process.env.MAX_INSTRUCTION_TOKENS || '1500')): string | undefined {
  if (!text) return undefined;
  return truncateText(text, maxTokens);
}

// Helper function to detect and collapse large JSON or base64 blobs
function normalizeContentSnippet(input: any, maxTokens: number): string {
  try {
    if (typeof input === 'object') {
      const pretty = JSON.stringify(input, null, 2);
      return truncateText(pretty, maxTokens);
    }
    const str = String(input);
    // Collapse obvious base64/binary like content
    if (/^[A-Za-z0-9+/=]{512,}$/.test(str)) {
      return '[binary/base64 content omitted]';
    }
    // Try JSON parse for stringified JSON
    try {
      const parsed = JSON.parse(str);
      const pretty = JSON.stringify(parsed, null, 2);
      return truncateText(pretty, maxTokens);
    } catch {}
    return truncateText(str, maxTokens);
  } catch {
    return truncateText(String(input ?? ''), maxTokens);
  }
}

// Helper function to process MCP resources into text content with size limits
async function processResources(meta?: any, maxTokens: number = 2000): Promise<string> {
  if (!meta) return '';
  
  let resourceContent = '';
  const perResourceMaxTokens = parseInt(process.env.RESOURCE_MAX_TOKENS || '1500');
  const maxResources = parseInt(process.env.RESOURCE_MAX_COUNT || '5');
  let resourcesIncluded = 0;
  
  try {
    // Handle different ways resources might be passed
    // MCP can pass resources in various formats
    
    if (meta.resources && Array.isArray(meta.resources)) {
      for (const resource of meta.resources) {
        if (resourcesIncluded >= maxResources) {
          resourceContent += '\n[... additional resources omitted due to count limit ...]\n';
          break;
        }
        if (resource.text) {
          const header = `\n--- Resource: ${resource.name || resource.uri || 'file'} ---\n`;
          const footer = '\n--- End Resource ---\n';
          
          // Check remaining token budget
          const usedTokens = estimateTokenCount(resourceContent);
          const availableTokens = maxTokens - usedTokens - estimateTokenCount(header + footer);
          
          if (availableTokens > 100) { // Need minimum space for content
            const truncatedText = normalizeContentSnippet(resource.text, Math.min(availableTokens, perResourceMaxTokens));
            resourceContent += header + truncatedText + footer;
            resourcesIncluded++;
          } else {
            resourceContent += '\n[... additional resources truncated due to token limits ...]\n';
            break;
          }
        } else if (resource.content) {
          const header = `\n--- Resource: ${resource.name || resource.uri || 'file'} ---\n`;
          const footer = '\n--- End Resource ---\n';
          
          const usedTokens = estimateTokenCount(resourceContent);
          const availableTokens = maxTokens - usedTokens - estimateTokenCount(header + footer);
          
          if (availableTokens > 100) {
            const truncatedText = normalizeContentSnippet(resource.content, Math.min(availableTokens, perResourceMaxTokens));
            resourceContent += header + truncatedText + footer;
            resourcesIncluded++;
          } else {
            resourceContent += '\n[... additional resources truncated due to token limits ...]\n';
            break;
          }
        } else if (resource.uri) {
          resourceContent += `\n--- File Reference: ${resource.uri} ---\n`;
          resourcesIncluded++;
        }
      }
    }
    
    // Handle content array format (common in MCP)
    if (meta.content && Array.isArray(meta.content)) {
      for (const item of meta.content) {
        const usedTokens = estimateTokenCount(resourceContent);
        if (usedTokens >= maxTokens - 100) {
          resourceContent += '\n[... additional content truncated due to token limits ...]\n';
          break;
        }
        
        if (resourcesIncluded >= maxResources) {
          resourceContent += '\n[... additional content omitted due to count limit ...]\n';
          break;
        }
        if (item.type === 'text' && item.text) {
          const header = `\n--- Attached Content ---\n`;
          const footer = '\n--- End Content ---\n';
          
          const availableTokens = maxTokens - usedTokens - estimateTokenCount(header + footer);
          if (availableTokens > 100) {
            const truncatedText = normalizeContentSnippet(item.text, Math.min(availableTokens, perResourceMaxTokens));
            resourceContent += header + truncatedText + footer;
            resourcesIncluded++;
          }
        } else if (item.type === 'resource' && item.resource) {
          const res = item.resource;
          const header = `\n--- Resource: ${res.name || res.uri || 'file'} ---\n`;
          const footer = '\n--- End Resource ---\n';
          
          const availableTokens = maxTokens - usedTokens - estimateTokenCount(header + footer);
          if (availableTokens > 100) {
            if (res.text) {
              const truncatedText = normalizeContentSnippet(res.text, Math.min(availableTokens, perResourceMaxTokens));
              resourceContent += header + truncatedText + footer;
              resourcesIncluded++;
            } else if (res.content) {
              const truncatedText = normalizeContentSnippet(res.content, Math.min(availableTokens, perResourceMaxTokens));
              resourceContent += header + truncatedText + footer;
              resourcesIncluded++;
            }
          }
        }
      }
    }
    
    // Fallback: check if meta itself has content
    if (!resourceContent && meta.text) {
      const header = `\n--- Attached Content ---\n`;
      const footer = `\n--- End Content ---\n`;
      const availableTokens = maxTokens - estimateTokenCount(header + footer);
      
      if (availableTokens > 100) {
        const truncatedText = normalizeContentSnippet(meta.text, Math.min(availableTokens, perResourceMaxTokens));
        resourceContent = header + truncatedText + footer;
      }
    }
    
  } catch (error) {
    logger.warn('Error processing resources:', error);
  }
  
  return resourceContent;
}

// Tool handlers
async function handleConsultGPT5(args: any, meta?: any): Promise<any> {
  const params = ConsultGPT5Schema.parse(args);
  
  // Generate task ID
  const taskId = `task_${Date.now()}`;
  costManager.startNewTask(taskId);

  // If task budget is specified, temporarily update limits
  if (params.task_budget) {
    await costManager.updateLimits({ perTask: params.task_budget });
  }

  try {
    // Calculate maximum tokens based on remaining daily budget
    const promptTokens = estimateTokenCount(params.prompt + (params.context || ''));
    const budgetBasedMaxTokens = await calculateMaxTokensFromBudget(costManager, promptTokens);
    
    // Use the smaller of user-requested max_tokens or budget-based limit
    const effectiveMaxTokens = Math.min(params.max_tokens, budgetBasedMaxTokens);
    
    // Calculate safe token limits for resources
    const maxInputTokens = calculateSafeInputTokens(effectiveMaxTokens, promptTokens);
    
    // Process any attached resources with smart token limiting
    const resourceContent = await processResources(meta, maxInputTokens);
    
    // Build input with resources
    let input = params.prompt;
    
    if (resourceContent) {
      input = `Attached Files/Resources:\n${resourceContent}\n\n`;
      
      if (params.context) {
        input += `Context:\n${params.context}\n\nRequest:\n${params.prompt}`;
      } else {
        input += `Request:\n${params.prompt}`;
      }
    } else if (params.context) {
      input = `Context:\n${params.context}\n\nRequest:\n${params.prompt}`;
    }

    // Inform user about effective token limit
    if (effectiveMaxTokens < params.max_tokens) {
      logger.info(`Token limit adjusted to ${effectiveMaxTokens} based on remaining daily budget (requested: ${params.max_tokens})`);
    }

    // Final safety check - if input is still too large, warn user
    const finalInputTokens = estimateTokenCount(input);
    if (finalInputTokens > maxInputTokens) {
      logger.warn(`Input size (${finalInputTokens} tokens) may exceed safe limits for effective max_tokens=${effectiveMaxTokens}`);
    }

    // Pre-flight cost check with confirmation system
    const estimatedUsage = {
      inputTokens: finalInputTokens,
      outputTokens: Math.min(effectiveMaxTokens - finalInputTokens, effectiveMaxTokens * 0.7),
      totalTokens: finalInputTokens + Math.min(effectiveMaxTokens - finalInputTokens, effectiveMaxTokens * 0.7),
      estimatedCost: ((finalInputTokens * 0.00125) + (Math.min(effectiveMaxTokens - finalInputTokens, effectiveMaxTokens * 0.7) * 0.01)) / 1000
    };

    const preCheck = await costManager.checkAndRecordUsage(taskId, estimatedUsage, params.confirm_spending, { record: false });
    
    if (!preCheck.allowed && preCheck.needsConfirmation) {
      return {
        type: 'text',
        text: `⚠️  Cost Confirmation Required\n\n${preCheck.reason}\n\nTo proceed, call this tool again with confirm_spending=true\n\nEstimated cost: $${estimatedUsage.estimatedCost.toFixed(4)}\nTask ID: ${taskId}`
      };
    }

    // Create response with budget-aware token limit
    const response = await gpt5Client.createResponse({
      input,
      temperature: params.temperature,
      reasoning: { effort: params.reasoning_effort },
      maxTokens: effectiveMaxTokens,
      stream: params.stream
    });

    // Record actual cost (pre-flight estimation is replaced with actual usage)
    const costCheck = await costManager.checkAndRecordUsage(taskId, response.usage, params.confirm_spending);

    const result = {
      content: response.text,
      usage: {
        tokens: response.usage.totalTokens,
        cost: response.usage.estimatedCost,
        breakdown: {
          input: response.usage.inputTokens,
          output: response.usage.outputTokens,
          reasoning: response.usage.reasoningTokens
        }
      },
      taskId
    };

    if (costCheck.warning) {
      (result as any).warning = costCheck.warning;
    }

    // Return in proper MCP format - GPT-5 response as main content
    return {
      type: 'text',
      text: result.content
    };
  } catch (error: any) {
    logger.error('Error consulting GPT-5:', error);
    return {
      type: 'text',
      text: `❌ Error: ${error.message || 'Failed to consult GPT-5'}\n\nTask ID: ${taskId}`
    };
  }
}

async function handleStartConversation(args: any): Promise<any> {
  const params = StartConversationSchema.parse(args);
  
  try {
    const conversationId = conversationManager.startConversation(
      params.topic,
      params.instructions,
      params.budget_limit
    );

    return {
      type: 'text',
      text: `✅ Started conversation: ${conversationId}\nTopic: ${params.topic}${params.budget_limit ? `\nBudget limit: $${params.budget_limit.toFixed(2)}` : ''}`
    };
  } catch (error: any) {
    logger.error('Error starting conversation:', error);
    return {
      type: 'text',
      text: `❌ Error starting conversation: ${error.message || 'Failed to start conversation'}`
    };
  }
}

async function handleContinueConversation(args: any): Promise<any> {
  const params = ContinueConversationSchema.parse(args);
  
  try {
    // Get conversation context
    const conversation = conversationManager.getConversation(params.conversation_id);
    if (!conversation) {
      return { type: 'text', text: `❌ Conversation not found: ${params.conversation_id}` };
    }

    // Apply/override per-conversation budget if provided
    if (typeof params.budget_limit === 'number') {
      conversation.metadata.budgetLimit = params.budget_limit;
    }

    // Add user message
    conversationManager.addMessage(params.conversation_id, 'user', params.message);

    // Get formatted messages for API with context limit
    const contextLimit = parseInt(process.env.MAX_CONVERSATION_CONTEXT || '10');
    const messages = conversationManager.formatForAPI(params.conversation_id, undefined, contextLimit);
    const instructions = truncateInstructions(conversationManager.getInstructions(params.conversation_id));

    // Generate task ID for this interaction
    const taskId = `conv_${params.conversation_id}_${Date.now()}`;
    costManager.startNewTask(taskId);

    // Pre-flight budgeting
    const textForEstimation = [
      instructions ? `Instructions:\n${instructions}` : '',
      ...messages.map((m: any) => `${m.role}: ${m.content}`)
    ].filter(Boolean).join('\n');

    const promptTokens = estimateTokenCount(textForEstimation);
    const budgetBasedMaxTokens = await calculateMaxTokensFromBudget(costManager, promptTokens);
    const userMax = typeof params.max_tokens === 'number' ? params.max_tokens : undefined;
    const effectiveMaxTokens = Math.min(budgetBasedMaxTokens, userMax ?? budgetBasedMaxTokens);
    const maxInputTokens = calculateSafeInputTokens(effectiveMaxTokens, promptTokens);

    // Pre-flight cost check
    const estimatedUsage = {
      inputTokens: Math.min(promptTokens, maxInputTokens),
      outputTokens: Math.min(effectiveMaxTokens - promptTokens, Math.floor(effectiveMaxTokens * 0.7)),
      totalTokens: 0 as any,
      estimatedCost: 0 as any
    } as any;
    estimatedUsage.totalTokens = estimatedUsage.inputTokens + (estimatedUsage.outputTokens || 0);
    estimatedUsage.estimatedCost = ((estimatedUsage.inputTokens * 0.00125) + ((estimatedUsage.outputTokens || 0) * 0.01)) / 1000;

    const preCheck = await costManager.checkAndRecordUsage(taskId, estimatedUsage, params.confirm_spending, { record: false });
    if (!preCheck.allowed && preCheck.needsConfirmation) {
      return {
        type: 'text',
        text: `⚠️ Cost confirmation required. ${preCheck.reason}\nCall again with confirm_spending=true to proceed.\nTask ID: ${taskId}`
      };
    }

    // Per-conversation budget check
    if (conversation.metadata.budgetLimit) {
      const remainingConv = Math.max(0, conversation.metadata.budgetLimit - conversation.metadata.totalCost);
      if (!params.confirm_spending && (estimatedUsage.estimatedCost > remainingConv || remainingConv <= conversation.metadata.budgetLimit * 0.1)) {
        return {
          type: 'text',
          text: `⚠️ Conversation budget check: remaining $${remainingConv.toFixed(2)} of $${conversation.metadata.budgetLimit.toFixed(2)}. This turn estimated $${estimatedUsage.estimatedCost.toFixed(4)}.\nCall again with confirm_spending=true to proceed, or increase budget_limit.`
        };
      }
      // Hard block extreme overspend (configurable multiplier of remaining)
      const hardCapMultiplier = parseFloat(process.env.CONVERSATION_HARD_CAP_MULTIPLIER || '10');
      if (estimatedUsage.estimatedCost > remainingConv * hardCapMultiplier) {
        return { type: 'text', text: `❌ This turn's estimated cost $${estimatedUsage.estimatedCost.toFixed(4)} exceeds ${hardCapMultiplier}x remaining conversation budget ($${remainingConv.toFixed(2)}).` };
      }
    }

    // Create response with budget-aware settings
    const response = await gpt5Client.createResponse({
      input: messages,
      instructions,
      temperature: 0.7,
      reasoning: { effort: 'high' },
      maxTokens: effectiveMaxTokens,
      stream: params.stream
    });

    // Record cost and get warnings
    const costCheck = await costManager.checkAndRecordUsage(taskId, response.usage);

    // Add assistant response to conversation
    conversationManager.addMessage(params.conversation_id, 'assistant', response.text);
    
    // Update conversation metadata
    conversationManager.updateMetadata(params.conversation_id, {
      totalCost: response.usage.estimatedCost,
      tokenCount: response.usage.totalTokens
    });

    const summaryLines = [
      `💬 Conversation: ${params.conversation_id}`,
      costCheck.warning ? `⚠️ ${costCheck.warning}` : null,
      `Tokens: in=${response.usage.inputTokens}, out=${response.usage.outputTokens}, total=${response.usage.totalTokens}`,
      `Estimated cost: $${response.usage.estimatedCost.toFixed(4)}`,
      conversation.metadata.budgetLimit ? `Conversation budget: $${conversation.metadata.totalCost.toFixed(4)} / $${conversation.metadata.budgetLimit.toFixed(2)}` : null
    ].filter(Boolean);

    return { type: 'text', text: `${response.text}\n\n---\n${summaryLines.join('\n')}` };
  } catch (error: any) {
    logger.error('Error continuing conversation:', error);
    return { type: 'text', text: `❌ Error continuing conversation ${params.conversation_id}: ${error.message || 'Unknown error'}` };
  }
}

async function handleGetCostReport(args: any): Promise<any> {
  const params = CostReportSchema.parse(args);
  
  try {
    const report = await costManager.generateReport(params.period);
    
    return {
      report: {
        period: report.period,
        total_cost: report.totalCost.toFixed(4),
        breakdown: report.breakdown.map(item => ({
          date: item.date,
          cost: item.cost.toFixed(4),
          tokens: item.tokenUsage
        })),
        limits: {
          daily: report.limits.daily?.toFixed(2),
          per_task: report.limits.perTask?.toFixed(2)
          // token_limit removed - using dynamic budget-aware limits
        },
        remaining: {
          daily: report.remaining.daily?.toFixed(2),
          task: report.remaining.task?.toFixed(2)
        }
      },
      conversation_stats: conversationManager.getStats()
    };
  } catch (error: any) {
    logger.error('Error generating cost report:', error);
    return {
      error: error.message || 'Failed to generate cost report'
    };
  }
}

async function handleSetCostLimits(args: any): Promise<any> {
  const params = CostLimitSchema.parse(args);
  
  try {
    await costManager.updateLimits({
      daily: params.daily_limit,
      perTask: params.task_limit
    });

    const currentLimits = costManager.getCurrentLimits();
    
    return {
      message: 'Cost limits updated successfully',
      limits: {
        daily: currentLimits.daily?.toFixed(2),
        per_task: currentLimits.perTask?.toFixed(2)
        // token_limit removed - using dynamic budget-aware limits
      }
    };
  } catch (error: any) {
    logger.error('Error setting cost limits:', error);
    return {
      error: error.message || 'Failed to set cost limits'
    };
  }
}

async function handleSetConversationOptions(args: any): Promise<any> {
  const params = SetConversationOptionsSchema.parse(args);
  try {
    conversationManager.setOptions(params.conversation_id, {
      budgetLimit: params.budget_limit,
      contextLimit: params.context_limit
    });
    return { type: 'text', text: `✅ Updated conversation ${params.conversation_id}${params.budget_limit ? `\nBudget limit: $${params.budget_limit.toFixed(2)}` : ''}${params.context_limit ? `\nContext limit: ${params.context_limit}` : ''}` };
  } catch (error: any) {
    return { type: 'text', text: `❌ Failed to set options: ${error.message || 'Unknown error'}` };
  }
}

async function handleGetConversationMetadata(args: any): Promise<any> {
  const params = GetConversationMetadataSchema.parse(args);
  const meta = conversationManager.getMetadata(params.conversation_id);
  if (!meta) return { type: 'text', text: `❌ Conversation not found: ${params.conversation_id}` };
  return { type: 'text', text: JSON.stringify(meta, null, 2) };
}

async function handleSummarizeConversation(args: any): Promise<any> {
  const params = SummarizeConversationSchema.parse(args);
  const conversation = conversationManager.getConversation(params.conversation_id);
  if (!conversation) return { type: 'text', text: `❌ Conversation not found: ${params.conversation_id}` };

  // Build summary prompt
  const keep = Math.max(0, params.keep_last_n);
  const messages = conversation.messages;
  const hasDev = messages[0]?.role === 'developer';
  const prefix = hasDev ? messages[0] : null;
  const headIndex = hasDev ? 1 : 0;
  const recent = messages.slice(Math.max(headIndex, messages.length - keep));
  const toSummarize = messages.slice(headIndex, Math.max(headIndex, messages.length - keep));

  const summaryInput = [
    'Summarize the following conversation messages into a concise brief that preserves key decisions, facts, constraints, and pending questions. Use bullet points. Keep it under 300 words.\n',
    ...toSummarize.map(m => `${m.role.toUpperCase()}: ${m.content}`)
  ].join('\n');

  const response = await gpt5Client.createResponse({
    input: summaryInput,
    reasoning: { effort: 'low' },
    maxTokens: params.max_tokens
  });

  // Replace messages with summary + recent
  const newMessages: any[] = [];
  if (prefix) newMessages.push(prefix);
  newMessages.push({ role: 'assistant', content: `Conversation summary (compressed):\n${response.text}`, timestamp: new Date() });
  for (const m of recent) newMessages.push(m);

  (conversation as any).messages = newMessages as any;
  conversation.metadata.lastActive = new Date();

  return { type: 'text', text: `✅ Conversation summarized. Kept last ${keep} messages. Summary tokens ~${response.usage.totalTokens}.` };
}

// Register tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'consult_gpt5',
      description: 'Consult GPT-5 for planning or coding assistance',
      inputSchema: zodToJsonSchema(ConsultGPT5Schema) as any
    },
    {
      name: 'start_conversation',
      description: 'Start a new conversation with GPT-5',
      inputSchema: zodToJsonSchema(StartConversationSchema) as any
    },
    {
      name: 'continue_conversation',
      description: 'Continue an existing conversation with GPT-5',
      inputSchema: zodToJsonSchema(ContinueConversationSchema) as any
    },
    {
      name: 'get_cost_report',
      description: 'Get a report of current costs and usage',
      inputSchema: zodToJsonSchema(CostReportSchema) as any
    },
    {
      name: 'set_cost_limits',
      description: 'Configure spending limits for GPT-5 usage',
      inputSchema: zodToJsonSchema(CostLimitSchema) as any
    },
    {
      name: 'set_conversation_options',
      description: 'Adjust conversation budget/context options',
      inputSchema: zodToJsonSchema(SetConversationOptionsSchema) as any
    },
    {
      name: 'get_conversation_metadata',
      description: 'Return conversation metadata and messages',
      inputSchema: zodToJsonSchema(GetConversationMetadataSchema) as any
    },
    {
      name: 'summarize_conversation',
      description: 'Summarize a conversation to reduce context size',
      inputSchema: zodToJsonSchema(SummarizeConversationSchema) as any
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const requestId = `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;

  logger.info(`Calling tool: ${name}`, { requestId, args });

  try {
    // Ensure we always return a valid MCP content item
    const toContent = (result: any) => {
      if (result && typeof result === 'object' && typeof result.type === 'string') {
        return result;
      }
      const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      return { type: 'text', text } as any;
    };

    switch (name) {
      case 'consult_gpt5':
        return { content: [toContent(await handleConsultGPT5(args, request.params._meta))] };
      
      case 'start_conversation':
        return { content: [toContent(await handleStartConversation(args))] };
      
      case 'continue_conversation':
        return { content: [toContent(await handleContinueConversation(args))] };
      
      case 'get_cost_report':
        return { content: [toContent(await handleGetCostReport(args))] };
      
      case 'set_cost_limits':
        return { content: [toContent(await handleSetCostLimits(args))] };
      
      case 'set_conversation_options':
        return { content: [toContent(await handleSetConversationOptions(args))] };
      
      case 'get_conversation_metadata':
        return { content: [toContent(await handleGetConversationMetadata(args))] };
      
      case 'summarize_conversation':
        return { content: [toContent(await handleSummarizeConversation(args))] };
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    logger.error(`Tool ${name} failed:`, { requestId, error });
    return {
      content: [{ type: 'text', text: `❌ Tool ${name} failed: ${error.message || 'Unknown error'}` }]
    };
  }
});

// Start server
async function main() {
  try {
    // Test OpenAI connection
    logger.info('Testing OpenAI API connection...');
    const connected = await gpt5Client.testConnection();
    if (!connected) {
      logger.warn('OpenAI API connection test failed - check your API key');
    } else {
      logger.info('OpenAI API connection successful');
    }

    // Start MCP server
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    logger.info('GPT-5 MCP Server is running');
    logger.info('Configuration:', {
      dailyLimit: process.env.DAILY_COST_LIMIT || '10',
      taskLimit: process.env.TASK_COST_LIMIT || '2',
      defaultTemperature: process.env.DEFAULT_TEMPERATURE || '0.7',
      defaultReasoningEffort: process.env.DEFAULT_REASONING_EFFORT || 'high'
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down GPT-5 MCP Server...');
  try { await costManager.flush(); } catch {}
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down GPT-5 MCP Server...');
  try { await costManager.flush(); } catch {}
  process.exit(0);
});

// Run the server
main().catch((error) => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});
