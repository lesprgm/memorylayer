import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CommandDetailView } from '../../src/views/CommandDetailView';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import * as api from '../../src/api';

// Mock API
vi.mock('../../src/api', () => ({
    fetchCommandById: vi.fn(),
}));

describe('CommandDetailView', () => {
    const mockCommand = {
        id: 'cmd-123',
        text: 'Show me the files',
        assistant_text: 'Here are the files.',
        timestamp: '2023-01-01T12:00:00Z',
        created_at: '2023-01-01T12:00:00Z',
        actions: [{ type: 'file.open', params: { path: '/test.txt' } }],
        memories_used: [
            { id: 'mem-1', type: 'file', score: 0.9, summary: 'test.txt', metadata: { path: '/test.txt' } }
        ]
    };

    it('renders command details and metadata', async () => {
        (api.fetchCommandById as any).mockResolvedValue(mockCommand);

        render(
            <MemoryRouter initialEntries={['/command/cmd-123']}>
                <Routes>
                    <Route path="/command/:commandId" element={<CommandDetailView />} />
                </Routes>
            </MemoryRouter>
        );

        // Check loading state
        expect(screen.getByText('Loading...')).toBeInTheDocument();

        // Check content
        await waitFor(() => {
            expect(screen.getByText('Show me the files')).toBeInTheDocument();
            expect(screen.getByText('Here are the files.')).toBeInTheDocument();
        });

        // Check metadata
        expect(screen.getByText('cmd-123')).toBeInTheDocument();
        expect(screen.getByText('file.open')).toBeInTheDocument();

        // Check Explain button
        expect(screen.getByText('Explain Reasoning')).toBeInTheDocument();
    });

    it('handles error state', async () => {
        (api.fetchCommandById as any).mockRejectedValue(new Error('Not found'));

        render(
            <MemoryRouter initialEntries={['/command/cmd-999']}>
                <Routes>
                    <Route path="/command/:commandId" element={<CommandDetailView />} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByText('Not found')).toBeInTheDocument();
        });
    });
});
