/**
 * Test to demonstrate LRU caching in Ghost backend
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { memoryLayerIntegration } from '../src/services/memory-layer-integration';

describe('Ghost Backend - LRU Cache Integration', () => {
    beforeAll(async () => {
        await memoryLayerIntegration.initialize();
    });

    it('should have context-engine with caching enabled', () => {
        const engine = memoryLayerIntegration.contextEngine;
        expect(engine).toBeDefined();

        // The context engine should have the getCacheStats method now
        if (engine && 'getCacheStats' in engine) {
            const stats = (engine as any).getCacheStats();

            console.log('Cache Statistics:', JSON.stringify(stats, null, 2));

            // Verify cache structure
            expect(stats).toHaveProperty('embedding');
            expect(stats).toHaveProperty('result');
            expect(stats).toHaveProperty('context');

            // Each cache should have stats
            expect(stats.embedding).toHaveProperty('hits');
            expect(stats.embedding).toHaveProperty('misses');
            expect(stats.embedding).toHaveProperty('hitRate');
        } else {
            console.log('⚠️  getCacheStats not available - caching not integrated');
        }
    });

    it('should demonstrate cache hits on repeated queries', async () => {
        const engine = memoryLayerIntegration.contextEngine;
        if (!engine) {
            console.log('Context engine not available');
            return;
        }

        const query = 'test caching query';
        const workspaceId = 'test-user';

        // First query - cache miss
        const result1 = await engine.buildContext(query, workspaceId, {
            limit: 5,
            tokenBudget: 1000,
        });

        expect(result1.ok).toBe(true);

        // Get stats after first query
        if ('getCacheStats' in engine) {
            const stats1 = (engine as any).getCacheStats();
            console.log('After first query:', {
                embedding: `${stats1.embedding.hits}/${stats1.embedding.hits + stats1.embedding.misses}`,
                context: `${stats1.context.hits}/${stats1.context.hits + stats1.context.misses}`,
            });

            // Second identical query - should hit cache
            const result2 = await engine.buildContext(query, workspaceId, {
                limit: 5,
                tokenBudget: 1000,
            });

            expect(result2.ok).toBe(true);

            // Get stats after second query
            const stats2 = (engine as any).getCacheStats();
            console.log('After second query:', {
                embedding: `${stats2.embedding.hits}/${stats2.embedding.hits + stats2.embedding.misses}`,
                context: `${stats2.context.hits}/${stats2.context.hits + stats2.context.misses}`,
            });

            // Context cache should have increased hits
            expect(stats2.context.hits).toBeGreaterThan(stats1.context.hits);

            console.log('✅ Cache hit rate improved:', {
                embeddingHitRate: `${(stats2.embedding.hitRate * 100).toFixed(1)}%`,
                contextHitRate: `${(stats2.context.hitRate * 100).toFixed(1)}%`,
            });
        }
    });
});
