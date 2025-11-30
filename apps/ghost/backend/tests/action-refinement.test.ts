import { describe, it, expect } from 'vitest';
import { llmCoordinator } from '../src/services/llm-coordinator';
import type { MemoryReference } from '../src/types';

/**
 * Helper to create a memory reference with optional metadata hints.
 */
function makeFileMemory(id: string, path: string, meta: Partial<MemoryReference['metadata']> = {}): MemoryReference {
    return {
        id,
        type: 'entity.file.document',
        score: 1,
        summary: path,
        metadata: { path, ...meta },
    } as MemoryReference;
}

describe('LLMCoordinator fallback - Action Refinement', () => {
    it('enriches file.open with page hint when metadata provides page', async () => {
        const mem = makeFileMemory('1', '/tmp/report.pdf', { page: 5, name: 'report.pdf' });
        const response = await llmCoordinator.generateResponse('open the report', '', [mem]);
        expect(response.actions).toHaveLength(1);
        const action = response.actions[0];
        expect(action.type).toBe('file.open');
        const params = action.params as any;
        expect(params.path).toBe('/tmp/report.pdf');
        expect(params.page).toBe(5);
        expect(response.assistant_text).toContain('page 5');
    });

    it('adds section hint for documents with section metadata', async () => {
        const mem = makeFileMemory('2', '/tmp/notes.txt', { section: 'Meeting Summary', name: 'notes.txt' });
        const response = await llmCoordinator.generateResponse('show notes', '', [mem]);
        const action = response.actions[0];
        expect(action.type).toBe('file.open');
        const params = action.params as any;
        expect(params.section).toBe('Meeting Summary');
        expect(response.assistant_text).toContain('Meeting Summary');
    });

    it('handles file.scroll intent correctly', async () => {
        const response = await llmCoordinator.generateResponse('scroll down 2 pages', '', []);
        expect(response.actions).toHaveLength(1);
        const action = response.actions[0];
        expect(action.type).toBe('file.scroll');
        const params = action.params as any;
        expect(params.direction).toBe('down');
        // 2 pages * 800px per page = 1600
        expect(params.amount).toBe(1600);
        expect(response.assistant_text).toContain('Scrolling down');
    });

    it('gracefully handles no memories', async () => {
        const response = await llmCoordinator.generateResponse('open something unknown', '', []);
        expect(response.actions).toHaveLength(1);
        const action = response.actions[0];
        expect(action.type).toBe('info.recall');
        const params = action.params as any;
        expect(params.summary).toContain('No memories found');
        expect(response.assistant_text).toContain('No memories found');
    });

    it('prefers recall summary over generic assistant chatter', async () => {
        const coordinator: any = llmCoordinator;
        const actions = [{ type: 'info.recall', params: { summary: 'Sarah complained about brittle error handling in the API redesign.' } }];
        const response = coordinator.withFallbackActions(
            { assistant_text: 'Starting a search now.', actions },
            'What did Sarah complain about?',
            []
        );

        expect(response.assistant_text).toBe('Sarah complained about brittle error handling in the API redesign.');
    });
});
