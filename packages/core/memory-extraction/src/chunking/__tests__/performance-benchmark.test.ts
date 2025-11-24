/**
 * Performance benchmarks for conversation chunking
 * 
 * These tests measure and compare performance characteristics of:
 * - Token counting methods
 * - Chunking strategies
 * - Sequential vs parallel processing
 * - Chunked vs non-chunked extraction
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TokenCounter } from '../token-counter.js';
import { SlidingWindowStrategy } from '../strategies/sliding-window.js';
import { ConversationBoundaryStrategy } from '../strategies/conversation-boundary.js';
import { SemanticStrategy } from '../strategies/semantic.js';
import { ChunkingOrchestrator } from '../orchestrator.js';
import type { NormalizedConversation, NormalizedMessage } from '../../types.js';
import type { ChunkingConfig } from '../types.js';

/**
 * Generate a test conversation with specified number of messages
 */
function generateConversation(messageCount: number, avgMessageLength: number = 100): NormalizedConversation {
  const messages: NormalizedMessage[] = [];
  
  for (let i = 0; i < messageCount; i++) {
    const role = i % 2 === 0 ? 'user' : 'assistant';
    const content = generateText(avgMessageLength);
    
    messages.push({
      id: `msg-${i}`,
      role,
      content,
      timestamp: new Date(Date.now() + i * 1000).toISOString(),
    });
  }
  
  return {
    id: 'test-conversation',
    messages,
    metadata: {},
  };
}

/**
 * Generate random text of specified length
 */
function generateText(length: number): string {
  const words = [
    'the', 'quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'dog',
    'hello', 'world', 'test', 'message', 'content', 'data', 'information',
    'system', 'process', 'function', 'method', 'class', 'interface',
  ];
  
  let text = '';
  while (text.length < length) {
    text += words[Math.floor(Math.random() * words.length)] + ' ';
  }
  
  return text.substring(0, length);
}

