import path from 'node:path';
import { app, BrowserWindow, Menu, Notification, Tray, nativeImage, ipcMain, shell } from 'electron';
import { loadConfig } from './config';
import { WindowManager } from './windows/window-manager';
import { GhostAPIClient } from './services/api-client';
import { HotkeyHandler } from './voice/hotkey-handler';
import { VoicePipeline } from './voice/voice-pipeline';
import { WhisperSTT } from './voice/whisper';
import { createTextToSpeech } from './tts';
import { ActionExecutor } from './actions/action-executor';
import { VoiceFeedbackService } from './services/voice-feedback';
import { WakeWordService } from './services/wake-word';
import { fileScanner } from './files/file-scanner';
import { streamChunksIfReady, flushChunks } from './utils/text-processing';

// eslint-disable-next-line @typescript-eslint/no-var-requires
if (require('electron-squirrel-startup')) {
  app.quit();
}

const config = loadConfig();
const visionConfig = config.vision ?? { enabled: true, captureMode: 'on-demand' as const };
const api = new GhostAPIClient(config);
const hotkey = new HotkeyHandler(config.voice.hotkey);
let tray: Tray | null = null;
const windowManager = new WindowManager();
let voicePipeline: VoicePipeline;
const stt = new WhisperSTT(config.voice.sttApiKey, {
  endpoint: config.voice.sttEndpoint,
  model: config.voice.sttModel,
  provider: config.voice.sttProvider,
});
const textToSpeech = createTextToSpeech(config.voice);

import { ExplainabilityNotifier } from './services/explainability-notifier';

import { VisionService } from './services/vision';
import { RemindersService } from './services/reminders';

// Create voice feedback service and action executor with TTS support
const voiceFeedback = new VoiceFeedbackService(textToSpeech);
const explainabilityNotifier = new ExplainabilityNotifier();
const remindersService = new RemindersService();
const actionExecutor = new ActionExecutor(voiceFeedback, explainabilityNotifier, remindersService, api);
const visionService = new VisionService();

function createTray(): void {
  const base64Icon = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAt8B9JpN5VQAAAAASUVORK5CYII=';
  const icon = nativeImage.createFromBuffer(Buffer.from(base64Icon, 'base64'));
  tray = new Tray(icon);
  tray.setToolTip('Ghost Daemon');
  const menu = Menu.buildFromTemplate([
    {
      label: 'Scan files',
      click: () => triggerFileScan(),
    },
    {
      label: 'Quit',
      click: () => app.quit(),
    },
  ]);
  tray.setContextMenu(menu);
}

async function triggerFileScan(): Promise<void> {
  try {
    const files = await fileScanner.scan(config.files.scanDirectories, {
      includeExtensions: config.files.includeExtensions,
      maxDepth: config.files.maxDepth,
      excludePatterns: config.files.excludePatterns,
      limit: 1000,
      // Explicit rescan to refresh cache + backend index
      forceRescan: true,
    });
    if (files.length === 0) {
      notifyError('File scan skipped', 'No files found to index. Check scanDirectories in config.json.');
      return;
    }
    const result = await api.indexFiles(files);
    if (!result.ok) {
      const message =
        // Axios-style error shape
        (result as any).error?.response?.data?.error ||
        (result as any).error?.message ||
        'Failed to index files';
      throw new Error(message);
    }
    new Notification({ title: 'Ghost', body: `Indexed ${files.length} files` }).show();
  } catch (error) {
    notifyError('File scan failed', error instanceof Error ? error.message : 'Unknown error');
  }
}

let isCommandActive = false;

