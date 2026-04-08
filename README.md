# @bugdump/sdk

Official TypeScript SDK for [Bugdump](https://bugdump.com) - embed a bug reporting widget on your website and collect detailed reports from your users.

## Features

- **Embeddable widget** - Floating bug report button with screenshot, screen recording, and voice notes
- **Auto-collects telemetry** - Console logs, network requests, session replay, and performance data
- **Screenshot annotations** - Users can draw, highlight, and blur parts of screenshots
- **TypeScript-first** - Full type definitions out of the box
- **Shadow DOM isolated** - Widget styles never leak into your app
- **Auto-init** - Single script tag with `data-api-key`, no JS required
- **Report link** - Optionally show a direct link to the created report after submission with a copy button
- **Public portal link** - Automatically shows a "View reports" link in the widget footer when the public portal is enabled for your project

## Installation

### Script Tag (Recommended)

Drop a single line into your HTML — the widget initializes automatically:

```html
<script src="https://bugdump.com/sdk/latest.js" data-api-key="your-api-key"></script>
```

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
<script src="https://bugdump.com/sdk/latest.js"></script>
<script>
  Bugdump.init({ apiKey: 'your-api-key' });
</script>
```

## Configuration

### npm

```typescript
const bugdump = Bugdump.init({
  apiKey: 'your-api-key',
  endpoint: 'https://api.bugdump.com',  // Custom API endpoint
  theme: 'auto',                         // Widget color theme
  icon: 'chat',                           // Trigger button icon
  hideButton: false,                      // Hide the floating button
  showReportLink: false,                  // Show report link after submission
  captureNetworkBodies: false,            // Capture request/response bodies
  features: {
    screenshot: true,                     // Screenshot capture
    screenshotMethod: 'dom',              // 'dom' (html2canvas) or 'screen-capture' (getDisplayMedia)
    screenRecording: true,                // Screen recording
    screenRecordingMethod: 'dom',         // 'dom' (rrweb) or 'screen-capture' (getDisplayMedia)
    sessionReplay: true,                  // Session replay collection
    attachments: true,                    // File attachments
  },
});
```

| Option | Type | Default | Description |
|---|---|---|---|
| `apiKey` | `string` | — | **Required.** Your Bugdump API key |
| `endpoint` | `string` | `https://api.bugdump.com` | Custom API endpoint |
| `theme` | `'light' \| 'dark' \| 'auto'` | `'auto'` | Widget color theme. `auto` follows the user's OS preference |
| `hideButton` | `boolean` | `false` | Hide the floating button and trigger the widget programmatically |
| `showReportLink` | `boolean` | `false` | Show a link to the created report on the success screen with a copy button |
| `icon` | `string` | `'chat'` | Custom trigger button icon (see [Custom Icon](#custom-icon) below) |
| `captureNetworkBodies` | `boolean` | `false` | Include request/response bodies in network logs |
| `features` | `object` | all `true` | Enable/disable widget features (see below) |
| `translations` | `object` | English defaults | Override widget UI strings (see below) |

#### Feature Toggles

| Feature | Default | Description |
|---|---|---|
| `features.screenshot` | `true` | Screenshot capture button |
| `features.screenshotMethod` | `'dom'` | `'dom'` uses html2canvas (no prompt). `'screen-capture'` uses getDisplayMedia (pixel-perfect, shows permission dialog) |
| `features.screenRecording` | `true` | Screen recording button |
| `features.screenRecordingMethod` | `'dom'` | `'dom'` uses rrweb (no prompt, DOM-based). `'screen-capture'` uses getDisplayMedia (pixel-perfect, shows permission dialog) |
| `features.sessionReplay` | `true` | Background session replay collection |
| `features.attachments` | `true` | File attachment button |

#### Translations

Customize any widget UI string by passing a `translations` object. Only override the keys you need — everything else falls back to English defaults.

```typescript
const bugdump = Bugdump.init({
  apiKey: 'your-api-key',
  translations: {
    title: 'Сообщить об ошибке',
    descriptionPlaceholder: 'Опишите найденную ошибку...',
    sendButton: 'Отправить отчёт',
    successTitle: 'Отчёт отправлен!',
    successSubtitle: 'Спасибо за ваш отзыв.',
  },
});
```

| Key | Default | Description |
|---|---|---|
| `title` | `Send feedback` | Panel header title and trigger button aria-label |
| `descriptionPlaceholder` | `What's on your mind?` | Textarea placeholder |
| `attachButton` | `Attach` | File attach button label |
| `screenshotButton` | `Screenshot` | Screenshot button label |
| `recordButton` | `Record` | Screen recording button label |
| `sendButton` | `Send` | Submit button label |
| `reporterToggle` | `Reporter info` | Reporter section toggle label |
| `namePlaceholder` | `Your name` | Name input placeholder |
| `emailPlaceholder` | `Your email` | Email input placeholder |
| `capturing` | `Capturing...` | Screenshot loading state |
| `stop` | `Stop` | Recording stop button label |
| `sending` | `Sending...` | Submit loading state |
| `successTitle` | `Feedback sent!` | Success message title |
| `successSubtitle` | `Thank you for your feedback.` | Success message subtitle |
| `errorMessage` | `Something went wrong. Please try again.` | Error message |
| `arrowTool` | `Arrow` | Annotation arrow tool tooltip |
| `rectangleTool` | `Rectangle` | Annotation rectangle tool tooltip |
| `drawTool` | `Draw` | Annotation freehand tool tooltip |
| `textTool` | `Text` | Annotation text tool tooltip |
| `blurTool` | `Blur` | Annotation blur tool tooltip |
| `undo` | `Undo` | Annotation undo button tooltip |
| `cancel` | `Cancel` | Annotation cancel button label |
| `done` | `Done` | Annotation confirm button label |
| `copyLink` | `Copy link` | Copy report link button label (shown when `showReportLink` is enabled) |
| `copied` | `Copied!` | Feedback text after copying the report link |

### Script Tag

Use `data-*` attributes to configure the widget. All attributes are optional except `data-api-key`.

```html
<script
  src="https://bugdump.com/sdk/latest.js"
  data-api-key="your-api-key"
  data-api-url="https://api.bugdump.com"
  data-theme="auto"
  data-icon="chat"
  data-hide-button="false"
  data-show-report-link="false"
  data-capture-network-bodies="false"
  data-screenshot="true"
  data-screenshot-method="dom"
  data-screen-recording="true"
  data-screen-recording-method="dom"
  data-session-replay="true"
  data-attachments="true"
  data-translations='{"title":"Report a bug","sendButton":"Send report"}'
></script>
```

| Data Attribute | Config Equivalent | Default | Description |
|---|---|---|---|
| `data-api-key` | `apiKey` | — | **Required.** Your Bugdump API key |
| `data-api-url` | `endpoint` | `https://api.bugdump.com` | Custom API endpoint |
| `data-theme` | `theme` | `auto` | Widget theme: `light`, `dark`, or `auto` |
| `data-hide-button` | `hideButton` | `false` | Hide the floating button |
| `data-show-report-link` | `showReportLink` | `false` | Show a link to the created report on the success screen |
| `data-icon` | `icon` | `chat` | Custom trigger button icon (predefined name, URL, SVG, or emoji) |
| `data-capture-network-bodies` | `captureNetworkBodies` | `false` | Capture request/response bodies |
| `data-screenshot` | `features.screenshot` | `true` | Screenshot capture button |
| `data-screenshot-method` | `features.screenshotMethod` | `dom` | `dom` (html2canvas) or `screen-capture` (getDisplayMedia) |
| `data-screen-recording` | `features.screenRecording` | `true` | Screen recording button |
| `data-screen-recording-method` | `features.screenRecordingMethod` | `dom` | `dom` (rrweb) or `screen-capture` (getDisplayMedia) |
| `data-session-replay` | `features.sessionReplay` | `true` | Background session replay collection |
| `data-attachments` | `features.attachments` | `true` | File attachment button |
| `data-translations` | `translations` | — | JSON string with translation overrides |

### Theme

The widget supports three theme modes:

- **`auto`** (default) — Automatically matches the user's OS preference via `prefers-color-scheme`
- **`light`** — Always use the light theme
- **`dark`** — Always use the dark theme

> **Note:** Your account plan may also restrict certain features server-side (e.g., screen recording is only available on Pro and Ultra plans). The widget respects both local config and server-side limits.

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
<script src="https://bugdump.com/sdk/latest.js" data-api-key="your-api-key" data-icon="feedback"></script>
```

#### Predefined Icons

| Name | Description |
|---|---|
| `chat` | Speech bubble (default) |
| `bug` | Bug icon |
| `feedback` | Message bubble with text lines |
| `lightning` | Lightning bolt |

#### Detection Rules

| Input | Detected As |
|---|---|
| `bug`, `chat`, `feedback`, `lightning` | Predefined icon |
| Starts with `<` | HTML/SVG string |
| Starts with `http://`, `https://`, `//`, or `data:` | Image URL |
| Anything else | Text/emoji |

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
<script src="https://bugdump.com/sdk/latest.js" data-api-key="your-api-key" data-show-report-link="true"></script>
```

The link points to your project dashboard (e.g. `https://app.bugdump.com/projects/my-project/reports/{id}`). The dashboard URL is fetched automatically from the server — no additional configuration needed.

## Public Portal Link

When the **Public Portal** is enabled for your project (via Project Settings → Public Portal), the widget footer automatically shows a **"View reports"** link that opens your project's public portal in a new tab.

This requires no SDK configuration — the portal URL is fetched automatically from the server when the widget initializes. Enable or disable the portal at any time from your Bugdump dashboard; the widget picks up the change on next page load.

## Headless Mode (No Floating Button)

Hide the default floating button and trigger the report form from your own UI:

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
<script src="https://bugdump.com/sdk/latest.js" data-api-key="your-api-key" data-hide-button="true"></script>
<script>
  document.getElementById('my-report-btn').addEventListener('click', function () {
    Bugdump.getInstance().open();
  });
</script>
```

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
<!-- Load the SDK without auto-init (no data-api-key) -->
<script src="https://bugdump.com/sdk/latest.js"></script>

<script>
  // Call this after your user has logged in
  function initBugdump(user) {
    const bugdump = Bugdump.init({ apiKey: 'your-api-key' });

    bugdump.identify({
      id: user.id,
      name: user.name,
      email: user.email,
    });
  }

  // Call this on logout
  function onLogout() {
    Bugdump.getInstance()?.reset();
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

## Programmatic Control

```typescript
// Open the report panel
bugdump.open();

// Close the report panel
bugdump.close();

// Check if the panel is open
bugdump.isWidgetOpen();

// Collect telemetry snapshot without submitting
const telemetry = bugdump.collectTelemetry();

// Get the resolved config
bugdump.getConfig();

// Get the current user context
bugdump.getUser();

// Get the custom context
bugdump.getContext();

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
  await bugdump.getHttpClient().submitReport(payload);
} catch (error) {
  if (error instanceof BugdumpApiError) {
    console.error(`Error ${error.statusCode}: ${error.message}`);
  }
}
```

## TypeScript

The SDK exports all types you need:

```typescript
import type {
  BugdumpConfig,
  BugdumpTheme,
  BugdumpTranslations,
  BugdumpUserContext,
  CaptureMethod,
  ReportPayload,
  ReportResponse,
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
