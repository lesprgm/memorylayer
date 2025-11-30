/**
 * Semantic Retrieval Tests
 * 
 * Tests verify that semantic search correctly ranks and retrieves
 * memories based on vector similarity and semantic understanding.
 * 
 * These tests use a simplified setup to avoid heavy initialization.
 */

import { describe, it, expect } from 'vitest';
import { cosineSimilarity, findTopKSimilar } from '@memorylayer/storage';

describe('Semantic Retrieval - Core Functionality', () => {
    describe('Vector Similarity for Text Embeddings', () => {
        /**
         * Simulate embeddings for semantically similar terms
         * In practice these would come from a real embedding model,
         * but for testing we create synthetic vectors that demonstrate
         * the expected behavior.
         */

        it('should rank semantically similar documents higher', () => {
            // Simulate embedding vectors (in reality these are 384-dimensional)
            // These simplified 5-D vectors represent: [finance, tech, hr, sales, general]

            const queryVector = [0.9, 0.1, 0.0, 0.2, 0.1]; // Searching for finance content

            const documents = [
                {
                    vector: [0.95, 0.05, 0.0, 0.1, 0.05], // Financial report
                    data: {
                        id: 'doc1',
                        content: 'Q4 Revenue Report with financial analysis',
                        type: 'file',
                    },
                },
                {
                    vector: [0.1, 0.9, 0.0, 0.1, 0.05], // Technical doc
                    data: {
                        id: 'doc2',
                        content: 'Database architecture documentation',
                        type: 'file',
                    },
                },
                {
                    vector: [0.85, 0.1, 0.05, 0.15, 0.1], // Budget document (financial)
                    data: {
                        id: 'doc3',
                        content: 'Budget Proposal for 2025',
                        type: 'file',
                    },
                },
                {
                    vector: [0.05, 0.1, 0.9, 0.0, 0.1], // HR document
                    data: {
                        id: 'doc4',
                        content: 'Employee Handbook and policies',
                        type: 'file',
                    },
                },
            ];

            const results = findTopKSimilar(queryVector, documents, 3);

            // Financial documents should rank highest (note: actual ranking depends on cosine similarity)
            const topIds = results.map(r => r.data.id);
            expect(topIds).toContain('doc1'); // Revenue report
            expect(topIds).toContain('doc3'); // Budget
            // Scores should be in descending order
            expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
            expect(results[1].score).toBeGreaterThanOrEqual(results[2].score);
        });

        it('should handle multi-faceted queries', () => {
            // Query mixing finance + sales concepts
            const queryVector = [0.6, 0.1, 0.0, 0.5, 0.1];

            const documents = [
                {
                    vector: [0.9, 0.0, 0.0, 0.1, 0.1], // Pure finance
                    data: { id: 'finance', content: 'Financial statements' },
                },
                {
                    vector: [0.1, 0.0, 0.0, 0.9, 0.1], // Pure sales
                    data: { id: 'sales', content: 'Sales performance metrics' },
                },
                {
                    vector: [0.65, 0.05, 0.0, 0.55, 0.1], // Finance + Sales
                    data: { id: 'revenue', content: 'Revenue and sales analysis' },
                },
            ];

            const results = findTopKSimilar(queryVector, documents, 3);

            // The document with both concepts should rank highest
            expect(results[0].data.id).toBe('revenue');
            expect(results[0].score).toBeGreaterThan(0.95); // High similarity
        });
    });

    describe('Practical Semantic Understanding', () => {
        /**
         * Test that demonstrates how semantic search would work
         * with real-world queries and documents
         */

        it('should understand queries match conceptually similar documents', () => {
            // Simplified example: query "quarterly earnings" vs documents
            // Vector represents semantic concepts (simplified to 3D for clarity)

            const queries = [
                { text: 'quarterly earnings', vector: [1.0, 0.2, 0.1] },
                { text: 'team meeting', vector: [0.1, 1.0, 0.2] },
                { text: 'employee benefits', vector: [0.2, 0.1, 1.0] },
            ];

            const documents = [
                { vector: [0.95, 0.15, 0.05], content: 'Q3 revenue report' },
                { vector: [0.9, 0.25, 0.1], content: 'Financial performance analysis' },
                { vector: [0.1, 0.9, 0.15], content: 'Project standup notes' },
                { vector: [0.15, 0.2, 0.9], content: 'Healthcare benefits guide' },
            ];

            // Test "quarterly earnings" query
            const earningsQuery = queries[0];
            let scores = documents.map(doc => ({
                content: doc.content,
                score: cosineSimilarity(earningsQuery.vector, doc.vector),
            }));
            scores.sort((a, b) => b.score - a.score);

            // Should match financial documents
            expect(scores[0].content).toContain('revenue');
            expect(scores[1].content).toContain('Financial');

            // Test "team meeting" query
            const meetingQuery = queries[1];
            scores = documents.map(doc => ({
                content: doc.content,
                score: cosineSimilarity(meetingQuery.vector, doc.vector),
            }));
            scores.sort((a, b) => b.score - a.score);

            // Should match meeting-related document
            expect(scores[0].content).toContain('standup');

            // Test "employee benefits" query
            const benefitsQuery = queries[2];
            scores = documents.map(doc => ({
                content: doc.content,
                score: cosineSimilarity(benefitsQuery.vector, doc.vector),
            }));
            scores.sort((a, b) => b.score - a.score);

            // Should match benefits document
            expect(scores[0].content).toContain('Healthcare');
        });
    });

    describe('Ranking Quality Expectations', () => {
        it('should score identical vectors at 1.0', () => {
            const v = [0.5, 0.3, 0.8];
            const score = cosineSimilarity(v, v);
            expect(score).toBeCloseTo(1.0, 5);
        });

        it('should score orthogonal vectors at 0.0', () => {
            const v1 = [1, 0, 0];
            const v2 = [0, 1, 0];
            const score = cosineSimilarity(v1, v2);
            expect(score).toBeCloseTo(0.0, 5);
        });

        it('should score similar vectors between 0.5 and 1.0', () => {
            // Vectors pointing in roughly same direction
            const v1 = [0.7, 0.2, 0.1];
            const v2 = [0.8, 0.15, 0.05];
            const score = cosineSimilarity(v1, v2);

            expect(score).toBeGreaterThan(0.5);
            expect(score).toBeLessThan(1.0);
        });

        it('should maintain ranking stability', () => {
            const query = [0.6, 0.3, 0.1];
            const docs = [
                { vector: [0.65, 0.28, 0.12], data: { id: 'A' } },
                { vector: [0.5, 0.4, 0.1], data: { id: 'B' } },
                { vector: [0.7, 0.25, 0.15], data: { id: 'C' } },
            ];

            const results = findTopKSimilar(query, docs, 3);

            // Rankings should be deterministic
            const firstRun = results.map(r => r.data.id);
            const secondRun = findTopKSimilar(query, docs, 3).map(r => r.data.id);

            expect(firstRun).toEqual(secondRun);
        });
    });

    describe('Real-World Scenarios', () => {
        it('should handle synonym understanding via similar embeddings', () => {
            // In real embeddings, synonyms have similar vectors
            // "revenue" and "income" would have high similarity

            const revenueVector = [0.9, 0.1, 0.05, 0.08];
            const incomeVector = [0.88, 0.12, 0.06, 0.09]; // Similar to revenue
            const costVector = [0.15, 0.8, 0.1, 0.05]; // Different concept

            const revenueSimilarity = cosineSimilarity(revenueVector, incomeVector);
            const costSimilarity = cosineSimilarity(revenueVector, costVector);

            // Synonyms should be more similar than unrelated terms
            expect(revenueSimilarity).toBeGreaterThan(costSimilarity);
            expect(revenueSimilarity).toBeGreaterThan(0.9); // Very similar
        });

        it('should handle multi-topic documents', () => {
            const query = [0.5, 0.5, 0.0]; // Looking for docs with concepts A and B

            const docs = [
                { vector: [1.0, 0.0, 0.0], data: { id: 'only-A' } },
                { vector: [0.0, 1.0, 0.0], data: { id: 'only-B' } },
                { vector: [0.6, 0.6, 0.0], data: { id: 'both-A-and-B' } },
                { vector: [0.0, 0.0, 1.0], data: { id: 'only-C' } },
            ];

            const results = findTopKSimilar(query, docs, 4);

            // Document with both topics should rank first
            expect(results[0].data.id).toBe('both-A-and-B');
            expect(results[0].score).toBeGreaterThan(results[1].score);
        });

        it('should filter and rank simultaneously', () => {
            const query = [0.8, 0.2];

            const allDocs = [
                { vector: [0.85, 0.15], type: 'file', id: 'f1' },
                { vector: [0.9, 0.1], type: 'decision', id: 'd1' },
                { vector: [0.75, 0.25], type: 'file', id: 'f2' },
                { vector: [0.7, 0.3], type: 'fact', id: 'fact1' },
            ];

            // Simulate filtering by type
            const filesOnly = allDocs.filter(doc => doc.type === 'file').map(doc => ({
                vector: doc.vector,
                data: { id: doc.id, type: doc.type },
            }));
            const results = findTopKSimilar(query, filesOnly, 5);

            // Should only return files
            results.forEach(r => {
                expect(r.data.type).toBe('file');
            });

            // Should be ranked by similarity (both f1 and f2 are close, accept either)
            const topIds = results.map(r => r.data.id);
            expect(topIds).toContain('f1');
            expect(topIds).toContain('f2');
        });
    });
});

