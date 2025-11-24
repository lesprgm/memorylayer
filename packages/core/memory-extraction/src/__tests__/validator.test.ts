/**
 * Tests for MemoryValidator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryValidator } from '../validator.js';
import { ExtractedMemory, ExtractedRelationship } from '../types.js';

describe('MemoryValidator', () => {
  let validator: MemoryValidator;

  beforeEach(() => {
    validator = new MemoryValidator();
  });

  describe('validate', () => {
    it('should validate a valid memory', () => {
      const memory: ExtractedMemory = {
        id: 'mem-1',
        type: 'fact',
        content: 'The sky is blue',
        confidence: 0.9,
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-1'],
        metadata: {},
        created_at: '2024-01-01T00:00:00Z'
      };

      const result = validator.validate(memory);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject memory with missing type', () => {
      const memory: ExtractedMemory = {
        id: 'mem-1',
        type: '',
        content: 'The sky is blue',
        confidence: 0.9,
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-1'],
        metadata: {},
        created_at: '2024-01-01T00:00:00Z'
      };

      const result = validator.validate(memory);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe('type');
      expect(result.errors[0].message).toBe('Memory type is required');
      expect(result.errors[0].memoryId).toBe('mem-1');
    });

    it('should reject memory with missing content', () => {
      const memory: ExtractedMemory = {
        id: 'mem-1',
        type: 'fact',
        content: '',
        confidence: 0.9,
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-1'],
        metadata: {},
        created_at: '2024-01-01T00:00:00Z'
      };

      const result = validator.validate(memory);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'content' && e.message === 'Memory content is required')).toBe(true);
    });

    it('should reject memory with missing confidence', () => {
      const memory: any = {
        id: 'mem-1',
        type: 'fact',
        content: 'The sky is blue',
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-1'],
        metadata: {},
        created_at: '2024-01-01T00:00:00Z'
      };

      const result = validator.validate(memory);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'confidence' && e.message === 'Memory confidence is required')).toBe(true);
    });

    it('should reject memory with missing workspace_id', () => {
      const memory: ExtractedMemory = {
        id: 'mem-1',
        type: 'fact',
        content: 'The sky is blue',
        confidence: 0.9,
        workspace_id: '',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-1'],
        metadata: {},
        created_at: '2024-01-01T00:00:00Z'
      };

      const result = validator.validate(memory);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'workspace_id' && e.message === 'Memory workspace_id is required')).toBe(true);
    });

    it('should reject memory with missing conversation_id', () => {
      const memory: ExtractedMemory = {
        id: 'mem-1',
        type: 'fact',
        content: 'The sky is blue',
        confidence: 0.9,
        workspace_id: 'workspace-1',
        conversation_id: '',
        source_message_ids: ['msg-1'],
        metadata: {},
        created_at: '2024-01-01T00:00:00Z'
      };

      const result = validator.validate(memory);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'conversation_id' && e.message === 'Memory conversation_id is required')).toBe(true);
    });

    it('should reject memory with confidence below 0', () => {
      const memory: ExtractedMemory = {
        id: 'mem-1',
        type: 'fact',
        content: 'The sky is blue',
        confidence: -0.1,
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-1'],
        metadata: {},
        created_at: '2024-01-01T00:00:00Z'
      };

      const result = validator.validate(memory);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => 
        e.field === 'confidence' && 
        e.message.includes('Confidence must be between 0 and 1')
      )).toBe(true);
    });

    it('should reject memory with confidence above 1', () => {
      const memory: ExtractedMemory = {
        id: 'mem-1',
        type: 'fact',
        content: 'The sky is blue',
        confidence: 1.5,
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-1'],
        metadata: {},
        created_at: '2024-01-01T00:00:00Z'
      };

      const result = validator.validate(memory);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => 
        e.field === 'confidence' && 
        e.message.includes('Confidence must be between 0 and 1')
      )).toBe(true);
    });

    it('should accept memory with confidence of 0', () => {
      const memory: ExtractedMemory = {
        id: 'mem-1',
        type: 'fact',
        content: 'The sky is blue',
        confidence: 0,
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-1'],
        metadata: {},
        created_at: '2024-01-01T00:00:00Z'
      };

      const result = validator.validate(memory);

      expect(result.valid).toBe(true);
    });

    it('should accept memory with confidence of 1', () => {
      const memory: ExtractedMemory = {
        id: 'mem-1',
        type: 'fact',
        content: 'The sky is blue',
        confidence: 1,
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-1'],
        metadata: {},
        created_at: '2024-01-01T00:00:00Z'
      };

      const result = validator.validate(memory);

      expect(result.valid).toBe(true);
    });

    it('should reject memory with trivial content (less than 3 chars)', () => {
      const memory: ExtractedMemory = {
        id: 'mem-1',
        type: 'fact',
        content: 'ab',
        confidence: 0.9,
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-1'],
        metadata: {},
        created_at: '2024-01-01T00:00:00Z'
      };

      const result = validator.validate(memory);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => 
        e.field === 'content' && 
        e.message.includes('Content is too short')
      )).toBe(true);
    });

    it('should accept memory with content exactly 3 chars', () => {
      const memory: ExtractedMemory = {
        id: 'mem-1',
        type: 'fact',
        content: 'abc',
        confidence: 0.9,
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-1'],
        metadata: {},
        created_at: '2024-01-01T00:00:00Z'
      };

      const result = validator.validate(memory);

      expect(result.valid).toBe(true);
    });

    it('should reject memory with whitespace-only content', () => {
      const memory: ExtractedMemory = {
        id: 'mem-1',
        type: 'fact',
        content: '   ',
        confidence: 0.9,
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-1'],
        metadata: {},
        created_at: '2024-01-01T00:00:00Z'
      };

      const result = validator.validate(memory);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => 
        e.field === 'content' && 
        e.message.includes('Content is too short')
      )).toBe(true);
    });

    it('should filter memories below confidence threshold', () => {
      const validatorWithThreshold = new MemoryValidator({ minConfidence: 0.7 });
      
      const memory: ExtractedMemory = {
        id: 'mem-1',
        type: 'fact',
        content: 'The sky is blue',
        confidence: 0.5,
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-1'],
        metadata: {},
        created_at: '2024-01-01T00:00:00Z'
      };

      const result = validatorWithThreshold.validate(memory);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => 
        e.field === 'confidence' && 
        e.message.includes('below minimum threshold')
      )).toBe(true);
    });

    it('should accept memories at or above confidence threshold', () => {
      const validatorWithThreshold = new MemoryValidator({ minConfidence: 0.7 });
      
      const memory: ExtractedMemory = {
        id: 'mem-1',
        type: 'fact',
        content: 'The sky is blue',
        confidence: 0.7,
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-1'],
        metadata: {},
        created_at: '2024-01-01T00:00:00Z'
      };

      const result = validatorWithThreshold.validate(memory);

      expect(result.valid).toBe(true);
    });

    it('should report multiple validation errors', () => {
      const memory: any = {
        id: 'mem-1',
        type: '',
        content: 'ab',
        confidence: 1.5,
        workspace_id: '',
        conversation_id: '',
        source_message_ids: ['msg-1'],
        metadata: {},
        created_at: '2024-01-01T00:00:00Z'
      };

      const result = validator.validate(memory);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
      expect(result.errors.some(e => e.field === 'type')).toBe(true);
      expect(result.errors.some(e => e.field === 'content')).toBe(true);
      expect(result.errors.some(e => e.field === 'confidence')).toBe(true);
      expect(result.errors.some(e => e.field === 'workspace_id')).toBe(true);
      expect(result.errors.some(e => e.field === 'conversation_id')).toBe(true);
    });

    it('should use custom minContentLength', () => {
      const validatorWithCustomLength = new MemoryValidator({ minContentLength: 5 });
      
      const memory: ExtractedMemory = {
        id: 'mem-1',
        type: 'fact',
        content: 'abcd',
        confidence: 0.9,
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-1'],
        metadata: {},
        created_at: '2024-01-01T00:00:00Z'
      };

      const result = validatorWithCustomLength.validate(memory);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => 
        e.field === 'content' && 
        e.message.includes('minimum 5 characters')
      )).toBe(true);
    });
  });

  describe('validateBatch', () => {
    it('should validate multiple valid memories', () => {
      const memories: ExtractedMemory[] = [
        {
          id: 'mem-1',
          type: 'fact',
          content: 'The sky is blue',
          confidence: 0.9,
          workspace_id: 'workspace-1',
          conversation_id: 'conv-1',
          source_message_ids: ['msg-1'],
          metadata: {},
          created_at: '2024-01-01T00:00:00Z'
        },
        {
          id: 'mem-2',
          type: 'entity',
          content: 'John Doe',
          confidence: 0.8,
          workspace_id: 'workspace-1',
          conversation_id: 'conv-1',
          source_message_ids: ['msg-2'],
          metadata: {},
          created_at: '2024-01-01T00:00:00Z'
        }
      ];

      const result = validator.validateBatch(memories);

      expect(result.validMemories).toHaveLength(2);
      expect(result.invalidMemories).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should separate valid and invalid memories', () => {
      const memories: ExtractedMemory[] = [
        {
          id: 'mem-1',
          type: 'fact',
          content: 'The sky is blue',
          confidence: 0.9,
          workspace_id: 'workspace-1',
          conversation_id: 'conv-1',
          source_message_ids: ['msg-1'],
          metadata: {},
          created_at: '2024-01-01T00:00:00Z'
        },
        {
          id: 'mem-2',
          type: '',
          content: 'ab',
          confidence: 1.5,
          workspace_id: 'workspace-1',
          conversation_id: 'conv-1',
          source_message_ids: ['msg-2'],
          metadata: {},
          created_at: '2024-01-01T00:00:00Z'
        }
      ];

      const result = validator.validateBatch(memories);

      expect(result.validMemories).toHaveLength(1);
      expect(result.validMemories[0].id).toBe('mem-1');
      expect(result.invalidMemories).toHaveLength(1);
      expect(result.invalidMemories[0].id).toBe('mem-2');
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should collect all errors from invalid memories', () => {
      const memories: ExtractedMemory[] = [
        {
          id: 'mem-1',
          type: '',
          content: 'ab',
          confidence: 0.9,
          workspace_id: 'workspace-1',
          conversation_id: 'conv-1',
          source_message_ids: ['msg-1'],
          metadata: {},
          created_at: '2024-01-01T00:00:00Z'
        },
        {
          id: 'mem-2',
          type: 'fact',
          content: '',
          confidence: 1.5,
          workspace_id: 'workspace-1',
          conversation_id: 'conv-1',
          source_message_ids: ['msg-2'],
          metadata: {},
          created_at: '2024-01-01T00:00:00Z'
        }
      ];

      const result = validator.validateBatch(memories);

      expect(result.validMemories).toHaveLength(0);
      expect(result.invalidMemories).toHaveLength(2);
      expect(result.errors.length).toBeGreaterThan(2);
    });

    it('should handle empty array', () => {
      const result = validator.validateBatch([]);

      expect(result.validMemories).toHaveLength(0);
      expect(result.invalidMemories).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should apply confidence threshold to batch', () => {
      const validatorWithThreshold = new MemoryValidator({ minConfidence: 0.7 });
      
      const memories: ExtractedMemory[] = [
        {
          id: 'mem-1',
          type: 'fact',
          content: 'The sky is blue',
          confidence: 0.9,
          workspace_id: 'workspace-1',
          conversation_id: 'conv-1',
          source_message_ids: ['msg-1'],
          metadata: {},
          created_at: '2024-01-01T00:00:00Z'
        },
        {
          id: 'mem-2',
          type: 'fact',
          content: 'The grass is green',
          confidence: 0.5,
          workspace_id: 'workspace-1',
          conversation_id: 'conv-1',
          source_message_ids: ['msg-2'],
          metadata: {},
          created_at: '2024-01-01T00:00:00Z'
        }
      ];

      const result = validatorWithThreshold.validateBatch(memories);

      expect(result.validMemories).toHaveLength(1);
      expect(result.validMemories[0].id).toBe('mem-1');
      expect(result.invalidMemories).toHaveLength(1);
      expect(result.invalidMemories[0].id).toBe('mem-2');
    });
  });

  describe('validateRelationships', () => {
    const validMemories: ExtractedMemory[] = [
      {
        id: 'mem-1',
        type: 'entity',
        content: 'John Doe',
        confidence: 0.9,
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-1'],
        metadata: {},
        created_at: '2024-01-01T00:00:00Z'
      },
      {
        id: 'mem-2',
        type: 'entity',
        content: 'Acme Corp',
        confidence: 0.9,
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-2'],
        metadata: {},
        created_at: '2024-01-01T00:00:00Z'
      }
    ];

    it('should validate relationships with existing memories', () => {
      const relationships: ExtractedRelationship[] = [
        {
          id: 'rel-1',
          from_memory_id: 'mem-1',
          to_memory_id: 'mem-2',
          relationship_type: 'works_at',
          confidence: 0.9,
          created_at: '2024-01-01T00:00:00Z'
        }
      ];

      const result = validator.validateRelationships(relationships, validMemories);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject relationship with non-existent from_memory_id', () => {
      const relationships: ExtractedRelationship[] = [
        {
          id: 'rel-1',
          from_memory_id: 'non-existent',
          to_memory_id: 'mem-2',
          relationship_type: 'works_at',
          confidence: 0.9,
          created_at: '2024-01-01T00:00:00Z'
        }
      ];

      const result = validator.validateRelationships(relationships, validMemories);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe('from_memory_id');
      expect(result.errors[0].message).toContain('non-existent memory');
      expect(result.errors[0].memoryId).toBe('rel-1');
    });

    it('should reject relationship with non-existent to_memory_id', () => {
      const relationships: ExtractedRelationship[] = [
        {
          id: 'rel-1',
          from_memory_id: 'mem-1',
          to_memory_id: 'non-existent',
          relationship_type: 'works_at',
          confidence: 0.9,
          created_at: '2024-01-01T00:00:00Z'
        }
      ];

      const result = validator.validateRelationships(relationships, validMemories);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe('to_memory_id');
      expect(result.errors[0].message).toContain('non-existent memory');
    });

    it('should reject relationship connecting memories from different workspaces', () => {
      const memoriesInDifferentWorkspaces: ExtractedMemory[] = [
        {
          id: 'mem-1',
          type: 'entity',
          content: 'John Doe',
          confidence: 0.9,
          workspace_id: 'workspace-1',
          conversation_id: 'conv-1',
          source_message_ids: ['msg-1'],
          metadata: {},
          created_at: '2024-01-01T00:00:00Z'
        },
        {
          id: 'mem-2',
          type: 'entity',
          content: 'Acme Corp',
          confidence: 0.9,
          workspace_id: 'workspace-2',
          conversation_id: 'conv-1',
          source_message_ids: ['msg-2'],
          metadata: {},
          created_at: '2024-01-01T00:00:00Z'
        }
      ];

      const relationships: ExtractedRelationship[] = [
        {
          id: 'rel-1',
          from_memory_id: 'mem-1',
          to_memory_id: 'mem-2',
          relationship_type: 'works_at',
          confidence: 0.9,
          created_at: '2024-01-01T00:00:00Z'
        }
      ];

      const result = validator.validateRelationships(relationships, memoriesInDifferentWorkspaces);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe('workspace_id');
      expect(result.errors[0].message).toContain('different workspaces');
    });

    it('should accept relationships connecting memories in same workspace', () => {
      const relationships: ExtractedRelationship[] = [
        {
          id: 'rel-1',
          from_memory_id: 'mem-1',
          to_memory_id: 'mem-2',
          relationship_type: 'works_at',
          confidence: 0.9,
          created_at: '2024-01-01T00:00:00Z'
        }
      ];

      const result = validator.validateRelationships(relationships, validMemories);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate multiple relationships', () => {
      const relationships: ExtractedRelationship[] = [
        {
          id: 'rel-1',
          from_memory_id: 'mem-1',
          to_memory_id: 'mem-2',
          relationship_type: 'works_at',
          confidence: 0.9,
          created_at: '2024-01-01T00:00:00Z'
        },
        {
          id: 'rel-2',
          from_memory_id: 'mem-2',
          to_memory_id: 'mem-1',
          relationship_type: 'employs',
          confidence: 0.9,
          created_at: '2024-01-01T00:00:00Z'
        }
      ];

      const result = validator.validateRelationships(relationships, validMemories);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should collect errors from multiple invalid relationships', () => {
      const relationships: ExtractedRelationship[] = [
        {
          id: 'rel-1',
          from_memory_id: 'non-existent-1',
          to_memory_id: 'mem-2',
          relationship_type: 'works_at',
          confidence: 0.9,
          created_at: '2024-01-01T00:00:00Z'
        },
        {
          id: 'rel-2',
          from_memory_id: 'mem-1',
          to_memory_id: 'non-existent-2',
          relationship_type: 'knows',
          confidence: 0.9,
          created_at: '2024-01-01T00:00:00Z'
        }
      ];

      const result = validator.validateRelationships(relationships, validMemories);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });

    it('should handle empty relationships array', () => {
      const result = validator.validateRelationships([], validMemories);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle empty memories array', () => {
      const relationships: ExtractedRelationship[] = [
        {
          id: 'rel-1',
          from_memory_id: 'mem-1',
          to_memory_id: 'mem-2',
          relationship_type: 'works_at',
          confidence: 0.9,
          created_at: '2024-01-01T00:00:00Z'
        }
      ];

      const result = validator.validateRelationships(relationships, []);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });

    it('should handle self-referencing relationship', () => {
      const relationships: ExtractedRelationship[] = [
        {
          id: 'rel-1',
          from_memory_id: 'mem-1',
          to_memory_id: 'mem-1',
          relationship_type: 'related_to',
          confidence: 0.9,
          created_at: '2024-01-01T00:00:00Z'
        }
      ];

      const result = validator.validateRelationships(relationships, validMemories);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
