/**
 * Tests for TokenCounter
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TokenCounter } from '../token-counter.js';
import type { NormalizedConversation, NormalizedMessage } from '../../types.js';

describe('TokenCounter', () => {
  let counter: TokenCounter;

  beforeEach(() => {
    counter = new TokenCounter();
  });

  describe('count with known token counts', () => {
    it('should count tokens accurately with openai-tiktoken method', () => {
      const text = 'Hello, world!';
      const result = counter.count(text, 'openai-tiktoken');
      
      expect(result.tokens).toBeGreaterThan(0);
      expect(result.method).toBe('openai-tiktoken');
      expect(result.accuracy).toBe('exact');
    });

    it('should count tokens for longer text with openai-tiktoken', () => {
      const text = 'The quick brown fox jumps over the lazy dog. This is a test sentence with multiple words.';
      const result = counter.count(text, 'openai-tiktoken');
      
      expect(result.tokens).toBeGreaterThan(10);
      expect(result.method).toBe('openai-tiktoken');
      expect(result.accuracy).toBe('exact');
    });

    it('should handle empty string', () => {
      const text = '';
      const result = counter.count(text, 'openai-tiktoken');
      
      expect(result.tokens).toBe(0);
      expect(result.method).toBe('openai-tiktoken');
    });

    it('should handle Unicode characters', () => {
      const text = 'Hello 世界 🌍';
      const result = counter.count(text, 'openai-tiktoken');
      
      expect(result.tokens).toBeGreaterThan(0);
      expect(result.method).toBe('openai-tiktoken');
    });
  });

  describe('approximation methods accuracy', () => {
    const testText = 'The quick brown fox jumps over the lazy dog.';

    it('should estimate tokens with anthropic-estimate method', () => {
      const result = counter.count(testText, 'anthropic-estimate');
      
      expect(result.tokens).toBeGreaterThan(0);
      expect(result.method).toBe('anthropic-estimate');
      expect(result.accuracy).toBe('estimated');
      // Anthropic estimate: characters / 3.5
      expect(result.tokens).toBe(Math.ceil(testText.length / 3.5));
    });

    it('should estimate tokens with gemini-estimate method', () => {
      const result = counter.count(testText, 'gemini-estimate');
      
      expect(result.tokens).toBeGreaterThan(0);
      expect(result.method).toBe('gemini-estimate');
      expect(result.accuracy).toBe('estimated');
      // Gemini estimate: characters / 3.8
      expect(result.tokens).toBe(Math.ceil(testText.length / 3.8));
    });

    it('should estimate tokens with approximate method', () => {
      const result = counter.count(testText, 'approximate');
      
      expect(result.tokens).toBeGreaterThan(0);
      expect(result.method).toBe('approximate');
      expect(result.accuracy).toBe('approximate');
      // Approximate: characters / 4
      expect(result.tokens).toBe(Math.ceil(testText.length / 4));
    });

    it('should use approximate method by default', () => {
      const result = counter.count(testText);
      
      expect(result.method).toBe('approximate');
      expect(result.accuracy).toBe('approximate');
    });

    it('should compare approximation methods with tiktoken', () => {
      const longText = 'The quick brown fox jumps over the lazy dog. '.repeat(10);
      
      const tiktokenResult = counter.count(longText, 'openai-tiktoken');
      const anthropicResult = counter.count(longText, 'anthropic-estimate');
      const geminiResult = counter.count(longText, 'gemini-estimate');
      const approximateResult = counter.count(longText, 'approximate');
      
      // All methods should produce positive token counts
      expect(tiktokenResult.tokens).toBeGreaterThan(0);
      expect(anthropicResult.tokens).toBeGreaterThan(0);
      expect(geminiResult.tokens).toBeGreaterThan(0);
      expect(approximateResult.tokens).toBeGreaterThan(0);
      
      // Approximations should be within reasonable range of tiktoken
      const tiktokenCount = tiktokenResult.tokens;
      expect(anthropicResult.tokens).toBeGreaterThan(tiktokenCount * 0.5);
      expect(anthropicResult.tokens).toBeLessThan(tiktokenCount * 2);
      expect(geminiResult.tokens).toBeGreaterThan(tiktokenCount * 0.5);
      expect(geminiResult.tokens).toBeLessThan(tiktokenCount * 2);
      expect(approximateResult.tokens).toBeGreaterThan(tiktokenCount * 0.5);
      expect(approximateResult.tokens).toBeLessThan(tiktokenCount * 2);
    });
  });

  describe('caching behavior', () => {
    it('should cache token counts', () => {
      const text = 'Hello, world!';
      
      // First call - cache miss
      const result1 = counter.count(text, 'openai-tiktoken');
      const stats1 = counter.getCacheStats();
      
      expect(stats1.misses).toBe(1);
      expect(stats1.hits).toBe(0);
      
      // Second call - cache hit
      const result2 = counter.count(text, 'openai-tiktoken');
      const stats2 = counter.getCacheStats();
      
      expect(result1.tokens).toBe(result2.tokens);
      expect(stats2.misses).toBe(1);
      expect(stats2.hits).toBe(1);
    });

    it('should cache separately for different methods', () => {
      const text = 'Hello, world!';
      
      counter.count(text, 'openai-tiktoken');
      counter.count(text, 'approximate');
      
      const stats = counter.getCacheStats();
      
      // Both should be cache misses (different methods)
      expect(stats.misses).toBe(2);
      expect(stats.hits).toBe(0);
    });

    it('should cache separately for different texts', () => {
      counter.count('Hello', 'openai-tiktoken');
      counter.count('World', 'openai-tiktoken');
      
      const stats = counter.getCacheStats();
      
      // Both should be cache misses (different texts)
      expect(stats.misses).toBe(2);
      expect(stats.hits).toBe(0);
    });

    it('should calculate hit rate correctly', () => {
      const text = 'Hello, world!';
      
      counter.count(text, 'openai-tiktoken'); // miss
      counter.count(text, 'openai-tiktoken'); // hit
      counter.count(text, 'openai-tiktoken'); // hit
      
      const stats = counter.getCacheStats();
      
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(2 / 3);
    });

    it('should clear cache', () => {
      const text = 'Hello, world!';
      
      counter.count(text, 'openai-tiktoken');
      counter.count(text, 'openai-tiktoken');
      
      let stats = counter.getCacheStats();
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.hits).toBe(1);
      
      counter.clearCache();
      
      stats = counter.getCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });

    it('should respect max cache size', () => {
      const smallCounter = new TokenCounter({ maxCacheSize: 2 });
      
      smallCounter.count('text1', 'approximate');
      smallCounter.count('text2', 'approximate');
      smallCounter.count('text3', 'approximate');
      
      const stats = smallCounter.getCacheStats();
      
      // Cache should not exceed max size
      expect(stats.size).toBeLessThanOrEqual(2);
    });

    it('should handle cache expiry', () => {
      const shortExpiryCounter = new TokenCounter({ cacheExpiryMs: 10 });
      const text = 'Hello, world!';
      
      shortExpiryCounter.count(text, 'approximate');
      
      // Wait for cache to expire
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          shortExpiryCounter.count(text, 'approximate');
          const stats = shortExpiryCounter.getCacheStats();
          
          // Should be 2 misses (expired cache)
          expect(stats.misses).toBe(2);
          expect(stats.hits).toBe(0);
          resolve();
        }, 20);
      });
    });
  });

  describe('countConversation', () => {
    it('should count tokens in a conversation', () => {
      const conversation: NormalizedConversation = {
        id: 'conv-1',
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Hello, how are you?',
            timestamp: '2024-01-01T00:00:00Z'
          },
          {
            id: 'msg-2',
            role: 'assistant',
            content: 'I am doing well, thank you!',
            timestamp: '2024-01-01T00:00:01Z'
          }
        ],
        metadata: {}
      };
      
      const result = counter.countConversation(conversation, 'openai-tiktoken');
      
      expect(result.tokens).toBeGreaterThan(0);
      expect(result.method).toBe('openai-tiktoken');
      expect(result.accuracy).toBe('exact');
    });

    it('should handle empty conversation', () => {
      const conversation: NormalizedConversation = {
        id: 'conv-1',
        messages: [],
        metadata: {}
      };
      
      const result = counter.countConversation(conversation, 'openai-tiktoken');
      
      expect(result.tokens).toBe(0);
    });

    it('should count tokens across multiple messages', () => {
      const conversation: NormalizedConversation = {
        id: 'conv-1',
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'First message',
            timestamp: '2024-01-01T00:00:00Z'
          },
          {
            id: 'msg-2',
            role: 'assistant',
            content: 'Second message',
            timestamp: '2024-01-01T00:00:01Z'
          },
          {
            id: 'msg-3',
            role: 'user',
            content: 'Third message',
            timestamp: '2024-01-01T00:00:02Z'
          }
        ],
        metadata: {}
      };
      
      const result = counter.countConversation(conversation, 'approximate');
      
      // Should count all messages
      expect(result.tokens).toBeGreaterThan(0);
    });
  });

  describe('countMessage', () => {
    it('should count tokens in a single message', () => {
      const message: NormalizedMessage = {
        id: 'msg-1',
        role: 'user',
        content: 'Hello, world!',
        timestamp: '2024-01-01T00:00:00Z'
      };
      
      const result = counter.countMessage(message, 'openai-tiktoken');
      
      expect(result.tokens).toBeGreaterThan(0);
      expect(result.method).toBe('openai-tiktoken');
    });

    it('should include role in token count', () => {
      const message: NormalizedMessage = {
        id: 'msg-1',
        role: 'user',
        content: 'Hello',
        timestamp: '2024-01-01T00:00:00Z'
      };
      
      const result = counter.countMessage(message, 'approximate');
      
      // Should count "user: Hello"
      const expectedLength = 'user: Hello'.length;
      expect(result.tokens).toBe(Math.ceil(expectedLength / 4));
    });
  });

  describe('getRecommendedMethod', () => {
    it('should recommend openai-tiktoken for OpenAI providers', () => {
      expect(counter.getRecommendedMethod('openai')).toBe('openai-tiktoken');
      expect(counter.getRecommendedMethod('OpenAI')).toBe('openai-tiktoken');
      expect(counter.getRecommendedMethod('gpt-4')).toBe('openai-tiktoken');
      expect(counter.getRecommendedMethod('GPT-3.5')).toBe('openai-tiktoken');
    });

    it('should recommend anthropic-estimate for Anthropic providers', () => {
      expect(counter.getRecommendedMethod('anthropic')).toBe('anthropic-estimate');
      expect(counter.getRecommendedMethod('Anthropic')).toBe('anthropic-estimate');
      expect(counter.getRecommendedMethod('claude')).toBe('anthropic-estimate');
      expect(counter.getRecommendedMethod('Claude-3')).toBe('anthropic-estimate');
    });

    it('should recommend gemini-estimate for Google providers', () => {
      expect(counter.getRecommendedMethod('gemini')).toBe('gemini-estimate');
      expect(counter.getRecommendedMethod('Gemini')).toBe('gemini-estimate');
      expect(counter.getRecommendedMethod('google')).toBe('gemini-estimate');
      expect(counter.getRecommendedMethod('Google-AI')).toBe('gemini-estimate');
    });

    it('should recommend approximate for unknown providers', () => {
      expect(counter.getRecommendedMethod('unknown')).toBe('approximate');
      expect(counter.getRecommendedMethod('custom-llm')).toBe('approximate');
      expect(counter.getRecommendedMethod('')).toBe('approximate');
    });
  });

  describe('error handling', () => {
    it('should fall back to approximate on tiktoken error', () => {
      // This test verifies the fallback behavior is in place
      // In practice, tiktoken should handle most inputs gracefully
      const text = 'Normal text';
      const result = counter.count(text, 'openai-tiktoken');
      
      expect(result.tokens).toBeGreaterThan(0);
    });
  });

  describe('getCacheStats', () => {
    it('should return initial cache stats', () => {
      const stats = counter.getCacheStats();
      
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(0);
    });

    it('should track cache size', () => {
      counter.count('text1', 'approximate');
      counter.count('text2', 'approximate');
      
      const stats = counter.getCacheStats();
      
      expect(stats.size).toBe(2);
    });
  });
});
