/**
 * Cross-chunk deduplication logic
 * 
 * Handles deduplication of memories extracted from overlapping chunks,
 * merging duplicates and updating relationships accordingly.
 */

import type { ExtractedMemory, ExtractedRelationship } from '../types.js';
import type { ChunkExtractionResult } from './types.js';

/**
 * Result of cross-chunk deduplication
 */
export interface DeduplicationResult {
  /** Unique memories after deduplication */
  uniqueMemories: ExtractedMemory[];
  
  /** Number of duplicates found */
  duplicatesFound: number;
  
  /** Details of merged memories */
  mergedMemories: Array<{
    finalMemory: ExtractedMemory;
    sourceMemories: ExtractedMemory[];
    sourceChunks: string[];
  }>;
}

/**
 * Handles deduplication of memories across chunks
 */
export class ChunkDeduplicator {
  private logger?: any; // Logger type

  constructor(logger?: any) {
    this.logger = logger;
  }

  /**
   * Deduplicate memories across chunks
   * 
   * @param chunkResults - Results from individual chunk extractions
   * @returns Deduplicated memories with merge information
   */
  deduplicateAcrossChunks(chunkResults: ChunkExtractionResult[]): DeduplicationResult {
    const startTime = Date.now();
    // Collect all memories from successful chunks
    const allMemories: ExtractedMemory[] = [];
    const memoryToChunk = new Map<string, string>();
    
    for (const chunkResult of chunkResults) {
      if (chunkResult.status === 'success') {
        for (const memory of chunkResult.memories) {
          allMemories.push(memory);
          memoryToChunk.set(memory.id, chunkResult.chunkId);
        }
      }
    }
    
    if (allMemories.length === 0) {
      return {
        uniqueMemories: [],
        duplicatesFound: 0,
        mergedMemories: [],
      };
    }
    
    // Group memories by type for more efficient comparison
    const memoriesByType = this.groupMemoriesByType(allMemories);
    
    // Track which memories have been merged
    const mergedMemoryIds = new Set<string>();
    const uniqueMemories: ExtractedMemory[] = [];
    const mergedMemories: Array<{
      finalMemory: ExtractedMemory;
      sourceMemories: ExtractedMemory[];
      sourceChunks: string[];
    }> = [];
    
    // Process each type group separately
    for (const [type, memories] of memoriesByType.entries()) {
      // Find duplicate groups within this type
      const duplicateGroups = this.findDuplicateGroups(memories);
      
      for (const group of duplicateGroups) {
        if (group.length === 1) {
          // No duplicates, add as-is
          const memory = group[0];
          if (!mergedMemoryIds.has(memory.id)) {
            uniqueMemories.push(memory);
            mergedMemoryIds.add(memory.id);
          }
        } else {
          // Merge duplicates
          const sourceChunks = group
            .map(m => memoryToChunk.get(m.id))
            .filter((id): id is string => id !== undefined);
          
          const mergedMemory = this.mergeMemories(group);
          
          uniqueMemories.push(mergedMemory);
          mergedMemories.push({
            finalMemory: mergedMemory,
            sourceMemories: group,
            sourceChunks,
          });
          
          // Mark all source memories as merged
          for (const memory of group) {
            mergedMemoryIds.add(memory.id);
          }
        }
      }
    }
    
    const duplicatesFound = allMemories.length - uniqueMemories.length;
    const deduplicationTime = Date.now() - startTime;

    if (this.logger) {
      this.logger.info(
        `Cross-chunk deduplication complete`,
        {
          totalMemoriesBeforeDedup: allMemories.length,
          uniqueMemoriesAfterDedup: uniqueMemories.length,
          duplicatesFound,
          mergedGroups: mergedMemories.length,
          deduplicationTime,
          deduplicationRate: allMemories.length > 0
            ? Math.round((duplicatesFound / allMemories.length) * 100)
            : 0,
        }
      );
    }
    
    return {
      uniqueMemories,
      duplicatesFound,
      mergedMemories,
    };
  }
  
