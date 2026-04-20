import {
  DETAIL_NORMALIZE_OPTIONS,
  PREVIEW_NORMALIZE_OPTIONS,
  mergeNormalizeOptions,
  normalizeForLogging,
  truncateString,
} from "./normalization";
import type {
  AppendLogInput,
  InAppLogger,
  LogEntry,
  LogSink,
  LoggerConfig,
} from "../types";

const DEFAULT_MAX_ENTRIES = 500;
const DEFAULT_SUMMARY_MAX_LENGTH = 500;
const DEFAULT_PREVIEW_MAX_LENGTH = 200;
const DEFAULT_STORAGE_KEY = "react-native-inapp-log-viewer:entries";
const DEFAULT_PERSIST_DEBOUNCE_MS = 300;
const EMPTY_ENTRIES: LogEntry[] = Object.freeze([] as LogEntry[]) as LogEntry[];

const deepFreeze = <T>(value: T, seen = new WeakSet<object>()): T => {
  if (!value || typeof value !== "object") {
    return value;
  }

  const objectValue = value as object;
  if (seen.has(objectValue)) {
    return value;
  }
  seen.add(objectValue);

  Object.keys(value as Record<string, unknown>).forEach((key) => {
    deepFreeze((value as Record<string, unknown>)[key], seen);
  });

  return Object.freeze(value);
};

const freezeLogEntry = (entry: LogEntry): LogEntry => {
  const frozenDetails =
    entry.details && typeof entry.details === "object"
      ? deepFreeze(entry.details)
      : entry.details;

  return Object.freeze({
    ...entry,
    details: frozenDetails,
  });
};

const freezeEntries = (nextEntries: LogEntry[]): LogEntry[] => {
  return Object.freeze(nextEntries) as LogEntry[];
};

const toInlineText = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const resolveDefaultEnabled = (): boolean => {
  if (typeof __DEV__ === "boolean") {
    return __DEV__;
  }

  return true;
};

const isLogEntry = (value: unknown): value is LogEntry => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<LogEntry>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.timestamp === "number" &&
    typeof candidate.source === "string" &&
    typeof candidate.level === "string" &&
    typeof candidate.summary === "string"
  );
};

const mergeHydratedEntries = (
  persistedEntries: LogEntry[],
  currentEntries: LogEntry[],
  maxEntries: number,
): LogEntry[] => {
  const toEntryFingerprint = (entry: LogEntry): string => {
    let detailsFingerprint = "";
    try {
      detailsFingerprint = JSON.stringify(entry.details ?? null);
    } catch {
      detailsFingerprint = String(entry.details ?? "");
    }

    return [
      entry.timestamp,
      entry.source,
      entry.level,
      entry.summary,
      detailsFingerprint,
    ].join("|");
  };

  const seenFingerprints = new Set<string>();
  const dedupedEntries = [...persistedEntries, ...currentEntries]
    .map((entry) => ({ ...entry }))
    .sort((left, right) => left.timestamp - right.timestamp)
    .filter((entry) => {
      const fingerprint = toEntryFingerprint(entry);
      if (seenFingerprints.has(fingerprint)) {
        return false;
      }

      seenFingerprints.add(fingerprint);
      return true;
    })
    .slice(-maxEntries);

  return freezeEntries(
    dedupedEntries.map((entry, index) =>
      freezeLogEntry({
        ...entry,
        id: String(index + 1),
      }),
    ),
  );
};

