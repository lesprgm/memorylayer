import { globalShortcut } from 'electron';
import { EventEmitter } from 'node:events';

const DEFAULT_HOTKEY = 'Option+Space';

type HotkeyEvent = 'activate';

/**
 * Registers the global hotkey that kicks off the voice pipeline.
 */
export class HotkeyHandler extends EventEmitter {
  private hotkey: string;

  constructor(hotkey: string = DEFAULT_HOTKEY) {
    super();
    this.hotkey = hotkey;
  }

  register(): void {
    const candidates = [this.hotkey];
    if (/option/i.test(this.hotkey)) {
      candidates.push(this.hotkey.replace(/option/i, 'Alt'));
    }

    const registered = candidates.some((combo) =>
      globalShortcut.register(combo, () => this.emit('activate'))
    );

    if (!registered) {
      console.warn(`Failed to register hotkey ${candidates.join(' or ')}`);
    } else {
      this.hotkey = candidates.find((combo) => globalShortcut.isRegistered(combo)) || this.hotkey;
    }
  }

  unregister(): void {
    globalShortcut.unregister(this.hotkey);
  }
}
