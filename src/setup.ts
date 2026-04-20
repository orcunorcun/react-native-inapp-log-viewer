import {
  attachAxiosLogger,
  type AxiosInstanceLike,
  type AxiosLoggerOptions,
} from "./adapters/axios";
import {
  attachGlobalErrorLogger,
  type GlobalErrorLoggerOptions,
} from "./adapters/globalError";
import {
  interceptConsole,
  type ConsoleInterceptionOptions,
} from "./adapters/console";
import { getDefaultLogger } from "./core/defaultLogger";
import type { InAppLogger } from "./types";

const DEFAULT_GLOBAL_TEARDOWN_KEY = "__rnInAppLoggerSetupTeardown";

type DetachFn = () => void;

type GlobalSetupState = typeof globalThis & {
  [key: string]: unknown;
};

export interface SetupInAppLoggerOptions {
  logger?: InAppLogger;
  enabled?: boolean;
  axiosInstance?: AxiosInstanceLike;
  enableConsole?: boolean;
  enableGlobalError?: boolean;
  enableAxios?: boolean;
  ignoreReduxLogger?: ConsoleInterceptionOptions["ignoreReduxLogger"];
  callOriginalGlobalErrorHandler?: GlobalErrorLoggerOptions["callOriginalHandler"];
  globalTeardownKey?: string;
}

export interface SetupInAppLoggerResult {
  logger: InAppLogger;
  teardown: DetachFn;
}

const safelyDetach = (detach?: unknown): void => {
  if (typeof detach !== "function") {
    return;
  }

  try {
    (detach as DetachFn)();
  } catch {
    // Keep setup resilient even if a detach fails.
  }
};

const getGlobalState = (): GlobalSetupState => {
  return globalThis as GlobalSetupState;
};

export const setupInAppLogger = (
  options: SetupInAppLoggerOptions = {},
): SetupInAppLoggerResult => {
  const logger = options.logger ?? getDefaultLogger();
  const enabled = options.enabled ?? logger.isEnabled();
  const enableConsole = options.enableConsole ?? true;
  const enableGlobalError = options.enableGlobalError ?? true;
  const enableAxios = options.enableAxios ?? true;
  const teardownKey = options.globalTeardownKey || DEFAULT_GLOBAL_TEARDOWN_KEY;
  const globalState = getGlobalState();

  safelyDetach(globalState[teardownKey]);

  logger.setEnabled(enabled);

  const detachHandlers: DetachFn[] = [];

  if (enableConsole) {
    const consoleOptions: ConsoleInterceptionOptions = {
      enabled,
      ignoreReduxLogger: options.ignoreReduxLogger,
    };
    detachHandlers.push(interceptConsole(logger, consoleOptions));
  }

  if (enableGlobalError) {
    const globalErrorOptions: GlobalErrorLoggerOptions = {
      enabled,
      callOriginalHandler: options.callOriginalGlobalErrorHandler,
    };
    detachHandlers.push(attachGlobalErrorLogger(logger, globalErrorOptions));
  }

  if (enableAxios && options.axiosInstance) {
    const axiosOptions: AxiosLoggerOptions = {
      enabled,
    };
    detachHandlers.push(
      attachAxiosLogger(logger, options.axiosInstance, axiosOptions),
    );
  }

  const teardown = (): void => {
    for (let index = detachHandlers.length - 1; index >= 0; index -= 1) {
      safelyDetach(detachHandlers[index]);
    }

    if (globalState[teardownKey] === teardown) {
      delete globalState[teardownKey];
    }
  };

  globalState[teardownKey] = teardown;

  return {
    logger,
    teardown,
  };
};
