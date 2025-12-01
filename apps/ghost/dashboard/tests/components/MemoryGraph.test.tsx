import { render } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryGraph } from '../../src/components/MemoryGraph';
import type { GraphData } from '../../src/components/MemoryGraph';

// Mock fetch
global.fetch = vi.fn();

describe('MemoryGraph', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const sampleGraphData: GraphData = {
        nodes: [
            { id: 'query', type: 'query', label: 'Test query' },
            { id: 'memory-1', type: 'memory', label: 'Sample memory', confidence: 0.9 },
            { id: 'file-1', type: 'file', label: '/path/to/file.txt' },
            { id: 'entity-1', type: 'entity', label: 'Test Entity' },
        ],
        edges: [
            { source: 'query', target: 'memory-1', weight: 0.9 },
            { source: 'memory-1', target: 'file-1', weight: 0.8 },
            { source: 'memory-1', target: 'entity-1', weight: 0.7 },
        ],
    };

    it('renders the graph SVG element', () => {
        const { container } = render(<MemoryGraph data={sampleGraphData} />);
        const svg = container.querySelector('svg');
        expect(svg).toBeInTheDocument();
    });

    it('renders nodes based on data', () => {
        const { container } = render(<MemoryGraph data={sampleGraphData} />);
        const circles = container.querySelectorAll('circle');
        expect(circles.length).toBe(sampleGraphData.nodes.length);
    });

    it('renders edges based on data', () => {
        const { container } = render(<MemoryGraph data={sampleGraphData} />);
        const lines = container.querySelectorAll('line');
        expect(lines.length).toBe(sampleGraphData.edges.length);
    });

    it('file nodes have pointer cursor', () => {
        const { container } = render(<MemoryGraph data={sampleGraphData} />);
        const circles = container.querySelectorAll('circle');

        // Find the file node (3rd node in our sample data)
        const fileNode = circles[2];
        const cursorStyle = window.getComputedStyle(fileNode).cursor;
        expect(cursorStyle).toBe('pointer');
    });

    it('handles empty graph data', () => {
        const emptyData: GraphData = { nodes: [], edges: [] };
        const { container } = render(<MemoryGraph data={emptyData} />);
        const svg = container.querySelector('svg');
        expect(svg).toBeInTheDocument();
    });

    it('updates graph when data changes', () => {
        const { container, rerender } = render(<MemoryGraph data={sampleGraphData} />);

        const newData: GraphData = {
            nodes: [{ id: 'query', type: 'query', label: 'New query' }],
            edges: [],
        };

        rerender(<MemoryGraph data={newData} />);
        const circles = container.querySelectorAll('circle');
        expect(circles.length).toBe(1);
    });
});
