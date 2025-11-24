/**
 * Base class for chunking strategies
 */

import type { NormalizedConversation, NormalizedMessage } from '../../types.js';
import { TokenCounter } from '../token-counter.js';
import type {
  ChunkingStrategy,
  ChunkingConfig,
  ConversationChunk,
  ChunkMetadata,
} from '../types.js';

/**
 * Abstract base class for chunking strategies
 * Provides common utilities for message token counting and chunk creation
 */
export abstract class BaseChunkingStrategy implements ChunkingStrategy {
  protected tokenCounter: TokenCounter;

  constructor(tokenCounter: TokenCounter) {
    this.tokenCounter = tokenCounter;
  }

  /**
   * Name of the strategy (must be implemented by subclasses)
   */
  abstract readonly name: string;

  /**
   * Split a conversation into chunks (must be implemented by subclasses)
   * 
   * @param conversation - The conversation to chunk
   * @param config - Chunking configuration
   * @returns Array of conversation chunks
   */
  abstract chunk(
    conversation: NormalizedConversation,
    config: ChunkingConfig
  ): ConversationChunk[];

  /**
   * Validate that this strategy can handle the conversation
   * Default implementation checks for basic requirements
   * 
   * @param conversation - The conversation to validate
   * @param config - Chunking configuration
   * @returns True if the strategy can handle this conversation
   */
  canHandle(
    conversation: NormalizedConversation,
    config: ChunkingConfig
  ): boolean {
    // Basic validation: conversation must have messages
    if (!conversation.messages || conversation.messages.length === 0) {
      return false;
    }

    // Ensure at least one message can fit in a chunk
    const firstMessage = conversation.messages[0];
    const messageTokens = this.countMessageTokens(firstMessage, config);
    
    if (messageTokens > config.maxTokensPerChunk) {
      // Even a single message exceeds the chunk size
      return false;
    }

    return true;
  }

  /**
   * Count tokens in a single message
   * 
   * @param message - The message to count
   * @param config - Chunking configuration
   * @returns Token count
   */
  protected countMessageTokens(
    message: NormalizedMessage,
    config: ChunkingConfig
  ): number {
    const result = this.tokenCounter.countMessage(
      message,
      config.tokenCountMethod
    );
    return result.tokens;
  }

  /**
   * Count tokens in an array of messages
   * 
   * @param messages - The messages to count
   * @param config - Chunking configuration
   * @returns Total token count
   */
  protected countMessagesTokens(
    messages: NormalizedMessage[],
    config: ChunkingConfig
  ): number {
    let total = 0;
    for (const message of messages) {
      total += this.countMessageTokens(message, config);
    }
    return total;
  }

  /**
   * Create a conversation chunk with proper metadata
   * 
   * @param params - Chunk creation parameters
   * @returns A complete conversation chunk
   */
  protected createChunk(params: {
    conversationId: string;
    sequence: number;
    totalChunks: number;
    messages: NormalizedMessage[];
    tokenCount: number;
    overlapWithPrevious: number;
    overlapWithNext: number;
    overlapTokensWithPrevious: number;
    overlapTokensWithNext: number;
    startMessageIndex: number;
    endMessageIndex: number;
    strategyName: string;
  }): ConversationChunk {
    const chunkId = this.generateChunkId(
      params.conversationId,
      params.sequence
    );

    const metadata: ChunkMetadata = {
      startMessageIndex: params.startMessageIndex,
      endMessageIndex: params.endMessageIndex,
      chunkingStrategy: params.strategyName,
      createdAt: new Date().toISOString(),
    };

    return {
      id: chunkId,
      conversationId: params.conversationId,
      sequence: params.sequence,
      totalChunks: params.totalChunks,
      messages: params.messages,
      tokenCount: params.tokenCount,
      overlapWithPrevious: params.overlapWithPrevious,
      overlapWithNext: params.overlapWithNext,
      overlapTokensWithPrevious: params.overlapTokensWithPrevious,
      overlapTokensWithNext: params.overlapTokensWithNext,
      metadata,
    };
  }

  /**
   * Generate a unique chunk ID
   * 
   * @param conversationId - The conversation ID
   * @param sequence - The chunk sequence number
   * @returns A unique chunk identifier
   */
  protected generateChunkId(conversationId: string, sequence: number): string {
    return `${conversationId}-chunk-${sequence}`;
  }

