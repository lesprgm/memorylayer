import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DatabaseClient } from '../lib/db'

const shouldRunApiTests = process.env.RUN_API_TESTS === 'true'
const describeApi = shouldRunApiTests ? describe : describe.skip

describeApi('API Integration Tests', () => {
  let db: DatabaseClient
  let testWorkspaceId: string
  let testUserId: string
  let apiKey: string
  const baseUrl = 'http://localhost:8787'

  beforeAll(async () => {
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_KEY

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('SUPABASE_URL and SUPABASE_KEY must be set')
    }

    db = new DatabaseClient(supabaseUrl, supabaseKey)

    // Create test user first
    testUserId = crypto.randomUUID()
    await db.query(
      'INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)',
      [testUserId, 'API Test User', `apitest-${Date.now()}-${Math.random()}@example.com`, 'test-hash']
    )

    // Create test workspace
    testWorkspaceId = crypto.randomUUID()
    await db.query(
      'INSERT INTO workspaces (id, name, type, owner_id) VALUES ($1, $2, $3, $4)',
      [testWorkspaceId, 'API Test Workspace', 'personal', testUserId]
    )

    // Create API key
    apiKey = crypto.randomUUID()
    await db.query(
      'INSERT INTO api_keys (key, workspace_id, user_id, name) VALUES ($1, $2, $3, $4)',
      [apiKey, testWorkspaceId, testUserId, 'Test Key']
    )
  })

  afterAll(async () => {
    // Clean up
    if (apiKey) {
      await db.query('DELETE FROM api_keys WHERE key = $1', [apiKey])
    }
    if (testWorkspaceId) {
      await db.query('DELETE FROM conversations WHERE workspace_id = $1', [testWorkspaceId])
      await db.query('DELETE FROM memories WHERE workspace_id = $1', [testWorkspaceId])
    }
    if (testUserId) {
      await db.query('DELETE FROM users WHERE id = $1', [testUserId])
    }
    if (testWorkspaceId) {
      await db.query('DELETE FROM workspaces WHERE id = $1', [testWorkspaceId])
    }
  })

  describe('Authentication', () => {
    it('should reject requests without API key', async () => {
      const response = await fetch(`${baseUrl}/api/conversations`)

      expect(response.status).toBe(401)
    })

    it('should reject requests with invalid API key', async () => {
      const response = await fetch(`${baseUrl}/api/conversations`, {
        headers: {
          'Authorization': 'Bearer invalid-key'
        }
      })

      expect(response.status).toBe(401)
    })

    it('should accept requests with valid API key', async () => {
      const response = await fetch(`${baseUrl}/api/conversations`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      })

      expect(response.status).toBe(200)
    })
  })

  describe('GET /api/conversations', () => {
    it('should return empty list for new workspace', async () => {
      const response = await fetch(`${baseUrl}/api/conversations`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      })

      expect(response.status).toBe(200)
      const data = await response.json() as { conversations: unknown[]; total: number }
      expect(data.conversations).toEqual([])
      expect(data.total).toBe(0)
    })

    it('should support pagination parameters', async () => {
      const response = await fetch(`${baseUrl}/api/conversations?limit=10&offset=0`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      })

      expect(response.status).toBe(200)
      const data = await response.json() as { conversations: unknown[]; total: number }
      expect(data).toHaveProperty('conversations')
      expect(data).toHaveProperty('total')
    })

    it('should support provider filter', async () => {
      const response = await fetch(`${baseUrl}/api/conversations?provider=anthropic`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      })

      expect(response.status).toBe(200)
    })

    it('should support search parameter', async () => {
      const response = await fetch(`${baseUrl}/api/conversations?search=test`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      })

      expect(response.status).toBe(200)
    })

    it('should handle invalid limit parameter', async () => {
      const response = await fetch(`${baseUrl}/api/conversations?limit=invalid`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      })

      expect(response.status).toBe(400)
    })

    it('should enforce maximum limit', async () => {
      const response = await fetch(`${baseUrl}/api/conversations?limit=1000`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      })

      expect(response.status).toBe(400)
    })
  })

  describe('GET /api/memories', () => {
    it('should return empty list for new workspace', async () => {
      const response = await fetch(`${baseUrl}/api/memories`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      })

      expect(response.status).toBe(200)
      const data = await response.json() as { memories: unknown[]; total: number }
      expect(data.memories).toEqual([])
      expect(data.total).toBe(0)
    })

    it('should support type filter', async () => {
      const response = await fetch(`${baseUrl}/api/memories?types=entity,fact`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      })

      expect(response.status).toBe(200)
    })
    
    it('should support singular type filter', async () => {
      const response = await fetch(`${baseUrl}/api/memories?type=decision`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      })

      expect(response.status).toBe(200)
    })

    it('should support date range filters', async () => {
      const startDate = '2025-01-01T00:00:00Z'
      const endDate = '2025-12-31T23:59:59Z'
      const response = await fetch(
        `${baseUrl}/api/memories?startDate=${startDate}&endDate=${endDate}`,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        }
      )

      expect(response.status).toBe(200)
    })

    it('should handle invalid date format', async () => {
      const response = await fetch(`${baseUrl}/api/memories?startDate=invalid-date`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      })

      expect(response.status).toBe(400)
    })
  })

  describe('POST /api/import', () => {
    it('should reject request without file', async () => {
      const response = await fetch(`${baseUrl}/api/import`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      })

      expect(response.status).toBe(400)
    })

    it('should reject non-multipart request', async () => {
      const response = await fetch(`${baseUrl}/api/import`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ data: 'test' })
      })

      expect(response.status).toBe(400)
    })

    it('should accept valid file upload', async () => {
      const exportData = {
        conversations: [{
          uuid: crypto.randomUUID(),
          name: 'API Test Conversation',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          chat_messages: []
        }]
      }

      const formData = new FormData()
      const blob = new Blob([JSON.stringify(exportData)], { type: 'application/json' })
      formData.append('file', blob, 'export.json')

      const response = await fetch(`${baseUrl}/api/import`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        },
        body: formData
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toHaveProperty('jobId')
      expect(data).toHaveProperty('status')
    })
  })

  describe('GET /api/export', () => {
    it('should export workspace data', async () => {
      const response = await fetch(`${baseUrl}/api/export`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      })

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('application/json')
    })

    it('should include all data types in export', async () => {
      const response = await fetch(`${baseUrl}/api/export`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      })

      const data = await response.json()
      expect(data).toHaveProperty('conversations')
      expect(data).toHaveProperty('memories')
      expect(data).toHaveProperty('relationships')
      expect(data).toHaveProperty('metadata')
    })
  })

  describe('Error Handling', () => {
    it('should return 404 for non-existent routes', async () => {
      const response = await fetch(`${baseUrl}/api/nonexistent`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      })

      expect(response.status).toBe(404)
    })

    it('should return 405 for unsupported methods', async () => {
      const response = await fetch(`${baseUrl}/api/conversations`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      })

      expect(response.status).toBe(405)
    })

    it('should handle malformed JSON in request body', async () => {
      const response = await fetch(`${baseUrl}/api/import`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: '{ invalid json }'
      })

      expect(response.status).toBe(400)
    })
  })

  describe('CORS', () => {
    it('should include CORS headers', async () => {
      const response = await fetch(`${baseUrl}/api/conversations`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Origin': 'http://localhost:3000'
        }
      })

      expect(response.headers.get('access-control-allow-origin')).toBeTruthy()
    })

    it('should handle OPTIONS preflight requests', async () => {
      const response = await fetch(`${baseUrl}/api/conversations`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:3000',
          'Access-Control-Request-Method': 'GET'
        }
      })

      expect(response.status).toBe(200)
      expect(response.headers.get('access-control-allow-methods')).toBeTruthy()
    })
  })
})
