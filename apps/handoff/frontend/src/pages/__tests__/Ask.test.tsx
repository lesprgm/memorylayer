import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Ask from '../Ask'

// Mock contexts
vi.mock('../../contexts/AuthContext', () => ({
    useAuth: () => ({
        user: { id: 'user1', email: 'test@example.com', name: 'Test User' },
        isAuthenticated: true,
        isLoading: false,
        login: vi.fn(),
        signup: vi.fn(),
        logout: vi.fn(),
    }),
}))

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

// Mock react-router-dom navigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom')
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    }
})

// Mock API
vi.mock('../../lib/api', () => ({
    api: {
        getMemories: vi.fn(),
    },
}))

const { api } = await import('../../lib/api')

// Mock hooks
const mockCreateConversation = {
    mutateAsync: vi.fn().mockResolvedValue({ conversation: { id: 'new-conv-id' } })
}

vi.mock('../../hooks/useChatConversation', () => ({
    useChatConversations: vi.fn(() => ({
        data: {
            conversations: [
                { id: '1', title: 'Test Conversation 1' },
                { id: '2', title: 'Test Conversation 2' }
            ]
        }
    })),
    useChatConversation: vi.fn(() => ({
        data: {
            conversation: {
                messages: []
            }
        }
    })),
    useCreateChatConversation: vi.fn(() => mockCreateConversation)
}))

// Import QueryClient for test setup
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const createTestQueryClient = () =>
    new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
            },
        },
    })

const renderWithRouter = (component: React.ReactElement) => {
    const queryClient = createTestQueryClient()
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>{component}</MemoryRouter>
        </QueryClientProvider>
    )
}

const mockMemories = [
    {
        id: 'entity1',
        workspace_id: 'ws1',
        conversation_id: 'conv1',
        type: 'entity' as const,
        content: 'Project Alpha discussion',
        confidence: 0.9,
        metadata: { entityType: 'project' },
        created_at: '2024-01-01T00:00:00Z',
    },
    {
        id: 'fact1',
        workspace_id: 'ws1',
        conversation_id: 'conv1',
        type: 'fact' as const,
        content: 'Budget set to $100k for Q1',
        confidence: 0.85,
        metadata: {},
        created_at: '2024-01-02T00:00:00Z',
    },
    {
        id: 'decision1',
        workspace_id: 'ws1',
        conversation_id: 'conv1',
        type: 'decision' as const,
        content: 'Decided to use TypeScript',
        confidence: 0.95,
        metadata: {},
        created_at: '2024-01-03T00:00:00Z',
    },
]

