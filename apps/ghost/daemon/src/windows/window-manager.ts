import { BrowserWindow, screen, shell } from 'electron';
import path from 'node:path';

export class WindowManager {
    private mainWindow: BrowserWindow | null = null;
    private overlayWindow: BrowserWindow | null = null;

    constructor() { }

    public createMainWindow(): BrowserWindow {
        this.mainWindow = new BrowserWindow({
            width: 320,
            height: 120,
            show: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
            },
        });
        this.mainWindow.loadURL('about:blank');
        return this.mainWindow;
    }

    public createOverlayWindow(): BrowserWindow {
        const { width } = screen.getPrimaryDisplay().workAreaSize;

        this.overlayWindow = new BrowserWindow({
            width: 240, // Reduced from 300 for more compact display
            height: 0, // Start small, will resize
            useContentSize: true,
            x: width - 340, // Initial position with padding
            y: 40,
            frame: false,
            transparent: true,
            alwaysOnTop: true,
            skipTaskbar: true,
            resizable: false,
            show: false,
            hasShadow: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
            },
        });

        // Load from src/overlay in dev, or resources in prod
        // In a real app we'd handle dev vs prod paths more robustly
        this.overlayWindow.loadFile(path.join(__dirname, '../overlay/index.html'));

        return this.overlayWindow;
    }

    public resizeOverlay(contentHeight: number): void {
        if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
            const { workArea } = screen.getPrimaryDisplay();
            const width = 240; // Reduced from 300 for more compact display
            const padding = 20; // "move it a bit to the left"

            // Calculate position: Top-right with padding
            let x = workArea.width - width - padding;

            // Ensure it doesn't go off-screen (left side)
            if (x < workArea.x) {
                x = workArea.x + padding;
            }

            // Max height constraint (e.g., 80% of screen height)
            const maxHeight = Math.floor(workArea.height * 0.8);
            const height = Math.min(contentHeight, maxHeight);

            this.overlayWindow.setContentSize(width, height);
            this.overlayWindow.setPosition(x, 40 + workArea.y); // 40px from top
        }
    }

    public getMainWindow(): BrowserWindow | null {
        return this.mainWindow;
    }

    public getOverlayWindow(): BrowserWindow | null {
        return this.overlayWindow;
    }

    public updateOverlay(sources: any[]): void {
        if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
            console.log('[WindowManager] Updating overlay with', sources.length, 'sources');
            this.overlayWindow.webContents.send('update-sources', sources);
            this.overlayWindow.show(); // Use show() instead of showInactive()
            this.overlayWindow.focus(); // Ensure it's in front
            console.log('[WindowManager] Overlay should now be visible');
        } else {
            console.warn('[WindowManager] Overlay window not available');
        }
    }

    public hideOverlay(): void {
        if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
            this.overlayWindow.hide();
        }
    }

    public ensureMainWindow(): void {
        if (!this.mainWindow || this.mainWindow.isDestroyed()) {
            this.createMainWindow();
        }
    }
}
