import { describe, expect, it } from "@jest/globals";

import { attachAxiosLogger, type AxiosInstanceLike } from "../adapters/axios";
import { createLogger } from "../core/logger";

type RequestInterceptorHandler = (config: Record<string, unknown>) => unknown;
type ResponseInterceptorHandler = (
  response: Record<string, unknown>,
) => unknown;
type ResponseErrorInterceptorHandler = (error: unknown) => unknown;

const createAxiosStub = () => {
  let requestInterceptorHandler: RequestInterceptorHandler | null = null;
  let responseInterceptorHandler: ResponseInterceptorHandler | null = null;
  let responseErrorInterceptorHandler: ResponseErrorInterceptorHandler | null =
    null;

  const requestEjectCalls: number[] = [];
  const responseEjectCalls: number[] = [];

  const instance: AxiosInstanceLike = {
    interceptors: {
      request: {
        use: (onFulfilled) => {
          requestInterceptorHandler = onFulfilled as RequestInterceptorHandler;
          return 1;
        },
        eject: (id) => {
          requestEjectCalls.push(id);
        },
      },
      response: {
        use: (onFulfilled, onRejected) => {
          responseInterceptorHandler =
            onFulfilled as ResponseInterceptorHandler;
          responseErrorInterceptorHandler = onRejected
            ? (onRejected as ResponseErrorInterceptorHandler)
            : null;
          return 2;
        },
        eject: (id) => {
          responseEjectCalls.push(id);
        },
      },
    },
  };

  const runRequest = async (
    config: Record<string, unknown>,
  ): Promise<unknown> => {
    if (!requestInterceptorHandler) {
      throw new Error("Request interceptor is not attached.");
    }

    return requestInterceptorHandler(config);
  };

  const runResponse = async (
    response: Record<string, unknown>,
  ): Promise<unknown> => {
    if (!responseInterceptorHandler) {
      throw new Error("Response interceptor is not attached.");
    }

    return responseInterceptorHandler(response);
  };

  const runResponseError = async (error: unknown): Promise<unknown> => {
    if (!responseErrorInterceptorHandler) {
      throw new Error("Response error interceptor is not attached.");
    }

    return responseErrorInterceptorHandler(error);
  };

  return {
    instance,
    requestEjectCalls,
    responseEjectCalls,
    runRequest,
    runResponse,
    runResponseError,
  };
};

describe("axios adapter", () => {
  it("logs request and response lifecycle entries", async () => {
    const logger = createLogger({ enabled: true });
    const axiosStub = createAxiosStub();

    const detach = attachAxiosLogger(logger, axiosStub.instance, {
      enabled: true,
    });

    await axiosStub.runRequest({
      method: "post",
      url: "/users",
      headers: { authorization: "Bearer secret-token" },
      params: { active: true },
      data: { name: "Alice" },
    });
    await axiosStub.runResponse({
      status: 201,
      headers: { "content-type": "application/json" },
      data: { id: 10 },
      config: {
        method: "post",
        url: "/users",
        headers: { authorization: "Bearer secret-token" },
        params: { active: true },
        data: { name: "Alice" },
      },
    });
    detach();

    const apiLogs = logger
      .getSnapshot()
      .filter((entry) => entry.source === "api");
    expect(apiLogs).toHaveLength(2);
    expect(apiLogs[0]?.summary).toContain("[REQ] POST /users");
    expect(apiLogs[1]?.summary).toContain("[RES] POST /users -> 201");

    const requestDetails = apiLogs[0]?.details as {
      headers?: Record<string, unknown>;
    };
    expect(requestDetails.headers?.authorization).toBe("[REDACTED]");
  });

  it("logs error responses and rethrows original error", async () => {
    const logger = createLogger({ enabled: true });
    const axiosStub = createAxiosStub();

    attachAxiosLogger(logger, axiosStub.instance, { enabled: true });

    await axiosStub.runRequest({
      method: "get",
      url: "/fail",
      headers: { authorization: "Bearer secret-token" },
    });

    const axiosError = {
      message: "Network timeout",
      config: {
        method: "get",
        url: "/fail",
        headers: { authorization: "Bearer secret-token" },
      },
      response: {
        status: 504,
        data: { code: "GATEWAY_TIMEOUT" },
      },
    };

    await expect(axiosStub.runResponseError(axiosError)).rejects.toBe(
      axiosError,
    );

    const lastEntry = logger
      .getSnapshot()
      .filter((entry) => entry.source === "api")
      .at(-1);

    expect(lastEntry?.level).toBe("error");
    expect(lastEntry?.summary).toContain("[ERR] GET /fail -> Network timeout");
    expect(lastEntry?.details).toEqual(
      expect.objectContaining({
        stage: "error",
      }),
    );
  });

  it("respects runtime logger enablement when option is not explicitly set", async () => {
    const logger = createLogger({ enabled: false });
    const axiosStub = createAxiosStub();

    attachAxiosLogger(logger, axiosStub.instance);

    await axiosStub.runRequest({
      method: "get",
      url: "/runtime-toggle",
    });
    await axiosStub.runResponse({
      status: 200,
      config: { method: "get", url: "/runtime-toggle" },
    });
    expect(logger.getSnapshot()).toHaveLength(0);

    logger.setEnabled(true);

    await axiosStub.runRequest({
      method: "get",
      url: "/runtime-toggle",
    });
    await axiosStub.runResponse({
      status: 200,
      config: { method: "get", url: "/runtime-toggle" },
    });

    expect(
      logger.getSnapshot().filter((entry) => entry.source === "api"),
    ).toHaveLength(2);
  });

  it("ejects attached interceptors on detach", () => {
    const logger = createLogger({ enabled: true });
    const axiosStub = createAxiosStub();

    const detach = attachAxiosLogger(logger, axiosStub.instance, {
      enabled: true,
    });
    detach();

    expect(axiosStub.requestEjectCalls).toEqual([1]);
    expect(axiosStub.responseEjectCalls).toEqual([2]);
  });
});
