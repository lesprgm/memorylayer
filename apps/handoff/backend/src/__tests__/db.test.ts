import { describe, it, expect, beforeEach } from 'vitest'
import { DatabaseClient } from '../lib/db'

describe('DatabaseClient', () => {
  let db: DatabaseClient

  beforeEach(() => {
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_KEY

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('SUPABASE_URL and SUPABASE_KEY must be set')
    }

    db = new DatabaseClient(supabaseUrl, supabaseKey)
  })

  // Helper to create test workspace with user
  async function createTestWorkspace(db: DatabaseClient, name: string = 'Test') {
    const userId = crypto.randomUUID()
    await db.query(
      'INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)',
      [userId, 'Test User', `test-${userId}@example.com`, 'test-hash']
    )
    
    const workspaceId = crypto.randomUUID()
    await db.query(
      'INSERT INTO workspaces (id, name, type, owner_id) VALUES ($1, $2, $3, $4)',
      [workspaceId, name, 'personal', userId]
    )
    
    return { workspaceId, userId }
  }

  async function cleanupTestWorkspace(db: DatabaseClient, workspaceId: string, userId: string) {
    await db.query('DELETE FROM workspaces WHERE id = $1', [workspaceId])
    await db.query('DELETE FROM users WHERE id = $1', [userId])
  }

  describe('query', () => {
    it('should execute simple SELECT query', async () => {
      const result = await db.query<{ num: number }>('SELECT 1 as num')
      
      expect(result).toHaveLength(1)
      expect(result[0].num).toBe(1)
    })

    it('should handle parameterized queries', async () => {
      const result = await db.query<{ sum: number }>(
        'SELECT $1::integer + $2::integer as sum',
        [5, 10]
      )
      
      expect(result[0].sum).toBe(15)
    })

    it('should handle queries with leading/trailing whitespace', async () => {
      const result = await db.query<{ num: number }>(`
        SELECT 1 as num
      `)
      
      expect(result).toHaveLength(1)
      expect(result[0].num).toBe(1)
    })

    it('should handle empty result sets', async () => {
      const result = await db.query(
        'SELECT * FROM workspaces WHERE id = $1',
        ['00000000-0000-0000-0000-000000000000']
      )
      
      expect(result).toEqual([])
    })

    it('should handle NULL values', async () => {
      const result = await db.query<{ value: null }>('SELECT NULL as value')
      
      expect(result[0].value).toBeNull()
    })

    it('should handle array parameters', async () => {
      const { workspaceId, userId } = await createTestWorkspace(db)
      
      const result = await db.query(
        'SELECT * FROM workspaces WHERE id = ANY($1)',
        [[workspaceId]]
      )
      
      expect(result).toHaveLength(1)
      
      await cleanupTestWorkspace(db, workspaceId, userId)
    })

    it('should handle JSON data', async () => {
      const { workspaceId, userId } = await createTestWorkspace(db)
      const metadata = { key: 'value', nested: { data: 123 } }
      
      const convId = crypto.randomUUID()
      await db.query(
        `INSERT INTO conversations (id, workspace_id, provider, raw_metadata, created_at, updated_at)
         VALUES ($1, $2, 'anthropic', $3, NOW(), NOW())`,
        [convId, workspaceId, JSON.stringify(metadata)]
      )
      
      const result = await db.query<{ raw_metadata: typeof metadata }>(
        'SELECT raw_metadata FROM conversations WHERE id = $1',
        [convId]
      )
      
      expect(result[0].raw_metadata).toEqual(metadata)
      
      await db.query('DELETE FROM conversations WHERE id = $1', [convId])
      await cleanupTestWorkspace(db, workspaceId, userId)
    })

    it('should handle special characters in strings', async () => {
      const specialChars = "Test's \"quoted\" text with \\ backslash"
      const { workspaceId, userId } = await createTestWorkspace(db, specialChars)
      
      const result = await db.query<{ name: string }>(
        'SELECT name FROM workspaces WHERE id = $1',
        [workspaceId]
      )
      
      expect(result[0].name).toBe(specialChars)
      
      await cleanupTestWorkspace(db, workspaceId, userId)
    })

    it('should handle large result sets', async () => {
      const result = await db.query<{ num: number }>(
        'SELECT generate_series(1, 100) as num'
      )
      
      expect(result).toHaveLength(100)
      expect(result[0].num).toBe(1)
      expect(result[99].num).toBe(100)
    })

    it('should throw error for invalid SQL', async () => {
      await expect(
        db.query('INVALID SQL QUERY')
      ).rejects.toThrow()
    })

    it('should handle concurrent queries', async () => {
      const queries = Array.from({ length: 10 }, (_, i) => 
        db.query<{ num: number }>('SELECT $1 as num', [i])
      )
      
      const results = await Promise.all(queries)
      
      expect(results).toHaveLength(10)
      results.forEach((result, i) => {
        expect(result[0].num).toBe(i)
      })
    })

    it('should handle timestamp data types', async () => {
      const userId = crypto.randomUUID()
      await db.query(
        'INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)',
        [userId, 'Test User', `test-${userId}@example.com`, 'test-hash']
      )
      
      const workspaceId = crypto.randomUUID()
      const timestamp = new Date().toISOString()
      await db.query(
        'INSERT INTO workspaces (id, name, type, owner_id, created_at) VALUES ($1, $2, $3, $4, $5)',
        [workspaceId, 'Test', 'personal', userId, timestamp]
      )
      
      const result = await db.query<{ created_at: string }>(
        'SELECT created_at FROM workspaces WHERE id = $1',
        [workspaceId]
      )
      
      expect(result[0].created_at).toBeTruthy()
      expect(new Date(result[0].created_at)).toBeInstanceOf(Date)
      
      await cleanupTestWorkspace(db, workspaceId, userId)
    })

    it('should handle boolean values', async () => {
      const result = await db.query<{ true_val: boolean; false_val: boolean }>(
        'SELECT $1::boolean as true_val, $2::boolean as false_val',
        [true, false]
      )
      
      expect(result[0].true_val).toBe(true)
      expect(result[0].false_val).toBe(false)
    })

    it('should handle numeric precision', async () => {
      const result = await db.query<{ precise_num: number }>(
        'SELECT $1::numeric as precise_num',
        [0.123456789]
      )
      
      expect(result[0].precise_num).toBeCloseTo(0.123456789, 8)
    })
  })
})
