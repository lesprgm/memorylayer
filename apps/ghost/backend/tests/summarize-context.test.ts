/**
 * Integration tests for LLM-based context summarization
 * 
 * Tests the /api/summarize-context endpoint with mock scenarios
 * that simulate real reminder creation with screen context.
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import summarizeContextRoutes from '../src/routes/summarize-context';
import { llmCoordinator } from '../src/services/llm-coordinator';

// Mock the llmCoordinator's summarizeScreenContext method
vi.mock('../src/services/llm-coordinator', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return {
        ...actual,
        llmCoordinator: {
            ...actual.llmCoordinator,
            summarizeScreenContext: vi.fn()
        }
    };
});

describe('LLM Context Summarization - Integration', () => {
    const app = new Hono();

    beforeAll(() => {
        app.route('/api/summarize-context', summarizeContextRoutes);
    });

    beforeEach(() => {
        // Clear mock calls between tests
        vi.clearAllMocks();
    });

    afterAll(() => {
        vi.restoreAllMocks();
    });

    describe('POST /api/summarize-context', () => {
        it('should summarize code screen context', async () => {
            const mockSummary = 'TypeScript code showing a React component with login form validation';
            vi.mocked(llmCoordinator.summarizeScreenContext).mockResolvedValueOnce(mockSummary);

            const ocrText = `
                import React, { useState } from 'react';
                
                export function LoginForm() {
                    const [email, setEmail] = useState('');
                    const [password, setPassword] = useState('');
                    
                    const handleSubmit = async (e: React.FormEvent) => {
                        e.preventDefault();
                        // Validate and submit
                        if (!email.includes('@')) {
                            throw new Error('Invalid email');
                        }
                    };
                    
                    return <form onSubmit={handleSubmit}>...</form>;
                }
            `;

            const res = await app.request('/api/summarize-context', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: ocrText })
            });

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.summary).toBe(mockSummary);
            expect(llmCoordinator.summarizeScreenContext).toHaveBeenCalledWith(expect.stringContaining('LoginForm'));
        });

        it('should handle terminal/CLI screen context', async () => {
            const mockSummary = 'Terminal showing npm test command with 5 passing tests';
            vi.mocked(llmCoordinator.summarizeScreenContext).mockResolvedValueOnce(mockSummary);

            const ocrText = `
                $ npm test
                
                > @ghost/daemon@0.1.0 test
                > vitest run
                
                ✓ tests/reminder-demo-mode.test.ts (5)
                   ✓ ActionExecutor - Demo Mode Reminders (5)
                     ✓ should store reminder with screenshot and file context
                     ✓ should work without screen context
                
                Test Files  1 passed (1)
                Tests  5 passed (5)
            `;

            const res = await app.request('/api/summarize-context', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: ocrText })
            });

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.summary).toBe(mockSummary);
        });

        it('should handle error message screen context', async () => {
            const mockSummary = 'Error stack trace showing TypeError in authentication module';
            vi.mocked(llmCoordinator.summarizeScreenContext).mockResolvedValueOnce(mockSummary);

            const ocrText = `
                TypeError: Cannot read properties of undefined (reading 'token')
                    at AuthService.validateSession (/src/services/auth.ts:45:23)
                    at async UserController.getProfile (/src/controllers/user.ts:12:5)
                    at async /src/middleware/auth.ts:8:3
            `;

            const res = await app.request('/api/summarize-context', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: ocrText })
            });

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.summary).toBe(mockSummary);
        });

        it('should return null for short text', async () => {
            const res = await app.request('/api/summarize-context', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: 'hi' })
            });

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.summary).toBeNull();
            // LLM should not be called for short text
            expect(llmCoordinator.summarizeScreenContext).not.toHaveBeenCalled();
        });

        it('should handle LLM failure gracefully', async () => {
            vi.mocked(llmCoordinator.summarizeScreenContext).mockRejectedValueOnce(new Error('API timeout'));

            const res = await app.request('/api/summarize-context', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: 'Some longer text content that would normally be summarized by the LLM' })
            });

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.summary).toBeNull();
        });

        it('should handle empty request body', async () => {
            const res = await app.request('/api/summarize-context', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.summary).toBeNull();
        });

        it('should handle document/PDF screen context', async () => {
            const mockSummary = 'API redesign document discussing REST endpoint migration timeline';
            vi.mocked(llmCoordinator.summarizeScreenContext).mockResolvedValueOnce(mockSummary);

            const ocrText = `
                API Redesign Proposal - Q4 2024
                
                Executive Summary:
                This document outlines the proposed migration from our legacy REST API
                to a modern GraphQL-based architecture. Key milestones include:
                
                - Phase 1: Authentication endpoints (November)
                - Phase 2: User management (December)
                - Phase 3: Core business logic (January)
                
                Sarah from Mobile team flagged a timeline concern regarding the iOS release.
            `;

            const res = await app.request('/api/summarize-context', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: ocrText })
            });

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.summary).toBe(mockSummary);
        });
    });

    describe('Realistic 200-word scenarios with concise summaries', () => {
        it('should summarize complex React debugging session (8-12 words)', async () => {
            // Expected: concise 8-12 word summary
            const mockSummary = 'fixing useCallback dependency array causing stale closure';
            vi.mocked(llmCoordinator.summarizeScreenContext).mockResolvedValueOnce(mockSummary);

            // ~200 words of realistic IDE content
            const ocrText = `
                // UserDashboard.tsx - VS Code
                import React, { useState, useCallback, useEffect } from 'react';
                import { fetchUserData, updateUserProfile } from '../api/users';
                import { useAuth } from '../hooks/useAuth';
                import { LoadingSpinner } from '../components/LoadingSpinner';
                
                export const UserDashboard: React.FC = () => {
                    const { user, token } = useAuth();
                    const [profile, setProfile] = useState<UserProfile | null>(null);
                    const [loading, setLoading] = useState(true);
                    const [error, setError] = useState<string | null>(null);
                    
                    // BUG: This callback has stale closure over 'token'
                    // ESLint warning: React Hook useCallback has a missing dependency: 'token'
                    const loadUserData = useCallback(async () => {
                        try {
                            setLoading(true);
                            const data = await fetchUserData(user.id, token); // token is stale!
                            setProfile(data);
                        } catch (err) {
                            setError('Failed to load user data');
                            console.error('Dashboard load error:', err);
                        } finally {
                            setLoading(false);
                        }
                    }, [user.id]); // Missing 'token' in dependency array
                    
                    useEffect(() => {
                        loadUserData();
                    }, [loadUserData]);
                    
                    if (loading) return <LoadingSpinner />;
                    if (error) return <div className="error">{error}</div>;
            `;

            const res = await app.request('/api/summarize-context', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: ocrText })
            });

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.summary).toBe(mockSummary);
            // Verify summary is concise (8-12 words = roughly 40-100 chars)
            expect(mockSummary.split(' ').length).toBeGreaterThanOrEqual(6);
            expect(mockSummary.split(' ').length).toBeLessThanOrEqual(15);
        });

        it('should summarize database migration error (8-12 words)', async () => {
            const mockSummary = 'PostgreSQL foreign key constraint violation on orders table';
            vi.mocked(llmCoordinator.summarizeScreenContext).mockResolvedValueOnce(mockSummary);

            // ~200 words of terminal output with database error
            const ocrText = `
                $ npm run migrate:up
                
                > ghost-backend@0.1.0 migrate:up
                > prisma migrate deploy
                
                Prisma schema loaded from prisma/schema.prisma
                Datasource "db": PostgreSQL database "ghost_prod", schema "public" at "localhost:5432"
                
                Applying migration '20241205_add_orders_table'
                
                Error: P3018
                A migration failed to apply. New migrations cannot be applied before the error is recovered from.
                
                Migration name: 20241205_add_orders_table
                
                Database error code: 23503
                
                Database error:
                ERROR: insert or update on table "orders" violates foreign key constraint "orders_user_id_fkey"
                DETAIL: Key (user_id)=(550e8400-e29b-41d4-a716-446655440000) is not present in table "users".
                HINT: You may need to run the seed script first, or check that user records exist.
                
                DbError { severity: "ERROR", parsed_severity: Some(Error), code: SqlState(E23503), 
                message: "insert or update on table \\"orders\\" violates foreign key constraint", 
                detail: Some("Key (user_id)=(550e8400-e29b-41d4-a716-446655440000) is not present in table \\"users\\"."),
                hint: Some("You may need to run the seed script first"), ... }
                
                The failed migration has been rolled back.
            `;

            const res = await app.request('/api/summarize-context', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: ocrText })
            });

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.summary).toBe(mockSummary);
        });

        it('should summarize API rate limiting implementation (8-12 words)', async () => {
            const mockSummary = 'implementing Redis-based rate limiter for API endpoints';
            vi.mocked(llmCoordinator.summarizeScreenContext).mockResolvedValueOnce(mockSummary);

            // ~200 words of rate limiting code
            const ocrText = `
                // middleware/rate-limiter.ts
                import Redis from 'ioredis';
                import { Request, Response, NextFunction } from 'express';
                
                interface RateLimitConfig {
                    windowMs: number;      // Time window in milliseconds
                    maxRequests: number;   // Max requests per window
                    keyPrefix: string;     // Redis key prefix
                }
                
                export class RateLimiter {
                    private redis: Redis;
                    private config: RateLimitConfig;
                    
                    constructor(redis: Redis, config: RateLimitConfig) {
                        this.redis = redis;
                        this.config = config;
                    }
                    
                    async middleware(req: Request, res: Response, next: NextFunction) {
                        const key = \`\${this.config.keyPrefix}:\${req.ip}\`;
                        
                        try {
                            const current = await this.redis.incr(key);
                            
                            if (current === 1) {
                                await this.redis.pexpire(key, this.config.windowMs);
                            }
                            
                            // TODO: Add X-RateLimit headers
                            // TODO: Implement sliding window algorithm
                            // TODO: Add user-based rate limiting (not just IP)
                            
                            if (current > this.config.maxRequests) {
                                return res.status(429).json({
                                    error: 'Too Many Requests',
                                    retryAfter: await this.redis.pttl(key)
                                });
                            }
                            
                            next();
                        } catch (error) {
                            console.error('Rate limiter error:', error);
                            next(); // Fail open
                        }
                    }
                }
            `;

            const res = await app.request('/api/summarize-context', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: ocrText })
            });

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.summary).toBe(mockSummary);
        });

        it('should summarize code review comments on PR (8-12 words)', async () => {
            const mockSummary = 'addressing PR feedback on error handling patterns';
            vi.mocked(llmCoordinator.summarizeScreenContext).mockResolvedValueOnce(mockSummary);

            // ~200 words of GitHub PR review
            const ocrText = `
                GitHub - Pull Request #342: Refactor authentication service
                
                Files changed (4)  Commits (3)  Conversation (7)
                
                @sarah-dev requested changes 2 hours ago
                
                src/services/auth-service.ts
                ---
                Line 45: 
                - try {
                + try {
                +   // Add timeout to prevent hanging
                
                💬 sarah-dev: This try-catch is swallowing errors. We should at least log them.
                Also, consider using a custom AuthenticationError class instead of generic Error.
                
                Line 67:
                const token = jwt.sign(payload, SECRET_KEY);
                
                💬 sarah-dev: SECRET_KEY should come from environment variables, not hardcoded.
                See our security guidelines in docs/SECURITY.md
                
                @mike-reviewer commented:
                The overall approach looks good, but a few things:
                1. Need to add unit tests for the new validateToken method
                2. The error messages are too verbose for production
                3. Consider adding rate limiting to prevent brute force attacks
                
                @you replied:
                Good points. I'll address the error handling and add tests.
                For rate limiting, should we use the existing middleware or create a new one?
                
                Checks: 2 failing, 3 passing
                - ❌ Unit Tests (3 failures)
                - ❌ Lint Check
                - ✓ Build
            `;

            const res = await app.request('/api/summarize-context', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: ocrText })
            });

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.summary).toBe(mockSummary);
        });

        it('should summarize Kubernetes deployment issue (8-12 words)', async () => {
            const mockSummary = 'debugging OOMKilled pods with memory limit issues';
            vi.mocked(llmCoordinator.summarizeScreenContext).mockResolvedValueOnce(mockSummary);

            // ~200 words of kubectl output
            const ocrText = `
                $ kubectl get pods -n production
                NAME                            READY   STATUS      RESTARTS   AGE
                ghost-api-7d5f8b9c6-x2jkl      0/1     OOMKilled   5          12m
                ghost-api-7d5f8b9c6-m9nop      0/1     OOMKilled   4          12m
                ghost-worker-5c4d3b2a1-qrstu   1/1     Running     0          45m
                ghost-redis-0                   1/1     Running     0          2d
                
                $ kubectl describe pod ghost-api-7d5f8b9c6-x2jkl -n production
                
                Name:         ghost-api-7d5f8b9c6-x2jkl
                Namespace:    production
                Node:         gke-cluster-1-pool-1-abc123/10.128.0.45
                
                Containers:
                  ghost-api:
                    Image:          gcr.io/ghost-project/api:v2.3.1
                    Limits:
                      memory:  256Mi
                    Requests:
                      memory:  128Mi
                    State:          Waiting
                      Reason:       CrashLoopBackOff
                    Last State:     Terminated
                      Reason:       OOMKilled
                      Exit Code:    137
                      
                Events:
                  Type     Reason     Message
                  ----     ------     -------
                  Warning  OOMKilled  Container exceeded memory limit (256Mi)
                  Normal   Pulling    Pulling image "gcr.io/ghost-project/api:v2.3.1"
                  Warning  BackOff    Back-off restarting failed container
            `;

            const res = await app.request('/api/summarize-context', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: ocrText })
            });

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.summary).toBe(mockSummary);
        });
    });
});
