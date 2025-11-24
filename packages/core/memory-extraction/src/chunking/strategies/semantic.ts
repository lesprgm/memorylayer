/**
 * Semantic chunking strategy
 * 
 * Splits conversations based on topic coherence using keyword analysis.
 * Identifies topic shifts and creates chunks at low-similarity boundaries.
 */

import type { NormalizedConversation, NormalizedMessage } from '../../types.js';
import { BaseChunkingStrategy } from './base.js';
import { SlidingWindowStrategy } from './sliding-window.js';
import type { ChunkingConfig, ConversationChunk } from '../types.js';

/**
 * Represents keywords extracted from a message
 */
interface MessageKeywords {
  /** Index of the message */
  messageIndex: number;
  /** Extracted keywords with their frequencies */
  keywords: Map<string, number>;
  /** Total keyword count */
  totalKeywords: number;
}

/**
 * Represents a potential topic boundary
 */
interface TopicBoundary {
  /** Index of the message after the boundary */
  messageIndex: number;
  /** Similarity score with previous segment (0-1, lower means more different) */
  similarity: number;
  /** Whether this is a strong topic shift */
  isStrongShift: boolean;
}

/**
 * Semantic chunking strategy
 * 
 * Analyzes message content to identify topic shifts and creates chunks
 * that maintain topical coherence while respecting size limits.
 */
export class SemanticStrategy extends BaseChunkingStrategy {
  readonly name = 'semantic';
  private slidingWindowFallback: SlidingWindowStrategy;

