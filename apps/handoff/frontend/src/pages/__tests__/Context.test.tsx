import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Context from '../Context'

// Mock contexts
vi.mock('../../contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    currentWorkspace: {
      id: 'ws1',
      name: 'Test Workspace',
      type: 'personal',
      owner_id: 'user1',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
  }),
}))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    user: { id: 'user1', email: 'test@example.com', name: 'Test User' },
  }),
}))

// Mock API
vi.mock('../../lib/api', () => ({
  api: {
    getMemories: vi.fn(),
    updateMemory: vi.fn(),
  },
}))

const { api } = await import('../../lib/api')

const renderWithRouter = (component: React.ReactElement) => {
  return render(<MemoryRouter>{component}</MemoryRouter>)
}

const mockMemories = [
  {
    id: 'entity1',
    workspace_id: 'ws1',
    conversation_id: 'conv1',
    type: 'entity' as const,
    content: 'Test Project',
    confidence: 0.9,
    metadata: { entityType: 'project' },
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'fact1',
    workspace_id: 'ws1',
    conversation_id: 'conv1',
    type: 'fact' as const,
    content: 'Important fact',
    confidence: 0.85,
    metadata: {},
    created_at: '2024-01-02T00:00:00Z',
  },
  {
    id: 'decision1',
    workspace_id: 'ws1',
    conversation_id: 'conv1',
    type: 'decision' as const,
    content: 'Strategic decision',
    confidence: 0.95,
    metadata: { pinned: true },
    created_at: '2024-01-03T00:00:00Z',
  },
]

describe('Context Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getMemories).mockResolvedValue({
      memories: mockMemories,
      total: mockMemories.length,
    })
  })

  describe('Basic Rendering', () => {
    it('renders the memories page header', async () => {
      renderWithRouter(<Context />)

      await waitFor(() => {
        expect(screen.getByText('Context')).toBeInTheDocument()
      })
    })

    it('displays memory content', async () => {
      renderWithRouter(<Context />)

      await waitFor(() => {
        expect(screen.getByText('Test Project')).toBeInTheDocument()
        expect(screen.getByText('Important fact')).toBeInTheDocument()
        expect(screen.getByText('Strategic decision')).toBeInTheDocument()
      })
    })

    it('displays confidence percentages', async () => {
      renderWithRouter(<Context />)

      await waitFor(() => {
        expect(screen.getByText('90%')).toBeInTheDocument()
        expect(screen.getByText('85%')).toBeInTheDocument()
        expect(screen.getByText('95%')).toBeInTheDocument()
      })
    })

    it('renders filter buttons', async () => {
      renderWithRouter(<Context />)

      await waitFor(() => {
        expect(screen.getByText('All')).toBeInTheDocument()
        expect(screen.getByText('People')).toBeInTheDocument()
        expect(screen.getByText('Projects')).toBeInTheDocument()
        expect(screen.getByText('Decisions')).toBeInTheDocument()
        expect(screen.getByText('Facts')).toBeInTheDocument()
      })
    })
  })

  describe('Empty States', () => {
    it('displays empty state when no memories', async () => {
      vi.mocked(api.getMemories).mockResolvedValue({
        memories: [],
        total: 0,
      })

      renderWithRouter(<Context />)

      await waitFor(() => {
        expect(screen.getByText(/no memories/i)).toBeInTheDocument()
      })
    })
  })

  describe('Loading States', () => {
    it('displays loading indicator while fetching', () => {
      vi.mocked(api.getMemories).mockReturnValue(new Promise(() => { }))

      renderWithRouter(<Context />)

      expect(screen.getByText(/loading/i)).toBeInTheDocument()
    })
  })

  describe('Error Handling', () => {
    it('displays error message when fetch fails', async () => {
      vi.mocked(api.getMemories).mockRejectedValue(new Error('Failed to fetch'))

      renderWithRouter(<Context />)

      await waitFor(() => {
        expect(screen.getByText(/failed/i)).toBeInTheDocument()
      })
    })
  })

  describe('API Integration', () => {
    it('calls getMemories API on mount', async () => {
      renderWithRouter(<Context />)

      await waitFor(() => {
        expect(api.getMemories).toHaveBeenCalledWith(
          expect.objectContaining({
            workspaceId: 'ws1',
          })
        )
      })
    })
  })
})
