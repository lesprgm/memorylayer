import { describe, expect, it, vi, beforeEach } from 'vitest';
import { streamChunksIfReady, flushChunks } from '../src/utils/text-processing';

describe('Text Processing', () => {
    const mockTTS = {
        speakQueued: vi.fn().mockResolvedValue(undefined),
    } as any;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('streamChunksIfReady', () => {
        it('buffers text without sentence boundaries', () => {
            const buffer = ['Hello', ' world'];
            const result = streamChunksIfReady(buffer, mockTTS);
            expect(result).toBe(false);
            expect(mockTTS.speakQueued).not.toHaveBeenCalled();
            expect(buffer).toEqual(['Hello', ' world']);
        });

        it('flushes on sentence boundary', () => {
            const buffer = ['Hello', ' world. ', 'Next'];
            const result = streamChunksIfReady(buffer, mockTTS);
            expect(result).toBe(true);
            expect(mockTTS.speakQueued).toHaveBeenCalledWith('Hello world.');
            expect(buffer).toEqual([' Next']); // Leading space is preserved from split
        });

        it('sanitizes newlines', () => {
            const buffer = ['Line 1\n', 'Line 2. '];
            const result = streamChunksIfReady(buffer, mockTTS);
            expect(result).toBe(true);
            expect(mockTTS.speakQueued).toHaveBeenCalledWith('Line 1 Line 2.');
        });

        it('flushes on buffer overflow', () => {
            // Create a long buffer > 50 words
            const longText = Array(55).fill('word').join(' ');
            const buffer = [longText];
            const result = streamChunksIfReady(buffer, mockTTS);
            expect(result).toBe(true);
            expect(mockTTS.speakQueued).toHaveBeenCalledWith(longText);
            expect(buffer).toEqual([]);
        });
    });

    describe('flushChunks', () => {
        it('flushes residual buffer', async () => {
            const buffer = ['Residual', ' text'];
            await flushChunks(buffer, mockTTS, 'Fallback', true);
            expect(mockTTS.speakQueued).toHaveBeenCalledWith('Residual text');
            expect(buffer).toEqual([]);
        });

        it('uses fallback if nothing streamed', async () => {
            const buffer: string[] = [];
            await flushChunks(buffer, mockTTS, 'Fallback text', false);
            expect(mockTTS.speakQueued).toHaveBeenCalledWith('Fallback text');
        });

        it('ignores fallback if already streamed', async () => {
            const buffer: string[] = [];
            await flushChunks(buffer, mockTTS, 'Fallback text', true);
            expect(mockTTS.speakQueued).not.toHaveBeenCalled();
        });
    });
});
