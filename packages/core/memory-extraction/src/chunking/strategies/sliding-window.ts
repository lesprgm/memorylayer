/**
 * Sliding window chunking strategy
 * 
 * Splits conversations into overlapping chunks using a sliding window approach.
 * Ensures message boundaries are preserved and maintains chronological order.
 */

import type { NormalizedConversation, NormalizedMessage } from '../../types.js';
import { BaseChunkingStrategy } from './base.js';
import type { ChunkingConfig, ConversationChunk } from '../types.js';

/**
 * Sliding window chunking strategy
 * 
 * Creates chunks of configurable maximum size with configurable overlap.
 * Messages are never split mid-content - only complete messages are included.
 */
export class SlidingWindowStrategy extends BaseChunkingStrategy {
  readonly name = 'sliding-window';

  /**
   * Split a conversation into chunks using sliding window approach
   * 
   * Algorithm:
   * 1. Calculate target chunk size (maxTokensPerChunk - overlap)
   * 2. Start from first message
   * 3. Add messages until target size reached
   * 4. Create chunk with overlap from previous chunk
   * 5. Move window forward by (chunk size - overlap)
   * 6. Repeat until all messages processed
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

    const chunks: ConversationChunk[] = [];
    const overlapTokens = this.calculateOverlapTokens(config);
    const minChunkSize = this.calculateMinChunkSize(config);
    
    let currentIndex = 0;
    let overlapMessages: NormalizedMessage[] = [];
    let chunkSequence = 1;

    // First pass: create all chunks
    while (currentIndex < conversation.messages.length) {
      const chunkMessages: NormalizedMessage[] = [];
      let chunkTokenCount = 0;
      const overlapCount = overlapMessages.length;

      // Add overlap messages from previous chunk
      if (overlapMessages.length > 0) {
        chunkMessages.push(...overlapMessages);
        chunkTokenCount = this.countMessagesTokens(overlapMessages, config);
      }
      
      const startMessageIndex = currentIndex;

      // Add new messages until we reach max chunk size
      while (currentIndex < conversation.messages.length) {
        const message = conversation.messages[currentIndex];
        const messageTokens = this.countMessageTokens(message, config);

        // Check if adding this message would exceed max chunk size
        if (chunkMessages.length > 0 && chunkTokenCount + messageTokens > config.maxTokensPerChunk) {
          // Don't add this message, we've reached the chunk limit
          break;
        }

        // Add the message to the chunk
        chunkMessages.push(message);
        chunkTokenCount += messageTokens;
        currentIndex++;

        // If this is the last message, we're done
        if (currentIndex >= conversation.messages.length) {
          break;
        }
      }

      // Ensure chunk meets minimum size requirement (except for the last chunk)
      if (chunkTokenCount < minChunkSize && currentIndex < conversation.messages.length) {
        // Try to add more messages to meet minimum size
        while (currentIndex < conversation.messages.length && chunkTokenCount < minChunkSize) {
          const message = conversation.messages[currentIndex];
          const messageTokens = this.countMessageTokens(message, config);
          
          // Only add if it doesn't exceed max size
          if (chunkTokenCount + messageTokens <= config.maxTokensPerChunk) {
            chunkMessages.push(message);
            chunkTokenCount += messageTokens;
            currentIndex++;
          } else {
            break;
          }
        }
      }

      // Calculate overlap for next chunk
      const nextOverlapMessages = this.calculateOverlapMessages(
        chunkMessages,
        overlapTokens,
        config
      );

      // Calculate token count of overlap with next chunk
      const nextOverlapTokenCount = this.calculateOverlapTokenCount(
        nextOverlapMessages,
        config
      );

      // Calculate token count of overlap with previous chunk
      const previousOverlapTokenCount = overlapMessages.length > 0
        ? this.calculateOverlapTokenCount(overlapMessages, config)
        : 0;

      // Store chunk (we'll set totalChunks and overlapWithNext in second pass)
      chunks.push({
        chunk: chunkMessages,
        tokenCount: chunkTokenCount,
        overlapMessages: nextOverlapMessages,
        overlapTokensWithNext: nextOverlapTokenCount,
        startMessageIndex,
        endMessageIndex: currentIndex - 1,
        overlapWithPrevious: overlapCount,
        overlapTokensWithPrevious: previousOverlapTokenCount,
      } as any); // Temporary structure

      // Prepare overlap for next iteration
      overlapMessages = nextOverlapMessages;
      chunkSequence++;
    }

    // Second pass: create final chunk objects with complete metadata
    const totalChunks = chunks.length;
    const finalChunks: ConversationChunk[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const tempChunk = chunks[i] as any;
      const overlapWithNext = i < chunks.length - 1 ? tempChunk.overlapMessages.length : 0;
      const overlapTokensWithNext = i < chunks.length - 1 ? tempChunk.overlapTokensWithNext : 0;

      const chunk = this.createChunk({
        conversationId: conversation.id,
        sequence: i + 1,
        totalChunks,
        messages: tempChunk.chunk,
        tokenCount: tempChunk.tokenCount,
        overlapWithPrevious: tempChunk.overlapWithPrevious,
        overlapWithNext,
        overlapTokensWithPrevious: tempChunk.overlapTokensWithPrevious,
        overlapTokensWithNext,
        startMessageIndex: tempChunk.startMessageIndex,
        endMessageIndex: tempChunk.endMessageIndex,
        strategyName: this.name,
      });

      finalChunks.push(chunk);
    }

    return finalChunks;
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

    // Sliding window can handle any conversation that passes base validation
    return true;
  }
}