describe('Semantic Retrieval - Performance Characteristics', () => {
    it('should handle large result sets efficiently', () => {
        const query = [0.5, 0.5, 0.0];

        // Create 1000 synthetic documents
        const largeDocs = Array.from({ length: 1000 }, (_, i) => ({
            vector: [
                Math.random(),
                Math.random(),
                Math.random(),
            ],
            data: { id: `doc-${i}` },
        }));

        const startTime = Date.now();
        const results = findTopKSimilar(query, largeDocs, 10);
        const endTime = Date.now();

        expect(results).toHaveLength(10);
        expect(endTime - startTime).toBeLessThan(100); // Should be fast (<100ms)
    });

    it('should maintain accuracy with high-dimensional vectors', () => {
        // Test with 384 dimensions (actual embedding size)
        const dim = 384;

        const query = new Array(dim).fill(0).map(() => Math.random());
        const identicalDoc = { vector: [...query], id: 'identical' };
        const similarDoc = { vector: query.map(v => v + (Math.random() - 0.5) * 0.1), id: 'similar' };
        const randomDoc = { vector: new Array(dim).fill(0).map(() => Math.random()), id: 'random' };

        const docs = [randomDoc, similarDoc, identicalDoc].map(d => ({
            vector: d.vector,
            data: { id: d.id },
        }));

        const results = findTopKSimilar(query, docs, 3);

        // Identical should rank first
        expect(results[0].data.id).toBe('identical');
        expect(results[0].score).toBeCloseTo(1.0, 5);

        // Similar should rank second
        expect(results[1].data.id).toBe('similar');
        expect(results[1].score).toBeGreaterThan(0.9);
    });
});
