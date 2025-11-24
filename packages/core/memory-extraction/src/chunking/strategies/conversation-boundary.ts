/**
 * Conversation boundary chunking strategy
 * 
 * Splits conversations at natural break points (user messages, topic transitions).
 * Falls back to sliding window if no suitable boundaries exist.
 */

import type { NormalizedConversation, NormalizedMessage } from '../../types.js';
import { BaseChunkingStrategy } from './base.js';
import { SlidingWindowStrategy } from './sliding-window.js';
import type { ChunkingConfig, ConversationChunk } from '../types.js';

/**
 * Represents a potential boundary point in a conversation
 */
interface BoundaryPoint {
  /** Index of the message after the boundary */
  messageIndex: number;
  /** Score indicating how good this boundary is (higher is better) */
  score: number;
  /** Reason for this boundary */
  reason: string;
}

/**
 * Conversation boundary chunking strategy
 * 
 * Identifies natural break points in conversations and splits at those points.
 * Prefers user messages as split points and considers timestamp gaps.
 */
export class ConversationBoundaryStrategy extends BaseChunkingStrategy {
  readonly name = 'conversation-boundary';
  private slidingWindowFallback: SlidingWindowStrategy;

  constructor(tokenCounter: any) {
    super(tokenCounter);
    this.slidingWindowFallback = new SlidingWindowStrategy(tokenCounter);
  }

  /**
   * Split a conversation into chunks at natural boundaries
   * 
   * Algorithm:
   * 1. Identify potential split points (user messages, timestamp gaps)
   * 2. Score each split point based on context continuity
   * 3. Select split points that create balanced chunks
   * 4. Ensure chunks don't exceed max size
   * 5. Fall back to sliding window if no suitable boundaries exist
   * 
   * @param conversation - The conversation to chunk
   * @param config - Chunking configuration
   * @returns Array of conversation chunks
   */
  chunk(
    conversation: NormalizedConversation,
    config: ChunkingConfig
  ): ConversationChunk[] {
    // Validate configuration
    this.validateConfig(config);

    // Handle empty conversation
    if (!conversation.messages || conversation.messages.length === 0) {
      return [];
    }

    // Identify all potential boundaries
    const boundaries = this.identifyBoundaries(conversation, config);

    // If no suitable boundaries found, fall back to sliding window
    if (boundaries.length === 0) {
      return this.slidingWindowFallback.chunk(conversation, config);
    }

    // Select optimal boundaries to create chunks
    const selectedBoundaries = this.selectBoundaries(
      conversation,
      boundaries,
      config
    );

    // If no boundaries were selected, fall back to sliding window
    if (selectedBoundaries.length === 0) {
      return this.slidingWindowFallback.chunk(conversation, config);
    }

    // Create chunks from selected boundaries
    const chunks = this.createChunksFromBoundaries(
      conversation,
      selectedBoundaries,
      config
    );

    return chunks;
  }

  /**
   * Identify potential boundary points in the conversation
   * 
   * @param conversation - The conversation to analyze
   * @param config - Chunking configuration
   * @returns Array of potential boundary points
   */
  private identifyBoundaries(
    conversation: NormalizedConversation,
    config: ChunkingConfig
  ): BoundaryPoint[] {
    const boundaries: BoundaryPoint[] = [];
    const messages = conversation.messages;

    // Don't create boundaries for very short conversations
    if (messages.length < 3) {
      return boundaries;
    }

    // Analyze each message as a potential boundary point
    for (let i = 1; i < messages.length; i++) {
      const currentMessage = messages[i];
      const previousMessage = messages[i - 1];

      // Score this boundary point
      const score = this.scoreBoundary(
        currentMessage,
        previousMessage,
        i,
        messages,
        config
      );

      // Only consider boundaries with positive scores
      if (score > 0) {
        boundaries.push({
          messageIndex: i,
          score,
          reason: this.getBoundaryReason(currentMessage, previousMessage),
        });
      }
    }

    // Sort boundaries by score (highest first)
    boundaries.sort((a, b) => b.score - a.score);

    return boundaries;
  }

