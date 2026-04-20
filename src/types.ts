export type LogSource = "action" | "api" | "console" | "error" | "custom";

export type LogLevel = "log" | "warn" | "error" | "info" | "debug";

export type LogFilter = "all" | LogSource;

export interface LogEntry {
  id: string;
  timestamp: number;
  source: LogSource;
  level: LogLevel;
  summary: string;
  details?: unknown;
}

export interface AppendLogInput {
  source: LogSource;
  summary: string;
  level?: LogLevel;
  details?: unknown;
  timestamp?: number;
}

export interface NormalizeOptions {
  maxDepth: number;
  maxKeys: number;
  maxArrayLength: number;
  maxStringLength: number;
}

export interface RedactionContext {
  path: string[];
  key: string;
}

export type RedactKeyMatcher =
  | RegExp
  | ((context: RedactionContext) => boolean);

export interface StorageAdapter {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem?(key: string): void | Promise<void>;
}

export interface LogSink {
  log(entry: LogEntry): void | Promise<void>;
}

export interface LoggerConfig {
  enabled?: boolean;
  maxEntries?: number;
  summaryMaxLength?: number;
  previewMaxLength?: number;
  previewNormalize?: Partial<NormalizeOptions>;
  detailNormalize?: Partial<NormalizeOptions>;
  redactKeyMatcher?: RedactKeyMatcher;
  storageAdapter?: StorageAdapter;
  storageKey?: string;
  persistDebounceMs?: number;
  sinks?: LogSink[];
}

export interface InAppLogger {
  log(input: AppendLogInput): LogEntry | null;
  clear(): void;
  getSnapshot(): LogEntry[];
  subscribe(listener: () => void): () => void;
  toPreview(value: unknown): string;
  toDetails(value: unknown): unknown;
  formatEntry(entry?: LogEntry | null): string;
  hydrate(): Promise<void>;
  exportEntries(pretty?: boolean): string;
  setEnabled(enabled: boolean): void;
  isEnabled(): boolean;
  addSink(sink: LogSink): () => void;
}
