import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MemoryService } from '../services/memory'
import { DatabaseClient } from '../lib/db'

/**
 * Integration tests for Memory CRUD flow
 * Tests the complete lifecycle: Create → Read → Update (Pin/Edit) → Hide
 */
describe('Memory CRUD Integration', () => {
    let db: DatabaseClient
    let service: MemoryService
    let testWorkspaceId: string
    let testUserId: string
    let testConversationId: string
    let createdMemoryId: string

    beforeEach(async () => {
        const supabaseUrl = process.env.SUPABASE_URL
        const supabaseKey = process.env.SUPABASE_KEY

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('SUPABASE_URL and SUPABASE_KEY must be set')
        }

        db = new DatabaseClient(supabaseUrl, supabaseKey)
        service = new MemoryService(db)

        // Setup test environment
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
       VALUES ($1, $2, 'anthropic', 'Test Conversation', NOW(), NOW())`,
            [testConversationId, testWorkspaceId]
        )
    })

    afterEach(async () => {
        // Cleanup
        if (createdMemoryId) {
            await db.query('DELETE FROM memories WHERE id = $1', [createdMemoryId])
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

    it('completes full CRUD lifecycle: Create → Read → Pin → Edit → Hide', async () => {
        // 1. CREATE: Add a new memory
        createdMemoryId = crypto.randomUUID()
        await db.query(
            `INSERT INTO memories (id, workspace_id, conversation_id, type, content, confidence, metadata, created_at)
       VALUES ($1, $2, $3, 'fact', 'Initial memory content', 0.9, '{}', NOW())`,
            [createdMemoryId, testWorkspaceId, testConversationId]
        )

        // 2. READ: Verify memory was created
        const readResult = await service.getMemoryById(createdMemoryId, testWorkspaceId)
        expect(readResult).not.toBeNull()
        expect(readResult!.content).toBe('Initial memory content')
        expect(readResult!.metadata).toEqual({})

        // 3. UPDATE (Pin): Pin the memory
        const pinnedResult = await service.updateMemory(createdMemoryId, testWorkspaceId, {
            metadata: { pinned: true }
        })
        expect(pinnedResult).not.toBeNull()
        expect(pinnedResult!.metadata.pinned).toBe(true)

        // 4. READ: Verify pin was applied
        const readPinned = await service.getMemoryById(createdMemoryId, testWorkspaceId)
        expect(readPinned!.metadata.pinned).toBe(true)

        // 5. UPDATE (Edit): Change the content
        const editedResult = await service.updateMemory(createdMemoryId, testWorkspaceId, {
            content: 'Updated memory content',
            metadata: { pinned: true } // Preserve pin
        })
        expect(editedResult).not.toBeNull()
        expect(editedResult!.content).toBe('Updated memory content')
        expect(editedResult!.metadata.pinned).toBe(true)

        // 6. READ: Verify edit was applied
        const readEdited = await service.getMemoryById(createdMemoryId, testWorkspaceId)
        expect(readEdited!.content).toBe('Updated memory content')

        // 7. UPDATE (Hide): Hide the memory
        const hiddenResult = await service.updateMemory(createdMemoryId, testWorkspaceId, {
            metadata: { pinned: true, hidden: true }
        })
        expect(hiddenResult).not.toBeNull()
        expect(hiddenResult!.metadata.hidden).toBe(true)

        // 8. READ: Verify hide was applied
        const readHidden = await service.getMemoryById(createdMemoryId, testWorkspaceId)
        expect(readHidden!.metadata.hidden).toBe(true)
        expect(readHidden!.content).toBe('Updated memory content') // Content preserved
    })

    it('handles concurrent updates from multiple users', async () => {
        // Create memory
        createdMemoryId = crypto.randomUUID()
        await db.query(
            `INSERT INTO memories (id, workspace_id, conversation_id, type, content, confidence, metadata, created_at)
       VALUES ($1, $2, $3, 'fact', 'Shared memory', 0.9, '{}', NOW())`,
            [createdMemoryId, testWorkspaceId, testConversationId]
        )

        // Simulate two users updating at the same time
        const [user1Update, user2Update] = await Promise.all([
            service.updateMemory(createdMemoryId, testWorkspaceId, {
                metadata: { pinned: true, updated_by: 'user1' }
            }),
            service.updateMemory(createdMemoryId, testWorkspaceId, {
                content: 'User 2 edit'
            })
        ])

        // Both updates should succeed
        expect(user1Update).not.toBeNull()
        expect(user2Update).not.toBeNull()

        // Final state should reflect last write
        const final = await service.getMemoryById(createdMemoryId, testWorkspaceId)
        expect(final).not.toBeNull()
        // Either update could be the final state, just verify it exists
    })

    it('maintains workspace isolation during CRUD operations', async () => {
        // Create memory in test workspace
        createdMemoryId = crypto.randomUUID()
        await db.query(
            `INSERT INTO memories (id, workspace_id, conversation_id, type, content, confidence, metadata, created_at)
       VALUES ($1, $2, $3, 'fact', 'Workspace 1 memory', 0.9, '{}', NOW())`,
            [createdMemoryId, testWorkspaceId, testConversationId]
        )

        // Try to access from different workspace
        const otherWorkspaceId = crypto.randomUUID()

        // READ: Should not be accessible
        const readResult = await service.getMemoryById(createdMemoryId, otherWorkspaceId)
        expect(readResult).toBeNull()

        // UPDATE: Should not be updatable
        const updateResult = await service.updateMemory(createdMemoryId, otherWorkspaceId, {
            content: 'Should not update'
        })
        expect(updateResult).toBeNull()

        // Verify original workspace can still access
        const originalAccess = await service.getMemoryById(createdMemoryId, testWorkspaceId)
        expect(originalAccess).not.toBeNull()
        expect(originalAccess!.content).toBe('Workspace 1 memory')
    })

    it('preserves metadata through multiple updates', async () => {
        createdMemoryId = crypto.randomUUID()
        await db.query(
            `INSERT INTO memories (id, workspace_id, conversation_id, type, content, confidence, metadata, created_at)
       VALUES ($1, $2, $3, 'entity', 'Project X', 0.9, $4, NOW())`,
            [createdMemoryId, testWorkspaceId, testConversationId, JSON.stringify({
                entityType: 'project',
                tags: ['important', 'q1'],
                status: 'active'
            })]
        )

        // Update 1: Pin it
        await service.updateMemory(createdMemoryId, testWorkspaceId, {
            metadata: {
                entityType: 'project',
                tags: ['important', 'q1'],
                status: 'active',
                pinned: true
            }
        })

        // Update 2: Edit content (preserve all metadata)
        await service.updateMemory(createdMemoryId, testWorkspaceId, {
            content: 'Project X - Updated',
            metadata: {
                entityType: 'project',
                tags: ['important', 'q1'],
                status: 'active',
                pinned: true
            }
        })

        // Update 3: Change status (preserve everything else)
        await service.updateMemory(createdMemoryId, testWorkspaceId, {
            metadata: {
                entityType: 'project',
                tags: ['important', 'q1'],
                status: 'completed',
                pinned: true
            }
        })

        // Verify all metadata is preserved
        const final = await service.getMemoryById(createdMemoryId, testWorkspaceId)
        expect(final!.content).toBe('Project X - Updated')
        expect(final!.metadata).toEqual({
            entityType: 'project',
            tags: ['important', 'q1'],
            status: 'completed',
            pinned: true
        })
    })

    it('handles rapid sequential updates correctly', async () => {
        createdMemoryId = crypto.randomUUID()
        await db.query(
            `INSERT INTO memories (id, workspace_id, conversation_id, type, content, confidence, metadata, created_at)
       VALUES ($1, $2, $3, 'fact', 'Initial', 0.9, '{}', NOW())`,
            [createdMemoryId, testWorkspaceId, testConversationId]
        )

        // Perform 5 rapid updates
        for (let i = 1; i <= 5; i++) {
            await service.updateMemory(createdMemoryId, testWorkspaceId, {
                content: `Update ${i}`,
                metadata: { updateCount: i }
            })
        }

        // Final state should reflect last update
        const final = await service.getMemoryById(createdMemoryId, testWorkspaceId)
        expect(final!.content).toBe('Update 5')
        expect(final!.metadata.updateCount).toBe(5)
    })
})
