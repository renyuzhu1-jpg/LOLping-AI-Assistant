import { textureUrl, type PingId } from '../../shared/pings';

let dismissTimer: ReturnType<typeof setTimeout> | null = null;
let outTimer: ReturnType<typeof setTimeout> | null = null;
let watchTimer: ReturnType<typeof setInterval> | null = null;
let hovered = false;
/** True while the user is drag-selecting text inside the bubble. */
let selecting = false;
/** ms for the current bubble; <= 0 means stay until replaced. */
let activeMs = 0;
let activeEl: HTMLElement | null = null;
/** Last pointer position in the overlay. -1 = none yet. */
let lastX = -1;
let lastY = -1;
let tracking = false;
/** Mirrors overlay.setMousePassThrough — avoid spamming IPC. */
let passThrough = true;

function clearDismissTimers(): void {
  if (dismissTimer) clearTimeout(dismissTimer);
  if (outTimer) clearTimeout(outTimer);
  dismissTimer = null;
  outTimer = null;
}

function stopWatch(): void {
  if (watchTimer) clearInterval(watchTimer);
  watchTimer = null;
}

function setPassThrough(pass: boolean): void {
  if (passThrough === pass) return;
  passThrough = pass;
  window.overlay.setMousePassThrough(pass);
}

function pointOver(el: HTMLElement, x: number, y: number): boolean {
  if (x < 0 || y < 0) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const pad = 8;
  return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
}

/** Click-through off while hovering / selecting so text can be drag-copied. */
function syncMouseMode(): void {
  const needClicks = !!(activeEl && (hovered || selecting));
  setPassThrough(!needClicks);
}

function applyHover(next: boolean): void {
  if (hovered === next) {
    syncMouseMode();
    return;
  }
  hovered = next;
  syncMouseMode();
  if (!activeEl) return;
  if (next) {
    clearDismissTimers();
    activeEl.classList.remove('out');
  } else if (!selecting) {
    scheduleDismiss(activeEl);
  }
}

/** Hit-test using last known coords (mousemove and/or OS cursor poll). */
function syncHoverFromPointer(): void {
  if (!activeEl) {
    hovered = false;
    selecting = false;
    syncMouseMode();
    return;
  }
  if (selecting) {
    if (!hovered) {
      hovered = true;
      clearDismissTimers();
      activeEl.classList.remove('out');
    }
    syncMouseMode();
    return;
  }
  applyHover(pointOver(activeEl, lastX, lastY));
}

async function refreshCursorAndSync(): Promise<void> {
  try {
    const p = await window.overlay.getCursorLocal();
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      lastX = p.x;
      lastY = p.y;
    }
  } catch {
    // keep lastX/Y
  }
  if (activeEl) syncHoverFromPointer();
}

function startWatch(): void {
  stopWatch();
  watchTimer = setInterval(() => {
    void refreshCursorAndSync();
  }, 100);
}

function onPointerMove(e: MouseEvent): void {
  lastX = e.clientX;
  lastY = e.clientY;
  if (activeEl) syncHoverFromPointer();
}

function onPointerUp(): void {
  if (!selecting) return;
  selecting = false;
  void refreshCursorAndSync().then(() => {
    if (!hovered && activeEl) scheduleDismiss(activeEl);
  });
}

function bubbleBodyText(el: HTMLElement | null): string {
  if (!el) return '';
  const small = el.querySelector('small');
  return (small?.textContent ?? '').trim();
}

/** Copy current selection, or the whole reply body if nothing is selected. */
function copyBubbleText(): boolean {
  const sel = window.getSelection()?.toString() ?? '';
  const text = sel.trim() || bubbleBodyText(activeEl);
  if (!text) return false;
  window.overlay.copyText(text);
  return true;
}

function flashCopyBtn(btn: HTMLButtonElement): void {
  const zh = /^zh/i.test(navigator.language);
  const prev = btn.textContent;
  btn.textContent = zh ? '已复制' : 'Copied';
  btn.classList.add('ok');
  window.setTimeout(() => {
    btn.textContent = prev;
    btn.classList.remove('ok');
  }, 1200);
}

function onKeyDown(e: KeyboardEvent): void {
  if (!activeEl || passThrough) return;
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return;
  if (e.key === 'c' || e.key === 'C') {
    if (copyBubbleText()) {
      e.preventDefault();
      e.stopPropagation();
      const btn = activeEl.querySelector('.aiCopyBtn') as HTMLButtonElement | null;
      if (btn) flashCopyBtn(btn);
    }
  } else if (e.key === 'a' || e.key === 'A') {
    // Select the reply body for easier Ctrl+C.
    const small = activeEl.querySelector('small');
    if (!small) return;
    e.preventDefault();
    const range = document.createRange();
    range.selectNodeContents(small);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }
}

