import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SQLiteStorage } from '../src/services/sqlite-storage';
import type { CommandRequest, CommandResponse, MemoryReference } from '../src/types';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Visual Memory (Screenshot Saving)', () => {
    let storage: SQLiteStorage;
    const testDbPath = path.join(os.tmpdir(), `test-visual-memory-${Date.now()}.db`);

    beforeAll(() => {
        storage = new SQLiteStorage(testDbPath);
    });

    afterAll(() => {
        storage.close();
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
    });

    it('should store screenshot_path in memory metadata', async () => {
        const request: CommandRequest = {
            user_id: 'test-user',
            command_id: 'cmd-123',
            text: 'What is on my screen?',
            timestamp: new Date().toISOString(),
            screen_context: 'Hello World',
            screenshot_path: '/Users/test/.ghost/screenshots/screen-123.png',
            meta: {
                source: 'voice',
                client_version: '0.1.0',
            },
        };

        const response: CommandResponse = {
            command_id: 'cmd-123',
            assistant_text: 'I can see "Hello World" on your screen.',
            actions: [],
            memories_used: [],
        };

        const result = await storage.saveCommand(request, response, []);
        expect(result.ok).toBe(true);

        // Verify the screenshot memory was created using direct SQL query
        // (Can't use searchMemories because screenshot memory doesn't have embedding yet)
        const db = (storage as any).db;
        const screenMemory = db.prepare(`
            SELECT * FROM memories 
            WHERE type = 'context.screen' 
            AND id = ?
        `).get(`screen-${request.command_id}`);

        expect(screenMemory).toBeDefined();
        expect(screenMemory.id).toBe(`screen-cmd-123`);

        const metadata = JSON.parse(screenMemory.metadata);
        expect(metadata.path).toBe('/Users/test/.ghost/screenshots/screen-123.png');
        expect(metadata.commandId).toBe('cmd-123');
        expect(metadata.text).toBe('Hello World');
    });

    it('should handle commands without screenshots', async () => {
        const request: CommandRequest = {
            user_id: 'test-user',
            command_id: 'cmd-456',
            text: 'No screenshot',
            timestamp: new Date().toISOString(),
            meta: {
                source: 'voice',
                client_version: '0.1.0',
            },
        };

        const response: CommandResponse = {
            command_id: 'cmd-456',
            assistant_text: 'Acknowledged',
            actions: [],
            memories_used: [],
        };

        const result = await storage.saveCommand(request, response, []);
        expect(result.ok).toBe(true);
    });

    it('should link screenshot memory to command', async () => {
        const commandId = 'cmd-789';
        const request: CommandRequest = {
            user_id: 'test-user',
            command_id: commandId,
            text: 'Analyze this',
            timestamp: new Date().toISOString(),
            screenshot_path: '/Users/test/.ghost/screenshots/screen-789.png',
            meta: {
                source: 'voice',
                client_version: '0.1.0',
            },
        };

        const response: CommandResponse = {
            command_id: commandId,
            assistant_text: 'Analyzed',
            actions: [],
            memories_used: [],
        };

        await storage.saveCommand(request, response, []);

        // The memory ID should be `screen-${commandId}`
        const expectedMemoryId = `screen-${commandId}`;

        // This verifies the memory was created with the correct ID format
        const searchResult = await storage.searchMemories('screen', 'test-user', 50);
        if (searchResult.ok) {
            const hasExpectedMemory = searchResult.value.some(
                (m) => m.memory.id === expectedMemoryId
            );
            expect(hasExpectedMemory).toBe(true);
        }
    });
});
