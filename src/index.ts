export interface BlockerOptions {
  /** CSS background of the overlay. Default: `"transparent"`. */
  background?: string;
  /** z-index of the overlay. Default: `2147483647` (the maximum). */
  zIndex?: number;
  /** CSS cursor shown over the overlay. Default: `"default"`. */
  cursor?: string;
}

/** Every event type that gets swallowed while the blocker is active. */
const BLOCKED_EVENTS = [
  // mouse
  'click', 'dblclick', 'auxclick', 'contextmenu',
  'mousedown', 'mouseup', 'mousemove', 'mouseover', 'mouseout', 'mouseenter', 'mouseleave',
  // pointer
  'pointerdown', 'pointerup', 'pointermove', 'pointerover', 'pointerout',
  'pointerenter', 'pointerleave', 'pointercancel', 'gotpointercapture', 'lostpointercapture',
  // touch & gestures
  'touchstart', 'touchmove', 'touchend', 'touchcancel',
  'gesturestart', 'gesturechange', 'gestureend',
  // wheel & scroll
  'wheel', 'mousewheel', 'DOMMouseScroll', 'scroll', 'scrollend',
  // keyboard & text input
  'keydown', 'keyup', 'keypress', 'beforeinput', 'input', 'change',
  'compositionstart', 'compositionupdate', 'compositionend',
  // focus
  'focus', 'blur', 'focusin', 'focusout',
  // forms
  'submit', 'reset', 'invalid',
  // clipboard & selection
  'copy', 'cut', 'paste', 'select', 'selectstart',
  // drag & drop
  'drag', 'dragstart', 'dragend', 'dragenter', 'dragleave', 'dragover', 'drop',
] as const;

const OVERLAY_ATTR = 'data-react-plugin';
const LISTENER_OPTIONS: AddEventListenerOptions = { capture: true, passive: false };

type SavedStyle = [el: HTMLElement, prop: string, value: string, priority: string];

interface State {
  overlay: HTMLDivElement;
  observer: MutationObserver;
  inerted: HTMLElement[];
  savedStyles: SavedStyle[];
  scrollX: number;
  scrollY: number;
}

let state: State | null = null;

const isBrowser = (): boolean =>
  typeof window !== 'undefined' && typeof document !== 'undefined';

function swallow(event: Event): void {
  if (event.cancelable) event.preventDefault();
  event.stopImmediatePropagation();

  // `scroll` is not cancelable, so undo it instead.
  if (event.type === 'scroll' && state) {
    if (window.scrollX !== state.scrollX || window.scrollY !== state.scrollY) {
      window.scrollTo(state.scrollX, state.scrollY);
    }
  }
}

function setStyle(saved: SavedStyle[], el: HTMLElement, prop: string, value: string): void {
  saved.push([el, prop, el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)]);
  el.style.setProperty(prop, value, 'important');
}

function restoreStyles(saved: SavedStyle[]): void {
  // Reverse order so a property set twice ends up with its original value.
  for (let i = saved.length - 1; i >= 0; i--) {
    const [el, prop, value, priority] = saved[i];
    if (value) el.style.setProperty(prop, value, priority);
    else el.style.removeProperty(prop);
  }
}

function makeInert(el: Element, inerted: HTMLElement[], overlay: HTMLElement): void {
  if (el === overlay || !(el instanceof HTMLElement) || el.hasAttribute('inert')) return;
  el.setAttribute('inert', '');
  inerted.push(el);
}

function createOverlay(options: BlockerOptions): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.setAttribute(OVERLAY_ATTR, '');
  overlay.setAttribute('aria-hidden', 'true');
  const styles: Record<string, string> = {
    position: 'fixed',
    inset: '0',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    margin: '0',
    padding: '0',
    border: '0',
    display: 'block',
    'z-index': String(options.zIndex ?? 2147483647),
    background: options.background ?? 'transparent',
    cursor: options.cursor ?? 'default',
    'pointer-events': 'auto',
    'touch-action': 'none',
    'user-select': 'none',
    '-webkit-user-select': 'none',
    '-webkit-tap-highlight-color': 'transparent',
  };
  for (const prop in styles) overlay.style.setProperty(prop, styles[prop], 'important');
  return overlay;
}

/**
 * Activates the blocker: locks vertical and horizontal scrolling, covers the page
 * with an overlay and swallows every user event (mouse, pointer, touch, wheel,
 * keyboard, focus, clipboard, drag & drop, ...).
 *
 * Calling it again while active does nothing. Safe to call during SSR (no-op).
 *
 * @returns a function that deactivates the blocker (same as `posthog.destroy`),
 *          handy as a React `useEffect` cleanup.
 */
function init(options: BlockerOptions = {}): () => void {
  if (!isBrowser() || state) return destroy;

  const html = document.documentElement;
  const body = document.body;
  const savedStyles: SavedStyle[] = [];
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  // Lock scrolling, compensating for the disappearing scrollbar to avoid a layout jump.
  const scrollbarWidth = window.innerWidth - html.clientWidth;
  if (scrollbarWidth > 0) {
    const paddingRight = parseFloat(getComputedStyle(body).paddingRight) || 0;
    setStyle(savedStyles, body, 'padding-right', `${paddingRight + scrollbarWidth}px`);
  }
  for (const el of [html, body]) {
    setStyle(savedStyles, el, 'overflow', 'hidden');
    setStyle(savedStyles, el, 'overscroll-behavior', 'none');
    setStyle(savedStyles, el, 'touch-action', 'none');
  }

  // Drop focus so keyboard input can't reach a focused field or iframe.
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== body) active.blur();

  const overlay = createOverlay(options);
  const inerted: HTMLElement[] = [];
  for (const child of Array.from(body.children)) makeInert(child, inerted, overlay);
  body.appendChild(overlay);

  // Keep the overlay on top and make anything added later inert too.
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element) makeInert(node, inerted, overlay);
      });
    }
    if (body.lastElementChild !== overlay) body.appendChild(overlay);
  });
  observer.observe(body, { childList: true });

  for (const type of BLOCKED_EVENTS) window.addEventListener(type, swallow, LISTENER_OPTIONS);

  state = { overlay, observer, inerted, savedStyles, scrollX, scrollY };
  return destroy;
}

/** Deactivates the blocker and restores the page to its previous state. */
function destroy(): void {
  if (!state) return;
  const { overlay, observer, inerted, savedStyles, scrollX, scrollY } = state;
  state = null;

  for (const type of BLOCKED_EVENTS) window.removeEventListener(type, swallow, LISTENER_OPTIONS);
  observer.disconnect();
  overlay.remove();
  for (const el of inerted) el.removeAttribute('inert');
  restoreStyles(savedStyles);
  window.scrollTo(scrollX, scrollY);
}

/** Whether the blocker is currently active. */
function isActive(): boolean {
  return state !== null;
}

export const posthog = { init, destroy, isActive };

export default posthog;
