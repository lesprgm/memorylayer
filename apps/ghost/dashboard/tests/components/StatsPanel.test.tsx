import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatsPanel } from '../../src/components/StatsPanel';

describe('StatsPanel', () => {
  it('renders key metrics', () => {
    render(<StatsPanel stats={{ totalCommands: 5, totalMemories: 12, successRate: 0.66 }} />);

    expect(screen.getByText(/Commands/i)).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText(/Memories/i)).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText(/66%/i)).toBeInTheDocument();
  });
});
