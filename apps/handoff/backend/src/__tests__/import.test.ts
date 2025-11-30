import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { NormalizedConversation } from '@memorylayer/chat-capture'
import { ImportService } from '../services/import'
import { DatabaseClient } from '../lib/db'

describe('ImportService', () => {
  class MockDatabaseClient {
    private idCounter = 0
    async query<T>(sql: string, _params: any[] = []): Promise<T[]> {
      // Minimal responses for queries used in import flow/tests
      if (/RETURNING id/i.test(sql)) {
        this.idCounter += 1
        return [{ id: `mock-${this.idCounter}` }] as unknown as T[]
      }
      if (/SELECT type FROM workspaces/i.test(sql)) {
        return [{ type: 'personal' }] as unknown as T[]
      }
      if (/SELECT count/i.test(sql)) {
        return [{ count: '0' }] as unknown as T[]
      }
      return [] as unknown as T[]
    }
  }

  let db: any
  let service: ImportService
  let testWorkspaceId: string
  let testUserId: string

  beforeEach(async () => {
    const openaiApiKey = process.env.OPENAI_API_KEY || 'test-key'

    db = new MockDatabaseClient()
    service = new ImportService(db as unknown as DatabaseClient, openaiApiKey)

    const parseStub = async (file: Buffer) => {
      const raw = file.toString('utf-8')
      if (!raw.trim()) {
        return { ok: false as const, error: { type: 'parse_error', message: 'Empty file' } }
      }

      try {
        const data = JSON.parse(raw)
        const normalized = normalizeConversations(data)
        return { ok: true as const, value: normalized }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { ok: false as const, error: { type: 'parse_error', message } }
      }
    }
    ;(service as any).chatCapture.parseFileAuto = parseStub

    const extractor = (service as any).memoryExtractor
    extractor.extractBatch = async (conversations: any[], workspaceId: string) => ({
      ok: true as const,
      value: {
        totalMemories: 0,
        totalRelationships: 0,
        results: conversations.map(conv => ({
          status: 'success' as const,
          conversation_id: conv.id,
          workspace_id: workspaceId,
          memories: [],
          relationships: []
        }))
      }
    })

    testUserId = 'user-1'
    testWorkspaceId = 'workspace-1'

  })

  afterEach(async () => {
  })

  describe('trimConversation heuristics', () => {
    it('keeps first user, keyword messages, and last assistant', () => {
      const localService = new ImportService({} as DatabaseClient, 'test-key')
      const trimConversation = (localService as any).trimConversation.bind(localService) as (
        messages: any[]
      ) => any[]

      const messages = [
        { id: 'u1', role: 'human', content: 'Initial request: help me plan', created_at: '', raw_metadata: {} },
        { id: 'a1', role: 'assistant', content: 'Here are some thoughts', created_at: '', raw_metadata: {} },
        { id: 'u2', role: 'human', content: 'can you give me a summary and key decisions?', created_at: '', raw_metadata: {} },
        { id: 'a2', role: 'assistant', content: 'Final answer with decision and plan', created_at: '', raw_metadata: {} },
      ]

      const trimmed = trimConversation(messages)
      const ids = trimmed.map((m: any) => m.id)

      expect(ids).toContain('u1') // first user
      expect(ids).toContain('u2') // keyword message
      expect(ids.includes('a2')).toBe(true) // last assistant
      expect(ids).not.toContain('a1')
    })

    it('keeps key sections inside long assistant replies and drops fluff', () => {
      const localService = new ImportService({} as DatabaseClient, 'test-key')
      const trimConversation = (localService as any).trimConversation.bind(localService) as (
        messages: any[]
      ) => any[]

      const longAssistant = [
        'This is a long explanation with lots of fluff and examples that are not decisions.',
        '',
        'The fix (3 changes):',
        '- Trim history to 4k tokens',
        '- Summarize tool results',
        '- Shrink system prompt',
        '',
        'Expected results:',
        '- Input tokens drop by 60%',
        '',
        'More filler text that should be skipped.'
      ].join('\n');

      const messages = [
        { id: 'u1', role: 'human', content: 'Need help optimizing tokens', created_at: '', raw_metadata: {} },
        { id: 'a1', role: 'assistant', content: longAssistant, created_at: '', raw_metadata: {} },
      ]

      const trimmed = trimConversation(messages)
      const assistant = trimmed.find((m: any) => m.role === 'assistant')
      expect(assistant).toBeTruthy()
      const content = assistant!.content
      expect(content).toMatch(/The fix/);
      expect(content).toMatch(/Expected results/);
      expect(content).not.toMatch(/filler text that should be skipped/i);
    })

    it('caps total content to ~4k tokens and truncates last assistant if needed', () => {
      const localService = new ImportService({} as DatabaseClient, 'test-key')
      const trimConversation = (localService as any).trimConversation.bind(localService) as (
        messages: any[]
      ) => any[]

      const longText = 'Decision: '.repeat(10000) // ~10000 words -> exceeds cap
      const messages = [
        { id: 'u1', role: 'human', content: 'Need summary', created_at: '', raw_metadata: {} },
        { id: 'a1', role: 'assistant', content: longText, created_at: '', raw_metadata: {} },
      ]

      const trimmed = trimConversation(messages)
      expect(trimmed.length).toBe(2)
      const totalChars = trimmed.reduce((sum: number, msg: any) => sum + msg.content.length, 0)
      // Approx cap of 4k tokens * 4 chars/token = 16k chars
      expect(totalChars).toBeLessThanOrEqual(16000)
      expect(trimmed[1].content.length).toBeLessThan(longText.length)
    })
  })

  describe('importFile', () => {
    it('should reject invalid file format', async () => {
      const invalidFile = Buffer.from('invalid data')

      const result = await service.importFile(invalidFile, testWorkspaceId, testUserId)

      expect(result.status).toBe('failed')
      expect(result.error).toBeTruthy()
    })

    it('should reject empty file', async () => {
      const emptyFile = Buffer.from('')

      const result = await service.importFile(emptyFile, testWorkspaceId, testUserId)

      expect(result.status).toBe('failed')
      expect(result.error).toBeTruthy()
    })

    it('should handle JSON parse errors', async () => {
      const malformedJson = Buffer.from('{ invalid json }')

      const result = await service.importFile(malformedJson, testWorkspaceId, testUserId)

      expect(result.status).toBe('failed')
      expect(result.error).toBeTruthy()
    })

    it('should import valid Claude export', async () => {
      const validExport = {
        conversations: [{
          uuid: crypto.randomUUID(),
          name: 'Test Conversation',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          chat_messages: [{
            uuid: crypto.randomUUID(),
            text: 'Hello',
            sender: 'human',
            created_at: new Date().toISOString()
          }]
        }]
      }

      const file = Buffer.from(JSON.stringify(validExport))
      const result = await service.importFile(file, testWorkspaceId, testUserId)

      expect(result.status).toBe('completed')
      expect(result.result?.conversations).toBeGreaterThan(0)
    })

    it('should handle conversations without messages', async () => {
      const exportData = {
        conversations: [{
          uuid: crypto.randomUUID(),
          name: 'Empty Conversation',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          chat_messages: []
        }]
      }

      const file = Buffer.from(JSON.stringify(exportData))
      const result = await service.importFile(file, testWorkspaceId, testUserId)

      expect(result.status).toBe('completed')
    })

    it('should handle special characters in content', async () => {
      const exportData = {
        conversations: [{
          uuid: crypto.randomUUID(),
          name: "Test's \"quoted\" conversation",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          chat_messages: [{
            uuid: crypto.randomUUID(),
            text: "Special chars: <>&\"\\'",
            sender: 'human',
            created_at: new Date().toISOString()
          }]
        }]
      }

      const file = Buffer.from(JSON.stringify(exportData))
      const result = await service.importFile(file, testWorkspaceId, testUserId)

      expect(result.status).toBe('completed')
    })

    it('should handle large conversation count', async () => {
      const conversations = Array.from({ length: 10 }, (_, i) => ({
        uuid: crypto.randomUUID(),
        name: `Conversation ${i}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        chat_messages: [{
          uuid: crypto.randomUUID(),
          text: `Message ${i}`,
          sender: 'human',
          created_at: new Date().toISOString()
        }]
      }))

      const exportData = { conversations }
      const file = Buffer.from(JSON.stringify(exportData))
      const result = await service.importFile(file, testWorkspaceId, testUserId)

      expect(result.status).toBe('completed')
      expect(result.result?.conversations).toBe(10)
    })

    it('should handle Unicode characters', async () => {
      const exportData = {
        conversations: [{
          uuid: crypto.randomUUID(),
          name: '测试对话 🚀',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          chat_messages: [{
            uuid: crypto.randomUUID(),
            text: 'Hello 世界 🌍',
            sender: 'human',
            created_at: new Date().toISOString()
          }]
        }]
      }

      const file = Buffer.from(JSON.stringify(exportData))
      const result = await service.importFile(file, testWorkspaceId, testUserId)

      expect(result.status).toBe('completed')
    })

    it('should handle missing optional fields', async () => {
      const exportData = {
        conversations: [{
          uuid: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          chat_messages: [{
            uuid: crypto.randomUUID(),
            text: 'Message',
            sender: 'human',
            created_at: new Date().toISOString()
          }]
        }]
      }

      const file = Buffer.from(JSON.stringify(exportData))
      const result = await service.importFile(file, testWorkspaceId, testUserId)

      expect(result.status).toBe('completed')
    })
  })

  describe('getImportStatus', () => {
    it('should return null for non-existent job', () => {
      const status = service.getImportStatus('non-existent-job-id')

      expect(status).toBeNull()
    })

    it('should return job status after import', async () => {
      const exportData = {
        conversations: [{
          uuid: crypto.randomUUID(),
          name: 'Test',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          chat_messages: []
        }]
      }

      const file = Buffer.from(JSON.stringify(exportData))
      const result = await service.importFile(file, testWorkspaceId, testUserId)

      const status = service.getImportStatus(result.jobId)

      expect(status).not.toBeNull()
      expect(status!.id).toBe(result.jobId)
      expect(status!.workspace_id).toBe(testWorkspaceId)
    })
  })
})

function normalizeConversations(data: any): NormalizedConversation[] {
  if (!data || !Array.isArray(data.conversations)) {
    return []
  }

  return data.conversations.map((conv: any, idx: number) => {
    const created = conv.created_at || new Date().toISOString()
    const updated = conv.updated_at || created
    const title = conv.name || `Conversation ${idx + 1}`
    const messages = Array.isArray(conv.chat_messages)
      ? conv.chat_messages.map((msg: any, msgIdx: number) => ({
          id: msg.uuid || `msg-${idx}-${msgIdx}`,
          role: normalizeRole(msg.sender),
          content: msg.text ?? '',
          created_at: msg.created_at || created,
          raw_metadata: msg
        }))
      : []

    return {
      id: conv.uuid || `conversation-${idx}`,
      provider: 'claude',
      external_id: conv.uuid || `conversation-${idx}`,
      title,
      created_at: created,
      updated_at: updated,
      messages,
      raw_metadata: conv
    }
  })
}

function normalizeRole(role: any): string {
  if (typeof role !== 'string') return 'assistant'
  const lower = role.toLowerCase()
  if (lower === 'human' || lower === 'user') return 'human'
  return 'assistant'
}