  /**
   * Merge relationships across chunks, updating references after deduplication
   * 
   * @param memories - Deduplicated memories
   * @param relationships - All relationships from chunks
   * @returns Merged and validated relationships
   */
  mergeRelationships(
    memories: ExtractedMemory[],
    relationships: ExtractedRelationship[]
  ): ExtractedRelationship[] {
    const startTime = Date.now();
    // Create a set of valid memory IDs for quick lookup
    const validMemoryIds = new Set(memories.map(m => m.id));
    
    // Create a map from old memory IDs to new memory IDs
    const memoryIdMap = new Map<string, string>();
    for (const memory of memories) {
      memoryIdMap.set(memory.id, memory.id);
      
      // If this memory was merged from others, map old IDs to new ID
      if (memory.merged_from) {
        for (const oldId of memory.merged_from) {
          memoryIdMap.set(oldId, memory.id);
        }
      }
    }
    
    // Update relationship references and filter invalid ones
    const validRelationships: ExtractedRelationship[] = [];
    const seenRelationships = new Set<string>();
    
    for (const rel of relationships) {
      // Update memory references
      const fromId = memoryIdMap.get(rel.from_memory_id) ?? rel.from_memory_id;
      const toId = memoryIdMap.get(rel.to_memory_id) ?? rel.to_memory_id;
      
      // Validate that both endpoints exist
      if (!validMemoryIds.has(fromId) || !validMemoryIds.has(toId)) {
        // Skip orphaned relationships
        continue;
      }
      
      // Create updated relationship
      const updatedRel: ExtractedRelationship = {
        ...rel,
        from_memory_id: fromId,
        to_memory_id: toId,
      };
      
      // Deduplicate relationships by creating a unique key
      const relKey = `${fromId}:${toId}:${rel.relationship_type}`;
      
      if (!seenRelationships.has(relKey)) {
        validRelationships.push(updatedRel);
        seenRelationships.add(relKey);
      } else {
        // If duplicate, keep the one with higher confidence
        const existingIndex = validRelationships.findIndex(
          r => r.from_memory_id === fromId && 
               r.to_memory_id === toId && 
               r.relationship_type === rel.relationship_type
        );
        
        if (existingIndex !== -1 && updatedRel.confidence > validRelationships[existingIndex].confidence) {
          validRelationships[existingIndex] = updatedRel;
        }
      }
    }

    const mergeTime = Date.now() - startTime;
    const orphanedRelationships = relationships.length - validRelationships.length;

    if (this.logger) {
      this.logger.info(
        `Relationship merging complete`,
        {
          totalRelationshipsBeforeMerge: relationships.length,
          validRelationshipsAfterMerge: validRelationships.length,
          orphanedRelationships,
          deduplicatedRelationships: relationships.length - validRelationships.length - orphanedRelationships,
          mergeTime,
        }
      );
    }
    
    return validRelationships;
  }
  
  /**
   * Calculate similarity between two memories
   * 
   * @param m1 - First memory
   * @param m2 - Second memory
   * @returns Similarity score between 0 and 1
   */
  private calculateSimilarity(m1: ExtractedMemory, m2: ExtractedMemory): number {
    // Must be same type and workspace
    if (m1.type !== m2.type || m1.workspace_id !== m2.workspace_id) {
      return 0;
    }
    
    // Normalize content for comparison
    const content1 = this.normalizeContent(m1.content);
    const content2 = this.normalizeContent(m2.content);
    
    // Exact match after normalization
    if (content1 === content2) {
      // For entities, also check entity type and name
      if (m1.type === 'entity' && m2.type === 'entity') {
        const entityType1 = m1.metadata?.entityType;
        const entityType2 = m2.metadata?.entityType;
        const name1 = m1.metadata?.name ? this.normalizeContent(m1.metadata.name) : null;
        const name2 = m2.metadata?.name ? this.normalizeContent(m2.metadata.name) : null;
        
        if (entityType1 === entityType2 && name1 === name2) {
          return 1.0;
        }
        
        // Same content but different entity details
        return 0.7;
      }
      
      return 1.0;
    }
    
    // Calculate Levenshtein distance-based similarity for near matches
    const distance = this.levenshteinDistance(content1, content2);
    const maxLength = Math.max(content1.length, content2.length);
    
    if (maxLength === 0) {
      return 1.0;
    }
    
    const similarity = 1 - (distance / maxLength);
    
    // Only consider it similar if above threshold
    return similarity >= 0.85 ? similarity : 0;
  }
  
