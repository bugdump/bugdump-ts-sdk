# @bugdump/sdk

Official TypeScript SDK for [Bugdump](https://bugdump.com) - embed a bug reporting widget on your website and collect detailed reports from your users.

## Features

- **Embeddable widget** - Floating bug report button with screenshot, screen recording, and voice notes
- **Auto-collects telemetry** - Console logs, network requests, session replay, and performance data
- **Screenshot annotations** - Users can draw, highlight, and blur parts of screenshots
- **TypeScript-first** - Full type definitions out of the box
- **Shadow DOM isolated** - Widget styles never leak into your app
- **Auto-init** - Single script tag with `data-api-key`, no JS required

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
  projectKey: 'your-project-key',
});
```

### Manual IIFE (without auto-init)

```html
<script src="https://bugdump.com/sdk/latest.js"></script>
<script>
  Bugdump.init({ projectKey: 'your-project-key' });
</script>
```

## Configuration

| Option | Type | Required | Description |
|---|---|---|---|
| `projectKey` | `string` | Yes | Your Bugdump project key |
| `hideButton` | `boolean` | No | Hide the floating button and trigger the widget programmatically |

## Headless Mode (No Floating Button)

Hide the default floating button and trigger the report form from your own UI:

### npm

```typescript
import { Bugdump } from '@bugdump/sdk';

const bugdump = Bugdump.init({
  projectKey: 'your-project-key',
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
      projectKey: 'your-project-key',
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
    projectKey: 'your-project-key',
  });

  bugdump.identify({
    id: user.id,
    name: user.name,
    email: user.email,
  });
}

// Clean up on logout
function onUserLogout() {
  Bugdump.getInstance()?.destroy();
}
```

#### React example

```tsx
import { useEffect } from 'react';
import { Bugdump } from '@bugdump/sdk';

function App() {
  const user = useAuth(); // your auth hook

  useEffect(() => {
    if (!user) return;

    const bugdump = Bugdump.init({
      projectKey: 'your-project-key',
    });

    bugdump.identify({
      id: user.id,
      name: user.name,
      email: user.email,
    });

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
    var bugdump = Bugdump.init({ projectKey: 'your-project-key' });

    bugdump.identify({
      id: user.id,
      name: user.name,
      email: user.email,
    });
  }

  // Call this on logout
  function destroyBugdump() {
    var instance = Bugdump.getInstance();
    if (instance) instance.destroy();
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
    console.error(`Error ${error.status}: ${error.message}`);
  }
}
```

## TypeScript

The SDK exports all types you need:

```typescript
import type {
  BugdumpConfig,
  BugdumpUserContext,
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
