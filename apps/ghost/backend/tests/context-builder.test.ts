import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContextBuilder } from '../src/services/context-builder';
import { MemoryLayerIntegration } from '../src/services/memory-layer-integration';

describe('ContextBuilder', () => {
    let contextBuilder: ContextBuilder;
    let mockMemoryLayer: any;
    let mockContextEngine: any;

    beforeEach(() => {
        mockContextEngine = {
            buildContext: vi.fn()
        };

        mockMemoryLayer = {
            isInitialized: vi.fn().mockReturnValue(true),
            initialize: vi.fn().mockResolvedValue(undefined),
            contextEngine: mockContextEngine
        };

        contextBuilder = new ContextBuilder(mockMemoryLayer);
    });

    it('should boost score of fact-type memories by 1.5x', async () => {
        const mockMemories = [
            {
                memory: { id: '1', type: 'fact', summary: 'Content memory', metadata: {} },
                score: 0.8
            },
            {
                memory: { id: '2', type: 'entity.file', summary: 'File metadata', metadata: {} },
                score: 0.5
            }
        ];

        mockContextEngine.buildContext.mockResolvedValue({
            ok: true,
            value: {
                context: 'Built context',
                memories: mockMemories
            }
        });

        const result = await contextBuilder.buildContext('test query', 'user-1');

        expect(result.memories).toHaveLength(2);

        // Fact memory should be boosted: 0.8 * 1.5 = 1.2
        const factMem = result.memories.find(m => m.memory.type === 'fact');
        expect(factMem?.score).toBeCloseTo(1.2);

        // Entity memory should stay same: 0.5
        const fileMem = result.memories.find(m => m.memory.type === 'entity.file');
        expect(fileMem?.score).toBe(0.5);
    });

    it('should filter out conversational memories (fact.command, fact.response)', async () => {
        const mockMemories = [
            {
                memory: { id: '1', type: 'fact', summary: 'Content', metadata: {} },
                score: 0.9
            },
            {
                memory: { id: '2', type: 'fact.command', summary: 'User query', metadata: {} },
                score: 0.95
            },
            {
                memory: { id: '3', type: 'fact.response', summary: 'AI response', metadata: {} },
                score: 0.95
            }
        ];

        mockContextEngine.buildContext.mockResolvedValue({
            ok: true,
            value: {
                context: 'Built context',
                memories: mockMemories
            }
        });

        const result = await contextBuilder.buildContext('test query', 'user-1');

        expect(result.memories).toHaveLength(1);
        expect(result.memories[0].memory.type).toBe('fact');
    });

    it('should re-sort memories after boosting', async () => {
        const mockMemories = [
            {
                memory: { id: '1', type: 'entity.file', summary: 'File metadata', metadata: {} },
                score: 0.8 // High score initially
            },
            {
                memory: { id: '2', type: 'fact', summary: 'Content', metadata: {} },
                score: 0.6 // Lower score initially
            }
        ];

        mockContextEngine.buildContext.mockResolvedValue({
            ok: true,
            value: {
                context: 'Built context',
                memories: mockMemories
            }
        });

        const result = await contextBuilder.buildContext('test query', 'user-1');

        // Fact memory boosted: 0.6 * 1.5 = 0.9
        // File memory: 0.8
        // Fact (0.9) should now be first
        expect(result.memories[0].memory.type).toBe('fact');
        expect(result.memories[0].score).toBeCloseTo(0.9);

        expect(result.memories[1].memory.type).toBe('entity.file');
        expect(result.memories[1].score).toBe(0.8);
    });
});
