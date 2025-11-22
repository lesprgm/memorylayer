/**
 * StreamingConversationBuilder for incremental conversation assembly
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
 */

import { randomUUID } from 'crypto';
import { NormalizedConversation, NormalizedMessage } from './types';
import { ConversationParser } from './parsers/base';

/**
 * Chunk of streaming data from API responses
 * Requirements: 6.1, 6.4
 */
export interface StreamChunk {
  /** Message ID (if provided by the stream) */
  messageId?: string;
  /** Message role */
  role?: 'user' | 'assistant' | 'system';
  /** Content delta to append */
  contentDelta?: string;
  /** Whether this message is complete */
  isComplete?: boolean;
}

/**
 * Current state of the conversation builder
 * Requirements: 6.3
 */
export interface ConversationState {
  /** Conversation identifier */
  conversationId: string;
  /** Number of messages in the conversation */
  messageCount: number;
  /** Whether the conversation has been finalized */
  isFinalized: boolean;
  /** Current message being assembled (if any) */
  currentMessage: Partial<NormalizedMessage> | null;
}

/**
 * Builder for assembling conversations incrementally from streaming data
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
 */
export class StreamingConversationBuilder {
  private readonly provider: string;
  private readonly conversationId: string;
  private readonly parser: ConversationParser;
  private readonly messages: NormalizedMessage[] = [];
  private currentMessage: Partial<NormalizedMessage> | null = null;
  private finalized: boolean = false;
  private conversationMetadata: Record<string, any> = {};

  /**
   * Create a new streaming conversation builder
   * Requirements: 6.1, 6.2
   * @param provider - Provider identifier (e.g., 'openai', 'anthropic')
   * @param conversationId - Unique conversation identifier
   * @param parser - Parser instance for the provider
   */
  constructor(
    provider: string,
    conversationId: string,
    parser: ConversationParser
  ) {
    this.provider = provider;
    this.conversationId = conversationId;
    this.parser = parser;
  }

  /**
   * Add a streaming chunk to the conversation
   * Requirements: 6.3, 6.4, 6.7, 7.1, 7.5
   * @param chunk - Streaming chunk data
   */
  addChunk(chunk: StreamChunk): void {
    if (this.finalized) {
      // Requirement 7.1: Return typed errors
      // Requirement 7.5: Add context to all error messages
      throw new Error(
        `Cannot add chunks to a finalized conversation (provider: ${this.provider}, conversationId: ${this.conversationId})`
      );
    }

    try {
      // If no current message, start a new one
      if (!this.currentMessage) {
        this.currentMessage = {
          id: chunk.messageId || randomUUID(),
          role: chunk.role || 'assistant',
          content: '',
          created_at: new Date().toISOString(),
          raw_metadata: {},
        };
      }

      // Update role if provided
      if (chunk.role) {
        this.currentMessage.role = chunk.role;
      }

      // Append content delta
      if (chunk.contentDelta) {
        this.currentMessage.content = (this.currentMessage.content || '') + chunk.contentDelta;
      }

      // Update message ID if provided
      if (chunk.messageId && !this.currentMessage.id) {
        this.currentMessage.id = chunk.messageId;
      }

      // If message is complete, finalize it
      if (chunk.isComplete) {
        this.finalizeCurrentMessage();
      }
    } catch (error) {
      // Requirement 7.5: Add context to all error messages
      throw new Error(
        `Failed to add chunk to streaming conversation (provider: ${this.provider}, conversationId: ${this.conversationId}): ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Add a complete message to the conversation
   * Requirements: 6.3, 7.1, 7.5
   * @param message - Partial message data (will be normalized)
   */
  addMessage(message: Partial<NormalizedMessage>): void {
    if (this.finalized) {
      // Requirement 7.1: Return typed errors
      // Requirement 7.5: Add context to all error messages
      throw new Error(
        `Cannot add messages to a finalized conversation (provider: ${this.provider}, conversationId: ${this.conversationId})`
      );
    }

    try {
      // Finalize any current streaming message first
      if (this.currentMessage) {
        this.finalizeCurrentMessage();
      }

      // Create a complete normalized message
      const normalizedMessage: NormalizedMessage = {
        id: message.id || randomUUID(),
        role: message.role || 'assistant',
        content: message.content || '',
        created_at: message.created_at || new Date().toISOString(),
        raw_metadata: message.raw_metadata || {},
      };

      this.messages.push(normalizedMessage);
    } catch (error) {
      // Requirement 7.5: Add context to all error messages
      throw new Error(
        `Failed to add message to streaming conversation (provider: ${this.provider}, conversationId: ${this.conversationId}): ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Finalize the current streaming message and add it to the messages array
   */
  private finalizeCurrentMessage(): void {
    if (!this.currentMessage) {
      return;
    }

    // Ensure all required fields are present
    const message: NormalizedMessage = {
      id: this.currentMessage.id || randomUUID(),
      role: this.currentMessage.role || 'assistant',
      content: this.currentMessage.content || '',
      created_at: this.currentMessage.created_at || new Date().toISOString(),
      raw_metadata: this.currentMessage.raw_metadata || {},
    };

    this.messages.push(message);
    this.currentMessage = null;
  }

  /**
   * Finalize the conversation and return the normalized conversation
   * Requirements: 6.5, 6.6, 7.1, 7.5
   * @param metadata - Optional additional metadata for the conversation
   * @returns Complete normalized conversation
   */
  finalize(metadata?: Record<string, any>): NormalizedConversation {
    if (this.finalized) {
      // Requirement 7.1: Return typed errors
      // Requirement 7.5: Add context to all error messages
      throw new Error(
        `Conversation has already been finalized (provider: ${this.provider}, conversationId: ${this.conversationId})`
      );
    }

    try {
      // Finalize any remaining streaming message
      if (this.currentMessage) {
        this.finalizeCurrentMessage();
      }

      // Merge provided metadata with existing metadata
      if (metadata) {
        this.conversationMetadata = { ...this.conversationMetadata, ...metadata };
      }

      // Determine timestamps
      const now = new Date().toISOString();
      const created_at = this.messages.length > 0 
        ? this.messages[0].created_at 
        : now;
      const updated_at = this.messages.length > 0 
        ? this.messages[this.messages.length - 1].created_at 
        : now;

      // Create the normalized conversation
      const conversation: NormalizedConversation = {
        id: randomUUID(),
        provider: this.provider,
        external_id: this.conversationId,
        title: this.conversationMetadata.title || null,
        created_at,
        updated_at,
        messages: [...this.messages],
        raw_metadata: this.conversationMetadata,
      };

      this.finalized = true;
      return conversation;
    } catch (error) {
      // Requirement 7.5: Add context to all error messages
      throw new Error(
        `Failed to finalize streaming conversation (provider: ${this.provider}, conversationId: ${this.conversationId}): ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Get the current state of the builder
   * Requirements: 6.3
   * @returns Current conversation state
   */
  getState(): ConversationState {
    return {
      conversationId: this.conversationId,
      messageCount: this.messages.length,
      isFinalized: this.finalized,
      currentMessage: this.currentMessage ? { ...this.currentMessage } : null,
    };
  }
}
