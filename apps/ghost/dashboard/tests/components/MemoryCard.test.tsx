import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryCard } from '../../src/components/MemoryCard';

describe('MemoryCard', () => {
  it('renders type, score, and summary', () => {
    render(
      <MemoryCard
        memory={{
          id: 'mem-1',
          type: 'entity.file',
          score: 0.876,
          summary: 'Report.pdf updated yesterday',
        }}
      />
    );

    expect(screen.getByText(/entity.file/i)).toBeInTheDocument();
    expect(screen.getByText(/88%/i)).toBeInTheDocument();
    expect(screen.getByText(/Report.pdf updated yesterday/)).toBeInTheDocument();
  });
});