describe('Performance Benchmarks', () => {
  describe('Token Counting Performance', () => {
    let tokenCounter: TokenCounter;
    
    beforeEach(() => {
      tokenCounter = new TokenCounter({ enableProfiling: true });
    });
    
    it('should benchmark approximate counting', () => {
      const text = generateText(10000);
      const iterations = 1000;
      
      const startTime = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        tokenCounter.count(text, 'approximate');
      }
      
      const endTime = performance.now();
      const avgTime = (endTime - startTime) / iterations;
      
      const metrics = tokenCounter.getMetrics();
      
      console.log('Approximate Token Counting Benchmark:');
      console.log(`  Iterations: ${iterations}`);
      console.log(`  Average time: ${avgTime.toFixed(3)}ms`);
      console.log(`  Cache hit rate: ${(metrics.hitRate * 100).toFixed(1)}%`);
      
      // Approximate counting should be very fast
      expect(avgTime).toBeLessThan(1);
    });
    
    it('should benchmark tiktoken counting', () => {
      const text = generateText(10000);
      const iterations = 100;
      
      tokenCounter.clearCache(); // Clear cache to measure actual counting time
      
      const startTime = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        tokenCounter.count(text, 'openai-tiktoken');
      }
      
      const endTime = performance.now();
      const avgTime = (endTime - startTime) / iterations;
      
      const metrics = tokenCounter.getMetrics();
      
      console.log('Tiktoken Counting Benchmark:');
      console.log(`  Iterations: ${iterations}`);
      console.log(`  Average time: ${avgTime.toFixed(3)}ms`);
      console.log(`  Cache hit rate: ${(metrics.hitRate * 100).toFixed(1)}%`);
      
      // Tiktoken is slower but should still be reasonable
      expect(avgTime).toBeLessThan(50);
    });
    
    it('should benchmark cache effectiveness', () => {
      const texts = Array.from({ length: 100 }, (_, i) => generateText(1000));
      
      // First pass - populate cache
      texts.forEach(text => tokenCounter.count(text, 'openai-tiktoken'));
      
      tokenCounter.resetMetrics();
      
      // Second pass - should hit cache
      const startTime = performance.now();
      texts.forEach(text => tokenCounter.count(text, 'openai-tiktoken'));
      const endTime = performance.now();
      
      const metrics = tokenCounter.getMetrics();
      
      console.log('Cache Effectiveness Benchmark:');
      console.log(`  Total counts: ${metrics.totalCounts}`);
      console.log(`  Cache hits: ${metrics.cacheHits}`);
      console.log(`  Cache hit rate: ${(metrics.hitRate * 100).toFixed(1)}%`);
      console.log(`  Average time: ${(metrics.averageCountTime).toFixed(3)}ms`);
      console.log(`  Total time: ${(endTime - startTime).toFixed(2)}ms`);
      
      // Should have high cache hit rate
      expect(metrics.hitRate).toBeGreaterThan(0.95);
    });
  });
  
  describe('Chunking Strategy Performance', () => {
    const tokenCounter = new TokenCounter();
    
    it('should benchmark sliding window strategy', () => {
      const strategy = new SlidingWindowStrategy(tokenCounter);
      const conversation = generateConversation(1000, 200);
      
      const config: ChunkingConfig = {
        maxTokensPerChunk: 10000,
        overlapTokens: 1000,
        strategy: 'sliding-window',
        preserveMessageBoundaries: true,
        tokenCountMethod: 'approximate',
      };
      
      const startTime = performance.now();
      const chunks = strategy.chunk(conversation, config);
      const endTime = performance.now();
      
      const duration = endTime - startTime;
      
      console.log('Sliding Window Strategy Benchmark:');
      console.log(`  Messages: ${conversation.messages.length}`);
      console.log(`  Chunks created: ${chunks.length}`);
      console.log(`  Duration: ${duration.toFixed(2)}ms`);
      console.log(`  Messages per ms: ${(conversation.messages.length / duration).toFixed(2)}`);
      
      expect(duration).toBeLessThan(1000);
      expect(chunks.length).toBeGreaterThan(0);
    });
    
    it('should benchmark conversation boundary strategy', () => {
      const strategy = new ConversationBoundaryStrategy(tokenCounter);
      const conversation = generateConversation(1000, 200);
      
      const config: ChunkingConfig = {
        maxTokensPerChunk: 10000,
        overlapTokens: 1000,
        strategy: 'conversation-boundary',
        preserveMessageBoundaries: true,
        tokenCountMethod: 'approximate',
      };
      
      const startTime = performance.now();
      const chunks = strategy.chunk(conversation, config);
      const endTime = performance.now();
      
      const duration = endTime - startTime;
      
      console.log('Conversation Boundary Strategy Benchmark:');
      console.log(`  Messages: ${conversation.messages.length}`);
      console.log(`  Chunks created: ${chunks.length}`);
      console.log(`  Duration: ${duration.toFixed(2)}ms`);
      console.log(`  Messages per ms: ${(conversation.messages.length / duration).toFixed(2)}`);
      
      expect(duration).toBeLessThan(1000);
      expect(chunks.length).toBeGreaterThan(0);
    });
    
    it('should benchmark semantic strategy', () => {
      const strategy = new SemanticStrategy(tokenCounter);
      const conversation = generateConversation(500, 200); // Smaller for semantic analysis
      
      const config: ChunkingConfig = {
        maxTokensPerChunk: 10000,
        overlapTokens: 1000,
        strategy: 'semantic',
        preserveMessageBoundaries: true,
        tokenCountMethod: 'approximate',
      };
      
      const startTime = performance.now();
      const chunks = strategy.chunk(conversation, config);
      const endTime = performance.now();
      
      const duration = endTime - startTime;
      
      console.log('Semantic Strategy Benchmark:');
      console.log(`  Messages: ${conversation.messages.length}`);
      console.log(`  Chunks created: ${chunks.length}`);
      console.log(`  Duration: ${duration.toFixed(2)}ms`);
      console.log(`  Messages per ms: ${(conversation.messages.length / duration).toFixed(2)}`);
      
      expect(duration).toBeLessThan(2000);
      expect(chunks.length).toBeGreaterThan(0);
    });
    
    it('should compare all strategies', () => {
      const conversation = generateConversation(500, 200);
      const config: ChunkingConfig = {
        maxTokensPerChunk: 10000,
        overlapTokens: 1000,
        strategy: 'sliding-window',
        preserveMessageBoundaries: true,
        tokenCountMethod: 'approximate',
      };
      
      const strategies = [
        new SlidingWindowStrategy(tokenCounter),
        new ConversationBoundaryStrategy(tokenCounter),
        new SemanticStrategy(tokenCounter),
      ];
      
      console.log('\nStrategy Comparison:');
      console.log(`Messages: ${conversation.messages.length}`);
      console.log('---');
      
      const results = strategies.map(strategy => {
        const startTime = performance.now();
        const chunks = strategy.chunk(conversation, config);
        const endTime = performance.now();
        
        return {
          name: strategy.name,
          duration: endTime - startTime,
          chunks: chunks.length,
          avgChunkSize: chunks.reduce((sum, c) => sum + c.tokenCount, 0) / chunks.length,
        };
      });
      
      results.forEach(result => {
        console.log(`${result.name}:`);
        console.log(`  Duration: ${result.duration.toFixed(2)}ms`);
        console.log(`  Chunks: ${result.chunks}`);
        console.log(`  Avg chunk size: ${result.avgChunkSize.toFixed(0)} tokens`);
      });
      
      // All strategies should complete in reasonable time
      results.forEach(result => {
        expect(result.duration).toBeLessThan(2000);
      });
    });
  });
  
  describe('Conversation Size Scaling', () => {
    const tokenCounter = new TokenCounter();
    const strategy = new SlidingWindowStrategy(tokenCounter);
    
    it('should benchmark with various conversation sizes', () => {
      const sizes = [100, 500, 1000, 2000, 5000];
      
      const config: ChunkingConfig = {
        maxTokensPerChunk: 10000,
        overlapTokens: 1000,
        strategy: 'sliding-window',
        preserveMessageBoundaries: true,
        tokenCountMethod: 'approximate',
      };
      
      console.log('\nConversation Size Scaling:');
      console.log('---');
      
      const results = sizes.map(size => {
        const conversation = generateConversation(size, 200);
        
        const startTime = performance.now();
        const chunks = strategy.chunk(conversation, config);
        const endTime = performance.now();
        
        return {
          size,
          duration: endTime - startTime,
          chunks: chunks.length,
          msPerMessage: (endTime - startTime) / size,
        };
      });
      
      results.forEach(result => {
        console.log(`${result.size} messages:`);
        console.log(`  Duration: ${result.duration.toFixed(2)}ms`);
        console.log(`  Chunks: ${result.chunks}`);
        console.log(`  Time per message: ${result.msPerMessage.toFixed(3)}ms`);
      });
      
      // Performance should scale sub-quadratically
      // As conversation size increases, per-message time may increase due to
      // token counting overhead, but should not be exponential
      const firstRate = results[0].msPerMessage;
      const lastRate = results[results.length - 1].msPerMessage;
      
      // Last rate should not be more than 50x the first rate (allowing for overhead)
      // This is a reasonable bound for sub-quadratic scaling
      expect(lastRate).toBeLessThan(firstRate * 50);
    });
  });
  
  describe('Memory Usage', () => {
    it('should measure memory usage for large conversations', () => {
      const tokenCounter = new TokenCounter();
      const strategy = new SlidingWindowStrategy(tokenCounter);
      
      const conversation = generateConversation(10000, 200);
      
      const config: ChunkingConfig = {
        maxTokensPerChunk: 10000,
        overlapTokens: 1000,
        strategy: 'sliding-window',
        preserveMessageBoundaries: true,
        tokenCountMethod: 'approximate',
      };
      
      // Measure memory before
      if (global.gc) {
        global.gc();
      }
      const memBefore = process.memoryUsage();
      
      const chunks = strategy.chunk(conversation, config);
      
      // Measure memory after
      const memAfter = process.memoryUsage();
      
      const heapUsed = (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024;
      
      console.log('\nMemory Usage Benchmark:');
      console.log(`  Messages: ${conversation.messages.length}`);
      console.log(`  Chunks: ${chunks.length}`);
      console.log(`  Heap used: ${heapUsed.toFixed(2)} MB`);
      console.log(`  Memory per message: ${(heapUsed * 1024 / conversation.messages.length).toFixed(2)} KB`);
      
      // Memory usage should be reasonable
      expect(heapUsed).toBeLessThan(100); // Less than 100MB for 10k messages
    });
  });
  
  describe('Chunking Overhead', () => {
    it('should measure overhead vs non-chunked processing', () => {
      const tokenCounter = new TokenCounter();
      const conversation = generateConversation(100, 200);
      
      // Measure time to count tokens without chunking
      const startNonChunked = performance.now();
      const totalTokens = tokenCounter.countConversation(conversation, 'approximate');
      const endNonChunked = performance.now();
      const nonChunkedTime = endNonChunked - startNonChunked;
      
      // Measure time with chunking
      const strategy = new SlidingWindowStrategy(tokenCounter);
      const config: ChunkingConfig = {
        maxTokensPerChunk: 10000,
        overlapTokens: 1000,
        strategy: 'sliding-window',
        preserveMessageBoundaries: true,
        tokenCountMethod: 'approximate',
      };
      
      const startChunked = performance.now();
      const chunks = strategy.chunk(conversation, config);
      const endChunked = performance.now();
      const chunkedTime = endChunked - startChunked;
      
      const overhead = chunkedTime - nonChunkedTime;
      const overheadPercent = (overhead / nonChunkedTime) * 100;
      
      console.log('\nChunking Overhead:');
      console.log(`  Non-chunked time: ${nonChunkedTime.toFixed(2)}ms`);
      console.log(`  Chunked time: ${chunkedTime.toFixed(2)}ms`);
      console.log(`  Overhead: ${overhead.toFixed(2)}ms (${overheadPercent.toFixed(1)}%)`);
      console.log(`  Total tokens: ${totalTokens.tokens}`);
      console.log(`  Chunks created: ${chunks.length}`);
      
      // Overhead should be reasonable
      expect(overheadPercent).toBeLessThan(200); // Less than 2x overhead
    });
  });
});
