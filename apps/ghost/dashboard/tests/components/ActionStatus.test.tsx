import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ActionStatus } from '../../src/components/ActionStatus';

describe('ActionStatus', () => {
  it('shows success pill and hides error for success action', () => {
    render(
      <ActionStatus
        result={{
          action: { type: 'info.recall', params: { summary: 'Hello' } },
          status: 'success',
          created_at: new Date().toISOString(),
        }}
      />
    );

    expect(screen.getByText(/info.recall/i)).toBeInTheDocument();
    expect(screen.getByText(/success/i)).toBeInTheDocument();
    expect(screen.queryByText(/failed/i)).not.toBeInTheDocument();
  });

  it('shows failure pill and error message when failed', () => {
    render(
      <ActionStatus
        result={{
          action: { type: 'file.open', params: { path: '/tmp/missing.pdf' } },
          status: 'failed',
          created_at: new Date().toISOString(),
          error: 'File not found',
        }}
      />
    );

    expect(screen.getByText(/file.open/i)).toBeInTheDocument();
    expect(screen.getByText(/failed/i)).toBeInTheDocument();
    expect(screen.getByText(/File not found/i)).toBeInTheDocument();
  });

  it('renders summarize action details', () => {
    render(
      <ActionStatus
        result={{
          action: {
            type: 'info.summarize',
            params: { topic: 'API redesign', sources: ['mem-1', 'mem-2'], format: 'timeline' },
          },
          status: 'success',
          created_at: new Date().toISOString(),
        }}
      />
    );

    expect(screen.getByText(/info.summarize/i)).toBeInTheDocument();
    expect(screen.getByText(/topic/i)).toBeInTheDocument();
    expect(screen.getByText(/sources/i)).toBeInTheDocument();
    expect(screen.getByText(/timeline/i)).toBeInTheDocument();
  });
});
