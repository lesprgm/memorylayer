/**
 * Tests for SlidingWindowStrategy
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SlidingWindowStrategy } from '../sliding-window.js';
import { TokenCounter } from '../../token-counter.js';
import type { NormalizedConversation, NormalizedMessage } from '../../../types.js';
import type { ChunkingConfig } from '../../types.js';

describe('SlidingWindowStrategy', () => {
  let strategy: SlidingWindowStrategy;
  let tokenCounter: TokenCounter;

  beforeEach(() => {
    tokenCounter = new TokenCounter();
    strategy = new SlidingWindowStrategy(tokenCounter);
  });

  const createMessage = (id: string, content: string, role: 'user' | 'assistant' = 'user'): NormalizedMessage => ({
    id,
    role,
    content,
    timestamp: new Date().toISOString()
  });

  const createConversation = (messages: NormalizedMessage[]): NormalizedConversation => ({
    id: 'test-conv',
    messages,
    metadata: {}
  });

  const createConfig = (overrides?: Partial<ChunkingConfig>): ChunkingConfig => ({
    maxTokensPerChunk: 100,
    strategy: 'sliding-window',
    preserveMessageBoundaries: true,
    tokenCountMethod: 'approximate',
    ...overrides
  });

  describe('basic chunking', () => {
    it('should chunk a conversation that exceeds max tokens', () => {
      const messages = [
        createMessage('1', 'A'.repeat(100)), // ~25 tokens
        createMessage('2', 'B'.repeat(100)), // ~25 tokens
        createMessage('3', 'C'.repeat(100)), // ~25 tokens
        createMessage('4', 'D'.repeat(100)), // ~25 tokens
        createMessage('5', 'E'.repeat(100)), // ~25 tokens
      ];
      const conversation = createConversation(messages);
      const config = createConfig({ maxTokensPerChunk: 80 });

      const chunks = strategy.chunk(conversation, config);

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].conversationId).toBe('test-conv');
      expect(chunks[0].sequence).toBe(1);
      expect(chunks[0].totalChunks).toBe(chunks.length);
    });

    it('should not chunk a conversation that fits in one chunk', () => {
      const messages = [
        createMessage('1', 'Short message'),
        createMessage('2', 'Another short message'),
      ];
      const conversation = createConversation(messages);
      const config = createConfig({ maxTokensPerChunk: 1000 });

      const chunks = strategy.chunk(conversation, config);

      expect(chunks.length).toBe(1);
      expect(chunks[0].messages.length).toBe(2);
    });

    it('should preserve message boundaries', () => {
      const messages = [
        createMessage('1', 'A'.repeat(100)),
        createMessage('2', 'B'.repeat(100)),
        createMessage('3', 'C'.repeat(100)),
      ];
      const conversation = createConversation(messages);
      const config = createConfig({ maxTokensPerChunk: 80 });

      const chunks = strategy.chunk(conversation, config);

      // Verify all messages are complete (not split)
      for (const chunk of chunks) {
        for (const message of chunk.messages) {
          expect(message.content).toMatch(/^[ABC]+$/);
          expect(message.content.length).toBe(100);
        }
      }
    });

    it('should maintain chronological order', () => {
      const messages = [
        createMessage('1', 'First'),
        createMessage('2', 'Second'),
        createMessage('3', 'Third'),
        createMessage('4', 'Fourth'),
      ];
      const conversation = createConversation(messages);
      const config = createConfig({ maxTokensPerChunk: 50 });

      const chunks = strategy.chunk(conversation, config);

      // Verify messages are in order within each chunk
      for (const chunk of chunks) {
        const messageIds = chunk.messages.map(m => m.id);
        const sortedIds = [...messageIds].sort();
        expect(messageIds).toEqual(sortedIds);
      }
    });
  });

  describe('overlap behavior', () => {
    it('should create overlap with fixed token count', () => {
      const messages = [
        createMessage('1', 'A'.repeat(40)), // ~10 tokens
        createMessage('2', 'B'.repeat(40)), // ~10 tokens
        createMessage('3', 'C'.repeat(40)), // ~10 tokens
        createMessage('4', 'D'.repeat(40)), // ~10 tokens
        createMessage('5', 'E'.repeat(40)), // ~10 tokens
        createMessage('6', 'F'.repeat(40)), // ~10 tokens
      ];
      const conversation = createConversation(messages);
      const config = createConfig({
        maxTokensPerChunk: 50,
        overlapTokens: 15
      });

      const chunks = strategy.chunk(conversation, config);

      expect(chunks.length).toBeGreaterThan(1);
      
      // Check that chunks have overlap (except first chunk)
      for (let i = 1; i < chunks.length; i++) {
        expect(chunks[i].overlapWithPrevious).toBeGreaterThan(0);
        expect(chunks[i].overlapTokensWithPrevious).toBeGreaterThan(0);
        expect(chunks[i].overlapTokensWithPrevious).toBeLessThanOrEqual(config.overlapTokens!);
      }
    });

    it('should create overlap with percentage', () => {
      const messages = [
        createMessage('1', 'A'.repeat(40)),
        createMessage('2', 'B'.repeat(40)),
        createMessage('3', 'C'.repeat(40)),
        createMessage('4', 'D'.repeat(40)),
        createMessage('5', 'E'.repeat(40)),
        createMessage('6', 'F'.repeat(40)),
      ];
      const conversation = createConversation(messages);
      const config = createConfig({
        maxTokensPerChunk: 50,
        overlapPercentage: 0.3 // 30%
      });

      const chunks = strategy.chunk(conversation, config);

      expect(chunks.length).toBeGreaterThan(1);
      
      const expectedOverlapTokens = Math.floor(config.maxTokensPerChunk * config.overlapPercentage!);
      
      // Check that chunks have overlap (except first chunk)
      for (let i = 1; i < chunks.length; i++) {
        expect(chunks[i].overlapWithPrevious).toBeGreaterThan(0);
        expect(chunks[i].overlapTokensWithPrevious).toBeGreaterThan(0);
        expect(chunks[i].overlapTokensWithPrevious).toBeLessThanOrEqual(expectedOverlapTokens);
      }
    });

    it('should not create overlap when not configured', () => {
      const messages = [
        createMessage('1', 'A'.repeat(100)),
        createMessage('2', 'B'.repeat(100)),
        createMessage('3', 'C'.repeat(100)),
      ];
      const conversation = createConversation(messages);
      const config = createConfig({
        maxTokensPerChunk: 80,
        overlapTokens: 0
      });

      const chunks = strategy.chunk(conversation, config);

      // First chunk should have no overlap with previous
      expect(chunks[0].overlapWithPrevious).toBe(0);
      expect(chunks[0].overlapTokensWithPrevious).toBe(0);
      
      // If there are multiple chunks, subsequent ones should also have no overlap
      for (let i = 1; i < chunks.length; i++) {
        expect(chunks[i].overlapWithPrevious).toBe(0);
        expect(chunks[i].overlapTokensWithPrevious).toBe(0);
      }
    });

    it('should ensure overlap does not exceed chunk size', () => {
      const messages = [
        createMessage('1', 'A'.repeat(100)),
        createMessage('2', 'B'.repeat(100)),
        createMessage('3', 'C'.repeat(100)),
      ];
      const conversation = createConversation(messages);
      const config = createConfig({
        maxTokensPerChunk: 100,
        overlapTokens: 20
      });

      const chunks = strategy.chunk(conversation, config);

      // Verify no chunk exceeds max size
      for (const chunk of chunks) {
        expect(chunk.tokenCount).toBeLessThanOrEqual(config.maxTokensPerChunk);
      }
    });

    it('should calculate overlap in both tokens and messages', () => {
      const messages = [
        createMessage('1', 'A'.repeat(40)), // ~10 tokens
        createMessage('2', 'B'.repeat(40)), // ~10 tokens
        createMessage('3', 'C'.repeat(40)), // ~10 tokens
        createMessage('4', 'D'.repeat(40)), // ~10 tokens
        createMessage('5', 'E'.repeat(40)), // ~10 tokens
      ];
      const conversation = createConversation(messages);
      const config = createConfig({
        maxTokensPerChunk: 50,
        overlapTokens: 15
      });

      const chunks = strategy.chunk(conversation, config);

      expect(chunks.length).toBeGreaterThan(1);

      // Verify overlap is tracked in both messages and tokens
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        // First chunk has no previous overlap
        if (i === 0) {
          expect(chunk.overlapWithPrevious).toBe(0);
          expect(chunk.overlapTokensWithPrevious).toBe(0);
        } else {
          // Subsequent chunks should have overlap
          expect(chunk.overlapWithPrevious).toBeGreaterThanOrEqual(0);
          expect(chunk.overlapTokensWithPrevious).toBeGreaterThanOrEqual(0);
          
          // If there are overlapping messages, there should be overlapping tokens
          if (chunk.overlapWithPrevious > 0) {
            expect(chunk.overlapTokensWithPrevious).toBeGreaterThan(0);
          }
        }
        
        // Last chunk has no next overlap
        if (i === chunks.length - 1) {
          expect(chunk.overlapWithNext).toBe(0);
          expect(chunk.overlapTokensWithNext).toBe(0);
        } else {
          // Earlier chunks should have next overlap
          expect(chunk.overlapWithNext).toBeGreaterThanOrEqual(0);
          expect(chunk.overlapTokensWithNext).toBeGreaterThanOrEqual(0);
          
          // If there are overlapping messages, there should be overlapping tokens
          if (chunk.overlapWithNext > 0) {
            expect(chunk.overlapTokensWithNext).toBeGreaterThan(0);
          }
        }
      }
    });

    it('should ensure overlap tokens match the actual overlap messages', () => {
      const messages = [
        createMessage('1', 'A'.repeat(40)), // ~10 tokens
        createMessage('2', 'B'.repeat(80)), // ~20 tokens
        createMessage('3', 'C'.repeat(40)), // ~10 tokens
        createMessage('4', 'D'.repeat(40)), // ~10 tokens
      ];
      const conversation = createConversation(messages);
      const config = createConfig({
        maxTokensPerChunk: 60,
        overlapTokens: 25
      });

      const chunks = strategy.chunk(conversation, config);

      // Verify that the overlap token count matches the messages
      for (let i = 1; i < chunks.length; i++) {
        const chunk = chunks[i];
        const overlapMessageCount = chunk.overlapWithPrevious;
        
        if (overlapMessageCount > 0) {
          // Get the first N messages (overlap messages)
          const overlapMessages = chunk.messages.slice(0, overlapMessageCount);
          
          // Calculate expected token count
          let expectedTokens = 0;
          for (const msg of overlapMessages) {
            expectedTokens += Math.ceil(msg.content.length / 4); // Approximate method
          }
          
          // The recorded overlap tokens should match
          expect(chunk.overlapTokensWithPrevious).toBe(expectedTokens);
        }
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty conversation', () => {
      const conversation = createConversation([]);
      const config = createConfig();

      const chunks = strategy.chunk(conversation, config);

      expect(chunks).toEqual([]);
    });

    it('should handle single message conversation', () => {
      const messages = [createMessage('1', 'Single message')];
      const conversation = createConversation(messages);
      const config = createConfig();

      const chunks = strategy.chunk(conversation, config);

      expect(chunks.length).toBe(1);
      expect(chunks[0].messages.length).toBe(1);
      expect(chunks[0].messages[0].id).toBe('1');
    });

    it('should handle conversation with one very long message', () => {
      const messages = [createMessage('1', 'A'.repeat(400))]; // ~100 tokens
      const conversation = createConversation(messages);
      const config = createConfig({ maxTokensPerChunk: 150 });

      const chunks = strategy.chunk(conversation, config);

      expect(chunks.length).toBe(1);
      expect(chunks[0].messages.length).toBe(1);
    });

    it('should handle messages with varying sizes', () => {
      const messages = [
        createMessage('1', 'Short'),
        createMessage('2', 'A'.repeat(200)), // Long message
        createMessage('3', 'Short again'),
        createMessage('4', 'B'.repeat(200)), // Another long message
      ];
      const conversation = createConversation(messages);
      const config = createConfig({ maxTokensPerChunk: 100 });

      const chunks = strategy.chunk(conversation, config);

      expect(chunks.length).toBeGreaterThan(0);
      
      // Verify all messages are included
      const allMessageIds = chunks.flatMap(c => c.messages.map(m => m.id));
      expect(allMessageIds).toContain('1');
      expect(allMessageIds).toContain('2');
      expect(allMessageIds).toContain('3');
      expect(allMessageIds).toContain('4');
    });
  });

  describe('chunk metadata', () => {
    it('should generate unique chunk IDs', () => {
      const messages = [
        createMessage('1', 'A'.repeat(100)),
        createMessage('2', 'B'.repeat(100)),
        createMessage('3', 'C'.repeat(100)),
      ];
      const conversation = createConversation(messages);
      const config = createConfig({ maxTokensPerChunk: 80 });

      const chunks = strategy.chunk(conversation, config);

      const chunkIds = chunks.map(c => c.id);
      const uniqueIds = new Set(chunkIds);
      
      expect(uniqueIds.size).toBe(chunks.length);
    });

    it('should record sequence numbers correctly', () => {
      const messages = [
        createMessage('1', 'A'.repeat(100)),
        createMessage('2', 'B'.repeat(100)),
        createMessage('3', 'C'.repeat(100)),
      ];
      const conversation = createConversation(messages);
      const config = createConfig({ maxTokensPerChunk: 80 });

      const chunks = strategy.chunk(conversation, config);

      for (let i = 0; i < chunks.length; i++) {
        expect(chunks[i].sequence).toBe(i + 1);
        expect(chunks[i].totalChunks).toBe(chunks.length);
      }
    });

    it('should record token counts', () => {
      const messages = [
        createMessage('1', 'A'.repeat(100)),
        createMessage('2', 'B'.repeat(100)),
      ];
      const conversation = createConversation(messages);
      const config = createConfig();

      const chunks = strategy.chunk(conversation, config);

      for (const chunk of chunks) {
        expect(chunk.tokenCount).toBeGreaterThan(0);
        expect(chunk.tokenCount).toBeLessThanOrEqual(config.maxTokensPerChunk);
      }
    });

    it('should record overlap information', () => {
      const messages = [
        createMessage('1', 'A'.repeat(100)),
        createMessage('2', 'B'.repeat(100)),
        createMessage('3', 'C'.repeat(100)),
      ];
      const conversation = createConversation(messages);
      const config = createConfig({
        maxTokensPerChunk: 80,
        overlapTokens: 20
      });

      const chunks = strategy.chunk(conversation, config);

      // First chunk should have no overlap with previous
      expect(chunks[0].overlapWithPrevious).toBe(0);
      
      // Last chunk should have no overlap with next
      if (chunks.length > 1) {
        expect(chunks[chunks.length - 1].overlapWithNext).toBe(0);
      }
    });

    it('should record message indices', () => {
      const messages = [
        createMessage('1', 'A'.repeat(100)),
        createMessage('2', 'B'.repeat(100)),
        createMessage('3', 'C'.repeat(100)),
      ];
      const conversation = createConversation(messages);
      const config = createConfig({ maxTokensPerChunk: 80 });

      const chunks = strategy.chunk(conversation, config);

      for (const chunk of chunks) {
        expect(chunk.metadata.startMessageIndex).toBeGreaterThanOrEqual(0);
        expect(chunk.metadata.endMessageIndex).toBeGreaterThanOrEqual(chunk.metadata.startMessageIndex);
        expect(chunk.metadata.endMessageIndex).toBeLessThan(messages.length);
      }
    });

    it('should record strategy name', () => {
      const messages = [createMessage('1', 'Test message')];
      const conversation = createConversation(messages);
      const config = createConfig();

      const chunks = strategy.chunk(conversation, config);

      expect(chunks[0].metadata.chunkingStrategy).toBe('sliding-window');
    });

    it('should record creation timestamp', () => {
      const messages = [createMessage('1', 'Test message')];
      const conversation = createConversation(messages);
      const config = createConfig();

      const chunks = strategy.chunk(conversation, config);

      expect(chunks[0].metadata.createdAt).toBeDefined();
      expect(new Date(chunks[0].metadata.createdAt).getTime()).toBeGreaterThan(0);
    });
  });

  describe('canHandle', () => {
    it('should return true for valid conversation', () => {
      const messages = [createMessage('1', 'Test message')];
      const conversation = createConversation(messages);
      const config = createConfig();

      expect(strategy.canHandle(conversation, config)).toBe(true);
    });

    it('should return false for empty conversation', () => {
      const conversation = createConversation([]);
      const config = createConfig();

      expect(strategy.canHandle(conversation, config)).toBe(false);
    });

    it('should return false when single message exceeds chunk size', () => {
      const messages = [createMessage('1', 'A'.repeat(1000))]; // Very long message
      const conversation = createConversation(messages);
      const config = createConfig({ maxTokensPerChunk: 50 });

      expect(strategy.canHandle(conversation, config)).toBe(false);
    });

    it('should return true when messages fit within chunk size', () => {
      const messages = [
        createMessage('1', 'Short message'),
        createMessage('2', 'Another short message'),
      ];
      const conversation = createConversation(messages);
      const config = createConfig({ maxTokensPerChunk: 1000 });

      expect(strategy.canHandle(conversation, config)).toBe(true);
    });
  });

  describe('configuration validation', () => {
    it('should validate maxTokensPerChunk', () => {
      const messages = [createMessage('1', 'Test')];
      const conversation = createConversation(messages);
      const config = createConfig({ maxTokensPerChunk: 0 });

      expect(() => strategy.chunk(conversation, config)).toThrow('maxTokensPerChunk must be greater than 0');
    });

    it('should validate overlapTokens', () => {
      const messages = [createMessage('1', 'Test')];
      const conversation = createConversation(messages);
      const config = createConfig({ overlapTokens: -10 });

      expect(() => strategy.chunk(conversation, config)).toThrow('overlapTokens must be non-negative');
    });

    it('should validate overlapPercentage', () => {
      const messages = [createMessage('1', 'Test')];
      const conversation = createConversation(messages);
      const config = createConfig({ overlapPercentage: 1.5 });

      expect(() => strategy.chunk(conversation, config)).toThrow('overlapPercentage must be between 0 and 1');
    });

    it('should validate overlap does not exceed chunk size', () => {
      const messages = [createMessage('1', 'Test')];
      const conversation = createConversation(messages);
      const config = createConfig({
        maxTokensPerChunk: 100,
        overlapTokens: 150
      });

      expect(() => strategy.chunk(conversation, config)).toThrow('Overlap');
    });
  });
});
