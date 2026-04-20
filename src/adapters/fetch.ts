import { getDefaultLogger } from "../core/defaultLogger";
import type { InAppLogger } from "../types";

export interface FetchLoggerOptions {
  enabled?: boolean;
  fetchImpl?: typeof fetch;
}

type RequestInfoResolved = {
  method: string;
  url: string;
  headers: unknown;
  body: unknown;
};

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

const headersToObject = (headers: unknown): Record<string, string> | null => {
  if (!headers || typeof headers !== "object") {
    return null;
  }

  const asRecord = headers as Record<string, string>;
  if (typeof (headers as Headers).forEach === "function") {
    const mapped: Record<string, string> = {};
    (headers as Headers).forEach((value, key) => {
      mapped[key] = value;
    });
    return mapped;
  }

  return asRecord;
};

const resolveRequestInfo = (
  input: RequestInfo | URL,
  init?: RequestInit,
): RequestInfoResolved => {
  if (typeof Request !== "undefined" && input instanceof Request) {
    return {
      method: resolveMethod(init?.method || input.method),
      url: input.url,
      headers: headersToObject(init?.headers) ?? headersToObject(input.headers),
      body: init?.body ?? null,
    };
  }

  const url =
    input instanceof URL
      ? input.toString()
      : typeof input === "string"
        ? input
        : String(input);

  return {
    method: resolveMethod(init?.method),
    url,
    headers: headersToObject(init?.headers),
    body: init?.body ?? null,
  };
};

export const createFetchLogger = (
  logger: InAppLogger = getDefaultLogger(),
  options: FetchLoggerOptions = {},
): typeof fetch => {
  const baseFetch = options.fetchImpl ?? fetch;

  if (options.enabled === false) {
    return baseFetch;
  }

  const shouldCapture = () => options.enabled ?? logger.isEnabled();

  const wrappedFetch: typeof fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const startedAt = Date.now();
    const requestInfo = resolveRequestInfo(input, init);
    const fetchInput = input instanceof URL ? input.toString() : input;

    if (shouldCapture()) {
      logger.log({
        source: "api",
        level: "info",
        summary: `[REQ] ${requestInfo.method} ${requestInfo.url}`,
        details: {
          stage: "request",
          method: requestInfo.method,
          url: requestInfo.url,
          headers: requestInfo.headers,
          data: requestInfo.body,
        },
      });
    }

    try {
      const response = await baseFetch(fetchInput, init);
      const durationMs = Math.max(0, Date.now() - startedAt);

      if (shouldCapture()) {
        logger.log({
          source: "api",
          level: toResponseLevel(response.status),
          summary: `[RES] ${requestInfo.method} ${requestInfo.url} -> ${response.status} (${durationMs}ms)`,
          details: {
            stage: "response",
            method: requestInfo.method,
            url: requestInfo.url,
            status: response.status,
            durationMs,
            request: {
              headers: requestInfo.headers,
              data: requestInfo.body,
            },
            response: {
              headers: headersToObject(response.headers),
            },
          },
        });
      }

      return response;
    } catch (error) {
      const durationMs = Math.max(0, Date.now() - startedAt);
      const message = error instanceof Error ? error.message : String(error);

      if (shouldCapture()) {
        logger.log({
          source: "api",
          level: "error",
          summary: `[ERR] ${requestInfo.method} ${requestInfo.url} -> ${message} (${durationMs}ms)`,
          details: {
            stage: "error",
            method: requestInfo.method,
            url: requestInfo.url,
            durationMs,
            message,
            request: {
              headers: requestInfo.headers,
              data: requestInfo.body,
            },
            error,
          },
        });
      }

      throw error;
    }
  };

  return wrappedFetch;
};
