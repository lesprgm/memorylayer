import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MemoryService } from '../services/memory'
import { DatabaseClient } from '../lib/db'

/**
 * Enhanced Memory Service Tests
 * Tests for filtering pinned/hidden memories and advanced query features
 */
describe('MemoryService - Enhanced Filtering', () => {
    let db: DatabaseClient
    let service: MemoryService
    let testWorkspaceId: string
    let testUserId: string
    let testConversationId: string
    let testMemoryIds: string[]

    beforeEach(async () => {
        const supabaseUrl = process.env.SUPABASE_URL
        const supabaseKey = process.env.SUPABASE_KEY

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('SUPABASE_URL and SUPABASE_KEY must be set')
        }

        db = new DatabaseClient(supabaseUrl, supabaseKey)
        service = new MemoryService(db)

        // Setup test data
        testUserId = crypto.randomUUID()
        await db.query(
            'INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)',
            [testUserId, 'Test User', `test-${Date.now()}-${Math.random()}@example.com`, 'test-hash']
        )

        testWorkspaceId = crypto.randomUUID()
        await db.query(
            'INSERT INTO workspaces (id, name, type, owner_id) VALUES ($1, $2, $3, $4)',
            [testWorkspaceId, 'Test Workspace', 'personal', testUserId]
        )

        testConversationId = crypto.randomUUID()
        await db.query(
            `INSERT INTO conversations (id, workspace_id, provider, title, created_at, updated_at)
       VALUES ($1, $2, 'anthropic', 'Test', NOW(), NOW())`,
            [testConversationId, testWorkspaceId]
        )

        testMemoryIds = []
    })

    afterEach(async () => {
        if (testMemoryIds.length > 0) {
            await db.query('DELETE FROM memories WHERE id = ANY($1)', [testMemoryIds])
        }
        if (testConversationId) {
            await db.query('DELETE FROM conversations WHERE id = $1', [testConversationId])
        }
        if (testWorkspaceId) {
            await db.query('DELETE FROM workspaces WHERE id = $1', [testWorkspaceId])
        }
        if (testUserId) {
            await db.query('DELETE FROM users WHERE id = $1', [testUserId])
        }
    })

    describe('Pinned Memory Filtering', () => {
        beforeEach(async () => {
            // Create mix of pinned and unpinned memories
            const memories = [
                { pinned: true, content: 'Pinned Memory 1' },
                { pinned: false, content: 'Unpinned Memory 1' },
                { pinned: true, content: 'Pinned Memory 2' },
                { pinned: false, content: 'Unpinned Memory 2' },
                { pinned: true, content: 'Pinned Memory 3' },
            ]

            for (const mem of memories) {
                const id = crypto.randomUUID()
                testMemoryIds.push(id)
                await db.query(
                    `INSERT INTO memories (id, workspace_id, conversation_id, type, content, confidence, metadata, created_at)
           VALUES ($1, $2, $3, 'fact', $4, 0.9, $5, NOW())`,
                    [id, testWorkspaceId, testConversationId, mem.content, JSON.stringify({ pinned: mem.pinned })]
                )
            }
        })

        it('returns all memories when no filter applied', async () => {
            const result = await service.getMemories({ workspaceId: testWorkspaceId })
            expect(result.total).toBe(5)
        })

        it('can filter to show only pinned memories', async () => {
            // Note: This would require implementing a metadata filter in getMemories
            // For now, we verify we can retrieve and identify pinned memories
            const result = await service.getMemories({ workspaceId: testWorkspaceId })
            const pinnedMemories = result.memories.filter(m => m.metadata.pinned === true)
            expect(pinnedMemories.length).toBe(3)
        })

        it('pinned memories contain correct metadata', async () => {
            const result = await service.getMemories({ workspaceId: testWorkspaceId })
            const pinnedMemories = result.memories.filter(m => m.metadata.pinned === true)

            pinnedMemories.forEach(memory => {
                expect(memory.metadata).toHaveProperty('pinned')
                expect(memory.metadata.pinned).toBe(true)
                expect(memory.content).toContain('Pinned Memory')
            })
        })
    })

    describe('Hidden Memory Filtering', () => {
        beforeEach(async () => {
            // Create mix of hidden and visible memories
            const memories = [
                { hidden: false, content: 'Visible Memory 1' },
                { hidden: true, content: 'Hidden Memory 1' },
                { hidden: false, content: 'Visible Memory 2' },
                { hidden: true, content: 'Hidden Memory 2' },
            ]

            for (const mem of memories) {
                const id = crypto.randomUUID()
                testMemoryIds.push(id)
                await db.query(
                    `INSERT INTO memories (id, workspace_id, conversation_id, type, content, confidence, metadata, created_at)
           VALUES ($1, $2, $3, 'fact', $4, 0.9, $5, NOW())`,
                    [id, testWorkspaceId, testConversationId, mem.content, JSON.stringify({ hidden: mem.hidden })]
                )
            }
        })

        it('can identify hidden memories', async () => {
            const result = await service.getMemories({ workspaceId: testWorkspaceId })
            const hiddenMemories = result.memories.filter(m => m.metadata.hidden === true)
            expect(hiddenMemories.length).toBe(2)
        })

        it('can identify visible memories', async () => {
            const result = await service.getMemories({ workspaceId: testWorkspaceId })
            const visibleMemories = result.memories.filter(m => !m.metadata.hidden)
            expect(visibleMemories.length).toBe(2)
        })

        it('hidden memories contain correct metadata', async () => {
            const result = await service.getMemories({ workspaceId: testWorkspaceId })
            const hiddenMemories = result.memories.filter(m => m.metadata.hidden === true)

            hiddenMemories.forEach(memory => {
                expect(memory.metadata).toHaveProperty('hidden')
                expect(memory.metadata.hidden).toBe(true)
                expect(memory.content).toContain('Hidden Memory')
            })
        })
    })

    describe('Combined Pinned and Hidden Filtering', () => {
        beforeEach(async () => {
            // Create memories with various combinations
            const memories = [
                { pinned: true, hidden: false, content: 'Pinned + Visible' },
                { pinned: true, hidden: true, content: 'Pinned + Hidden' },
                { pinned: false, hidden: false, content: 'Unpinned + Visible' },
                { pinned: false, hidden: true, content: 'Unpinned + Hidden' },
            ]

            for (const mem of memories) {
                const id = crypto.randomUUID()
                testMemoryIds.push(id)
                await db.query(
                    `INSERT INTO memories (id, workspace_id, conversation_id, type, content, confidence, metadata, created_at)
           VALUES ($1, $2, $3, 'fact', $4, 0.9, $5, NOW())`,
                    [id, testWorkspaceId, testConversationId, mem.content, JSON.stringify({
                        pinned: mem.pinned,
                        hidden: mem.hidden
                    })]
                )
            }
        })

        it('can filter for pinned but visible memories', async () => {
            const result = await service.getMemories({ workspaceId: testWorkspaceId })
            const filtered = result.memories.filter(m =>
                m.metadata.pinned === true && !m.metadata.hidden
            )
            expect(filtered.length).toBe(1)
            expect(filtered[0].content).toBe('Pinned + Visible')
        })

        it('can filter for hidden memories regardless of pin status', async () => {
            const result = await service.getMemories({ workspaceId: testWorkspaceId })
            const hiddenMemories = result.memories.filter(m => m.metadata.hidden === true)
            expect(hiddenMemories.length).toBe(2)
        })

        it('can filter for visible memories regardless of pin status', async () => {
            const result = await service.getMemories({ workspaceId: testWorkspaceId })
            const visibleMemories = result.memories.filter(m => !m.metadata.hidden)
            expect(visibleMemories.length).toBe(2)
        })
    })

    describe('Metadata Query Performance', () => {
        it('handles large number of memories with varied metadata', async () => {
            // Create 50 memories with random pinned/hidden states
            const ids: string[] = []
            for (let i = 0; i < 50; i++) {
                const id = crypto.randomUUID()
                ids.push(id)
                testMemoryIds.push(id)

                const metadata = {
                    pinned: Math.random() > 0.5,
                    hidden: Math.random() > 0.7,
                    index: i
                }

                await db.query(
                    `INSERT INTO memories (id, workspace_id, conversation_id, type, content, confidence, metadata, created_at)
           VALUES ($1, $2, $3, 'fact', $4, 0.9, $5, NOW())`,
                    [id, testWorkspaceId, testConversationId, `Memory ${i}`, JSON.stringify(metadata)]
                )
            }

            const startTime = Date.now()
            const result = await service.getMemories({
                workspaceId: testWorkspaceId,
                limit: 50
            })
            const duration = Date.now() - startTime

            expect(result.memories.length).toBe(50)
            expect(duration).toBeLessThan(1000) // Should complete within 1 second
        })
    })

    describe('Metadata Integrity', () => {
        it('preserves complex metadata structures', async () => {
            const complexMetadata = {
                pinned: true,
                hidden: false,
                tags: ['important', 'review', 'q1-2024'],
                entityType: 'project',
                nested: {
                    level1: {
                        level2: {
                            data: ['a', 'b', 'c']
                        }
                    }
                },
                timestamps: {
                    created: new Date().toISOString(),
                    modified: new Date().toISOString()
                }
            }

            const id = crypto.randomUUID()
            testMemoryIds.push(id)

            await db.query(
                `INSERT INTO memories (id, workspace_id, conversation_id, type, content, confidence, metadata, created_at)
         VALUES ($1, $2, $3, 'entity', 'Complex Memory', 0.9, $4, NOW())`,
                [id, testWorkspaceId, testConversationId, JSON.stringify(complexMetadata)]
            )

            const retrieved = await service.getMemoryById(id, testWorkspaceId)
            expect(retrieved).not.toBeNull()
            expect(retrieved!.metadata).toEqual(complexMetadata)
        })

        it('handles null and undefined metadata values correctly', async () => {
            const metadata = {
                pinned: true,
                tags: null,
                description: undefined,
                count: 0,
                enabled: false
            }

            const id = crypto.randomUUID()
            testMemoryIds.push(id)

            await db.query(
                `INSERT INTO memories (id, workspace_id, conversation_id, type, content, confidence, metadata, created_at)
         VALUES ($1, $2, $3, 'fact', 'Null Test', 0.9, $4, NOW())`,
                [id, testWorkspaceId, testConversationId, JSON.stringify(metadata)]
            )

            const retrieved = await service.getMemoryById(id, testWorkspaceId)
            expect(retrieved).not.toBeNull()
            expect(retrieved!.metadata.pinned).toBe(true)
            expect(retrieved!.metadata.tags).toBeNull()
            expect(retrieved!.metadata.count).toBe(0)
            expect(retrieved!.metadata.enabled).toBe(false)
        })
    })
})
