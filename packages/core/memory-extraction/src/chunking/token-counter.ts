/**
 * Token counting utilities for conversation chunking
 */

import { encoding_for_model, type TiktokenModel } from 'tiktoken';
import type { NormalizedConversation, NormalizedMessage } from '../types.js';

/**
 * Token counting methods
 */
export type TokenCountMethod = 
  | 'openai-tiktoken'    // Accurate for OpenAI models
  | 'anthropic-estimate' // Estimate for Claude
  | 'gemini-estimate'    // Estimate for Gemini
  | 'approximate';       // Fast approximation (length / 4)

/**
 * Token count result with metadata
 */
export interface TokenCountResult {
  tokens: number;
  method: TokenCountMethod;
  accuracy: 'exact' | 'estimated' | 'approximate';
}

/**
 * Cache entry for token counts
 */
interface CacheEntry {
  tokens: number;
  timestamp: number;
  accessCount: number;
}

/**
 * Performance metrics for token counting
 */
export interface TokenCounterMetrics {
  totalCounts: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;
  averageCountTime: number;
  totalCountTime: number;
  cacheSize: number;
  evictions: number;
}

/**
 * TokenCounter class for estimating token counts
 */
export class TokenCounter {
  private cache: Map<string, CacheEntry>;
  private cacheHits: number = 0;
  private cacheMisses: number = 0;
  private cacheEvictions: number = 0;
  private readonly maxCacheSize: number;
  private readonly cacheExpiryMs: number;
  private readonly enableProfiling: boolean;
  
  // Performance tracking
  private totalCountTime: number = 0;
  private totalCounts: number = 0;
  
  // LRU tracking
  private accessOrder: string[] = [];

  constructor(options?: {
    maxCacheSize?: number;
    cacheExpiryMs?: number;
    enableProfiling?: boolean;
  }) {
    this.cache = new Map();
    this.maxCacheSize = options?.maxCacheSize ?? 10000;
    this.cacheExpiryMs = options?.cacheExpiryMs ?? 3600000; // 1 hour default
    this.enableProfiling = options?.enableProfiling ?? false;
  }

  /**
   * Count tokens in text using specified method
   */
  count(text: string, method: TokenCountMethod = 'approximate'): TokenCountResult {
    const startTime = this.enableProfiling ? performance.now() : 0;
    
    // Check cache first
    const cacheKey = this.getCacheKey(text, method);
    const cached = this.getFromCache(cacheKey);
    if (cached !== null) {
      this.cacheHits++;
      this.totalCounts++;
      
      if (this.enableProfiling) {
        this.totalCountTime += performance.now() - startTime;
      }
      
      return {
        tokens: cached,
        method,
        accuracy: this.getAccuracy(method)
      };
    }

    this.cacheMisses++;
    this.totalCounts++;

    let tokens: number;
    try {
      switch (method) {
        case 'openai-tiktoken':
          tokens = this.countWithTiktoken(text);
          break;
        case 'anthropic-estimate':
          tokens = this.countAnthropicEstimate(text);
          break;
        case 'gemini-estimate':
          tokens = this.countGeminiEstimate(text);
          break;
        case 'approximate':
        default:
          tokens = this.countApproximate(text);
          break;
      }
    } catch (error) {
      // Fall back to approximate counting on error
      console.warn(`Token counting failed for method ${method}, falling back to approximate`, error);
      tokens = this.countApproximate(text);
      method = 'approximate';
    }

    // Cache the result
    this.addToCache(cacheKey, tokens);

    if (this.enableProfiling) {
      this.totalCountTime += performance.now() - startTime;
    }

    return {
      tokens,
      method,
      accuracy: this.getAccuracy(method)
    };
  }
  
  /**
   * Count tokens lazily - returns a function that computes tokens on first call
   * Useful when you may not need the count immediately
   */
  countLazy(text: string, method: TokenCountMethod = 'approximate'): () => TokenCountResult {
    let result: TokenCountResult | null = null;
    
    return () => {
      if (result === null) {
        result = this.count(text, method);
      }
      return result;
    };
  }

  /**
   * Count tokens in a conversation
   */
  countConversation(
    conversation: NormalizedConversation,
    method: TokenCountMethod = 'approximate'
  ): TokenCountResult {
    let totalTokens = 0;

    for (const message of conversation.messages) {
      const messageText = this.formatMessage(message);
      const result = this.count(messageText, method);
      totalTokens += result.tokens;
    }

    return {
      tokens: totalTokens,
      method,
      accuracy: this.getAccuracy(method)
    };
  }

  /**
   * Count tokens in a single message
   */
  countMessage(message: NormalizedMessage, method: TokenCountMethod = 'approximate'): TokenCountResult {
    const messageText = this.formatMessage(message);
    return this.count(messageText, method);
  }

