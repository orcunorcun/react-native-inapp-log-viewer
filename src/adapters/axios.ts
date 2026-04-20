import { getDefaultLogger } from "../core/defaultLogger";
import type { InAppLogger } from "../types";

export interface AxiosLoggerOptions {
  enabled?: boolean;
}

const REQUEST_STARTED_AT_KEY = "__inAppLoggerRequestStartedAt";

type AxiosRequestConfigLike = {
  method?: string;
  url?: string;
  headers?: unknown;
  params?: unknown;
  data?: unknown;
  [REQUEST_STARTED_AT_KEY]?: number;
};

type AxiosResponseLike = {
  status?: number;
  headers?: unknown;
  data?: unknown;
  config?: AxiosRequestConfigLike;
};

type AxiosErrorLike = {
  message?: string;
  config?: AxiosRequestConfigLike;
  response?: {
    status?: number;
    headers?: unknown;
    data?: unknown;
  };
};

type AxiosFulfilledHandler<T> = (value: T) => T | Promise<T>;
type AxiosRejectedHandler = (error: unknown) => unknown;

type AxiosInterceptorManager = {
  use: (
    onFulfilled: AxiosFulfilledHandler<any>,
    onRejected?: AxiosRejectedHandler,
  ) => number;
  eject: (id: number) => void;
};

export interface AxiosInstanceLike {
  interceptors: {
    request: AxiosInterceptorManager;
    response: AxiosInterceptorManager;
  };
}

const resolveMethod = (method?: string): string => {
  return (method || "GET").toUpperCase();
};

const toResponseLevel = (status: number): "info" | "warn" | "error" => {
  if (status >= 500) {
    return "error";
  }

  if (status >= 400) {
    return "warn";
  }

  return "info";
};

const now = (): number => Date.now();

const getDurationMs = (config?: Record<string, unknown>): number => {
  const startedAt = config?.[REQUEST_STARTED_AT_KEY];
  if (typeof startedAt !== "number") {
    return 0;
  }

  return Math.max(0, now() - startedAt);
};

const toAxiosRequestConfig = (value: unknown): AxiosRequestConfigLike => {
  if (!value || typeof value !== "object") {
    return {};
  }

  return value as AxiosRequestConfigLike;
};

const toAxiosResponse = (value: unknown): AxiosResponseLike => {
  if (!value || typeof value !== "object") {
    return {};
  }

  return value as AxiosResponseLike;
};

const toAxiosError = (value: unknown): AxiosErrorLike => {
  if (!value || typeof value !== "object") {
    return {};
  }

  return value as AxiosErrorLike;
};

export const attachAxiosLogger = (
  logger: InAppLogger = getDefaultLogger(),
  axiosInstance: AxiosInstanceLike,
  options: AxiosLoggerOptions = {},
): (() => void) => {
  if (options.enabled === false) {
    return () => {
      // no-op by design
    };
  }

  const shouldCapture = () => options.enabled ?? logger.isEnabled();

  const requestInterceptorId = axiosInstance.interceptors.request.use(
    (config) => {
      const normalizedConfig = toAxiosRequestConfig(config);
      const method = resolveMethod(normalizedConfig.method);
      const url = normalizedConfig.url || "";

      normalizedConfig[REQUEST_STARTED_AT_KEY] = now();

      if (shouldCapture()) {
        logger.log({
          source: "api",
          level: "info",
          summary: `[REQ] ${method} ${url}`,
          details: {
            stage: "request",
            method,
            url,
            headers: normalizedConfig.headers ?? null,
            params: normalizedConfig.params ?? null,
            data: normalizedConfig.data ?? null,
          },
        });
      }

      return normalizedConfig;
    },
  );

  const responseInterceptorId = axiosInstance.interceptors.response.use(
    (response) => {
      const normalizedResponse = toAxiosResponse(response);
      const normalizedConfig = toAxiosRequestConfig(normalizedResponse.config);
      const status =
        typeof normalizedResponse.status === "number"
          ? normalizedResponse.status
          : 0;
      const method = resolveMethod(normalizedConfig.method);
      const url = normalizedConfig.url || "";
      const durationMs = getDurationMs(normalizedConfig);

      if (shouldCapture()) {
        logger.log({
          source: "api",
          level: toResponseLevel(status),
          summary: `[RES] ${method} ${url} -> ${status} (${durationMs}ms)`,
          details: {
            stage: "response",
            method,
            url,
            status,
            durationMs,
            request: {
              headers: normalizedConfig.headers ?? null,
              params: normalizedConfig.params ?? null,
              data: normalizedConfig.data ?? null,
            },
            response: {
              headers: normalizedResponse.headers ?? null,
              data: normalizedResponse.data ?? null,
            },
          },
        });
      }

      return normalizedResponse;
    },
    (error) => {
      const normalizedError = toAxiosError(error);
      const normalizedConfig = toAxiosRequestConfig(normalizedError.config);
      const method = resolveMethod(normalizedConfig.method);
      const url = normalizedConfig.url || "";
      const durationMs = getDurationMs(normalizedConfig);
      const message = normalizedError.message || "Unknown axios error";

      if (shouldCapture()) {
        logger.log({
          source: "api",
          level: "error",
          summary: `[ERR] ${method} ${url} -> ${message} (${durationMs}ms)`,
          details: {
            stage: "error",
            method,
            url,
            durationMs,
            message,
            request: {
              headers: normalizedConfig.headers ?? null,
              params: normalizedConfig.params ?? null,
              data: normalizedConfig.data ?? null,
            },
            response: normalizedError.response
              ? {
                  status: normalizedError.response.status ?? null,
                  headers: normalizedError.response.headers ?? null,
                  data: normalizedError.response.data ?? null,
                }
              : null,
            error,
          },
        });
      }

      return Promise.reject(error);
    },
  );

  return () => {
    axiosInstance.interceptors.request.eject(requestInterceptorId);
    axiosInstance.interceptors.response.eject(responseInterceptorId);
  };
};
