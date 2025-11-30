import { describe, it, expect } from 'vitest'
import { DatabaseClient } from '../lib/db'
import { ConversationService } from '../services/conversation'

const shouldRunRealDb = process.env.RUN_REAL_DB_TESTS === 'true'
const describeRealDb = shouldRunRealDb ? describe : describe.skip

// Test with REAL database
describeRealDb('Real Database Integration', () => {
  const supabaseUrl = process.env.SUPABASE_URL || ''
  const supabaseKey = process.env.SUPABASE_KEY || ''

  const db = new DatabaseClient(supabaseUrl, supabaseKey)
  const conversationService = new ConversationService(db)

  it('should query conversations from real database', async () => {
    // Get any workspace that has conversations
    const workspaces = await db.query<{ workspace_id: string, count: string }>(
      'SELECT workspace_id, COUNT(*) as count FROM conversations GROUP BY workspace_id LIMIT 1',
      []
    )

    if (workspaces.length === 0) {
      console.log('No conversations in database to test')
      return
    }

    const workspaceId = workspaces[0].workspace_id
    console.log('Testing with workspace:', workspaceId)

    // Test the conversation service
    const result = await conversationService.getConversations({
      workspaceId,
      limit: 10,
      offset: 0
    })

    console.log('Result:', {
      total: result.total,
      conversationsCount: result.conversations.length,
      firstConversation: result.conversations[0]
    })

    expect(result).toBeDefined()
    expect(result.total).toBeGreaterThan(0)
    expect(result.conversations.length).toBeGreaterThan(0)
  })
})
