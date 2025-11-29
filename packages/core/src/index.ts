/**
 * @memorylayer/core - Simple wrapper for MemoryLayer
 * 
 * Get started in 5 lines:
 * ```typescript
 * const ml = new MemoryLayer({ storage: 'sqlite://memory.db' });
 * await ml.extract("Project Alpha deadline is Q4");
 * const results = await ml.search("when is the deadline?");
 * ```
 */

import { StorageClient, type StorageConfig } from '@memorylayer/storage';
import { MemoryExtractor } from '@memorylayer/memory-extraction';
import { ContextEngine } from '@memorylayer/context-engine';

export interface MemoryLayerConfig {
    /** Storage URL (e.g., 'sqlite://memory.db' or full config) */
    storage: string | StorageConfig;

    /** OpenAI API key for extraction and embeddings */
    apiKey?: string;

    /** Memory types to extract (defaults to ['entity', 'fact', 'decision']) */
    memoryTypes?: string[];

    /** Minimum confidence threshold (0-1) */
    minConfidence?: number;
}

export interface SearchOptions {
    /** Maximum number of results */
    limit?: number;

    /** Filter by memory types */
    types?: string[];

    /** Include relationship traversal */
    includeRelationships?: boolean;

    /** Token budget for context */
    tokenBudget?: number;
}

/**
 * MemoryLayer - Simple API for persistent AI memory
 */
export class MemoryLayer {
    private storage: StorageClient;
    private extractor: MemoryExtractor;
    private context: ContextEngine;
    private workspaceId: string;

    constructor(config: MemoryLayerConfig) {
        // Parse storage config
        let storageConfig: StorageConfig;
        if (typeof config.storage === 'string') {
            // Simple string format: 'sqlite://path' or 'postgres://url'
            if (config.storage.startsWith('sqlite://')) {
                const filename = config.storage.replace('sqlite://', '');
                storageConfig = {
                    sqlite: { filename },
                    vectorize: { mode: 'local' },
                };
            } else if (config.storage.startsWith('postgres://')) {
                throw new Error('Postgres string format not yet supported. Use full config.');
            } else {
                throw new Error('Invalid storage format. Use "sqlite://path" or provide full config.');
            }
        } else {
            storageConfig = config.storage;
        }

        // Initialize storage
        this.storage = new StorageClient(storageConfig);

        // Initialize extractor (if API key provided)
        if (config.apiKey) {
            // TODO: Initialize with actual provider when memory-extraction exports are fixed
            // For now, this is a placeholder
            this.extractor = null as any;
        } else {
            this.extractor = null as any;
        }

        // Initialize context engine
        // TODO: Initialize when context-engine exports are ready
        this.context = null as any;

        // Create default workspace
        this.workspaceId = 'default';
    }

    /**
     * Extract memories from text
     */
    async extract(text: string, options?: { types?: string[] }): Promise<void> {
        if (!this.extractor) {
            throw new Error('API key required for extraction. Provide apiKey in config.');
        }

        // TODO: Implement extraction
        // const result = await this.extractor.extract({ messages: [{ role: 'user', content: text }] }, this.workspaceId);
        throw new Error('Extract not yet implemented - coming soon!');
    }

    /**
     * Search for relevant memories
     */
    async search(query: string, options?: SearchOptions): Promise<any[]> {
        if (!this.context) {
            throw new Error('Context engine not initialized');
        }

        // TODO: Implement search
        // const result = await this.context.buildContext(query, this.workspaceId, {
        //   limit: options?.limit ?? 10,
        //   includeRelationships: options?.includeRelationships ?? false,
        //   tokenBudget: options?.tokenBudget ?? 1000,
        // });
        throw new Error('Search not yet implemented - coming soon!');
    }

    /**
     * Build context for a query
     */
    async buildContext(query: string, options?: SearchOptions): Promise<string> {
        if (!this.context) {
            throw new Error('Context engine not initialized');
        }

        // TODO: Implement context building
        throw new Error('BuildContext not yet implemented - coming soon!');
    }

    /**
     * Get direct access to storage client (advanced usage)
     */
    getStorage(): StorageClient {
        return this.storage;
    }

    /**
     * Get direct access to extractor (advanced usage)
     */
    getExtractor(): MemoryExtractor | null {
        return this.extractor;
    }

    /**
     * Get direct access to context engine (advanced usage)
     */
    getContextEngine(): ContextEngine | null {
        return this.context;
    }
}

// Re-export types from underlying packages
export type { StorageConfig } from '@memorylayer/storage';
export type { Memory, Workspace, Conversation } from '@memorylayer/storage';
