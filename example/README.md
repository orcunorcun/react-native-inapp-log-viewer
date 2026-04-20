# react-native-inapp-log-viewer Example App

This app is the local sandbox for `react-native-inapp-log-viewer`.

It is wired to use the library from the workspace root, so source changes in `../src` are reflected here during development.

## Prerequisites

- Node.js version from root `.nvmrc`
- Yarn (`yarn@4` via corepack)
- React Native environment setup for Android and/or iOS

## Install

From repository root:

```sh
yarn install
```

For iOS native dependencies:

```sh
cd example/ios
bundle install
bundle exec pod install
cd ../..
```

## Run

From repository root:

```sh
yarn example start
yarn example android
yarn example ios
```

Or from `example/` directly:

```sh
yarn start
yarn android
yarn ios
```

## What this example demonstrates

- Creating a logger instance with `createLogger`
- Rendering logs inside an embedded `InAppLogViewer`
- Using action buttons to append `custom`, `action`, `api`, `console`, and `error` logs
- Clearing logs from UI controls
- Opening logs in a modal via `InAppLogViewerModalButton`
- Testing a black-theme usage pattern for the demo screen
