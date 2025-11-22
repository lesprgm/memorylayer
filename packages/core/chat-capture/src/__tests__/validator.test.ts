/**
 * Tests for ConversationValidator
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationValidator } from '../validator.js';
import { NormalizedConversation, NormalizedMessage } from '../types.js';

describe('ConversationValidator', () => {
  let validator: ConversationValidator;

  beforeEach(() => {
    validator = new ConversationValidator();
  });

  // Helper to create a valid conversation
  const createValidConversation = (): NormalizedConversation => ({
    id: 'conv-123',
    provider: 'openai',
    external_id: 'ext-123',
    title: 'Test Conversation',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    messages: [
      {
        id: 'msg-1',
        role: 'user',
        content: 'Hello',
        created_at: '2024-01-01T00:00:00.000Z',
        raw_metadata: {},
      },
    ],
    raw_metadata: {},
  });

  describe('validate - valid conversations', () => {
    it('should validate a conversation with all required fields', () => {
      const conversation = createValidConversation();
      const result = validator.validate(conversation);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate a conversation with multiple messages', () => {
      const conversation = createValidConversation();
      conversation.messages.push({
        id: 'msg-2',
        role: 'assistant',
        content: 'Hi there!',
        created_at: '2024-01-01T00:01:00.000Z',
        raw_metadata: {},
      });

      const result = validator.validate(conversation);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate a conversation with system messages', () => {
      const conversation = createValidConversation();
      conversation.messages.push({
        id: 'msg-2',
        role: 'system',
        content: 'System message',
        created_at: '2024-01-01T00:01:00.000Z',
        raw_metadata: {},
      });

      const result = validator.validate(conversation);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate a conversation with empty string content', () => {
      const conversation = createValidConversation();
      conversation.messages[0].content = '';

      const result = validator.validate(conversation);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('validate - missing required fields', () => {
    it('should fail validation when messages array is empty (Requirement 5.1)', () => {
      const conversation = createValidConversation();
      conversation.messages = [];

      const result = validator.validate(conversation);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe('messages');
      expect(result.errors[0].message).toBe('Conversation must have at least one message');
      expect(result.errors[0].conversationId).toBe('conv-123');
    });

    it('should fail validation when messages array is missing (Requirement 5.1)', () => {
      const conversation = createValidConversation();
      (conversation as any).messages = undefined;

      const result = validator.validate(conversation);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe('messages');
    });

    it('should fail validation when message role is missing (Requirement 5.2)', () => {
      const conversation = createValidConversation();
      (conversation.messages[0] as any).role = undefined;

      const result = validator.validate(conversation);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe('role');
      expect(result.errors[0].message).toBe('Message must have a role');
      expect(result.errors[0].conversationId).toBe('conv-123');
      expect(result.errors[0].messageId).toBe('msg-1');
    });

    it('should fail validation when message content is missing (Requirement 5.2)', () => {
      const conversation = createValidConversation();
      (conversation.messages[0] as any).content = undefined;

      const result = validator.validate(conversation);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe('content');
      expect(result.errors[0].message).toBe('Message must have content');
      expect(result.errors[0].conversationId).toBe('conv-123');
      expect(result.errors[0].messageId).toBe('msg-1');
    });

    it('should fail validation when message content is null (Requirement 5.2)', () => {
      const conversation = createValidConversation();
      (conversation.messages[0] as any).content = null;

      const result = validator.validate(conversation);

      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('content');
    });

    it('should fail validation when message role is invalid (Requirement 5.2)', () => {
      const conversation = createValidConversation();
      (conversation.messages[0] as any).role = 'invalid-role';

      const result = validator.validate(conversation);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe('role');
      expect(result.errors[0].message).toContain('Invalid role');
      expect(result.errors[0].conversationId).toBe('conv-123');
      expect(result.errors[0].messageId).toBe('msg-1');
    });

    it('should collect multiple validation errors for a single message', () => {
      const conversation = createValidConversation();
      (conversation.messages[0] as any).role = undefined;
      (conversation.messages[0] as any).content = undefined;

      const result = validator.validate(conversation);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors.some(e => e.field === 'role')).toBe(true);
      expect(result.errors.some(e => e.field === 'content')).toBe(true);
    });
  });

  describe('validate - invalid timestamps', () => {
    it('should fail validation when conversation created_at is invalid (Requirement 5.3)', () => {
      const conversation = createValidConversation();
      conversation.created_at = 'invalid-date';

      const result = validator.validate(conversation);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => 
        e.field === 'created_at' && 
        e.message.includes('valid ISO 8601 date')
      )).toBe(true);
      expect(result.errors[0].conversationId).toBe('conv-123');
    });

    it('should fail validation when conversation updated_at is invalid (Requirement 5.3)', () => {
      const conversation = createValidConversation();
      conversation.updated_at = 'not-a-date';

      const result = validator.validate(conversation);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => 
        e.field === 'updated_at' && 
        e.message.includes('valid ISO 8601 date')
      )).toBe(true);
    });

    it('should fail validation when message created_at is invalid (Requirement 5.3)', () => {
      const conversation = createValidConversation();
      conversation.messages[0].created_at = '2024-13-45T99:99:99.000Z';

      const result = validator.validate(conversation);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => 
        e.field === 'created_at' && 
        e.messageId === 'msg-1'
      )).toBe(true);
    });

    it('should fail validation when conversation created_at is missing', () => {
      const conversation = createValidConversation();
      (conversation as any).created_at = '';

      const result = validator.validate(conversation);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => 
        e.field === 'created_at' && 
        e.message.includes('required')
      )).toBe(true);
    });

    it('should fail validation when conversation updated_at is missing', () => {
      const conversation = createValidConversation();
      (conversation as any).updated_at = '';

      const result = validator.validate(conversation);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => 
        e.field === 'updated_at' && 
        e.message.includes('required')
      )).toBe(true);
    });
  });

  describe('validate - validation error messages include proper identifiers', () => {
    it('should include conversationId in all error messages (Requirement 5.4)', () => {
      const conversation = createValidConversation();
      conversation.messages = [];
      conversation.created_at = 'invalid';

      const result = validator.validate(conversation);

      expect(result.valid).toBe(false);
      result.errors.forEach(error => {
        expect(error.conversationId).toBe('conv-123');
      });
    });

    it('should include messageId in message-specific errors (Requirement 5.4)', () => {
      const conversation = createValidConversation();
      (conversation.messages[0] as any).role = undefined;

      const result = validator.validate(conversation);

      expect(result.valid).toBe(false);
      expect(result.errors[0].messageId).toBe('msg-1');
      expect(result.errors[0].conversationId).toBe('conv-123');
    });

    it('should include both conversationId and messageId for message timestamp errors', () => {
      const conversation = createValidConversation();
      conversation.messages[0].created_at = 'bad-timestamp';

      const result = validator.validate(conversation);

      expect(result.valid).toBe(false);
      expect(result.errors[0].conversationId).toBe('conv-123');
      expect(result.errors[0].messageId).toBe('msg-1');
    });
  });

  describe('validateBatch - mixed valid/invalid conversations', () => {
    it('should separate valid and invalid conversations (Requirement 5.6)', () => {
      const validConv1 = createValidConversation();
      validConv1.id = 'conv-1';

      const invalidConv = createValidConversation();
      invalidConv.id = 'conv-2';
      invalidConv.messages = []; // Invalid: no messages

      const validConv2 = createValidConversation();
      validConv2.id = 'conv-3';

      const result = validator.validateBatch([validConv1, invalidConv, validConv2]);

      expect(result.validConversations).toHaveLength(2);
      expect(result.invalidConversations).toHaveLength(1);
      expect(result.validConversations[0].id).toBe('conv-1');
      expect(result.validConversations[1].id).toBe('conv-3');
      expect(result.invalidConversations[0].conversation.id).toBe('conv-2');
    });

    it('should include error details for invalid conversations (Requirement 5.6)', () => {
      const invalidConv = createValidConversation();
      invalidConv.id = 'conv-invalid';
      invalidConv.messages = [];

      const result = validator.validateBatch([invalidConv]);

      expect(result.invalidConversations).toHaveLength(1);
      expect(result.invalidConversations[0].errors).toHaveLength(1);
      expect(result.invalidConversations[0].errors[0].field).toBe('messages');
      expect(result.invalidConversations[0].conversation.id).toBe('conv-invalid');
    });

    it('should handle all valid conversations', () => {
      const conv1 = createValidConversation();
      conv1.id = 'conv-1';
      const conv2 = createValidConversation();
      conv2.id = 'conv-2';

      const result = validator.validateBatch([conv1, conv2]);

      expect(result.validConversations).toHaveLength(2);
      expect(result.invalidConversations).toHaveLength(0);
    });

    it('should handle all invalid conversations', () => {
      const conv1 = createValidConversation();
      conv1.id = 'conv-1';
      conv1.messages = [];

      const conv2 = createValidConversation();
      conv2.id = 'conv-2';
      conv2.created_at = 'invalid';

      const result = validator.validateBatch([conv1, conv2]);

      expect(result.validConversations).toHaveLength(0);
      expect(result.invalidConversations).toHaveLength(2);
    });

    it('should handle empty batch', () => {
      const result = validator.validateBatch([]);

      expect(result.validConversations).toHaveLength(0);
      expect(result.invalidConversations).toHaveLength(0);
    });

    it('should validate each conversation independently', () => {
      const conv1 = createValidConversation();
      conv1.id = 'conv-1';
      (conv1.messages[0] as any).role = 'bad-role';

      const conv2 = createValidConversation();
      conv2.id = 'conv-2';
      conv2.messages = [];

      const conv3 = createValidConversation();
      conv3.id = 'conv-3';

      const result = validator.validateBatch([conv1, conv2, conv3]);

      expect(result.validConversations).toHaveLength(1);
      expect(result.validConversations[0].id).toBe('conv-3');
      expect(result.invalidConversations).toHaveLength(2);
      
      // Check that each invalid conversation has its own errors
      const conv1Errors = result.invalidConversations.find(
        ic => ic.conversation.id === 'conv-1'
      );
      const conv2Errors = result.invalidConversations.find(
        ic => ic.conversation.id === 'conv-2'
      );

      expect(conv1Errors?.errors[0].field).toBe('role');
      expect(conv2Errors?.errors[0].field).toBe('messages');
    });
  });

  describe('edge cases', () => {
    it('should handle conversations with many messages', () => {
      const conversation = createValidConversation();
      
      // Add 100 messages
      for (let i = 2; i <= 100; i++) {
        conversation.messages.push({
          id: `msg-${i}`,
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}`,
          created_at: '2024-01-01T00:00:00.000Z',
          raw_metadata: {},
        });
      }

      const result = validator.validate(conversation);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should collect all errors when multiple messages are invalid', () => {
      const conversation = createValidConversation();
      
      conversation.messages.push({
        id: 'msg-2',
        role: 'user' as any,
        content: undefined as any,
        created_at: '2024-01-01T00:00:00.000Z',
        raw_metadata: {},
      });

      conversation.messages.push({
        id: 'msg-3',
        role: undefined as any,
        content: 'Content',
        created_at: 'bad-date',
        raw_metadata: {},
      });

      const result = validator.validate(conversation);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(2);
      
      // Check that errors from different messages are included
      const msg2Errors = result.errors.filter(e => e.messageId === 'msg-2');
      const msg3Errors = result.errors.filter(e => e.messageId === 'msg-3');
      
      expect(msg2Errors.length).toBeGreaterThan(0);
      expect(msg3Errors.length).toBeGreaterThan(0);
    });
  });
});