  // Common stop words to filter out (English)
  private readonly stopWords = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
    'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
    'to', 'was', 'will', 'with', 'i', 'you', 'we', 'they', 'this',
    'can', 'could', 'would', 'should', 'do', 'does', 'did', 'have',
    'had', 'but', 'or', 'if', 'then', 'so', 'what', 'when', 'where',
    'who', 'which', 'how', 'there', 'their', 'them', 'these', 'those',
  ]);

  constructor(tokenCounter: any) {
    super(tokenCounter);
    this.slidingWindowFallback = new SlidingWindowStrategy(tokenCounter);
  }

  /**
   * Split a conversation into chunks based on semantic similarity
   * 
   * Algorithm:
   * 1. Extract keywords from each message
   * 2. Calculate keyword overlap between adjacent messages
   * 3. Identify low-similarity boundaries (topic shifts)
   * 4. Create chunks at topic boundaries
   * 5. Ensure chunks respect size limits
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

    // For very short conversations, use sliding window
    if (conversation.messages.length < 5) {
      return this.slidingWindowFallback.chunk(conversation, config);
    }

    // Extract keywords from all messages
    const messageKeywords = this.extractKeywordsFromMessages(conversation.messages);

    // Identify topic boundaries
    const boundaries = this.identifyTopicBoundaries(messageKeywords, config);

    // If no clear boundaries found, fall back to sliding window
    if (boundaries.length === 0) {
      return this.slidingWindowFallback.chunk(conversation, config);
    }

    // Create chunks from boundaries while respecting size limits
    const chunks = this.createChunksFromBoundaries(
      conversation,
      boundaries,
      config
    );

    return chunks;
  }

  /**
   * Extract keywords from all messages in the conversation
   * 
   * @param messages - Messages to analyze
   * @returns Array of message keywords
   */
  private extractKeywordsFromMessages(
    messages: NormalizedMessage[]
  ): MessageKeywords[] {
    return messages.map((message, index) => ({
      messageIndex: index,
      ...this.extractKeywords(message),
    }));
  }

  /**
   * Extract keywords from a single message
   * Uses simple word frequency analysis with stop word filtering
   * 
   * @param message - Message to analyze
   * @returns Keywords and their frequencies
   */
  private extractKeywords(message: NormalizedMessage): {
    keywords: Map<string, number>;
    totalKeywords: number;
  } {
    const keywords = new Map<string, number>();
    
    // Combine all text content from the message
    let text = message.content || '';
    
    // Add text from metadata if available (some messages may have additional content)
    if (message.metadata && typeof message.metadata === 'object') {
      const metadataText = Object.values(message.metadata)
        .filter(v => typeof v === 'string')
        .join(' ');
      if (metadataText) {
        text += ' ' + metadataText;
      }
    }

    // Tokenize: convert to lowercase, split on non-word characters
    const words = text
      .toLowerCase()
      .split(/\W+/)
      .filter(word => word.length > 2); // Filter out very short words

    let totalKeywords = 0;

    // Count word frequencies, excluding stop words
    for (const word of words) {
      if (!this.stopWords.has(word)) {
        keywords.set(word, (keywords.get(word) || 0) + 1);
        totalKeywords++;
      }
    }

    return { keywords, totalKeywords };
  }

  /**
   * Calculate keyword overlap (similarity) between two sets of keywords
   * Uses Jaccard similarity coefficient
   * 
   * @param keywords1 - First set of keywords
   * @param keywords2 - Second set of keywords
   * @returns Similarity score (0-1, higher means more similar)
   */
  private calculateKeywordSimilarity(
    keywords1: Map<string, number>,
    keywords2: Map<string, number>
  ): number {
    // Handle empty keyword sets
    if (keywords1.size === 0 || keywords2.size === 0) {
      return 0;
    }

    // Calculate intersection and union
    const allKeys = new Set([...keywords1.keys(), ...keywords2.keys()]);
    let intersection = 0;
    let union = 0;

    for (const key of allKeys) {
      const freq1 = keywords1.get(key) || 0;
      const freq2 = keywords2.get(key) || 0;
      
      // Use minimum for intersection, maximum for union
      intersection += Math.min(freq1, freq2);
      union += Math.max(freq1, freq2);
    }

    // Jaccard similarity: intersection / union
    return union > 0 ? intersection / union : 0;
  }

  /**
   * Identify topic boundaries by analyzing keyword similarity
   * 
   * @param messageKeywords - Keywords for all messages
   * @param config - Chunking configuration
   * @returns Array of topic boundaries
   */
  private identifyTopicBoundaries(
    messageKeywords: MessageKeywords[],
    config: ChunkingConfig
  ): TopicBoundary[] {
    const boundaries: TopicBoundary[] = [];
    
    // Need at least 2 messages to find boundaries
    if (messageKeywords.length < 2) {
      return boundaries;
    }

    // Analyze similarity between adjacent message windows
    const windowSize = 3; // Compare groups of 3 messages
    
    for (let i = windowSize; i < messageKeywords.length; i++) {
      // Get keywords for previous window
      const prevWindow = this.mergeKeywords(
        messageKeywords.slice(Math.max(0, i - windowSize), i)
      );
      
      // Get keywords for current window
      const currWindow = this.mergeKeywords(
        messageKeywords.slice(i, Math.min(i + windowSize, messageKeywords.length))
      );
      
      // Calculate similarity
      const similarity = this.calculateKeywordSimilarity(
        prevWindow,
        currWindow
      );
      
      // Low similarity indicates a topic shift
      // Threshold: < 0.3 is strong shift, < 0.5 is moderate shift
      const isStrongShift = similarity < 0.3;
      const isModerateShift = similarity < 0.5;
      
      if (isStrongShift || isModerateShift) {
        boundaries.push({
          messageIndex: i,
          similarity,
          isStrongShift,
        });
      }
    }

    // Sort by similarity (lowest first = strongest topic shifts)
    boundaries.sort((a, b) => a.similarity - b.similarity);

    return boundaries;
  }

  /**
   * Merge keywords from multiple messages
   * 
   * @param messageKeywords - Array of message keywords to merge
   * @returns Combined keyword map
   */
  private mergeKeywords(messageKeywords: MessageKeywords[]): Map<string, number> {
    const merged = new Map<string, number>();
    
    for (const mk of messageKeywords) {
      for (const [word, freq] of mk.keywords) {
        merged.set(word, (merged.get(word) || 0) + freq);
      }
    }
    
    return merged;
  }

  /**
   * Create chunks from topic boundaries while respecting size limits
   * 
   * @param conversation - The conversation
   * @param boundaries - Topic boundaries
   * @param config - Chunking configuration
   * @returns Array of conversation chunks
   */
  private createChunksFromBoundaries(
    conversation: NormalizedConversation,
    boundaries: TopicBoundary[],
    config: ChunkingConfig
  ): ConversationChunk[] {
    const chunks: ConversationChunk[] = [];
    const messages = conversation.messages;
    const minChunkSize = this.calculateMinChunkSize(config);
    const overlapTokens = this.calculateOverlapTokens(config);

    let startIndex = 0;
    let currentTokens = 0;
    let selectedBoundaries: number[] = [0]; // Start with first message

    // Select boundaries that create valid chunks
    for (const boundary of boundaries) {
      const segmentMessages = messages.slice(startIndex, boundary.messageIndex);
      const segmentTokens = this.countMessagesTokens(segmentMessages, config);

      // Check if this segment would be a valid chunk
      if (segmentTokens >= minChunkSize && segmentTokens <= config.maxTokensPerChunk) {
        selectedBoundaries.push(boundary.messageIndex);
        startIndex = boundary.messageIndex;
        currentTokens = 0;
      } else if (currentTokens + segmentTokens > config.maxTokensPerChunk) {
        // Segment is too large, need to split here
        selectedBoundaries.push(boundary.messageIndex);
        startIndex = boundary.messageIndex;
        currentTokens = 0;
      } else {
        // Keep accumulating
        currentTokens += segmentTokens;
      }
    }

    // Add final boundary if needed
    if (startIndex < messages.length) {
      selectedBoundaries.push(messages.length);
    }

    // Create chunks from selected boundaries
    for (let i = 0; i < selectedBoundaries.length - 1; i++) {
      const chunkStart = selectedBoundaries[i];
      const chunkEnd = selectedBoundaries[i + 1];
      
      const chunkMessages = messages.slice(chunkStart, chunkEnd);
      
      if (chunkMessages.length === 0) {
        continue;
      }

      // Calculate token count
      const tokenCount = this.countMessagesTokens(chunkMessages, config);

      // If chunk exceeds max size, split it using sliding window
      if (tokenCount > config.maxTokensPerChunk) {
        const subChunks = this.splitLargeChunk(
          conversation,
          chunkStart,
          chunkEnd,
          config,
          chunks.length + 1
        );
        chunks.push(...subChunks);
        continue;
      }

      // Calculate overlap with previous chunk
      const overlapWithPrevious = i > 0 ? this.calculateOverlapCount(
        chunks[chunks.length - 1].messages,
        chunkMessages
      ) : 0;

      const overlapTokensWithPrevious = i > 0 ? this.calculateOverlapTokensCount(
        chunks[chunks.length - 1].messages,
        chunkMessages,
        config
      ) : 0;

      // Calculate overlap messages for next chunk
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
        totalChunks: 0, // Will be updated later
        messages: chunkMessages,
        tokenCount,
        overlapWithPrevious,
        overlapWithNext: 0, // Will be updated in next iteration
        overlapTokensWithPrevious,
        overlapTokensWithNext: 0, // Will be updated in next iteration
        startMessageIndex: chunkStart,
        endMessageIndex: chunkEnd - 1,
        strategyName: this.name,
      });

      chunks.push(chunk);

      // Update previous chunk's overlapWithNext
      if (chunks.length > 1) {
        const prevChunk = chunks[chunks.length - 2];
        prevChunk.overlapWithNext = overlapWithPrevious;
        prevChunk.overlapTokensWithNext = overlapTokensWithPrevious;
      }
    }

    // Update totalChunks for all chunks
    const totalChunks = chunks.length;
    for (const chunk of chunks) {
      (chunk as any).totalChunks = totalChunks;
    }

    return chunks;
  }

  /**
   * Split a large chunk that exceeds max size using sliding window
   * 
   * @param conversation - The conversation
   * @param startIndex - Start index of the large chunk
   * @param endIndex - End index of the large chunk
   * @param config - Chunking configuration
   * @param startSequence - Starting sequence number for sub-chunks
   * @returns Array of sub-chunks
   */
  private splitLargeChunk(
    conversation: NormalizedConversation,
    startIndex: number,
    endIndex: number,
    config: ChunkingConfig,
    startSequence: number
  ): ConversationChunk[] {
    // Create a temporary conversation with just these messages
    const tempConversation: NormalizedConversation = {
      ...conversation,
      messages: conversation.messages.slice(startIndex, endIndex),
    };

    // Use sliding window to split
    const subChunks = this.slidingWindowFallback.chunk(tempConversation, config);

    // Adjust sequence numbers and message indices
    return subChunks.map((chunk, index) => ({
      ...chunk,
      sequence: startSequence + index,
      metadata: {
        ...chunk.metadata,
        startMessageIndex: chunk.metadata.startMessageIndex + startIndex,
        endMessageIndex: chunk.metadata.endMessageIndex + startIndex,
        chunkingStrategy: `${this.name} (fallback to sliding-window)`,
      },
    }));
  }

  /**
   * Calculate overlap count between two message arrays
   * 
   * @param prevMessages - Messages from previous chunk
   * @param currMessages - Messages from current chunk
   * @returns Number of overlapping messages
   */
  private calculateOverlapCount(
    prevMessages: NormalizedMessage[],
    currMessages: NormalizedMessage[]
  ): number {
    let overlapCount = 0;

    // Count how many messages from the end of previous chunk appear at start of current
    for (let i = 0; i < Math.min(prevMessages.length, currMessages.length); i++) {
      const prevMsg = prevMessages[prevMessages.length - 1 - i];
      const currMsg = currMessages[i];

      if (prevMsg.id === currMsg.id) {
        overlapCount++;
      } else {
        break;
      }
    }

    return overlapCount;
  }

  /**
   * Calculate overlap token count between two message arrays
   * 
   * @param prevMessages - Messages from previous chunk
   * @param currMessages - Messages from current chunk
   * @param config - Chunking configuration
   * @returns Number of overlapping tokens
   */
  private calculateOverlapTokensCount(
    prevMessages: NormalizedMessage[],
    currMessages: NormalizedMessage[],
    config: ChunkingConfig
  ): number {
    const overlapCount = this.calculateOverlapCount(prevMessages, currMessages);

    if (overlapCount === 0) {
      return 0;
    }

    const overlapMessages = currMessages.slice(0, overlapCount);
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

    // Semantic strategy can handle any conversation that passes base validation
    // It will fall back to sliding window if needed
    return true;
  }
}
