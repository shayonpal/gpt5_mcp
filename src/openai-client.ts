import OpenAI from 'openai';
import { TokenUsage, GPT5Response, ReasoningEffort } from './types.js';

// Pricing per 1K tokens (estimated based on GPT-5 being premium)
const PRICING = {
  'gpt-5': {
    input: 0.02,
    output: 0.06,
    reasoning: 0.10
  }
};

export class GPT5Client {
  private client: OpenAI;
  private defaultTemperature: number;
  private defaultReasoningEffort: ReasoningEffort;
  private maxTokensDefault: number;

  constructor(
    apiKey: string,
    defaultTemperature = 0.7,
    defaultReasoningEffort: ReasoningEffort = 'high',
    maxTokensDefault = 4000
  ) {
    this.client = new OpenAI({ apiKey });
    this.defaultTemperature = defaultTemperature;
    this.defaultReasoningEffort = defaultReasoningEffort;
    this.maxTokensDefault = maxTokensDefault;
  }

  async createResponse(params: {
    input: string | any[];
    instructions?: string;
    temperature?: number;
    reasoning?: { effort: ReasoningEffort };
    maxTokens?: number;
  }): Promise<GPT5Response> {
    try {
      // Using the new Responses API format from the documentation
      const requestParams: any = {
        model: 'gpt-5',
        input: params.input
      };

      if (params.instructions) {
        requestParams.instructions = params.instructions;
      }

      if (params.reasoning) {
        requestParams.reasoning = params.reasoning;
      } else {
        requestParams.reasoning = { effort: this.defaultReasoningEffort };
      }

      // Note: GPT-5 Responses API doesn't support temperature or max_tokens parameters
      // These parameters are only added in the fallback to chat completions

      // Call the new responses.create endpoint
      const response = await (this.client as any).responses.create(requestParams);

      return {
        text: response.output_text || this.extractTextFromOutput(response.output),
        usage: this.extractUsage(response),
        raw: response
      };
    } catch (error: any) {
      // Fallback to standard chat completions if responses API is not available
      if (error.status === 404 || error.message?.includes('responses')) {
        return this.fallbackToChatCompletions(params);
      }
      throw error;
    }
  }

  private async fallbackToChatCompletions(params: {
    input: string | any[];
    instructions?: string;
    temperature?: number;
    reasoning?: { effort: ReasoningEffort };
    maxTokens?: number;
  }): Promise<GPT5Response> {
    console.warn('Falling back to chat completions API (responses API not available)');
    
    const messages: any[] = [];
    
    // Add system message if instructions provided
    if (params.instructions) {
      messages.push({ role: 'system', content: params.instructions });
    }

    // Handle input - could be string or array of messages
    if (typeof params.input === 'string') {
      messages.push({ role: 'user', content: params.input });
    } else if (Array.isArray(params.input)) {
      // Convert new format to old format
      for (const msg of params.input) {
        if (msg.role && msg.content) {
          // Handle different content types
          if (typeof msg.content === 'string') {
            messages.push({ role: msg.role, content: msg.content });
          } else if (Array.isArray(msg.content)) {
            // Extract text content
            const textContent = msg.content
              .filter((c: any) => c.type === 'input_text' || c.type === 'text')
              .map((c: any) => c.text || c.content)
              .join('\n');
            if (textContent) {
              messages.push({ role: msg.role, content: textContent });
            }
          }
        }
      }
    }

    // Use the most capable model available
    const models = ['gpt-4-turbo-preview', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'];
    let response: any;
    let modelUsed = 'gpt-4-turbo-preview';

    for (const model of models) {
      try {
        response = await this.client.chat.completions.create({
          model,
          messages,
          temperature: params.temperature ?? this.defaultTemperature,
          max_tokens: params.maxTokens ?? this.maxTokensDefault
        });
        modelUsed = model;
        break;
      } catch (error: any) {
        if (!error.message?.includes('model')) {
          throw error;
        }
        // Try next model
      }
    }

    if (!response) {
      throw new Error('No compatible model available');
    }

    const usage = response.usage || {};
    const estimatedCost = this.calculateCostForModel(modelUsed, usage);

    return {
      text: response.choices[0]?.message?.content || '',
      usage: {
        inputTokens: usage.prompt_tokens || 0,
        outputTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0,
        estimatedCost
      },
      raw: response
    };
  }

  private extractTextFromOutput(output: any): string {
    if (!output) return '';
    
    // Handle array of outputs
    if (Array.isArray(output)) {
      const texts: string[] = [];
      for (const item of output) {
        if (item.type === 'message' && item.content) {
          for (const content of item.content) {
            if (content.type === 'output_text' || content.type === 'text') {
              texts.push(content.text || content.content || '');
            }
          }
        }
      }
      return texts.join('\n');
    }
    
    return '';
  }

  private extractUsage(response: any): TokenUsage {
    const usage = response.usage || {};
    
    return {
      inputTokens: usage.prompt_tokens || usage.input_tokens || 0,
      outputTokens: usage.completion_tokens || usage.output_tokens || 0,
      reasoningTokens: usage.reasoning_tokens || 0,
      totalTokens: usage.total_tokens || 0,
      estimatedCost: this.calculateCost(usage)
    };
  }

  private calculateCost(usage: any): number {
    const inputCost = ((usage.prompt_tokens || usage.input_tokens || 0) * PRICING['gpt-5'].input) / 1000;
    const outputCost = ((usage.completion_tokens || usage.output_tokens || 0) * PRICING['gpt-5'].output) / 1000;
    const reasoningCost = ((usage.reasoning_tokens || 0) * PRICING['gpt-5'].reasoning) / 1000;
    
    return Number((inputCost + outputCost + reasoningCost).toFixed(4));
  }

  private calculateCostForModel(model: string, usage: any): number {
    // Fallback pricing for GPT-4 models
    const fallbackPricing: Record<string, { input: number; output: number }> = {
      'gpt-4-turbo-preview': { input: 0.01, output: 0.03 },
      'gpt-4-turbo': { input: 0.01, output: 0.03 },
      'gpt-4': { input: 0.03, output: 0.06 },
      'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 }
    };

    const pricing = fallbackPricing[model] || fallbackPricing['gpt-4'];
    const inputCost = ((usage.prompt_tokens || 0) * pricing.input) / 1000;
    const outputCost = ((usage.completion_tokens || 0) * pricing.output) / 1000;
    
    return Number((inputCost + outputCost).toFixed(4));
  }

  async testConnection(): Promise<boolean> {
    try {
      // Try a minimal request to verify API key without maxTokens parameter
      const response = await this.createResponse({
        input: 'Say "OK" if you can hear me.'
      });
      return response.text.length > 0;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }
}