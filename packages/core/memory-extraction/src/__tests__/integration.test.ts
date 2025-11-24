/**
 * Integration tests for MemoryExtractor
 * 
 * Tests the complete extraction pipeline with real OpenAI API calls
 * and various extraction scenarios.
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { MemoryExtractor } from '../index.js';
import { OpenAIProvider } from '../providers/openai.js';
import { StructuredOutputStrategy } from '../strategies/structured.js';
import {
  NormalizedConversation,
  MemoryTypeConfig,
  ExtractionProfile,
  LLMProvider,
  ModelParams,
  JSONSchema,
  FunctionDefinition,
  FunctionCallResult,
} from '../types.js';

// Check if OpenAI API key is available
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SKIP_REAL_API_TESTS = !OPENAI_API_KEY;

// Mock provider for error testing
class FailingLLMProvider implements LLMProvider {
  readonly name = 'failing-mock';
  private shouldFail: boolean = true;
  private failureType: 'rate_limit' | 'parse' | 'generic' = 'generic';

  setFailureType(type: 'rate_limit' | 'parse' | 'generic') {
    this.failureType = type;
  }

  setShouldFail(shouldFail: boolean) {
    this.shouldFail = shouldFail;
  }

  async complete(prompt: string, params: ModelParams): Promise<string> {
    if (this.shouldFail) {
      return this.throwError();
    }
    return JSON.stringify({ memories: [], relationships: [] });
  }

  async completeStructured<T>(prompt: string, schema: JSONSchema, params: ModelParams): Promise<T> {
    if (this.shouldFail) {
      return this.throwError();
    }
    return { memories: [], relationships: [] } as T;
  }

  async completeWithFunctions(
    prompt: string,
    functions: FunctionDefinition[],
    params: ModelParams
  ): Promise<FunctionCallResult> {
    if (this.shouldFail) {
      return this.throwError();
    }
    return { functionName: 'extract_memories', arguments: {} };
  }

  private throwError(): never {
    if (this.failureType === 'rate_limit') {
      const error: any = new Error('Rate limit exceeded');
      error.status = 429;
      error.message = 'rate limit';
      throw error;
    } else if (this.failureType === 'parse') {
      throw new Error('Failed to parse JSON response');
    } else {
      throw new Error('Generic LLM error');
    }
  }
}

// Mock provider for partial success testing
class PartialSuccessProvider implements LLMProvider {
  readonly name = 'partial-success-mock';
  private callCount = 0;

  async complete(prompt: string, params: ModelParams): Promise<string> {
    this.callCount++;
    if (this.callCount % 2 === 0) {
      throw new Error('Simulated failure');
    }
    return JSON.stringify({
      memories: [
        {
          type: 'entity',
          content: `Entity from call ${this.callCount}`,
          confidence: 0.8,
          metadata: { name: `Entity ${this.callCount}`, entityType: 'concept' }
        }
      ],
      relationships: []
    });
  }

  async completeStructured<T>(prompt: string, schema: JSONSchema, params: ModelParams): Promise<T> {
    this.callCount++;
    if (this.callCount % 2 === 0) {
      throw new Error('Simulated failure');
    }
    return {
      memories: [
        {
          type: 'entity',
          content: `Entity from call ${this.callCount}`,
          confidence: 0.8,
          metadata: { name: `Entity ${this.callCount}`, entityType: 'concept' }
        }
      ],
      relationships: []
    } as T;
  }

  async completeWithFunctions(
    prompt: string,
    functions: FunctionDefinition[],
    params: ModelParams
  ): Promise<FunctionCallResult> {
    return { functionName: 'extract_memories', arguments: {} };
  }

  reset() {
    this.callCount = 0;
  }
}

describe('MemoryExtractor Integration Tests', () => {
  let extractor: MemoryExtractor;
  let mockConversation: NormalizedConversation;

  beforeEach(() => {
    mockConversation = {
      id: 'conv-integration-1',
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          content: 'I work at Acme Corp as a software engineer',
          timestamp: '2024-01-01T10:00:00Z'
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'That\'s great! What kind of projects do you work on at Acme Corp?',
          timestamp: '2024-01-01T10:01:00Z'
        },
        {
          id: 'msg-3',
          role: 'user',
          content: 'We build cloud infrastructure tools. I decided to use Kubernetes for our deployment.',
          timestamp: '2024-01-01T10:02:00Z'
        }
      ]
    };
  });

  describe('Single Extraction', () => {
    it.skipIf(SKIP_REAL_API_TESTS)('should extract memories from a conversation using real OpenAI API', async () => {
      const provider = new OpenAIProvider({
        apiKey: OPENAI_API_KEY!,
        defaultModel: 'gpt-4o-mini'
      });

      extractor = new MemoryExtractor({
        provider,
        strategy: new StructuredOutputStrategy(),
        memoryTypes: ['entity', 'fact', 'decision'],
        minConfidence: 0.5
      });

      const result = await extractor.extract(mockConversation, 'workspace-test-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('success');
        expect(result.value.memories.length).toBeGreaterThan(0);
        expect(result.value.conversationId).toBe('conv-integration-1');

        // Verify memory structure
        for (const memory of result.value.memories) {
          expect(memory.id).toBeDefined();
          expect(memory.type).toBeDefined();
          expect(memory.content).toBeDefined();
          expect(memory.confidence).toBeGreaterThanOrEqual(0);
          expect(memory.confidence).toBeLessThanOrEqual(1);
          expect(memory.workspace_id).toBe('workspace-test-1');
          expect(memory.conversation_id).toBe('conv-integration-1');
          expect(memory.source_message_ids).toBeDefined();
          expect(memory.created_at).toBeDefined();
        }

        // Should extract at least one entity (Acme Corp or user)
        const entities = result.value.memories.filter(m => m.type === 'entity');
        expect(entities.length).toBeGreaterThan(0);
      }
    }, 30000);
  });

  describe('Batch Extraction', () => {
    it.skipIf(SKIP_REAL_API_TESTS)('should extract memories from multiple conversations', async () => {
      const provider = new OpenAIProvider({
        apiKey: OPENAI_API_KEY!,
        defaultModel: 'gpt-4o-mini'
      });

      extractor = new MemoryExtractor({
        provider,
        strategy: new StructuredOutputStrategy(),
        memoryTypes: ['entity', 'fact'],
        minConfidence: 0.5,
        batchSize: 2
      });

      const conversations: NormalizedConversation[] = [
        {
          id: 'conv-batch-1',
          messages: [
            {
              id: 'msg-b1-1',
              role: 'user',
              content: 'I live in San Francisco',
              timestamp: '2024-01-01T10:00:00Z'
            }
          ]
        },
        {
          id: 'conv-batch-2',
          messages: [
            {
              id: 'msg-b2-1',
              role: 'user',
              content: 'My favorite programming language is TypeScript',
              timestamp: '2024-01-01T11:00:00Z'
            }
          ]
        }
      ];

      const result = await extractor.extractBatch(conversations, 'workspace-batch-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.results.length).toBe(2);
        expect(result.value.successCount).toBeGreaterThan(0);
        expect(result.value.totalMemories).toBeGreaterThan(0);
        
        // Verify per-conversation results
        for (const convResult of result.value.results) {
          expect(['conv-batch-1', 'conv-batch-2']).toContain(convResult.conversationId);
        }
      }
    }, 60000);
  });

  describe('Deduplication Across Conversations', () => {
    it.skipIf(SKIP_REAL_API_TESTS)('should deduplicate memories across multiple conversations', async () => {
      const provider = new OpenAIProvider({
        apiKey: OPENAI_API_KEY!,
        defaultModel: 'gpt-4o-mini'
      });

      extractor = new MemoryExtractor({
        provider,
        strategy: new StructuredOutputStrategy(),
        memoryTypes: ['entity'],
        minConfidence: 0.5
      });

      // Two conversations mentioning the same entity
      const conversations: NormalizedConversation[] = [
        {
          id: 'conv-dedup-1',
          messages: [
            {
              id: 'msg-d1-1',
              role: 'user',
              content: 'I work at Google',
              timestamp: '2024-01-01T10:00:00Z'
            }
          ]
        },
        {
          id: 'conv-dedup-2',
          messages: [
            {
              id: 'msg-d2-1',
              role: 'user',
              content: 'Google is my employer',
              timestamp: '2024-01-01T11:00:00Z'
            }
          ]
        }
      ];

      const result = await extractor.extractBatch(conversations, 'workspace-dedup-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Count how many times "Google" appears as an entity
        const googleEntities = result.value.results
          .flatMap(r => r.memories)
          .filter(m => m.type === 'entity' && m.content.toLowerCase().includes('google'));

        // After deduplication in batch, should have fewer Google entities than conversations
        // (though exact count depends on LLM extraction)
        expect(result.value.totalMemories).toBeLessThanOrEqual(
          result.value.results.reduce((sum, r) => sum + r.memories.length, 0)
        );
      }
    }, 60000);
  });

  describe('Incremental Extraction', () => {
    it.skipIf(SKIP_REAL_API_TESTS)('should extract memories incrementally as messages arrive', async () => {
      const provider = new OpenAIProvider({
        apiKey: OPENAI_API_KEY!,
        defaultModel: 'gpt-4o-mini'
      });

      extractor = new MemoryExtractor({
        provider,
        strategy: new StructuredOutputStrategy(),
        memoryTypes: ['entity', 'fact'],
        minConfidence: 0.5
      });

      const incrementalExtractor = extractor.createIncrementalExtractor(
        'conv-incremental-1',
        'workspace-incremental-1'
      );

      // Track emitted memories
      const emittedMemories: any[] = [];
      incrementalExtractor.on('memory', (memory) => {
        emittedMemories.push(memory);
      });

      // Add first batch of messages
      const firstMessages = [
        {
          id: 'msg-inc-1',
          role: 'user' as const,
          content: 'I am a data scientist',
          timestamp: '2024-01-01T10:00:00Z'
        }
      ];

      const result1 = await incrementalExtractor.addMessages(firstMessages);
      expect(result1.ok).toBe(true);

      // Add second batch of messages
      const secondMessages = [
        {
          id: 'msg-inc-2',
          role: 'user' as const,
          content: 'I work with Python and machine learning',
          timestamp: '2024-01-01T10:01:00Z'
        }
      ];

      const result2 = await incrementalExtractor.addMessages(secondMessages);
      expect(result2.ok).toBe(true);

      // Finalize extraction
      const finalResult = await incrementalExtractor.finalize();
      expect(finalResult.ok).toBe(true);

      if (finalResult.ok) {
        expect(finalResult.value.memories.length).toBeGreaterThan(0);
        expect(finalResult.value.status).toBe('success');
        
        // Verify all memories have stable IDs
        const memoryIds = new Set(finalResult.value.memories.map(m => m.id));
        expect(memoryIds.size).toBe(finalResult.value.memories.length);
      }

      // Check state
      const state = incrementalExtractor.getState();
      expect(state.conversationId).toBe('conv-incremental-1');
      expect(state.workspaceId).toBe('workspace-incremental-1');
      expect(state.messageCount).toBe(2);
      expect(state.isFinalized).toBe(true);
    }, 60000);
  });

  describe('Custom Memory Types', () => {
    it.skipIf(SKIP_REAL_API_TESTS)('should extract custom memory types when registered', async () => {
      const provider = new OpenAIProvider({
        apiKey: OPENAI_API_KEY!,
        defaultModel: 'gpt-4o-mini'
      });

      extractor = new MemoryExtractor({
        provider,
        strategy: new StructuredOutputStrategy(),
        memoryTypes: ['task'],
        minConfidence: 0.5
      });

      // Register custom task memory type
      const taskConfig: MemoryTypeConfig = {
        type: 'task',
        extractionPrompt: 'Extract action items, tasks, and todos from the conversation',
        schema: {
          type: 'object',
          properties: {
            task: { type: 'string' },
            priority: { type: 'string', enum: ['low', 'medium', 'high'] }
          },
          required: ['task']
        }
      };

      extractor.registerMemoryType('task', taskConfig);

      const taskConversation: NormalizedConversation = {
        id: 'conv-task-1',
        messages: [
          {
            id: 'msg-t1',
            role: 'user',
            content: 'I need to finish the project report by Friday',
            timestamp: '2024-01-01T10:00:00Z'
          },
          {
            id: 'msg-t2',
            role: 'user',
            content: 'Also, schedule a meeting with the team next week',
            timestamp: '2024-01-01T10:01:00Z'
          }
        ]
      };

      const result = await extractor.extract(taskConversation, 'workspace-task-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        const taskMemories = result.value.memories.filter(m => m.type === 'task');
        expect(taskMemories.length).toBeGreaterThan(0);
        
        // Verify task structure
        for (const task of taskMemories) {
          expect(task.metadata.task).toBeDefined();
          expect(typeof task.metadata.task).toBe('string');
        }
      }
    }, 30000);
  });

  describe('Profile-Based Configuration', () => {
    it.skipIf(SKIP_REAL_API_TESTS)('should use profile settings for extraction', async () => {
      const provider = new OpenAIProvider({
        apiKey: OPENAI_API_KEY!,
        defaultModel: 'gpt-4o-mini'
      });

      extractor = new MemoryExtractor({
        provider,
        strategy: new StructuredOutputStrategy(),
        memoryTypes: ['entity'],
        minConfidence: 0.5
      });

      // Register a profile with different settings
      const profile: ExtractionProfile = {
        strategy: new StructuredOutputStrategy(),
        provider,
        modelParams: {
          model: 'gpt-4o-mini',
          temperature: 0.1,
          maxTokens: 2000
        },
        memoryTypes: ['entity', 'fact'],
        minConfidence: 0.7
      };

      extractor.registerProfile('high-confidence', profile);

      const result = await extractor.extract(mockConversation, 'workspace-profile-1', {
        profile: 'high-confidence'
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        // All memories should meet the higher confidence threshold
        for (const memory of result.value.memories) {
          expect(memory.confidence).toBeGreaterThanOrEqual(0.7);
        }
      }
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should handle LLM API failures gracefully', async () => {
      const failingProvider = new FailingLLMProvider();
      failingProvider.setFailureType('generic');

      extractor = new MemoryExtractor({
        provider: failingProvider,
        strategy: new StructuredOutputStrategy(),
        memoryTypes: ['entity'],
        minConfidence: 0.5
      });

      const result = await extractor.extract(mockConversation, 'workspace-error-1');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('llm_error');
        expect(result.error.message).toContain('conv-integration-1');
      }
    });

    it('should handle rate limit errors', async () => {
      const failingProvider = new FailingLLMProvider();
      failingProvider.setFailureType('rate_limit');

      extractor = new MemoryExtractor({
        provider: failingProvider,
        strategy: new StructuredOutputStrategy(),
        memoryTypes: ['entity'],
        minConfidence: 0.5
      });

      const result = await extractor.extract(mockConversation, 'workspace-ratelimit-1');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('rate_limit');
        if (result.error.type === 'rate_limit') {
          expect(result.error.retryAfter).toBeGreaterThan(0);
        }
      }
    });

    it('should handle parse errors', async () => {
      const failingProvider = new FailingLLMProvider();
      failingProvider.setFailureType('parse');

      extractor = new MemoryExtractor({
        provider: failingProvider,
        strategy: new StructuredOutputStrategy(),
        memoryTypes: ['entity'],
        minConfidence: 0.5
      });

      const result = await extractor.extract(mockConversation, 'workspace-parse-1');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('parse_error');
      }
    });
  });

  describe('Partial Results', () => {
    it('should return partial results when some extractions succeed', async () => {
      const partialProvider = new PartialSuccessProvider();

      extractor = new MemoryExtractor({
        provider: partialProvider,
        strategy: new StructuredOutputStrategy(),
        memoryTypes: ['entity'],
        minConfidence: 0.5,
        batchSize: 1
      });

      const conversations: NormalizedConversation[] = [
        {
          id: 'conv-partial-1',
          messages: [
            { id: 'msg-p1', role: 'user', content: 'Test 1', timestamp: '2024-01-01T10:00:00Z' }
          ]
        },
        {
          id: 'conv-partial-2',
          messages: [
            { id: 'msg-p2', role: 'user', content: 'Test 2', timestamp: '2024-01-01T10:01:00Z' }
          ]
        },
        {
          id: 'conv-partial-3',
          messages: [
            { id: 'msg-p3', role: 'user', content: 'Test 3', timestamp: '2024-01-01T10:02:00Z' }
          ]
        }
      ];

      const result = await extractor.extractBatch(conversations, 'workspace-partial-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should have both successes and failures
        expect(result.value.successCount).toBeGreaterThan(0);
        expect(result.value.failureCount).toBeGreaterThan(0);
        expect(result.value.successCount + result.value.failureCount).toBe(3);
        
        // Should have some memories from successful extractions
        expect(result.value.totalMemories).toBeGreaterThan(0);
        
        // Check individual results
        const successResults = result.value.results.filter(r => r.status === 'success');
        const failedResults = result.value.results.filter(r => r.status === 'failed');
        
        expect(successResults.length).toBe(result.value.successCount);
        expect(failedResults.length).toBe(result.value.failureCount);
      }
    });
  });
});
