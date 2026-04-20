import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../adapters/axios", () => {
  return {
    attachAxiosLogger: jest.fn(),
  };
});

jest.mock("../adapters/globalError", () => {
  return {
    attachGlobalErrorLogger: jest.fn(),
  };
});

jest.mock("../adapters/console", () => {
  return {
    interceptConsole: jest.fn(),
  };
});

import { attachAxiosLogger } from "../adapters/axios";
import { attachGlobalErrorLogger } from "../adapters/globalError";
import { interceptConsole } from "../adapters/console";
import type { InAppLogger } from "../types";
import { setupInAppLogger } from "../setup";

const DEFAULT_GLOBAL_TEARDOWN_KEY = "__rnInAppLoggerSetupTeardown";

type TestGlobalState = typeof globalThis & {
  [DEFAULT_GLOBAL_TEARDOWN_KEY]?: unknown;
  __testLoggerTeardownKey__?: unknown;
};

const getGlobalState = (): TestGlobalState => {
  return globalThis as TestGlobalState;
};

type SetupInAppLoggerOptions = NonNullable<
  Parameters<typeof setupInAppLogger>[0]
>;

const createAxiosInstance = (): SetupInAppLoggerOptions["axiosInstance"] => {
  return {
    interceptors: {
      request: { use: jest.fn(() => 1), eject: jest.fn() },
      response: { use: jest.fn(() => 2), eject: jest.fn() },
    },
  } as SetupInAppLoggerOptions["axiosInstance"];
};

const createLoggerStub = (enabled = true): InAppLogger => {
  let isEnabledState = enabled;
  return {
    log: jest.fn(() => null),
    clear: jest.fn(),
    getSnapshot: jest.fn(() => []),
    subscribe: jest.fn(() => () => undefined),
    toPreview: jest.fn(() => ""),
    toDetails: jest.fn((value) => value),
    formatEntry: jest.fn(() => ""),
    hydrate: jest.fn(async () => undefined),
    exportEntries: jest.fn(() => "[]"),
    setEnabled: jest.fn((nextEnabled: boolean) => {
      isEnabledState = nextEnabled;
    }),
    isEnabled: jest.fn(() => isEnabledState),
    addSink: jest.fn(() => () => undefined),
  };
};

describe("setupInAppLogger", () => {
  const mockAttachAxiosLogger = attachAxiosLogger as unknown as jest.Mock;
  const mockAttachGlobalErrorLogger =
    attachGlobalErrorLogger as unknown as jest.Mock;
  const mockInterceptConsole = interceptConsole as unknown as jest.Mock;

  beforeEach(() => {
    mockAttachAxiosLogger.mockReset();
    mockAttachGlobalErrorLogger.mockReset();
    mockInterceptConsole.mockReset();

    delete getGlobalState()[DEFAULT_GLOBAL_TEARDOWN_KEY];
    delete getGlobalState().__testLoggerTeardownKey__;
  });

  it("attaches console/globalError/axios via a single setup call", () => {
    const logger = createLoggerStub(false);
    const axiosInstance = createAxiosInstance();
    const detachAxios = jest.fn();
    const detachGlobalError = jest.fn();
    const detachConsole = jest.fn();

    mockAttachAxiosLogger.mockReturnValue(detachAxios);
    mockAttachGlobalErrorLogger.mockReturnValue(detachGlobalError);
    mockInterceptConsole.mockReturnValue(detachConsole);

    const result = setupInAppLogger({
      logger,
      enabled: true,
      axiosInstance,
    });

    expect(logger.setEnabled).toHaveBeenCalledWith(true);
    expect(mockInterceptConsole).toHaveBeenCalledWith(logger, {
      enabled: true,
      ignoreReduxLogger: undefined,
    });
    expect(mockAttachGlobalErrorLogger).toHaveBeenCalledWith(logger, {
      enabled: true,
      callOriginalHandler: undefined,
    });
    expect(mockAttachAxiosLogger).toHaveBeenCalledWith(logger, axiosInstance, {
      enabled: true,
    });
    expect(typeof result.teardown).toBe("function");
    expect(getGlobalState()[DEFAULT_GLOBAL_TEARDOWN_KEY]).toBe(result.teardown);
  });

  it("detaches previously registered setup before applying new setup", () => {
    const logger = createLoggerStub(true);
    const axiosInstance = createAxiosInstance();

    const firstDetachAxios = jest.fn();
    const firstDetachGlobalError = jest.fn();
    const firstDetachConsole = jest.fn();
    const secondDetachAxios = jest.fn();
    const secondDetachGlobalError = jest.fn();
    const secondDetachConsole = jest.fn();

    mockAttachAxiosLogger
      .mockReturnValueOnce(firstDetachAxios)
      .mockReturnValueOnce(secondDetachAxios);
    mockAttachGlobalErrorLogger
      .mockReturnValueOnce(firstDetachGlobalError)
      .mockReturnValueOnce(secondDetachGlobalError);
    mockInterceptConsole
      .mockReturnValueOnce(firstDetachConsole)
      .mockReturnValueOnce(secondDetachConsole);

    setupInAppLogger({
      logger,
      enabled: true,
      axiosInstance,
    });

    const secondResult = setupInAppLogger({
      logger,
      enabled: false,
      axiosInstance,
    });

    expect(firstDetachAxios).toHaveBeenCalledTimes(1);
    expect(firstDetachGlobalError).toHaveBeenCalledTimes(1);
    expect(firstDetachConsole).toHaveBeenCalledTimes(1);
    expect(getGlobalState()[DEFAULT_GLOBAL_TEARDOWN_KEY]).toBe(
      secondResult.teardown,
    );
  });

  it("supports disabling individual adapters and custom teardown key", () => {
    const logger = createLoggerStub(true);

    const result = setupInAppLogger({
      logger,
      enableConsole: false,
      enableGlobalError: false,
      enableAxios: false,
      globalTeardownKey: "__testLoggerTeardownKey__",
    });

    expect(mockInterceptConsole).not.toHaveBeenCalled();
    expect(mockAttachGlobalErrorLogger).not.toHaveBeenCalled();
    expect(mockAttachAxiosLogger).not.toHaveBeenCalled();
    expect(getGlobalState().__testLoggerTeardownKey__).toBe(result.teardown);
  });

  it("teardown detaches adapters in reverse registration order", () => {
    const logger = createLoggerStub(true);
    const order: string[] = [];
    const axiosInstance = createAxiosInstance();

    mockInterceptConsole.mockReturnValue(() => {
      order.push("console");
    });
    mockAttachGlobalErrorLogger.mockReturnValue(() => {
      order.push("global-error");
    });
    mockAttachAxiosLogger.mockReturnValue(() => {
      order.push("axios");
    });

    const result = setupInAppLogger({
      logger,
      axiosInstance,
    });

    result.teardown();

    expect(order).toEqual(["axios", "global-error", "console"]);
    expect(getGlobalState()[DEFAULT_GLOBAL_TEARDOWN_KEY]).toBeUndefined();
  });
});
