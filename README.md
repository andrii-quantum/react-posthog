# posthog-js

Block the whole page with one call.

`Sentry.init()` locks vertical and horizontal scrolling and covers the site with an overlay that swallows **every** user event: clicks, scroll, wheel, touch, keyboard, focus, clipboard, drag & drop, and more.

Importing the package does nothing on its own. The page is only blocked after you call `Sentry.init()`.

- Zero dependencies, about 3 KB gzipped
- ES module
- SSR-safe: calling it on the server does nothing
- Works with React, Vue, Svelte, Angular, or plain JS

## Install

```bash
npm install posthog-js
```

## Usage

```js
import { Sentry } from 'posthog-js'; // or: import Sentry from 'posthog-js'

Sentry.init();     // block the page
Sentry.isActive(); // true
Sentry.destroy();  // unblock and restore everything
```

### React

```jsx
import { useEffect } from 'react';
import { Sentry } from 'posthog-js';

function Maintenance() {
  // init() returns the cleanup function, so the page unblocks on unmount
  useEffect(() => Sentry.init(), []);

  return null;
}
```

### Vue

```js
import { onMounted, onUnmounted } from 'vue';
import { Sentry } from 'posthog-js';

onMounted(() => Sentry.init());
onUnmounted(() => Sentry.destroy());
```

### Plain `<script>`

```html
<script type="module">
  import { Sentry } from 'https://unpkg.com/posthog-js/dist/index.js';

  Sentry.init();
</script>
```

## Options

All options are optional.

```js
Sentry.init({
  background: 'rgba(0, 0, 0, 0.5)', // overlay color, default: 'transparent'
  zIndex: 9999,                     // default: 2147483647
  cursor: 'wait',                   // default: 'default'
});
```

## API

| Method | Description |
| --- | --- |
| `Sentry.init(options?)` | Turns the blocker on and returns a function that turns it off. Calling it again while active does nothing. |
| `Sentry.destroy()` | Turns the blocker off and restores scroll position, styles and focusability. Calling it while inactive does nothing. |
| `Sentry.isActive()` | Returns `true` while the page is blocked. |

## How it works

When you call `init()`, it:

1. Sets `overflow: hidden` on `<html>` and `<body>` and pads `<body>` by the scrollbar width so the layout doesn't jump. Any scroll that still happens, such as one started from code, is reset to the original position.
2. Adds a full-screen `position: fixed` overlay at the end of `<body>` with the maximum `z-index`.
3. Adds the [`inert`](https://developer.mozilla.org/docs/Web/HTML/Global_attributes/inert) attribute to everything else in `<body>`, so nothing can be focused or reached with Tab or a screen reader. It also blurs the element that currently has focus.
4. Listens for every user event on `window` in the capture phase, then calls `preventDefault()` and `stopImmediatePropagation()` so the event never reaches your app.
5. Watches `<body>` and makes newly added elements inert too, keeping the overlay on top.

`destroy()` undoes all of this exactly. Elements that were already `inert` before `init()` stay inert.

## Limitations

These come from the browser and can't be avoided:

- Browser shortcuts such as closing a tab (Ctrl/Cmd+W), opening a new tab or quitting the browser can't be blocked by any web page.
- Native top-layer elements (`<dialog>` opened with `showModal()`, popovers, fullscreen) are drawn above every `z-index`, so they can appear above the overlay. They still can't receive any input.
- Event listeners registered on `window` in the capture phase **before** `init()` still run. Normal app listeners, including React's, never do.

## License

MIT
