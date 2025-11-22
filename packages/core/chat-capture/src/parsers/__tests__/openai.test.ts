/**
 * Tests for OpenAI ChatGPT parser
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 3.3, 3.4
 */

import { describe, it, expect } from 'vitest';
import { OpenAIParser } from '../openai';

describe('OpenAIParser', () => {
  const parser = new OpenAIParser();

  describe('canParse', () => {
    it('should detect single conversation format with mapping', () => {
      const data = {
        mapping: {
          'node-1': {
            id: 'node-1',
            message: null,
            parent: null,
            children: [],
          },
        },
        title: 'Test Conversation',
      };

      expect(parser.canParse(data)).toBe(true);
    });

    it('should detect multi-conversation format', () => {
      const data = {
        conversations: [
          {
            mapping: {
              'node-1': {
                id: 'node-1',
                message: null,
                parent: null,
                children: [],
              },
            },
            title: 'Conversation 1',
          },
        ],
      };

      expect(parser.canParse(data)).toBe(true);
    });

    it('should reject data without mapping or conversations', () => {
      const data = {
        title: 'Test',
        messages: [],
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
  });

  describe('parse - single conversation', () => {
    it('should parse basic single conversation', async () => {
      const data = {
        conversation_id: 'conv-123',
        title: 'Test Conversation',
        create_time: 1234567890,
        update_time: 1234567900,
        mapping: {
          'node-1': {
            id: 'node-1',
            message: {
              id: 'msg-1',
              author: { role: 'user' },
              content: { parts: ['Hello, how are you?'] },
              create_time: 1234567890,
            },
            parent: null,
            children: ['node-2'],
          },
          'node-2': {
            id: 'node-2',
            message: {
              id: 'msg-2',
              author: { role: 'assistant' },
              content: { parts: ['I am doing well, thank you!'] },
              create_time: 1234567895,
            },
            parent: 'node-1',
            children: [],
          },
        },
      };

      const result = await parser.parse(data);

      expect(result).toHaveLength(1);
      const conversation = result[0];

      expect(conversation.provider).toBe('openai');
      expect(conversation.external_id).toBe('conv-123');
      expect(conversation.title).toBe('Test Conversation');
      expect(conversation.created_at).toBe('2009-02-13T23:31:30.000Z');
      expect(conversation.updated_at).toBe('2009-02-13T23:31:40.000Z');
      expect(conversation.messages).toHaveLength(2);

      // Check first message
      expect(conversation.messages[0].role).toBe('user');
      expect(conversation.messages[0].content).toBe('Hello, how are you?');
      expect(conversation.messages[0].created_at).toBe('2009-02-13T23:31:30.000Z');

      // Check second message
      expect(conversation.messages[1].role).toBe('assistant');
      expect(conversation.messages[1].content).toBe('I am doing well, thank you!');
    });

    it('should preserve code blocks in message content', async () => {
      const codeContent = 'Here is some code:\n```python\ndef hello():\n    print("Hello")\n```';
      
      const data = {
        mapping: {
          'node-1': {
            id: 'node-1',
            message: {
              id: 'msg-1',
              author: { role: 'assistant' },
              content: { parts: [codeContent] },
              create_time: 1234567890,
            },
            parent: null,
            children: [],
          },
        },
      };

      const result = await parser.parse(data);

      expect(result[0].messages[0].content).toBe(codeContent);
    });

    it('should preserve markdown formatting', async () => {
      const markdownContent = '# Heading\n\n**Bold text** and *italic text*\n\n- List item 1\n- List item 2';
      
      const data = {
        mapping: {
          'node-1': {
            id: 'node-1',
            message: {
              id: 'msg-1',
              author: { role: 'assistant' },
              content: { parts: [markdownContent] },
              create_time: 1234567890,
            },
            parent: null,
            children: [],
          },
        },
      };

      const result = await parser.parse(data);

      expect(result[0].messages[0].content).toBe(markdownContent);
    });

    it('should handle multi-part content by joining with newlines', async () => {
      const data = {
        mapping: {
          'node-1': {
            id: 'node-1',
            message: {
              id: 'msg-1',
              author: { role: 'user' },
              content: { parts: ['Part 1', 'Part 2', 'Part 3'] },
              create_time: 1234567890,
            },
            parent: null,
            children: [],
          },
        },
      };

      const result = await parser.parse(data);

      expect(result[0].messages[0].content).toBe('Part 1\nPart 2\nPart 3');
    });

    it('should skip messages with empty content', async () => {
      const data = {
        mapping: {
          'node-1': {
            id: 'node-1',
            message: {
              id: 'msg-1',
              author: { role: 'user' },
              content: { parts: [''] },
              create_time: 1234567890,
            },
            parent: null,
            children: ['node-2'],
          },
          'node-2': {
            id: 'node-2',
            message: {
              id: 'msg-2',
              author: { role: 'assistant' },
              content: { parts: ['Valid message'] },
              create_time: 1234567895,
            },
            parent: 'node-1',
            children: [],
          },
        },
      };

      const result = await parser.parse(data);

      expect(result[0].messages).toHaveLength(1);
      expect(result[0].messages[0].content).toBe('Valid message');
    });

    it('should normalize various role types', async () => {
      const data = {
        mapping: {
          'node-1': {
            id: 'node-1',
            message: {
              id: 'msg-1',
              author: { role: 'system' },
              content: { parts: ['System message'] },
              create_time: 1234567890,
            },
            parent: null,
            children: ['node-2'],
          },
          'node-2': {
            id: 'node-2',
            message: {
              id: 'msg-2',
              author: { role: 'tool' },
              content: { parts: ['Tool output'] },
              create_time: 1234567895,
            },
            parent: 'node-1',
            children: [],
          },
        },
      };

      const result = await parser.parse(data);

      expect(result[0].messages[0].role).toBe('system');
      expect(result[0].messages[1].role).toBe('assistant'); // tool maps to assistant
    });

    it('should preserve raw metadata', async () => {
      const data = {
        conversation_id: 'conv-123',
        title: 'Test',
        custom_field: 'custom_value',
        mapping: {
          'node-1': {
            id: 'node-1',
            message: {
              id: 'msg-1',
              author: { role: 'user', name: 'John' },
              content: { 
                parts: ['Hello'],
                content_type: 'text',
                custom_content_field: 'value'
              },
              create_time: 1234567890,
              metadata: { key: 'value' },
            },
            parent: null,
            children: [],
          },
        },
      };

      const result = await parser.parse(data);

      // Check conversation metadata
      expect(result[0].raw_metadata.custom_field).toBe('custom_value');

      // Check message metadata
      expect(result[0].messages[0].raw_metadata.content_type).toBe('text');
      expect(result[0].messages[0].raw_metadata.content_custom_content_field).toBe('value');
      expect(result[0].messages[0].raw_metadata.metadata).toEqual({ key: 'value' });
    });

    it('should handle missing optional fields', async () => {
      const data = {
        mapping: {
          'node-1': {
            id: 'node-1',
            message: {
              id: 'msg-1',
              author: { role: 'user' },
              content: { parts: ['Hello'] },
              create_time: 1234567890,
            },
            parent: null,
            children: [],
          },
        },
      };

      const result = await parser.parse(data);

      expect(result[0].external_id).toBeNull();
      expect(result[0].title).toBeNull();
      expect(result[0].created_at).toBeTruthy(); // Should use message timestamp
    });
  });

  describe('parse - multi-conversation', () => {
    it('should parse multiple conversations', async () => {
      const data = {
        conversations: [
          {
            conversation_id: 'conv-1',
            title: 'Conversation 1',
            mapping: {
              'node-1': {
                id: 'node-1',
                message: {
                  id: 'msg-1',
                  author: { role: 'user' },
                  content: { parts: ['Message 1'] },
                  create_time: 1234567890,
                },
                parent: null,
                children: [],
              },
            },
          },
          {
            conversation_id: 'conv-2',
            title: 'Conversation 2',
            mapping: {
              'node-2': {
                id: 'node-2',
                message: {
                  id: 'msg-2',
                  author: { role: 'user' },
                  content: { parts: ['Message 2'] },
                  create_time: 1234567900,
                },
                parent: null,
                children: [],
              },
            },
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
            conversation_id: 'conv-1',
            title: 'Valid Conversation',
            mapping: {
              'node-1': {
                id: 'node-1',
                message: {
                  id: 'msg-1',
                  author: { role: 'user' },
                  content: { parts: ['Message'] },
                  create_time: 1234567890,
                },
                parent: null,
                children: [],
              },
            },
          },
          {
            conversation_id: 'conv-2',
            title: 'Empty Conversation',
            mapping: {},
          },
        ],
      };

      const result = await parser.parse(data);

      expect(result).toHaveLength(1);
      expect(result[0].external_id).toBe('conv-1');
    });
  });

  describe('parse - malformed data', () => {
    it('should throw error for missing mapping field', async () => {
      const data = {
        title: 'Test',
      };

      await expect(parser.parse(data)).rejects.toThrow('Invalid OpenAI export format');
    });

    it('should skip conversation with missing mapping', async () => {
      const data = {
        conversations: [
          {
            conversation_id: 'conv-bad',
            // Missing mapping
          },
        ],
      };

      const result = await parser.parse(data);
      
      // Should return empty array since conversation has no mapping
      expect(result).toHaveLength(0);
    });

    it('should handle nodes with null messages', async () => {
      const data = {
        mapping: {
          'node-1': {
            id: 'node-1',
            message: null,
            parent: null,
            children: ['node-2'],
          },
          'node-2': {
            id: 'node-2',
            message: {
              id: 'msg-2',
              author: { role: 'user' },
              content: { parts: ['Valid message'] },
              create_time: 1234567890,
            },
            parent: 'node-1',
            children: [],
          },
        },
      };

      const result = await parser.parse(data);

      expect(result[0].messages).toHaveLength(1);
      expect(result[0].messages[0].content).toBe('Valid message');
    });

    it('should handle missing author role', async () => {
      const data = {
        mapping: {
          'node-1': {
            id: 'node-1',
            message: {
              id: 'msg-1',
              author: {},
              content: { parts: ['Message'] },
              create_time: 1234567890,
            },
            parent: null,
            children: [],
          },
        },
      };

      const result = await parser.parse(data);

      expect(result[0].messages[0].role).toBe('assistant'); // Default role
    });

    it('should skip conversation with missing content parts', async () => {
      const data = {
        mapping: {
          'node-1': {
            id: 'node-1',
            message: {
              id: 'msg-1',
              author: { role: 'user' },
              content: {},
              create_time: 1234567890,
            },
            parent: null,
            children: [],
          },
        },
      };

      const result = await parser.parse(data);

      // Should return empty array since all messages have no content
      expect(result).toHaveLength(0);
    });

    it('should filter non-string parts', async () => {
      const data = {
        mapping: {
          'node-1': {
            id: 'node-1',
            message: {
              id: 'msg-1',
              author: { role: 'user' },
              content: { parts: ['Valid', null, 123, 'Also valid'] },
              create_time: 1234567890,
            },
            parent: null,
            children: [],
          },
        },
      };

      const result = await parser.parse(data);

      expect(result[0].messages[0].content).toBe('Valid\nAlso valid');
    });
  });

  describe('parse - message ordering', () => {
    it('should maintain message order through tree traversal', async () => {
      const data = {
        mapping: {
          'root': {
            id: 'root',
            message: null,
            parent: null,
            children: ['node-1'],
          },
          'node-1': {
            id: 'node-1',
            message: {
              id: 'msg-1',
              author: { role: 'user' },
              content: { parts: ['First'] },
              create_time: 1234567890,
            },
            parent: 'root',
            children: ['node-2'],
          },
          'node-2': {
            id: 'node-2',
            message: {
              id: 'msg-2',
              author: { role: 'assistant' },
              content: { parts: ['Second'] },
              create_time: 1234567895,
            },
            parent: 'node-1',
            children: ['node-3'],
          },
          'node-3': {
            id: 'node-3',
            message: {
              id: 'msg-3',
              author: { role: 'user' },
              content: { parts: ['Third'] },
              create_time: 1234567900,
            },
            parent: 'node-2',
            children: [],
          },
        },
      };

      const result = await parser.parse(data);

      expect(result[0].messages).toHaveLength(3);
      expect(result[0].messages[0].content).toBe('First');
      expect(result[0].messages[1].content).toBe('Second');
      expect(result[0].messages[2].content).toBe('Third');
    });

    it('should handle branching conversations', async () => {
      const data = {
        mapping: {
          'node-1': {
            id: 'node-1',
            message: {
              id: 'msg-1',
              author: { role: 'user' },
              content: { parts: ['First'] },
              create_time: 1234567890,
            },
            parent: null,
            children: ['node-2', 'node-3'],
          },
          'node-2': {
            id: 'node-2',
            message: {
              id: 'msg-2',
              author: { role: 'assistant' },
              content: { parts: ['Branch A'] },
              create_time: 1234567895,
            },
            parent: 'node-1',
            children: [],
          },
          'node-3': {
            id: 'node-3',
            message: {
              id: 'msg-3',
              author: { role: 'assistant' },
              content: { parts: ['Branch B'] },
              create_time: 1234567896,
            },
            parent: 'node-1',
            children: [],
          },
        },
      };

      const result = await parser.parse(data);

      // Should include all messages from branches
      expect(result[0].messages).toHaveLength(3);
      expect(result[0].messages[0].content).toBe('First');
    });
  });

  describe('provider identifier', () => {
    it('should have correct provider identifier', () => {
      expect(parser.provider).toBe('openai');
    });
  });
});
