import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import WorkspaceSwitcher from '../WorkspaceSwitcher'
import { WorkspaceProvider } from '../../contexts/WorkspaceContext'
import { AuthProvider } from '../../contexts/AuthContext'
import { BrowserRouter } from 'react-router-dom'

// Mock workspace data
const mockWorkspaces = [
  {
    id: '1',
    name: 'Personal Workspace',
    type: 'personal' as const,
    owner_id: 'user1',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: '2',
    name: 'Team Workspace',
    type: 'team' as const,
    owner_id: 'user1',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
]

// Mock the useWorkspace hook
vi.mock('../../contexts/WorkspaceContext', async () => {
  const actual = await vi.importActual('../../contexts/WorkspaceContext')
  return {
    ...actual,
    useWorkspace: () => ({
      workspaces: mockWorkspaces,
      currentWorkspace: mockWorkspaces[0],
      switchWorkspace: vi.fn(),
      isSwitching: false,
    }),
  }
})

// Mock AuthContext
vi.mock('../../contexts/AuthContext', async () => {
  const actual = await vi.importActual('../../contexts/AuthContext')
  return {
    ...actual,
    useAuth: () => ({
      isAuthenticated: true,
      user: { id: 'user1', email: 'test@example.com', name: 'Test User' },
    }),
  }
})

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <BrowserRouter>
      <AuthProvider>
        <WorkspaceProvider>
          {component}
        </WorkspaceProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

describe('WorkspaceSwitcher', () => {
  it('displays the current workspace name', () => {
    renderWithProviders(<WorkspaceSwitcher />)
    expect(screen.getByText('Personal Workspace')).toBeInTheDocument()
  })

  it('opens dropdown when clicked', async () => {
    renderWithProviders(<WorkspaceSwitcher />)
    
    const button = screen.getByRole('button', { name: /Personal Workspace/i })
    fireEvent.click(button)
    
    await waitFor(() => {
      expect(screen.getByText('Your Workspaces')).toBeInTheDocument()
    })
  })

  it('displays all workspaces in dropdown', async () => {
    renderWithProviders(<WorkspaceSwitcher />)
    
    const button = screen.getByRole('button', { name: /Personal Workspace/i })
    fireEvent.click(button)
    
    await waitFor(() => {
      expect(screen.getAllByText('Personal Workspace')).toHaveLength(2) // Button + dropdown
      expect(screen.getByText('Team Workspace')).toBeInTheDocument()
    })
  })

  it('shows workspace type labels', async () => {
    renderWithProviders(<WorkspaceSwitcher />)
    
    const button = screen.getByRole('button', { name: /Personal Workspace/i })
    fireEvent.click(button)
    
    await waitFor(() => {
      const typeLabels = screen.getAllByText(/personal|team/i)
      expect(typeLabels.length).toBeGreaterThan(0)
    })
  })

  it('shows create workspace button', async () => {
    renderWithProviders(<WorkspaceSwitcher />)
    
    const button = screen.getByRole('button', { name: /Personal Workspace/i })
    fireEvent.click(button)
    
    await waitFor(() => {
      expect(screen.getByText('Create Workspace')).toBeInTheDocument()
    })
  })
})
