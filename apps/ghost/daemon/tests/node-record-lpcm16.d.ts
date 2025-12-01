declare module 'node-record-lpcm16' {
    export function record(options: {
        sampleRate?: number;
        threshold?: number;
        verbose?: boolean;
        recordProgram?: string;
        endOnSilence?: boolean;
        silence?: string;
    }): {
        stream(): NodeJS.ReadableStream;
        stop(): void;
    };
}
