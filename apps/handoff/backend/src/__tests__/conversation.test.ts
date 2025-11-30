import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ConversationService } from '../services/conversation'
import { DatabaseClient } from '../lib/db'

describe('ConversationService', () => {
  let db: DatabaseClient
  let service: ConversationService
  let testWorkspaceId: string
  let testUserId: string
  let testConversationIds: string[]

  beforeEach(async () => {
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_KEY

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('SUPABASE_URL and SUPABASE_KEY must be set')
    }

    db = new DatabaseClient(supabaseUrl, supabaseKey)
    service = new ConversationService(db)

    // Create test user first (needed for workspace owner_id)
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



    testConversationIds = []
  })

  afterEach(async () => {
    // Clean up test data
    if (testConversationIds.length > 0) {
      await db.query(
        'DELETE FROM conversations WHERE id = ANY($1)',
        [testConversationIds]
      )
    }
    if (testUserId) {
      await db.query('DELETE FROM users WHERE id = $1', [testUserId])
    }
    if (testWorkspaceId) {
      await db.query('DELETE FROM workspaces WHERE id = $1', [testWorkspaceId])
    }
  })

  describe('getConversations', () => {
    it('should return empty list for workspace with no conversations', async () => {
      const result = await service.getConversations({ workspaceId: testWorkspaceId })

      expect(result.conversations).toEqual([])
      expect(result.total).toBe(0)
    })

    it('should return conversations for workspace', async () => {
      // Create test conversation
      const convId = crypto.randomUUID()
      testConversationIds.push(convId)

      await db.query(
        `INSERT INTO conversations (id, workspace_id, provider, title, user_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
        [convId, testWorkspaceId, 'anthropic', 'Test Conversation', testUserId]
      )

      const result = await service.getConversations({ workspaceId: testWorkspaceId })

      expect(result.conversations).toHaveLength(1)
      expect(result.total).toBe(1)
      expect(result.conversations[0].id).toBe(convId)
      expect(result.conversations[0].title).toBe('Test Conversation')
    })

    it('should filter by provider', async () => {
      // Create conversations with different providers
      const anthropicId = crypto.randomUUID()
      const openaiId = crypto.randomUUID()
      testConversationIds.push(anthropicId, openaiId)

      await db.query(
        `INSERT INTO conversations (id, workspace_id, provider, title, created_at, updated_at)
         VALUES ($1, $2, 'anthropic', 'Anthropic Conv', NOW(), NOW())`,
        [anthropicId, testWorkspaceId]
      )
      await db.query(
        `INSERT INTO conversations (id, workspace_id, provider, title, created_at, updated_at)
         VALUES ($1, $2, 'openai', 'OpenAI Conv', NOW(), NOW())`,
        [openaiId, testWorkspaceId]
      )

      const result = await service.getConversations({
        workspaceId: testWorkspaceId,
        provider: 'anthropic'
      })

      expect(result.conversations).toHaveLength(1)
      expect(result.conversations[0].provider).toBe('anthropic')
    })

    it('should search by title', async () => {
      const convId = crypto.randomUUID()
      testConversationIds.push(convId)

      await db.query(
        `INSERT INTO conversations (id, workspace_id, provider, title, created_at, updated_at)
         VALUES ($1, $2, 'anthropic', 'Unique Search Term', NOW(), NOW())`,
        [convId, testWorkspaceId]
      )

      const result = await service.getConversations({
        workspaceId: testWorkspaceId,
        search: 'Unique'
      })

      expect(result.conversations).toHaveLength(1)
      expect(result.conversations[0].title).toContain('Unique')
    })

    it('should paginate results', async () => {
      // Create 5 conversations
      for (let i = 0; i < 5; i++) {
        const convId = crypto.randomUUID()
        testConversationIds.push(convId)
        await db.query(
          `INSERT INTO conversations (id, workspace_id, provider, title, created_at, updated_at)
           VALUES ($1, $2, 'anthropic', $3, NOW(), NOW())`,
          [convId, testWorkspaceId, `Conv ${i}`]
        )
      }

      const page1 = await service.getConversations({
        workspaceId: testWorkspaceId,
        limit: 2,
        offset: 0
      })

      const page2 = await service.getConversations({
        workspaceId: testWorkspaceId,
        limit: 2,
        offset: 2
      })

      expect(page1.conversations).toHaveLength(2)
      expect(page2.conversations).toHaveLength(2)
      expect(page1.total).toBe(5)
      expect(page2.total).toBe(5)
      expect(page1.conversations[0].id).not.toBe(page2.conversations[0].id)
    })

    it('should handle SQL injection in search', async () => {
      const result = await service.getConversations({
        workspaceId: testWorkspaceId,
        search: "'; DROP TABLE conversations; --"
      })

      expect(result.conversations).toEqual([])
      expect(result.total).toBe(0)
    })

    it('should include message count', async () => {
      const convId = crypto.randomUUID()
      testConversationIds.push(convId)

      await db.query(
        `INSERT INTO conversations (id, workspace_id, provider, title, created_at, updated_at)
         VALUES ($1, $2, 'anthropic', 'Test', NOW(), NOW())`,
        [convId, testWorkspaceId]
      )

      // Add messages
      await db.query(
        `INSERT INTO messages (conversation_id, role, content, created_at)
         VALUES ($1, 'user', 'Hello', NOW()), ($1, 'assistant', 'Hi', NOW())`,
        [convId]
      )

      const result = await service.getConversations({ workspaceId: testWorkspaceId })

      expect(result.conversations[0].message_count).toBe(2)
    })
  })

  describe('getConversationById', () => {
    it('should return null for non-existent conversation', async () => {
      const result = await service.getConversationById(
        crypto.randomUUID(),
        testWorkspaceId
      )

      expect(result).toBeNull()
    })

    it('should return conversation with messages and memories', async () => {
      const convId = crypto.randomUUID()
      testConversationIds.push(convId)

      await db.query(
        `INSERT INTO conversations (id, workspace_id, provider, title, created_at, updated_at)
         VALUES ($1, $2, 'anthropic', 'Test', NOW(), NOW())`,
        [convId, testWorkspaceId]
      )

      // Add message
      await db.query(
        `INSERT INTO messages (conversation_id, role, content, created_at)
         VALUES ($1, 'user', 'Test message', NOW())`,
        [convId]
      )

      // Add memory
      const memoryId = crypto.randomUUID()
      await db.query(
        `INSERT INTO memories (id, workspace_id, conversation_id, type, content, confidence, created_at)
         VALUES ($1, $2, $3, 'entity', 'Test memory', 0.9, NOW())`,
        [memoryId, testWorkspaceId, convId]
      )

      const result = await service.getConversationById(convId, testWorkspaceId)

      expect(result).not.toBeNull()
      expect(result!.conversation.id).toBe(convId)
      expect(result!.messages).toHaveLength(1)
      expect(result!.memories).toHaveLength(1)
    })

    it('should not return conversation from different workspace', async () => {
      const convId = crypto.randomUUID()
      const otherWorkspaceId = crypto.randomUUID()
      testConversationIds.push(convId)

      await db.query(
        'INSERT INTO workspaces (id, name, type, owner_id) VALUES ($1, $2, $3, $4)',
        [otherWorkspaceId, 'Other Workspace', 'personal', testUserId]
      )

      await db.query(
        `INSERT INTO conversations (id, workspace_id, provider, title, created_at, updated_at)
         VALUES ($1, $2, 'anthropic', 'Test', NOW(), NOW())`,
        [convId, otherWorkspaceId]
      )

      const result = await service.getConversationById(convId, testWorkspaceId)

      expect(result).toBeNull()

      // Cleanup
      await db.query('DELETE FROM workspaces WHERE id = $1', [otherWorkspaceId])
    })
  })
})
