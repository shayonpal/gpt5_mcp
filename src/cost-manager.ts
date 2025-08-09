import fs from 'fs/promises';
import path from 'path';
import { 
  TokenUsage, 
  CostLimits, 
  CostReport, 
  CostBreakdown 
} from './types.js';

interface UsageRecord {
  timestamp: Date;
  taskId: string;
  cost: number;
  tokens: {
    input: number;
    output: number;
    reasoning?: number;
  };
}

export class CostManager {
  private dailyUsage: Map<string, number> = new Map();
  private taskUsage: Map<string, number> = new Map();
  private limits: CostLimits;
  private dataDir: string;
  private usageHistory: UsageRecord[] = [];
  private currentTaskId: string | null = null;

  constructor(limits: CostLimits = {}, dataDir = './data') {
    this.limits = {
      daily: limits.daily ?? parseFloat(process.env.DAILY_COST_LIMIT || '10'),
      perTask: limits.perTask ?? parseFloat(process.env.TASK_COST_LIMIT || '2'),
      tokenLimit: limits.tokenLimit ?? parseInt(process.env.MAX_TOKENS_PER_REQUEST || '4000')
    };
    this.dataDir = dataDir;
    this.initializeStorage();
  }

  private async initializeStorage(): Promise<void> {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      await this.loadPersistedData();
    } catch (error) {
      console.error('Failed to initialize storage:', error);
    }
  }

  async checkAndRecordUsage(
    taskId: string,
    usage: TokenUsage
  ): Promise<{ allowed: boolean; reason?: string; warning?: string }> {
    const today = new Date().toISOString().split('T')[0];
    const dailyTotal = this.dailyUsage.get(today) || 0;
    const taskTotal = this.taskUsage.get(taskId) || 0;

    // Check token limit
    if (this.limits.tokenLimit && usage.totalTokens > this.limits.tokenLimit) {
      return {
        allowed: false,
        reason: `Token limit of ${this.limits.tokenLimit} would be exceeded (requested: ${usage.totalTokens})`
      };
    }

    // Check daily limit
    if (this.limits.daily && dailyTotal + usage.estimatedCost > this.limits.daily) {
      return {
        allowed: false,
        reason: `Daily limit of $${this.limits.daily.toFixed(2)} would be exceeded (current: $${dailyTotal.toFixed(2)}, requested: $${usage.estimatedCost.toFixed(4)})`
      };
    }

    // Check task limit
    if (this.limits.perTask && taskTotal + usage.estimatedCost > this.limits.perTask) {
      return {
        allowed: false,
        reason: `Task limit of $${this.limits.perTask.toFixed(2)} would be exceeded (current: $${taskTotal.toFixed(2)}, requested: $${usage.estimatedCost.toFixed(4)})`
      };
    }

    // Generate warnings for approaching limits
    let warning: string | undefined;
    if (this.limits.daily) {
      const dailyPercentage = ((dailyTotal + usage.estimatedCost) / this.limits.daily) * 100;
      if (dailyPercentage > 80) {
        warning = `Daily usage at ${dailyPercentage.toFixed(1)}% of limit`;
      }
    }

    // Record the usage
    await this.recordUsage(taskId, usage);

    return { allowed: true, warning };
  }

  private async recordUsage(taskId: string, usage: TokenUsage): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    
    // Update daily usage
    const dailyTotal = this.dailyUsage.get(today) || 0;
    this.dailyUsage.set(today, dailyTotal + usage.estimatedCost);

    // Update task usage
    const taskTotal = this.taskUsage.get(taskId) || 0;
    this.taskUsage.set(taskId, taskTotal + usage.estimatedCost);

    // Add to history
    this.usageHistory.push({
      timestamp: new Date(),
      taskId,
      cost: usage.estimatedCost,
      tokens: {
        input: usage.inputTokens,
        output: usage.outputTokens,
        reasoning: usage.reasoningTokens
      }
    });

    // Set current task
    this.currentTaskId = taskId;

    // Persist data
    await this.persistData();
  }

  async generateReport(period: 'current_task' | 'today' | 'week' | 'month'): Promise<CostReport> {
    const now = new Date();
    let startDate: Date;
    let periodLabel: string;

    switch (period) {
      case 'current_task':
        if (!this.currentTaskId) {
          return this.createEmptyReport('No current task');
        }
        return this.generateTaskReport(this.currentTaskId);
      
      case 'today':
        startDate = new Date(now.toISOString().split('T')[0]);
        periodLabel = 'Today';
        break;
      
      case 'week':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 7);
        periodLabel = 'Past Week';
        break;
      
      case 'month':
        startDate = new Date(now);
        startDate.setMonth(startDate.getMonth() - 1);
        periodLabel = 'Past Month';
        break;
      
      default:
        startDate = new Date(now.toISOString().split('T')[0]);
        periodLabel = 'Today';
    }

    const relevantHistory = this.usageHistory.filter(
      record => record.timestamp >= startDate
    );

    const breakdown = this.aggregateByDay(relevantHistory);
    const totalCost = relevantHistory.reduce((sum, record) => sum + record.cost, 0);

    return {
      period: periodLabel,
      totalCost,
      breakdown,
      limits: this.limits,
      remaining: this.calculateRemaining(totalCost)
    };
  }

  private generateTaskReport(taskId: string): CostReport {
    const taskHistory = this.usageHistory.filter(record => record.taskId === taskId);
    const totalCost = this.taskUsage.get(taskId) || 0;
    
    const breakdown: CostBreakdown[] = taskHistory.map(record => ({
      date: record.timestamp.toISOString(),
      cost: record.cost,
      tokenUsage: record.tokens
    }));

    return {
      period: `Task: ${taskId}`,
      totalCost,
      breakdown,
      limits: this.limits,
      remaining: {
        task: this.limits.perTask ? Math.max(0, this.limits.perTask - totalCost) : undefined
      }
    };
  }

  private aggregateByDay(records: UsageRecord[]): CostBreakdown[] {
    const dailyMap = new Map<string, CostBreakdown>();

    for (const record of records) {
      const day = record.timestamp.toISOString().split('T')[0];
      const existing = dailyMap.get(day);

      if (existing) {
        existing.cost += record.cost;
        existing.tokenUsage.input += record.tokens.input;
        existing.tokenUsage.output += record.tokens.output;
        if (record.tokens.reasoning) {
          existing.tokenUsage.reasoning = (existing.tokenUsage.reasoning || 0) + record.tokens.reasoning;
        }
      } else {
        dailyMap.set(day, {
          date: day,
          cost: record.cost,
          tokenUsage: { ...record.tokens }
        });
      }
    }

    return Array.from(dailyMap.values()).sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }

  private calculateRemaining(_currentCost: number): { daily?: number; task?: number } {
    const today = new Date().toISOString().split('T')[0];
    const dailyTotal = this.dailyUsage.get(today) || 0;
    const taskTotal = this.currentTaskId ? (this.taskUsage.get(this.currentTaskId) || 0) : 0;

    return {
      daily: this.limits.daily ? Math.max(0, this.limits.daily - dailyTotal) : undefined,
      task: this.limits.perTask ? Math.max(0, this.limits.perTask - taskTotal) : undefined
    };
  }

  private createEmptyReport(period: string): CostReport {
    return {
      period,
      totalCost: 0,
      breakdown: [],
      limits: this.limits,
      remaining: {
        daily: this.limits.daily,
        task: this.limits.perTask
      }
    };
  }

  async updateLimits(newLimits: Partial<CostLimits>): Promise<void> {
    if (newLimits.daily !== undefined) {
      this.limits.daily = newLimits.daily;
    }
    if (newLimits.perTask !== undefined) {
      this.limits.perTask = newLimits.perTask;
    }
    if (newLimits.tokenLimit !== undefined) {
      this.limits.tokenLimit = newLimits.tokenLimit;
    }
    await this.persistData();
  }

  getCurrentLimits(): CostLimits {
    return { ...this.limits };
  }

  startNewTask(taskId: string): void {
    this.currentTaskId = taskId;
    if (!this.taskUsage.has(taskId)) {
      this.taskUsage.set(taskId, 0);
    }
  }

  private async persistData(): Promise<void> {
    try {
      const dataFile = path.join(this.dataDir, 'usage.json');
      const data = {
        limits: this.limits,
        dailyUsage: Array.from(this.dailyUsage.entries()),
        taskUsage: Array.from(this.taskUsage.entries()),
        history: this.usageHistory.map(record => ({
          ...record,
          timestamp: record.timestamp.toISOString()
        })),
        currentTaskId: this.currentTaskId
      };
      
      await fs.writeFile(dataFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to persist cost data:', error);
    }
  }

  private async loadPersistedData(): Promise<void> {
    try {
      const dataFile = path.join(this.dataDir, 'usage.json');
      const content = await fs.readFile(dataFile, 'utf-8');
      const data = JSON.parse(content);

      if (data.limits) {
        this.limits = { ...this.limits, ...data.limits };
      }

      if (data.dailyUsage) {
        this.dailyUsage = new Map(data.dailyUsage);
      }

      if (data.taskUsage) {
        this.taskUsage = new Map(data.taskUsage);
      }

      if (data.history) {
        this.usageHistory = data.history.map((record: any) => ({
          ...record,
          timestamp: new Date(record.timestamp)
        }));
      }

      if (data.currentTaskId) {
        this.currentTaskId = data.currentTaskId;
      }

      // Clean up old data (older than 30 days)
      this.cleanupOldData();
    } catch (error) {
      // File doesn't exist yet, which is fine
      if ((error as any).code !== 'ENOENT') {
        console.error('Failed to load persisted data:', error);
      }
    }
  }

  private cleanupOldData(): void {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Clean up history
    this.usageHistory = this.usageHistory.filter(
      record => record.timestamp > thirtyDaysAgo
    );

    // Clean up daily usage
    const oldDays = Array.from(this.dailyUsage.keys()).filter(day => {
      return new Date(day) < thirtyDaysAgo;
    });
    
    for (const day of oldDays) {
      this.dailyUsage.delete(day);
    }
  }
}