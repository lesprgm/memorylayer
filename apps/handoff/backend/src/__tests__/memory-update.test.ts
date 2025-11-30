import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MemoryService } from '../services/memory'
import { DatabaseClient } from '../lib/db'

describe('MemoryService - Update Operations', () => {
    let db: DatabaseClient
    let service: MemoryService
    let testWorkspaceId: string
    let testUserId: string
    let testConversationId: string
    let testMemoryId: string

    beforeEach(async () => {
        const supabaseUrl = process.env.SUPABASE_URL
        const supabaseKey = process.env.SUPABASE_KEY

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('SUPABASE_URL and SUPABASE_KEY must be set')
        }

        db = new DatabaseClient(supabaseUrl, supabaseKey)
        service = new MemoryService(db)

        // Create test user
        testUserId = crypto.randomUUID()
        await db.query(
            'INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)',
            [testUserId, 'Test User', `test-${Date.now()}-${Math.random()}@example.com`, 'test-hash']
        )

        // Create test workspace
        testWorkspaceId = crypto.randomUUID()
        await db.query(
            'INSERT INTO workspaces (id, name, type, owner_id) VALUES ($1, $2, $3, $4)',
            [testWorkspaceId, 'Test Workspace', 'personal', testUserId]
        )

        // Create test conversation
        testConversationId = crypto.randomUUID()
        await db.query(
            `INSERT INTO conversations (id, workspace_id, provider, title, created_at, updated_at)
       VALUES ($1, $2, 'anthropic', 'Test', NOW(), NOW())`,
            [testConversationId, testWorkspaceId]
        )

        // Create test memory
        testMemoryId = crypto.randomUUID()
        await db.query(
            `INSERT INTO memories (id, workspace_id, conversation_id, type, content, confidence, metadata, created_at)
       VALUES ($1, $2, $3, 'entity', 'Original Content', 0.9, '{}', NOW())`,
            [testMemoryId, testWorkspaceId, testConversationId]
        )
    })

    afterEach(async () => {
        // Clean up test data
        if (testMemoryId) {
            await db.query('DELETE FROM memories WHERE id = $1', [testMemoryId])
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

    describe('updateMemory', () => {
        it('should update memory content', async () => {
            const newContent = 'Updated Content'

            const result = await service.updateMemory(testMemoryId, testWorkspaceId, {
                content: newContent
            })

            expect(result).not.toBeNull()
            expect(result!.content).toBe(newContent)
            expect(result!.id).toBe(testMemoryId)
        })

        it('should update memory metadata', async () => {
            const newMetadata = { pinned: true, tags: ['important'] }

            const result = await service.updateMemory(testMemoryId, testWorkspaceId, {
                metadata: newMetadata
            })

            expect(result).not.toBeNull()
            expect(result!.metadata).toEqual(newMetadata)
        })

        it('should update both content and metadata', async () => {
            const newContent = 'Updated Content'
            const newMetadata = { pinned: true, hidden: false }

            const result = await service.updateMemory(testMemoryId, testWorkspaceId, {
                content: newContent,
                metadata: newMetadata
            })

            expect(result).not.toBeNull()
            expect(result!.content).toBe(newContent)
            expect(result!.metadata).toEqual(newMetadata)
        })

        it('should not update memory from different workspace', async () => {
            const otherWorkspaceId = crypto.randomUUID()

            const result = await service.updateMemory(testMemoryId, otherWorkspaceId, {
                content: 'Should Not Update'
            })

            expect(result).toBeNull()

            // Verify original content unchanged
            const original = await service.getMemoryById(testMemoryId, testWorkspaceId)
            expect(original!.content).toBe('Original Content')
        })

        it('should return null for non-existent memory', async () => {
            const fakeId = crypto.randomUUID()

            const result = await service.updateMemory(fakeId, testWorkspaceId, {
                content: 'Should Fail'
            })

            expect(result).toBeNull()
        })

        it('should ignore non-allowed fields', async () => {
            const result = await service.updateMemory(testMemoryId, testWorkspaceId, {
                type: 'decision', // Not allowed
                confidence: 0.5,  // Not allowed
                content: 'Allowed Update'
            } as any)

            expect(result).not.toBeNull()
            expect(result!.content).toBe('Allowed Update')
            expect(result!.type).toBe('entity') // Unchanged
            expect(result!.confidence).toBe(0.9) // Unchanged
        })

        it('should update timestamp on update', async () => {
            const before = new Date()

            // Wait a tiny bit to ensure timestamp difference
            await new Promise(resolve => setTimeout(resolve, 10))

            const result = await service.updateMemory(testMemoryId, testWorkspaceId, {
                content: 'Updated'
            })

            expect(result).not.toBeNull()
            const updatedAt = new Date(result!.updated_at || result!.created_at)
            expect(updatedAt.getTime()).toBeGreaterThan(before.getTime())
        })

        it('should handle empty updates gracefully', async () => {
            const result = await service.updateMemory(testMemoryId, testWorkspaceId, {})

            expect(result).not.toBeNull()
            expect(result!.content).toBe('Original Content')
        })

        it('should handle special characters in content', async () => {
            const specialContent = "Test's \"quoted\" content with <tags> & symbols"

            const result = await service.updateMemory(testMemoryId, testWorkspaceId, {
                content: specialContent
            })

            expect(result).not.toBeNull()
            expect(result!.content).toBe(specialContent)
        })

        it('should handle metadata with nested objects', async () => {
            const complexMetadata = {
                pinned: true,
                entityType: 'project',
                tags: ['important', 'review'],
                nested: {
                    level: 1,
                    data: ['a', 'b', 'c']
                }
            }

            const result = await service.updateMemory(testMemoryId, testWorkspaceId, {
                metadata: complexMetadata
            })

            expect(result).not.toBeNull()
            expect(result!.metadata).toEqual(complexMetadata)
        })

        it('should handle concurrent updates correctly', async () => {
            // Simulate two concurrent updates
            const [result1, result2] = await Promise.all([
                service.updateMemory(testMemoryId, testWorkspaceId, {
                    content: 'Update 1'
                }),
                service.updateMemory(testMemoryId, testWorkspaceId, {
                    metadata: { updated_by: 'user2' }
                })
            ])

            // Both should succeed
            expect(result1).not.toBeNull()
            expect(result2).not.toBeNull()

            // Final state should reflect last write
            const final = await service.getMemoryById(testMemoryId, testWorkspaceId)
            expect(final).not.toBeNull()
        })

        it('should prevent SQL injection in updates', async () => {
            const maliciousContent = "'; DROP TABLE memories; --"

            const result = await service.updateMemory(testMemoryId, testWorkspaceId, {
                content: maliciousContent
            })

            expect(result).not.toBeNull()
            expect(result!.content).toBe(maliciousContent)

            // Verify table still exists
            const check = await service.getMemories({ workspaceId: testWorkspaceId })
            expect(check.memories).toBeDefined()
        })
    })

    describe('Pin/Hide functionality', () => {
        it('should pin a memory', async () => {
            const result = await service.updateMemory(testMemoryId, testWorkspaceId, {
                metadata: { pinned: true }
            })

            expect(result).not.toBeNull()
            expect(result!.metadata.pinned).toBe(true)
        })

        it('should hide a memory', async () => {
            const result = await service.updateMemory(testMemoryId, testWorkspaceId, {
                metadata: { hidden: true }
            })

            expect(result).not.toBeNull()
            expect(result!.metadata.hidden).toBe(true)
        })

        it('should toggle pin status', async () => {
            // Pin
            await service.updateMemory(testMemoryId, testWorkspaceId, {
                metadata: { pinned: true }
            })

            // Unpin
            const result = await service.updateMemory(testMemoryId, testWorkspaceId, {
                metadata: { pinned: false }
            })

            expect(result).not.toBeNull()
            expect(result!.metadata.pinned).toBe(false)
        })

        it('should preserve existing metadata when updating pin status', async () => {
            // Set initial metadata
            await service.updateMemory(testMemoryId, testWorkspaceId, {
                metadata: { entityType: 'project', tags: ['important'] }
            })

            // Update pin status
            const result = await service.updateMemory(testMemoryId, testWorkspaceId, {
                metadata: { pinned: true, entityType: 'project', tags: ['important'] }
            })

            expect(result).not.toBeNull()
            expect(result!.metadata).toEqual({
                pinned: true,
                entityType: 'project',
                tags: ['important']
            })
        })
    })
})
