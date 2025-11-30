import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import EntityView from '../EntityView'
import { createMockMemory } from '../../__tests__/testUtils'

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

// Mock API
vi.mock('../../lib/api', () => ({
    api: {
        getMemoryById: vi.fn(),
        getMemories: vi.fn(),
    },
}))

const { api } = await import('../../lib/api')

const mockProjectMemory = {
    id: 'project1',
    workspace_id: 'ws1',
    conversation_id: 'conv1',
    type: 'entity' as const,
    content: 'Project Alpha',
    confidence: 0.9,
    metadata: { entityType: 'project', description: 'Main project for Q1' },
    created_at: '2024-01-01T00:00:00Z',
}

const mockPersonMemory = {
    id: 'mem1',
    workspace_id: 'ws1',
    conversation_id: 'conv1',
    type: 'entity' as const,
    content: 'John Doe is the CEO',
    confidence: 0.9,
    metadata: {
        entityType: 'person',
        role: 'CEO'
    },
    created_at: '2024-01-01T00:00:00Z',
}

const mockRelatedMemories = [
    {
        id: 'mem2',
        workspace_id: 'ws1',
        conversation_id: 'conv1',
        type: 'entity' as const,
        content: 'Related memory 1',
        confidence: 0.8,
        metadata: {},
        created_at: '2024-01-02',
    },
    {
        id: 'memory2',
        workspace_id: 'ws1',
        conversation_id: 'conv2',
        type: 'decision' as const,
        content: 'Use TypeScript',
        confidence: 0.9,
        metadata: {},
        created_at: '2024-01-03T00:00:00Z',
    },
]

describe('ProjectView', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    const renderProjectView = (projectId = 'project1') => {
        return render(
            <MemoryRouter initialEntries={[`/project/${projectId}`]}>
                <Routes>
                    <Route path="/project/:id" element={<EntityView />} />
                </Routes>
            </MemoryRouter>
        )
    }

    describe('Basic Rendering', () => {
        it('renders project name', async () => {
            vi.mocked(api.getMemoryById).mockResolvedValue({ memory: mockProjectMemory })
            vi.mocked(api.getMemories).mockResolvedValue({
                memories: mockRelatedMemories,
                total: mockRelatedMemories.length,
            })

            renderProjectView()

            await waitFor(() => {
                expect(screen.getByText('Project Alpha')).toBeInTheDocument()
            })
        })

        it('renders back button', async () => {
            vi.mocked(api.getMemoryById).mockResolvedValue({ memory: mockProjectMemory })
            vi.mocked(api.getMemories).mockResolvedValue({
                memories: [],
                total: 0,
            })

            renderProjectView()

            await waitFor(() => {
                expect(screen.getByText(/Back to Memories/i)).toBeInTheDocument()
            })
        })

        it('displays project metadata', async () => {
            vi.mocked(api.getMemoryById).mockResolvedValue({ memory: mockProjectMemory })
            vi.mocked(api.getMemories).mockResolvedValue({
                memories: [],
                total: 0,
            })

            renderProjectView()

            await waitFor(() => {
                expect(screen.getByText(/Main project for Q1/i)).toBeInTheDocument()
            })
        })
    })

    describe('Related Memories', () => {
        it('displays related memories', async () => {
            vi.mocked(api.getMemoryById).mockResolvedValue({ memory: mockProjectMemory })
            vi.mocked(api.getMemories).mockResolvedValue({
                memories: mockRelatedMemories,
                total: mockRelatedMemories.length,
            })

            renderProjectView()

            await waitFor(() => {
                expect(screen.getByText('Budget is $100k')).toBeInTheDocument()
                expect(screen.getByText('Use TypeScript')).toBeInTheDocument()
            })
        })

        it('shows memory count', async () => {
            vi.mocked(api.getMemoryById).mockResolvedValue({ memory: mockProjectMemory })
            vi.mocked(api.getMemories).mockResolvedValue({
                memories: mockRelatedMemories,
                total: mockRelatedMemories.length,
            })

            renderProjectView()

            await waitFor(() => {
                expect(screen.getByText(/2.*memories/i)).toBeInTheDocument()
            })
        })

        it('shows empty state when no related memories', async () => {
            vi.mocked(api.getMemoryById).mockResolvedValue({ memory: mockProjectMemory })
            vi.mocked(api.getMemories).mockResolvedValue({
                memories: [],
                total: 0,
            })

            renderProjectView()

            await waitFor(() => {
                expect(screen.getByText(/No related memories/i)).toBeInTheDocument()
            })
        })
    })

    describe('Loading States', () => {
        it('shows loading indicator', () => {
            vi.mocked(api.getMemoryById).mockReturnValue(new Promise(() => { }))
            vi.mocked(api.getMemories).mockReturnValue(new Promise(() => { }))

            renderProjectView()

            expect(screen.getByText(/Loading/i)).toBeInTheDocument()
        })
    })

    describe('Error Handling', () => {
        it('shows error when project not found', async () => {
            vi.mocked(api.getMemoryById).mockResolvedValue({ memory: createMockMemory() })

            renderProjectView()

            await waitFor(() => {
                expect(screen.getByText(/not found/i)).toBeInTheDocument()
            })
        })

        it('shows error when API fails', async () => {
            vi.mocked(api.getMemoryById).mockRejectedValue(new Error('API Error'))

            renderProjectView()

            await waitFor(() => {
                expect(screen.getByText(/Failed/i)).toBeInTheDocument()
            })
        })
    })

    describe('API Integration', () => {
        it('calls getMemoryById with correct project ID', async () => {
            vi.mocked(api.getMemoryById).mockResolvedValue({ memory: mockProjectMemory })
            vi.mocked(api.getMemories).mockResolvedValue({
                memories: [],
                total: 0,
            })

            renderProjectView('project1')

            await waitFor(() => {
                expect(api.getMemoryById).toHaveBeenCalledWith('project1', 'ws1')
            })
        })

        it('calls getMemories to fetch related memories', async () => {
            vi.mocked(api.getMemoryById).mockResolvedValue({ memory: mockProjectMemory })
            vi.mocked(api.getMemories).mockResolvedValue({
                memories: mockRelatedMemories,
                total: mockRelatedMemories.length,
            })

            renderProjectView()

            await waitFor(() => {
                expect(api.getMemories).toHaveBeenCalledWith(
                    expect.objectContaining({
                        workspaceId: 'ws1',
                        search: 'Project Alpha',
                    })
                )
            })
        })
    })
})

