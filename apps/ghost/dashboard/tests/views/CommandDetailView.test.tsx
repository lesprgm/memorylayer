import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CommandDetailView } from '../../src/views/CommandDetailView';
import * as api from '../../src/api';
import type { Command } from '../../src/types';

// Mock the API module
vi.mock('../../src/api');

describe('CommandDetailView', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const mockCommand: Command = {
        id: 'cmd-123',
        text: 'Open the Q4 report',
        assistant_text: 'Opening the Q4 report for you',
        timestamp: '2024-01-01T12:00:00Z',
        created_at: '2024-01-01T12:00:00Z',
        actions: [
            {
                action: { type: 'file.open' as const, params: { path: '/reports/q4.pdf' } },
                status: 'success' as const,
                created_at: '2024-01-01T12:00:01Z',
            },
        ],
        memories_used: [
            {
                id: 'mem-1',
                type: 'entity.file',
                score: 0.95,
                summary: 'Q4 financial report',
                metadata: { path: '/reports/q4.pdf', name: 'q4.pdf' },
            },
            {
                id: 'mem-2',
                type: 'fact',
                score: 0.87,
                summary: 'Located in reports directory',
            },
        ],
    };

    it('shows loading state initially', () => {
        vi.mocked(api.fetchCommandById).mockImplementation(() => new Promise<Command>(() => { }));

        render(
            <MemoryRouter initialEntries={['/command/cmd-123']}>
                <Routes>
                    <Route path="/command/:commandId" element={<CommandDetailView />} />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getByText(/Loading.../i)).toBeInTheDocument();
    });

    it('fetches and displays command details', async () => {
        vi.mocked(api.fetchCommandById).mockResolvedValue(mockCommand);

        render(
            <MemoryRouter initialEntries={['/command/cmd-123']}>
                <Routes>
                    <Route path="/command/:commandId" element={<CommandDetailView />} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => {
            // The user query is now the main header
            expect(screen.getByText(/Open the Q4 report/i)).toBeInTheDocument();
        });

        expect(screen.getByText(/Opening the Q4 report for you/i)).toBeInTheDocument();
        // cmd-123 appears in metadata
        expect(screen.getByText(/cmd-123/i)).toBeInTheDocument();
    });

    it('displays memory sources', async () => {
        vi.mocked(api.fetchCommandById).mockResolvedValue(mockCommand);

        render(
            <MemoryRouter initialEntries={['/command/cmd-123']}>
                <Routes>
                    <Route path="/command/:commandId" element={<CommandDetailView />} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByText(/Knowledge Graph/i)).toBeInTheDocument();
        });

        // Graph displays file name
        const pdfRefs = screen.getAllByText(/q4\.pdf/i);
        expect(pdfRefs.length).toBeGreaterThan(0);

        // Graph displays truncated summary for non-files
        const summaryRefs = screen.getAllByText(/Located in reports d/i);
        expect(summaryRefs.length).toBeGreaterThan(0);
    });

    it('displays executed actions', async () => {
        vi.mocked(api.fetchCommandById).mockResolvedValue(mockCommand);

        render(
            <MemoryRouter initialEntries={['/command/cmd-123']}>
                <Routes>
                    <Route path="/command/:commandId" element={<CommandDetailView />} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByText(/Actions/i)).toBeInTheDocument();
        });

        expect(screen.getByText(/file\.open/i)).toBeInTheDocument();
    });

    it('shows error state when fetch fails', async () => {
        vi.mocked(api.fetchCommandById).mockRejectedValue(new Error('Network error'));

        render(
            <MemoryRouter initialEntries={['/command/cmd-123']}>
                <Routes>
                    <Route path="/command/:commandId" element={<CommandDetailView />} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByText(/Network error/i)).toBeInTheDocument();
        });

        expect(screen.getByText(/Back to Dashboard/i)).toBeInTheDocument();
    });

    it('has back to dashboard button', async () => {
        vi.mocked(api.fetchCommandById).mockResolvedValue(mockCommand);

        render(
            <MemoryRouter initialEntries={['/command/cmd-123']}>
                <Routes>
                    <Route path="/command/:commandId" element={<CommandDetailView />} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByText(/Open the Q4 report/i)).toBeInTheDocument();
        });

        // In the main view, it's just "Dashboard" with an arrow
        const backButton = screen.getByText(/Dashboard/i);
        expect(backButton).toBeInTheDocument();
    });

    it('displays metadata with timestamp', async () => {
        vi.mocked(api.fetchCommandById).mockResolvedValue(mockCommand);

        render(
            <MemoryRouter initialEntries={['/command/cmd-123']}>
                <Routes>
                    <Route path="/command/:commandId" element={<CommandDetailView />} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByText(/Metadata/i)).toBeInTheDocument();
        });

        expect(screen.getByText(/ID/i)).toBeInTheDocument();
        expect(screen.getByText(/cmd-123/i)).toBeInTheDocument();
        // Timestamp is now in the hero section, but we can check for the formatted date
        // The mock date is 2024-01-01T12:00:00Z
        // toLocaleString format depends on locale, but usually includes year
        expect(screen.getByText(/2024/i)).toBeInTheDocument();
    });
});