  /**
   * Score a potential boundary point
   * Higher scores indicate better boundaries
   * 
   * @param currentMessage - The message after the boundary
   * @param previousMessage - The message before the boundary
   * @param index - Index of the current message
   * @param allMessages - All messages in the conversation
   * @param config - Chunking configuration
   * @returns Boundary score (0-100)
   */
  private scoreBoundary(
    currentMessage: NormalizedMessage,
    previousMessage: NormalizedMessage,
    index: number,
    allMessages: NormalizedMessage[],
    config: ChunkingConfig
  ): number {
    let score = 0;

    // Prefer user messages as boundaries (strong signal)
    if (currentMessage.role === 'user') {
      score += 50;
    }

    // Consider timestamp gaps (if available)
    if (currentMessage.timestamp && previousMessage.timestamp) {
      const timeDiff = this.calculateTimeDifference(
        previousMessage.timestamp,
        currentMessage.timestamp
      );

      // Gaps > 5 minutes are good boundaries
      if (timeDiff > 5 * 60 * 1000) {
        score += 30;
      }
      // Gaps > 1 minute are decent boundaries
      else if (timeDiff > 60 * 1000) {
        score += 15;
      }
    }

    // Avoid boundaries too close to the start or end
    const distanceFromStart = index;
    const distanceFromEnd = allMessages.length - index;
    const minDistance = Math.min(3, Math.floor(allMessages.length * 0.1));

    if (distanceFromStart < minDistance || distanceFromEnd < minDistance) {
      score = Math.floor(score * 0.5); // Reduce score by 50%
    }

    return score;
  }

  /**
   * Get a human-readable reason for a boundary
   * 
   * @param currentMessage - The message after the boundary
   * @param previousMessage - The message before the boundary
   * @returns Reason string
   */
  private getBoundaryReason(
    currentMessage: NormalizedMessage,
    previousMessage: NormalizedMessage
  ): string {
    const reasons: string[] = [];

    if (currentMessage.role === 'user') {
      reasons.push('user message');
    }

    if (currentMessage.timestamp && previousMessage.timestamp) {
      const timeDiff = this.calculateTimeDifference(
        previousMessage.timestamp,
        currentMessage.timestamp
      );

      if (timeDiff > 5 * 60 * 1000) {
        reasons.push('large time gap');
      } else if (timeDiff > 60 * 1000) {
        reasons.push('time gap');
      }
    }

    return reasons.length > 0 ? reasons.join(', ') : 'natural break';
  }

  /**
   * Calculate time difference between two timestamps in milliseconds
   * 
   * @param timestamp1 - First timestamp (ISO string)
   * @param timestamp2 - Second timestamp (ISO string)
   * @returns Time difference in milliseconds
   */
  private calculateTimeDifference(timestamp1: string, timestamp2: string): number {
    try {
      const date1 = new Date(timestamp1);
      const date2 = new Date(timestamp2);
      return Math.abs(date2.getTime() - date1.getTime());
    } catch (error) {
      return 0;
    }
  }

  /**
   * Select optimal boundaries to create balanced chunks
   * 
   * @param conversation - The conversation
   * @param boundaries - All potential boundaries
   * @param config - Chunking configuration
   * @returns Selected boundary points
   */
  private selectBoundaries(
    conversation: NormalizedConversation,
    boundaries: BoundaryPoint[],
    config: ChunkingConfig
  ): BoundaryPoint[] {
    const selected: BoundaryPoint[] = [];
    const messages = conversation.messages;
    const minChunkSize = this.calculateMinChunkSize(config);

    let lastBoundaryIndex = 0;
    let currentTokens = 0;

    // Try to select boundaries that create chunks within size limits
    for (const boundary of boundaries) {
      // Calculate tokens from last boundary to this one
      const segmentMessages = messages.slice(lastBoundaryIndex, boundary.messageIndex);
      const segmentTokens = this.countMessagesTokens(segmentMessages, config);

      // Check if this segment would be a valid chunk
      if (segmentTokens >= minChunkSize && segmentTokens <= config.maxTokensPerChunk) {
        selected.push(boundary);
        lastBoundaryIndex = boundary.messageIndex;
        currentTokens = 0;
      } else if (currentTokens + segmentTokens > config.maxTokensPerChunk) {
        // This segment is too large, we need to split here even if not ideal
        selected.push(boundary);
        lastBoundaryIndex = boundary.messageIndex;
        currentTokens = 0;
      } else {
        // Keep accumulating
        currentTokens += segmentTokens;
      }
    }

    return selected;
  }

