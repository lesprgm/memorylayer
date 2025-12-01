import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChatService } from '../chat'
import { EmbeddingService } from '../embedding'

describe('ChatService vector search', () => {
    const mockDb = { query: vi.fn() }
    const generateEmbedding = vi.fn<Parameters<EmbeddingService['generateEmbedding']>, ReturnType<EmbeddingService['generateEmbedding']>>()
    const mockEmbedding = {
        generateEmbedding
    } as unknown as EmbeddingService

    const mockOpenAI = {
        chat: {
            completions: {
                create: vi.fn().mockResolvedValue({
                    choices: [{ message: { content: 'ok' } }]
                })
            }
        }
    }

    beforeEach(() => {
        vi.resetAllMocks()
        mockOpenAI.chat.completions.create.mockResolvedValue({
            choices: [{ message: { content: 'ok' } }]
        })
    })

    it('uses vector results when valid memories are returned', async () => {
        generateEmbedding.mockResolvedValue([0.1, 0.2, 0.3])
        mockDb.query.mockResolvedValue([{
            id: 'm1',
            workspace_id: 'ws1',
            type: 'fact',
            content: 'A remembered fact',
            confidence: 0.9
        }])

        const service = new ChatService(mockDb as any, 'test-key', undefined, 'gpt-test', mockEmbedding, mockOpenAI as any)

        const result = await service.chat('hello', 'ws1')

        expect(mockDb.query).toHaveBeenCalled()
        expect(mockOpenAI.chat.completions.create).toHaveBeenCalled()
        expect(result.sources).toHaveLength(1)
        expect(result.sources[0].content).toBe('A remembered fact')
    })

    it('falls back to keyword search when vector rows are malformed', async () => {
        generateEmbedding.mockResolvedValue([0.1])
        mockDb.query.mockResolvedValue([{ debug: true }])

        const fallbackMemories = [{ id: 'm2', workspace_id: 'ws1', type: 'fact', content: 'Fallback memory', confidence: 0.5 }]
        const service = new ChatService(mockDb as any, 'test-key', undefined, 'gpt-test', mockEmbedding, mockOpenAI as any)
        ;(service as any).memoryService = {
            getMemories: vi.fn().mockResolvedValue({ memories: fallbackMemories })
        }

        const result = await service.chat('hello', 'ws1')

        expect((service as any).memoryService.getMemories).toHaveBeenCalled()
        expect(result.sources).toEqual(fallbackMemories)
    })

    it('falls back to token keyword search when full-text search is empty', async () => {
        generateEmbedding.mockResolvedValue([0.1])
        mockDb.query.mockResolvedValue([]) // vector returns nothing

        const toolsmithMemory = {
            id: 'tool-1',
            workspace_id: 'ws1',
            type: 'fact',
            content: 'Toolsmith is the AI platform',
            confidence: 0.9
        }

        const getMemories = vi.fn().mockImplementation((args: any) => {
            if (args.search === 'what is toolsmith') return Promise.resolve({ memories: [] })
            if (args.search === 'toolsmith') return Promise.resolve({ memories: [toolsmithMemory] })
            return Promise.resolve({ memories: [] })
        })

        const service = new ChatService(mockDb as any, 'test-key', undefined, 'gpt-test', mockEmbedding, mockOpenAI as any)
        ;(service as any).memoryService = { getMemories }

        const result = await service.chat('what is toolsmith', 'ws1')

        expect(getMemories).toHaveBeenCalled()
        expect(result.sources).toContainEqual(toolsmithMemory)
    })
})
