/**
 * Tests for ChunkDeduplicator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ChunkDeduplicator } from '../deduplicator.js';
import type { ExtractedMemory, ExtractedRelationship } from '../../types.js';
import type { ChunkExtractionResult } from '../types.js';

describe('ChunkDeduplicator', () => {
  let deduplicator: ChunkDeduplicator;

  beforeEach(() => {
    deduplicator = new ChunkDeduplicator();
  });

  describe('deduplicateAcrossChunks', () => {
    it('should handle empty chunk results', () => {
      const result = deduplicator.deduplicateAcrossChunks([]);
      
      expect(result.uniqueMemories).toHaveLength(0);
      expect(result.duplicatesFound).toBe(0);
      expect(result.mergedMemories).toHaveLength(0);
    });

    it('should handle chunks with no memories', () => {
      const chunkResults: ChunkExtractionResult[] = [
        {
          chunkId: 'chunk-1',
          sequence: 1,
          status: 'success',
          memories: [],
          relationships: [],
          tokenCount: 1000,
          processingTime: 100,
        },
      ];
      
      const result = deduplicator.deduplicateAcrossChunks(chunkResults);
      
      expect(result.uniqueMemories).toHaveLength(0);
      expect(result.duplicatesFound).toBe(0);
    });

    it('should skip failed chunks', () => {
      const memory: ExtractedMemory = {
        id: 'mem-1',
        type: 'fact',
        content: 'The sky is blue',
        confidence: 0.9,
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-1'],
        metadata: {},
        created_at: '2024-01-01T00:00:00Z',
      };

      const chunkResults: ChunkExtractionResult[] = [
        {
          chunkId: 'chunk-1',
          sequence: 1,
          status: 'success',
          memories: [memory],
          relationships: [],
          tokenCount: 1000,
          processingTime: 100,
        },
        {
          chunkId: 'chunk-2',
          sequence: 2,
          status: 'failed',
          memories: [],
          relationships: [],
          tokenCount: 1000,
          processingTime: 100,
          error: { type: 'llm_error', provider: 'test', message: 'Test error' },
        },
      ];
      
      const result = deduplicator.deduplicateAcrossChunks(chunkResults);
      
      expect(result.uniqueMemories).toHaveLength(1);
      expect(result.duplicatesFound).toBe(0);
    });

    it('should detect exact duplicates across chunks', () => {
      const memory1: ExtractedMemory = {
        id: 'mem-1',
        type: 'fact',
        content: 'The sky is blue',
        confidence: 0.9,
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-1'],
        metadata: {},
        created_at: '2024-01-01T00:00:00Z',
      };

      const memory2: ExtractedMemory = {
        id: 'mem-2',
        type: 'fact',
        content: 'The sky is blue',
        confidence: 0.85,
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-2'],
        metadata: {},
        created_at: '2024-01-01T01:00:00Z',
      };

      const chunkResults: ChunkExtractionResult[] = [
        {
          chunkId: 'chunk-1',
          sequence: 1,
          status: 'success',
          memories: [memory1],
          relationships: [],
          tokenCount: 1000,
          processingTime: 100,
        },
        {
          chunkId: 'chunk-2',
          sequence: 2,
          status: 'success',
          memories: [memory2],
          relationships: [],
          tokenCount: 1000,
          processingTime: 100,
        },
      ];
      
      const result = deduplicator.deduplicateAcrossChunks(chunkResults);
      
      expect(result.uniqueMemories).toHaveLength(1);
      expect(result.duplicatesFound).toBe(1);
      expect(result.mergedMemories).toHaveLength(1);
    });

    it('should keep highest confidence when merging', () => {
      const memory1: ExtractedMemory = {
        id: 'mem-1',
        type: 'fact',
        content: 'The sky is blue',
        confidence: 0.7,
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-1'],
        metadata: {},
        created_at: '2024-01-01T00:00:00Z',
      };

      const memory2: ExtractedMemory = {
        id: 'mem-2',
        type: 'fact',
        content: 'The sky is blue',
        confidence: 0.95,
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-2'],
        metadata: {},
        created_at: '2024-01-01T01:00:00Z',
      };

      const chunkResults: ChunkExtractionResult[] = [
        {
          chunkId: 'chunk-1',
          sequence: 1,
          status: 'success',
          memories: [memory1],
          relationships: [],
          tokenCount: 1000,
          processingTime: 100,
        },
        {
          chunkId: 'chunk-2',
          sequence: 2,
          status: 'success',
          memories: [memory2],
          relationships: [],
          tokenCount: 1000,
          processingTime: 100,
        },
      ];
      
      const result = deduplicator.deduplicateAcrossChunks(chunkResults);
      
      expect(result.uniqueMemories).toHaveLength(1);
      expect(result.uniqueMemories[0].confidence).toBe(0.95);
    });

    it('should preserve all source chunk references', () => {
      const memory1: ExtractedMemory = {
        id: 'mem-1',
        type: 'fact',
        content: 'The sky is blue',
        confidence: 0.9,
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-1'],
        metadata: {},
        created_at: '2024-01-01T00:00:00Z',
        source_chunks: ['chunk-1'],
      };

      const memory2: ExtractedMemory = {
        id: 'mem-2',
        type: 'fact',
        content: 'The sky is blue',
        confidence: 0.85,
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-2'],
        metadata: {},
        created_at: '2024-01-01T01:00:00Z',
        source_chunks: ['chunk-2'],
      };

      const chunkResults: ChunkExtractionResult[] = [
        {
          chunkId: 'chunk-1',
          sequence: 1,
          status: 'success',
          memories: [memory1],
          relationships: [],
          tokenCount: 1000,
          processingTime: 100,
        },
        {
          chunkId: 'chunk-2',
          sequence: 2,
          status: 'success',
          memories: [memory2],
          relationships: [],
          tokenCount: 1000,
          processingTime: 100,
        },
      ];
      
      const result = deduplicator.deduplicateAcrossChunks(chunkResults);
      
      expect(result.uniqueMemories).toHaveLength(1);
      expect(result.uniqueMemories[0].source_chunks).toContain('chunk-1');
      expect(result.uniqueMemories[0].source_chunks).toContain('chunk-2');
      expect(result.mergedMemories[0].sourceChunks).toContain('chunk-1');
      expect(result.mergedMemories[0].sourceChunks).toContain('chunk-2');
    });

    it('should merge source_message_ids from duplicates', () => {
      const memory1: ExtractedMemory = {
        id: 'mem-1',
        type: 'fact',
        content: 'The sky is blue',
        confidence: 0.9,
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-1', 'msg-2'],
        metadata: {},
        created_at: '2024-01-01T00:00:00Z',
      };

      const memory2: ExtractedMemory = {
        id: 'mem-2',
        type: 'fact',
        content: 'The sky is blue',
        confidence: 0.85,
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-2', 'msg-3'],
        metadata: {},
        created_at: '2024-01-01T01:00:00Z',
      };

      const chunkResults: ChunkExtractionResult[] = [
        {
          chunkId: 'chunk-1',
          sequence: 1,
          status: 'success',
          memories: [memory1],
          relationships: [],
          tokenCount: 1000,
          processingTime: 100,
        },
        {
          chunkId: 'chunk-2',
          sequence: 2,
          status: 'success',
          memories: [memory2],
          relationships: [],
          tokenCount: 1000,
          processingTime: 100,
        },
      ];
      
      const result = deduplicator.deduplicateAcrossChunks(chunkResults);
      
      expect(result.uniqueMemories).toHaveLength(1);
      expect(result.uniqueMemories[0].source_message_ids).toHaveLength(3);
      expect(result.uniqueMemories[0].source_message_ids).toContain('msg-1');
      expect(result.uniqueMemories[0].source_message_ids).toContain('msg-2');
      expect(result.uniqueMemories[0].source_message_ids).toContain('msg-3');
    });

    it('should group memories by type before comparison', () => {
      const factMemory: ExtractedMemory = {
        id: 'mem-1',
        type: 'fact',
        content: 'Important information',
        confidence: 0.9,
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-1'],
        metadata: {},
        created_at: '2024-01-01T00:00:00Z',
      };

      const decisionMemory: ExtractedMemory = {
        id: 'mem-2',
        type: 'decision',
        content: 'Important information',
        confidence: 0.85,
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-2'],
        metadata: {},
        created_at: '2024-01-01T01:00:00Z',
      };

      const chunkResults: ChunkExtractionResult[] = [
        {
          chunkId: 'chunk-1',
          sequence: 1,
          status: 'success',
          memories: [factMemory, decisionMemory],
          relationships: [],
          tokenCount: 1000,
          processingTime: 100,
        },
      ];
      
      const result = deduplicator.deduplicateAcrossChunks(chunkResults);
      
      // Should not merge because they're different types
      expect(result.uniqueMemories).toHaveLength(2);
      expect(result.duplicatesFound).toBe(0);
    });

    it('should handle multiple duplicates of same memory', () => {
      const memory1: ExtractedMemory = {
        id: 'mem-1',
        type: 'fact',
        content: 'The sky is blue',
        confidence: 0.9,
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-1'],
        metadata: {},
        created_at: '2024-01-01T00:00:00Z',
      };

      const memory2: ExtractedMemory = {
        ...memory1,
        id: 'mem-2',
        source_message_ids: ['msg-2'],
        created_at: '2024-01-01T01:00:00Z',
      };

      const memory3: ExtractedMemory = {
        ...memory1,
        id: 'mem-3',
        source_message_ids: ['msg-3'],
        created_at: '2024-01-01T02:00:00Z',
      };

      const chunkResults: ChunkExtractionResult[] = [
        {
          chunkId: 'chunk-1',
          sequence: 1,
          status: 'success',
          memories: [memory1],
          relationships: [],
          tokenCount: 1000,
          processingTime: 100,
        },
        {
          chunkId: 'chunk-2',
          sequence: 2,
          status: 'success',
          memories: [memory2],
          relationships: [],
          tokenCount: 1000,
          processingTime: 100,
        },
        {
          chunkId: 'chunk-3',
          sequence: 3,
          status: 'success',
          memories: [memory3],
          relationships: [],
          tokenCount: 1000,
          processingTime: 100,
        },
      ];
      
      const result = deduplicator.deduplicateAcrossChunks(chunkResults);
      
      expect(result.uniqueMemories).toHaveLength(1);
      expect(result.duplicatesFound).toBe(2);
      expect(result.uniqueMemories[0].source_message_ids).toHaveLength(3);
    });

    it('should track merged_from IDs', () => {
      const memory1: ExtractedMemory = {
        id: 'mem-1',
        type: 'fact',
        content: 'The sky is blue',
        confidence: 0.9,
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-1'],
        metadata: {},
        created_at: '2024-01-01T00:00:00Z',
      };

      const memory2: ExtractedMemory = {
        id: 'mem-2',
        type: 'fact',
        content: 'The sky is blue',
        confidence: 0.85,
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-2'],
        metadata: {},
        created_at: '2024-01-01T01:00:00Z',
      };

      const chunkResults: ChunkExtractionResult[] = [
        {
          chunkId: 'chunk-1',
          sequence: 1,
          status: 'success',
          memories: [memory1],
          relationships: [],
          tokenCount: 1000,
          processingTime: 100,
        },
        {
          chunkId: 'chunk-2',
          sequence: 2,
          status: 'success',
          memories: [memory2],
          relationships: [],
          tokenCount: 1000,
          processingTime: 100,
        },
      ];
      
      const result = deduplicator.deduplicateAcrossChunks(chunkResults);
      
      expect(result.uniqueMemories).toHaveLength(1);
      expect(result.uniqueMemories[0].merged_from).toContain('mem-1');
      expect(result.uniqueMemories[0].merged_from).toContain('mem-2');
    });
  });

  describe('mergeRelationships', () => {
    it('should handle empty relationships', () => {
      const memories: ExtractedMemory[] = [];
      const relationships: ExtractedRelationship[] = [];
      
      const result = deduplicator.mergeRelationships(memories, relationships);
      
      expect(result).toHaveLength(0);
    });

    it('should remove orphaned relationships', () => {
      const memory: ExtractedMemory = {
        id: 'mem-1',
        type: 'entity',
        content: 'John Doe',
        confidence: 0.9,
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-1'],
        metadata: {},
        created_at: '2024-01-01T00:00:00Z',
      };

      const relationship: ExtractedRelationship = {
        id: 'rel-1',
        from_memory_id: 'mem-1',
        to_memory_id: 'mem-2', // This memory doesn't exist
        relationship_type: 'knows',
        confidence: 0.8,
        created_at: '2024-01-01T00:00:00Z',
      };
      
      const result = deduplicator.mergeRelationships([memory], [relationship]);
      
      expect(result).toHaveLength(0);
    });

    it('should update relationship references after deduplication', () => {
      const memory1: ExtractedMemory = {
        id: 'mem-new',
        type: 'entity',
        content: 'John Doe',
        confidence: 0.9,
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-1'],
        metadata: {},
        created_at: '2024-01-01T00:00:00Z',
        merged_from: ['mem-1', 'mem-2'],
      };

      const memory2: ExtractedMemory = {
        id: 'mem-3',
        type: 'entity',
        content: 'Jane Smith',
        confidence: 0.9,
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-2'],
        metadata: {},
        created_at: '2024-01-01T00:00:00Z',
      };

      const relationship: ExtractedRelationship = {
        id: 'rel-1',
        from_memory_id: 'mem-1', // Old ID that was merged
        to_memory_id: 'mem-3',
        relationship_type: 'knows',
        confidence: 0.8,
        created_at: '2024-01-01T00:00:00Z',
      };
      
      const result = deduplicator.mergeRelationships([memory1, memory2], [relationship]);
      
      expect(result).toHaveLength(1);
      expect(result[0].from_memory_id).toBe('mem-new');
      expect(result[0].to_memory_id).toBe('mem-3');
    });

    it('should validate relationship endpoints exist', () => {
      const memory1: ExtractedMemory = {
        id: 'mem-1',
        type: 'entity',
        content: 'John Doe',
        confidence: 0.9,
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-1'],
        metadata: {},
        created_at: '2024-01-01T00:00:00Z',
      };

      const memory2: ExtractedMemory = {
        id: 'mem-2',
        type: 'entity',
        content: 'Jane Smith',
        confidence: 0.9,
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-2'],
        metadata: {},
        created_at: '2024-01-01T00:00:00Z',
      };

      const validRel: ExtractedRelationship = {
        id: 'rel-1',
        from_memory_id: 'mem-1',
        to_memory_id: 'mem-2',
        relationship_type: 'knows',
        confidence: 0.8,
        created_at: '2024-01-01T00:00:00Z',
      };

      const invalidRel: ExtractedRelationship = {
        id: 'rel-2',
        from_memory_id: 'mem-1',
        to_memory_id: 'mem-999', // Doesn't exist
        relationship_type: 'knows',
        confidence: 0.8,
        created_at: '2024-01-01T00:00:00Z',
      };
      
      const result = deduplicator.mergeRelationships([memory1, memory2], [validRel, invalidRel]);
      
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('rel-1');
    });

    it('should deduplicate relationships', () => {
      const memory1: ExtractedMemory = {
        id: 'mem-1',
        type: 'entity',
        content: 'John Doe',
        confidence: 0.9,
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-1'],
        metadata: {},
        created_at: '2024-01-01T00:00:00Z',
      };

      const memory2: ExtractedMemory = {
        id: 'mem-2',
        type: 'entity',
        content: 'Jane Smith',
        confidence: 0.9,
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-2'],
        metadata: {},
        created_at: '2024-01-01T00:00:00Z',
      };

      const rel1: ExtractedRelationship = {
        id: 'rel-1',
        from_memory_id: 'mem-1',
        to_memory_id: 'mem-2',
        relationship_type: 'knows',
        confidence: 0.7,
        created_at: '2024-01-01T00:00:00Z',
      };

      const rel2: ExtractedRelationship = {
        id: 'rel-2',
        from_memory_id: 'mem-1',
        to_memory_id: 'mem-2',
        relationship_type: 'knows',
        confidence: 0.9,
        created_at: '2024-01-01T01:00:00Z',
      };
      
      const result = deduplicator.mergeRelationships([memory1, memory2], [rel1, rel2]);
      
      // Should keep only one relationship with higher confidence
      expect(result).toHaveLength(1);
      expect(result[0].confidence).toBe(0.9);
    });

    it('should handle relationships with updated memory IDs', () => {
      const memory1: ExtractedMemory = {
        id: 'mem-new-1',
        type: 'entity',
        content: 'John Doe',
        confidence: 0.9,
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-1'],
        metadata: {},
        created_at: '2024-01-01T00:00:00Z',
        merged_from: ['mem-1', 'mem-2'],
      };

      const memory2: ExtractedMemory = {
        id: 'mem-new-2',
        type: 'entity',
        content: 'Jane Smith',
        confidence: 0.9,
        workspace_id: 'workspace-1',
        conversation_id: 'conv-1',
        source_message_ids: ['msg-2'],
        metadata: {},
        created_at: '2024-01-01T00:00:00Z',
        merged_from: ['mem-3', 'mem-4'],
      };

      const rel1: ExtractedRelationship = {
        id: 'rel-1',
        from_memory_id: 'mem-1',
        to_memory_id: 'mem-3',
        relationship_type: 'knows',
        confidence: 0.8,
        created_at: '2024-01-01T00:00:00Z',
      };

      const rel2: ExtractedRelationship = {
        id: 'rel-2',
        from_memory_id: 'mem-2',
        to_memory_id: 'mem-4',
        relationship_type: 'knows',
        confidence: 0.7,
        created_at: '2024-01-01T01:00:00Z',
      };
      
      const result = deduplicator.mergeRelationships([memory1, memory2], [rel1, rel2]);
      
      // Both relationships should be updated and deduplicated
      expect(result).toHaveLength(1);
      expect(result[0].from_memory_id).toBe('mem-new-1');
      expect(result[0].to_memory_id).toBe('mem-new-2');
      expect(result[0].confidence).toBe(0.8); // Higher confidence wins
    });
  });
});
