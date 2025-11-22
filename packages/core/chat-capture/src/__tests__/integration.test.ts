/**
 * Integration tests for ChatCapture
 * Requirements: 1.6, 4.4, 4.6, 5.6, 5.7, 6.1, 6.6
 * 
 * These tests verify end-to-end functionality including:
 * - Multi-conversation file imports
 * - Auto-detection with various formats
 * - Custom parser registration
 * - File size and conversation count limits
 * - skipInvalid mode with partial failures
 * - Streaming capture with simulated API responses
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ChatCapture } from '../index.js';
import { BaseParser } from '../parsers/base.js';
import { NormalizedConversation } from '../types.js';

describe('ChatCapture Integration Tests', () => {
  let chatCapture: ChatCapture;

  beforeEach(() => {
    chatCapture = new ChatCapture();
  });

  describe('End-to-end multi-conversation file import', () => {
    it('should import OpenAI file with multiple conversations', async () => {
      // Requirement 1.6: Support files with multiple conversations
      const multiConvData = {
        conversations: [
          {
            conversation_id: 'conv-1',
            title: 'First Conversation',
            create_time: 1700000000,
            mapping: {
              'node-1': {
                id: 'node-1',
                message: {
                  id: 'msg-1',
                  author: { role: 'user' },
                  content: { parts: ['Hello from conv 1'] },
                  create_time: 1700000000,
                },
                parent: null,
                children: ['node-2'],
              },
              'node-2': {
                id: 'node-2',
                message: {
                  id: 'msg-2',
                  author: { role: 'assistant' },
                  content: { parts: ['Response from conv 1'] },
                  create_time: 1700000010,
                },
                parent: 'node-1',
                children: [],
              },
            },
          },
          {
            conversation_id: 'conv-2',
            title: 'Second Conversation',
            create_time: 1700001000,
            mapping: {
              'node-3': {
                id: 'node-3',
                message: {
                  id: 'msg-3',
                  author: { role: 'user' },
                  content: { parts: ['Hello from conv 2'] },
                  create_time: 1700001000,
                },
                parent: null,
                children: ['node-4'],
              },
              'node-4': {
                id: 'node-4',
                message: {
                  id: 'msg-4',
                  author: { role: 'assistant' },
                  content: { parts: ['Response from conv 2'] },
                  create_time: 1700001010,
                },
                parent: 'node-3',
                children: [],
              },
            },
          },
        ],
      };

      const result = await chatCapture.parseFile(
        JSON.stringify(multiConvData),
        'openai'
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        
        // Verify first conversation
        expect(result.value[0].external_id).toBe('conv-1');
        expect(result.value[0].title).toBe('First Conversation');
        expect(result.value[0].messages).toHaveLength(2);
        expect(result.value[0].messages[0].content).toBe('Hello from conv 1');
        expect(result.value[0].messages[1].content).toBe('Response from conv 1');
        
        // Verify second conversation
        expect(result.value[1].external_id).toBe('conv-2');
        expect(result.value[1].title).toBe('Second Conversation');
        expect(result.value[1].messages).toHaveLength(2);
        expect(result.value[1].messages[0].content).toBe('Hello from conv 2');
        expect(result.value[1].messages[1].content).toBe('Response from conv 2');
      }
    });

    it('should import Anthropic file with multiple conversations', async () => {
      // Requirement 1.6: Support files with multiple conversations
      const multiConvData = {
        conversations: [
          {
            uuid: 'claude-conv-1',
            name: 'First Claude Chat',
            created_at: '2024-01-01T10:00:00Z',
            chat_messages: [
              {
                uuid: 'msg-1',
                text: 'Hello Claude',
                sender: 'human',
                created_at: '2024-01-01T10:00:00Z',
              },
              {
                uuid: 'msg-2',
                text: 'Hello! How can I help?',
                sender: 'assistant',
                created_at: '2024-01-01T10:00:05Z',
              },
            ],
          },
          {
            uuid: 'claude-conv-2',
            name: 'Second Claude Chat',
            created_at: '2024-01-01T11:00:00Z',
            chat_messages: [
              {
                uuid: 'msg-3',
                text: 'Another question',
                sender: 'human',
                created_at: '2024-01-01T11:00:00Z',
              },
              {
                uuid: 'msg-4',
                text: 'Another answer',
                sender: 'assistant',
                created_at: '2024-01-01T11:00:05Z',
              },
            ],
          },
        ],
      };

      const result = await chatCapture.parseFile(
        JSON.stringify(multiConvData),
        'anthropic'
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0].external_id).toBe('claude-conv-1');
        expect(result.value[1].external_id).toBe('claude-conv-2');
      }
    });
  });

  describe('Auto-detection with various file formats', () => {
    it('should auto-detect and parse OpenAI format', async () => {
      // Requirement 4.4: Support automatic provider detection
      const openaiData = {
        title: 'Auto-detected OpenAI',
        mapping: {
          'node-1': {
            id: 'node-1',
            message: {
              id: 'msg-1',
              author: { role: 'user' },
              content: { parts: ['Auto-detected message'] },
              create_time: 1700000000,
            },
            parent: null,
            children: [],
          },
        },
      };

      const result = await chatCapture.parseFileAuto(JSON.stringify(openaiData));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0].provider).toBe('openai');
        expect(result.value[0].messages[0].content).toBe('Auto-detected message');
      }
    });

    it('should auto-detect and parse Anthropic format', async () => {
      // Requirement 4.4: Support automatic provider detection
      const anthropicData = {
        uuid: 'auto-claude',
        name: 'Auto-detected Claude',
        chat_messages: [
          {
            uuid: 'msg-1',
            text: 'Auto-detected Claude message',
            sender: 'human',
            created_at: '2024-01-01T10:00:00Z',
          },
        ],
      };

      const result = await chatCapture.parseFileAuto(JSON.stringify(anthropicData));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0].provider).toBe('anthropic');
        expect(result.value[0].messages[0].content).toBe('Auto-detected Claude message');
      }
    });

    it('should handle ambiguous formats gracefully', async () => {
      // Requirement 4.4: Return error when format cannot be detected
      const ambiguousData = {
        some_field: 'value',
        other_field: 'data',
      };

      const result = await chatCapture.parseFileAuto(JSON.stringify(ambiguousData));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('detection_failed');
      }
    });
  });

  describe('Custom parser registration and usage', () => {
    it('should register and use custom parser', async () => {
      // Requirement 4.6: Support custom parsers for proprietary AI systems
      class CustomAIParser extends BaseParser {
        readonly provider = 'custom-ai';

        canParse(data: unknown): boolean {
          return (
            typeof data === 'object' &&
            data !== null &&
            'custom_conversations' in data
          );
        }

        async parse(data: any): Promise<NormalizedConversation[]> {
          const conversations: NormalizedConversation[] = [];
          
          for (const conv of data.custom_conversations) {
            conversations.push({
              id: this.generateId(),
              provider: this.provider,
              external_id: conv.id,
              title: conv.name,
              created_at: this.normalizeTimestamp(conv.timestamp),
              updated_at: this.normalizeTimestamp(conv.timestamp),
              messages: conv.turns.map((turn: any) => ({
                id: this.generateId(),
                role: this.normalizeRole(turn.speaker),
                content: turn.text,
                created_at: this.normalizeTimestamp(turn.timestamp),
                raw_metadata: {},
              })),
              raw_metadata: { custom_field: conv.metadata },
            });
          }
          
          return conversations;
        }
      }

      // Register custom parser
      const customParser = new CustomAIParser();
      chatCapture.registerParser('custom-ai', customParser);

      // Verify registration
      expect(chatCapture.listProviders()).toContain('custom-ai');

      // Use custom parser
      const customData = {
        custom_conversations: [
          {
            id: 'custom-1',
            name: 'Custom Conversation',
            timestamp: 1700000000000,
            metadata: { version: '1.0' },
            turns: [
              {
                speaker: 'user',
                text: 'Custom user message',
                timestamp: 1700000000000,
              },
              {
                speaker: 'bot',
                text: 'Custom bot response',
                timestamp: 1700000010000,
              },
            ],
          },
        ],
      };

      const result = await chatCapture.parseFile(
        JSON.stringify(customData),
        'custom-ai'
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].provider).toBe('custom-ai');
        expect(result.value[0].external_id).toBe('custom-1');
        expect(result.value[0].messages).toHaveLength(2);
        expect(result.value[0].messages[0].content).toBe('Custom user message');
        expect(result.value[0].messages[1].content).toBe('Custom bot response');
        expect(result.value[0].raw_metadata.custom_field).toEqual({ version: '1.0' });
      }
    });

    it('should auto-detect custom parser', async () => {
      // Requirement 4.4: Auto-detection works with custom parsers
      class AutoDetectParser extends BaseParser {
        readonly provider = 'auto-custom';

        canParse(data: unknown): boolean {
          return (
            typeof data === 'object' &&
            data !== null &&
            'magic_field' in data
          );
        }

        async parse(data: any): Promise<NormalizedConversation[]> {
          return [
            {
              id: this.generateId(),
              provider: this.provider,
              external_id: null,
              title: 'Auto-detected Custom',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              messages: [
                {
                  id: this.generateId(),
                  role: 'user',
                  content: data.magic_field,
                  created_at: new Date().toISOString(),
                  raw_metadata: {},
                },
              ],
              raw_metadata: {},
            },
          ];
        }
      }

      chatCapture.registerParser('auto-custom', new AutoDetectParser());

      const customData = { magic_field: 'Auto-detected custom content' };
      const result = await chatCapture.parseFileAuto(JSON.stringify(customData));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0].provider).toBe('auto-custom');
        expect(result.value[0].messages[0].content).toBe('Auto-detected custom content');
      }
    });
  });

  describe('File size limit enforcement', () => {
    it('should reject files exceeding size limit', async () => {
      // Requirement 5.7: Enforce configurable limits on file size
      const smallCapture = new ChatCapture({ maxFileSize: 100 });

      const largeData = {
        mapping: {
          'node-1': {
            id: 'node-1',
            message: {
              id: 'msg-1',
              author: { role: 'user' },
              content: { parts: ['x'.repeat(1000)] },
              create_time: 1700000000,
            },
            parent: null,
            children: [],
          },
        },
      };

      const result = await smallCapture.parseFile(
        JSON.stringify(largeData),
        'openai'
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('file_too_large');
        expect(result.error.size).toBeGreaterThan(result.error.limit);
      }
    });

    it('should accept files within size limit', async () => {
      // Requirement 5.7: Files within limit should be processed
      const largeCapture = new ChatCapture({ maxFileSize: 10 * 1024 * 1024 });

      const normalData = {
        mapping: {
          'node-1': {
            id: 'node-1',
            message: {
              id: 'msg-1',
              author: { role: 'user' },
              content: { parts: ['Normal message'] },
              create_time: 1700000000,
            },
            parent: null,
            children: [],
          },
        },
      };

      const result = await largeCapture.parseFile(
        JSON.stringify(normalData),
        'openai'
      );

      expect(result.ok).toBe(true);
    });
  });

  describe('Conversation count limit enforcement', () => {
    it('should reject files with too many conversations', async () => {
      // Requirement 5.7: Enforce configurable limits on conversation count
      const limitedCapture = new ChatCapture({ maxConversationsPerFile: 2 });

      const manyConversations = {
        conversations: Array.from({ length: 5 }, (_, i) => ({
          conversation_id: `conv-${i}`,
          title: `Conversation ${i}`,
          mapping: {
            [`node-${i}`]: {
              id: `node-${i}`,
              message: {
                id: `msg-${i}`,
                author: { role: 'user' },
                content: { parts: [`Message ${i}`] },
                create_time: 1700000000 + i,
              },
              parent: null,
              children: [],
            },
          },
        })),
      };

      const result = await limitedCapture.parseFile(
        JSON.stringify(manyConversations),
        'openai'
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('too_many_conversations');
        expect(result.error.count).toBe(5);
        expect(result.error.limit).toBe(2);
      }
    });

    it('should accept files within conversation limit', async () => {
      // Requirement 5.7: Files within limit should be processed
      const limitedCapture = new ChatCapture({ maxConversationsPerFile: 10 });

      const fewConversations = {
        conversations: Array.from({ length: 3 }, (_, i) => ({
          conversation_id: `conv-${i}`,
          title: `Conversation ${i}`,
          mapping: {
            [`node-${i}`]: {
              id: `node-${i}`,
              message: {
                id: `msg-${i}`,
                author: { role: 'user' },
                content: { parts: [`Message ${i}`] },
                create_time: 1700000000 + i,
              },
              parent: null,
              children: [],
            },
          },
        })),
      };

      const result = await limitedCapture.parseFile(
        JSON.stringify(fewConversations),
        'openai'
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(3);
      }
    });
  });

  describe('skipInvalid mode with partial failures', () => {
    it('should skip invalid conversations and return valid ones', async () => {
      // Requirement 5.7: Handle skipInvalid option for partial failure scenarios
      class MixedParser extends BaseParser {
        readonly provider = 'mixed-test';

        canParse(): boolean {
          return true;
        }

        async parse(): Promise<NormalizedConversation[]> {
          return [
            // Valid conversation
            {
              id: this.generateId(),
              provider: this.provider,
              external_id: 'valid-1',
              title: 'Valid Conversation 1',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              messages: [
                {
                  id: this.generateId(),
                  role: 'user',
                  content: 'Valid message',
                  created_at: new Date().toISOString(),
                  raw_metadata: {},
                },
              ],
              raw_metadata: {},
            },
            // Invalid conversation (no messages)
            {
              id: this.generateId(),
              provider: this.provider,
              external_id: 'invalid-1',
              title: 'Invalid Conversation',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              messages: [],
              raw_metadata: {},
            },
            // Valid conversation
            {
              id: this.generateId(),
              provider: this.provider,
              external_id: 'valid-2',
              title: 'Valid Conversation 2',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              messages: [
                {
                  id: this.generateId(),
                  role: 'assistant',
                  content: 'Another valid message',
                  created_at: new Date().toISOString(),
                  raw_metadata: {},
                },
              ],
              raw_metadata: {},
            },
          ];
        }
      }

      chatCapture.registerParser('mixed-test', new MixedParser());

      const result = await chatCapture.parseFile(
        JSON.stringify({ test: 'data' }),
        'mixed-test',
        { skipInvalid: true }
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0].external_id).toBe('valid-1');
        expect(result.value[1].external_id).toBe('valid-2');
      }
    });

    it('should fail if all conversations are invalid even with skipInvalid', async () => {
      // Requirement 5.6: Validation should catch all invalid conversations
      class AllInvalidParser extends BaseParser {
        readonly provider = 'all-invalid-test';

        canParse(): boolean {
          return true;
        }

        async parse(): Promise<NormalizedConversation[]> {
          return [
            {
              id: this.generateId(),
              provider: this.provider,
              external_id: 'invalid-1',
              title: 'Invalid 1',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              messages: [],
              raw_metadata: {},
            },
            {
              id: this.generateId(),
              provider: this.provider,
              external_id: 'invalid-2',
              title: 'Invalid 2',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              messages: [],
              raw_metadata: {},
            },
          ];
        }
      }

      chatCapture.registerParser('all-invalid-test', new AllInvalidParser());

      const result = await chatCapture.parseFile(
        JSON.stringify({ test: 'data' }),
        'all-invalid-test',
        { skipInvalid: true }
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('validation_error');
      }
    });

    it('should fail without skipInvalid when any conversation is invalid', async () => {
      // Requirement 5.6: Default behavior fails on any validation error
      class MixedParser extends BaseParser {
        readonly provider = 'mixed-strict-test';

        canParse(): boolean {
          return true;
        }

        async parse(): Promise<NormalizedConversation[]> {
          return [
            {
              id: this.generateId(),
              provider: this.provider,
              external_id: 'valid',
              title: 'Valid',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              messages: [
                {
                  id: this.generateId(),
                  role: 'user',
                  content: 'Valid',
                  created_at: new Date().toISOString(),
                  raw_metadata: {},
                },
              ],
              raw_metadata: {},
            },
            {
              id: this.generateId(),
              provider: this.provider,
              external_id: 'invalid',
              title: 'Invalid',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              messages: [],
              raw_metadata: {},
            },
          ];
        }
      }

      chatCapture.registerParser('mixed-strict-test', new MixedParser());

      const result = await chatCapture.parseFile(
        JSON.stringify({ test: 'data' }),
        'mixed-strict-test'
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('validation_error');
      }
    });
  });

  describe('Streaming capture with simulated API responses', () => {
    it('should capture OpenAI streaming conversation end-to-end', async () => {
      // Requirement 6.1, 6.6: Streaming capture with OpenAI format
      const builderResult = chatCapture.createStreamingBuilder('openai', 'stream-conv-1');
      
      expect(builderResult.ok).toBe(true);
      if (!builderResult.ok) return;

      const builder = builderResult.value;

      // Simulate user message
      builder.addMessage({
        role: 'user',
        content: 'What is the capital of France?',
      });

      // Simulate streaming assistant response
      const streamChunks = [
        { role: 'assistant', contentDelta: 'The' },
        { contentDelta: ' capital' },
        { contentDelta: ' of' },
        { contentDelta: ' France' },
        { contentDelta: ' is' },
        { contentDelta: ' Paris' },
        { contentDelta: '.', isComplete: true },
      ];

      for (const chunk of streamChunks) {
        builder.addChunk(chunk);
      }

      // Finalize conversation
      const conversation = builder.finalize({
        model: 'gpt-4',
        temperature: 0.7,
      });

      expect(conversation.provider).toBe('openai');
      expect(conversation.external_id).toBe('stream-conv-1');
      expect(conversation.messages).toHaveLength(2);
      expect(conversation.messages[0].role).toBe('user');
      expect(conversation.messages[0].content).toBe('What is the capital of France?');
      expect(conversation.messages[1].role).toBe('assistant');
      expect(conversation.messages[1].content).toBe('The capital of France is Paris.');
      expect(conversation.raw_metadata.model).toBe('gpt-4');
    });

    it('should capture Anthropic streaming conversation end-to-end', async () => {
      // Requirement 6.1, 6.6: Streaming capture with Anthropic format
      const builderResult = chatCapture.createStreamingBuilder('anthropic', 'claude-stream-1');
      
      expect(builderResult.ok).toBe(true);
      if (!builderResult.ok) return;

      const builder = builderResult.value;

      // Simulate user message
      builder.addMessage({
        role: 'user',
        content: 'Write a haiku about coding',
      });

      // Simulate streaming assistant response
      const streamChunks = [
        { role: 'assistant', contentDelta: 'Code flows' },
        { contentDelta: ' like water,\n' },
        { contentDelta: 'Bugs hide' },
        { contentDelta: ' in shadows deep,\n' },
        { contentDelta: 'Debug' },
        { contentDelta: ' brings the light.', isComplete: true },
      ];

      for (const chunk of streamChunks) {
        builder.addChunk(chunk);
      }

      // Finalize conversation
      const conversation = builder.finalize({
        model: 'claude-3-opus',
        stop_reason: 'end_turn',
      });

      expect(conversation.provider).toBe('anthropic');
      expect(conversation.external_id).toBe('claude-stream-1');
      expect(conversation.messages).toHaveLength(2);
      expect(conversation.messages[1].content).toContain('Code flows like water');
      expect(conversation.raw_metadata.model).toBe('claude-3-opus');
    });

    it('should handle multi-turn streaming conversation', async () => {
      // Requirement 6.1, 6.6: Multi-turn streaming
      const builderResult = chatCapture.createStreamingBuilder('openai', 'multi-turn-stream');
      
      expect(builderResult.ok).toBe(true);
      if (!builderResult.ok) return;

      const builder = builderResult.value;

      // Turn 1
      builder.addMessage({
        role: 'user',
        content: 'Count to 3',
      });

      builder.addChunk({ role: 'assistant', contentDelta: '1, 2, 3', isComplete: true });

      // Turn 2
      builder.addMessage({
        role: 'user',
        content: 'Now count to 5',
      });

      builder.addChunk({ role: 'assistant', contentDelta: '1, ' });
      builder.addChunk({ contentDelta: '2, ' });
      builder.addChunk({ contentDelta: '3, ' });
      builder.addChunk({ contentDelta: '4, ' });
      builder.addChunk({ contentDelta: '5', isComplete: true });

      // Turn 3
      builder.addMessage({
        role: 'user',
        content: 'Perfect!',
      });

      const conversation = builder.finalize();

      expect(conversation.messages).toHaveLength(5);
      expect(conversation.messages[0].content).toBe('Count to 3');
      expect(conversation.messages[1].content).toBe('1, 2, 3');
      expect(conversation.messages[2].content).toBe('Now count to 5');
      expect(conversation.messages[3].content).toBe('1, 2, 3, 4, 5');
      expect(conversation.messages[4].content).toBe('Perfect!');
    });

    it('should handle incomplete streaming message on finalize', async () => {
      // Requirement 6.6: Handle partial messages gracefully
      const builderResult = chatCapture.createStreamingBuilder('openai', 'incomplete-stream');
      
      expect(builderResult.ok).toBe(true);
      if (!builderResult.ok) return;

      const builder = builderResult.value;

      builder.addMessage({
        role: 'user',
        content: 'Start a story',
      });

      // Start streaming but don't mark as complete
      builder.addChunk({ role: 'assistant', contentDelta: 'Once upon' });
      builder.addChunk({ contentDelta: ' a time' });

      // Finalize should include incomplete message
      const conversation = builder.finalize();

      expect(conversation.messages).toHaveLength(2);
      expect(conversation.messages[1].content).toBe('Once upon a time');
    });

    it('should validate streaming conversation after finalization', async () => {
      // Requirement 5.6: Validation applies to streaming conversations
      const builderResult = chatCapture.createStreamingBuilder('openai', 'empty-stream');
      
      expect(builderResult.ok).toBe(true);
      if (!builderResult.ok) return;

      const builder = builderResult.value;

      // Create conversation with no messages
      const conversation = builder.finalize();

      // Validate the conversation
      const { ConversationValidator } = await import('../validator.js');
      const validator = new ConversationValidator();
      const validationResult = validator.validate(conversation);

      expect(validationResult.valid).toBe(false);
      expect(validationResult.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Complex real-world scenarios', () => {
    it('should handle large multi-conversation import with mixed validity', async () => {
      // Combined test: multi-conversation + skipInvalid + limits
      const capture = new ChatCapture({
        maxConversationsPerFile: 100,
        maxFileSize: 5 * 1024 * 1024,
      });

      const conversations = [];
      
      // Create 10 valid conversations
      for (let i = 0; i < 10; i++) {
        conversations.push({
          conversation_id: `valid-${i}`,
          title: `Valid Conversation ${i}`,
          mapping: {
            [`node-${i}`]: {
              id: `node-${i}`,
              message: {
                id: `msg-${i}`,
                author: { role: 'user' },
                content: { parts: [`Message ${i}`] },
                create_time: 1700000000 + i,
              },
              parent: null,
              children: [],
            },
          },
        });
      }

      const data = { conversations };
      const result = await capture.parseFile(
        JSON.stringify(data),
        'openai',
        { skipInvalid: true }
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(10);
        expect(result.value.every(c => c.messages.length > 0)).toBe(true);
      }
    });

    it('should handle code blocks and markdown preservation in streaming', async () => {
      // Requirement 1.7: Preserve message content including code blocks
      const builderResult = chatCapture.createStreamingBuilder('openai', 'code-stream');
      
      expect(builderResult.ok).toBe(true);
      if (!builderResult.ok) return;

      const builder = builderResult.value;

      builder.addMessage({
        role: 'user',
        content: 'Show me a Python function',
      });

      // Stream code block
      builder.addChunk({ role: 'assistant', contentDelta: 'Here is a Python function:\n\n```python\n' });
      builder.addChunk({ contentDelta: 'def hello():\n' });
      builder.addChunk({ contentDelta: '    print("Hello, World!")\n' });
      builder.addChunk({ contentDelta: '```\n\n' });
      builder.addChunk({ contentDelta: 'This function prints a greeting.', isComplete: true });

      const conversation = builder.finalize();

      expect(conversation.messages[1].content).toContain('```python');
      expect(conversation.messages[1].content).toContain('def hello()');
      expect(conversation.messages[1].content).toContain('print("Hello, World!")');
      expect(conversation.messages[1].content).toContain('```');
    });

    it('should handle Buffer input for file parsing', async () => {
      // Test Buffer input support
      const data = {
        mapping: {
          'node-1': {
            id: 'node-1',
            message: {
              id: 'msg-1',
              author: { role: 'user' },
              content: { parts: ['Buffer test'] },
              create_time: 1700000000,
            },
            parent: null,
            children: [],
          },
        },
      };

      const buffer = Buffer.from(JSON.stringify(data));
      const result = await chatCapture.parseFileAuto(buffer);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0].messages[0].content).toBe('Buffer test');
      }
    });
  });
});
