import { describe, it, expect } from 'vitest';
import app from '../src/index.js';

describe('Semantic Search API (in-app)', () => {
    const API_KEY = 'ghost-api-key-123';
    const fetchApi = (path: string) =>
        app.fetch(
            new Request(`http://localhost${path}`, {
                headers: { Authorization: `Bearer ${API_KEY}` },
            })
        );

    it('should return search results for a query', async () => {
        const response = await fetchApi('/api/search?q=test&userId=ghost&limit=5');

        expect(response.ok).toBe(true);
        const data = await response.json();
        expect(data).toHaveProperty('query');
        expect(data).toHaveProperty('results');
        expect(Array.isArray(data.results)).toBe(true);
    });

    it('should return empty results for non-existent query', async () => {
        const response = await fetchApi('/api/search?q=xyznonexistentqueryzyx&userId=ghost&limit=5');

        expect(response.ok).toBe(true);
        const data = await response.json();
        expect(data.results).toHaveLength(0);
    });

    it('should require query parameter', async () => {
        const response = await fetchApi('/api/search?userId=ghost');

        expect(response.status).toBe(400);
    });

    it('should limit results based on limit parameter', async () => {
        const response = await fetchApi('/api/search?q=file&userId=ghost&limit=3');

        expect(response.ok).toBe(true);
        const data = await response.json();
        expect(data.results.length).toBeLessThanOrEqual(3);
    });

    it('should return scored results', async () => {
        const response = await fetchApi('/api/search?q=test&userId=ghost&limit=5');
        const data = await response.json();
        if (data.results.length > 0) {
            expect(data.results[0]).toHaveProperty('score');
            expect(data.results[0]).toHaveProperty('memory');
            expect(data.results[0].memory).toHaveProperty('summary');
        }
    });
});
