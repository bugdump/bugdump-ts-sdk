# @bugdump/sdk

Official TypeScript SDK for [Bugdump](https://bugdump.com) - embed a bug reporting widget on your website and collect detailed reports from your users.

## Features

- **Embeddable widget** - Floating bug report button with screenshot, screen recording, and voice notes
- **Auto-collects telemetry** - Console logs, network requests, session replay, and performance data
- **Screenshot annotations** - Users can draw, highlight, and blur parts of screenshots
- **TypeScript-first** - Full type definitions out of the box
- **Shadow DOM isolated** - Widget styles never leak into your app
- **Auto-init** - Single script tag with `data-project`, no JS required

## Installation

### Script Tag (Recommended)

Drop a single line into your HTML — the widget initializes automatically:

```html
<script src="https://bugdump.com/sdk/latest.js" data-project="your-project-key"></script>
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

## Identify Users

Associate bug reports with your authenticated users:

```typescript
bugdump.identify({
  id: 'user-123',
  name: 'Jane Doe',
  email: 'jane@example.com',
});
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
