# @bugdump/sdk

Official TypeScript SDK for [Bugdump](https://bugdump.com) - embed a bug reporting widget on your website and collect detailed reports from your users.

## Features

- **Embeddable widget** - Floating bug report button with screenshot, screen recording, and voice notes
- **Auto-collects telemetry** - Console logs, network requests, session replay, and performance data
- **Automatic error capture** - Uncaught errors and unhandled promise rejections, grouped on your project's Errors page, with readable stack traces from your source maps
- **Screenshot annotations** - Users can draw, highlight, and blur parts of screenshots
- **TypeScript-first** - Full type definitions out of the box
- **Shadow DOM isolated** - Widget styles never leak into your app
- **Auto-init** - Single script tag with `data-api-key`, no JS required
- **Six languages built in** - English, Russian, Spanish, French, Portuguese and German, picked from the page or browser language, with per-string overrides
- **Your own form** - Send reports from your own UI with `submit()`, telemetry included
- **Report link** - Optionally show a direct link to the created report after submission with a copy button
- **Public portal link** - Automatically shows a "View reports" link in the widget footer when the public portal is enabled for your project

## Installation

### Script Tag (Recommended)

Drop a single line into your HTML — the widget initializes automatically:

```html
<script src="https://bugdump.com/sdk/latest.js" async data-api-key="your-api-key"></script>
```

The `async` attribute keeps the SDK from blocking page parsing or `DOMContentLoaded`; the widget initializes as soon as the script arrives.

That's it. A floating bug report button will appear on your page.

### npm

```bash
npm install @bugdump/sdk
# or
pnpm add @bugdump/sdk
# or
yarn add @bugdump/sdk
```

```typescript
import { Bugdump } from '@bugdump/sdk';

const bugdump = Bugdump.init({
  apiKey: 'your-api-key',
});
```

### Manual IIFE (without auto-init)

```html
<script>
  window.bugdump =
    window.bugdump ||
    function () {
      (window.bugdump.q = window.bugdump.q || []).push(arguments);
    };
</script>
<script src="https://bugdump.com/sdk/latest.js" async></script>
<script>
  bugdump('init', { apiKey: 'your-api-key' });
</script>
```

The three-line stub makes `bugdump(...)` safe to call immediately: until the SDK arrives it queues calls, and when the script loads the SDK replays them in order and replaces the stub with a live dispatcher — so the same `bugdump(...)` calls work before and after load. Without it, an inline `Bugdump.init(...)` would race the `async` download and throw `Bugdump is not defined`.

Any fire-and-forget method can be a command: `bugdump('identify', { email: '...' })`, `bugdump('open', { taskId: 42 })`, `bugdump('setContext', {...})`, `bugdump('captureException', error)`, plus `setTheme`, `reset`, `close`, `identifyTask`, `clearTask`, and `destroy`. Methods that return a value (`getInstance`, `submit`, `collectTelemetry`, `getConfig`, ...) are not commands — a queued call has nowhere to return to. Call those on `window.Bugdump` once the script has loaded.

## How the SDK Loads

The script tag build loads in two stages, so a page only downloads what it actually uses.

**The entry** (`latest.js`, ~143 KB / ~36 KB gzipped) carries the widget, the console/network/action collectors, error capture, and report submission. Every page pays this.

**Two optional chunks** are fetched on demand and never touch a page that does not need them:

| Chunk                    | Size    | Fetched when                                                                                                          |
| ------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------- |
| `bugdump-html2canvas.js` | ~250 KB | Someone takes a DOM screenshot — including the automatic fallback when a `screen-capture` permission prompt is denied |
| `bugdump-replay.js`      | ~82 KB  | Session replay is enabled for your project _and_ allowed by your plan                                                 |

Since `screenshotMethod` defaults to `screen-capture`, most screenshots never load html2canvas at all.

**If you self-host or proxy the SDK**, copy all three files and keep them in the same directory — the entry resolves its chunks relative to its own URL. Serving `latest.js` alone leaves screenshots and session replay broken while the rest of the widget appears to work. You may rename the entry; the chunk filenames must stay as they are.

A strict Content-Security-Policy needs the SDK's origin in `script-src` for the chunk requests, not just for the entry.

## Configuration

### npm

```typescript
const bugdump = Bugdump.init({
  apiKey: 'your-api-key',
  endpoint: 'https://api.bugdump.com', // Custom API endpoint
  theme: 'auto', // Widget color theme
  position: 'bottom-right', // Corner the widget is anchored to
  locale: 'auto', // Widget language: 'auto', 'en', 'ru', 'es', 'fr', 'pt', 'de' or any tag
  icon: 'chat', // Trigger button icon
  hideButton: false, // Hide the floating button
  showReportLink: false, // Show report link after submission
  captureNetworkBodies: false, // Capture request/response bodies
  captureErrors: true, // Send uncaught errors and unhandled rejections
  release: '1.4.2', // Your build's version, shown with each error
  sampleRate: 1, // Share of automatically captured errors to send, 0 to 1
  features: {
    screenshot: true, // Screenshot capture
    screenshotMethod: 'screen-capture', // 'screen-capture' (getDisplayMedia) or 'dom' (html2canvas)
    screenRecording: true, // Screen recording
    screenRecordingMethod: 'screen-capture', // 'screen-capture' (getDisplayMedia) or 'dom' (rrweb)
    sessionReplay: true, // Session replay collection
    attachments: true, // File attachments
    allowTaskAttach: false, // Show "Attach to task" toggle
  },
});
```

| Option                 | Type                          | Default                   | Description                                                                                                                                                                                         |
| ---------------------- | ----------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apiKey`               | `string`                      | —                         | **Required.** Your Bugdump API key                                                                                                                                                                  |
| `endpoint`             | `string`                      | `https://api.bugdump.com` | Custom API endpoint                                                                                                                                                                                 |
| `theme`                | `'light' \| 'dark' \| 'auto'` | `'auto'`                  | Widget color theme. `auto` follows the user's OS preference. Change it later with `setTheme`                                                                                                        |
| `position`             | `'bottom-right' \| 'bottom-left'` | `'bottom-right'`      | Corner the floating button and panel are anchored to                                                                                                                                                |
| `locale`               | `string`                      | `'auto'`                  | Widget language (see [Languages and translations](#languages-and-translations) below)                                                                                                                |
| `hideButton`           | `boolean`                     | `false`                   | Hide the floating button and trigger the widget programmatically                                                                                                                                    |
| `showReportLink`       | `boolean`                     | `false`                   | Show a link to the created report on the success screen with a copy button                                                                                                                          |
| `icon`                 | `string`                      | `'chat'`                  | Custom trigger button icon (see [Custom Icon](#custom-icon) below)                                                                                                                                  |
| `bubbleText`           | `string`                      | —                         | Show a dismissible teaser bubble next to the floating button (e.g. `"Found a bug?"`). Clicking it opens the widget; dismissing it is remembered in `localStorage`. Ignored when `hideButton` is set |
| `captureNetworkBodies` | `boolean`                     | `false`                   | Include request/response bodies in network logs                                                                                                                                                     |
| `captureErrors`        | `boolean`                     | `true`                    | Send uncaught errors and unhandled promise rejections (see [Automatic error capture](#automatic-error-capture))                                                                                     |
| `release`              | `string`                      | —                         | Your build's version, such as a git commit. Decides when an error reopens its resolved task                                                                                                         |
| `sampleRate`           | `number`                      | `1`                       | Share of automatically captured errors to send, from `0` to `1`. Never applies to `captureException` or widget reports                                                                              |
| `features`             | `object`                      | all `true`                | Enable/disable widget features (see below)                                                                                                                                                          |
| `translations`         | `object`                      | —                         | Override widget UI strings on top of the language (see below)                                                                                                                                       |

#### Feature Toggles

| Feature                          | Default            | Description                                                                                                                                                        |
| -------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `features.screenshot`            | `true`             | Screenshot capture button                                                                                                                                          |
| `features.screenshotMethod`      | `'screen-capture'` | `'screen-capture'` (default) uses getDisplayMedia (pixel-perfect, shows permission dialog, falls back to DOM if denied). `'dom'` uses html2canvas (no prompt)      |
| `features.screenRecording`       | `true`             | Screen recording button                                                                                                                                            |
| `features.screenRecordingMethod` | `'screen-capture'` | `'screen-capture'` (default) uses getDisplayMedia (pixel-perfect, shows permission dialog, falls back to DOM if denied). `'dom'` uses rrweb (no prompt, DOM-based) |
| `features.sessionReplay`         | `true`             | Background session replay collection                                                                                                                               |
| `features.attachments`           | `true`             | File attachment button                                                                                                                                             |
| `features.allowTaskAttach`       | `false`            | Show an "Attach to task" toggle so reporters can associate the report with an existing task by its public ID                                                       |

#### Languages and translations

The widget ships in English (`en`), Russian (`ru`), Spanish (`es`), French (`fr`), Portuguese (`pt`, Brazilian) and German (`de`, formal *Sie*). The `locale` option picks one:

| `locale`                          | Language                                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------- |
| omitted or `'auto'`               | The first shipped language from the page's `<html lang>`, then the visitor's browser languages, else English |
| `'fr'`, `'fr-CA'`, `'FR'`         | French. Only the part before `-` or `_` is matched, case-insensitively                                     |
| a language that is not shipped    | English strings, unless you pass your own in `translations`                                                |

`translations` is applied on top of the picked language, so you can change a few strings in any language, or bring a whole language of your own:

```typescript
// Change a few strings
Bugdump.init({ apiKey: 'your-api-key', translations: { title: 'Report a bug', sendButton: 'Send report' } });

// Always English, whatever the page or browser language
Bugdump.init({ apiKey: 'your-api-key', locale: 'en' });

// A language the SDK does not ship: strings you leave out fall back to English
Bugdump.init({
  apiKey: 'your-api-key',
  locale: 'it',
  translations: { title: 'Invia feedback', sendButton: 'Invia' /* … */ },
});
```

`Bugdump.getInstance()?.getConfig()?.locale` returns the language the widget uses: the tag you passed, or the one `auto` picked. The widget sets it as its `lang` attribute. The language is read once at `init`; to switch it in a single-page app, call `destroy()` and `init()` again. `bubbleText` is your own text and is not translated.

| Key                       | Default                                                                  | Description                                                                                   |
| ------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `title`                   | `Send feedback`                                                          | Panel header title and trigger button aria-label                                              |
| `triggerTitle`            | falls back to `title`                                                    | Floating button hover tooltip (`title` attribute) and aria-label                              |
| `descriptionPlaceholder`  | `What's on your mind?`                                                   | Textarea placeholder                                                                          |
| `attachButton`            | `Attach`                                                                 | File attach button label                                                                      |
| `screenshotButton`        | `Screenshot`                                                             | Screenshot button label                                                                       |
| `recordButton`            | `Record`                                                                 | Screen recording button label                                                                 |
| `sendButton`              | `Send`                                                                   | Submit button label                                                                           |
| `reporterToggle`          | `Reporter info`                                                          | Reporter section toggle label                                                                 |
| `namePlaceholder`         | `Your name`                                                              | Name input placeholder                                                                        |
| `emailPlaceholder`        | `Your email`                                                             | Email input placeholder                                                                       |
| `taskAttachToggle`        | `Attach to task`                                                         | Label for the toggle that reveals the task ID field (shown when `allowTaskAttach` is enabled) |
| `taskIdPlaceholder`       | `Task ID`                                                                | Placeholder for the task ID input (shown when `allowTaskAttach` is enabled)                   |
| `capturing`               | `Capturing...`                                                           | Screenshot loading state                                                                      |
| `startRecording`          | `Record`                                                                 | Start recording button label in the recording bar                                             |
| `stop`                    | `Stop`                                                                   | Recording stop button label                                                                   |
| `sending`                 | `Sending...`                                                             | Submit loading state                                                                          |
| `successTitle`            | `Feedback sent!`                                                         | Success message title                                                                         |
| `successSubtitle`         | `Thank you for your feedback.`                                           | Success message subtitle                                                                      |
| `errorMessage`            | `Something went wrong. Please try again.`                                | Error message                                                                                 |
| `emptyDescriptionMessage` | `Please describe what happened before sending.`                          | Validation message shown when submitting with an empty description                            |
| `quotaExceededMessage`    | `This site is not accepting feedback right now. Please try again later.` | Notice shown, with Send disabled, while the project is not accepting reports                  |
| `closeButton`             | `Close`                                                                  | Close button on the success screen                                                            |
| `submitAnother`           | `Submit another`                                                         | Button on the success screen to file another report                                           |
| `arrowTool`               | `Arrow`                                                                  | Annotation arrow tool tooltip                                                                 |
| `rectangleTool`           | `Rectangle`                                                              | Annotation rectangle tool tooltip                                                             |
| `drawTool`                | `Draw`                                                                   | Annotation freehand tool tooltip                                                              |
| `textTool`                | `Text`                                                                   | Annotation text tool tooltip                                                                  |
| `blurTool`                | `Blur`                                                                   | Annotation blur tool tooltip                                                                  |
| `undo`                    | `Undo`                                                                   | Annotation undo button tooltip                                                                |
| `cancel`                  | `Cancel`                                                                 | Annotation cancel button label                                                                |
| `done`                    | `Done`                                                                   | Annotation confirm button label                                                               |
| `badgeScreenshot`         | `Screenshot`                                                             | Badge label shown on screenshot attachments                                                   |
| `badgeRecording`          | `Recording`                                                              | Badge label shown on screen recording attachments                                             |
| `badgeReplay`             | `Replay`                                                                 | Badge label shown on session replay attachments                                               |
| `badgeVoiceNote`          | `Voice note`                                                             | Badge label shown on voice note attachments                                                   |
| `copyLink`                | `Copy link`                                                              | Copy report link button label (shown when `showReportLink` is enabled)                        |
| `copied`                  | `Copied!`                                                                | Feedback text after copying the report link                                                   |
| `minimizePanel`           | `Minimize`                                                               | Panel minimize button aria-label                                                              |
| `closePanel`              | `Close`                                                                  | Panel close button aria-label                                                                 |
| `toggleMicrophone`        | `Toggle microphone`                                                      | Recording bar microphone button aria-label                                                    |
| `selectMicrophone`        | `Select microphone`                                                      | Recording bar microphone picker aria-label                                                    |
| `microphone`              | `Microphone`                                                             | Name of an unlabeled microphone; the widget appends its number                                |
| `colorRed`                | `Red`                                                                    | Annotation color tooltip                                                                      |
| `colorYellow`             | `Yellow`                                                                 | Annotation color tooltip                                                                      |
| `colorGreen`              | `Green`                                                                  | Annotation color tooltip                                                                      |
| `colorBlue`               | `Blue`                                                                   | Annotation color tooltip                                                                      |
| `colorWhite`              | `White`                                                                  | Annotation color tooltip                                                                      |
| `removeAttachment`        | `Remove`                                                                 | Attachment remove button aria-label                                                           |
| `uploading`               | `Uploading`                                                              | Send button while uploading; the widget appends the file count and percentage                 |
| `viewReports`             | `View reports`                                                           | Footer link to the public portal                                                              |
| `poweredBy`               | `Powered by`                                                             | Footer branding; the widget appends "Bugdump"                                                 |
| `dismissBubble`           | `Dismiss`                                                                | Teaser bubble close button aria-label                                                         |
| `textPlaceholder`         | `Type text…`                                                             | Annotation text input placeholder                                                             |

## Filtering Noise

Embedding the widget on pages with chatty third-party scripts (analytics, feature-flag pollers, health checks) means every report ships a lot of noise. Use `consoleFilter` and `networkFilter` to drop entries _before_ they enter the rolling buffers — so the useful ones don't get evicted, and sensitive third-party traffic never leaves the browser.

### npm

```typescript
Bugdump.init({
  apiKey: 'your-api-key',
  consoleFilter: {
    levels: ['warn', 'error'], // drop info/debug/log
    exclude: ['[HMR]', /^\[Vue warn\]/], // strings are substring, RegExp uses .test()
    filter: (entry) => !entry.args[0]?.toString().startsWith('[GA]'),
  },
  networkFilter: {
    excludeUrls: ['segment.io', /\/health$/], // drop analytics + health checks
    excludeMethods: ['OPTIONS'], // drop CORS preflights
    // includeUrls: ['api.myapp.com'],           // if set, drop anything that doesn't match
    filter: (entry) => entry.status !== 401,
  },
});
```

**Evaluation order** (for both console and network):

1. Fast structural checks (`levels`, `excludeMethods`)
2. `includeUrls` (network only) — if set and no match, drop
3. `excludeUrls` / `exclude` — if any match, drop
4. Custom `filter()` — return `false` to drop; runs last

String patterns are **substring** matches (case-sensitive). RegExp patterns use `.test()`. `levels` and `excludeMethods` are exact-match lists.

### Script Tag

The script-tag version accepts the same filters as JSON on `data-console-filter` / `data-network-filter`. **Strings only** — regex and custom `filter()` predicates are npm-only (functions and regex don't serialize).

```html
<script
  src="https://bugdump.com/sdk/latest.js"
  async
  data-api-key="your-api-key"
  data-console-filter='{"levels":["warn","error"],"exclude":["[HMR]","[Vue warn]"]}'
  data-network-filter='{"excludeUrls":["segment.io","/health"],"excludeMethods":["OPTIONS"]}'
></script>
```

Unknown fields or non-string array entries in the JSON are ignored with a console warning — a malformed filter attribute never breaks SDK initialization.

## Data Collection Limits

The SDK keeps telemetry in rolling in-memory buffers and caps how much travels in a report. These limits are **fixed (not configurable)** and chosen to balance debugging detail against payload size — they're documented here so you know exactly what a report contains.

### Buffer sizes

| Buffer           | Idle cap            | While recording | Per-entry truncation            |
| ---------------- | ------------------- | --------------- | ------------------------------- |
| Console logs     | 300 entries         | 2000 entries    | 8 KB per argument               |
| Network requests | 150 entries         | 1000 entries    | 32 KB per request/response body |
| Session replay   | 15,000 rrweb events | —               | 3-minute rolling window         |

Each buffer is FIFO: once full, the oldest entries are evicted. Use [console/network filters](#filtering-noise) to keep noise out of these buffers so the entries you care about aren't pushed out.

### Recording overflow

While a screen recording or session replay is **actively recording**, the console and network buffers temporarily expand to their higher "while recording" caps (2000 logs / 1000 requests). This keeps the captured trace complete for the full recording window. When recording stops, the buffers trim back to their idle caps, keeping the newest entries. This applies to both `screen-capture` and `dom` recording methods.

### Submission payload cap

Before a report is sent, the full payload is capped at **10 MB**. If it exceeds that, the SDK trims in this order until it fits, so the most useful data survives:

1. Truncate each console-log argument to 512 bytes
2. Drop all network request/response bodies
3. Drop oldest console logs (keeps at least 30)
4. Drop oldest network requests (keeps at least 20)

The Bugdump API enforces a 25 MB request-body limit server-side; the 10 MB client cap stays well under it. The cap is measured by character count rather than UTF-8 byte length, and the large server-side margin absorbs that difference. File attachments (screenshots, recordings, voice notes) are uploaded separately via presigned URLs and are **not** counted against this payload cap.

When trimming occurs, the report records what was cut (bodies dropped, logs/requests dropped, args truncated). The Bugdump dashboard surfaces this as a **"Trimmed"** badge on the report and a notice in the report viewer, so anyone reading the report knows the telemetry is incomplete and why.

To keep memory bounded during long captures, the network collector also enforces a **5 MB total budget for captured request/response bodies** (only relevant when `captureNetworkBodies` is enabled). Once the budget is reached, further requests are still logged but their bodies are dropped — so a lengthy recording can't grow the tab's memory without limit. This is independent of the per-body 32 KB cap and the entry-count caps above.

### Performance metrics

The `performance` snapshot in each report (and `collectTelemetry().performance`) is read from the browser's standard timing APIs:

- **TTFB** — `responseStart` minus navigation start (`PerformanceNavigationTiming`)
- **FCP / First Paint** — `first-contentful-paint` / `first-paint` paint timings
- **DOM Content Loaded** — `domContentLoadedEventEnd`
- **Load** — `loadEventEnd`
- **Memory** — `usedJSHeapSize` / `totalJSHeapSize` / `jsHeapSizeLimit` from `performance.memory` (Chromium only; `null` elsewhere)

All timings are normalized against `activationStart`, so they remain correct for prerendered pages.

### Script Tag

Use `data-*` attributes to configure the widget. All attributes are optional except `data-api-key`.

```html
<script
  src="https://bugdump.com/sdk/latest.js"
  async
  data-api-key="your-api-key"
  data-api-url="https://api.bugdump.com"
  data-theme="auto"
  data-position="bottom-right"
  data-locale="auto"
  data-icon="chat"
  data-bubble-text="Found a bug?"
  data-hide-button="false"
  data-show-report-link="false"
  data-capture-network-bodies="false"
  data-screenshot="true"
  data-screenshot-method="screen-capture"
  data-screen-recording="true"
  data-screen-recording-method="screen-capture"
  data-session-replay="true"
  data-attachments="true"
  data-allow-task-attach="false"
  data-capture-errors="true"
  data-release="1.4.2"
  data-sample-rate="1"
  data-translations='{"title":"Report a bug","sendButton":"Send report"}'
></script>
```

| Data Attribute                 | Config Equivalent                | Default                   | Description                                                                             |
| ------------------------------ | -------------------------------- | ------------------------- | --------------------------------------------------------------------------------------- |
| `data-api-key`                 | `apiKey`                         | —                         | **Required.** Your Bugdump API key                                                      |
| `data-api-url`                 | `endpoint`                       | `https://api.bugdump.com` | Custom API endpoint                                                                     |
| `data-theme`                   | `theme`                          | `auto`                    | Widget theme: `light`, `dark`, or `auto`. Change it later with `setTheme`               |
| `data-position`                | `position`                       | `bottom-right`            | Widget corner: `bottom-right` or `bottom-left`                                          |
| `data-locale`                  | `locale`                         | `auto`                    | Widget language: `auto`, `en`, `ru`, `es`, `fr`, `pt`, `de` or any tag                  |
| `data-hide-button`             | `hideButton`                     | `false`                   | Hide the floating button                                                                |
| `data-show-report-link`        | `showReportLink`                 | `false`                   | Show a link to the created report on the success screen                                 |
| `data-icon`                    | `icon`                           | `chat`                    | Custom trigger button icon (predefined name, URL, SVG, or emoji)                        |
| `data-bubble-text`             | `bubbleText`                     | —                         | Dismissible teaser bubble next to the floating button                                   |
| `data-capture-network-bodies`  | `captureNetworkBodies`           | `false`                   | Capture request/response bodies                                                         |
| `data-screenshot`              | `features.screenshot`            | `true`                    | Screenshot capture button                                                               |
| `data-screenshot-method`       | `features.screenshotMethod`      | `screen-capture`          | `screen-capture` (getDisplayMedia) or `dom` (html2canvas)                               |
| `data-screen-recording`        | `features.screenRecording`       | `true`                    | Screen recording button                                                                 |
| `data-screen-recording-method` | `features.screenRecordingMethod` | `screen-capture`          | `screen-capture` (getDisplayMedia) or `dom` (rrweb)                                     |
| `data-session-replay`          | `features.sessionReplay`         | `true`                    | Background session replay collection                                                    |
| `data-attachments`             | `features.attachments`           | `true`                    | File attachment button                                                                  |
| `data-allow-task-attach`       | `features.allowTaskAttach`       | `false`                   | Show "Attach to task" toggle in the widget                                              |
| `data-capture-errors`          | `captureErrors`                  | `true`                    | Send uncaught errors and unhandled promise rejections                                   |
| `data-release`                 | `release`                        | —                         | Your build's version, such as a git commit                                              |
| `data-sample-rate`             | `sampleRate`                     | `1`                       | Share of automatically captured errors to send, from `0` to `1` (see below)             |
| `data-translations`            | `translations`                   | —                         | JSON string with translation overrides                                                  |
| `data-console-filter`          | `consoleFilter`                  | —                         | JSON object with `levels` / `exclude` arrays (strings only)                             |
| `data-network-filter`          | `networkFilter`                  | —                         | JSON object with `excludeUrls` / `includeUrls` / `excludeMethods` arrays (strings only) |

`data-sample-rate` never applies to `captureException` or to widget reports, which are always sent. An empty value is ignored rather than read as `0`.

### Theme

The widget supports three theme modes:

- **`auto`** (default) — Automatically matches the user's OS preference via `prefers-color-scheme`
- **`light`** — Always use the light theme
- **`dark`** — Always use the dark theme

> **Note:** Your account plan may also restrict certain features server-side. The widget respects both local config and server-side limits.

#### Changing the theme at runtime

`theme` / `data-theme` sets the theme the widget starts with. If your app has its own theme toggle, call `setTheme` whenever it changes: the widget switches immediately, an open panel included, and the screenshot editor uses the new theme the next time it opens. `auto` keeps following the OS preference.

```html
<script>
  bugdump('setTheme', 'dark'); // 'light', 'dark' or 'auto'
</script>
```

With the queue stub, `bugdump('setTheme', ...)` is safe to call before the SDK has loaded.

```typescript
// npm: pass the starting theme to init, then update it on every change
const bugdump = Bugdump.init({ apiKey: 'your-api-key', theme: 'dark' });
bugdump.setTheme('light');
```

Calling `setTheme` on the npm package before `init` throws, so always pass the starting theme to `init` as well.

### Custom Icon

Customize the floating button icon. The `icon` option accepts a string and auto-detects the type:

```typescript
// Predefined icon name
Bugdump.init({ apiKey: '...', icon: 'chat' });

// Custom SVG string
Bugdump.init({ apiKey: '...', icon: '<svg viewBox="0 0 24 24">...</svg>' });

// Image URL
Bugdump.init({ apiKey: '...', icon: 'https://example.com/icon.png' });

// Emoji
Bugdump.init({ apiKey: '...', icon: '🐛' });
```

Or via script tag:

```html
<script src="https://bugdump.com/sdk/latest.js" async data-api-key="your-api-key" data-icon="feedback"></script>
```

#### Predefined Icons

| Name        | Description                    |
| ----------- | ------------------------------ |
| `chat`      | Speech bubble (default)        |
| `bug`       | Bug icon                       |
| `feedback`  | Message bubble with text lines |
| `lightning` | Lightning bolt                 |

#### Detection Rules

| Input                                               | Detected As     |
| --------------------------------------------------- | --------------- |
| `bug`, `chat`, `feedback`, `lightning`              | Predefined icon |
| Starts with `<`                                     | HTML/SVG string |
| Starts with `http://`, `https://`, `//`, or `data:` | Image URL       |
| Anything else                                       | Text/emoji      |

## Report Link on Success Screen

When `showReportLink` is enabled, the success screen after submission shows a direct link to the created report in your Bugdump dashboard, along with a "Copy link" button. This is useful for team-internal widgets where reporters should be able to track their submissions.

```typescript
Bugdump.init({
  apiKey: 'your-api-key',
  showReportLink: true,
});
```

Or via script tag:

```html
<script src="https://bugdump.com/sdk/latest.js" async data-api-key="your-api-key" data-show-report-link="true"></script>
```

The link points to your project dashboard (e.g. `https://app.bugdump.com/projects/my-project/reports/{id}`). The dashboard URL is fetched automatically from the server — no additional configuration needed.

## Public Portal Link

When the **Public Portal** is enabled for your project (via Project Settings → Public Portal), the widget footer automatically shows a **"View reports"** link that opens your project's public portal in a new tab.

This requires no SDK configuration — the portal URL is fetched automatically from the server when the widget initializes. Enable or disable the portal at any time from your Bugdump dashboard; the widget picks up the change on next page load.

## Attach Reports to an Existing Task

By default, every submitted report creates a new task on the Bugdump side. If your users are already looking at a specific task (e.g. a kanban card, an issue page, a deep link from email) and you want follow-up reports to land on that same task instead of spawning new ones, enable `allowTaskAttach`.

Turn the feature on, and the widget renders an extra **"Attach to task"** toggle in the form. When the reporter expands it and enters a task's **public ID**, the submitted report is associated with that existing task instead of creating a new one.

### npm

```typescript
const bugdump = Bugdump.init({
  apiKey: 'your-api-key',
  features: {
    allowTaskAttach: true,
  },
});
```

### Script Tag

```html
<script
  src="https://bugdump.com/sdk/latest.js"
  async
  data-api-key="your-api-key"
  data-allow-task-attach="true"
></script>
```

### Pre-filling the Task ID Programmatically

If you already know which task the report should attach to (for example, the widget is opened from a "Report a problem with this task" button on a task detail page), pre-fill the task ID and skip asking the reporter:

```typescript
// Open the widget and pre-fill the task ID in one call
bugdump.open({ taskId: 42 });

// Or set it ahead of time and open later
bugdump.identifyTask(42);
bugdump.open();

// Clear a previously set task ID
bugdump.clearTask();

// Read the currently attached task ID
const activeTaskId = bugdump.getActiveTaskId(); // number | null
```

The `allowTaskAttach` feature must still be enabled for the server to accept the task association — setting a task ID programmatically without enabling the feature has no effect on the submitted report.

## Headless Mode (No Floating Button)

Hide the default floating button and trigger the report form from your own UI. With no button to clear, the panel sits flush in its corner, the same distance from both edges.

### npm

```typescript
import { Bugdump } from '@bugdump/sdk';

const bugdump = Bugdump.init({
  apiKey: 'your-api-key',
  hideButton: true,
});

// Open from your own button, menu item, keyboard shortcut, etc.
document.getElementById('my-report-btn')?.addEventListener('click', () => {
  bugdump.open();
});
```

### Script Tag

```html
<script>
  window.bugdump =
    window.bugdump ||
    function () {
      (window.bugdump.q = window.bugdump.q || []).push(arguments);
    };
</script>
<script src="https://bugdump.com/sdk/latest.js" async data-api-key="your-api-key" data-hide-button="true"></script>
<script>
  document.getElementById('my-report-btn').addEventListener('click', function () {
    bugdump('open');
  });
</script>
```

With the queue stub, a click that lands before the SDK has finished downloading is queued and replayed instead of throwing.

### React example

```tsx
import { useEffect, useCallback } from 'react';
import { Bugdump } from '@bugdump/sdk';

function App() {
  useEffect(() => {
    const bugdump = Bugdump.init({
      apiKey: 'your-api-key',
      hideButton: true,
    });

    return () => bugdump.destroy();
  }, []);

  const openReportForm = useCallback(() => {
    Bugdump.getInstance()?.open();
  }, []);

  return <button onClick={openReportForm}>Report a Bug</button>;
}
```

## Your Own Report Form

Build the form yourself — in your own dialog, with your own components — and send what it collects with `submit()`. The widget's panel is never shown; `hideButton: true` keeps its floating button off the page as well.

```typescript
const bugdump = Bugdump.init({ apiKey: 'your-api-key', hideButton: true });

const { taskPublicId } = await bugdump.submit({
  description: 'The checkout button does nothing',
  reporterName: 'Jane Doe',
  reporterEmail: 'jane@example.com',
  priority: 'High',
  files: Array.from(fileInput.files ?? []),
});
```

Only `description` is required. Everything the widget attaches is attached here too: console logs, network requests, recent user actions, performance data, the page URL, browser and viewport, your `setContext()` data, and the session replay when your plan includes it.

| Option          | Type     | Description                                                                                                                                                               |
| --------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `description`   | `string` | **Required.** The report text, up to 10,000 characters                                                                                                                    |
| `reporterName`  | `string` | Falls back to the name passed to `identify()`                                                                                                                             |
| `reporterEmail` | `string` | Must be a valid email. Falls back to the email passed to `identify()`                                                                                                     |
| `priority`      | `string` | A priority label as your project defines it, e.g. `"High"`, matched case-insensitively. A label the project does not have is ignored, and so is any priority on a report attached to an existing task |
| `taskId`        | `number` | Attach the report to an existing task by its public ID instead of creating a new one. Falls back to `identifyTask()`                                                     |
| `files`         | `Blob[]` | Uploaded as attachments. A `File` keeps its name                                                                                                                          |

`submit()` resolves with `{ id, taskId, taskPublicId }` and rejects with a `BugdumpApiError` when the report is refused (see [Error Handling](#error-handling)). Disable your send button while it runs: each file is uploaded in its own request before the report, and every request counts toward your project's per-minute widget rate limit.

`submit()` returns a promise, so it is not a queued command. From a script tag, call it on the instance once the SDK has loaded: `window.Bugdump.getInstance()?.submit({ description })`.

## Identify Users

Associate bug reports with your authenticated users:

```typescript
bugdump.identify({
  id: 'user-123',
  name: 'Jane Doe',
  email: 'jane@example.com',
});
```

## Restrict to Authenticated Users Only

By default, anyone visiting your site can submit bug reports. If you want to allow only your registered (logged-in) users to report bugs, initialize the SDK **after** authentication and call `identify()` with the user's info.

### npm

```typescript
import { Bugdump } from '@bugdump/sdk';

// Initialize only after the user has logged in
function onUserLogin(user: { id: string; name: string; email: string }) {
  const bugdump = Bugdump.init({
    apiKey: 'your-api-key',
  });

  bugdump.identify({
    id: user.id,
    name: user.name,
    email: user.email,
  });
}

// Clear user identity on logout (keeps the widget active)
function onUserLogout() {
  Bugdump.getInstance()?.reset();
}
```

#### React example

```tsx
import { useEffect } from 'react';
import { Bugdump } from '@bugdump/sdk';

function App() {
  const user = useAuth(); // your auth hook

  useEffect(() => {
    const bugdump = Bugdump.init({
      apiKey: 'your-api-key',
    });

    if (user) {
      bugdump.identify({
        id: user.id,
        name: user.name,
        email: user.email,
      });
    } else {
      bugdump.reset();
    }

    return () => {
      bugdump.destroy();
    };
  }, [user]);

  return <div>{/* your app */}</div>;
}
```

### Script Tag

When using the `<script>` tag, **do not** use the `data-api-key` attribute (which auto-initializes the widget for everyone). Instead, load the script without auto-init and initialize manually after authentication:

```html
<script>
  window.bugdump =
    window.bugdump ||
    function () {
      (window.bugdump.q = window.bugdump.q || []).push(arguments);
    };
</script>
<!-- Load the SDK without auto-init (no data-api-key) -->
<script src="https://bugdump.com/sdk/latest.js" async></script>

<script>
  // Call this after your user has logged in
  function initBugdump(user) {
    bugdump('init', { apiKey: 'your-api-key' });
    bugdump('identify', {
      id: user.id,
      name: user.name,
      email: user.email,
    });
  }

  // Call this on logout
  function onLogout() {
    bugdump('reset');
  }

  // Example: init after your app confirms the user is authenticated
  if (window.currentUser) {
    initBugdump(window.currentUser);
  }
</script>
```

## Custom Context

Attach arbitrary data to every report:

```typescript
bugdump.setContext({
  plan: 'pro',
  feature: 'checkout',
  buildVersion: '1.2.3',
});
```

## Automatic error capture

The SDK sends the uncaught errors and unhandled promise rejections on your site to Bugdump by itself, with the console logs, network requests and user actions that led up to them. Nothing is shown to the user. Repeats of one error are grouped into a single entry on your project's **Errors** page, with an event count and when it was first and last seen, and from there a teammate turns it into a task or links it to one.

It is on by default. Turn it off for a site with `captureErrors: false`, or for the whole project in its settings.

### npm

```typescript
Bugdump.init({
  apiKey: 'your-api-key',
  captureErrors: true, // send uncaught errors and unhandled rejections
  release: import.meta.env.VITE_GIT_SHA, // your build's version
  sampleRate: 1, // share of automatically captured errors to send, 0 to 1
  ignoreErrors: ['AbortError', /^NetworkError:/], // matched against "type: message"
  beforeSend(event) {
    event.error.message = event.error.message.replace(/token=\w+/g, 'token=[redacted]');
    return event; // or null to drop it
  },
});
```

| Option          | Type                                                      | Default | Description                                                                                                                                                                                              |
| --------------- | --------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `captureErrors` | `boolean`                                                 | `true`  | Send uncaught errors and unhandled promise rejections. `captureException` works either way                                                                                                               |
| `release`       | `string`                                                  | —       | Your build's version, such as a git commit. Optional; see [Releases](#releases)                                                                                                                          |
| `sampleRate`    | `number`                                                  | `1`     | Share of automatically captured errors to send, from `0` to `1`, decided once per error. Never applies to `captureException` or widget reports. A value outside 0–1 logs a warning and sends every error |
| `ignoreErrors`  | `Array<string \| RegExp>`                                 | —       | Automatically captured errors to drop, matched against `type: message`, e.g. `TypeError: Load failed`. Strings match as substrings, RegExp patterns use `.test()`                                        |
| `beforeSend`    | `(event: BugdumpErrorEvent) => BugdumpErrorEvent \| null` | —       | Change an event before it is sent, or return `null` to drop it                                                                                                                                           |

### Script Tag

```html
<script
  src="https://bugdump.com/sdk/latest.js"
  async
  data-api-key="your-api-key"
  data-release="1.4.2"
  data-sample-rate="0.5"
></script>
```

`data-capture-errors="false"` turns automatic capture off. An empty attribute is ignored, so `data-sample-rate=""` sends every error, while `data-sample-rate="0"` sends none. `ignoreErrors` and `beforeSend` take regular expressions and functions, so they have no attribute: to use them, load the script without `data-api-key` and call `bugdump('init', { ... })` (see [Manual IIFE](#manual-iife-without-auto-init)).

### Errors you catch yourself

```typescript
try {
  await checkout();
} catch (error) {
  bugdump.captureException(error, { context: { step: 'payment' } });
  showErrorMessage();
}
```

`captureException(error, options?)` sends an error your code handled, marked as handled ("Reported by the app" on the error page). `options.context` is merged over your `setContext()` data for that one event. It is sent even when `captureErrors` is off or `sampleRate` is `0`, but it follows the once-per-session and per-minute limits below, so an error boundary that keeps failing cannot flood your project. It never throws; on an instance that is not initialized it logs a warning. From a script tag it is a queued command: `bugdump('captureException', error)`.

### What an error event carries

The error's type, message (up to 2,000 characters) and stack (up to 32,000), `release`, the user from `identify()`, your `setContext()` data, the page URL, browser and viewport, performance data, and the last 100 console logs, 50 network requests and 200 user actions from the last minute. An event is capped at 200 KB of UTF-8 and trimmed in the order described under [Submission payload cap](#submission-payload-cap). Error events carry no screenshot and no session replay.

An event under 64 KB is sent with `keepalive`, so it still arrives when the error happens while the page is unloading.

### beforeSend

`beforeSend` runs for every event, `captureException` included, and receives:

```typescript
interface BugdumpErrorEvent {
  eventId: string;
  occurredAt: number; // ms since the epoch
  release?: string;
  error: {
    type: string; // e.g. "TypeError", or "UnhandledRejection" for a rejected non-Error value
    message: string;
    stack?: string;
    filename?: string;
    lineno?: number;
    colno?: number;
    mechanism: 'onerror' | 'unhandledrejection' | 'manual';
    handled: boolean;
  };
  customContext?: Record<string, unknown>;
}
```

Return the event, changed or not, to send it, or `null` to drop it. If `beforeSend` throws, the event is sent unchanged and a warning is logged.

### What is never sent

- `Script error.` with no file and no line: an error from a cross-origin script that the browser hides. Load that script with `crossorigin="anonymous"` and serve it with CORS headers to see its errors.
- Errors with a frame in a browser extension (`chrome-extension:`, `moz-extension:`, `safari-extension:`, `safari-web-extension:`).
- `ResizeObserver loop limit exceeded` and `ResizeObserver loop completed with undelivered notifications`, which browsers report for harmless layout loops.
- Errors from the SDK's own code: its API errors, messages starting with `[Bugdump]`, and, in the script tag build, errors whose stack runs only through the SDK's files. In the npm build the SDK is bundled into your code and cannot tell its frames from yours, so an exception inside the widget's own UI is captured like one of your errors.
- Errors matching your `ignoreErrors`.

`ignoreErrors` and the list above apply to automatically captured errors; `captureException` sends what you pass it.

### Noise control

After the ignore rules, in this order:

1. **Sampling.** An error is kept when `Math.random() < sampleRate`. A dropped error counts toward neither of the next two limits.
2. **Once per session.** Each distinct error (the same type, message and top stack frame) is sent once per browser tab session, remembered in `sessionStorage` under `bugdump:sent-errors`.
3. **10 a minute.** At most 10 error events a minute per page, `captureException` included.
4. **Stop on refusal.** When the API answers that error capture is off for the project, or that its monthly error limit is used up, the SDK stops sending errors for the rest of the page.

Every event sent counts toward your project's monthly error limit, including events of errors marked Ignored on the Errors page. To stop sending an error, add it to `ignoreErrors`.

### Releases

`release` is optional. It is shown with each error and decides when a resolved task comes back: a task linked to an error reopens when the error arrives from a release it has not been seen in, so a tab still running an old build never reopens it. Without `release`, an error reopens its resolved task only when the task was resolved more than 24 hours ago. Readable stack traces never depend on it.

## Readable stack traces

A stack trace from minified code points into one long line. Upload your source maps with the Bugdump CLI, `@bugdump/cli`, and the error page shows your original files, lines and code instead. The CLI stamps a debug ID into each built JavaScript file and its map, and Bugdump finds the map for every frame by that ID. Maps are stored privately and never served to anyone.

```bash
npm install --save-dev @bugdump/cli
```

1. Build with hidden source maps, so the maps are written but your files don't reference them: `vite build --sourcemap hidden`, `devtool: 'hidden-source-map'` in webpack, or `output.sourcemap: 'hidden'` in Rollup.
2. Run `bugdump sourcemaps inject <dir>` on the build output. It adds a one-line snippet and a `//# debugId=` comment to each JavaScript file that has a map, and the same ID to the map. It needs no token, and running it twice changes nothing.
3. Run `bugdump sourcemaps upload <dir>` with a release token from your project's **Source maps** page in `BUGDUMP_RELEASE_TOKEN`. `--delete-after` deletes the maps from the folder once they are uploaded, so they are never deployed. `--release` is optional and only affects reopening (see [Releases](#releases)); pass `--endpoint` if you use a custom API endpoint.
4. Deploy the injected files. A deploy of the output from before `inject` carries no debug IDs, and its frames stay minified.

```bash
vite build --sourcemap hidden
bugdump sourcemaps inject dist
bugdump sourcemaps upload dist --release "$GIT_SHA" --delete-after
# then deploy dist
```

Lazily loaded chunks are covered too: each one registers its debug ID when it loads.

## Programmatic Control

```typescript
// Open the report panel (optionally pre-attaching to an existing task)
bugdump.open();
bugdump.open({ taskId: 42 });

// Close the report panel
bugdump.close();

// Switch the widget theme ('light', 'dark' or 'auto')
bugdump.setTheme('dark');

// Check if the panel is open
bugdump.isWidgetOpen();

// Send a report from your own form (see Your Own Report Form)
await bugdump.submit({ description: 'The checkout button does nothing' });

// Send an error you caught yourself (see Automatic error capture)
bugdump.captureException(error, { context: { step: 'payment' } });

// Collect telemetry snapshot without submitting
const telemetry = bugdump.collectTelemetry();

// Get the resolved config
bugdump.getConfig();

// Get the current user context
bugdump.getUser();

// Get the custom context
bugdump.getContext();

// Get the internal HTTP client (for submitReport / upload helpers)
bugdump.getHttpClient();

// Attach subsequent reports to an existing task by its public ID
bugdump.identifyTask(42);

// Stop attaching to a task — new reports will create new tasks again
bugdump.clearTask();

// Read the currently attached task ID, if any
bugdump.getActiveTaskId();

// Clear user identity and custom context (e.g., on logout)
bugdump.reset();

// Clean up and remove the widget
bugdump.destroy();
```

## Telemetry Snapshot

`collectTelemetry()` returns:

```typescript
interface TelemetrySnapshot {
  consoleLogs: ConsoleLogEntry[];
  networkRequests: NetworkRequestEntry[];
  sessionReplayEvents: eventWithTime[];
  performance: PerformanceSnapshot;
  metadata: MetadataSnapshot;
}
```

## Error Handling

```typescript
import { Bugdump, BugdumpApiError } from '@bugdump/sdk';

try {
  await bugdump.submit({ description });
} catch (error) {
  if (error instanceof BugdumpApiError) {
    console.error(`Error ${error.statusCode}: ${error.message}`);
  }
}
```

`error.code` holds the code the API answered with. Two codes mean the project is not accepting reports right now. Both come with status `403`; don't retry them, because sending again fails the same way until the limit clears.

| Code                    | Status | Meaning                                                                                             |
| ----------------------- | ------ | --------------------------------------------------------------------------------------------------- |
| `REPORT_QUOTA_EXCEEDED` | `403`  | The project has used its monthly report quota. Reports are accepted again from the 1st (00:00 UTC). |
| `TASK_LIMIT_REACHED`    | `403`  | The project is on the Free plan and has reached its task limit.                                     |

The built-in widget handles both itself: it shows the `quotaExceededMessage` notice and disables its Send button.

Failed requests are retried before a promise rejects. A report, each of its file uploads and an error event get up to 3 attempts, about 1 s and then 2 s apart, when a request fails on the network, times out after 30 s or gets a `5xx` answer; no other `4xx`, `429` included, is retried. Each report carries a `clientReportId`, so a retry of a report that already arrived gets the first result back instead of creating a second task. The widget keeps that id when you press Send again after a failure, and does not upload the files that already went up. Each `submit()` call makes a new id, so calling `submit()` again after it rejects can file the report twice.

## TypeScript

The SDK exports all types you need:

```typescript
import type {
  BugdumpConfig,
  BugdumpErrorEvent,
  BugdumpLocale,
  BugdumpPosition,
  BugdumpTheme,
  BugdumpTranslations,
  BugdumpUserContext,
  CaptureMethod,
  ConsoleFilterOptions,
  NetworkFilterOptions,
  ReportPayload,
  ReportResponse,
  SubmitOptions,
  TelemetrySnapshot,
  ConsoleLogEntry,
  NetworkRequestEntry,
  PerformanceSnapshot,
  MetadataSnapshot,
  ScreenshotOptions,
  ScreenshotResult,
  AnnotationTool,
  DrawOperation,
} from '@bugdump/sdk';
```

## License

MIT
