import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import posthog, { posthog as Namedposthog } from '../src/index';

const overlay = () => document.querySelector('[data-react-plugin]');

describe('posthog', () => {
  let button: HTMLButtonElement;

  beforeEach(() => {
    window.scrollTo = vi.fn() as typeof window.scrollTo; // not implemented in jsdom
    document.body.innerHTML = '<main><button>btn</button><input /></main>';
    button = document.querySelector('button')!;
    document.body.style.overflow = 'auto';
  });

  afterEach(() => {
    posthog.destroy();
    document.body.removeAttribute('style');
    document.documentElement.removeAttribute('style');
  });

  it('does nothing until init() is called', () => {
    const onClick = vi.fn();
    button.addEventListener('click', onClick);
    button.click();

    expect(posthog.isActive()).toBe(false);
    expect(overlay()).toBeNull();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('exports the same object as default and named', () => {
    expect(Namedposthog).toBe(posthog);
  });

  it('adds an overlay on top and locks scrolling', () => {
    posthog.init();

    expect(posthog.isActive()).toBe(true);
    expect(overlay()).not.toBeNull();
    expect(document.body.lastElementChild).toBe(overlay());
    expect(document.body.style.getPropertyValue('overflow')).toBe('hidden');
    expect(document.documentElement.style.getPropertyValue('overflow')).toBe('hidden');
    expect(document.querySelector('main')!.hasAttribute('inert')).toBe(true);
  });

  it('swallows clicks, keyboard, wheel and touch events', () => {
    const seen = vi.fn();
    const types = ['click', 'mousedown', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'input', 'focus'];
    for (const t of types) button.addEventListener(t, seen);
    document.addEventListener('keydown', seen);

    posthog.init();

    for (const t of types) {
      const event = new Event(t, { bubbles: true, cancelable: true });
      button.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
    button.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));

    expect(seen).not.toHaveBeenCalled();
  });

  it('is idempotent', () => {
    posthog.init();
    posthog.init();
    expect(document.querySelectorAll('[data-react-plugin]')).toHaveLength(1);
  });

  it('keeps the overlay last and makes new elements inert', async () => {
    posthog.init();
    const late = document.createElement('div');
    document.body.appendChild(late);
    await Promise.resolve();

    expect(document.body.lastElementChild).toBe(overlay());
    expect(late.hasAttribute('inert')).toBe(true);
  });

  it('destroy() restores everything', async () => {
    const preInert = document.createElement('aside');
    preInert.setAttribute('inert', '');
    document.body.appendChild(preInert);
    const onClick = vi.fn();
    button.addEventListener('click', onClick);

    const cleanup = posthog.init();
    cleanup();
    await Promise.resolve();

    expect(posthog.isActive()).toBe(false);
    expect(overlay()).toBeNull();
    expect(document.body.style.overflow).toBe('auto');
    expect(document.body.style.getPropertyPriority('overflow')).toBe('');
    expect(document.documentElement.style.overflow).toBe('');
    expect(document.querySelector('main')!.hasAttribute('inert')).toBe(false);
    expect(preInert.hasAttribute('inert')).toBe(true);

    button.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('can be re-initialized after destroy (React StrictMode)', () => {
    posthog.init()();
    posthog.init();
    expect(posthog.isActive()).toBe(true);
    expect(overlay()).not.toBeNull();
  });
});
