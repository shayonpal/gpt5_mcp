import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { CostManager } from '../src/cost-manager';
import { TokenUsage } from '../src/types';
import fs from 'fs/promises';

// Mock fs module
jest.mock('fs/promises');

describe('CostManager', () => {
  let costManager: CostManager;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock fs methods
    (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
    (fs.readFile as jest.Mock).mockRejectedValue({ code: 'ENOENT' });
    (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
    
    // Create instance with test limits
    costManager = new CostManager({
      daily: 10.0,
      perTask: 2.0,
      tokenLimit: 4000
    });
  });

  describe('checkAndRecordUsage', () => {
    it('should allow usage within limits', async () => {
      const usage: TokenUsage = {
        inputTokens: 100,
        outputTokens: 200,
        totalTokens: 300,
        estimatedCost: 0.5
      };

      const result = await costManager.checkAndRecordUsage('task-1', usage);
      
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should reject usage exceeding daily limit', async () => {
      const usage: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 2000,
        totalTokens: 3000,
        estimatedCost: 11.0 // Exceeds daily limit of 10
      };

      const result = await costManager.checkAndRecordUsage('task-1', usage);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Daily limit');
    });

    it('should reject usage exceeding task limit', async () => {
      const usage: TokenUsage = {
        inputTokens: 500,
        outputTokens: 1000,
        totalTokens: 1500,
        estimatedCost: 2.5 // Exceeds task limit of 2
      };

      const result = await costManager.checkAndRecordUsage('task-1', usage);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Task limit');
    });

    it('should reject usage exceeding token limit', async () => {
      const usage: TokenUsage = {
        inputTokens: 2000,
        outputTokens: 3000,
        totalTokens: 5000, // Exceeds token limit of 4000
        estimatedCost: 0.5
      };

      const result = await costManager.checkAndRecordUsage('task-1', usage);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Token limit');
    });

    it('should provide warning when approaching daily limit', async () => {
      // First usage to get close to limit
      const firstUsage: TokenUsage = {
        inputTokens: 100,
        outputTokens: 200,
        totalTokens: 300,
        estimatedCost: 8.5
      };
      
      await costManager.checkAndRecordUsage('task-1', firstUsage);

      // Second usage that approaches limit (>80%)
      const secondUsage: TokenUsage = {
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
        estimatedCost: 0.1
      };

      const result = await costManager.checkAndRecordUsage('task-2', secondUsage);
      
      expect(result.allowed).toBe(true);
      expect(result.warning).toContain('Daily usage at');
    });
  });

  describe('updateLimits', () => {
    it('should update daily limit', async () => {
      await costManager.updateLimits({ daily: 20.0 });
      const limits = costManager.getCurrentLimits();
      
      expect(limits.daily).toBe(20.0);
      expect(limits.perTask).toBe(2.0); // Unchanged
    });

    it('should update task limit', async () => {
      await costManager.updateLimits({ perTask: 5.0 });
      const limits = costManager.getCurrentLimits();
      
      expect(limits.daily).toBe(10.0); // Unchanged
      expect(limits.perTask).toBe(5.0);
    });

    it('should update token limit', async () => {
      await costManager.updateLimits({ tokenLimit: 8000 });
      const limits = costManager.getCurrentLimits();
      
      expect(limits.tokenLimit).toBe(8000);
    });
  });

  describe('generateReport', () => {
    it('should generate empty report for current task with no data', async () => {
      const report = await costManager.generateReport('current_task');
      
      expect(report.period).toBe('No current task');
      expect(report.totalCost).toBe(0);
      expect(report.breakdown).toEqual([]);
    });

    it('should generate today report', async () => {
      // Record some usage
      const usage: TokenUsage = {
        inputTokens: 100,
        outputTokens: 200,
        totalTokens: 300,
        estimatedCost: 0.5
      };
      
      await costManager.checkAndRecordUsage('task-1', usage);
      
      const report = await costManager.generateReport('today');
      
      expect(report.period).toBe('Today');
      expect(report.totalCost).toBe(0.5);
      expect(report.breakdown.length).toBeGreaterThan(0);
    });
  });

  describe('startNewTask', () => {
    it('should set current task ID', () => {
      costManager.startNewTask('task-123');
      
      // Record usage to verify task is tracked
      const usage: TokenUsage = {
        inputTokens: 100,
        outputTokens: 200,
        totalTokens: 300,
        estimatedCost: 0.5
      };
      
      costManager.checkAndRecordUsage('task-123', usage);
      const report = costManager.generateReport('current_task');
      
      expect(report.period).toContain('task-123');
    });
  });
});