  /**
   * Calculate the effective overlap size in tokens
   * 
   * @param config - Chunking configuration
   * @returns Overlap size in tokens
   */
  protected calculateOverlapTokens(config: ChunkingConfig): number {
    // If overlapTokens is specified, use it directly
    if (config.overlapTokens !== undefined && config.overlapTokens > 0) {
      return config.overlapTokens;
    }

    // If overlapPercentage is specified, calculate from chunk size
    if (config.overlapPercentage !== undefined && config.overlapPercentage > 0) {
      return Math.floor(config.maxTokensPerChunk * config.overlapPercentage);
    }

    // Default: no overlap
    return 0;
  }

  /**
   * Calculate the minimum chunk size in tokens
   * 
   * @param config - Chunking configuration
   * @returns Minimum chunk size in tokens
   */
  protected calculateMinChunkSize(config: ChunkingConfig): number {
    // If minChunkSize is specified, use it directly
    if (config.minChunkSize !== undefined && config.minChunkSize > 0) {
      return config.minChunkSize;
    }

    // Default: 20% of max chunk size
    return Math.floor(config.maxTokensPerChunk * 0.2);
  }

  /**
   * Calculate overlap messages from the end of a message array
   * Returns messages that fit within the overlap token budget
   * 
   * @param messages - The messages to calculate overlap from
   * @param overlapTokens - Target overlap size in tokens
   * @param config - Chunking configuration
   * @returns Array of messages for overlap
   */
  protected calculateOverlapMessages(
    messages: NormalizedMessage[],
    overlapTokens: number,
    config: ChunkingConfig
  ): NormalizedMessage[] {
    if (overlapTokens === 0 || messages.length === 0) {
      return [];
    }

    const overlapMessages: NormalizedMessage[] = [];
    let currentTokens = 0;

    // Work backwards from the end of the messages array
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      const messageTokens = this.countMessageTokens(message, config);

      // Check if adding this message would exceed overlap budget
      if (currentTokens + messageTokens > overlapTokens) {
        break;
      }

      overlapMessages.unshift(message); // Add to beginning to maintain order
      currentTokens += messageTokens;
    }

    return overlapMessages;
  }

  /**
   * Calculate the actual token count of overlap messages
   * 
   * @param overlapMessages - The messages that overlap
   * @param config - Chunking configuration
   * @returns Total token count of overlap messages
   */
  protected calculateOverlapTokenCount(
    overlapMessages: NormalizedMessage[],
    config: ChunkingConfig
  ): number {
    if (overlapMessages.length === 0) {
      return 0;
    }

    return this.countMessagesTokens(overlapMessages, config);
  }

  /**
   * Validate chunk configuration
   * 
   * @param config - Chunking configuration to validate
   * @throws Error if configuration is invalid
   */
  protected validateConfig(config: ChunkingConfig): void {
    if (config.maxTokensPerChunk <= 0) {
      throw new Error('maxTokensPerChunk must be greater than 0');
    }

    if (config.overlapTokens !== undefined && config.overlapTokens < 0) {
      throw new Error('overlapTokens must be non-negative');
    }

    if (config.overlapPercentage !== undefined) {
      if (config.overlapPercentage < 0 || config.overlapPercentage >= 1) {
        throw new Error('overlapPercentage must be between 0 and 1 (exclusive)');
      }
    }

    if (config.minChunkSize !== undefined && config.minChunkSize < 0) {
      throw new Error('minChunkSize must be non-negative');
    }

    // Ensure overlap doesn't exceed chunk size
    const overlapTokens = this.calculateOverlapTokens(config);
    if (overlapTokens >= config.maxTokensPerChunk) {
      throw new Error(
        `Overlap (${overlapTokens} tokens) must be less than maxTokensPerChunk (${config.maxTokensPerChunk})`
      );
    }

    // Ensure overlap is reasonable (not more than 90% of chunk size)
    const maxReasonableOverlap = Math.floor(config.maxTokensPerChunk * 0.9);
    if (overlapTokens > maxReasonableOverlap) {
      throw new Error(
        `Overlap (${overlapTokens} tokens) should not exceed 90% of maxTokensPerChunk (${maxReasonableOverlap} tokens)`
      );
    }
  }
}
