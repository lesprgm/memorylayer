/**
 * Conversation validation logic
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

import { NormalizedConversation, NormalizedMessage } from './types.js';
import { ValidationError } from './errors.js';

/**
 * Result of validating a single conversation
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Result of validating multiple conversations
 */
export interface BatchValidationResult {
  validConversations: NormalizedConversation[];
  invalidConversations: Array<{
    conversation: NormalizedConversation;
    errors: ValidationError[];
  }>;
}

/**
 * Validates normalized conversations
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */
export class ConversationValidator {
  /**
   * Validate a single conversation
   * Requirements: 5.1, 5.2, 5.3, 5.4
   */
  validate(conversation: NormalizedConversation): ValidationResult {
    const errors: ValidationError[] = [];

    // Requirement 5.1: Validate that conversations have at least one message
    if (!conversation.messages || conversation.messages.length === 0) {
      errors.push({
        field: 'messages',
        message: 'Conversation must have at least one message',
        conversationId: conversation.id,
      });
    }

    // Requirement 5.2: Validate that all messages have required fields (role, content)
    if (conversation.messages && conversation.messages.length > 0) {
      for (const message of conversation.messages) {
        this.validateMessage(message, conversation.id, errors);
      }
    }

    // Requirement 5.3: Validate that timestamps are valid dates
    this.validateTimestamp(
      conversation.created_at,
      'created_at',
      conversation.id,
      errors
    );
    this.validateTimestamp(
      conversation.updated_at,
      'updated_at',
      conversation.id,
      errors
    );

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate multiple conversations
   * Requirements: 5.6
   */
  validateBatch(
    conversations: NormalizedConversation[]
  ): BatchValidationResult {
    const validConversations: NormalizedConversation[] = [];
    const invalidConversations: Array<{
      conversation: NormalizedConversation;
      errors: ValidationError[];
    }> = [];

    for (const conversation of conversations) {
      const result = this.validate(conversation);
      
      if (result.valid) {
        validConversations.push(conversation);
      } else {
        // Requirement 5.6: Clearly mark which conversations failed validation
        invalidConversations.push({
          conversation,
          errors: result.errors,
        });
      }
    }

    return {
      validConversations,
      invalidConversations,
    };
  }

  /**
   * Validate a single message
   * Requirement 5.2: Validate that all messages have required fields (role, content)
   */
  private validateMessage(
    message: NormalizedMessage,
    conversationId: string,
    errors: ValidationError[]
  ): void {
    // Check for required role field
    if (!message.role) {
      errors.push({
        field: 'role',
        message: 'Message must have a role',
        conversationId,
        messageId: message.id,
      });
    } else if (!['user', 'assistant', 'system'].includes(message.role)) {
      errors.push({
        field: 'role',
        message: `Invalid role: ${message.role}. Must be 'user', 'assistant', or 'system'`,
        conversationId,
        messageId: message.id,
      });
    }

    // Check for required content field
    if (message.content === undefined || message.content === null) {
      errors.push({
        field: 'content',
        message: 'Message must have content',
        conversationId,
        messageId: message.id,
      });
    }

    // Validate message timestamp
    if (message.created_at) {
      this.validateTimestamp(
        message.created_at,
        'created_at',
        conversationId,
        errors,
        message.id
      );
    }
  }

  /**
   * Validate that a timestamp is a valid ISO 8601 date
   * Requirement 5.3: Validate that timestamps are valid dates
   */
  private validateTimestamp(
    timestamp: string,
    field: string,
    conversationId: string,
    errors: ValidationError[],
    messageId?: string
  ): void {
    if (!timestamp) {
      errors.push({
        field,
        message: `${field} is required`,
        conversationId,
        messageId,
      });
      return;
    }

    // Check if it's a valid ISO 8601 date
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      errors.push({
        field,
        message: `${field} must be a valid ISO 8601 date, got: ${timestamp}`,
        conversationId,
        messageId,
      });
    }
  }
}
