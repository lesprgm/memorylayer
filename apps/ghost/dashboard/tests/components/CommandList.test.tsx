import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CommandList } from '../../src/components/CommandList';
import type { CommandEntry } from '../../src/types';

const sample: CommandEntry[] = [
  {
    id: 'cmd-1',
    text: 'open the report',
    assistant_text: 'Opening the report',
    timestamp: new Date('2023-01-01T12:00:00Z').toISOString(),
    created_at: new Date('2023-01-01T12:00:00Z').toISOString(),
    actions: [
      {
        action: { type: 'file.open', params: { path: '/tmp/report.pdf' } },
        status: 'success' as const,
        created_at: new Date().toISOString(),
      },
    ],
    memories_used: [
      { id: 'mem-1', type: 'entity.file', score: 0.9, summary: 'Report.pdf', metadata: { path: '/tmp/report.pdf' } },
    ],
  },
];

describe('CommandList', () => {
  it('shows empty state when no commands exist', () => {
    render(<CommandList commands={[]} />);
    expect(screen.getByText(/No commands yet/i)).toBeInTheDocument();
  });

  it('renders command text and assistant response', () => {
    render(<CommandList commands={sample} />);
    expect(screen.getByText(/open the report/i)).toBeInTheDocument();
    expect(screen.getByText(/Opening the report/i)).toBeInTheDocument();
    expect(screen.getByText(/entity.file/i)).toBeInTheDocument();
    expect(screen.getByText(/file.open/i)).toBeInTheDocument();
  });
});