  /**
   * Create chunks from selected boundary points
   * 
   * @param conversation - The conversation
   * @param boundaries - Selected boundary points
   * @param config - Chunking configuration
   * @returns Array of conversation chunks
   */
  private createChunksFromBoundaries(
    conversation: NormalizedConversation,
    boundaries: BoundaryPoint[],
    config: ChunkingConfig
  ): ConversationChunk[] {
    const chunks: ConversationChunk[] = [];
    const messages = conversation.messages;
    const overlapTokens = this.calculateOverlapTokens(config);

    let startIndex = 0;

    // Create chunks between boundaries
    for (let i = 0; i <= boundaries.length; i++) {
      const endIndex = i < boundaries.length ? boundaries[i].messageIndex : messages.length;
      
      // Get messages for this chunk
      const chunkMessages = messages.slice(startIndex, endIndex);
      
      if (chunkMessages.length === 0) {
        continue;
      }

      // Calculate token count
      const tokenCount = this.countMessagesTokens(chunkMessages, config);

      // Calculate overlap with previous chunk
      const overlapWithPrevious = i > 0 ? this.calculateOverlapWithPrevious(
        chunks[chunks.length - 1],
        chunkMessages,
        config
      ) : 0;

      const overlapTokensWithPrevious = i > 0 ? this.calculateOverlapTokensWithPrevious(
        chunks[chunks.length - 1],
        chunkMessages,
        config
      ) : 0;

      // Calculate overlap with next chunk (will be updated in next iteration)
      const overlapMessages = this.calculateOverlapMessages(
        chunkMessages,
        overlapTokens,
        config
      );

      const overlapTokensWithNext = this.calculateOverlapTokenCount(
        overlapMessages,
        config
      );

      // Create chunk
      const chunk = this.createChunk({
        conversationId: conversation.id,
        sequence: chunks.length + 1,
        totalChunks: boundaries.length + 1, // Will be updated later
        messages: chunkMessages,
        tokenCount,
        overlapWithPrevious,
        overlapWithNext: 0, // Will be updated in next iteration
        overlapTokensWithPrevious,
        overlapTokensWithNext: 0, // Will be updated in next iteration
        startMessageIndex: startIndex,
        endMessageIndex: endIndex - 1,
        strategyName: this.name,
      });

      chunks.push(chunk);

      // Update previous chunk's overlapWithNext
      if (chunks.length > 1) {
        const prevChunk = chunks[chunks.length - 2];
        prevChunk.overlapWithNext = overlapWithPrevious;
        prevChunk.overlapTokensWithNext = overlapTokensWithPrevious;
      }

      startIndex = endIndex;
    }

    // Update totalChunks for all chunks
    const totalChunks = chunks.length;
    for (const chunk of chunks) {
      (chunk as any).totalChunks = totalChunks;
    }

    return chunks;
  }

  /**
   * Calculate overlap message count with previous chunk
   * 
   * @param previousChunk - The previous chunk
   * @param currentMessages - Messages in current chunk
   * @param config - Chunking configuration
   * @returns Number of overlapping messages
   */
  private calculateOverlapWithPrevious(
    previousChunk: ConversationChunk,
    currentMessages: NormalizedMessage[],
    config: ChunkingConfig
  ): number {
    let overlapCount = 0;
    const prevMessages = previousChunk.messages;

    // Count how many messages from the end of previous chunk appear at start of current
    for (let i = 0; i < Math.min(prevMessages.length, currentMessages.length); i++) {
      const prevMsg = prevMessages[prevMessages.length - 1 - i];
      const currMsg = currentMessages[i];

      if (prevMsg.id === currMsg.id) {
        overlapCount++;
      } else {
        break;
      }
    }

    return overlapCount;
  }

  /**
   * Calculate overlap token count with previous chunk
   * 
   * @param previousChunk - The previous chunk
   * @param currentMessages - Messages in current chunk
   * @param config - Chunking configuration
   * @returns Number of overlapping tokens
   */
  private calculateOverlapTokensWithPrevious(
    previousChunk: ConversationChunk,
    currentMessages: NormalizedMessage[],
    config: ChunkingConfig
  ): number {
    const overlapCount = this.calculateOverlapWithPrevious(
      previousChunk,
      currentMessages,
      config
    );

    if (overlapCount === 0) {
      return 0;
    }

    const overlapMessages = currentMessages.slice(0, overlapCount);
    return this.countMessagesTokens(overlapMessages, config);
  }

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
  ): boolean {
    // Use base validation
    if (!super.canHandle(conversation, config)) {
      return false;
    }

    // Conversation boundary can handle any conversation that passes base validation
    // It will fall back to sliding window if needed
    return true;
  }
}
