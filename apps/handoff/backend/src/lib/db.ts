import { User, UserWithPassword, Workspace, WorkspaceMember } from '../types/auth'

interface DatabaseClientOptions {
  mockMode?: boolean
}

// Simple in-memory membership cache for mock/test mode
const membershipCache = new Map<string, Set<string>>()

export class DatabaseClient {
  private supabaseUrl: string
  private supabaseKey: string
  private mockMode: boolean

  constructor(supabaseUrl: string, supabaseKey: string, options: DatabaseClientOptions = {}) {
    this.supabaseUrl = supabaseUrl
    this.supabaseKey = supabaseKey
    this.mockMode = options.mockMode ?? process.env.USE_MOCK_SUPABASE === 'true'
  }

  async query<T>(sql: string, params: any[] = []): Promise<T[]> {
    // Convert arrays to Postgres array literal format '{a,b}'
    const formattedParams = this.mockMode
      ? params.map(p => {
          if (Array.isArray(p) && p.length === 1 && Array.isArray(p[0])) {
            return p[0]
          }
          return p
        })
      : params.map(p => {
          if (Array.isArray(p)) {
            const items = p.map(item => {
              if (item === null) return 'NULL'
              if (typeof item === 'number') return item.toString()
              if (typeof item === 'boolean') return item ? 't' : 'f'
              // Stringify and escape for Postgres array
              const str = String(item)
              // Escape backslashes first, then double quotes
              const escaped = str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
              return `"${escaped}"`
            })
            return `{${items.join(',')}}`
          }
          return p
        })

    const body = JSON.stringify({ query: sql, params: formattedParams })

    const response = await fetch(`${this.supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.supabaseKey,
        'Authorization': `Bearer ${this.supabaseKey}`
      },
      body
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Database query error:', errorText)
      throw new Error(`Database query failed: ${response.statusText} - ${errorText}`)
    }

    const resultText = await response.text()
    let result = JSON.parse(resultText)
    if (this.mockMode && Array.isArray(result)) {
      result = result.map(row => {
        const converted: any = {}
        for (const [k, v] of Object.entries(row)) {
          if (typeof v === 'string' && /^-?\d+$/.test(v)) {
            converted[k] = Number(v)
          } else {
            converted[k] = v
          }
        }
        return converted
      })
    }
    return result
  }

  async createUser(email: string, passwordHash: string, name: string): Promise<User> {
    const result = await this.query<User>(
      `INSERT INTO users (email, password_hash, name) 
       VALUES ($1, $2, $3) 
       RETURNING id, email, name, created_at, updated_at`,
      [email, passwordHash, name]
    )
    return result[0]
  }

  async getUserByEmail(email: string): Promise<UserWithPassword | null> {
    const result = await this.query<UserWithPassword>(
      `SELECT id, email, password_hash, name, created_at, updated_at 
       FROM users 
       WHERE email = $1`,
      [email]
    )
    return result[0] || null
  }

  async getUserById(id: string): Promise<User | null> {
    const result = await this.query<User>(
      `SELECT id, email, name, created_at, updated_at 
       FROM users 
       WHERE id = $1`,
      [id]
    )
    return result[0] || null
  }

  async createWorkspace(name: string, type: 'personal' | 'team', ownerId: string): Promise<Workspace> {
    const result = await this.query<Workspace>(
      `INSERT INTO workspaces (name, type, owner_id) 
       VALUES ($1, $2, $3) 
       RETURNING id, name, type, owner_id, created_at, updated_at`,
      [name, type, ownerId]
    )
    return result[0]
  }

  async addWorkspaceMember(workspaceId: string, userId: string, role: string = 'member'): Promise<WorkspaceMember> {
    const result = await this.query<WorkspaceMember>(
      `INSERT INTO workspace_members (workspace_id, user_id, role) 
       VALUES ($1, $2, $3) 
       RETURNING id, workspace_id, user_id, role, created_at`,
      [workspaceId, userId, role]
    )
    // Track in mock cache
    const members = membershipCache.get(workspaceId) ?? new Set<string>()
    members.add(userId)
    membershipCache.set(workspaceId, members)
    return result[0]
  }

  async getUserWorkspaces(userId: string): Promise<Workspace[]> {
    const result = await this.query<Workspace>(
      `SELECT w.id, w.name, w.type, w.owner_id, w.created_at, w.updated_at
       FROM workspaces w
       LEFT JOIN workspace_members wm ON w.id = wm.workspace_id
       WHERE w.owner_id = $1 OR wm.user_id = $2
       ORDER BY w.created_at DESC`,
      [userId, userId]
    )
    return result
  }

  async isWorkspaceMember(workspaceId: string, userId: string): Promise<boolean> {
    // Explicit member
    const cachedMembers = membershipCache.get(workspaceId)
    if (cachedMembers && cachedMembers.has(userId)) {
      return true
    }

    const memberRows = await this.query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, userId]
    )
    const memberCount = memberRows[0] ? parseInt(memberRows[0].count || '0', 10) : 0
    if (memberCount > 0) return true

    // Owner is always a member
    const ownerRows = await this.query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM workspaces WHERE id = $1 AND owner_id = $2`,
      [workspaceId, userId]
    )
    const ownerCount = ownerRows[0] ? parseInt(ownerRows[0].count || '0', 10) : 0
    return ownerCount > 0
  }

