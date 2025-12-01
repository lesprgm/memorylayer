import { render } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import type { ReactElement } from 'react'
import type { Memory } from '../lib/api'

/**
 * Test Utilities for Handoff Frontend
 */

/**
 * Renders a component wrapped with all necessary providers
 */
export function renderWithProviders(ui: ReactElement) {
    return render(<BrowserRouter>{ui} </BrowserRouter>)
}

/**
 * Creates a mock Memory object for testing
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
 * Creates multiple mock memories for testing
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

/**
 * Waits for an API call to complete
 */
export async function waitForApiCall(apiMock: { mock: { calls: unknown[] } }, callIndex = 0) {
    return new Promise((resolve) => {
        const checkCall = () => {
            if (apiMock.mock.calls.length > callIndex) {
                resolve(apiMock.mock.calls[callIndex])
            } else {
                setTimeout(checkCall, 10)
            }
        }
        checkCall()
    })
}

/**
 * Mock workspace for testing
 */
export const mockWorkspace = {
    id: 'test-workspace',
    name: 'Test Workspace',
    type: 'personal' as const,
    owner_id: 'test-user',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
}

/**
 * Mock user for testing
 */
export const mockUser = {
    id: 'test-user',
    email: 'test@example.com',
    name: 'Test User',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
}
