import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ExportService } from '../services/export'
import { DatabaseClient } from '../lib/db'

describe('ExportService', () => {
  let db: DatabaseClient
  let service: ExportService
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
    service = new ExportService(db)

    // Create test user first
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
       VALUES ($1, $2, 'anthropic', 'Test Conversation', NOW(), NOW())`,
      [testConversationId, testWorkspaceId]
    )

    // Add message
    await db.query(
      `INSERT INTO messages (conversation_id, role, content, created_at)
       VALUES ($1, 'user', 'Test message', NOW())`,
      [testConversationId]
    )

    // Create test memory
    testMemoryId = crypto.randomUUID()
    await db.query(
      `INSERT INTO memories (id, workspace_id, conversation_id, type, content, confidence, created_at)
       VALUES ($1, $2, $3, 'entity', 'Test Memory', 0.9, NOW())`,
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

  describe('exportWorkspaceData', () => {
    it('should export all workspace data', async () => {
      const data = await service.exportWorkspaceData(testWorkspaceId)

      expect(data.conversations).toHaveLength(1)
      expect(data.memories).toHaveLength(1)
      expect(data.metadata.workspaceId).toBe(testWorkspaceId)
      expect(data.metadata.version).toBe('1.0.0')
    })

    it('should include messages in conversations', async () => {
      const data = await service.exportWorkspaceData(testWorkspaceId)

      expect(data.conversations[0].messages).toHaveLength(1)
      expect(data.conversations[0].messages[0].content).toBe('Test message')
    })

    it('should handle empty workspace', async () => {
      const emptyWorkspaceId = crypto.randomUUID()
      await db.query(
        'INSERT INTO workspaces (id, name, type, owner_id) VALUES ($1, $2, $3, $4)',
        [emptyWorkspaceId, 'Empty', 'personal', testUserId]
      )

      const data = await service.exportWorkspaceData(emptyWorkspaceId)

      expect(data.conversations).toEqual([])
      expect(data.memories).toEqual([])
      expect(data.relationships).toEqual([])

      // Cleanup
      await db.query('DELETE FROM workspaces WHERE id = $1', [emptyWorkspaceId])
    })

    it('should include metadata in export', async () => {
      const data = await service.exportWorkspaceData(testWorkspaceId)

      expect(data.metadata).toBeDefined()
      expect(data.metadata.workspaceId).toBe(testWorkspaceId)
      expect(data.metadata.exportedAt).toBeTruthy()
      expect(new Date(data.metadata.exportedAt)).toBeInstanceOf(Date)
    })

    it('should handle conversations without messages', async () => {
      const convId = crypto.randomUUID()
      await db.query(
        `INSERT INTO conversations (id, workspace_id, provider, title, created_at, updated_at)
         VALUES ($1, $2, 'anthropic', 'Empty Conv', NOW(), NOW())`,
        [convId, testWorkspaceId]
      )

      const data = await service.exportWorkspaceData(testWorkspaceId)

      expect(data.conversations).toHaveLength(2)
      const emptyConv = data.conversations.find(c => c.id === convId)
      expect(emptyConv).toBeDefined()

      // Cleanup
      await db.query('DELETE FROM conversations WHERE id = $1', [convId])
    })
  })

  describe('createExportFiles', () => {
    it('should create separate JSON files', async () => {
      const data = await service.exportWorkspaceData(testWorkspaceId)
      const files = service.createExportFiles(data)

      expect(files['conversations.json']).toBeTruthy()
      expect(files['memories.json']).toBeTruthy()
      expect(files['relationships.json']).toBeTruthy()
      expect(files['metadata.json']).toBeTruthy()
    })

    it('should create valid JSON', async () => {
      const data = await service.exportWorkspaceData(testWorkspaceId)
      const files = service.createExportFiles(data)

      expect(() => JSON.parse(files['conversations.json'])).not.toThrow()
      expect(() => JSON.parse(files['memories.json'])).not.toThrow()
      expect(() => JSON.parse(files['relationships.json'])).not.toThrow()
      expect(() => JSON.parse(files['metadata.json'])).not.toThrow()
    })

    it('should format JSON with indentation', async () => {
      const data = await service.exportWorkspaceData(testWorkspaceId)
      const files = service.createExportFiles(data)

      expect(files['conversations.json']).toContain('\n')
      expect(files['conversations.json']).toContain('  ')
    })
  })

  describe('createArchive', () => {
    it('should create archive with all files', async () => {
      const data = await service.exportWorkspaceData(testWorkspaceId)
      const files = service.createExportFiles(data)
      const archive = service.createArchive(files)

      expect(archive).toBeTruthy()
      const parsed = JSON.parse(archive)
      expect(parsed.format).toBe('handoff-export-v1')
      expect(parsed.files).toBeDefined()
      expect(parsed.created_at).toBeTruthy()
    })

    it('should include all file contents in archive', async () => {
      const data = await service.exportWorkspaceData(testWorkspaceId)
      const files = service.createExportFiles(data)
      const archive = service.createArchive(files)

      const parsed = JSON.parse(archive)
      expect(parsed.files['conversations.json']).toBeTruthy()
      expect(parsed.files['memories.json']).toBeTruthy()
      expect(parsed.files['relationships.json']).toBeTruthy()
      expect(parsed.files['metadata.json']).toBeTruthy()
    })
  })

  describe('createExportJSON', () => {
    it('should create combined JSON export', async () => {
      const data = await service.exportWorkspaceData(testWorkspaceId)
      const json = service.createExportJSON(data)

      expect(json).toBeTruthy()
      const parsed = JSON.parse(json)
      expect(parsed.conversations).toBeDefined()
      expect(parsed.memories).toBeDefined()
      expect(parsed.metadata).toBeDefined()
    })

    it('should format JSON with indentation', async () => {
      const data = await service.exportWorkspaceData(testWorkspaceId)
      const json = service.createExportJSON(data)

      expect(json).toContain('\n')
      expect(json).toContain('  ')
    })
  })
})
