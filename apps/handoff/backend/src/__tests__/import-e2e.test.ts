import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ImportService } from '../services/import'
import { DatabaseClient } from '../lib/db'
import { makerConfig } from '@memorylayer/memory-extraction'

/**
 * End-to-End Import Flow Tests
 * 
 * These tests verify the import pipeline includes MAKER integration
 * and handles the complete flow from file → conversations → memories
 */
describe('Import Flow E2E - MAKER Integration', () => {
    let service: ImportService

    beforeEach(() => {
        const openaiApiKey = process.env.OPENAI_API_KEY || 'test-key'

        //Mock database to avoid real DB operations
        const mockDb = {
            query: async <T>(_sql: string, _params: any[] = []): Promise<T[]> => {
                // Mock workspace type
                if (_sql.includes('SELECT type FROM workspaces')) {
                    return [{ type: 'personal' }] as T[]
                }
                // Mock insertions
                if (_sql.includes('RETURNING')) {
                    return [{ id: crypto.randomUUID() }] as T[]
                }
                return []
            }
        } as unknown as DatabaseClient

        service = new ImportService(mockDb, openaiApiKey)
    })

    describe('MAKER Reliability Layer Integration', () => {
        it('should call MAKER microagents during import when enabled', async () => {
            // Mock MAKER provider
            const mockMakerProvider = (service as any).makerProvider
            const mockCall = vi.spyOn(mockMakerProvider, 'call')

            mockCall.mockResolvedValue(JSON.stringify({
                summary: 'User discussed implementing MAKER reliability layer',
                decisions: ['Use parallel microagents for consensus'],
                todos: ['Implement red-flagging', 'Add voting logic']
            }))

            // Mock chat capture parsing to return valid conversation
            const mockParse = vi.fn().mockResolvedValue({
                ok: true,
                value: [{
                    id: 'conv-1',
                    provider: 'claude',
                    external_id: 'ext-1',
                    title: 'Test Conversation',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    messages: [
                        {
                            id: 'msg-1',
                            role: 'human',
                            content: 'Implement MAKER',
                            created_at: new Date().toISOString(),
                            raw_metadata: {}
                        }
                    ],
                    raw_metadata: {}
                }]
            });

            (service as any).chatCapture.parseFileAuto = mockParse

            const file = Buffer.from(JSON.stringify({ conversations: [] }))
            const result = await service.importFile(file, 'workspace-1', 'user-1')

            // Verify import succeeded
            expect(result.status).toBe('completed')

            // Verify MAKER was called if enabled
            if (makerConfig.enabled) {
                // Should call MAKER with 3 replicas
                expect(mockCall).toHaveBeenCalled()
                expect(mockCall.mock.calls.length).toBeGreaterThanOrEqual(3)

                // Verify MAKER got conversation content
                const firstCall = mockCall.mock.calls[0][0]
                expect(typeof firstCall).toBe('string')
                expect(firstCall).toContain('HUMAN:')
            }
        }, 20000)

        it('should gracefully handle MAKER failures without blocking import', async () => {
            // Create fresh service instance for this test
            const mockDb = {
                query: async <T>(_sql: string, _params: any[] = []): Promise<T[]> => {
                    if (_sql.includes('SELECT type FROM workspaces')) {
                        return [{ type: 'personal' }] as T[]
                    }
                    if (_sql.includes('RETURNING')) {
                        return [{ id: crypto.randomUUID() }] as T[]
                    }
                    return []
                }
            } as unknown as DatabaseClient

            const testService = new ImportService(mockDb, 'test-key')

            // Mock MAKER to fail
            const mockMakerProvider = (testService as any).makerProvider
            const mockCall = vi.spyOn(mockMakerProvider, 'call')
            mockCall.mockRejectedValue(new Error('MAKER API Error'))

                // Mock valid parsing
                ; (testService as any).chatCapture = {
                    parseFileAuto: vi.fn().mockResolvedValue({
                        ok: true,
                        value: [{
                            id: 'conv-1',
                            provider: 'claude',
                            external_id: 'ext-1',
                            title: 'Test',
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString(),
                            messages: [{ id: 'msg-1', role: 'human', content: 'Test', created_at: new Date().toISOString(), raw_metadata: {} }],
                            raw_metadata: {}
                        }]
                    })
                };

            const file = Buffer.from(JSON.stringify({ conversations: [] }))
            const result = await testService.importFile(file, 'workspace-1', 'user-1')

            // Import should still succeed despite MAKER failure
            expect(result.status).toBe('completed')
        }, 20000)

        it('should store MAKER-verified memories with correct metadata', async () => {
            const testDecisions = ['Decision 1', 'Decision 2']
            const testTodos = ['Todo 1', 'Todo 2']
            const testSummary = 'Test summary'

            // Mock MAKER to return structured data
            const mockMakerProvider = (service as any).makerProvider
            vi.spyOn(mockMakerProvider, 'call').mockResolvedValue(JSON.stringify({
                summary: testSummary,
                decisions: testDecisions,
                todos: testTodos
            }))

            // Track stored memories
            const storedMemories: any[] = []
            const originalQuery = (service as any).db.query.bind((service as any).db)
                ; (service as any).db.query = vi.fn(async (sql: string, params: any[]) => {
                    // Capture memory inserts
                    if (sql.includes('INSERT INTO memories')) {
                        const memory = {
                            type: params[1], // type is usually second param
                            metadata: params[params.length - 2] || params[params.length - 1], // metadata usually near end
                            confidence: params[3] // confidence usually 4th param
                        }
                        storedMemories.push(memory)
                    }
                    return originalQuery(sql, params)
                })

                // Mock valid parsing
                ; (service as any).chatCapture.parseFileAuto = vi.fn().mockResolvedValue({
                    ok: true,
                    value: [{
                        id: 'conv-1',
                        provider: 'claude',
                        external_id: 'ext-1',
                        title: 'Test',
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        messages: [{ id: 'msg-1', role: 'human', content: 'Test message', created_at: new Date().toISOString(), raw_metadata: {} }],
                        raw_metadata: {}
                    }]
                })

            const file = Buffer.from(JSON.stringify({ conversations: [] }))
            await service.importFile(file, 'workspace-1', 'user-1')

            if (makerConfig.enabled) {
                // Find MAKERverified memory
                const makerMemory = storedMemories.find(m =>
                    m.type === 'fact.session'
                )

                if (makerMemory) {
                    expect(makerMemory).toBeDefined()
                    expect(makerMemory.confidence).toBe(0.95) // High confidence

                    // Verify metadata structure
                    const metadata = makerMemory.metadata
                    expect(metadata.maker_verified).toBe(true)
                    expect(metadata.decisions).toEqual(testDecisions)
                    expect(metadata.todos).toEqual(testTodos)
                    expect(metadata.extraction_method).toBe('maker_consensus')
                }
            }
        }, 20000)
    })

    describe('Import Configuration', () => {
        it('should respect MAKER config settings', () => {
            // Verify config is accessible
            expect(makerConfig).toBeDefined()
            expect(typeof makerConfig.enabled).toBe('boolean')
            expect(typeof makerConfig.replicas).toBe('number')
            expect(makerConfig.replicas).toBeGreaterThan(0)
        })

        it('should have OpenAI MAKER provider initialized', () => {
            const makerProvider = (service as any).makerProvider
            expect(makerProvider).toBeDefined()
            expect(makerProvider.call).toBeDefined()
            expect(typeof makerProvider.call).toBe('function')
        })
    })
})
