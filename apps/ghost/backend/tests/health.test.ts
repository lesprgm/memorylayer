import { describe, it, expect } from 'vitest';
import app from '../src/index.js';

describe('Health Check', () => {
    it('should return 200 OK', async () => {
        const res = await app.request('/health');
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toHaveProperty('status', 'ok');
        expect(body).toHaveProperty('version');
    });
});
