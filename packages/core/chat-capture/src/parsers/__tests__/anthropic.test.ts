/**
 * Tests for Anthropic Claude parser
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.3, 3.4
 */

import { describe, it, expect } from 'vitest';
import { AnthropicParser } from '../anthropic';

describe('AnthropicParser', () => {
  const parser = new AnthropicParser();

  describe('canParse', () => {
    it('should detect single conversation format', () => {
      const data = {
        uuid: 'test-uuid',
        chat_messages: [
          {
            uuid: 'msg-1',
            text: 'Hello',
            sender: 'human',
          },
        ],
        name: 'Test Conversation',
      };

      expect(parser.canParse(data)).toBe(true);
    });

    it('should detect multi-conversation format', () => {
      const data = {
        conversations: [
          {
            uuid: 'conv-1',
            chat_messages: [
              {
                uuid: 'msg-1',
                text: 'Hello',
                sender: 'human',
              },
            ],
          },
        ],
      };

      expect(parser.canParse(data)).toBe(true);
    });

    it('should reject data without uuid and chat_messages', () => {
      const data = {
        name: 'Test',
        messages: [],
      };

      expect(parser.canParse(data)).toBe(false);
    });

    it('should reject data with uuid but no chat_messages', () => {
      const data = {
        uuid: 'test-uuid',
        name: 'Test',
      };

      expect(parser.canParse(data)).toBe(false);
    });

    it('should reject non-object data', () => {
      expect(parser.canParse(null)).toBe(false);
      expect(parser.canParse(undefined)).toBe(false);
      expect(parser.canParse('string')).toBe(false);
      expect(parser.canParse(123)).toBe(false);
    });

    it('should reject empty conversations array', () => {
      const data = {
        conversations: [],
      };

      expect(parser.canParse(data)).toBe(false);
    });

    it('should reject conversations without proper structure', () => {
      const data = {
        conversations: [
          {
            name: 'Test',
            // Missing uuid and chat_messages
          },
        ],
      };

      expect(parser.canParse(data)).toBe(false);
    });
  });

  describe('parse - single conversation', () => {
    it('should parse basic single conversation', async () => {
      const data = {
        uuid: 'conv-123',
        name: 'Test Conversation',
        created_at: '2024-01-15T10:30:00Z',
        updated_at: '2024-01-15T10:35:00Z',
        chat_messages: [
          {
            uuid: 'msg-1',
            text: 'Hello, how can you help me?',
            sender: 'human',
            created_at: '2024-01-15T10:30:00Z',
          },
          {
            uuid: 'msg-2',
            text: 'I can help you with many things!',
            sender: 'assistant',
            created_at: '2024-01-15T10:30:30Z',
          },
        ],
      };

      const result = await parser.parse(data);

      expect(result).toHaveLength(1);
      const conversation = result[0];

      expect(conversation.provider).toBe('anthropic');
      expect(conversation.external_id).toBe('conv-123');
      expect(conversation.title).toBe('Test Conversation');
      expect(conversation.created_at).toBe('2024-01-15T10:30:00.000Z');
      expect(conversation.updated_at).toBe('2024-01-15T10:35:00.000Z');
      expect(conversation.messages).toHaveLength(2);

      // Check first message
      expect(conversation.messages[0].role).toBe('user');
      expect(conversation.messages[0].content).toBe('Hello, how can you help me?');
      expect(conversation.messages[0].created_at).toBe('2024-01-15T10:30:00.000Z');

      // Check second message
      expect(conversation.messages[1].role).toBe('assistant');
      expect(conversation.messages[1].content).toBe('I can help you with many things!');
    });

    it('should map Claude-specific roles to standard roles', async () => {
      const data = {
        uuid: 'conv-123',
        chat_messages: [
          {
            uuid: 'msg-1',
            text: 'Human message',
            sender: 'human',
            created_at: '2024-01-15T10:30:00Z',
          },
          {
            uuid: 'msg-2',
            text: 'Claude response',
            sender: 'claude',
            created_at: '2024-01-15T10:30:30Z',
          },
          {
            uuid: 'msg-3',
            text: 'System message',
            sender: 'system',
            created_at: '2024-01-15T10:30:35Z',
          },
        ],
      };

      const result = await parser.parse(data);

      expect(result[0].messages[0].role).toBe('user'); // human -> user
      expect(result[0].messages[1].role).toBe('assistant'); // claude -> assistant
      expect(result[0].messages[2].role).toBe('system'); // system -> system
    });

    it('should preserve code blocks in message content', async () => {
      const codeContent = 'Here is some code:\n```javascript\nfunction test() {\n  return true;\n}\n```';
      
      const data = {
        uuid: 'conv-123',
        chat_messages: [
          {
            uuid: 'msg-1',
            text: codeContent,
            sender: 'assistant',
            created_at: '2024-01-15T10:30:00Z',
          },
        ],
      };

      const result = await parser.parse(data);

      expect(result[0].messages[0].content).toBe(codeContent);
    });

    it('should preserve markdown formatting', async () => {
      const markdownContent = '# Title\n\n**Bold** and *italic*\n\n1. Item 1\n2. Item 2';
      
      const data = {
        uuid: 'conv-123',
        chat_messages: [
          {
            uuid: 'msg-1',
            text: markdownContent,
            sender: 'assistant',
            created_at: '2024-01-15T10:30:00Z',
          },
        ],
      };

      const result = await parser.parse(data);

      expect(result[0].messages[0].content).toBe(markdownContent);
    });

    it('should skip messages with empty content', async () => {
      const data = {
        uuid: 'conv-123',
        chat_messages: [
          {
            uuid: 'msg-1',
            text: '',
            sender: 'human',
            created_at: '2024-01-15T10:30:00Z',
          },
          {
            uuid: 'msg-2',
            text: 'Valid message',
            sender: 'assistant',
            created_at: '2024-01-15T10:30:30Z',
          },
        ],
      };

      const result = await parser.parse(data);

      expect(result[0].messages).toHaveLength(1);
      expect(result[0].messages[0].content).toBe('Valid message');
    });

    it('should skip messages with whitespace-only content', async () => {
      const data = {
        uuid: 'conv-123',
        chat_messages: [
          {
            uuid: 'msg-1',
            text: '   \n\t  ',
            sender: 'human',
            created_at: '2024-01-15T10:30:00Z',
          },
          {
            uuid: 'msg-2',
            text: 'Valid message',
            sender: 'assistant',
            created_at: '2024-01-15T10:30:30Z',
          },
        ],
      };

      const result = await parser.parse(data);

      expect(result[0].messages).toHaveLength(1);
      expect(result[0].messages[0].content).toBe('Valid message');
    });

    it('should preserve raw metadata', async () => {
      const data = {
        uuid: 'conv-123',
        name: 'Test',
        custom_field: 'custom_value',
        model: 'claude-3',
        chat_messages: [
          {
            uuid: 'msg-1',
            text: 'Hello',
            sender: 'human',
            created_at: '2024-01-15T10:30:00Z',
            metadata: { key: 'value' },
            custom_msg_field: 'msg_value',
          },
        ],
      };

      const result = await parser.parse(data);

      // Check conversation metadata
      expect(result[0].raw_metadata.custom_field).toBe('custom_value');
      expect(result[0].raw_metadata.model).toBe('claude-3');

      // Check message metadata
      expect(result[0].messages[0].raw_metadata.metadata).toEqual({ key: 'value' });
      expect(result[0].messages[0].raw_metadata.custom_msg_field).toBe('msg_value');
      expect(result[0].messages[0].raw_metadata.original_sender).toBe('human');
    });

    it('should handle missing optional fields', async () => {
      const data = {
        uuid: 'conv-123',
        chat_messages: [
          {
            uuid: 'msg-1',
            text: 'Hello',
            sender: 'human',
            created_at: '2024-01-15T10:30:00Z',
          },
        ],
      };

      const result = await parser.parse(data);

      expect(result[0].external_id).toBe('conv-123');
      expect(result[0].title).toBeNull();
      expect(result[0].created_at).toBeTruthy();
    });

    it('should handle missing sender field', async () => {
      const data = {
        uuid: 'conv-123',
        chat_messages: [
          {
            uuid: 'msg-1',
            text: 'Message without sender',
            created_at: '2024-01-15T10:30:00Z',
          },
        ],
      };

      const result = await parser.parse(data);

      expect(result[0].messages[0].role).toBe('assistant'); // Default role
    });

    it('should use message timestamps when conversation timestamps missing', async () => {
      const data = {
        uuid: 'conv-123',
        chat_messages: [
          {
            uuid: 'msg-1',
            text: 'First',
            sender: 'human',
            created_at: '2024-01-15T10:30:00Z',
          },
          {
            uuid: 'msg-2',
            text: 'Last',
            sender: 'assistant',
            created_at: '2024-01-15T10:35:00Z',
          },
        ],
      };

      const result = await parser.parse(data);

      expect(result[0].created_at).toBe('2024-01-15T10:30:00.000Z');
      expect(result[0].updated_at).toBe('2024-01-15T10:35:00.000Z');
    });
  });

  describe('parse - multi-conversation', () => {
    it('should parse multiple conversations', async () => {
      const data = {
        conversations: [
          {
            uuid: 'conv-1',
            name: 'Conversation 1',
            chat_messages: [
              {
                uuid: 'msg-1',
                text: 'Message 1',
                sender: 'human',
                created_at: '2024-01-15T10:30:00Z',
              },
            ],
          },
          {
            uuid: 'conv-2',
            name: 'Conversation 2',
            chat_messages: [
              {
                uuid: 'msg-2',
                text: 'Message 2',
                sender: 'human',
                created_at: '2024-01-15T11:30:00Z',
              },
            ],
          },
        ],
      };

      const result = await parser.parse(data);

      expect(result).toHaveLength(2);
      expect(result[0].external_id).toBe('conv-1');
      expect(result[0].title).toBe('Conversation 1');
      expect(result[1].external_id).toBe('conv-2');
      expect(result[1].title).toBe('Conversation 2');
    });

    it('should skip conversations with no messages', async () => {
      const data = {
        conversations: [
          {
            uuid: 'conv-1',
            name: 'Valid Conversation',
            chat_messages: [
              {
                uuid: 'msg-1',
                text: 'Message',
                sender: 'human',
                created_at: '2024-01-15T10:30:00Z',
              },
            ],
          },
          {
            uuid: 'conv-2',
            name: 'Empty Conversation',
            chat_messages: [],
          },
        ],
      };

      const result = await parser.parse(data);

      expect(result).toHaveLength(1);
      expect(result[0].external_id).toBe('conv-1');
    });

    it('should skip conversations with only empty messages', async () => {
      const data = {
        conversations: [
          {
            uuid: 'conv-1',
            name: 'Valid Conversation',
            chat_messages: [
              {
                uuid: 'msg-1',
                text: 'Valid message',
                sender: 'human',
                created_at: '2024-01-15T10:30:00Z',
              },
            ],
          },
          {
            uuid: 'conv-2',
            name: 'Empty Messages',
            chat_messages: [
              {
                uuid: 'msg-2',
                text: '',
                sender: 'human',
                created_at: '2024-01-15T10:30:00Z',
              },
            ],
          },
        ],
      };

      const result = await parser.parse(data);

      expect(result).toHaveLength(1);
      expect(result[0].external_id).toBe('conv-1');
    });
  });

  describe('parse - malformed data', () => {
    it('should throw error for missing chat_messages field', async () => {
      const data = {
        uuid: 'conv-123',
        name: 'Test',
      };

      await expect(parser.parse(data)).rejects.toThrow('Invalid Anthropic export format');
    });

    it('should skip conversation with missing chat_messages', async () => {
      const data = {
        conversations: [
          {
            uuid: 'conv-bad',
            // Missing chat_messages
          },
        ],
      };

      const result = await parser.parse(data);
      
      // Should return empty array since conversation has no chat_messages
      expect(result).toHaveLength(0);
    });

    it('should handle non-array chat_messages', async () => {
      const data = {
        uuid: 'conv-123',
        chat_messages: 'not an array',
      };

      const result = await parser.parse(data);

      expect(result).toHaveLength(0);
    });

    it('should skip conversation with missing text field', async () => {
      const data = {
        uuid: 'conv-123',
        chat_messages: [
          {
            uuid: 'msg-1',
            sender: 'human',
            created_at: '2024-01-15T10:30:00Z',
          },
        ],
      };

      const result = await parser.parse(data);

      // Should return empty array since all messages have no text
      expect(result).toHaveLength(0);
    });

    it('should handle various sender formats', async () => {
      const data = {
        uuid: 'conv-123',
        chat_messages: [
          {
            uuid: 'msg-1',
            text: 'User message',
            sender: 'USER',
            created_at: '2024-01-15T10:30:00Z',
          },
          {
            uuid: 'msg-2',
            text: 'Assistant message',
            sender: 'ASSISTANT',
            created_at: '2024-01-15T10:30:30Z',
          },
        ],
      };

      const result = await parser.parse(data);

      expect(result[0].messages[0].role).toBe('user');
      expect(result[0].messages[1].role).toBe('assistant');
    });
  });

  describe('parse - message ordering', () => {
    it('should maintain message order from array', async () => {
      const data = {
        uuid: 'conv-123',
        chat_messages: [
          {
            uuid: 'msg-1',
            text: 'First',
            sender: 'human',
            created_at: '2024-01-15T10:30:00Z',
          },
          {
            uuid: 'msg-2',
            text: 'Second',
            sender: 'assistant',
            created_at: '2024-01-15T10:30:30Z',
          },
          {
            uuid: 'msg-3',
            text: 'Third',
            sender: 'human',
            created_at: '2024-01-15T10:31:00Z',
          },
        ],
      };

      const result = await parser.parse(data);

      expect(result[0].messages).toHaveLength(3);
      expect(result[0].messages[0].content).toBe('First');
      expect(result[0].messages[1].content).toBe('Second');
      expect(result[0].messages[2].content).toBe('Third');
    });
  });

  describe('provider identifier', () => {
    it('should have correct provider identifier', () => {
      expect(parser.provider).toBe('anthropic');
    });
  });

  describe('role normalization edge cases', () => {
    it('should normalize user variations', async () => {
      const data = {
        uuid: 'conv-123',
        chat_messages: [
          {
            uuid: 'msg-1',
            text: 'Test',
            sender: 'user',
            created_at: '2024-01-15T10:30:00Z',
          },
        ],
      };

      const result = await parser.parse(data);

      expect(result[0].messages[0].role).toBe('user');
    });

    it('should normalize assistant variations', async () => {
      const data = {
        uuid: 'conv-123',
        chat_messages: [
          {
            uuid: 'msg-1',
            text: 'Test',
            sender: 'assistant',
            created_at: '2024-01-15T10:30:00Z',
          },
        ],
      };

      const result = await parser.parse(data);

      expect(result[0].messages[0].role).toBe('assistant');
    });

    it('should default unknown roles to assistant', async () => {
      const data = {
        uuid: 'conv-123',
        chat_messages: [
          {
            uuid: 'msg-1',
            text: 'Test',
            sender: 'unknown_role',
            created_at: '2024-01-15T10:30:00Z',
          },
        ],
      };

      const result = await parser.parse(data);

      expect(result[0].messages[0].role).toBe('assistant');
    });
  });
});