describe('PersonView', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    const renderPersonView = (personId = 'person1') => {
        return render(
            <MemoryRouter initialEntries={[`/person/${personId}`]}>
                <Routes>
                    <Route path="/person/:id" element={<EntityView />} />
                </Routes>
            </MemoryRouter>
        )
    }

    describe('Basic Rendering', () => {
        it('renders person name', async () => {
            vi.mocked(api.getMemoryById).mockResolvedValue({ memory: mockPersonMemory })
            vi.mocked(api.getMemories).mockResolvedValue({
                memories: mockRelatedMemories,
                total: mockRelatedMemories.length,
            })

            renderPersonView()

            await waitFor(() => {
                expect(screen.getByText('John Doe')).toBeInTheDocument()
            })
        })

        it('renders back button', async () => {
            vi.mocked(api.getMemoryById).mockResolvedValue({ memory: mockPersonMemory })
            vi.mocked(api.getMemories).mockResolvedValue({
                memories: [],
                total: 0,
            })

            renderPersonView()

            await waitFor(() => {
                expect(screen.getByText(/Back to Memories/i)).toBeInTheDocument()
            })
        })

        it('displays person metadata', async () => {
            vi.mocked(api.getMemoryById).mockResolvedValue({ memory: mockPersonMemory })
            vi.mocked(api.getMemories).mockResolvedValue({
                memories: [],
                total: 0,
            })

            renderPersonView()

            await waitFor(() => {
                expect(screen.getByText(/Engineer/i)).toBeInTheDocument()
            })
        })
    })

    describe('Related Memories', () => {
        it('displays related memories', async () => {
            vi.mocked(api.getMemoryById).mockResolvedValue({ memory: mockPersonMemory })
            vi.mocked(api.getMemories).mockResolvedValue({
                memories: mockRelatedMemories,
                total: mockRelatedMemories.length,
            })

            renderPersonView()

            await waitFor(() => {
                expect(screen.getByText('Budget is $100k')).toBeInTheDocument()
                expect(screen.getByText('Use TypeScript')).toBeInTheDocument()
            })
        })

        it('shows empty state when no related memories', async () => {
            vi.mocked(api.getMemoryById).mockResolvedValue({ memory: mockPersonMemory })
            vi.mocked(api.getMemories).mockResolvedValue({
                memories: [],
                total: 0,
            })

            renderPersonView()

            await waitFor(() => {
                expect(screen.getByText(/No related memories/i)).toBeInTheDocument()
            })
        })
    })

    describe('Loading States', () => {
        it('shows loading indicator', () => {
            vi.mocked(api.getMemoryById).mockReturnValue(new Promise(() => { }))
            vi.mocked(api.getMemories).mockReturnValue(new Promise(() => { }))

            renderPersonView()

            expect(screen.getByText(/Loading/i)).toBeInTheDocument()
        })
    })

    describe('Error Handling', () => {
        it('shows error when person not found', async () => {
            vi.mocked(api.getMemoryById).mockResolvedValue({ memory: createMockMemory() })

            renderPersonView()

            await waitFor(() => {
                expect(screen.getByText(/not found/i)).toBeInTheDocument()
            })
        })

        it('shows error when API fails', async () => {
            vi.mocked(api.getMemoryById).mockRejectedValue(new Error('API Error'))

            renderPersonView()

            await waitFor(() => {
                expect(screen.getByText(/Failed/i)).toBeInTheDocument()
            })
        })
    })

    describe('API Integration', () => {
        it('calls getMemoryById with correct person ID', async () => {
            vi.mocked(api.getMemoryById).mockResolvedValue({ memory: mockPersonMemory })
            vi.mocked(api.getMemories).mockResolvedValue({
                memories: [],
                total: 0,
            })

            renderPersonView('person1')

            await waitFor(() => {
                expect(api.getMemoryById).toHaveBeenCalledWith('person1', 'ws1')
            })
        })

        it('calls getMemories to fetch related memories', async () => {
            vi.mocked(api.getMemoryById).mockResolvedValue({ memory: mockPersonMemory })
            vi.mocked(api.getMemories).mockResolvedValue({
                memories: mockRelatedMemories,
                total: mockRelatedMemories.length,
            })

            renderPersonView()

            await waitFor(() => {
                expect(api.getMemories).toHaveBeenCalledWith(
                    expect.objectContaining({
                        workspaceId: 'ws1',
                        search: 'John Doe',
                    })
                )
            })
        })
    })
})
