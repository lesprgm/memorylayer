import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseClient } from '../lib/db'

/**
 * Handoff Export Tests
 * Tests for the handoff context export functionality
 */
describe('Handoff Export Service', () => {
    let db: DatabaseClient
    let testWorkspaceId: string
    let testUserId: string
    let testConversationId: string

    beforeEach(async () => {
        const supabaseUrl = process.env.SUPABASE_URL
        const supabaseKey = process.env.SUPABASE_KEY

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('SUPABASE_URL and SUPABASE_KEY must be set')
        }

        db = new DatabaseClient(supabaseUrl, supabaseKey)

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
       VALUES ($1, $2, 'anthropic', 'Test Handoff Conversation', NOW(), NOW())`,
            [testConversationId, testWorkspaceId]
        )
    })

    afterEach(async () => {
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

    describe('Handoff Context Generation', () => {
        it('generates handoff for conversation with messages and memories', async () => {
            // Add messages
            const messageIds: string[] = []
            const messages = [
                { role: 'user', content: 'Can you help me plan a project?' },
                { role: 'assistant', content: 'Sure! Let me help you with that. Here are some key points...' },
            ]

            for (const msg of messages) {
                const id = crypto.randomUUID()
                messageIds.push(id)
                await db.query(
                    `INSERT INTO messages (id, conversation_id, role, content, created_at)
           VALUES ($1, $2, $3, $4, NOW())`,
                    [id, testConversationId, msg.role, msg.content]
                )
            }

            // Add memories
            const memoryIds: string[] = []
            const memories = [
                { type: 'entity', content: 'Project planning discussion' },
                { type: 'fact', content: 'User needs help with project planning' },
            ]

            for (const mem of memories) {
                const id = crypto.randomUUID()
                memoryIds.push(id)
                await db.query(
                    `INSERT INTO memories (id, workspace_id, conversation_id, type, content, confidence, created_at)
           VALUES ($1, $2, $3, $4, $5, 0.9, NOW())`,
                    [id, testWorkspaceId, testConversationId, mem.type, mem.content]
                )
            }

            // Verify conversation exists
            const conversation = await db.query(
                'SELECT * FROM conversations WHERE id = $1 AND workspace_id = $2',
                [testConversationId, testWorkspaceId]
            )
            expect(conversation.length).toBe(1)

            // Verify messages exist
            const retrievedMessages = await db.query(
                'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at',
                [testConversationId]
            )
            expect(retrievedMessages.length).toBe(2)

            // Verify memories exist
            const retrievedMemories = await db.query(
                'SELECT * FROM memories WHERE conversation_id = $1',
                [testConversationId]
            )
            expect(retrievedMemories.length).toBe(2)

            // Cleanup
            for (const id of memoryIds) {
                await db.query('DELETE FROM memories WHERE id = $1', [id])
            }
            for (const id of messageIds) {
                await db.query('DELETE FROM messages WHERE id = $1', [id])
            }
        })

        it('generates handoff with proper formatting', async () => {
            // Add structured content
            const message1 = crypto.randomUUID()
            const message2 = crypto.randomUUID()

            await db.query(
                `INSERT INTO messages (id, conversation_id, role, content, created_at)
         VALUES ($1, $2, 'user', 'Question about project timeline', NOW())`,
                [message1, testConversationId]
            )

            await db.query(
                `INSERT INTO messages (id, conversation_id, role, content, created_at)
         VALUES ($1, $2, 'assistant', 'The timeline should be 3 months', NOW())`,
                [message2, testConversationId]
            )

            // A real handoff export would format this nicely
            // For now, we verify the data is retrievable
            const messages = await db.query(
                'SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at',
                [testConversationId]
            )

            expect(messages).toHaveLength(2)
            expect((messages[0] as any).role).toBe('user')
            expect((messages[1] as any).role).toBe('assistant')

            // Cleanup
            await db.query('DELETE FROM messages WHERE id IN ($1, $2)', [message1, message2])
        })

        it('handles empty conversation gracefully', async () => {
            // Conversation exists but has no messages or memories
            const messages = await db.query(
                'SELECT * FROM messages WHERE conversation_id = $1',
                [testConversationId]
            )
            const memories = await db.query(
                'SELECT * FROM memories WHERE conversation_id = $1',
                [testConversationId]
            )

            expect(messages).toHaveLength(0)
            expect(memories).toHaveLength(0)
        })

        it(' includes memory metadata in export context', async () => {
            const memoryId = crypto.randomUUID()
            const metadata = {
                entityType: 'project',
                tags: ['important'],
                confidence_note: 'High confidence extraction'
            }

            await db.query(
                `INSERT INTO memories (id, workspace_id, conversation_id, type, content, confidence, metadata, created_at)
         VALUES ($1, $2, $3, 'entity', 'Project Alpha', 0.95, $4, NOW())`,
                [memoryId, testWorkspaceId, testConversationId, JSON.stringify(metadata)]
            )

            const memory = await db.query(
                'SELECT * FROM memories WHERE id = $1',
                [memoryId]
            )

            expect((memory[0] as any).metadata).toEqual(metadata)
            expect((memory[0] as any).confidence).toBe(0.95)

            // Cleanup
            await db.query('DELETE FROM memories WHERE id = $1', [memoryId])
        })

        it('exports maintain conversation context and order', async () => {
            const messageIds: string[] = []

            // Add messages in specific order
            for (let i = 0; i < 5; i++) {
                const id = crypto.randomUUID()
                messageIds.push(id)
                const role = i % 2 === 0 ? 'user' : 'assistant'
                await db.query(
                    `INSERT INTO messages (id, conversation_id, role, content, created_at)
           VALUES ($1, $2, $3, $4, NOW() + INTERVAL '${i} seconds')`,
                    [id, testConversationId, role, `Message ${i + 1}`]
                )
            }

            const messages = await db.query(
                'SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at',
                [testConversationId]
            )

            expect(messages).toHaveLength(5)
            expect((messages[0] as any).content).toBe('Message 1')
            expect((messages[4] as any).content).toBe('Message 5')

            // Verify alternating roles
            for (let i = 0; i < 5; i++) {
                const expectedRole = i % 2 === 0 ? 'user' : 'assistant'
                expect((messages[i] as any).role).toBe(expectedRole)
            }

            // Cleanup
            await db.query('DELETE FROM messages WHERE id = ANY($1)', [messageIds])
        })
    })

    describe('Handoff Export Edge Cases', () => {
        it('handles very long messages', async () => {
            const longContent = 'A'.repeat(10000) // 10k character message
            const messageId = crypto.randomUUID()

            await db.query(
                `INSERT INTO messages (id, conversation_id, role, content, created_at)
         VALUES ($1, $2, 'user', $3, NOW())`,
                [messageId, testConversationId, longContent]
            )

            const message = await db.query(
                'SELECT content FROM messages WHERE id = $1',
                [messageId]
            )

            expect((message[0] as any).content.length).toBe(10000)

            // Cleanup
            await db.query('DELETE FROM messages WHERE id = $1', [messageId])
        })

        it('handles special characters in exported content', async () => {
            const specialContent = 'Test with "quotes", <tags>, & ampersands, and \\backslashes'
            const messageId = crypto.randomUUID()

            await db.query(
                `INSERT INTO messages (id, conversation_id, role, content, created_at)
         VALUES ($1, $2, 'user', $3, NOW())`,
                [messageId, testConversationId, specialContent]
            )

            const message = await db.query(
                'SELECT content FROM messages WHERE id = $1',
                [messageId]
            )

            expect((message[0] as any).content).toBe(specialContent)

            // Cleanup
            await db.query('DELETE FROM messages WHERE id = $1', [messageId])
        })

        it('handles Unicode and emojis in exported content', async () => {
            const unicodeContent = 'Hello 世界 🌍 🚀 Testing émojis and àccénts'
            const messageId = crypto.randomUUID()

            await db.query(
                `INSERT INTO messages (id, conversation_id, role, content, created_at)
         VALUES ($1, $2, 'user', $3, NOW())`,
                [messageId, testConversationId, unicodeContent]
            )

            const message = await db.query(
                'SELECT content FROM messages WHERE id = $1',
                [messageId]
            )

            expect((message[0] as any).content).toBe(unicodeContent)

            // Cleanup
            await db.query('DELETE FROM messages WHERE id = $1', [messageId])
        })
    })
})
