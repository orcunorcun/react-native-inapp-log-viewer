export { createLogger } from "./core/logger";
export { configureDefaultLogger, getDefaultLogger } from "./core/defaultLogger";

export { interceptConsole, buildConsoleLogDetails } from "./adapters/console";
export {
  createReduxActionLogMiddleware,
  buildActionLogSummary,
} from "./adapters/redux";
export { attachAxiosLogger } from "./adapters/axios";
export { createFetchLogger } from "./adapters/fetch";
export { attachGlobalErrorLogger } from "./adapters/globalError";

export { InAppLoggerProvider, useInAppLogger } from "./hooks/loggerContext";
export { useInAppLogs } from "./hooks/useInAppLogs";

export { InAppLogViewer } from "./components/InAppLogViewer";
export {
  InAppLogViewerModalButton,
  resolveModalButtonPresetStyle,
  type InAppLogViewerModalButtonPositionPreset,
  type InAppLogViewerModalButtonProps,
  type InAppLogViewerModalButtonRenderTriggerProps,
} from "./components/InAppLogViewerModalButton";
export {
  JsonTreeView,
  buildJsonTreeDebugLines,
} from "./components/JsonTreeView";
export type {
  JsonTreeViewMode,
  JsonTreeViewProps,
  JsonTreeViewTheme,
} from "./components/JsonTreeView";

export type {
  AppendLogInput,
  InAppLogger,
  LogEntry,
  LogFilter,
  LogLevel,
  LoggerConfig,
  LogSink,
  LogSource,
  NormalizeOptions,
  RedactKeyMatcher,
  StorageAdapter,
} from "./types";
