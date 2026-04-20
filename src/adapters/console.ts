import { getDefaultLogger } from "../core/defaultLogger";
import type { InAppLogger, LogLevel } from "../types";

type ConsoleLevel = Extract<
  LogLevel,
  "log" | "warn" | "error" | "info" | "debug"
>;
type ConsoleFn = (...args: unknown[]) => void;

type ConsoleCapture = {
  logger: InAppLogger;
  ignoreReduxLogger: boolean;
  shouldCapture: () => boolean;
};

type ConsolePatchState = {
  originals: Partial<Record<ConsoleLevel, ConsoleFn>>;
  refCount: number;
  captures: Map<number, ConsoleCapture>;
  nextCaptureId: number;
};

type GlobalConsoleState = {
  __rnInAppLoggerConsolePatchState?: ConsolePatchState;
  __rnInAppLoggerConsoleCaptureLock?: boolean;
};

const CONSOLE_LEVELS: ConsoleLevel[] = [
  "log",
  "warn",
  "error",
  "info",
  "debug",
];

const getGlobalState = (): typeof globalThis & GlobalConsoleState => {
  return globalThis as typeof globalThis & GlobalConsoleState;
};

const isReduxLoggerLine = (args: unknown[]): boolean => {
  if (args.length === 0 || typeof args[0] !== "string") {
    return false;
  }

  const rawPrefix = args[0].trim().toLowerCase();
  const prefix = rawPrefix.replace(/^%c\s*/, "");
  const isReduxPrefix =
    prefix.startsWith("action") ||
    prefix.startsWith("prev state") ||
    prefix.startsWith("next state");

  if (!isReduxPrefix) {
    return false;
  }

  const hasCssToken = rawPrefix.startsWith("%c");
  const secondArg = args[1];
  const hasStyleArg =
    typeof secondArg === "string" && secondArg.toLowerCase().includes("color");

  return hasCssToken || hasStyleArg;
};

const getConsoleLabelCandidate = (value: string): string => {
  const trimmed = (value || "").trim();
  if (!trimmed) {
    return "";
  }

  const withoutTrailingColon = trimmed.replace(/:+$/, "");
  if (!withoutTrailingColon) {
    return "";
  }

  const tokens = withoutTrailingColon
    .split(/[\s:()[\]{}./\\-]+/)
    .filter(Boolean);
  if (tokens.length === 0) {
    return "";
  }

  const lastToken = tokens[tokens.length - 1];
  if (!lastToken) {
    return "";
  }

  return lastToken.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();
};

const resolveUniqueConsoleKey = (
  base: string,
  usedKeys: Set<string>,
): string => {
  const preferredBase = base || "payload";
  let candidate = preferredBase;
  let suffix = 2;

  while (usedKeys.has(candidate)) {
    candidate = `${preferredBase}_${suffix}`;
    suffix += 1;
  }

  usedKeys.add(candidate);
  return candidate;
};

const isStructuredConsoleArg = (arg: unknown): boolean => {
  return typeof arg === "object" && arg !== null;
};

export const buildConsoleLogDetails = (
  args: unknown[],
): Record<string, unknown> => {
  const details: Record<string, unknown> = {
    args,
  };

  const usedKeys = new Set<string>(["args"]);

  args.forEach((arg, index) => {
    if (!isStructuredConsoleArg(arg)) {
      return;
    }

    const previousArg = index > 0 ? args[index - 1] : null;
    const labelCandidate =
      typeof previousArg === "string"
        ? getConsoleLabelCandidate(previousArg)
        : "";
    const key = resolveUniqueConsoleKey(labelCandidate || "payload", usedKeys);
    details[key] = arg;
  });

  return details;
};

const buildConsoleSummary = (logger: InAppLogger, args: unknown[]): string => {
  if (args.length === 0) {
    return "[no args]";
  }

  return args
    .map((arg, index) => {
      if (typeof arg === "string") {
        return arg;
      }

      if (isStructuredConsoleArg(arg)) {
        const previousArg = index > 0 ? args[index - 1] : null;
        const labelCandidate =
          typeof previousArg === "string"
            ? getConsoleLabelCandidate(previousArg)
            : "";
        return labelCandidate ? `<${labelCandidate}>` : "[object]";
      }

      return logger.toPreview(arg);
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
};

export interface ConsoleInterceptionOptions {
  enabled?: boolean;
  ignoreReduxLogger?: boolean;
}

export const interceptConsole = (
  logger: InAppLogger = getDefaultLogger(),
  options: ConsoleInterceptionOptions = {},
): (() => void) => {
  if (options.enabled === false) {
    return () => {
      // no-op by design
    };
  }

  const globalState = getGlobalState();
  const mutableConsole = console as unknown as Record<ConsoleLevel, ConsoleFn>;

  if (!globalState.__rnInAppLoggerConsolePatchState) {
    const originals: Partial<Record<ConsoleLevel, ConsoleFn>> = {};

    CONSOLE_LEVELS.forEach((level) => {
      const original = mutableConsole[level];
      if (typeof original !== "function") {
        return;
      }

      const boundOriginal = original.bind(console);
      originals[level] = boundOriginal;

      mutableConsole[level] = (...args: unknown[]) => {
        const patchState = globalState.__rnInAppLoggerConsolePatchState;
        if (!patchState || patchState.captures.size === 0) {
          boundOriginal(...args);
          return;
        }

        if (!globalState.__rnInAppLoggerConsoleCaptureLock) {
          globalState.__rnInAppLoggerConsoleCaptureLock = true;
          try {
            const isReduxLog = isReduxLoggerLine(args);
            patchState.captures.forEach((capture) => {
              if (!capture.shouldCapture()) {
                return;
              }

              if (capture.ignoreReduxLogger && isReduxLog) {
                return;
              }

              capture.logger.log({
                source: "console",
                level,
                summary: buildConsoleSummary(capture.logger, args),
                details: buildConsoleLogDetails(args),
              });
            });
          } catch {
            // Keep console behavior intact even if log capture fails.
          } finally {
            globalState.__rnInAppLoggerConsoleCaptureLock = false;
          }
        }

        boundOriginal(...args);
      };
    });

    globalState.__rnInAppLoggerConsolePatchState = {
      originals,
      refCount: 0,
      captures: new Map<number, ConsoleCapture>(),
      nextCaptureId: 1,
    };
  }

  const patchState = globalState.__rnInAppLoggerConsolePatchState;
  if (!patchState) {
    return () => {
      // no-op by design
    };
  }

  const captureId = patchState.nextCaptureId;
  patchState.nextCaptureId += 1;
  patchState.captures.set(captureId, {
    logger,
    ignoreReduxLogger: options.ignoreReduxLogger ?? true,
    shouldCapture: () => options.enabled ?? logger.isEnabled(),
  });
  patchState.refCount += 1;

  let isDetached = false;

  return () => {
    if (isDetached) {
      return;
    }
    isDetached = true;

    const activePatchState = globalState.__rnInAppLoggerConsolePatchState;
    if (!activePatchState) {
      return;
    }

    activePatchState.captures.delete(captureId);
    activePatchState.refCount = Math.max(0, activePatchState.refCount - 1);

    if (activePatchState.refCount > 0) {
      return;
    }

    CONSOLE_LEVELS.forEach((level) => {
      const original = activePatchState.originals[level];
      if (typeof original === "function") {
        mutableConsole[level] = original;
      }
    });

    delete globalState.__rnInAppLoggerConsolePatchState;
    delete globalState.__rnInAppLoggerConsoleCaptureLock;
  };
};
