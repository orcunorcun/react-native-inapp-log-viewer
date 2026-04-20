# react-native-inapp-log-viewer

Runtime log capture and in-app log viewer for React Native.

`react-native-inapp-log-viewer` helps you collect logs from app runtime events (console, Redux actions, network requests, global JS errors, and custom events) and inspect them directly inside the app.

<img width="330" src="https://github.com/user-attachments/assets/fa39d110-b622-4499-9684-ab2072c415cd" />

## Features

- Core logger with ring-buffer storage and optional persistence
- Built-in data normalization and sensitive-field redaction
- Adapters for `console`, `redux`, `axios`, `fetch`, and global JS error handler
- React hooks and provider API
- UI components: `InAppLogViewer` (embedded viewer) and `InAppLogViewerModalButton` (floating trigger + modal viewer)

## Installation

Using yarn:

```sh
yarn add react-native-inapp-log-viewer
```

Using npm:

```sh
npm install react-native-inapp-log-viewer
```

No native module setup is required.

Optional integrations:

- Redux action logging works with both `redux` and `@reduxjs/toolkit`.
- Axios logging requires passing your existing axios instance.

## Quick Start

```tsx
import axios from 'axios';
import React from 'react';
import {
  configureDefaultLogger,
  setupInAppLogger,
  InAppLoggerProvider,
  InAppLogViewerModalButton,
} from 'react-native-inapp-log-viewer';

const logger = configureDefaultLogger({
  enabled: __DEV__,
  maxEntries: 1000,
});

setupInAppLogger({
  logger,
  enabled: __DEV__,
  axiosInstance: axios,
});

export function App() {
  return (
    <InAppLoggerProvider logger={logger}>
      {/* your app */}
      <InAppLogViewerModalButton />
    </InAppLoggerProvider>
  );
}
```

### One-call setup helper

```ts
import axios from 'axios';
import { configureDefaultLogger, setupInAppLogger } from 'react-native-inapp-log-viewer';

const logger = configureDefaultLogger({ enabled: __DEV__ });

const { teardown } = setupInAppLogger({
  logger,
  enabled: __DEV__,
  axiosInstance: axios,
  ignoreReduxLogger: true,
});

// Optional: call teardown() when you want to detach adapters.
```

## Adapter Usage

### Redux actions (Redux Toolkit)

```ts
import { configureStore } from '@reduxjs/toolkit';
import { createReduxActionLogMiddleware } from 'react-native-inapp-log-viewer';

const store = configureStore({
  reducer: rootReducer,
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware().concat(
      createReduxActionLogMiddleware(logger, {
        includePayloadInSummary: false,
      }),
    ),
});
```

`@reduxjs/toolkit` is optional for this library. It is shown here only because many apps already use Toolkit.

### Redux actions (Plain Redux)

```ts
import { applyMiddleware, combineReducers, legacy_createStore as createStore } from 'redux';
import { createReduxActionLogMiddleware } from 'react-native-inapp-log-viewer';

const rootReducer = combineReducers({
  // your reducers
});

const store = createStore(
  rootReducer,
  applyMiddleware(
    createReduxActionLogMiddleware(logger, {
      includePayloadInSummary: false,
    }),
  ),
);
```

### Axios

```ts
import axios from 'axios';
import { attachAxiosLogger } from 'react-native-inapp-log-viewer';

const detachAxiosLogger = attachAxiosLogger(logger, axios, {
  enabled: __DEV__,
});

// call detachAxiosLogger() when needed
```

### Fetch

```ts
import { createFetchLogger } from 'react-native-inapp-log-viewer';

global.fetch = createFetchLogger(logger, {
  fetchImpl: global.fetch,
});
```

### Global JS errors

```ts
import { attachGlobalErrorLogger } from 'react-native-inapp-log-viewer';

const detachGlobalErrorLogger = attachGlobalErrorLogger(logger, {
  callOriginalHandler: true,
});
```

## Viewer Components

### Embedded viewer

```tsx
import { InAppLogViewer } from 'react-native-inapp-log-viewer';

<InAppLogViewer
  logger={logger}
  title="Runtime Logs"
  initialFilter="all"
  maxHeight={420}
  onExport={(payload) => {
    // share/copy payload
    console.log(payload);
  }}
/>;
```

### Floating modal button

```tsx
import { InAppLogViewerModalButton } from 'react-native-inapp-log-viewer';

<InAppLogViewerModalButton
  logger={logger}
  positionPreset="right-bottom"
  closeOnBackdropPress
  viewerProps={{
    title: 'Runtime Logs',
    initialFilter: 'api',
  }}
/>;
```

## Hooks

```tsx
import { Text } from 'react-native';
import { useInAppLogger, useInAppLogs } from 'react-native-inapp-log-viewer';

function ApiLogsCounter() {
  const inAppLogger = useInAppLogger();
  const apiLogs = useInAppLogs('api', inAppLogger);

  return <Text>{apiLogs.length}</Text>;
}
```

## Core API

### Main exports