export const createLogger = (config: LoggerConfig = {}): InAppLogger => {
  const maxEntries = config.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const summaryMaxLength =
    config.summaryMaxLength ?? DEFAULT_SUMMARY_MAX_LENGTH;
  const previewMaxLength =
    config.previewMaxLength ?? DEFAULT_PREVIEW_MAX_LENGTH;
  const previewNormalize = mergeNormalizeOptions(
    PREVIEW_NORMALIZE_OPTIONS,
    config.previewNormalize,
  );
  const detailNormalize = mergeNormalizeOptions(
    DETAIL_NORMALIZE_OPTIONS,
    config.detailNormalize,
  );
  const storageKey = config.storageKey ?? DEFAULT_STORAGE_KEY;
  const persistDebounceMs =
    config.persistDebounceMs ?? DEFAULT_PERSIST_DEBOUNCE_MS;
  const storageAdapter = config.storageAdapter;

  let enabled = config.enabled ?? resolveDefaultEnabled();
  let entries: LogEntry[] = EMPTY_ENTRIES;
  let counter = 0;
  let persistTimer: ReturnType<typeof setTimeout> | undefined;

  const listeners = new Set<() => void>();
  const sinks = new Set<LogSink>(config.sinks ?? []);

  const notify = () => {
    listeners.forEach((listener) => {
      listener();
    });
  };

  const toPreview = (value: unknown): string => {
    const normalized = normalizeForLogging(
      value,
      previewNormalize,
      config.redactKeyMatcher,
    );
    const inline = toInlineText(normalized).replace(/\s+/g, " ").trim();
    return truncateString(inline, previewMaxLength);
  };

  const toDetails = (value: unknown): unknown => {
    return normalizeForLogging(value, detailNormalize, config.redactKeyMatcher);
  };

  const formatEntry = (entry?: LogEntry | null): string => {
    if (!entry) {
      return "";
    }

    const detailObject = {
      id: entry.id,
      timestamp: new Date(entry.timestamp).toISOString(),
      source: entry.source,
      level: entry.level,
      summary: entry.summary,
      details: entry.details ?? null,
    };

    try {
      return JSON.stringify(detailObject, null, 2);
    } catch {
      return `${entry.summary}\n${String(entry.details ?? "")}`;
    }
  };

  const persist = async () => {
    if (!storageAdapter) {
      return;
    }

    try {
      await Promise.resolve(
        storageAdapter.setItem(storageKey, JSON.stringify(entries)),
      );
    } catch {
      // no-op by design
    }
  };

  const runFireAndForget = (effect: () => void | Promise<unknown>) => {
    Promise.resolve()
      .then(() => effect())
      .catch(() => {
        // no-op by design
      });
  };

  const schedulePersist = () => {
    if (!storageAdapter) {
      return;
    }

    if (persistTimer) {
      clearTimeout(persistTimer);
    }

    persistTimer = setTimeout(
      () => {
        runFireAndForget(persist);
      },
      Math.max(0, persistDebounceMs),
    );
  };

  const hydrate = async () => {
    if (!storageAdapter) {
      return;
    }

    try {
      const raw = await Promise.resolve(storageAdapter.getItem(storageKey));
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return;
      }

      const sanitized = parsed.filter(isLogEntry);
      if (sanitized.length === 0) {
        return;
      }

      entries = mergeHydratedEntries(sanitized, entries, maxEntries);
      counter = entries.length;
      notify();
    } catch {
      // no-op by design
    }
  };

  const log = ({
    source,
    summary,
    level = "log",
    details,
    timestamp = Date.now(),
  }: AppendLogInput): LogEntry | null => {
    if (!enabled) {
      return null;
    }

    const trimmedSummary = (summary || "").trim();
    const safeSummary = truncateString(
      trimmedSummary || "[Empty log]",
      summaryMaxLength,
    );

    const entry = freezeLogEntry({
      id: String(++counter),
      timestamp,
      source,
      level,
      summary: safeSummary,
      details: typeof details === "undefined" ? undefined : toDetails(details),
    });

    if (entries.length >= maxEntries) {
      entries = freezeEntries([
        ...entries.slice(entries.length - maxEntries + 1),
        entry,
      ]);
    } else {
      entries = freezeEntries([...entries, entry]);
    }

    sinks.forEach((sink) => {
      runFireAndForget(() => sink.log(entry));
    });

    notify();
    schedulePersist();

    return entry;
  };

  const clear = () => {
    if (entries.length === 0) {
      return;
    }

    entries = EMPTY_ENTRIES;
    notify();

    if (!storageAdapter) {
      return;
    }

    if (storageAdapter.removeItem) {
      runFireAndForget(() => storageAdapter.removeItem?.(storageKey));
      return;
    }

    schedulePersist();
  };

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const getSnapshot = (): LogEntry[] => {
    return entries;
  };

  const exportEntries = (pretty = true): string => {
    try {
      return JSON.stringify(entries, null, pretty ? 2 : 0);
    } catch {
      return "[]";
    }
  };

  const setEnabled = (nextEnabled: boolean) => {
    enabled = nextEnabled;
  };

  const isEnabled = () => {
    return enabled;
  };

  const addSink = (sink: LogSink): (() => void) => {
    sinks.add(sink);
    return () => {
      sinks.delete(sink);
    };
  };

  runFireAndForget(hydrate);

  return {
    log,
    clear,
    getSnapshot,
    subscribe,
    toPreview,
    toDetails,
    formatEntry,
    hydrate,
    exportEntries,
    setEnabled,
    isEnabled,
    addSink,
  };
};
