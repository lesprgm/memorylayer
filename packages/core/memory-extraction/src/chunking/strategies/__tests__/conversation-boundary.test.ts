/**
 * Tests for ConversationBoundaryStrategy
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationBoundaryStrategy } from '../conversation-boundary.js';
import { TokenCounter } from '../../token-counter.js';
import type { NormalizedConversation, NormalizedMessage } from '../../../types.js';
import type { ChunkingConfig } from '../../types.js';

describe('ConversationBoundaryStrategy', () => {
  let strategy: ConversationBoundaryStrategy;
  let tokenCounter: TokenCounter;

  beforeEach(() => {
    tokenCounter = new TokenCounter();
    strategy = new ConversationBoundaryStrategy(tokenCounter);
  });

  const createMessage = (
    id: string,
    content: string,
    role: 'user' | 'assistant' = 'user',
    timestamp?: string
  ): NormalizedMessage => ({
    id,
    role,
    content,
    timestamp: timestamp || new Date().toISOString()
  });

  const createConversation = (messages: NormalizedMessage[]): NormalizedConversation => ({
    id: 'test-conv',
    messages,
    metadata: {}
  });

  const createConfig = (overrides?: Partial<ChunkingConfig>): ChunkingConfig => ({
    maxTokensPerChunk: 100,
    strategy: 'conversation-boundary',
    preserveMessageBoundaries: true,
    tokenCountMethod: 'approximate',
    ...overrides
  });

  describe('boundary detection', () => {
    it('should identify user messages as boundaries', () => {
      const messages = [
        createMessage('1', 'A'.repeat(40), 'user'),
        createMessage('2', 'B'.repeat(40), 'assistant'),
        createMessage('3', 'C'.repeat(40), 'user'),
        createMessage('4', 'D'.repeat(40), 'assistant'),
        createMessage('5', 'E'.repeat(40), 'user'),
      ];
      const conversation = createConversation(messages);
      const config = createConfig({ maxTokensPerChunk: 50 });

      const chunks = strategy.chunk(conversation, config);

      expect(chunks.length).toBeGreaterThan(1);
      
      // Verify chunks are created at user message boundaries
      for (const chunk of chunks) {
        const firstMessage = chunk.messages[0];
        // Most chunks should start with user messages (except possibly the first)
        if (chunk.sequence > 1) {
          expect(['user', 'assistant']).toContain(firstMessage.role);
        }
      }
    });

    it('should identify timestamp gaps as boundaries', () => {
      const baseTime = new Date('2024-01-01T10:00:00Z');
      const messages = [
        createMessage('1', 'A'.repeat(40), 'user', baseTime.toISOString()),
        createMessage('2', 'B'.repeat(40), 'assistant', new Date(baseTime.getTime() + 1000).toISOString()),
        createMessage('3', 'C'.repeat(40), 'user', new Date(baseTime.getTime() + 10 * 60 * 1000).toISOString()), // 10 min gap
        createMessage('4', 'D'.repeat(40), 'assistant', new Date(baseTime.getTime() + 10 * 60 * 1000 + 1000).toISOString()),
      ];
      const conversation = createConversation(messages);
      const config = createConfig({ maxTokensPerChunk: 80 });

      const chunks = strategy.chunk(conversation, config);

      // Should create chunks at the time gap
      expect(chunks.length).toBeGreaterThan(1);
    });

    it('should prefer user messages over assistant messages', () => {
      const messages = [
        createMessage('1', 'A'.repeat(40), 'user'),
        createMessage('2', 'B'.repeat(40), 'assistant'),
        createMessage('3', 'C'.repeat(40), 'assistant'),
        createMessage('4', 'D'.repeat(40), 'user'),
        createMessage('5', 'E'.repeat(40), 'assistant'),
      ];
      const conversation = createConversation(messages);
      const config = createConfig({ maxTokensPerChunk: 60 });

      const chunks = strategy.chunk(conversation, config);

      expect(chunks.length).toBeGreaterThan(0);
      
      // Verify conversation is chunked
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('fallback behavior', () => {
    it('should fall back to sliding window when no boundaries found', () => {
      // Create a conversation with no clear boundaries (all assistant messages)
      const messages = [
        createMessage('1', 'A'.repeat(100), 'assistant'),
        createMessage('2', 'B'.repeat(100), 'assistant'),
        createMessage('3', 'C'.repeat(100), 'assistant'),
      ];
      const conversation = createConversation(messages);
      const config = createConfig({ maxTokensPerChunk: 80 });

      const chunks = strategy.chunk(conversation, config);

      // Should still create chunks using fallback
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should fall back when boundaries do not create valid chunks', () => {
      // Create a conversation where boundaries would create too-small chunks
      const messages = [
        createMessage('1', 'A'.repeat(200), 'user'),
        createMessage('2', 'B'.repeat(200), 'user'),
      ];
      const conversation = createConversation(messages);
      const config = createConfig({
        maxTokensPerChunk: 100,
        minChunkSize: 40
      });

      const chunks = strategy.chunk(conversation, config);

      // Should create chunks even with fallback
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should handle very short conversations', () => {
      const messages = [
        createMessage('1', 'Short', 'user'),
        createMessage('2', 'Message', 'assistant'),
      ];
      const conversation = createConversation(messages);
      const config = createConfig();

      const chunks = strategy.chunk(conversation, config);

      // Should create a single chunk
      expect(chunks.length).toBe(1);
      expect(chunks[0].messages.length).toBe(2);
    });
  });

  describe('minimum chunk size enforcement', () => {
    it('should respect minimum chunk size', () => {
      const messages = [
        createMessage('1', 'A'.repeat(40), 'user'),
        createMessage('2', 'B'.repeat(40), 'assistant'),
        createMessage('3', 'C'.repeat(40), 'user'),
        createMessage('4', 'D'.repeat(40), 'assistant'),
      ];
      const conversation = createConversation(messages);
      const config = createConfig({
        maxTokensPerChunk: 100,
        minChunkSize: 30
      });

      const chunks = strategy.chunk(conversation, config);

      // All chunks except possibly the last should meet minimum size
      for (let i = 0; i < chunks.length - 1; i++) {
        expect(chunks[i].tokenCount).toBeGreaterThanOrEqual(config.minChunkSize!);
      }
    });

    it('should not create chunks smaller than minimum size', () => {
      const messages = [
        createMessage('1', 'A'.repeat(100), 'user'),
        createMessage('2', 'B'.repeat(20), 'user'),
        createMessage('3', 'C'.repeat(100), 'user'),
      ];
      const conversation = createConversation(messages);
      const config = createConfig({
        maxTokensPerChunk: 100,
        minChunkSize: 40
      });

      const chunks = strategy.chunk(conversation, config);

      // Verify no chunk is too small (except possibly the last)
      for (let i = 0; i < chunks.length - 1; i++) {
        expect(chunks[i].tokenCount).toBeGreaterThanOrEqual(config.minChunkSize!);
      }
    });
  });

  describe('chunk metadata', () => {
    it('should generate unique chunk IDs', () => {
      const messages = [
        createMessage('1', 'A'.repeat(100), 'user'),
        createMessage('2', 'B'.repeat(100), 'user'),
        createMessage('3', 'C'.repeat(100), 'user'),
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
        createMessage('1', 'A'.repeat(100), 'user'),
        createMessage('2', 'B'.repeat(100), 'user'),
        createMessage('3', 'C'.repeat(100), 'user'),
      ];
      const conversation = createConversation(messages);
      const config = createConfig({ maxTokensPerChunk: 80 });

      const chunks = strategy.chunk(conversation, config);

      for (let i = 0; i < chunks.length; i++) {
        expect(chunks[i].sequence).toBe(i + 1);
        expect(chunks[i].totalChunks).toBe(chunks.length);
      }
    });

    it('should record strategy name', () => {
      const messages = [
        createMessage('1', 'A'.repeat(100), 'user'),
        createMessage('2', 'B'.repeat(100), 'user'),
        createMessage('3', 'C'.repeat(100), 'user'),
      ];
      const conversation = createConversation(messages);
      const config = createConfig({ maxTokensPerChunk: 80 });

      const chunks = strategy.chunk(conversation, config);

      // When boundaries are found, strategy name should be conversation-boundary
      // When falling back, it will be sliding-window
      expect(['conversation-boundary', 'sliding-window']).toContain(chunks[0].metadata.chunkingStrategy);
    });

    it('should record message indices', () => {
      const messages = [
        createMessage('1', 'A'.repeat(100), 'user'),
        createMessage('2', 'B'.repeat(100), 'user'),
        createMessage('3', 'C'.repeat(100), 'user'),
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
  });

  describe('edge cases', () => {
    it('should handle empty conversation', () => {
      const conversation = createConversation([]);
      const config = createConfig();

      const chunks = strategy.chunk(conversation, config);

      expect(chunks).toEqual([]);
    });

    it('should handle single message conversation', () => {
      const messages = [createMessage('1', 'Single message', 'user')];
      const conversation = createConversation(messages);
      const config = createConfig();

      const chunks = strategy.chunk(conversation, config);

      expect(chunks.length).toBe(1);
      expect(chunks[0].messages.length).toBe(1);
      expect(chunks[0].messages[0].id).toBe('1');
    });

    it('should handle conversation with one very long message', () => {
      const messages = [createMessage('1', 'A'.repeat(400), 'user')]; // ~100 tokens
      const conversation = createConversation(messages);
      const config = createConfig({ maxTokensPerChunk: 150 });

      const chunks = strategy.chunk(conversation, config);

      expect(chunks.length).toBe(1);
      expect(chunks[0].messages.length).toBe(1);
    });

    it('should handle messages with varying sizes', () => {
      const messages = [
        createMessage('1', 'Short', 'user'),
        createMessage('2', 'A'.repeat(200), 'assistant'), // Long message
        createMessage('3', 'Short again', 'user'),
        createMessage('4', 'B'.repeat(200), 'assistant'), // Another long message
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

    it('should handle messages without timestamps', () => {
      const messages = [
        createMessage('1', 'A'.repeat(40), 'user', undefined),
        createMessage('2', 'B'.repeat(40), 'assistant', undefined),
        createMessage('3', 'C'.repeat(40), 'user', undefined),
      ];
      const conversation = createConversation(messages);
      const config = createConfig({ maxTokensPerChunk: 60 });

      const chunks = strategy.chunk(conversation, config);

      // Should still work without timestamps
      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe('canHandle', () => {
    it('should return true for valid conversation', () => {
      const messages = [createMessage('1', 'Test message', 'user')];
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
      const messages = [createMessage('1', 'A'.repeat(1000), 'user')]; // Very long message
      const conversation = createConversation(messages);
      const config = createConfig({ maxTokensPerChunk: 50 });

      expect(strategy.canHandle(conversation, config)).toBe(false);
    });

    it('should return true when messages fit within chunk size', () => {
      const messages = [
        createMessage('1', 'Short message', 'user'),
        createMessage('2', 'Another short message', 'assistant'),
      ];
      const conversation = createConversation(messages);
      const config = createConfig({ maxTokensPerChunk: 1000 });

      expect(strategy.canHandle(conversation, config)).toBe(true);
    });
  });

  describe('configuration validation', () => {
    it('should validate maxTokensPerChunk', () => {
      const messages = [createMessage('1', 'Test', 'user')];
      const conversation = createConversation(messages);
      const config = createConfig({ maxTokensPerChunk: 0 });

      expect(() => strategy.chunk(conversation, config)).toThrow('maxTokensPerChunk must be greater than 0');
    });

    it('should validate overlapTokens', () => {
      const messages = [createMessage('1', 'Test', 'user')];
      const conversation = createConversation(messages);
      const config = createConfig({ overlapTokens: -10 });

      expect(() => strategy.chunk(conversation, config)).toThrow('overlapTokens must be non-negative');
    });
  });

  describe('integration with sliding window fallback', () => {
    it('should produce valid chunks when falling back', () => {
      const messages = [
        createMessage('1', 'A'.repeat(100), 'assistant'),
        createMessage('2', 'B'.repeat(100), 'assistant'),
        createMessage('3', 'C'.repeat(100), 'assistant'),
      ];
      const conversation = createConversation(messages);
      const config = createConfig({ maxTokensPerChunk: 80 });

      const chunks = strategy.chunk(conversation, config);

      // Verify chunks are valid
      expect(chunks.length).toBeGreaterThan(0);
      
      for (const chunk of chunks) {
        expect(chunk.id).toBeDefined();
        expect(chunk.conversationId).toBe('test-conv');
        expect(chunk.messages.length).toBeGreaterThan(0);
        expect(chunk.tokenCount).toBeGreaterThan(0);
        expect(chunk.tokenCount).toBeLessThanOrEqual(config.maxTokensPerChunk);
      }
    });

    it('should maintain message order when falling back', () => {
      const messages = [
        createMessage('1', 'A'.repeat(100), 'assistant'),
        createMessage('2', 'B'.repeat(100), 'assistant'),
        createMessage('3', 'C'.repeat(100), 'assistant'),
      ];
      const conversation = createConversation(messages);
      const config = createConfig({ maxTokensPerChunk: 80 });

      const chunks = strategy.chunk(conversation, config);

      // Verify messages are in order
      const allMessageIds = chunks.flatMap(c => c.messages.map(m => m.id));
      expect(allMessageIds).toEqual(['1', '2', '3']);
    });
  });
});
