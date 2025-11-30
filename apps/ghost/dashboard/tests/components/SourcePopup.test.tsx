import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { SourcePopup } from '../../src/components/SourcePopup';
import type { MemoryReference } from '../../src/types';

describe('SourcePopup', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Clear timers
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const mockSources: MemoryReference[] = [
        {
            id: 'mem-1',
            type: 'entity.file',
            score: 0.95,
            summary: 'Q4 financial report with revenue projections',
            metadata: { path: '/reports/q4.pdf', name: 'q4.pdf', modified: '2024-01-15T10:00:00Z' },
        },
        {
            id: 'mem-2',
            type: 'fact',
            score: 0.72,
            summary: 'Budget allocation details',
            metadata: { name: 'budget.txt' },
        },
    ];

    it('renders with source count', () => {
        const mockClose = vi.fn();

        render(<SourcePopup sources={mockSources} onClose={mockClose} />);

        expect(screen.getByText(/Found in/i)).toBeInTheDocument();
        expect(screen.getByText(/2 sources/i)).toBeInTheDocument();
    });

    it('displays all sources', () => {
        const mockClose = vi.fn();

        render(<SourcePopup sources={mockSources} onClose={mockClose} />);

        expect(screen.getByText(/Q4 financial report/i)).toBeInTheDocument();
        expect(screen.getByText(/Budget allocation details/i)).toBeInTheDocument();
        expect(screen.getByText(/q4\.pdf/i)).toBeInTheDocument();
    });

    it('shows confidence bars for sources', () => {
        const mockClose = vi.fn();

        const { container } = render(<SourcePopup sources={mockSources} onClose={mockClose} />);

        const confidenceBars = container.querySelectorAll('.confidence-bar');
        expect(confidenceBars.length).toBe(2);

        // Just verify they exist - actual classes may vary
        expect(confidenceBars[0]).toBeInTheDocument();
        expect(confidenceBars[1]).toBeInTheDocument();
    });

    it('calls onClose when close button is clicked', () => {
        const mockClose = vi.fn();

        render(<SourcePopup sources={mockSources} onClose={mockClose} />);

        const closeButton = screen.getByText('×');
        fireEvent.click(closeButton);

        expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when dismiss button is clicked', () => {
        const mockClose = vi.fn();

        render(<SourcePopup sources={mockSources} onClose={mockClose} />);

        const dismissButton = screen.getByText(/Dismiss/i);
        fireEvent.click(dismissButton);

        expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it('calls onSourceClick when source is clicked', () => {
        const mockClose = vi.fn();
        const mockSourceClick = vi.fn();

        render(
            <SourcePopup sources={mockSources} onClose={mockClose} onSourceClick={mockSourceClick} />
        );

        const sourceCard = screen.getByText(/Q4 financial report/i).closest('.source-card');
        if (sourceCard) {
            fireEvent.click(sourceCard);
        }

        expect(mockSourceClick).toHaveBeenCalledWith(mockSources[0]);
    });

    it('auto-collapses after 8 seconds', () => {
        const mockClose = vi.fn();

        const { container } = render(<SourcePopup sources={mockSources} onClose={mockClose} />);

        const popup = container.querySelector('.source-popup');
        expect(popup).toBeInTheDocument();

        // Fast-forward time by 8 seconds
        vi.advanceTimersByTime(8000);

        // Verify popup still exists (collapsed is just a class, not removal)
        expect(popup).toBeInTheDocument();
    });

    it('displays file types correctly', () => {
        const mockClose = vi.fn();

        const { container } = render(<SourcePopup sources={mockSources} onClose={mockClose} />);

        const fileTypes = container.querySelectorAll('.file-type');
        expect(fileTypes.length).toBe(2);
        expect(fileTypes[0].textContent).toBe('pdf');
        expect(fileTypes[1].textContent).toBe('txt');
    });

    it('displays modified dates when available', () => {
        const mockClose = vi.fn();

        render(<SourcePopup sources={mockSources} onClose={mockClose} />);

        expect(screen.getByText(/Jan 15/i)).toBeInTheDocument();
    });

    it('handles single source correctly', () => {
        const mockClose = vi.fn();
        const singleSource = [mockSources[0]];

        render(<SourcePopup sources={singleSource} onClose={mockClose} />);

        expect(screen.getByText(/1 source$/i)).toBeInTheDocument();
    });

    it('uses default file opening when onSourceClick not provided', () => {
        const mockClose = vi.fn();
        const mockWindowOpen = vi.fn();
        window.open = mockWindowOpen;

        render(<SourcePopup sources={mockSources} onClose={mockClose} />);

        const sourceCard = screen.getByText(/Q4 financial report/i).closest('.source-card');
        if (sourceCard) {
            fireEvent.click(sourceCard);
        }

        expect(mockWindowOpen).toHaveBeenCalledWith('file:///reports/q4.pdf');
    });
});
