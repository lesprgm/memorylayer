import { execFile } from 'node:child_process';
import { Notification } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { Action, ActionResult, MemoryReference } from '../types';
import type { VoiceFeedbackService } from '../services/voice-feedback';
import { ExplainabilityNotifier } from '../services/explainability-notifier';
import { RemindersService } from '../services/reminders';
import { GhostAPIClient } from '../services/api-client';
import { fileScanner } from '../files/file-scanner';

/**
 * Executes actions returned by the backend.
 * Supports voice feedback via optional VoiceFeedbackService.
 */
export class ActionExecutor {
  constructor(
    private voiceFeedback?: VoiceFeedbackService,
    private explainabilityNotifier?: ExplainabilityNotifier,
    private remindersService?: RemindersService,
    private apiClient?: GhostAPIClient
  ) { }

  async execute(
    action: Action,
    context?: { commandId: string; memories: MemoryReference[] }
  ): Promise<ActionResult> {
    let result: ActionResult;

    switch (action.type) {
      case 'file.open':
        result = await this.openFile(action);
        break;
      case 'file.scroll':
        result = await this.scroll(action);
        break;
      case 'file.index':
        result = await this.indexFile(action);
        break;
      case 'info.recall':
        result = await this.recallInfo(action);
        break;
      case 'reminder.create':
        result = await this.createReminder(action);
        break;
      case 'search.query':
        result = await this.searchMemories(action);
        break;
      default:
        result = {
          action,
          status: 'failed',
          error: 'Unsupported action type',
          executedAt: new Date().toISOString(),
        };
    }

    // Show explainability notification if memories were used
    if (
      result.status === 'success' &&
      this.explainabilityNotifier &&
      context &&
      context.memories.length > 0
    ) {
      // Don't show duplicate notification for info.recall if we already showed one
      // But actually info.recall shows the *content*, this shows the *source*.
      // So showing both might be okay, or we can suppress the source one if it's redundant.
      // For now, let's show it to give the "Found in..." context.
      await this.explainabilityNotifier.showContextNotification({
        commandId: context.commandId,
        summary: ExplainabilityNotifier.generateSummary(context.memories),
        memoryCount: context.memories.length,
        primarySource: context.memories[0]?.metadata?.source,
      }).catch(err => console.error('[Ghost] Notification failed:', err));
    }

    // Provide voice feedback if available
    if (this.voiceFeedback) {
      await this.voiceFeedback.provideFeedback(action, result).catch((err) =>
        console.error('[Ghost][ActionExecutor] Voice feedback failed:', err)
      );
    }

    return result;
  }

  async executeBatch(
    actions: Action[],
    context?: { commandId: string; memories: MemoryReference[] }
  ): Promise<ActionResult[]> {
    const results: ActionResult[] = [];
    for (const action of actions) {
      // eslint-disable-next-line no-await-in-loop
      const result = await this.execute(action, context);
      results.push(result);
    }
    return results;
  }

  private async openFile(action: Action): Promise<ActionResult> {
    const rawPath = action.params.path as string;
    const executedAt = new Date().toISOString();

    // Handle common directory intents
    const resolvedPath = this.resolvePath(rawPath);
    if (!resolvedPath) {
      return { action, status: 'failed', error: 'Invalid file path', executedAt };
    }
    const normalized = path.normalize(resolvedPath);
    if (normalized.includes('..')) {
      return { action, status: 'failed', error: 'Path traversal detected', executedAt };
    }
    if (!fs.existsSync(normalized)) {
      return { action, status: 'failed', error: 'File not found', executedAt };
    }

    const opener = process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'start'
        : 'xdg-open';

    return new Promise<ActionResult>((resolve) => {
      execFile(opener, [normalized], (error) => {
        if (error) {
          resolve({ action, status: 'failed', error: error.message, executedAt });
          return;
        }
        resolve({ action, status: 'success', executedAt });
      });
    });
  }

  private resolvePath(p: string | undefined): string | null {
    if (!p) return null;
    const lower = p.toLowerCase();

    // Map common directory names to user paths
    if (['downloads', 'download folder', 'download', 'my downloads'].includes(lower)) {
      const home = process.env.HOME || '';
      return path.join(home, 'Downloads');
    }
    if (['documents', 'document folder', 'docs'].includes(lower)) {
      const home = process.env.HOME || '';
      return path.join(home, 'Documents');
    }
    if (['desktop', 'my desktop'].includes(lower)) {
      const home = process.env.HOME || '';
      return path.join(home, 'Desktop');
    }

    // Handle home directory expansion
    if (p.startsWith('~/')) {
      const home = process.env.HOME || '';
      return path.join(home, p.slice(2));
    }

    // Handle relative paths (assume relative to home for now, or cwd)
    // For safety, let's assume if it's not absolute and not home-relative, we try to find it in home
    if (!path.isAbsolute(p)) {
      const home = process.env.HOME || '';
      const inHome = path.join(home, p);
      if (fs.existsSync(inHome)) return inHome;

      // Also try current working directory if it makes sense, but for a daemon it might be weird
      const cwd = process.cwd();
      const inCwd = path.join(cwd, p);
      if (fs.existsSync(inCwd)) return inCwd;
    }

    if (path.isAbsolute(p)) return p;
    return null;
  }

