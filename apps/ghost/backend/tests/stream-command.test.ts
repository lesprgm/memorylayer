import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import commandRoutes from '../src/routes/command.js';
import { commandProcessor } from '../src/services/command-processor.js';

describe('/api/command/stream', () => {
  it('streams token and final events', async () => {
    const app = new Hono();
    app.route('/api/command', commandRoutes);

    vi.spyOn(commandProcessor, 'process').mockResolvedValue({
      ok: true,
      value: {
        command_id: 'cmd-1',
        assistant_text: 'Hello world from ghost',
        actions: [],
        memories_used: [],
      },
    } as any);

    const res = await app.request('/api/command/stream', {
      method: 'POST',
      body: JSON.stringify({
        user_id: 'user-1',
        command_id: 'cmd-1',
        text: 'hi',
        timestamp: new Date().toISOString(),
        meta: { source: 'voice', client_version: '0.1.0' },
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('event: token');
    expect(body).toContain('event: final');
    expect(body).toContain('Hello world from ghost');
  });
});