describe('Ask Page', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockNavigate.mockClear()
        window.HTMLElement.prototype.scrollIntoView = vi.fn()
    })

    describe('Basic Rendering', () => {
        it('renders the assistant page header', () => {
            renderWithRouter(<Ask />)

            expect(screen.getByText('AI Assistant')).toBeInTheDocument()
            expect(screen.getByText(/Ask questions about your memories/i)).toBeInTheDocument()
        })

        it('renders search input', () => {
            renderWithRouter(<Ask />)

            expect(screen.getByPlaceholderText(/Ask about your memories/i)).toBeInTheDocument()
        })

        it('renders search button', () => {
            renderWithRouter(<Ask />)

            const searchButton = screen.getByRole('button', { name: /search/i })
            expect(searchButton).toBeInTheDocument()
        })
    })

    describe('Search Functionality', () => {
        it('performs search when search button is clicked', async () => {
            const user = userEvent.setup()
            vi.mocked(api.getMemories).mockResolvedValue({
                memories: mockMemories,
                total: mockMemories.length,
            })

            renderWithRouter(<Ask />)

            const searchInput = screen.getByPlaceholderText(/Ask about your memories/i)
            const searchButton = screen.getByRole('button', { name: /search/i })

            await user.type(searchInput, 'project alpha')
            await user.click(searchButton)

            await waitFor(() => {
                expect(api.getMemories).toHaveBeenCalledWith(
                    expect.objectContaining({
                        workspaceId: 'ws1',
                        search: 'project alpha',
                    })
                )
            })
        })

        it('performs search on Enter key press', async () => {
            const user = userEvent.setup()
            vi.mocked(api.getMemories).mockResolvedValue({
                memories: mockMemories,
                total: mockMemories.length,
            })

            renderWithRouter(<Ask />)

            const searchInput = screen.getByPlaceholderText(/Ask about your memories/i)

            await user.type(searchInput, 'budget{Enter}')

            await waitFor(() => {
                expect(api.getMemories).toHaveBeenCalledWith(
                    expect.objectContaining({
                        search: 'budget',
                    })
                )
            })
        })

        it('displays search results', async () => {
            const user = userEvent.setup()
            vi.mocked(api.getMemories).mockResolvedValue({
                memories: mockMemories,
                total: mockMemories.length,
            })

            renderWithRouter(<Ask />)

            const searchInput = screen.getByPlaceholderText(/Ask about your memories/i)
            await user.type(searchInput, 'project{Enter}')

            await waitFor(() => {
                expect(screen.getByText('Project Alpha discussion')).toBeInTheDocument()
                expect(screen.getByText('Budget set to $100k for Q1')).toBeInTheDocument()
                expect(screen.getByText('Decided to use TypeScript')).toBeInTheDocument()
            })
        })

        it('displays memory type badges in results', async () => {
            const user = userEvent.setup()
            vi.mocked(api.getMemories).mockResolvedValue({
                memories: mockMemories,
                total: mockMemories.length,
            })

            renderWithRouter(<Ask />)

            const searchInput = screen.getByPlaceholderText(/Ask about your memories/i)
            await user.type(searchInput, 'test{Enter}')

            await waitFor(() => {
                const badges = screen.getAllByText(/entity|fact|decision/i)
                expect(badges.length).toBeGreaterThan(0)
            })
        })

        it('displays confidence scores in results', async () => {
            const user = userEvent.setup()
            vi.mocked(api.getMemories).mockResolvedValue({
                memories: mockMemories,
                total: mockMemories.length,
            })

            renderWithRouter(<Ask />)

            const searchInput = screen.getByPlaceholderText(/Ask about your memories/i)
            await user.type(searchInput, 'test{Enter}')

            await waitFor(() => {
                expect(screen.getByText('90%')).toBeInTheDocument()
                expect(screen.getByText('85%')).toBeInTheDocument()
                expect(screen.getByText('95%')).toBeInTheDocument()
            })
        })

        it('displays dates in results', async () => {
            const user = userEvent.setup()
            vi.mocked(api.getMemories).mockResolvedValue({
                memories: mockMemories,
                total: mockMemories.length,
            })

            renderWithRouter(<Ask />)

            const searchInput = screen.getByPlaceholderText(/Ask about your memories/i)
            await user.type(searchInput, 'test{Enter}')

            await waitFor(() => {
                const dates = screen.getAllByText(/Jan|2024/i)
                expect(dates.length).toBeGreaterThan(0)
            })
        })
    })

    describe('Create Brief Action', () => {
        it('shows "Create Brief" button when memories are found', async () => {
            const user = userEvent.setup()
            vi.mocked(api.getMemories).mockResolvedValue({
                memories: mockMemories,
                total: mockMemories.length,
            })

            renderWithRouter(<Ask />)

            const searchInput = screen.getByPlaceholderText(/Ask about your memories/i)
            await user.type(searchInput, 'project{Enter}')

            await waitFor(() => {
                expect(screen.getByText('Create Brief')).toBeInTheDocument()
            })
        })

        it('navigates to briefs page with query parameter when "Create Brief" is clicked', async () => {
            const user = userEvent.setup()
            vi.mocked(api.getMemories).mockResolvedValue({
                memories: mockMemories,
                total: mockMemories.length,
            })

            renderWithRouter(<Ask />)

            const searchInput = screen.getByPlaceholderText(/Ask about your memories/i)
            await user.type(searchInput, 'project alpha{Enter}')

            await waitFor(() => {
                expect(screen.getByText('Create Brief')).toBeInTheDocument()
            })

            const createBriefButton = screen.getByText('Create Brief')
            await user.click(createBriefButton)

            expect(mockNavigate).toHaveBeenCalledWith('/briefs?query=project alpha')
        })

        it('does not show "Create Brief" button when no results', async () => {
            const user = userEvent.setup()
            vi.mocked(api.getMemories).mockResolvedValue({
                memories: [],
                total: 0,
            })

            renderWithRouter(<Ask />)

            const searchInput = screen.getByPlaceholderText(/Ask about your memories/i)
            await user.type(searchInput, 'nonexistent{Enter}')

            await waitFor(() => {
                expect(screen.queryByText('Create Brief')).not.toBeInTheDocument()
            })
        })
    })

    describe('Copy Context Action', () => {
        it('has copy context button when results are shown', async () => {
            const user = userEvent.setup()
            vi.mocked(api.getMemories).mockResolvedValue({
                memories: mockMemories,
                total: mockMemories.length,
            })

            renderWithRouter(<Ask />)

            const searchInput = screen.getByPlaceholderText(/Ask about your memories/i)
            await user.type(searchInput, 'test{Enter}')

            await waitFor(() => {
                expect(screen.getByText(/Copy context/i)).toBeInTheDocument()
            })
        })

        it('copies context to clipboard when clicked', async () => {
            const user = userEvent.setup()
            vi.mocked(api.getMemories).mockResolvedValue({
                memories: mockMemories,
                total: mockMemories.length,
            })

            // Mock clipboard API
            const writeTextMock = vi.fn().mockResolvedValue(undefined)
            Object.defineProperty(navigator, 'clipboard', {
                value: {
                    writeText: writeTextMock,
                },
                writable: true,
            })

            renderWithRouter(<Ask />)

            const searchInput = screen.getByPlaceholderText(/Ask about your memories/i)
            await user.type(searchInput, 'test{Enter}')

            await waitFor(() => {
                expect(screen.getByText(/Copy context/i)).toBeInTheDocument()
            })

            const copyButton = screen.getByText(/Copy context/i)
            await user.click(copyButton)

            await waitFor(() => {
                expect(navigator.clipboard.writeText).toHaveBeenCalled()
            })
        })

        it('shows "Copied!" feedback after copying', async () => {
            const user = userEvent.setup()
            vi.mocked(api.getMemories).mockResolvedValue({
                memories: mockMemories,
                total: mockMemories.length,
            })

            // Mock clipboard API
            const writeTextMock = vi.fn().mockResolvedValue(undefined)
            Object.defineProperty(navigator, 'clipboard', {
                value: {
                    writeText: writeTextMock,
                },
                writable: true,
            })

            renderWithRouter(<Ask />)

            const searchInput = screen.getByPlaceholderText(/Ask about your memories/i)
            await user.type(searchInput, 'test{Enter}')

            await waitFor(() => {
                expect(screen.getByText(/Copy context/i)).toBeInTheDocument()
            })

            const copyButton = screen.getByText(/Copy context/i)
            await user.click(copyButton)

            await waitFor(() => {
                expect(screen.getByText('Copied!')).toBeInTheDocument()
            })
        })
    })

    describe('Empty States', () => {
        it('displays empty state before search', () => {
            renderWithRouter(<Ask />)

            expect(screen.getByText(/Ask questions about your memories/i)).toBeInTheDocument()
        })

        it('displays no results message when search returns empty', async () => {
            const user = userEvent.setup()
            vi.mocked(api.getMemories).mockResolvedValue({
                memories: [],
                total: 0,
            })

            renderWithRouter(<Ask />)

            const searchInput = screen.getByPlaceholderText(/Ask about your memories/i)
            await user.type(searchInput, 'nonexistent query{Enter}')

            await waitFor(() => {
                expect(screen.getByText(/No memories found/i)).toBeInTheDocument()
            })
        })
    })

    describe('Loading States', () => {
        it('displays loading indicator while searching', async () => {
            const user = userEvent.setup()
            vi.mocked(api.getMemories).mockReturnValue(new Promise(() => { })) // Never resolves

            renderWithRouter(<Ask />)

            const searchInput = screen.getByPlaceholderText(/Ask about your memories/i)
            await user.type(searchInput, 'test{Enter}')

            await waitFor(() => {
                expect(screen.getByText(/Searching/i)).toBeInTheDocument()
            })
        })
    })

    describe('Error Handling', () => {
        it('displays error message when search fails', async () => {
            const user = userEvent.setup()
            vi.mocked(api.getMemories).mockRejectedValue(new Error('Search failed'))

            renderWithRouter(<Ask />)

            const searchInput = screen.getByPlaceholderText(/Ask about your memories/i)
            await user.type(searchInput, 'test{Enter}')

            await waitFor(() => {
                expect(screen.getByText(/Failed/i)).toBeInTheDocument()
            })
        })
    })

    describe('View Source Links', () => {
        it('displays "View source" links for each memory', async () => {
            const user = userEvent.setup()
            vi.mocked(api.getMemories).mockResolvedValue({
                memories: mockMemories,
                total: mockMemories.length,
            })

            renderWithRouter(<Ask />)

            const searchInput = screen.getByPlaceholderText(/Ask about your memories/i)
            await user.type(searchInput, 'test{Enter}')

            await waitFor(() => {
                const viewSourceLinks = screen.getAllByText(/View source/i)
                expect(viewSourceLinks.length).toBe(mockMemories.length)
            })
        })
    })
})