function ensurePointerTracking(): void {
  if (tracking) return;
  tracking = true;
  window.addEventListener('mousemove', onPointerMove, true);
  window.addEventListener('mouseup', onPointerUp, true);
  window.addEventListener('keydown', onKeyDown, true);
}

function clearBubble(el: HTMLElement): void {
  if (activeEl === el) {
    activeEl = null;
    hovered = false;
    selecting = false;
    stopWatch();
    syncMouseMode();
  }
  el.remove();
}

function beginDismiss(el: HTMLElement): void {
  if ((hovered || selecting) && activeEl === el) return;
  el.classList.add('out');
  outTimer = setTimeout(() => {
    if ((hovered || selecting) && activeEl === el) {
      el.classList.remove('out');
      return;
    }
    clearBubble(el);
  }, 240);
}

function scheduleDismiss(el: HTMLElement): void {
  clearDismissTimers();
  if (activeMs <= 0) return; // sticky until replaced
  if ((hovered || selecting) && activeEl === el) return;
  const ms = activeMs;
  dismissTimer = setTimeout(() => {
    void (async () => {
      // Re-check real cursor — don’t dismiss if the user is still on the bubble.
      await refreshCursorAndSync();
      if (hovered || selecting || activeEl !== el) return;
      beginDismiss(el);
    })();
  }, ms);
}

/**
 * League-style coach bubble near a ping.
 * - `ms <= 0`: stay until the next `showAiBubble` replaces it.
 * - Hover keeps it on screen; leaving restarts the dismiss timer (`ms`).
 * - While hovered, the overlay takes clicks/focus so text can be selected and Ctrl+C copied.
 */
export function showAiBubble(
  layer: HTMLElement,
  opts: { x: number; y: number; title: string; body: string; pingId: PingId; ms: number },
): void {
  clearDismissTimers();
  ensurePointerTracking();
  layer.querySelectorAll('.aiBubble').forEach((n) => n.remove());
  activeEl = null;
  hovered = false;
  selecting = false;
  syncMouseMode();

  const el = document.createElement('div');
  el.className = 'aiBubble';
  el.style.left = `${opts.x}px`;
  el.style.top = `${opts.y}px`;
  el.tabIndex = -1; // allow programmatic focus for Ctrl+C
  activeMs = opts.ms;
  activeEl = el;

  const icon = document.createElement('img');
  icon.src = textureUrl(opts.pingId === 'generic' ? 'generic_ping' : iconFor(opts.pingId));
  icon.alt = '';
  icon.draggable = false;

  const text = document.createElement('div');
  text.className = 'aiBubbleBody';
  const b = document.createElement('b');
  b.textContent = opts.title;
  const small = document.createElement('small');
  small.textContent = opts.body;
  text.append(b, small);

  const zh = /^zh/i.test(navigator.language);
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'aiCopyBtn';
  copyBtn.textContent = zh ? '复制' : 'Copy';
  copyBtn.title = zh ? '复制全文（也可拖选后 Ctrl+C）' : 'Copy all (or select + Ctrl+C)';
  copyBtn.addEventListener('mousedown', (e) => {
    // Don’t start a text-drag selection when pressing the button.
    e.stopPropagation();
  });
  copyBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    selecting = false;
    applyHover(true);
    // Prefer selection if the user highlighted something; else copy full body.
    if (copyBubbleText()) flashCopyBtn(copyBtn);
  });

  el.append(icon, text, copyBtn);
  layer.append(el);

  el.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement | null)?.closest?.('.aiCopyBtn')) return;
    selecting = true;
    applyHover(true);
    clearDismissTimers();
    el.classList.remove('out');
    // Keep focus so the next Ctrl+C reaches this document.
    el.focus({ preventScroll: true });
  });
  el.addEventListener('mouseenter', () => applyHover(true));
  // Do not trust mouseleave alone on click-through windows — the watch poll decides leave.

  startWatch();
  void refreshCursorAndSync().then(() => {
    if (activeEl !== el) return;
    if (!hovered) scheduleDismiss(el);
  });
}

function iconFor(id: PingId): string {
  const map: Partial<Record<PingId, string>> = {
    danger: 'pingwheel_retreatrender',
    push: 'push',
    omw: 'omw',
    allin: 'all_in',
    assist: 'assist_me',
    needvision: 'need_vision',
    missing: 'enemy_missing',
    enemyvision: 'enemy_vision',
    bait: 'pingwheel_baitrender',
    visioncleared: 'vision_cleared',
    generic: 'generic_ping',
  };
  return map[id] ?? 'generic_ping';
}
