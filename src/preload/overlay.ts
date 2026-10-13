import { contextBridge, ipcRenderer } from 'electron';
import type { EmoteRef } from '../shared/emotes';
import {
  OVERLAY_ASSETS, OVERLAY_CHANNELS, OVERLAY_COPY, OVERLAY_CURSOR, OVERLAY_EMOTED, OVERLAY_MOUSE_PASS, OVERLAY_PINGED,
  type OverlayChannel, type OverlayEvents,
} from '../shared/ipc';
import type { PingId } from '../shared/pings';

const api = {
  on<C extends OverlayChannel>(channel: C, cb: (payload: OverlayEvents[C]) => void): void {
    if (!OVERLAY_CHANNELS.includes(channel)) throw new Error(`unknown overlay channel: ${channel}`);
    ipcRenderer.on(channel, (_event, payload: OverlayEvents[C]) => cb(payload));
  },
  reportMissingAssets(names: string[]): void {
    ipcRenderer.send(OVERLAY_ASSETS, names);
  },
  /** A wheel ping was placed here (CSS px in this overlay). */
  reportPing(id: PingId, x: number, y: number): void {
    ipcRenderer.send(OVERLAY_PINGED, { id, x, y });
  },
  /** A wheel emote was placed here (CSS px in this overlay). */
  reportEmote(ref: EmoteRef, x: number, y: number): void {
    ipcRenderer.send(OVERLAY_EMOTED, { ref, x, y });
  },
  /**
   * `true` = click-through (default). `false` = this overlay takes clicks so the AI bubble can select/copy text.
   */
  setMousePassThrough(pass: boolean): void {
    ipcRenderer.send(OVERLAY_MOUSE_PASS, pass !== false);
  },
  /** Cursor position in this overlay’s CSS pixels (for hover while click-through). */
  getCursorLocal(): Promise<{ x: number; y: number } | null> {
    return ipcRenderer.invoke(OVERLAY_CURSOR);
  },
  /** Write text to the system clipboard (works even when the overlay was non-focusable). */
  copyText(text: string): void {
    if (typeof text === 'string' && text) ipcRenderer.send(OVERLAY_COPY, text);
  },
};

contextBridge.exposeInMainWorld('overlay', api);

export type OverlayApi = typeof api;
