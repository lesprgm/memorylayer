import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ExplainView } from '../../src/views/ExplainView';
import * as api from '../../src/api';

// Mock the API module
vi.mock('../../src/api');

// Mock MemoryGraph component
vi.mock('../../src/components/MemoryGraph', () => ({
    MemoryGraph: ({ data }: any) => <div data-testid="memory-graph">Graph with {data.nodes.length} nodes</div>,
}));

describe('ExplainView', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const mockExplanationData = {
        commandId: 'cmd-123',
        commandText: 'Open the report',
        userQuery: 'Find the Q4 report',
        graph: {
            nodes: [
                { id: 'query', type: 'query', label: 'Find Q4 report' },
                { id: 'memory-1', type: 'memory', label: 'Q4 report location', confidence: 0.9 },
                { id: 'file-1', type: 'file', label: '/reports/q4.pdf' },
            ],
            edges: [
                { source: 'query', target: 'memory-1', weight: 0.9 },
                { source: 'memory-1', target: 'file-1', weight: 0.8 },
            ],
        },
        reasoning: {
            query: 'Find Q4 report',
            steps: [],
            retrievedCount: 1,
            topMatches: [],
        },
    };

    it('shows loading state initially', () => {
        vi.mocked(api.fetchExplanation).mockImplementation(() => new Promise(() => { }));

        render(
            <MemoryRouter initialEntries={['/explain/cmd-123']}>
                <Routes>
                    <Route path="/explain/:commandId" element={<ExplainView />} />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getByText(/Loading context/i)).toBeInTheDocument();
    });

    it('fetches and displays explanation data', async () => {
        vi.mocked(api.fetchExplanation).mockResolvedValue(mockExplanationData);

        render(
            <MemoryRouter initialEntries={['/explain/cmd-123']}>
                <Routes>
                    <Route path="/explain/:commandId" element={<ExplainView />} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByText(/Why Ghost recalled this/i)).toBeInTheDocument();
        });

        expect(screen.getByText(/"Open the report"/i)).toBeInTheDocument();
        expect(screen.getByTestId('memory-graph')).toBeInTheDocument();
        expect(screen.getByText(/Graph with 3 nodes/i)).toBeInTheDocument();
    });

    it('shows error state when fetch fails', async () => {
        vi.mocked(api.fetchExplanation).mockRejectedValue(new Error('Network error'));

        render(
            <MemoryRouter initialEntries={['/explain/cmd-123']}>
                <Routes>
                    <Route path="/explain/:commandId" element={<ExplainView />} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByText(/Failed to load explanation|Network error/i)).toBeInTheDocument();
        });

        expect(screen.getByText(/Back to Dashboard/i)).toBeInTheDocument();
    });

    it('displays reasoning timeline', async () => {
        vi.mocked(api.fetchExplanation).mockResolvedValue(mockExplanationData);

        render(
            <MemoryRouter initialEntries={['/explain/cmd-123']}>
                <Routes>
                    <Route path="/explain/:commandId" element={<ExplainView />} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByText(/Reasoning Timeline/i)).toBeInTheDocument();
        });

        expect(screen.getByText(/User Query/i)).toBeInTheDocument();
        expect(screen.getByText(/"Find the Q4 report"/i)).toBeInTheDocument();
        expect(screen.getByText(/Memory Retrieval/i)).toBeInTheDocument();
        expect(screen.getByText(/Found 1 relevant memories/i)).toBeInTheDocument();
    });

    it('has back to dashboard link', async () => {
        vi.mocked(api.fetchExplanation).mockResolvedValue(mockExplanationData);

        render(
            <MemoryRouter initialEntries={['/explain/cmd-123']}>
                <Routes>
                    <Route path="/explain/:commandId" element={<ExplainView />} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => {
            const links = screen.getAllByText(/Back to Dashboard/i);
            expect(links.length).toBeGreaterThan(0);
        });
    });
});
