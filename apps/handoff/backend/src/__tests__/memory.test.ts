import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MemoryService } from '../services/memory'
import { DatabaseClient } from '../lib/db'

describe('MemoryService', () => {
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

    // Create test conversation
    testConversationId = crypto.randomUUID()
    await db.query(
      `INSERT INTO conversations (id, workspace_id, provider, title, created_at, updated_at)
       VALUES ($1, $2, 'anthropic', 'Test', NOW(), NOW())`,
      [testConversationId, testWorkspaceId]
    )

    testMemoryIds = []
  })

  afterEach(async () => {
    // Clean up test data
    if (testMemoryIds.length > 0) {
      await db.query(
        'DELETE FROM memories WHERE id = ANY($1)',
        [testMemoryIds]
      )
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

  describe('getMemories', () => {
    it('should return empty list for workspace with no memories', async () => {
      const result = await service.getMemories({ workspaceId: testWorkspaceId })

      expect(result.memories).toEqual([])
      expect(result.total).toBe(0)
    })

    it('should return memories for workspace', async () => {
      const memoryId = crypto.randomUUID()
      testMemoryIds.push(memoryId)
      console.log('Test Workspace ID:', testWorkspaceId)
      console.log('Test Memory ID:', memoryId)

      const check = await db.query('-- SELECT\nSELECT 1 as val')
      console.log('Check Select:', JSON.stringify(check))

      await db.query(
        `INSERT INTO memories (id, workspace_id, conversation_id, type, content, confidence, created_at)
         VALUES ($1, $2, $3, 'entity', 'Test Entity', 0.9, NOW())`,
        [memoryId, testWorkspaceId, testConversationId]
      )

      const result = await service.getMemories({ workspaceId: testWorkspaceId })
      console.log('GetMemories Result:', JSON.stringify(result, null, 2))

      expect(result.memories).toHaveLength(1)
      expect(result.total).toBe(1)
      expect(result.memories[0].content).toBe('Test Entity')
    })

    it('should filter by memory types', async () => {
      const entityId = crypto.randomUUID()
      const factId = crypto.randomUUID()
      testMemoryIds.push(entityId, factId)

      await db.query(
        `INSERT INTO memories (id, workspace_id, conversation_id, type, content, confidence, created_at)
         VALUES ($1, $2, $3, 'entity', 'Entity', 0.9, NOW())`,
        [entityId, testWorkspaceId, testConversationId]
      )
      await db.query(
        `INSERT INTO memories (id, workspace_id, conversation_id, type, content, confidence, created_at)
         VALUES ($1, $2, $3, 'fact', 'Fact', 0.8, NOW())`,
        [factId, testWorkspaceId, testConversationId]
      )

      const result = await service.getMemories({
        workspaceId: testWorkspaceId,
        types: ['entity']
      })

      expect(result.memories).toHaveLength(1)
      expect(result.memories[0].type).toBe('entity')
    })

    it('should filter by date range', async () => {
      const memoryId = crypto.randomUUID()
      testMemoryIds.push(memoryId)

      const testDate = '2025-01-01T00:00:00Z'
      await db.query(
        `INSERT INTO memories (id, workspace_id, conversation_id, type, content, confidence, created_at)
         VALUES ($1, $2, $3, 'entity', 'Old Memory', 0.9, $4)`,
        [memoryId, testWorkspaceId, testConversationId, testDate]
      )

      // Filter for memories after the test date
      const result = await service.getMemories({
        workspaceId: testWorkspaceId,
        startDate: '2025-01-02T00:00:00Z'
      })

      expect(result.memories).toHaveLength(0)

      // Filter for memories before now
      const result2 = await service.getMemories({
        workspaceId: testWorkspaceId,
        endDate: new Date().toISOString()
      })

      expect(result2.memories).toHaveLength(1)
    })

    it('should search by content', async () => {
      const memoryId = crypto.randomUUID()
      testMemoryIds.push(memoryId)

      await db.query(
        `INSERT INTO memories (id, workspace_id, conversation_id, type, content, confidence, created_at)
         VALUES ($1, $2, $3, 'entity', 'Unique Search Term', 0.9, NOW())`,
        [memoryId, testWorkspaceId, testConversationId]
      )

      const result = await service.getMemories({
        workspaceId: testWorkspaceId,
        search: 'Unique'
      })

      expect(result.memories).toHaveLength(1)
      expect(result.memories[0].content).toContain('Unique')
    })

    it('should paginate results', async () => {
      // Create 5 memories
      for (let i = 0; i < 5; i++) {
        const memoryId = crypto.randomUUID()
        testMemoryIds.push(memoryId)
        await db.query(
          `INSERT INTO memories (id, workspace_id, conversation_id, type, content, confidence, created_at)
           VALUES ($1, $2, $3, 'entity', $4, 0.9, NOW())`,
          [memoryId, testWorkspaceId, testConversationId, `Memory ${i}`]
        )
      }

      const page1 = await service.getMemories({
        workspaceId: testWorkspaceId,
        limit: 2,
        offset: 0
      })

      const page2 = await service.getMemories({
        workspaceId: testWorkspaceId,
        limit: 2,
        offset: 2
      })

      expect(page1.memories).toHaveLength(2)
      expect(page2.memories).toHaveLength(2)
      expect(page1.total).toBe(5)
      expect(page2.total).toBe(5)
    })

    it('should handle multiple type filters', async () => {
      const entityId = crypto.randomUUID()
      const factId = crypto.randomUUID()
      const decisionId = crypto.randomUUID()
      testMemoryIds.push(entityId, factId, decisionId)

      await db.query(
        `INSERT INTO memories (id, workspace_id, conversation_id, type, content, confidence, created_at)
         VALUES ($1, $2, $3, 'entity', 'Entity', 0.9, NOW())`,
        [entityId, testWorkspaceId, testConversationId]
      )
      await db.query(
        `INSERT INTO memories (id, workspace_id, conversation_id, type, content, confidence, created_at)
         VALUES ($1, $2, $3, 'fact', 'Fact', 0.8, NOW())`,
        [factId, testWorkspaceId, testConversationId]
      )
      await db.query(
        `INSERT INTO memories (id, workspace_id, conversation_id, type, content, confidence, created_at)
         VALUES ($1, $2, $3, 'decision', 'Decision', 0.7, NOW())`,
        [decisionId, testWorkspaceId, testConversationId]
      )

      const result = await service.getMemories({
        workspaceId: testWorkspaceId,
        types: ['entity', 'fact']
      })

      expect(result.memories).toHaveLength(2)
      expect(result.memories.every(m => ['entity', 'fact'].includes(m.type))).toBe(true)
    })

    it('should handle SQL injection in search', async () => {
      const result = await service.getMemories({
        workspaceId: testWorkspaceId,
        search: "'; DROP TABLE memories; --"
      })

      expect(result.memories).toEqual([])
      expect(result.total).toBe(0)
    })
  })

  describe('getMemoryById', () => {
    it('should return null for non-existent memory', async () => {
      const result = await service.getMemoryById(
        crypto.randomUUID(),
        testWorkspaceId
      )

      expect(result).toBeNull()
    })

    it('should return memory by id', async () => {
      const memoryId = crypto.randomUUID()
      testMemoryIds.push(memoryId)

      await db.query(
        `INSERT INTO memories (id, workspace_id, conversation_id, type, content, confidence, created_at)
         VALUES ($1, $2, $3, 'entity', 'Test Memory', 0.9, NOW())`,
        [memoryId, testWorkspaceId, testConversationId]
      )

      const result = await service.getMemoryById(memoryId, testWorkspaceId)

      expect(result).not.toBeNull()
      expect(result!.id).toBe(memoryId)
      expect(result!.content).toBe('Test Memory')
    })

    it('should not return memory from different workspace', async () => {
      const memoryId = crypto.randomUUID()
      const otherWorkspaceId = crypto.randomUUID()
      testMemoryIds.push(memoryId)

      const otherUserId = crypto.randomUUID()
      await db.query(
        'INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)',
        [otherUserId, 'Other User', `other-${Date.now()}-${Math.random()}@example.com`, 'test-hash']
      )

      await db.query(
        'INSERT INTO workspaces (id, name, type, owner_id) VALUES ($1, $2, $3, $4)',
        [otherWorkspaceId, 'Other Workspace', 'personal', otherUserId]
      )

      const otherConvId = crypto.randomUUID()
      await db.query(
        `INSERT INTO conversations (id, workspace_id, provider, title, created_at, updated_at)
         VALUES ($1, $2, 'anthropic', 'Test', NOW(), NOW())`,
        [otherConvId, otherWorkspaceId]
      )

      await db.query(
        `INSERT INTO memories (id, workspace_id, conversation_id, type, content, confidence, created_at)
         VALUES ($1, $2, $3, 'entity', 'Test', 0.9, NOW())`,
        [memoryId, otherWorkspaceId, otherConvId]
      )

      const result = await service.getMemoryById(memoryId, testWorkspaceId)

      expect(result).toBeNull()

      // Cleanup
      await db.query('DELETE FROM conversations WHERE id = $1', [otherConvId])
      await db.query('DELETE FROM workspaces WHERE id = $1', [otherWorkspaceId])
      await db.query('DELETE FROM users WHERE id = $1', [otherUserId])
    })
  })
})
