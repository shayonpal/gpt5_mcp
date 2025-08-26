import OpenAI from 'openai';
import { TokenUsage, GPT5Response, ReasoningEffort } from './types.js';

// Pricing per 1K tokens (official OpenAI Standard tier rates)
const PRICING: Record<string, { input: number; output: number; cached?: number; reasoning?: number }> = {
  'gpt-5': {
    input: 0.00125,
    output: 0.01,
    cached: 0.000125,
    reasoning: 0.01
  },
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4-turbo-preview': { input: 0.01, output: 0.03 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 }
};

export class GPT5Client {
  private client: OpenAI;
  private defaultTemperature: number;
  private defaultReasoningEffort: ReasoningEffort;
  // maxTokensDefault removed - using dynamic budget-aware limits

  constructor(
    apiKey: string,
    defaultTemperature = 0.7,
    defaultReasoningEffort: ReasoningEffort = 'high'
    // maxTokensDefault parameter removed
  ) {
    this.client = new OpenAI({ apiKey });
    this.defaultTemperature = defaultTemperature;
    this.defaultReasoningEffort = defaultReasoningEffort;
    // maxTokensDefault assignment removed
  }

  async createResponse(params: {
    input: string | any[];
    instructions?: string;
    temperature?: number;
    reasoning?: { effort: ReasoningEffort };
    maxTokens?: number;
    stream?: boolean;
  }): Promise<GPT5Response> {
    // Always try Responses API first, with robust mapping and retry
    const requestParams: any = { model: this.getResponsesModel() };
    
    // Map input to Responses API format
    if (typeof params.input === 'string') {
      requestParams.input = params.input;
    } else if (Array.isArray(params.input)) {
      // Expect array of { role, content: string }
      requestParams.input = params.input
        .filter((m: any) => m && m.role && typeof m.content === 'string')
        .map((m: any) => ({
          role: m.role,
          content: [{ type: 'input_text', text: m.content }]
        }));
    }

    if (params.instructions) {
      requestParams.instructions = params.instructions;
    }

    requestParams.reasoning = params.reasoning || { effort: this.defaultReasoningEffort };

    try {
      if (params.stream) {
        // Streamed responses aggregation
        const stream = await this.requestWithRetry(async () => (this.client as any).responses.stream(requestParams));
        let text = '';
        await new Promise<void>((resolve, reject) => {
          stream.on('text', (delta: string) => { text += delta; });
          stream.on('end', resolve);
          stream.on('error', reject);
        });
        const fakeUsage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
        return { text, usage: this.extractUsage({ usage: fakeUsage }), raw: { streamed: true } };
      }
      const response = await this.requestWithRetry(async () => (this.client as any).responses.create(requestParams));
      return {
        text: response.output_text || this.extractTextFromOutput(response.output),
        usage: this.extractUsage(response),
        raw: response
      };
    } catch (error: any) {
      // Fallback broadly to chat completions on any failure
      return this.fallbackToChatCompletions(params);
    }
  }

  private async fallbackToChatCompletions(params: {
    input: string | any[];
    instructions?: string;
    temperature?: number;
    reasoning?: { effort: ReasoningEffort };
    maxTokens?: number;
    stream?: boolean;
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

    // Use the most capable and cost-effective models available
    const models = this.getFallbackModels();
    let response: any;
    let modelUsed = 'gpt-4o';

    for (const model of models) {
      try {
        if (params.stream) {
          const stream = await this.requestWithRetry(async () => this.client.chat.completions.create({
            model,
            messages,
            temperature: params.temperature ?? this.defaultTemperature,
            max_tokens: params.maxTokens ?? 4000,
            stream: true
          } as any));
          let text = '';
          // @ts-ignore: stream is an async iterator in newer SDKs; fallback to events if available
          if (typeof (stream as any)[Symbol.asyncIterator] === 'function') {
            for await (const chunk of stream as any) {
              const content = chunk.choices?.[0]?.delta?.content;
              if (content) text += content;
            }
          }
          return {
            text,
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCost: 0 },
            raw: { streamed: true, model }
          } as GPT5Response;
        } else {
          response = await this.requestWithRetry(async () => this.client.chat.completions.create({
            model,
            messages,
            temperature: params.temperature ?? this.defaultTemperature,
            max_tokens: params.maxTokens ?? 4000 // Fallback default for GPT-4 only
          }));
        }
        modelUsed = model;
        break;
      } catch (error: any) {
        if (!error.message?.includes('model')) {
          // For non-model errors, try next model only if rate-limit/server error; otherwise rethrow
          if (error.status === 429 || (error.status && error.status >= 500)) {
            continue;
          }
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
    const model = this.getResponsesModel();
    const pricing = PRICING[model] || PRICING['gpt-5'];
    const inputCost = ((usage.prompt_tokens || usage.input_tokens || 0) * pricing.input) / 1000;
    const outputCost = ((usage.completion_tokens || usage.output_tokens || 0) * pricing.output) / 1000;
    const reasoningRate = pricing.reasoning ?? pricing.output;
    const reasoningCost = ((usage.reasoning_tokens || 0) * reasoningRate) / 1000;
    
    return Number((inputCost + outputCost + reasoningCost).toFixed(4));
  }

  private calculateCostForModel(model: string, usage: any): number {
    // Fallback pricing for GPT-4 models (official OpenAI Standard tier rates per 1K tokens)
    const fallbackPricing: Record<string, { input: number; output: number }> = {
      'gpt-4o': { input: 0.0025, output: 0.01 },           // $2.50/$10.00 per 1M
      'gpt-4o-mini': { input: 0.00015, output: 0.0006 },   // $0.15/$0.60 per 1M
      'gpt-4-turbo-preview': { input: 0.01, output: 0.03 }, // $10.00/$30.00 per 1M
      'gpt-4-turbo': { input: 0.01, output: 0.03 },        // $10.00/$30.00 per 1M
      'gpt-4': { input: 0.03, output: 0.06 },              // $30.00/$60.00 per 1M (legacy)
      'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 }   // $0.50/$1.50 per 1M (legacy)
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

  private getResponsesModel(): string {
    // Allow env override; default to 'gpt-5'
    return process.env.OPENAI_RESPONSES_MODEL || process.env.GPT5_MODEL || 'gpt-5';
  }

  private getFallbackModels(): string[] {
    const envList = process.env.OPENAI_FALLBACK_MODELS;
    if (envList) return envList.split(',').map(s => s.trim()).filter(Boolean);
    return ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo-preview', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'];
  }

  private async requestWithRetry<T>(fn: () => Promise<T>, retries = parseInt(process.env.OPENAI_RETRY_COUNT || '3'), baseDelayMs = parseInt(process.env.OPENAI_RETRY_BASE_DELAY_MS || '300')): Promise<T> {
    let attempt = 0;
    const timeoutMs = parseInt(process.env.OPENAI_TIMEOUT_MS || '30000');
    while (true) {
      try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeoutMs);
        // @ts-ignore pass signal if supported
        const result = await fn();
        clearTimeout(id);
        return result;
      } catch (err: any) {
        attempt++;
        const status = err?.status || err?.response?.status;
        const retriable = status === 429 || (status >= 500 && status < 600);
        if (!retriable || attempt > retries) throw err;
        const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 100);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }
}