  /**
   * Group memories by type for efficient comparison
   */
  private groupMemoriesByType(memories: ExtractedMemory[]): Map<string, ExtractedMemory[]> {
    const groups = new Map<string, ExtractedMemory[]>();
    
    for (const memory of memories) {
      const existing = groups.get(memory.type) ?? [];
      existing.push(memory);
      groups.set(memory.type, existing);
    }
    
    return groups;
  }
  
  /**
   * Find groups of duplicate memories
   */
  private findDuplicateGroups(memories: ExtractedMemory[]): ExtractedMemory[][] {
    const groups: ExtractedMemory[][] = [];
    const processed = new Set<string>();
    
    for (let i = 0; i < memories.length; i++) {
      if (processed.has(memories[i].id)) {
        continue;
      }
      
      const group: ExtractedMemory[] = [memories[i]];
      processed.add(memories[i].id);
      
      // Find all similar memories
      for (let j = i + 1; j < memories.length; j++) {
        if (processed.has(memories[j].id)) {
          continue;
        }
        
        const similarity = this.calculateSimilarity(memories[i], memories[j]);
        
        if (similarity >= 0.85) {
          group.push(memories[j]);
          processed.add(memories[j].id);
        }
      }
      
      groups.push(group);
    }
    
    return groups;
  }
  
  /**
   * Merge multiple duplicate memories into one
   * 
   * @param memories - Array of duplicate memories to merge
   * @returns Merged memory
   */
  private mergeMemories(memories: ExtractedMemory[]): ExtractedMemory {
    if (memories.length === 0) {
      throw new Error('Cannot merge empty array of memories');
    }
    
    if (memories.length === 1) {
      return memories[0];
    }
    
    // Sort by confidence (highest first)
    const sorted = [...memories].sort((a, b) => b.confidence - a.confidence);
    const highest = sorted[0];
    
    // Collect source chunk IDs
    const sourceChunks = new Set<string>();
    for (const memory of memories) {
      if (memory.source_chunks) {
        for (const chunkId of memory.source_chunks) {
          sourceChunks.add(chunkId);
        }
      }
    }
    
    // Collect chunk confidences
    const chunkConfidences: number[] = [];
    for (const memory of memories) {
      if (memory.chunk_confidence) {
        chunkConfidences.push(...memory.chunk_confidence);
      }
    }
    
    // Merge source_message_ids (unique)
    const allMessageIds = new Set<string>();
    for (const memory of memories) {
      for (const msgId of memory.source_message_ids) {
        allMessageIds.add(msgId);
      }
    }
    
    // Merge metadata - start with highest confidence memory's metadata
    const mergedMetadata: Record<string, any> = { ...highest.metadata };
    
    // Add any missing fields from other memories
    for (const memory of sorted.slice(1)) {
      if (memory.metadata) {
        for (const [key, value] of Object.entries(memory.metadata)) {
          if (mergedMetadata[key] === undefined || mergedMetadata[key] === null) {
            mergedMetadata[key] = value;
          }
        }
      }
    }
    
    // Find earliest created_at
    const earliestCreatedAt = memories.reduce((earliest, memory) => {
      return new Date(memory.created_at) < new Date(earliest) ? memory.created_at : earliest;
    }, memories[0].created_at);
    
    // Track which memories were merged
    const mergedFrom = memories.map(m => m.id);
    
    return {
      ...highest,
      source_message_ids: Array.from(allMessageIds).sort(),
      metadata: mergedMetadata,
      created_at: earliestCreatedAt,
      source_chunks: sourceChunks.size > 0 ? Array.from(sourceChunks).sort() : undefined,
      chunk_confidence: chunkConfidences.length > 0 ? chunkConfidences : undefined,
      merged_from: mergedFrom,
    };
  }
  
  /**
   * Normalize content for consistent comparison
   */
  private normalizeContent(content: string): string {
    return content
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');
  }
  
  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    
    // Create a 2D array for dynamic programming
    const dp: number[][] = Array(len1 + 1)
      .fill(null)
      .map(() => Array(len2 + 1).fill(0));
    
    // Initialize first row and column
    for (let i = 0; i <= len1; i++) {
      dp[i][0] = i;
    }
    for (let j = 0; j <= len2; j++) {
      dp[0][j] = j;
    }
    
    // Fill the dp table
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1,     // deletion
            dp[i][j - 1] + 1,     // insertion
            dp[i - 1][j - 1] + 1  // substitution
          );
        }
      }
    }
    
    return dp[len1][len2];
  }
}
