export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  totalTokens: number;
  estimatedCost: number;
}

export interface CostLimits {
  perTask?: number;
  daily?: number;
  // tokenLimit removed - using dynamic budget-aware limits
}

export interface GPT5Response {
  text: string;
  usage: TokenUsage;
  raw: any;
}

export interface Conversation {
  id: string;
  messages: ConversationMessage[];
  metadata: ConversationMetadata;
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'developer';
  content: string;
  timestamp: Date;
}

export interface ConversationMetadata {
  created: Date;
  lastActive: Date;
  totalCost: number;
  tokenCount: number;
  topic?: string;
  budgetLimit?: number;
  contextLimit?: number;
}

export interface CostReport {
  period: string;
  totalCost: number;
  breakdown: CostBreakdown[];
  limits: CostLimits;
  remaining: {
    daily?: number;
    task?: number;
  };
}

export interface CostBreakdown {
  date: string;
  cost: number;
  tokenUsage: {
    input: number;
    output: number;
    reasoning?: number;
  };
}

export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

export interface ConsultParams {
  prompt: string;
  context?: string;
  temperature?: number;
  reasoning_effort?: ReasoningEffort;
  max_tokens?: number;
  task_budget?: number;
}

export interface ConversationStartParams {
  topic: string;
  instructions?: string;
}

export interface ConversationContinueParams {
  conversation_id: string;
  message: string;
}

export interface CostReportParams {
  period: 'current_task' | 'today' | 'week' | 'month';
}

export interface CostLimitParams {
  daily_limit?: number;
  task_limit?: number;
}
