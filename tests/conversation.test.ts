import { describe, it, expect, beforeEach } from '@jest/globals';
import { ConversationManager } from '../src/conversation';

describe('ConversationManager', () => {
  let manager: ConversationManager;

  beforeEach(() => {
    manager = new ConversationManager(5, 10); // Small limits for testing
  });

  describe('startConversation', () => {
    it('should create a new conversation', () => {
      const id = manager.startConversation('Test Topic');
      
      expect(id).toBeTruthy();
      expect(id).toMatch(/^conv_/);
      
      const conversation = manager.getConversation(id);
      expect(conversation).toBeDefined();
      expect(conversation?.metadata.topic).toBe('Test Topic');
    });

    it('should include initial instructions if provided', () => {
      const id = manager.startConversation('Test Topic', 'Be helpful');
      const conversation = manager.getConversation(id);
      
      expect(conversation?.messages[0]).toEqual({
        role: 'developer',
        content: 'Be helpful',
        timestamp: expect.any(Date)
      });
    });

    it('should cleanup oldest conversation when at max capacity', () => {
      const ids: string[] = [];
      
      // Fill to capacity
      for (let i = 0; i < 5; i++) {
        ids.push(manager.startConversation(`Topic ${i}`));
      }
      
      // Add one more (should remove oldest)
      manager.startConversation('New Topic');
      
      expect(manager.getConversation(ids[0])).toBeUndefined();
      expect(manager.listConversations()).toHaveLength(5);
    });
  });

  describe('addMessage', () => {
    it('should add message to conversation', () => {
      const id = manager.startConversation('Test');
      
      manager.addMessage(id, 'user', 'Hello');
      manager.addMessage(id, 'assistant', 'Hi there!');
      
      const conversation = manager.getConversation(id);
      expect(conversation?.messages).toHaveLength(2);
      expect(conversation?.messages[0].content).toBe('Hello');
      expect(conversation?.messages[1].content).toBe('Hi there!');
    });

    it('should throw error for non-existent conversation', () => {
      expect(() => {
        manager.addMessage('invalid-id', 'user', 'Hello');
      }).toThrow('Conversation invalid-id not found');
    });

    it('should trim old messages when at max capacity', () => {
      const id = manager.startConversation('Test', 'Instructions');
      
      // Add messages beyond limit
      for (let i = 0; i < 12; i++) {
        manager.addMessage(id, 'user', `Message ${i}`);
      }
      
      const conversation = manager.getConversation(id);
      expect(conversation?.messages).toHaveLength(10);
      // Developer instructions should be preserved
      expect(conversation?.messages[0].role).toBe('developer');
    });
  });

  describe('getContext', () => {
    it('should return recent messages', () => {
      const id = manager.startConversation('Test');
      
      for (let i = 0; i < 5; i++) {
        manager.addMessage(id, 'user', `Message ${i}`);
      }
      
      const context = manager.getContext(id, 3);
      expect(context).toHaveLength(3);
      expect(context[0].content).toBe('Message 2');
      expect(context[2].content).toBe('Message 4');
    });

    it('should always include developer instructions if present', () => {
      const id = manager.startConversation('Test', 'Instructions');
      
      for (let i = 0; i < 5; i++) {
        manager.addMessage(id, 'user', `Message ${i}`);
      }
      
      const context = manager.getContext(id, 3);
      expect(context).toHaveLength(3);
      expect(context[0].role).toBe('developer');
      expect(context[0].content).toBe('Instructions');
    });
  });

  describe('formatForAPI', () => {
    it('should format messages for API consumption', () => {
      const id = manager.startConversation('Test', 'Instructions');
      
      manager.addMessage(id, 'user', 'Hello');
      manager.addMessage(id, 'assistant', 'Hi!');
      
      const formatted = manager.formatForAPI(id, 'New message');
      
      expect(formatted).toEqual([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
        { role: 'user', content: 'New message' }
      ]);
    });
  });

  describe('getInstructions', () => {
    it('should return developer instructions if present', () => {
      const id = manager.startConversation('Test', 'Be helpful');
      const instructions = manager.getInstructions(id);
      
      expect(instructions).toBe('Be helpful');
    });

    it('should return undefined if no instructions', () => {
      const id = manager.startConversation('Test');
      const instructions = manager.getInstructions(id);
      
      expect(instructions).toBeUndefined();
    });
  });

  describe('updateMetadata', () => {
    it('should update conversation metadata', () => {
      const id = manager.startConversation('Test');
      
      manager.updateMetadata(id, {
        totalCost: 1.5,
        tokenCount: 500
      });
      
      const conversation = manager.getConversation(id);
      expect(conversation?.metadata.totalCost).toBe(1.5);
      expect(conversation?.metadata.tokenCount).toBe(500);
    });
  });

  describe('listConversations', () => {
    it('should return sorted list of conversations', () => {
      const id1 = manager.startConversation('Topic 1');
      const id2 = manager.startConversation('Topic 2');
      
      // Update last active time for id1
      manager.addMessage(id1, 'user', 'New message');
      
      const list = manager.listConversations();
      
      expect(list).toHaveLength(2);
      expect(list[0].id).toBe(id1); // Most recently active
      expect(list[1].id).toBe(id2);
    });
  });

  describe('deleteConversation', () => {
    it('should delete conversation', () => {
      const id = manager.startConversation('Test');
      
      const deleted = manager.deleteConversation(id);
      expect(deleted).toBe(true);
      expect(manager.getConversation(id)).toBeUndefined();
    });

    it('should return false for non-existent conversation', () => {
      const deleted = manager.deleteConversation('invalid-id');
      expect(deleted).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return conversation statistics', () => {
      const id1 = manager.startConversation('Topic 1');
      const id2 = manager.startConversation('Topic 2');
      
      manager.addMessage(id1, 'user', 'Message 1');
      manager.addMessage(id1, 'assistant', 'Response 1');
      manager.addMessage(id2, 'user', 'Message 2');
      
      manager.updateMetadata(id1, { totalCost: 0.5, tokenCount: 100 });
      manager.updateMetadata(id2, { totalCost: 0.3, tokenCount: 50 });
      
      const stats = manager.getStats();
      
      expect(stats.totalConversations).toBe(2);
      expect(stats.totalMessages).toBe(3);
      expect(stats.totalCost).toBe(0.8);
      expect(stats.totalTokens).toBe(150);
    });
  });

  describe('exportConversation and importConversation', () => {
    it('should export and import conversation', () => {
      const originalId = manager.startConversation('Test Topic', 'Instructions');
      
      manager.addMessage(originalId, 'user', 'Hello');
      manager.addMessage(originalId, 'assistant', 'Hi!');
      manager.updateMetadata(originalId, { totalCost: 0.5, tokenCount: 100 });
      
      // Export
      const exported = manager.exportConversation(originalId);
      
      // Clear and import
      manager.clearAll();
      const newId = manager.importConversation(exported);
      
      const imported = manager.getConversation(newId);
      
      expect(imported).toBeDefined();
      expect(imported?.metadata.topic).toBe('Test Topic');
      expect(imported?.messages).toHaveLength(3); // Instructions + 2 messages
      expect(imported?.metadata.totalCost).toBe(0.5);
    });

    it('should throw error for invalid export data', () => {
      expect(() => {
        manager.importConversation('invalid json');
      }).toThrow('Failed to import conversation');
    });
  });
});