import { execFile, exec } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

export class VisionService {
    private swiftScriptPath: string;

    constructor() {
        // Resolve the Swift OCR script for both dev (ts-node) and built (dist) environments.
        const distPath = path.join(__dirname, '../ocr/recognize-text.swift');
        const srcPath = path.join(__dirname, '../../src/ocr/recognize-text.swift');
        this.swiftScriptPath = fs.existsSync(distPath) ? distPath : srcPath;
    }

    /**
   * Captures the main screen and extracts text using macOS Vision framework.
   * Returns the extracted text and screenshot path, or null if failed.
   */
    async captureScreenContext(): Promise<{ text: string; screenshotPath: string } | null> {
        const homeDir = os.homedir();
        const ghostDir = path.join(homeDir, '.ghost', 'screenshots');

        if (!fs.existsSync(ghostDir)) {
            fs.mkdirSync(ghostDir, { recursive: true });
        }

        const filename = `screen-${Date.now()}.png`;
        const screenshotPath = path.join(ghostDir, filename);

        try {
            // 1. Capture screenshot (silent, main monitor, png)
            // -x: silent (no sound)
            // -m: main monitor only (to avoid huge dual-screen images)
            // -r: do not add shadow (cleaner)
            await execAsync(`screencapture -x -m -r "${screenshotPath}"`);

            // 2. Run OCR
            const { stdout } = await execFileAsync('swift', [this.swiftScriptPath, screenshotPath]);

            const text = stdout.trim();
            return text.length > 0 ? { text, screenshotPath } : { text: '', screenshotPath };

        } catch (error) {
            console.error('[Ghost][Vision] Failed to capture/recognize:', error);
            // Cleanup on error only
            if (fs.existsSync(screenshotPath)) {
                fs.unlinkSync(screenshotPath);
            }
            return null;
        }
    }
}