  async createActivity(
    workspaceId: string,
    userId: string,
    type: string,
    details: Record<string, any> = {}
  ): Promise<void> {
    await this.query(
      `INSERT INTO activities (workspace_id, user_id, type, details) 
       VALUES ($1, $2, $3, $4)`,
      [workspaceId, userId, type, JSON.stringify(details)]
    )
  }

  async getWorkspaceById(workspaceId: string): Promise<Workspace | null> {
    const result = await this.query<Workspace>(
      `SELECT id, name, type, owner_id, created_at, updated_at
       FROM workspaces
       WHERE id = $1`,
      [workspaceId]
    )
    return result[0] || null
  }

  async getWorkspaceMembers(workspaceId: string): Promise<Array<{ id: string; user_id: string; name: string; email: string; role: string; created_at: string }>> {
    const result = await this.query<{ id: string; user_id: string; name: string; email: string; role: string; created_at: string }>(
      `
      WITH ws AS (
        SELECT $1::uuid AS id
      )
      SELECT wm.id, wm.user_id, u.name, u.email, wm.role, wm.created_at
      FROM workspace_members wm
      JOIN users u ON wm.user_id = u.id
      JOIN ws ON wm.workspace_id = ws.id
      UNION ALL
      SELECT 
        ('owner-' || w.id) as id,
        w.owner_id as user_id,
        u.name,
        u.email,
        'owner' as role,
        w.created_at
      FROM workspaces w
      JOIN users u ON w.owner_id = u.id
      JOIN ws ON w.id = ws.id
      ORDER BY created_at ASC
      `,
      [workspaceId]
    )
    return result
  }

  async deleteWorkspaceData(workspaceId: string): Promise<void> {
    // Delete in order to respect foreign key constraints
    // 1. Delete relationships
    await this.query(
      `DELETE FROM relationships WHERE workspace_id = $1`,
      [workspaceId]
    )

    // 2. Delete memories
    await this.query(
      `DELETE FROM memories WHERE workspace_id = $1`,
      [workspaceId]
    )

    // 3. Delete messages (via conversations cascade)
    await this.query(
      `DELETE FROM messages WHERE conversation_id IN (
         SELECT id FROM conversations WHERE workspace_id = $1
       )`,
      [workspaceId]
    )

    // 4. Delete conversations
    await this.query(
      `DELETE FROM conversations WHERE workspace_id = $1`,
      [workspaceId]
    )

    // 5. Delete activities
    await this.query(
      `DELETE FROM activities WHERE workspace_id = $1`,
      [workspaceId]
    )

    // 6. Delete workspace members
    await this.query(
      `DELETE FROM workspace_members WHERE workspace_id = $1`,
      [workspaceId]
    )

    // 7. Delete workspace
    await this.query(
      `DELETE FROM workspaces WHERE id = $1`,
      [workspaceId]
    )

    // Clear caches
    membershipCache.delete(workspaceId)
  }
}
