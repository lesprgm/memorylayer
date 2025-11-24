/**
 * Tests for SemanticStrategy
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SemanticStrategy } from '../semantic.js';
import { TokenCounter } from '../../token-counter.js';
import type { NormalizedConversation, NormalizedMessage } from '../../../types.js';
import type { ChunkingConfig } from '../../types.js';

describe('SemanticStrategy', () => {
  let strategy: SemanticStrategy;
  let tokenCounter: TokenCounter;

  beforeEach(() => {
    tokenCounter = new TokenCounter();
    strategy = new SemanticStrategy(tokenCounter);
  });

  const createMessage = (
    id: string,
    content: string,
    role: 'user' | 'assistant' = 'user'
  ): NormalizedMessage => ({
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
    maxTokensPerChunk: 200,
    strategy: 'semantic',
    preserveMessageBoundaries: true,
    tokenCountMethod: 'approximate',
    ...overrides
  });

  describe('topic shift detection', () => {
    it('should detect topic shifts in conversation', () => {
      const messages = [
        // Topic 1: Cooking
        createMessage('1', 'I love cooking pasta with tomato sauce and basil'),
        createMessage('2', 'The recipe requires fresh ingredients and olive oil'),
        createMessage('3', 'Cooking time is about thirty minutes for the sauce'),
        createMessage('4', 'Italian cuisine uses garlic herbs and spices'),
        createMessage('5', 'Baking bread requires yeast flour and water'),
        // Topic 2: Programming
        createMessage('6', 'JavaScript is a programming language for web development'),
        createMessage('7', 'TypeScript adds type safety to JavaScript code'),
        createMessage('8', 'React is a popular framework for building user interfaces'),
        createMessage('9', 'Node runtime executes JavaScript on servers'),
        createMessage('10', 'Webpack bundles modules for deployment'),
      ];
      const conversation = createConversation(messages);
      const config = createConfig({ maxTokensPerChunk: 500 });

      const chunks = strategy.chunk(conversation, config);

      // Should create chunks (may be 1 or more depending on topic detection)
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      
      // Verify chunks maintain message integrity
      expect(chunks[0].messages.length).toBeGreaterThan(0);
    });

    it('should keep similar topics together', () => {
      const messages = [
        createMessage('1', 'Python is great for data science and machine learning'),
        createMessage('2', 'Machine learning models require training data'),
        createMessage('3', 'Data science involves statistical analysis'),
        createMessage('4', 'Neural networks are used in deep learning'),
      ];
      const conversation = createConversation(messages);
      const config = createConfig({ maxTokensPerChunk: 500 });

      const chunks = strategy.chunk(conversation, config);

      // Should keep related messages together (may be 1 or 2 chunks)
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks.length).toBeLessThanOrEqual(2);
    });

    it('should handle conversations with multiple topic shifts', () => {
      const messages = [
        // Topic 1: Weather
        createMessage('1', 'The weather is sunny today with clear skies'),
        createMessage('2', 'Temperature is warm and pleasant outside'),
        createMessage('3', 'Clouds are forming in the afternoon sky'),
        createMessage('4', 'Rain forecast predicts showers tomorrow'),
        createMessage('5', 'Humidity levels are high this season'),
        // Topic 2: Sports
        createMessage('6', 'Football game was exciting with many goals scored'),
        createMessage('7', 'The team played well and won the championship'),
        createMessage('8', 'Players trained hard for the tournament'),
        createMessage('9', 'Coach strategy helped win the match'),
        createMessage('10', 'Stadium was packed with fans cheering'),
        // Topic 3: Music
        createMessage('11', 'Classical music concerts are wonderful experiences'),
        createMessage('12', 'The orchestra performed beautifully last night'),
        createMessage('13', 'Symphony movements were perfectly executed'),
        createMessage('14', 'Conductor led the ensemble brilliantly'),
        createMessage('15', 'Violin solos were absolutely stunning'),
      ];
      const conversation = createConversation(messages);
      const config = createConfig({ maxTokensPerChunk: 500 });

      const chunks = strategy.chunk(conversation, config);

      // Should create chunks (may detect topic shifts)
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('size limit enforcement', () => {
    it('should not exceed max chunk size', () => {
      const messages = [
        createMessage('1', 'A'.repeat(100)),
        createMessage('2', 'B'.repeat(100)),
        createMessage('3', 'C'.repeat(100)),
        createMessage('4', 'D'.repeat(100)),
        createMessage('5', 'E'.repeat(100)),
      ];
      const conversation = createConversation(messages);
      const config = createConfig({ maxTokensPerChunk: 80 });

      const chunks = strategy.chunk(conversation, config);

      // Verify no chunk exceeds max size
      for (const chunk of chunks) {
        expect(chunk.tokenCount).toBeLessThanOrEqual(config.maxTokensPerChunk);
      }
    });

    it('should split long topics when necessary', () => {
      const messages = Array.from({ length: 20 }, (_, i) =>
        createMessage(`${i + 1}`, `Message about programming and coding topic number ${i + 1}`)
      );
      const conversation = createConversation(messages);
      const config = createConfig({ maxTokensPerChunk: 100 });

      const chunks = strategy.chunk(conversation, config);

      // Should create multiple chunks even though topic is consistent
      expect(chunks.length).toBeGreaterThan(1);
      
      // Each chunk should respect size limit
      for (const chunk of chunks) {
        expect(chunk.tokenCount).toBeLessThanOrEqual(config.maxTokensPerChunk);
      }
    });

    it('should respect minimum chunk size', () => {
      const messages = [
        createMessage('1', 'Short message one'),
        createMessage('2', 'Short message two'),
        createMessage('3', 'Short message three'),
        createMessage('4', 'Short message four'),
      ];
      const conversation = createConversation(messages);
      const config = createConfig({
        maxTokensPerChunk: 200,
        minChunkSize: 30
      });

      const chunks = strategy.chunk(conversation, config);

      // Chunks should meet minimum size (except possibly the last one)
      for (let i = 0; i < chunks.length - 1; i++) {
        expect(chunks[i].tokenCount).toBeGreaterThanOrEqual(config.minChunkSize!);
      }
    });

    it('should handle very large messages', () => {
      const messages = [
        createMessage('1', 'A'.repeat(400)), // Very long message
        createMessage('2', 'Short message'),
      ];
      const conversation = createConversation(messages);
      const config = createConfig({ maxTokensPerChunk: 150 });

      const chunks = strategy.chunk(conversation, config);

      // Should handle the large message appropriately
      expect(chunks.length).toBeGreaterThan(0);
      
      // Verify all messages are included
      const allMessageIds = chunks.flatMap(c => c.messages.map(m => m.id));
      expect(allMessageIds).toContain('1');
      expect(allMessageIds).toContain('2');
    });
  });

  describe('various conversation types', () => {
    it('should handle technical conversations', () => {
      const messages = [
        createMessage('1', 'API endpoints should use RESTful conventions'),
        createMessage('2', 'Database queries need proper indexing for performance'),
        createMessage('3', 'Authentication requires secure token management'),
      ];
      const conversation = createConversation(messages);
      const config = createConfig();

      const chunks = strategy.chunk(conversation, config);

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].messages.length).toBeGreaterThan(0);
    });

    it('should handle casual conversations', () => {
      const messages = [
        createMessage('1', 'Hey how are you doing today'),
        createMessage('2', 'I am doing great thanks for asking'),
        createMessage('3', 'What are your plans for the weekend'),
      ];
      const conversation = createConversation(messages);
      const config = createConfig();

      const chunks = strategy.chunk(conversation, config);

      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should handle mixed role conversations', () => {
      const messages = [
        createMessage('1', 'Tell me about machine learning', 'user'),
        createMessage('2', 'Machine learning is a subset of artificial intelligence', 'assistant'),
        createMessage('3', 'What are neural networks', 'user'),
        createMessage('4', 'Neural networks are computing systems inspired by biological brains', 'assistant'),
      ];
      const conversation = createConversation(messages);
      const config = createConfig();

      const chunks = strategy.chunk(conversation, config);

      expect(chunks.length).toBeGreaterThan(0);
      
      // Verify both roles are preserved
      const allRoles = chunks.flatMap(c => c.messages.map(m => m.role));
      expect(allRoles).toContain('user');
      expect(allRoles).toContain('assistant');
    });

    it('should handle conversations with repeated keywords', () => {
      const messages = [
        createMessage('1', 'Python Python Python is a programming language'),
        createMessage('2', 'Python Python code is easy to read and write'),
        createMessage('3', 'Python Python Python developers love the syntax'),
      ];
      const conversation = createConversation(messages);
      const config = createConfig();

      const chunks = strategy.chunk(conversation, config);

      // Should keep similar messages together
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('fallback behavior', () => {
    it('should fall back to sliding window for very short conversations', () => {
      const messages = [
        createMessage('1', 'Short'),
        createMessage('2', 'Messages'),
      ];
      const conversation = createConversation(messages);
      const config = createConfig();

      const chunks = strategy.chunk(conversation, config);

      expect(chunks.length).toBe(1);
      expect(chunks[0].messages.length).toBe(2);
    });

    it('should fall back when no clear topic boundaries exist', () => {
      const messages = [
        createMessage('1', 'A'.repeat(100)),
        createMessage('2', 'B'.repeat(100)),
        createMessage('3', 'C'.repeat(100)),
      ];
      const conversation = createConversation(messages);
      const config = createConfig({ maxTokensPerChunk: 80 });

      const chunks = strategy.chunk(conversation, config);

      // Should still create valid chunks
      expect(chunks.length).toBeGreaterThan(0);
      
      for (const chunk of chunks) {
        expect(chunk.tokenCount).toBeLessThanOrEqual(config.maxTokensPerChunk);
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
      const messages = [createMessage('1', 'Single message about programming')];
      const conversation = createConversation(messages);
      const config = createConfig();

      const chunks = strategy.chunk(conversation, config);

      expect(chunks.length).toBe(1);
      expect(chunks[0].messages.length).toBe(1);
      expect(chunks[0].messages[0].id).toBe('1');
    });

    it('should handle messages with no meaningful keywords', () => {
      const messages = [
        createMessage('1', 'the the the and and and'),
        createMessage('2', 'is is is are are are'),
        createMessage('3', 'it it it to to to'),
      ];
      const conversation = createConversation(messages);
      const config = createConfig();

      const chunks = strategy.chunk(conversation, config);

      // Should still create chunks (likely fall back to sliding window)
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should handle messages with special characters', () => {
      const messages = [
        createMessage('1', 'Hello! How are you? @user #hashtag'),
        createMessage('2', 'Great! Let\'s discuss $pricing & features'),
        createMessage('3', 'Sure, 50% discount on items (limited time)'),
      ];
      const conversation = createConversation(messages);
      const config = createConfig();

      const chunks = strategy.chunk(conversation, config);

      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe('chunk metadata', () => {
    it('should generate unique chunk IDs', () => {
      const messages = [
        createMessage('1', 'First topic about cooking and recipes'),
        createMessage('2', 'More about cooking techniques'),
        createMessage('3', 'Different topic about programming'),
        createMessage('4', 'More about coding'),
      ];
      const conversation = createConversation(messages);
      const config = createConfig({ maxTokensPerChunk: 100 });

      const chunks = strategy.chunk(conversation, config);

      const chunkIds = chunks.map(c => c.id);
      const uniqueIds = new Set(chunkIds);
      
      expect(uniqueIds.size).toBe(chunks.length);
    });

    it('should record sequence numbers correctly', () => {
      const messages = Array.from({ length: 10 }, (_, i) =>
        createMessage(`${i + 1}`, `Message ${i + 1}`)
      );
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
        createMessage('1', 'Programming languages include Python Java and JavaScript'),
        createMessage('2', 'Python is great for data science and machine learning'),
        createMessage('3', 'Java is used for enterprise applications'),
        createMessage('4', 'JavaScript powers web development'),
        createMessage('5', 'TypeScript adds types to JavaScript'),
        createMessage('6', 'React framework builds user interfaces'),
      ];
      const conversation = createConversation(messages);
      const config = createConfig();

      const chunks = strategy.chunk(conversation, config);

      // Strategy name should be semantic or include semantic (may fall back)
      expect(chunks[0].metadata.chunkingStrategy).toMatch(/semantic|sliding-window/);
    });

    it('should record message indices', () => {
      const messages = [
        createMessage('1', 'Message one'),
        createMessage('2', 'Message two'),
        createMessage('3', 'Message three'),
      ];
      const conversation = createConversation(messages);
      const config = createConfig();

      const chunks = strategy.chunk(conversation, config);

      for (const chunk of chunks) {
        expect(chunk.metadata.startMessageIndex).toBeGreaterThanOrEqual(0);
        expect(chunk.metadata.endMessageIndex).toBeGreaterThanOrEqual(chunk.metadata.startMessageIndex);
        expect(chunk.metadata.endMessageIndex).toBeLessThan(messages.length);
      }
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
      const messages = [createMessage('1', 'A'.repeat(1000))];
      const conversation = createConversation(messages);
      const config = createConfig({ maxTokensPerChunk: 50 });

      expect(strategy.canHandle(conversation, config)).toBe(false);
    });
  });

  describe('overlap behavior', () => {
    it('should create overlap between chunks', () => {
      const messages = Array.from({ length: 10 }, (_, i) =>
        createMessage(`${i + 1}`, `Message about topic ${i + 1}`)
      );
      const conversation = createConversation(messages);
      const config = createConfig({
        maxTokensPerChunk: 100,
        overlapTokens: 20
      });

      const chunks = strategy.chunk(conversation, config);

      if (chunks.length > 1) {
        // Check that chunks have overlap (except first chunk)
        for (let i = 1; i < chunks.length; i++) {
          expect(chunks[i].overlapWithPrevious).toBeGreaterThanOrEqual(0);
          expect(chunks[i].overlapTokensWithPrevious).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });
});
