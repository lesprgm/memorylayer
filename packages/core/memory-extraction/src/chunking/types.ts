/**
 * Types and interfaces for conversation chunking
 */

import type { NormalizedConversation, NormalizedMessage } from '../types.js';
import type { TokenCountMethod } from './token-counter.js';

/**
 * Configuration for conversation chunking
 */
export interface ChunkingConfig {
  /** Maximum tokens per chunk (e.g., 100000) */
  maxTokensPerChunk: number;
  
  /** Fixed number of overlap tokens between chunks */
  overlapTokens?: number;
  
  /** Overlap as percentage of chunk size (e.g., 0.1 for 10%) */
  overlapPercentage?: number;
  
  /** Minimum chunk size in tokens (default: 20% of maxTokensPerChunk) */
  minChunkSize?: number;
  
  /** Chunking strategy to use */
  strategy: 'sliding-window' | 'conversation-boundary' | 'semantic' | 'custom';
  
  /** Whether to preserve message boundaries (never split a message mid-content) */
  preserveMessageBoundaries: boolean;
  
  /** Token counting method to use */
  tokenCountMethod: TokenCountMethod;
  
  /** Custom strategy name (when strategy is 'custom') */
  customStrategyName?: string;
}

/**
 * A chunk of a conversation
 */
export interface ConversationChunk {
  /** Unique chunk identifier */
  id: string;
  
  /** Original conversation ID */
  conversationId: string;
  
  /** Chunk sequence number (1-based) */
  sequence: number;
  
  /** Total number of chunks in the conversation */
  totalChunks: number;
  
  /** Messages included in this chunk */
  messages: NormalizedMessage[];
  
  /** Estimated token count for this chunk */
  tokenCount: number;
  
  /** Number of overlapping messages with previous chunk */
  overlapWithPrevious: number;
  
  /** Number of overlapping messages with next chunk */
  overlapWithNext: number;
  
  /** Number of overlapping tokens with previous chunk */
  overlapTokensWithPrevious: number;
  
  /** Number of overlapping tokens with next chunk */
  overlapTokensWithNext: number;
  
  /** Additional metadata about the chunk */
  metadata: ChunkMetadata;
}

/**
 * Metadata for a conversation chunk
 */
export interface ChunkMetadata {
  /** Index of first message in original conversation (0-based) */
  startMessageIndex: number;
  
  /** Index of last message in original conversation (0-based) */
  endMessageIndex: number;
  
  /** Strategy used to create this chunk */
  chunkingStrategy: string;
  
  /** ISO timestamp when chunk was created */
  createdAt: string;
}

/**
 * Base interface for chunking strategies
 */
export interface ChunkingStrategy {
  /** Name of the strategy */
  readonly name: string;
  
  /**
   * Split a conversation into chunks
   * 
   * @param conversation - The conversation to chunk
   * @param config - Chunking configuration
   * @returns Array of conversation chunks
   */
  chunk(
    conversation: NormalizedConversation,
    config: ChunkingConfig
  ): ConversationChunk[];
  
  /**
   * Validate that this strategy can handle the conversation
   * 
   * @param conversation - The conversation to validate
   * @param config - Chunking configuration
   * @returns True if the strategy can handle this conversation
   */
  canHandle(
    conversation: NormalizedConversation,
    config: ChunkingConfig
  ): boolean;
}

/**
 * Result of chunked extraction from a single chunk
 */
export interface ChunkExtractionResult {
  /** Chunk identifier */
  chunkId: string;
  
  /** Chunk sequence number */
  sequence: number;
  
  /** Extraction status */
  status: 'success' | 'failed';
  
  /** Extracted memories from this chunk */
  memories: any[]; // ExtractedMemory[] - using any to avoid circular dependency
  
  /** Extracted relationships from this chunk */
  relationships: any[]; // ExtractedRelationship[] - using any to avoid circular dependency
  
  /** Token count for this chunk */
  tokenCount: number;
  
  /** Processing time in milliseconds */
  processingTime: number;
  
  /** Error if extraction failed */
  error?: any; // ExtractionError - using any to avoid circular dependency
}

/**
 * Result of chunked extraction from an entire conversation
 */
export interface ChunkedExtractionResult {
  /** All extracted memories (deduplicated) */
  memories: any[]; // ExtractedMemory[]
  
  /** All extracted relationships (deduplicated) */
  relationships: any[]; // ExtractedRelationship[]
  
  /** Results from individual chunks */
  chunks: ChunkExtractionResult[];
  
  /** Total tokens in the conversation */
  totalTokens: number;
  
  /** Chunking strategy used */
  chunkingStrategy: string;
  
  /** Total processing time in milliseconds */
  processingTime: number;
  
  /** Detailed timing breakdown */
  timingBreakdown?: ChunkingTimingBreakdown;
}

/**
 * Timing breakdown for chunked extraction
 */
export interface ChunkingTimingBreakdown {
  /** Time spent chunking the conversation */
  chunking: number;
  
  /** Time spent extracting from all chunks */
  extraction: number;
  
  /** Time spent deduplicating across chunks */
  deduplication: number;
  
  /** Total time */
  total: number;
}

/**
 * Metadata about chunking for logging and monitoring
 */
export interface ChunkingMetadata {
  /** Whether chunking was enabled */
  enabled: boolean;
  
  /** Strategy used */
  strategy: string;
  
  /** Total number of chunks created */
  totalChunks: number;
  
  /** Total tokens in conversation */
  totalTokens: number;
  
  /** Average tokens per chunk */
  averageTokensPerChunk: number;
  
  /** Overlap tokens between chunks */
  overlapTokens: number;
  
  /** Processing time breakdown */
  processingTime: ChunkingTimingBreakdown;
}