async function handleHotkey(): Promise<void> {
  if (isCommandActive) {
    console.log('[Ghost] Command already active, ignoring hotkey');
    return;
  }
  isCommandActive = true;
  const overallStart = Date.now();
  console.info('[Ghost][PERF] ⏱️  Pipeline started at', new Date().toISOString());

  try {
    if (!voicePipeline) {
      notifyError('Voice pipeline unavailable', 'Please restart Ghost');
      return;
    }
    console.info('[Ghost] Hotkey activated — starting recording');

    // Stage 1: Screen Capture (parallel with recording)
    let screenCapturePromise: Promise<{ text: string; screenshotPath: string } | null> | null = null;
    const shouldCapturePreStt =
      visionConfig.enabled && visionConfig.captureMode === 'always';

    const visionStart = Date.now();
    if (shouldCapturePreStt) {
      console.log('[Ghost][PERF] 📸 Vision capture started');
      screenCapturePromise = visionService.captureScreenContext();
    }

    // Stage 2: Voice Recording
    const recordStart = Date.now();
    console.log('[Ghost][PERF] 🎤 Recording started');
    const audio = await voicePipeline.recordOnce();
    const recordDuration = Date.now() - recordStart;
    console.log(`[Ghost][PERF] ✅ Recording completed in ${recordDuration}ms`);

    // Stage 3: Speech-to-Text
    const sttStart = Date.now();
    console.log('[Ghost][PERF] 🗣️  STT processing started');
    const transcript = await stt.transcribe(audio);
    const sttDuration = Date.now() - sttStart;
    console.log(`[Ghost][PERF] ✅ STT completed in ${sttDuration}ms`);

    if (!transcript.ok) {
      const message = 'message' in transcript.error ? transcript.error.message : transcript.error.type;
      notifyError('Speech-to-text failed', message);
      return;
    }
    console.info('[Ghost] Transcript captured:', transcript.value);

    // Stage 4: Complete Vision Capture (if needed)
    const shouldCapturePostStt =
      visionConfig.enabled &&
      visionConfig.captureMode === 'on-demand' &&
      mentionsScreen(transcript.value);
    if (!screenCapturePromise && shouldCapturePostStt) {
      const visionPostStart = Date.now();
      console.log('[Ghost][PERF] 📸 Vision capture started (on-demand)');
      screenCapturePromise = visionService.captureScreenContext();
    }

    const screenResult = screenCapturePromise ? await screenCapturePromise : null;
    if (screenCapturePromise) {
      const visionDuration = Date.now() - visionStart;
      console.log(`[Ghost][PERF] ✅ Vision capture completed in ${visionDuration}ms`);
    }

    let screenContext: string | undefined;
    let screenshotPath: string | undefined;

    if (screenResult) {
      screenContext = screenResult.text;
      screenshotPath = screenResult.screenshotPath;
      console.info('[Ghost] Screen context captured:', screenContext.length, 'chars');
      console.info('[Ghost] Screenshot saved to:', screenshotPath);
    }

    // Stage 5: LLM API Call (streaming)
    const apiStart = Date.now();
    console.log('[Ghost][PERF] 🤖 LLM API call started (streaming)');

    const tokenBuffer: string[] = [];
    let hasStreamed = false;
    let firstTokenTime: number | null = null;

    let commandResult = await api.sendCommandStream(
      transcript.value,
      (token) => {
        if (firstTokenTime === null) {
          firstTokenTime = Date.now();
          const ttft = firstTokenTime - apiStart;
          console.log(`[Ghost][PERF] ⚡ Time to first token: ${ttft}ms`);
        }
        tokenBuffer.push(token);
        if (streamChunksIfReady(tokenBuffer, textToSpeech)) {
          hasStreamed = true;
        }
        console.info('[Ghost][LLM][token]', token);
      },
      screenContext,
      screenshotPath
    );

    const apiDuration = Date.now() - apiStart;
    console.log(`[Ghost][PERF] ✅ LLM API completed in ${apiDuration}ms`);

    if (!commandResult.ok) {
      console.warn('[Ghost] Streaming failed, falling back to non-streaming', commandResult.error);
      const fallbackStart = Date.now();
      console.log('[Ghost][PERF] 🔄 Fallback API call started');
      commandResult = await api.sendCommand(transcript.value, screenContext, screenshotPath);
      const fallbackDuration = Date.now() - fallbackStart;
      console.log(`[Ghost][PERF] ✅ Fallback API completed in ${fallbackDuration}ms`);
    }

    if (!commandResult.ok) {
      notifyError('Backend offline', 'Could not reach Ghost backend');
      return;
    }

    const response = commandResult.value;

    // Stage 6: TTS Completion
    const ttsStart = Date.now();
    await flushChunks(tokenBuffer, textToSpeech, response.assistant_text, hasStreamed);
    const ttsDuration = Date.now() - ttsStart;
    console.log(`[Ghost][PERF] ✅ TTS flush completed in ${ttsDuration}ms`);

    // Stage 7: Action Execution
    const actionStart = Date.now();
    console.log('[Ghost][PERF] ⚙️  Action execution started');
    const actionResults = await actionExecutor.executeBatch(response.actions, {
      commandId: response.command_id,
      memories: response.memories_used
    });
    const actionDuration = Date.now() - actionStart;
    console.log(`[Ghost][PERF] ✅ Actions completed in ${actionDuration}ms`);

    await api.sendActionResults(response.command_id, actionResults);

    // Show native Mac notification with sources instead of overlay
    if (response.memories_used && response.memories_used.length > 0) {
      const sourceCount = response.memories_used.length;
      const primarySource = response.memories_used[0];

      console.log('[Ghost][Notification] Creating notification for', sourceCount, 'sources');
      console.log('[Ghost][Notification] Primary source:', JSON.stringify(primarySource, null, 2));

      // Get filename from path or name
      const sourceName = primarySource.metadata?.path
        ? primarySource.metadata.path.split('/').pop() || 'Unknown'
        : primarySource.metadata?.name || 'Unknown source';

      console.log('[Ghost][Notification] Source name:', sourceName);

      // Create notification body with source preview
      let body = `Found in ${sourceCount} source${sourceCount > 1 ? 's' : ''}`;
      if (primarySource.summary) {
        // Truncate summary for notification
        const preview = primarySource.summary.length > 100
          ? primarySource.summary.substring(0, 100) + '...'
          : primarySource.summary;
        body += `\n\n${preview}`;
      }

      console.log('[Ghost][Notification] Notification body:', body);

      try {
        const notification = new Notification({
          title: `📄 ${sourceName}`,
          body: body,
          silent: false,
          timeoutType: 'default'
        });

        // Add click handler to open dashboard with memory data
        notification.on('click', () => {
          console.log('[Ghost][Notification] Notification clicked! Opening dashboard...');

          // Open dashboard URL with command ID as query param
          const dashboardUrl = `http://localhost:5174/command/${response.command_id}`;
          shell.openExternal(dashboardUrl).catch(err => {
            console.error('[Ghost] Failed to open dashboard:', err);
          });
        });

        console.log('[Ghost][Notification] Notification object created:', notification);
        console.log('[Ghost][Notification] Calling show()...');

        notification.show();

        console.log('[Ghost][Notification] show() called successfully');
        console.info('[Ghost] Showed native notification with', sourceCount, 'sources');
      } catch (error) {
        console.error('[Ghost][Notification] ERROR creating/showing notification:', error);
      }
    } else {
      console.info('[Ghost] No memories to show');
    }

    // Overall Pipeline Summary
    const totalDuration = Date.now() - overallStart;
    console.log('');
    console.log('[Ghost][PERF] ═══════════════════════════════════════════');
    console.log(`[Ghost][PERF] 📊 TOTAL PIPELINE: ${totalDuration}ms (${(totalDuration / 1000).toFixed(2)}s)`);
    console.log('[Ghost][PERF] ═══════════════════════════════════════════');
    console.log('');

    // No need to await TTS; queued chunks run in the background.
  } catch (error) {
    notifyError('Command processing failed', error instanceof Error ? error.message : 'Unknown error');
  } finally {
    isCommandActive = false;
  }
}