  private async scroll(action: Action): Promise<ActionResult> {
    const executedAt = new Date().toISOString();
    const direction = (action.params.direction as string) || 'down';
    const amount = Number(action.params.amount ?? 3);

    if (process.platform !== 'darwin') {
      return { action, status: 'failed', error: 'Scrolling only supported on macOS in this build', executedAt };
    }

    const keyCode = direction === 'up' ? 126 : 125; // 126=up, 125=down
    const script = `tell application "System Events"\nrepeat ${Math.max(1, amount)} times\nkey code ${keyCode}\ndelay 0.05\nend repeat\nend tell`;

    return new Promise<ActionResult>((resolve) => {
      execFile('osascript', ['-e', script], (error) => {
        if (error) {
          resolve({ action, status: 'failed', error: error.message, executedAt });
          return;
        }
        resolve({ action, status: 'success', executedAt });
      });
    });
  }

  private async indexFile(action: Action): Promise<ActionResult> {
    const executedAt = new Date().toISOString();
    const rawPath = action.params.path as string;

    if (!this.apiClient) {
      return { action, status: 'failed', error: 'API client not available', executedAt };
    }

    const resolvedPath = this.resolvePath(rawPath);
    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      return { action, status: 'failed', error: `Path not found: ${rawPath}`, executedAt };
    }

    try {
      // Scan the directory (or file)
      // fileScanner.scan expects an array of directories
      const isDirectory = fs.statSync(resolvedPath).isDirectory();
      const scanDirs = isDirectory ? [resolvedPath] : [path.dirname(resolvedPath)];

      // If it's a single file, we might want to just index that one file, 
      // but fileScanner is built for dirs. Let's just scan the dir for now, 
      // or maybe we can filter?
      // For simplicity, let's scan the directory.

      new Notification({ title: 'Ghost', body: `Scanning ${resolvedPath}...` }).show();

      const files = await fileScanner.scan(scanDirs, {
        forceRescan: true,
        limit: 500
      });

      if (files.length === 0) {
        return { action, status: 'success', error: 'No files found to index', executedAt };
      }

      const result = await this.apiClient.indexFiles(files);

      if (!result.ok) {
        throw new Error((result as any).error?.message || 'Failed to index files');
      }

      new Notification({ title: 'Ghost', body: `Indexed ${files.length} files from ${path.basename(resolvedPath)}` }).show();
      return { action, status: 'success', executedAt };

    } catch (error) {
      return {
        action,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Indexing failed',
        executedAt
      };
    }
  }

  private async recallInfo(action: Action): Promise<ActionResult> {
    const executedAt = new Date().toISOString();
    const summary = action.params.summary as string;
    // We keep this notification as it displays the ANSWER/SUMMARY
    // The explainability notification will display the SOURCE
    new Notification({ title: 'Ghost', body: summary || 'No summary provided' }).show();
    return { action, status: 'success', executedAt };
  }

  private async createReminder(action: Action): Promise<ActionResult> {
    const executedAt = new Date().toISOString();
    if (!this.remindersService) {
      return { action, status: 'failed', error: 'Reminders service not available', executedAt };
    }

    const { title, notes, dueDate } = action.params;
    const result = await this.remindersService.createReminder({ title, notes, dueDate });

    if (result.success) {
      new Notification({ title: 'Ghost', body: `Reminder created: ${title}` }).show();
      return { action, status: 'success', executedAt };
    } else {
      return { action, status: 'failed', error: result.error, executedAt };
    }
  }

  private async searchMemories(action: Action): Promise<ActionResult> {
    const executedAt = new Date().toISOString();
    const { query } = action.params;

    if (!query) {
      return { action, status: 'failed', error: 'Search query is required', executedAt };
    }

    try {
      // Call the backend search API
      const backendUrl = process.env.GHOST_BACKEND_URL || 'http://localhost:4000';
      const response = await fetch(`${backendUrl}/api/search?q=${encodeURIComponent(query)}&limit=5`);

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }

      const data = await response.json() as any;
      const results = data.results || [];

      if (results.length === 0) {
        new Notification({
          title: 'Ghost Search',
          body: `No results found for "${query}"`
        }).show();
      } else {
        const topResults = results.slice(0, 3).map((r: any) => r.memory.summary).join('\n• ');
        new Notification({
          title: `Found ${results.length} results`,
          body: `• ${topResults}`
        }).show();
      }

      return { action, status: 'success', executedAt };
    } catch (error) {
      return {
        action,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Search failed',
        executedAt
      };
    }
  }
}

// Export singleton without voice feedback for backward compatibility
export const actionExecutor = new ActionExecutor();