  /**
   * Get recommended token counting method for a provider
   */
  getRecommendedMethod(provider: string): TokenCountMethod {
    const providerLower = provider.toLowerCase();
    
    if (providerLower.includes('openai') || providerLower.includes('gpt')) {
      return 'openai-tiktoken';
    } else if (providerLower.includes('anthropic') || providerLower.includes('claude')) {
      return 'anthropic-estimate';
    } else if (providerLower.includes('gemini') || providerLower.includes('google')) {
      return 'gemini-estimate';
    }
    
    return 'approximate';
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: this.cacheHits / (this.cacheHits + this.cacheMisses) || 0,
      evictions: this.cacheEvictions
    };
  }
  
  /**
   * Get comprehensive performance metrics
   */
  getMetrics(): TokenCounterMetrics {
    return {
      totalCounts: this.totalCounts,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      hitRate: this.totalCounts > 0 ? this.cacheHits / this.totalCounts : 0,
      averageCountTime: this.totalCounts > 0 ? this.totalCountTime / this.totalCounts : 0,
      totalCountTime: this.totalCountTime,
      cacheSize: this.cache.size,
      evictions: this.cacheEvictions
    };
  }
  
  /**
   * Reset performance metrics
   */
  resetMetrics(): void {
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.cacheEvictions = 0;
    this.totalCountTime = 0;
    this.totalCounts = 0;
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.cacheEvictions = 0;
  }

  /**
   * Count tokens using tiktoken (accurate for OpenAI models)
   */
  private countWithTiktoken(text: string): number {
    try {
      // Use gpt-4 encoding as a reasonable default
      const encoding = encoding_for_model('gpt-4' as TiktokenModel);
      const tokens = encoding.encode(text);
      encoding.free(); // Free the encoding to prevent memory leaks
      return tokens.length;
    } catch (error) {
      throw new Error(`Tiktoken encoding failed: ${error}`);
    }
  }

  /**
   * Estimate tokens for Anthropic models
   * Claude uses a similar tokenization to GPT, but slightly different
   * We use a conservative estimate: characters / 3.5
   */
  private countAnthropicEstimate(text: string): number {
    return Math.ceil(text.length / 3.5);
  }

  /**
   * Estimate tokens for Gemini models
   * Gemini tokenization is similar to other models
   * We use: characters / 3.8
   */
  private countGeminiEstimate(text: string): number {
    return Math.ceil(text.length / 3.8);
  }

  /**
   * Fast approximate token count
   * Uses the common heuristic: characters / 4
   */
  private countApproximate(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Format a message for token counting
   */
  private formatMessage(message: NormalizedMessage): string {
    // Include role and content, similar to how it would be sent to LLM
    return `${message.role}: ${message.content}`;
  }

  /**
   * Get accuracy level for a method
   */
  private getAccuracy(method: TokenCountMethod): 'exact' | 'estimated' | 'approximate' {
    switch (method) {
      case 'openai-tiktoken':
        return 'exact';
      case 'anthropic-estimate':
      case 'gemini-estimate':
        return 'estimated';
      case 'approximate':
      default:
        return 'approximate';
    }
  }

  /**
   * Generate cache key
   */
  private getCacheKey(text: string, method: TokenCountMethod): string {
    // Use a simple hash for the cache key
    const hash = this.simpleHash(text);
    return `${method}:${hash}`;
  }

  /**
   * Simple hash function for cache keys
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Get value from cache if valid
   */
  private getFromCache(key: string): number | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > this.cacheExpiryMs) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      return null;
    }

    // Update access tracking for LRU
    entry.accessCount++;
    this.updateAccessOrder(key);

    return entry.tokens;
  }

  /**
   * Add value to cache with improved LRU eviction
   */
  private addToCache(key: string, tokens: number): void {
    // If cache is full, evict least recently used entry
    if (this.cache.size >= this.maxCacheSize) {
      this.evictLRU();
    }

    this.cache.set(key, {
      tokens,
      timestamp: Date.now(),
      accessCount: 1
    });
    
    this.updateAccessOrder(key);
  }
  
  /**
   * Evict least recently used entry from cache
   */
  private evictLRU(): void {
    if (this.accessOrder.length === 0) {
      // Fallback: remove first entry if access order is empty
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
        this.cacheEvictions++;
      }
      return;
    }
    
    // Remove the least recently used (first in access order)
    const lruKey = this.accessOrder.shift();
    if (lruKey) {
      this.cache.delete(lruKey);
      this.cacheEvictions++;
    }
  }
  
  /**
   * Update access order for LRU tracking
   */
  private updateAccessOrder(key: string): void {
    // Remove key from current position
    this.removeFromAccessOrder(key);
    
    // Add to end (most recently used)
    this.accessOrder.push(key);
  }
  
  /**
   * Remove key from access order
   */
  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
  }
}
