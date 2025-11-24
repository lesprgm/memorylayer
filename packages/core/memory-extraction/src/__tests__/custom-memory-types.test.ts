/**
 * Tests for custom memory type registration
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryExtractor } from '../index.js';
import { MemoryTypeConfig, LLMProvider, ModelParams, JSONSchema } from '../types.js';

// Mock LLM Provider for testing
class MockLLMProvider implements LLMProvider {
  readonly name = 'mock';

  async complete(prompt: string, params: ModelParams): Promise<string> {
    return JSON.stringify({
      memories: [],
      relationships: []
    });
  }

  async completeStructured<T>(prompt: string, schema: JSONSchema, params: ModelParams): Promise<T> {
    return {
      memories: [],
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

// Mock Strategy
class MockStrategy {
  readonly name = 'mock-strategy';

  async extract(): Promise<any> {
    return {
      memories: [],
      relationships: []
    };
  }

  async extractIncremental(): Promise<any> {
    return {
      memories: [],
      relationships: []
    };
  }
}

describe('Custom Memory Type Registration', () => {
  let extractor: MemoryExtractor;

  beforeEach(() => {
    extractor = new MemoryExtractor({
      provider: new MockLLMProvider(),
      strategy: new MockStrategy() as any,
    });
  });

  describe('registerMemoryType', () => {
    it('should register a custom memory type successfully', () => {
      const customConfig: MemoryTypeConfig = {
        type: 'task',
        extractionPrompt: 'Extract action items and tasks from the conversation',
        schema: {
          type: 'object',
          properties: {
            task: { type: 'string' },
            assignee: { type: 'string' },
            dueDate: { type: 'string' }
          },
          required: ['task']
        }
      };

      expect(() => {
        extractor.registerMemoryType('task', customConfig);
      }).not.toThrow();
    });

    it('should register a custom memory type with validator', () => {
      const customConfig: MemoryTypeConfig = {
        type: 'preference',
        extractionPrompt: 'Extract user preferences',
        schema: {
          type: 'object',
          properties: {
            preference: { type: 'string' },
            value: { type: 'string' }
          }
        },
        validator: (memory) => {
          return memory.metadata.preference && memory.metadata.preference.length > 3;
        }
      };

      expect(() => {
        extractor.registerMemoryType('preference', customConfig);
      }).not.toThrow();
    });

    it('should throw error for empty type name', () => {
      const customConfig: MemoryTypeConfig = {
        type: '',
        extractionPrompt: 'Test prompt'
      };

      expect(() => {
        extractor.registerMemoryType('', customConfig);
      }).toThrow('Memory type name must be a non-empty string');
    });

    it('should throw error for conflicting with default types', () => {
      const customConfig: MemoryTypeConfig = {
        type: 'entity',
        extractionPrompt: 'Custom entity extraction'
      };

      expect(() => {
        extractor.registerMemoryType('entity', customConfig);
      }).toThrow('conflicts with default type');
    });

    it('should throw error for mismatched type in config', () => {
      const customConfig: MemoryTypeConfig = {
        type: 'wrong_type',
        extractionPrompt: 'Test prompt'
      };

      expect(() => {
        extractor.registerMemoryType('task', customConfig);
      }).toThrow('must match the registered type name');
    });

    it('should throw error for empty extraction prompt', () => {
      const customConfig: MemoryTypeConfig = {
        type: 'task',
        extractionPrompt: ''
      };

      expect(() => {
        extractor.registerMemoryType('task', customConfig);
      }).toThrow('must have a non-empty extractionPrompt');
    });

    it('should throw error for invalid schema', () => {
      const customConfig: MemoryTypeConfig = {
        type: 'task',
        extractionPrompt: 'Extract tasks',
        schema: {
          type: 'object'
          // Missing properties field
        }
      };

      expect(() => {
        extractor.registerMemoryType('task', customConfig);
      }).toThrow('must have a \'properties\' field');
    });

    it('should allow registering multiple custom types', () => {
      const taskConfig: MemoryTypeConfig = {
        type: 'task',
        extractionPrompt: 'Extract tasks'
      };

      const preferenceConfig: MemoryTypeConfig = {
        type: 'preference',
        extractionPrompt: 'Extract preferences'
      };

      expect(() => {
        extractor.registerMemoryType('task', taskConfig);
        extractor.registerMemoryType('preference', preferenceConfig);
      }).not.toThrow();
    });

    it('should handle case-insensitive type names', () => {
      const customConfig: MemoryTypeConfig = {
        type: 'Task',
        extractionPrompt: 'Extract tasks'
      };

      expect(() => {
        extractor.registerMemoryType('Task', customConfig);
      }).not.toThrow();

      // Should not allow registering same type with different case
      const duplicateConfig: MemoryTypeConfig = {
        type: 'task',
        extractionPrompt: 'Extract tasks again'
      };

      // This should overwrite the previous registration (same normalized key)
      expect(() => {
        extractor.registerMemoryType('task', duplicateConfig);
      }).not.toThrow();
    });
  });

  describe('Schema validation', () => {
    it('should validate schema type field', () => {
      const customConfig: MemoryTypeConfig = {
        type: 'task',
        extractionPrompt: 'Extract tasks',
        schema: {
          // Missing type field
          properties: {
            task: { type: 'string' }
          }
        } as any
      };

      expect(() => {
        extractor.registerMemoryType('task', customConfig);
      }).toThrow('schema must have a \'type\' field');
    });

    it('should accept valid array schema', () => {
      const customConfig: MemoryTypeConfig = {
        type: 'list',
        extractionPrompt: 'Extract lists',
        schema: {
          type: 'array',
          items: { type: 'string' }
        }
      };

      expect(() => {
        extractor.registerMemoryType('list', customConfig);
      }).not.toThrow();
    });
  });
});