- `createLogger(config?)`
- `configureDefaultLogger(config)`
- `getDefaultLogger()`
- `interceptConsole(logger?, options?)`
- `buildConsoleLogDetails(args)`
- `createReduxActionLogMiddleware(logger?, options?)`
- `buildActionLogSummary(logger, action, options?)`
- `attachAxiosLogger(logger?, axiosInstance, options?)`
- `createFetchLogger(logger?, options?)`
- `attachGlobalErrorLogger(logger?, options?)`
- `setupInAppLogger(options?)`
- `InAppLoggerProvider`
- `useInAppLogger()`
- `useInAppLogs(filter?, logger?)`
- `InAppLogViewer`
- `InAppLogViewerModalButton`
- `resolveModalButtonPresetStyle(preset)`
- `JsonTreeView`
- `buildJsonTreeDebugLines(value)`

### `LoggerConfig`

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `__DEV__` (fallback: `true`) | Enables/disables logging. |
| `maxEntries` | `number` | `500` | Ring-buffer size. |
| `summaryMaxLength` | `number` | `500` | Max summary length per entry. |
| `previewMaxLength` | `number` | `200` | Max inline preview length. |
| `previewNormalize` | `Partial<NormalizeOptions>` | `{ maxDepth: 2, maxKeys: 12, maxArrayLength: 12, maxStringLength: 120 }` | Normalization for short previews. |
| `detailNormalize` | `Partial<NormalizeOptions>` | `{ maxDepth: 12, maxKeys: 80, maxArrayLength: 60, maxStringLength: 2000 }` | Normalization for details payload. |
| `redactKeyMatcher` | `RegExp \| ((context) => boolean)` | Built-in sensitive key regex | Controls redaction matching. |
| `storageAdapter` | `StorageAdapter` | `undefined` | Optional persistence adapter. |
| `storageKey` | `string` | `react-native-inapp-log-viewer:entries` | Storage key used with adapter. |
| `persistDebounceMs` | `number` | `300` | Debounce duration for persistence writes. |
| `sinks` | `LogSink[]` | `[]` | Additional sink pipeline for each log entry. |

### Adapter options

- `ConsoleInterceptionOptions`
  - `enabled?: boolean`
  - `ignoreReduxLogger?: boolean` (default `true`)
- `ReduxActionLogOptions`
  - `enabled?: boolean`
  - `includePayloadInSummary?: boolean` (default `false`)
- `AxiosLoggerOptions`
  - `enabled?: boolean`
- `FetchLoggerOptions`
  - `enabled?: boolean`
  - `fetchImpl?: typeof fetch`
- `GlobalErrorLoggerOptions`
  - `enabled?: boolean`
  - `callOriginalHandler?: boolean` (default `true`)
- `SetupInAppLoggerOptions`
  - `logger?: InAppLogger` (default `getDefaultLogger()`)
  - `enabled?: boolean` (default `logger.isEnabled()`)
  - `axiosInstance?: AxiosInstanceLike`
  - `enableConsole?: boolean` (default `true`)
  - `enableGlobalError?: boolean` (default `true`)
  - `enableAxios?: boolean` (default `true`)
  - `ignoreReduxLogger?: boolean`
  - `callOriginalGlobalErrorHandler?: boolean`
  - `globalTeardownKey?: string` (default `__rnInAppLoggerSetupTeardown`)

### `InAppLogViewerProps`

| Prop | Type | Default |
| --- | --- | --- |
| `logger` | `InAppLogger` | context/default logger |
| `title` | `string` | `"InApp Log Viewer"` |
| `closeLabel` | `string` | `"Close"` |
| `initialFilter` | `"all" \| "action" \| "api" \| "console" \| "error" \| "custom"` | `"all"` |
| `maxHeight` | `number` | `420` |
| `testIDPrefix` | `string` | `undefined` |
| `onExport` | `(payload, entries) => void` | `undefined` |
| `onClose` | `() => void` | `undefined` |
| `listMode` | `"virtualized" \| "static"` | `"virtualized"` |
| `autoScrollToEnd` | `boolean` | `true` |

### `InAppLogViewerModalButtonProps`

| Prop | Type | Default |
| --- | --- | --- |
| `positionPreset` | `"right-bottom" \| "right-center" \| "left-bottom" \| "left-center"` | `"right-bottom"` |
| `visible` | `boolean` | uncontrolled |
| `defaultVisible` | `boolean` | `false` |
| `onVisibleChange` | `(visible) => void` | `undefined` |
| `closeOnBackdropPress` | `boolean` | `true` |
| `title` | `string` | `"InApp Log Viewer"` |
| `closeLabel` | `string` | `"Close"` |
| `viewerProps` | `Omit<InAppLogViewerProps, "logger">` | `undefined` |
| `renderTrigger` | `(props) => ReactNode` | `undefined` |
| `testIDPrefix` | `string` | `undefined` |

## Privacy and Redaction

Default redaction targets sensitive keys such as:

- `authorization`
- `cookie`
- `set-cookie`
- `token`
- `password`
- `secret`
- `apiKey` / `api_key`
- `session`

You can override behavior via `redactKeyMatcher`.

## Development

```sh
yarn install
yarn licenses:generate
yarn typecheck
yarn lint
yarn test:ci
yarn prepare
```

Run example app:

```sh
yarn example start
yarn example android
yarn example ios
```

## Third-Party Licenses

See [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md).

## License

MIT
