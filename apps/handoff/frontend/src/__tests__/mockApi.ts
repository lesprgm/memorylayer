import { vi } from 'vitest'
import type { Memory } from '../lib/api'

/**
 * Mock API Client for Frontend Testing
 * Provides reusable mock implementations for all API endpoints
 */

export class MockApiClient {
    // Memory mocks
    getMemories = vi.fn()
    getMemoryById = vi.fn()
    updateMemory = vi.fn()

    // Conversation mocks
    getConversations = vi.fn()
    getConversationById = vi.fn()

    // Handoff mocks
    getHandoffExport = vi.fn()

    // Auth mocks
    login = vi.fn()
    signup = vi.fn()
    getCurrentUser = vi.fn()
    logout = vi.fn()

    // Workspace mocks
    getWorkspaces = vi.fn()
    createWorkspace = vi.fn()
    addWorkspaceMember = vi.fn()
    getWorkspaceMembers = vi.fn()
    deleteWorkspace = vi.fn()

    // Import mocks
    importFile = vi.fn()
    getImportStatus = vi.fn()

    // Activity mocks
    getActivities = vi.fn()

    // Export mocks
    exportWorkspaceData = vi.fn()

    /**
     * Reset all mocks
     */
    reset() {
        vi.clearAllMocks()
    }

    /**
     * Setup default successful responses
     */
    setupDefaults() {
        this.getMemories.mockResolvedValue({ memories: [], total: 0 })
        this.getMemoryById.mockResolvedValue({ memory: null })
        this.updateMemory.mockResolvedValue({ memory: null })
        this.getConversations.mockResolvedValue({ conversations: [], total: 0 })
        this.getConversationById.mockResolvedValue({
            conversation: null,
            messages: [],
            memories: [],
        })
        this.getHandoffExport.mockResolvedValue({ handoff: '' })
        this.getActivities.mockResolvedValue({ activities: [], total: 0 })
    }

    /**
     * Setup memory responses with test data
     */
    setupMemories(memories: Memory[]) {
        this.getMemories.mockResolvedValue({
            memories,
            total: memories.length,
        })

        // Setup individual memory lookups
        memories.forEach(memory => {
            this.getMemoryById.mockImplementation((id: string) => {
                if (id === memory.id) {
                    return Promise.resolve({ memory })
                }
                return Promise.resolve({ memory: null })
            })
        })
    }

    /**
     * Setup error responses
     */
    setupErrors(errorMessage = 'API Error') {
        const error = new Error(errorMessage)
        this.getMemories.mockRejectedValue(error)
        this.getMemoryById.mockRejectedValue(error)
        this.updateMemory.mockRejectedValue(error)
        this.getConversations.mockRejectedValue(error)
        this.getConversationById.mockRejectedValue(error)
    }

    /**
     * Setup loading state (never resolving promises)
     */
    setupLoading() {
        const neverResolve = () => new Promise(() => { })
        this.getMemories.mockReturnValue(neverResolve())
        this.getMemoryById.mockReturnValue(neverResolve())
        this.getConversations.mockReturnValue(neverResolve())
    }

    /**
     * Setup optimistic update simulation
     */
    setupOptimisticUpdate(memory: Memory, delay = 100) {
        this.updateMemory.mockImplementation(
            (_id: string, _workspaceId: string, updates: Partial<Memory>) => {
                return new Promise(resolve => {
                    setTimeout(() => {
                        resolve({
                            memory: {
                                ...memory,
                                ...updates,
                            },
                        })
                    }, delay)
                })
            }
        )
    }
}

/**
 * Create a new mock API client instance
 */
export function createMockApi(): MockApiClient {
    const mock = new MockApiClient()
    mock.setupDefaults()
    return mock
}

/**
 * Helper to create mock memory data
 */
export function createMockMemory(overrides: Partial<Memory> = {}): Memory {
    return {
        id: crypto.randomUUID(),
        workspace_id: 'test-workspace',
        conversation_id: 'test-conversation',
        type: 'fact',
        content: 'Test memory content',
        confidence: 0.9,
        metadata: {},
        created_at: new Date().toISOString(),
        ...overrides,
    }
}

/**
 * Helper to create multiple mock memories
 */
export function createMockMemories(count: number, overrides: Partial<Memory> = {}): Memory[] {
    return Array.from({ length: count }, (_, i) =>
        createMockMemory({
            ...overrides,
            id: `memory-${i}`,
            content: `Test memory ${i}`,
        })
    )
}
