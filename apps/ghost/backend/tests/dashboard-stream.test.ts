import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import dashboardRoutes from '../src/routes/dashboard.js';
import { storageService } from '../src/services/storage.js';

describe('/api/dashboard/stream-latest', () => {
  it('streams tokens and final latest command', async () => {
    const app = new Hono();
    app.route('/api/dashboard', dashboardRoutes);

    vi.spyOn(storageService, 'getDashboardData').mockReturnValue({
      commands: [
        {
          id: 'cmd-1',
          text: 'demo',
          assistant_text: 'Hello streaming world',
          timestamp: new Date().toISOString(),
          actions: [],
          memories_used: [],
        },
      ],
      stats: { totalCommands: 1, totalMemories: 0, successRate: 1 },
    });

    const res = await app.request('/api/dashboard/stream-latest');
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('event: token');
    expect(body).toContain('event: final');
    expect(body).toContain('Hello streaming world');
  });
});
