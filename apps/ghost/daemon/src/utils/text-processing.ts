import { createTextToSpeech } from '../tts';

export function streamChunksIfReady(buffer: string[], tts: ReturnType<typeof createTextToSpeech>): boolean {
    const fullText = buffer.join('');

    // Look for sentence boundaries (., ?, !) followed by space or end of string
    // We want to be careful not to split on abbreviations (Mr., Dr.) but for now simple regex is okay
    const match = fullText.match(/([.?!])\s+/);

    if (match && match.index !== undefined) {
        const splitIndex = match.index + 1; // Include the punctuation
        const toSpeak = fullText.substring(0, splitIndex);
        const remainder = fullText.substring(splitIndex);

        // Clear buffer and put remainder back
        buffer.length = 0;
        if (remainder) {
            buffer.push(remainder);
        }

        // Sanitize: replace newlines with spaces to prevent awkward pauses in 'say' command
        const cleanText = toSpeak.replace(/\n+/g, ' ').trim();

        if (cleanText) {
            tts.speakQueued(cleanText).catch((err) => console.error('[Ghost][TTS] Chunk speak failed', err));
            return true;
        }
    }

    // Fallback: if buffer gets too long (e.g. long list or run-on sentence), flush it
    const wordCount = fullText.split(/\s+/).length;
    if (wordCount > 50) {
        buffer.length = 0;
        const cleanText = fullText.replace(/\n+/g, ' ').trim();
        tts.speakQueued(cleanText).catch((err) => console.error('[Ghost][TTS] Chunk speak failed', err));
        return true;
    }

    return false;
}

export async function flushChunks(
    buffer: string[],
    tts: ReturnType<typeof createTextToSpeech>,
    fallback: string,
    hasStreamed: boolean
): Promise<void> {
    const residual = buffer.join('').replace(/\n+/g, ' ').trim();
    if (residual) {
        await tts.speakQueued(residual);
    } else if (!hasStreamed && fallback) {
        // If we never streamed anything (e.g., streaming not available), speak the full response.
        const cleanFallback = fallback.replace(/\n+/g, ' ').trim();
        await tts.speakQueued(cleanFallback);
    }
    buffer.length = 0;
}
