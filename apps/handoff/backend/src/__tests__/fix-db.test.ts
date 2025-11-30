import { describe, it } from 'vitest'
import { DatabaseClient } from '../lib/db'
import fs from 'fs'
import path from 'path'

const shouldRunFixTest = process.env.RUN_DB_FIX_TEST === 'true'
const describeFix = shouldRunFixTest ? describe : describe.skip

describeFix('Database Fix', () => {
    it('should update exec_sql function', async () => {
        const supabaseUrl = process.env.SUPABASE_URL
        const supabaseKey = process.env.SUPABASE_KEY

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('SUPABASE_URL and SUPABASE_KEY must be set')
        }

        const db = new DatabaseClient(supabaseUrl, supabaseKey)

        const sqlPath = path.join(__dirname, '../../FIX_EXEC_SQL_FINAL.sql')
        const sql = fs.readFileSync(sqlPath, 'utf8')

        console.log('Applying SQL fix...')
        // We can't use db.query directly because it wraps in JSON
        // But wait, db.query calls exec_sql.
        // If we pass the CREATE FUNCTION statement as the query, exec_sql will execute it.

        try {
            await db.query(sql)
            console.log('SQL fix applied successfully')
        } catch (e) {
            console.error('Failed to apply SQL fix:', e)
            throw e
        }
    })
})
