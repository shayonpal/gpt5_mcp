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
  (process.env.DEFAULT_REASONING_EFFORT as any) || 'high',
  parseInt(process.env.MAX_TOKENS_PER_REQUEST || '4000')
);

const costManager = new CostManager(
  {
    daily: parseFloat(process.env.DAILY_COST_LIMIT || '10'),
    perTask: parseFloat(process.env.TASK_COST_LIMIT || '2'),
    tokenLimit: parseInt(process.env.MAX_TOKENS_PER_REQUEST || '4000')
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
  reasoning_effort: z.enum(['low', 'medium', 'high']).default('high').describe('Reasoning effort level'),
  max_tokens: z.number().min(1).max(8000).default(4000).describe('Maximum tokens in response'),
  task_budget: z.number().optional().describe('Budget limit for this specific task in USD')
});

const StartConversationSchema = z.object({
  topic: z.string().describe('The topic or purpose of the conversation'),
  instructions: z.string().optional().describe('System instructions for the conversation')
});

const ContinueConversationSchema = z.object({
  conversation_id: z.string().describe('The ID of the conversation to continue'),
  message: z.string().describe('The message to send in the conversation')
});

const CostReportSchema = z.object({
  period: z.enum(['current_task', 'today', 'week', 'month']).describe('The period to report on')
});

const CostLimitSchema = z.object({
  daily_limit: z.number().optional().describe('Daily spending limit in USD'),
  task_limit: z.number().optional().describe('Per-task spending limit in USD')
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

// Tool handlers
async function handleConsultGPT5(args: any): Promise<any> {
  const params = ConsultGPT5Schema.parse(args);
  
  // Generate task ID
  const taskId = `task_${Date.now()}`;
  costManager.startNewTask(taskId);

  // If task budget is specified, temporarily update limits
  if (params.task_budget) {
    await costManager.updateLimits({ perTask: params.task_budget });
  }

  try {
    // Build input
    let input = params.prompt;
    if (params.context) {
      input = `Context:\n${params.context}\n\nRequest:\n${params.prompt}`;
    }

    // Create response
    const response = await gpt5Client.createResponse({
      input,
      temperature: params.temperature,
      reasoning: { effort: params.reasoning_effort },
      maxTokens: params.max_tokens
    });

    // Check and record cost
    const costCheck = await costManager.checkAndRecordUsage(taskId, response.usage);
    
    if (!costCheck.allowed) {
      return {
        error: `Cost limit exceeded: ${costCheck.reason}`,
        usage: response.usage
      };
    }

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

    return result;
  } catch (error: any) {
    logger.error('Error consulting GPT-5:', error);
    return {
      error: error.message || 'Failed to consult GPT-5',
      taskId
    };
  }
}

async function handleStartConversation(args: any): Promise<any> {
  const params = StartConversationSchema.parse(args);
  
  try {
    const conversationId = conversationManager.startConversation(
      params.topic,
      params.instructions
    );

    return {
      conversation_id: conversationId,
      topic: params.topic,
      message: `Started new conversation about: ${params.topic}`
    };
  } catch (error: any) {
    logger.error('Error starting conversation:', error);
    return {
      error: error.message || 'Failed to start conversation'
    };
  }
}

async function handleContinueConversation(args: any): Promise<any> {
  const params = ContinueConversationSchema.parse(args);
  
  try {
    // Get conversation context
    const conversation = conversationManager.getConversation(params.conversation_id);
    if (!conversation) {
      return {
        error: `Conversation ${params.conversation_id} not found`
      };
    }

    // Add user message
    conversationManager.addMessage(params.conversation_id, 'user', params.message);

    // Get formatted messages for API
    const messages = conversationManager.formatForAPI(params.conversation_id);
    const instructions = conversationManager.getInstructions(params.conversation_id);

    // Generate task ID for this interaction
    const taskId = `conv_${params.conversation_id}_${Date.now()}`;
    costManager.startNewTask(taskId);

    // Create response
    const response = await gpt5Client.createResponse({
      input: messages,
      instructions,
      temperature: 0.7,
      reasoning: { effort: 'high' }
    });

    // Check and record cost
    const costCheck = await costManager.checkAndRecordUsage(taskId, response.usage);
    
    if (!costCheck.allowed) {
      return {
        error: `Cost limit exceeded: ${costCheck.reason}`,
        conversation_id: params.conversation_id
      };
    }

    // Add assistant response to conversation
    conversationManager.addMessage(params.conversation_id, 'assistant', response.text);
    
    // Update conversation metadata
    conversationManager.updateMetadata(params.conversation_id, {
      totalCost: response.usage.estimatedCost,
      tokenCount: response.usage.totalTokens
    });

    const result = {
      content: response.text,
      conversation_id: params.conversation_id,
      usage: {
        tokens: response.usage.totalTokens,
        cost: response.usage.estimatedCost
      }
    };

    if (costCheck.warning) {
      (result as any).warning = costCheck.warning;
    }

    return result;
  } catch (error: any) {
    logger.error('Error continuing conversation:', error);
    return {
      error: error.message || 'Failed to continue conversation',
      conversation_id: params.conversation_id
    };
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
          per_task: report.limits.perTask?.toFixed(2),
          token_limit: report.limits.tokenLimit
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
        per_task: currentLimits.perTask?.toFixed(2),
        token_limit: currentLimits.tokenLimit
      }
    };
  } catch (error: any) {
    logger.error('Error setting cost limits:', error);
    return {
      error: error.message || 'Failed to set cost limits'
    };
  }
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
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  logger.info(`Calling tool: ${name}`, { args });

  try {
    switch (name) {
      case 'consult_gpt5':
        return { content: [await handleConsultGPT5(args)] };
      
      case 'start_conversation':
        return { content: [await handleStartConversation(args)] };
      
      case 'continue_conversation':
        return { content: [await handleContinueConversation(args)] };
      
      case 'get_cost_report':
        return { content: [await handleGetCostReport(args)] };
      
      case 'set_cost_limits':
        return { content: [await handleSetCostLimits(args)] };
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    logger.error(`Tool ${name} failed:`, error);
    return {
      content: [{
        error: error.message || `Tool ${name} failed`,
        details: error.stack
      }]
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
process.on('SIGINT', () => {
  logger.info('Shutting down GPT-5 MCP Server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down GPT-5 MCP Server...');
  process.exit(0);
});

// Run the server
main().catch((error) => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});