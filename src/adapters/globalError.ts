import { getDefaultLogger } from "../core/defaultLogger";
import type { InAppLogger } from "../types";

type ErrorHandler = (error: unknown, isFatal?: boolean) => void;

type ErrorUtilsLike = {
  getGlobalHandler?: () => ErrorHandler;
  setGlobalHandler?: (handler: ErrorHandler) => void;
};

type GlobalErrorCapture = {
  logger: InAppLogger;
  callOriginalHandler: boolean;
  shouldCapture: () => boolean;
};

type GlobalErrorPatchState = {
  previousHandler: ErrorHandler;
  captures: Map<number, GlobalErrorCapture>;
  nextCaptureId: number;
};

type GlobalErrorState = typeof globalThis & {
  ErrorUtils?: ErrorUtilsLike;
  __rnInAppLoggerGlobalErrorPatchState?: GlobalErrorPatchState;
};

export interface GlobalErrorLoggerOptions {
  enabled?: boolean;
  callOriginalHandler?: boolean;
}

export const attachGlobalErrorLogger = (
  logger: InAppLogger = getDefaultLogger(),
  options: GlobalErrorLoggerOptions = {},
): (() => void) => {
  if (options.enabled === false) {
    return () => {
      // no-op by design
    };
  }

  const globalState = globalThis as GlobalErrorState;
  const errorUtils = globalState.ErrorUtils;
  const getGlobalHandler = errorUtils?.getGlobalHandler;
  const setGlobalHandler = errorUtils?.setGlobalHandler;

  if (!getGlobalHandler || !setGlobalHandler) {
    return () => {
      // no-op by design
    };
  }

  if (!globalState.__rnInAppLoggerGlobalErrorPatchState) {
    const previousHandler = getGlobalHandler();
    const patchState: GlobalErrorPatchState = {
      previousHandler,
      captures: new Map(),
      nextCaptureId: 1,
    };

    const wrappedHandler: ErrorHandler = (error, isFatal) => {
      const activePatchState = globalState.__rnInAppLoggerGlobalErrorPatchState;
      if (!activePatchState) {
        previousHandler(error, isFatal);
        return;
      }

      const message = error instanceof Error ? error.message : String(error);

      activePatchState.captures.forEach((capture) => {
        if (!capture.shouldCapture()) {
          return;
        }

        try {
          capture.logger.log({
            source: "error",
            level: "error",
            summary: `[GlobalError] ${message}`,
            details: {
              stage: "global-error",
              isFatal: Boolean(isFatal),
              error,
            },
          });
        } catch {
          // Keep global error behavior intact even if log capture fails.
        }
      });

      const shouldCallOriginal = Array.from(activePatchState.captures.values())
        .map((capture) => capture.callOriginalHandler)
        .some(Boolean);

      if (shouldCallOriginal) {
        activePatchState.previousHandler(error, isFatal);
      }
    };

    globalState.__rnInAppLoggerGlobalErrorPatchState = patchState;
    setGlobalHandler(wrappedHandler);
  }

  const patchState = globalState.__rnInAppLoggerGlobalErrorPatchState;
  if (!patchState) {
    return () => {
      // no-op by design
    };
  }

  const captureId = patchState.nextCaptureId;
  patchState.nextCaptureId += 1;
  patchState.captures.set(captureId, {
    logger,
    callOriginalHandler: options.callOriginalHandler ?? true,
    shouldCapture: () => options.enabled ?? logger.isEnabled(),
  });

  let isDetached = false;

  return () => {
    if (isDetached) {
      return;
    }
    isDetached = true;

    const activePatchState = globalState.__rnInAppLoggerGlobalErrorPatchState;
    if (!activePatchState) {
      return;
    }

    activePatchState.captures.delete(captureId);
    if (activePatchState.captures.size > 0) {
      return;
    }

    setGlobalHandler(activePatchState.previousHandler);
    delete globalState.__rnInAppLoggerGlobalErrorPatchState;
  };
};
