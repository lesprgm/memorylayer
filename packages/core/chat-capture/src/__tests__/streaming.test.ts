/**
 * Tests for StreamingConversationBuilder
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StreamingConversationBuilder } from '../streaming.js';
import { OpenAIParser } from '../parsers/openai.js';
import { AnthropicParser } from '../parsers/anthropic.js';

describe('StreamingConversationBuilder', () => {
  let openaiParser: OpenAIParser;
  let anthropicParser: AnthropicParser;

  beforeEach(() => {
    openaiParser = new OpenAIParser();
    anthropicParser = new AnthropicParser();
  });

  describe('constructor', () => {
    it('should initialize with provider, conversationId, and parser', () => {
      const builder = new StreamingConversationBuilder(
        'openai',
        'conv-123',
        openaiParser
      );

      const state = builder.getState();
      expect(state.conversationId).toBe('conv-123');
      expect(state.messageCount).toBe(0);
      expect(state.isFinalized).toBe(false);
      expect(state.currentMessage).toBeNull();
    });
  });

  describe('addChunk - incremental message assembly', () => {
    it('should assemble message from multiple chunks', () => {
      const builder = new StreamingConversationBuilder(
        'openai',
        'conv-123',
        openaiParser
      );

      // Add first chunk with role
      builder.addChunk({
        role: 'assistant',
        contentDelta: 'Hello',
      });

      let state = builder.getState();
      expect(state.currentMessage).not.toBeNull();
      expect(state.currentMessage?.role).toBe('assistant');
      expect(state.currentMessage?.content).toBe('Hello');
      expect(state.messageCount).toBe(0); // Not finalized yet

      // Add second chunk with more content
      builder.addChunk({
        contentDelta: ', world',
      });

      state = builder.getState();
      expect(state.currentMessage?.content).toBe('Hello, world');
      expect(state.messageCount).toBe(0);

      // Add final chunk marking completion
      builder.addChunk({
        contentDelta: '!',
        isComplete: true,
      });

      state = builder.getState();
      expect(state.currentMessage).toBeNull(); // Message finalized
      expect(state.messageCount).toBe(1);
    });

    it('should handle chunk with messageId', () => {
      const builder = new StreamingConversationBuilder(
        'openai',
        'conv-123',
        openaiParser
      );

      builder.addChunk({
        messageId: 'msg-456',
        role: 'user',
        contentDelta: 'Test message',
      });

      const state = builder.getState();
      expect(state.currentMessage?.id).toBe('msg-456');
    });

    it('should default to assistant role if not provided', () => {
      const builder = new StreamingConversationBuilder(
        'openai',
        'conv-123',
        openaiParser
      );

      builder.addChunk({
        contentDelta: 'Content without role',
      });

      const state = builder.getState();
      expect(state.currentMessage?.role).toBe('assistant');
    });

    it('should throw error when adding chunk to finalized conversation', () => {
      const builder = new StreamingConversationBuilder(
        'openai',
        'conv-123',
        openaiParser
      );

      builder.addMessage({ role: 'user', content: 'Hello' });
      builder.finalize();

      expect(() => {
        builder.addChunk({ contentDelta: 'More content' });
      }).toThrow(/Cannot add chunks to a finalized conversation/);
    });
  });

  describe('addMessage - complete messages', () => {
    it('should add complete message with all fields', () => {
      const builder = new StreamingConversationBuilder(
        'openai',
        'conv-123',
        openaiParser
      );

      const timestamp = new Date().toISOString();
      builder.addMessage({
        id: 'msg-1',
        role: 'user',
        content: 'Hello, AI!',
        created_at: timestamp,
        raw_metadata: { custom: 'data' },
      });

      const state = builder.getState();
      expect(state.messageCount).toBe(1);
      expect(state.currentMessage).toBeNull();
    });

    it('should generate defaults for missing fields', () => {
      const builder = new StreamingConversationBuilder(
        'openai',
        'conv-123',
        openaiParser
      );

      builder.addMessage({
        content: 'Message with minimal data',
      });

      const conversation = builder.finalize();
      expect(conversation.messages).toHaveLength(1);
      expect(conversation.messages[0].id).toBeDefined();
      expect(conversation.messages[0].role).toBe('assistant');
      expect(conversation.messages[0].created_at).toBeDefined();
    });

    it('should finalize current streaming message before adding complete message', () => {
      const builder = new StreamingConversationBuilder(
        'openai',
        'conv-123',
        openaiParser
      );

      // Start streaming message
      builder.addChunk({
        role: 'assistant',
        contentDelta: 'Streaming message',
      });

      let state = builder.getState();
      expect(state.currentMessage).not.toBeNull();
      expect(state.messageCount).toBe(0);

      // Add complete message (should finalize streaming message first)
      builder.addMessage({
        role: 'user',
        content: 'Complete message',
      });

      state = builder.getState();
      expect(state.currentMessage).toBeNull();
      expect(state.messageCount).toBe(2);
    });

    it('should throw error when adding message to finalized conversation', () => {
      const builder = new StreamingConversationBuilder(
        'openai',
        'conv-123',
        openaiParser
      );

      builder.finalize();

      expect(() => {
        builder.addMessage({ role: 'user', content: 'Hello' });
      }).toThrow(/Cannot add messages to a finalized conversation/);
    });
  });

  describe('finalize - create NormalizedConversation', () => {
    it('should create proper NormalizedConversation', () => {
      const builder = new StreamingConversationBuilder(
        'openai',
        'conv-123',
        openaiParser
      );

      builder.addMessage({
        role: 'user',
        content: 'First message',
      });

      builder.addMessage({
        role: 'assistant',
        content: 'Second message',
      });

      const conversation = builder.finalize();

      expect(conversation.id).toBeDefined();
      expect(conversation.provider).toBe('openai');
      expect(conversation.external_id).toBe('conv-123');
      expect(conversation.messages).toHaveLength(2);
      expect(conversation.created_at).toBeDefined();
      expect(conversation.updated_at).toBeDefined();
      expect(conversation.raw_metadata).toBeDefined();
    });

    it('should include metadata passed to finalize', () => {
      const builder = new StreamingConversationBuilder(
        'openai',
        'conv-123',
        openaiParser
      );

      builder.addMessage({
        role: 'user',
        content: 'Test',
      });

      const conversation = builder.finalize({
        model: 'gpt-4',
        temperature: 0.7,
      });

      expect(conversation.raw_metadata.model).toBe('gpt-4');
      expect(conversation.raw_metadata.temperature).toBe(0.7);
    });

    it('should finalize any remaining streaming message', () => {
      const builder = new StreamingConversationBuilder(
        'openai',
        'conv-123',
        openaiParser
      );

      // Add streaming chunks without marking complete
      builder.addChunk({
        role: 'assistant',
        contentDelta: 'Incomplete ',
      });

      builder.addChunk({
        contentDelta: 'message',
      });

      const state = builder.getState();
      expect(state.currentMessage).not.toBeNull();

      // Finalize should include the incomplete message
      const conversation = builder.finalize();
      expect(conversation.messages).toHaveLength(1);
      expect(conversation.messages[0].content).toBe('Incomplete message');
    });

    it('should use message timestamps for conversation timestamps', () => {
      const builder = new StreamingConversationBuilder(
        'openai',
        'conv-123',
        openaiParser
      );

      const firstTimestamp = '2024-01-01T10:00:00.000Z';
      const lastTimestamp = '2024-01-01T10:05:00.000Z';

      builder.addMessage({
        role: 'user',
        content: 'First',
        created_at: firstTimestamp,
      });

      builder.addMessage({
        role: 'assistant',
        content: 'Last',
        created_at: lastTimestamp,
      });

      const conversation = builder.finalize();
      expect(conversation.created_at).toBe(firstTimestamp);
      expect(conversation.updated_at).toBe(lastTimestamp);
    });

    it('should throw error when finalizing already finalized conversation', () => {
      const builder = new StreamingConversationBuilder(
        'openai',
        'conv-123',
        openaiParser
      );

      builder.addMessage({ role: 'user', content: 'Test' });
      builder.finalize();

      expect(() => {
        builder.finalize();
      }).toThrow(/Conversation has already been finalized/);
    });

    it('should handle empty conversation', () => {
      const builder = new StreamingConversationBuilder(
        'openai',
        'conv-123',
        openaiParser
      );

      const conversation = builder.finalize();
      expect(conversation.messages).toHaveLength(0);
      expect(conversation.created_at).toBeDefined();
      expect(conversation.updated_at).toBeDefined();
    });
  });

  describe('getState - accurate state reporting', () => {
    it('should return accurate state during message assembly', () => {
      const builder = new StreamingConversationBuilder(
        'openai',
        'conv-123',
        openaiParser
      );

      // Initial state
      let state = builder.getState();
      expect(state.conversationId).toBe('conv-123');
      expect(state.messageCount).toBe(0);
      expect(state.isFinalized).toBe(false);
      expect(state.currentMessage).toBeNull();

      // After starting streaming message
      builder.addChunk({
        role: 'assistant',
        contentDelta: 'Hello',
      });

      state = builder.getState();
      expect(state.messageCount).toBe(0);
      expect(state.currentMessage).not.toBeNull();
      expect(state.currentMessage?.content).toBe('Hello');

      // After completing message
      builder.addChunk({
        contentDelta: '!',
        isComplete: true,
      });

      state = builder.getState();
      expect(state.messageCount).toBe(1);
      expect(state.currentMessage).toBeNull();

      // After finalization
      builder.finalize();

      state = builder.getState();
      expect(state.isFinalized).toBe(true);
    });

    it('should not expose internal state (returns copy)', () => {
      const builder = new StreamingConversationBuilder(
        'openai',
        'conv-123',
        openaiParser
      );

      builder.addChunk({
        role: 'user',
        contentDelta: 'Test',
      });

      const state1 = builder.getState();
      const state2 = builder.getState();

      // Should be different objects
      expect(state1).not.toBe(state2);
      expect(state1.currentMessage).not.toBe(state2.currentMessage);
    });
  });

  describe('OpenAI streaming format', () => {
    it('should handle OpenAI streaming chunks', () => {
      const builder = new StreamingConversationBuilder(
        'openai',
        'conv-openai-123',
        openaiParser
      );

      // Simulate OpenAI streaming format
      builder.addChunk({
        messageId: 'chatcmpl-123',
        role: 'assistant',
        contentDelta: 'The',
      });

      builder.addChunk({
        contentDelta: ' quick',
      });

      builder.addChunk({
        contentDelta: ' brown',
      });

      builder.addChunk({
        contentDelta: ' fox',
        isComplete: true,
      });

      const conversation = builder.finalize({
        model: 'gpt-4',
        finish_reason: 'stop',
      });

      expect(conversation.provider).toBe('openai');
      expect(conversation.messages).toHaveLength(1);
      expect(conversation.messages[0].content).toBe('The quick brown fox');
      expect(conversation.raw_metadata.model).toBe('gpt-4');
    });

    it('should handle multi-turn OpenAI conversation', () => {
      const builder = new StreamingConversationBuilder(
        'openai',
        'conv-openai-456',
        openaiParser
      );

      // User message
      builder.addMessage({
        role: 'user',
        content: 'What is 2+2?',
      });

      // Assistant streaming response
      builder.addChunk({
        role: 'assistant',
        contentDelta: 'The answer',
      });

      builder.addChunk({
        contentDelta: ' is 4',
        isComplete: true,
      });

      const conversation = builder.finalize();
      expect(conversation.messages).toHaveLength(2);
      expect(conversation.messages[0].role).toBe('user');
      expect(conversation.messages[1].role).toBe('assistant');
    });
  });

  describe('Anthropic streaming format', () => {
    it('should handle Anthropic streaming chunks', () => {
      const builder = new StreamingConversationBuilder(
        'anthropic',
        'conv-claude-123',
        anthropicParser
      );

      // Simulate Anthropic/Claude streaming format
      builder.addChunk({
        messageId: 'msg_01ABC',
        role: 'assistant',
        contentDelta: 'Hello',
      });

      builder.addChunk({
        contentDelta: ' from',
      });

      builder.addChunk({
        contentDelta: ' Claude',
        isComplete: true,
      });

      const conversation = builder.finalize({
        model: 'claude-3-opus',
        stop_reason: 'end_turn',
      });

      expect(conversation.provider).toBe('anthropic');
      expect(conversation.messages).toHaveLength(1);
      expect(conversation.messages[0].content).toBe('Hello from Claude');
      expect(conversation.raw_metadata.model).toBe('claude-3-opus');
    });

    it('should handle multi-turn Anthropic conversation', () => {
      const builder = new StreamingConversationBuilder(
        'anthropic',
        'conv-claude-789',
        anthropicParser
      );

      // User message
      builder.addMessage({
        role: 'user',
        content: 'Tell me a joke',
      });

      // Assistant streaming response
      builder.addChunk({
        role: 'assistant',
        contentDelta: 'Why did the',
      });

      builder.addChunk({
        contentDelta: ' chicken cross',
      });

      builder.addChunk({
        contentDelta: ' the road?',
        isComplete: true,
      });

      // User follow-up
      builder.addMessage({
        role: 'user',
        content: 'Why?',
      });

      // Assistant response
      builder.addChunk({
        role: 'assistant',
        contentDelta: 'To get to the other side!',
        isComplete: true,
      });

      const conversation = builder.finalize();
      expect(conversation.messages).toHaveLength(4);
      expect(conversation.messages[0].content).toBe('Tell me a joke');
      expect(conversation.messages[1].content).toBe('Why did the chicken cross the road?');
      expect(conversation.messages[2].content).toBe('Why?');
      expect(conversation.messages[3].content).toBe('To get to the other side!');
    });
  });

  describe('edge cases', () => {
    it('should handle empty content deltas', () => {
      const builder = new StreamingConversationBuilder(
        'openai',
        'conv-123',
        openaiParser
      );

      builder.addChunk({
        role: 'assistant',
        contentDelta: '',
      });

      builder.addChunk({
        contentDelta: 'Content',
        isComplete: true,
      });

      const conversation = builder.finalize();
      expect(conversation.messages[0].content).toBe('Content');
    });

    it('should handle chunks with only role', () => {
      const builder = new StreamingConversationBuilder(
        'openai',
        'conv-123',
        openaiParser
      );

      builder.addChunk({
        role: 'assistant',
      });

      builder.addChunk({
        contentDelta: 'Content after role',
        isComplete: true,
      });

      const conversation = builder.finalize();
      expect(conversation.messages[0].role).toBe('assistant');
      expect(conversation.messages[0].content).toBe('Content after role');
    });

    it('should handle rapid chunk additions', () => {
      const builder = new StreamingConversationBuilder(
        'openai',
        'conv-123',
        openaiParser
      );

      // Add many small chunks rapidly
      for (let i = 0; i < 100; i++) {
        builder.addChunk({
          contentDelta: `${i} `,
        });
      }

      builder.addChunk({
        isComplete: true,
      });

      const conversation = builder.finalize();
      expect(conversation.messages).toHaveLength(1);
      expect(conversation.messages[0].content).toContain('0 ');
      expect(conversation.messages[0].content).toContain('99 ');
    });
  });
});
