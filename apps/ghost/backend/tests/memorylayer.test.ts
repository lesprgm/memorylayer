import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import { localEmbeddingProvider } from '../src/adapters/local-embedding-provider.js';
import { LocalStorageClient } from '../src/adapters/local-storage-client.js';
import { SingleUserManager } from '../src/adapters/single-user-manager.js';
import { initializeDatabase } from '../src/db/migrations.js';

describe('MemoryLayer Integration Tests', () => {
    describe('LocalEmbeddingProvider', () => {
        it('should generate embeddings with correct dimensions', async () => {
            const text = 'Test embedding generation';
            const embedding = await localEmbeddingProvider.embed(text);

            expect(embedding).toBeDefined();
            expect(embedding.length).toBe(384);
            expect(embedding.every(n => typeof n === 'number')).toBe(true);
        });

        it('should generate consistent embeddings for same text', async () => {
            const text = 'Consistent embedding test';
            const embedding1 = await localEmbeddingProvider.embed(text);
            const embedding2 = await localEmbeddingProvider.embed(text);

            // Embeddings should be very similar (cosine similarity close to 1)
            const similarity = cosineSimilarity(embedding1, embedding2);
            expect(similarity).toBeGreaterThan(0.99);
        });

        it('should generate different embeddings for different text', async () => {
            const text1 = 'Sarah works at Acme Corp';
            const text2 = 'John is the CEO of TechStart';

            const embedding1 = await localEmbeddingProvider.embed(text1);
            const embedding2 = await localEmbeddingProvider.embed(text2);

            const similarity = cosineSimilarity(embedding1, embedding2);
            expect(similarity).toBeLessThan(0.5); // Should be quite different
        });

        it('should handle batch embeddings', async () => {
            const texts = ['Text 1', 'Text 2', 'Text 3'];
            const embeddings = await localEmbeddingProvider.embedBatch(texts);

            expect(embeddings.length).toBe(3);
            embeddings.forEach(emb => {
                expect(emb.length).toBe(384);
            });
        });
    });

    describe('LocalStorageClient', () => {
        let db: any;
        let storageClient: LocalStorageClient;

        beforeAll(() => {
            db = initializeDatabase(':memory:');
            storageClient = new LocalStorageClient(db);
        });

        it('should create and retrieve users', async () => {
            const email = `test-${Date.now()}@example.com`;
            const result = await storageClient.createUser({
                email,
                name: 'Test User',
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.email).toBe(email);
                expect(result.value.name).toBe('Test User');
            }
        });

        it('should create and retrieve workspaces', async () => {
            // Create user first with unique email
            const uniqueEmail = `workspace-${Date.now()}@example.com`;
            const userResult = await storageClient.createUser({
                email: uniqueEmail,
                name: 'Workspace Owner',
            });

            expect(userResult.ok).toBe(true);
            if (!userResult.ok) return;

            const workspaceResult = await storageClient.createWorkspace({
                id: `ws-test-${Date.now()}`,
                name: 'Test Workspace',
                type: 'personal',
                owner_id: userResult.value.id,
            });

            expect(workspaceResult.ok).toBe(true);
            if (workspaceResult.ok) {
                expect(workspaceResult.value.name).toBe('Test Workspace');
                expect(workspaceResult.value.type).toBe('personal');
            }
        });

        it('should create memories with embeddings', async () => {
            // Create workspace first
            const userResult = await storageClient.createUser({
                email: `memory-${Date.now()}@example.com`,
                name: 'Memory User',
            });
            if (!userResult.ok) {
                console.error('Failed to create user:', userResult.error);
                throw new Error('Failed to create user');
            }

            const workspaceResult = await storageClient.createWorkspace({
                id: crypto.randomUUID(),
                name: `Memory Workspace ${Date.now()}`,
                type: 'personal',
                owner_id: userResult.value.id,
            });
            if (!workspaceResult.ok) {
                console.error('Failed to create workspace:', workspaceResult.error);
                throw new Error('Failed to create workspace');
            }

            const embedding = await localEmbeddingProvider.embed('Test memory content');

            const result = await storageClient.createMemory({
                workspace_id: workspaceResult.value.id,
                type: 'entity.person',
                content: 'Sarah - sarah@acme.com',
                confidence: 0.9,
                metadata: { email: 'sarah@acme.com' },
                embedding: embedding,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.content).toBe('Sarah - sarah@acme.com');
                expect(result.value.confidence).toBe(0.9);
            }
        });

        it('should search memories using vector similarity', async () => {
            // Create workspace first
            const userResult = await storageClient.createUser({
                email: `search-${Date.now()}@example.com`,
                name: 'Search User',
            });
            if (!userResult.ok) throw new Error('Failed to create user');

            const workspaceResult = await storageClient.createWorkspace({
                id: `ws-search-${Date.now()}`,
                name: 'Search Workspace',
                type: 'personal',
                owner_id: userResult.value.id,
            });
            if (!workspaceResult.ok) throw new Error('Failed to create workspace');

            const workspaceId = workspaceResult.value.id;

            // Create test memories with embeddings
            const memory1 = await localEmbeddingProvider.embed('Sarah works at Acme Corp');
            await storageClient.createMemory({
                workspace_id: workspaceId,
                type: 'entity.person',
                content: 'Sarah - sarah@acme.com',
                confidence: 0.9,
                embedding: memory1,
            });

            const memory2 = await localEmbeddingProvider.embed('John is the CEO');
            await storageClient.createMemory({
                workspace_id: workspaceId,
                type: 'entity.person',
                content: 'John - john@techstart.com',
                confidence: 0.85,
                embedding: memory2,
            });

            // Search for Sarah
            const queryEmbedding = await localEmbeddingProvider.embed('Who is Sarah?');
            const searchResult = await storageClient.searchMemories(workspaceId, {
                vector: queryEmbedding,
                limit: 10,
            });

            expect(searchResult.ok).toBe(true);
            if (searchResult.ok) {
                expect(searchResult.value.length).toBeGreaterThan(0);
                // Sarah should be the top result
                expect(searchResult.value[0].memory.content).toContain('Sarah');
            }
        });

        it('should create relationships between memories', async () => {
            const memory1Result = await storageClient.createMemory({
                workspace_id: 'ghost-workspace',
                type: 'entity.person',
                content: 'Sarah',
                confidence: 0.9,
            });

            const memory2Result = await storageClient.createMemory({
                workspace_id: 'ghost-workspace',
                type: 'entity.email',
                content: 'sarah@acme.com',
                confidence: 0.9,
            });

            if (!memory1Result.ok || !memory2Result.ok) return;

            const relationshipResult = await storageClient.createRelationship({
                from_memory_id: memory1Result.value.id,
                to_memory_id: memory2Result.value.id,
                relationship_type: 'has_email',
                confidence: 0.95,
            });

            expect(relationshipResult.ok).toBe(true);
            if (relationshipResult.ok) {
                expect(relationshipResult.value.relationship_type).toBe('has_email');
            }
        });
    });

    describe('SingleUserManager', () => {
        let db: any;
        let manager: SingleUserManager;

        beforeAll(() => {
            db = initializeDatabase(':memory:');
            manager = new SingleUserManager(db);
        });

        it('should initialize default user and workspace', async () => {
            const result = await manager.initialize();

            expect(result.userId).toBe('ghost-user');
            expect(result.workspaceId).toBe('ghost-workspace');
        });

        it('should return consistent user and workspace IDs', () => {
            expect(manager.getUserId()).toBe('ghost-user');
            expect(manager.getWorkspaceId()).toBe('ghost-workspace');
        });

        it('should map any user to default workspace', () => {
            const workspaceId = manager.mapUserToWorkspace('any-user-id');
            expect(workspaceId).toBe('ghost-workspace');
        });
    });

    describe('Database Schema', () => {
        it('should create all MemoryLayer tables', () => {
            const db = initializeDatabase(':memory:');

            // Check that all tables exist
            const tables = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' 
        ORDER BY name
      `).all() as Array<{ name: string }>;

            const tableNames = tables.map(t => t.name);

            expect(tableNames).toContain('users');
            expect(tableNames).toContain('workspaces');
            expect(tableNames).toContain('conversations');
            expect(tableNames).toContain('memories');
            expect(tableNames).toContain('relationships');
            expect(tableNames).toContain('commands');
            expect(tableNames).toContain('actions');
        });

        it('should enforce foreign key constraints', () => {
            const db = initializeDatabase(':memory:');

            // Try to create workspace without user (should fail)
            expect(() => {
                db.prepare(`
          INSERT INTO workspaces (id, name, type, owner_id)
          VALUES ('test', 'Test', 'personal', 'nonexistent-user')
        `).run();
            }).toThrow();
        });
    });
});

// Helper function for cosine similarity
function cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
