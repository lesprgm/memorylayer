/**
 * Integration tests for custom memory types in extraction workflow
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryExtractor } from '../index.js';
import { 
  MemoryTypeConfig, 
  LLMProvider, 
  ModelParams, 
  JSONSchema,
  NormalizedConversation,
  ExtractedMemory
} from '../types.js';
import { StructuredOutputStrategy } from '../strategies/structured.js';

// Mock LLM Provider that returns custom memory types
class MockLLMProviderWithCustomTypes implements LLMProvider {
  readonly name = 'mock-custom';

  async complete(prompt: string, params: ModelParams): Promise<string> {
    return JSON.stringify({
      memories: [],
      relationships: []
    });
  }

  async completeStructured<T>(prompt: string, schema: JSONSchema, params: ModelParams): Promise<T> {
    // Return a result with custom memory type
    return {
      memories: [
        {
          type: 'task',
          content: 'Implement user authentication',
          confidence: 0.9,
          metadata: {
            task: 'Implement user authentication',
            assignee: 'John Doe',
            dueDate: '2024-12-31',
            priority: 'high'
          }
        },
        {
          type: 'preference',
          content: 'User prefers dark mode',
          confidence: 0.85,
          metadata: {
            preference: 'theme',
            value: 'dark'
          }
        }
      ],
      relationships: []
    } as T;
  }

  async completeWithFunctions(prompt: string, functions: any[], params: ModelParams): Promise<any> {
    return {
      functionName: 'extract_memories',
      arguments: {}
    };
  }
}

describe('Custom Memory Type Integration', () => {
  let extractor: MemoryExtractor;
  let mockConversation: NormalizedConversation;

  beforeEach(() => {
    extractor = new MemoryExtractor({
      provider: new MockLLMProviderWithCustomTypes(),
      strategy: new StructuredOutputStrategy(),
      memoryTypes: ['task', 'preference'],
      minConfidence: 0.5
    });

    mockConversation = {
      id: 'conv-123',
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          content: 'We need to implement user authentication by end of year',
          timestamp: '2024-01-01T00:00:00Z'
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'I can help with that. I\'ll assign it to John Doe.',
          timestamp: '2024-01-01T00:01:00Z'
        },
        {
          id: 'msg-3',
          role: 'user',
          content: 'Also, I prefer using dark mode',
          timestamp: '2024-01-01T00:02:00Z'
        }
      ]
    };
  });

  it('should extract custom memory types when registered', async () => {
    // Register custom memory types
    const taskConfig: MemoryTypeConfig = {
      type: 'task',
      extractionPrompt: 'Extract action items and tasks from the conversation',
      schema: {
        type: 'object',
        properties: {
          task: { type: 'string' },
          assignee: { type: 'string' },
          dueDate: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] }
        },
        required: ['task']
      }
    };

    const preferenceConfig: MemoryTypeConfig = {
      type: 'preference',
      extractionPrompt: 'Extract user preferences and settings',
      schema: {
        type: 'object',
        properties: {
          preference: { type: 'string' },
          value: { type: 'string' }
        },
        required: ['preference', 'value']
      }
    };

    extractor.registerMemoryType('task', taskConfig);
    extractor.registerMemoryType('preference', preferenceConfig);

    // Extract memories
    const result = await extractor.extract(mockConversation, 'workspace-1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.memories.length).toBeGreaterThan(0);
      
      // Check that custom memory types were extracted
      const taskMemories = result.value.memories.filter(m => m.type === 'task');
      const preferenceMemories = result.value.memories.filter(m => m.type === 'preference');
      
      expect(taskMemories.length).toBeGreaterThan(0);
      expect(preferenceMemories.length).toBeGreaterThan(0);
      
      // Verify task memory structure
      const taskMemory = taskMemories[0];
      expect(taskMemory.metadata.task).toBeDefined();
      expect(taskMemory.metadata.assignee).toBeDefined();
      expect(taskMemory.workspace_id).toBe('workspace-1');
      expect(taskMemory.conversation_id).toBe('conv-123');
      
      // Verify preference memory structure
      const preferenceMemory = preferenceMemories[0];
      expect(preferenceMemory.metadata.preference).toBeDefined();
      expect(preferenceMemory.metadata.value).toBeDefined();
    }
  });

  it('should validate custom memory types against schema', async () => {
    // Register custom memory type with strict schema
    const taskConfig: MemoryTypeConfig = {
      type: 'task',
      extractionPrompt: 'Extract tasks',
      schema: {
        type: 'object',
        properties: {
          task: { type: 'string' },
          assignee: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] }
        },
        required: ['task', 'assignee']
      }
    };

    extractor.registerMemoryType('task', taskConfig);

    const result = await extractor.extract(mockConversation, 'workspace-1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      // All extracted task memories should have required fields
      const taskMemories = result.value.memories.filter(m => m.type === 'task');
      for (const memory of taskMemories) {
        expect(memory.metadata.task).toBeDefined();
        expect(memory.metadata.assignee).toBeDefined();
      }
    }
  });

  it('should use custom validator when provided', async () => {
    // Register custom memory type with validator
    const preferenceConfig: MemoryTypeConfig = {
      type: 'preference',
      extractionPrompt: 'Extract preferences',
      schema: {
        type: 'object',
        properties: {
          preference: { type: 'string' },
          value: { type: 'string' }
        }
      },
      validator: (memory: ExtractedMemory) => {
        // Only accept preferences with value length > 2
        return memory.metadata.value && memory.metadata.value.length > 2;
      }
    };

    extractor.registerMemoryType('preference', preferenceConfig);

    const result = await extractor.extract(mockConversation, 'workspace-1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      // All preference memories should pass the validator
      const preferenceMemories = result.value.memories.filter(m => m.type === 'preference');
      for (const memory of preferenceMemories) {
        expect(memory.metadata.value.length).toBeGreaterThan(2);
      }
    }
  });

  it('should work with mix of default and custom memory types', async () => {
    // Use both default and custom types
    const extractorMixed = new MemoryExtractor({
      provider: new MockLLMProviderWithCustomTypes(),
      strategy: new StructuredOutputStrategy(),
      memoryTypes: ['entity', 'fact', 'task'],  // Mix of default and custom
      minConfidence: 0.5
    });

    const taskConfig: MemoryTypeConfig = {
      type: 'task',
      extractionPrompt: 'Extract tasks',
      schema: {
        type: 'object',
        properties: {
          task: { type: 'string' }
        }
      }
    };

    extractorMixed.registerMemoryType('task', taskConfig);

    const result = await extractorMixed.extract(mockConversation, 'workspace-1');

    expect(result.ok).toBe(true);
    // Should be able to extract both default and custom types
  });
});