function notifyError(title: string, message: string): void {
  console.error(title, message);
  new Notification({ title, body: message }).show();
}

app.whenReady().then(() => {
  if (config.autoLaunch) {
    app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });
  }

  windowManager.createMainWindow();
  windowManager.createOverlayWindow();

  // Initialize Voice Pipeline
  voicePipeline = new VoicePipeline(
    config.voice.silenceThreshold,
    config.voice.maxRecordingDuration,
    windowManager.getMainWindow() || undefined
  );

  createTray();
  hotkey.register();
  triggerFileScan();

  // IPC Handlers
  ipcMain.handle('ghost/scan-files', async () => {
    await triggerFileScan();
    return { ok: true };
  });

  ipcMain.on('ghost/overlay/close', () => {
    windowManager.hideOverlay();
  });

  ipcMain.on('ghost/overlay/resize', (event, height) => {
    windowManager.resizeOverlay(height);
  });

  ipcMain.on('ghost/overlay/open-file', (event, filePath) => {
    shell.openPath(filePath);
  });

  app.on('activate', () => {
    windowManager.ensureMainWindow();
  });

  // Start wake word service
  const wakeWordService = new WakeWordService(
    voicePipeline,
    stt,
    textToSpeech,
    async () => {
      // The service pauses itself before calling this
      await handleHotkey();
    }
  );

  // Hook into hotkey handler to pause/resume wake word
  hotkey.on('activate', () => {
    wakeWordService.pause();
    handleHotkey().finally(() => wakeWordService.resume());
  });

  wakeWordService.start();
});

app.on('will-quit', () => {
  hotkey.unregister();
});



function mentionsScreen(text: string): boolean {
  const lower = text.toLowerCase();
  return /(on my screen|on the screen|what'?s on my screen|look at this|see on screen|this screen)/.test(lower);
}
