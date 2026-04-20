import type { NormalizeOptions, RedactKeyMatcher } from "../types";

export const DEFAULT_SENSITIVE_KEY_REGEX =
  /(authorization|cookie|set-cookie|token|password|secret|api[_-]?key|session)/i;

export const PREVIEW_NORMALIZE_OPTIONS: NormalizeOptions = {
  maxDepth: 2,
  maxKeys: 12,
  maxArrayLength: 12,
  maxStringLength: 120,
};

export const DETAIL_NORMALIZE_OPTIONS: NormalizeOptions = {
  maxDepth: 12,
  maxKeys: 80,
  maxArrayLength: 60,
  maxStringLength: 2000,
};

export const truncateString = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
};

const getConstructorName = (value: unknown): string => {
  if (!value || typeof value !== "object") {
    return "";
  }

  const constructorValue = (value as { constructor?: { name?: unknown } })
    .constructor;
  if (!constructorValue || typeof constructorValue.name !== "string") {
    return "";
  }

  return constructorValue.name;
};

const tryStringifyWithFallback = (
  value: unknown,
  maxLength: number,
): string => {
  try {
    return truncateString(String(value), maxLength);
  } catch {
    return "[Unserializable]";
  }
};

const isHeadersLike = (
  value: unknown,
): value is {
  forEach: (
    callback: (headerValue: unknown, headerKey: string) => void,
  ) => void;
} => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.forEach !== "function") {
    return false;
  }

  if (getConstructorName(value) === "Headers") {
    return true;
  }

  if (
    typeof candidate.append === "function" ||
    typeof candidate.get === "function" ||
    typeof candidate.set === "function" ||
    typeof candidate.delete === "function" ||
    typeof candidate.has === "function"
  ) {
    return true;
  }

  return false;
};

const isFormDataLike = (
  value: unknown,
): value is {
  forEach?: (callback: (fieldValue: unknown, fieldKey: string) => void) => void;
  _parts?: unknown[];
} => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const hasAppend = typeof candidate.append === "function";
  if (!hasAppend) {
    return false;
  }

  if (typeof candidate.forEach === "function") {
    return true;
  }

  if (Array.isArray(candidate._parts)) {
    return true;
  }

  return getConstructorName(value) === "FormData";
};

const isRequestLike = (
  value: unknown,
): value is {
  url?: unknown;
  method?: unknown;
  headers?: unknown;
  clone?: unknown;
  text?: unknown;
  json?: unknown;
  arrayBuffer?: unknown;
  bodyUsed?: unknown;
  credentials?: unknown;
  mode?: unknown;
  cache?: unknown;
  redirect?: unknown;
} => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (getConstructorName(value) === "Request") {
    return true;
  }

  const hasRequestMethods =
    typeof candidate.clone === "function" ||
    typeof candidate.text === "function" ||
    typeof candidate.json === "function" ||
    typeof candidate.arrayBuffer === "function";

  return (
    typeof candidate.url === "string" &&
    typeof candidate.method === "string" &&
    "headers" in candidate &&
    hasRequestMethods
  );
};

const isResponseLike = (
  value: unknown,
): value is {
  status?: unknown;
  ok?: unknown;
  statusText?: unknown;
  url?: unknown;
  headers?: unknown;
  clone?: unknown;
  text?: unknown;
  json?: unknown;
  arrayBuffer?: unknown;
  bodyUsed?: unknown;
  type?: unknown;
} => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (getConstructorName(value) === "Response") {
    return true;
  }

  const hasResponseMethods =
    typeof candidate.clone === "function" ||
    typeof candidate.text === "function" ||
    typeof candidate.json === "function" ||
    typeof candidate.arrayBuffer === "function";

  return (
    "status" in candidate &&
    "ok" in candidate &&
    "headers" in candidate &&
    hasResponseMethods
  );
};

const isPromiseLike = (value: unknown): value is Promise<unknown> => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.then === "function" &&
    typeof candidate.catch === "function"
  );
};

const isTypedArrayLike = (value: unknown): boolean => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const objectTag = Object.prototype.toString.call(value);
  if (
    /^\[object (?:Uint|Int|Float)\d+Array\]$/.test(objectTag) ||
    objectTag === "[object BigInt64Array]" ||
    objectTag === "[object BigUint64Array]" ||
    objectTag === "[object Buffer]"
  ) {
    return true;
  }

  const typedArrayCandidate = value as {
    BYTES_PER_ELEMENT?: unknown;
    length?: unknown;
    buffer?: unknown;
  };
  if (
    typeof typedArrayCandidate.BYTES_PER_ELEMENT === "number" &&
    typeof typedArrayCandidate.length === "number" &&
    typedArrayCandidate.buffer &&
    typeof typedArrayCandidate.buffer === "object"
  ) {
    return true;
  }

  if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(value)) {
    if (typeof DataView !== "undefined" && value instanceof DataView) {
      return false;
    }

    return true;
  }

  const constructorName = getConstructorName(value);
  if (
    !/^(?:Uint|Int|Float)\d+Array$/.test(constructorName) &&
    constructorName !== "BigInt64Array" &&
    constructorName !== "BigUint64Array" &&
    constructorName !== "Buffer"
  ) {
    const candidate = value as Record<string, unknown> & {
      length?: unknown;
      buffer?: unknown;
      subarray?: unknown;
    };
    const keys = Object.keys(candidate);

    if (typeof candidate.length !== "number") {
      return false;
    }

    const hasIndexedKeys = keys.some((key) => /^\d+$/.test(key));
    if (!hasIndexedKeys) {
      return false;
    }

    const hasArrayBufferShape =
      (candidate.buffer && typeof candidate.buffer === "object") ||
      typeof candidate.subarray === "function";
    if (!hasArrayBufferShape) {
      return false;
    }

    return true;
  }

  return typeof (value as { length?: unknown }).length === "number";
};

const shouldRedactKey = (
  key: string,
  path: string[],
  matcher?: RedactKeyMatcher,
): boolean => {
  if (!matcher) {
    return DEFAULT_SENSITIVE_KEY_REGEX.test(key);
  }

  if (matcher instanceof RegExp) {
    if (matcher.global || matcher.sticky) {
      matcher.lastIndex = 0;
    }

    return matcher.test(key);
  }

  return matcher({ key, path });
};

export const normalizeForLogging = (
  value: unknown,
  options: NormalizeOptions,
  redactKeyMatcher?: RedactKeyMatcher,
  depth = 0,
  seen = new WeakSet<object>(),
  path: string[] = [],
): unknown => {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return truncateString(value, options.maxStringLength);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "bigint" || typeof value === "symbol") {
    return String(value);
  }

  if (typeof value === "function") {
    return `[Function ${value.name || "anonymous"}]`;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncateString(value.message, options.maxStringLength),
      stack: truncateString(value.stack || "", options.maxStringLength * 2),
    };
  }

  if (typeof value !== "object") {
    return String(value);
  }

  if (seen.has(value)) {
    return "[Circular]";
  }

  if (depth >= options.maxDepth) {
    return "[MaxDepth]";
  }

  seen.add(value);

  if (value instanceof Map) {
    const entries: Array<{ key: unknown; value: unknown }> = [];
    let entryIndex = 0;

    for (const [mapKey, mapValue] of value.entries()) {
      if (entryIndex >= options.maxArrayLength) {
        break;
      }

      entries.push({
        key: normalizeForLogging(
          mapKey,
          options,
          redactKeyMatcher,
          depth + 1,
          seen,
          [...path, `mapKey_${entryIndex}`],
        ),
        value: normalizeForLogging(
          mapValue,
          options,
          redactKeyMatcher,
          depth + 1,
          seen,
          [...path, `mapValue_${entryIndex}`],
        ),
      });
      entryIndex += 1;
    }

    if (value.size > options.maxArrayLength) {
      entries.push({
        key: "[Truncated]",
        value: `[+${value.size - options.maxArrayLength} more entries]`,
      });
    }

    seen.delete(value);
    return {
      __type: "Map",
      size: value.size,
      entries,
    };
  }

  if (value instanceof Set) {
    const values: unknown[] = [];
    let index = 0;

    for (const setValue of value.values()) {
      if (index >= options.maxArrayLength) {
        break;
      }

      values.push(
        normalizeForLogging(
          setValue,
          options,
          redactKeyMatcher,
          depth + 1,
          seen,
          [...path, String(index)],
        ),
      );
      index += 1;
    }

    if (value.size > options.maxArrayLength) {
      values.push(`[+${value.size - options.maxArrayLength} more items]`);
    }

    seen.delete(value);
    return {
      __type: "Set",
      size: value.size,
      values,
    };
  }

  if (isHeadersLike(value)) {
    const normalizedHeaders: Record<string, unknown> = {};

    try {
      value.forEach((headerValue, headerKey) => {
        const normalizedKey = String(headerKey || "").toLowerCase();
        if (!normalizedKey) {
          return;
        }

        if (shouldRedactKey(normalizedKey, path, redactKeyMatcher)) {
          normalizedHeaders[normalizedKey] = "[REDACTED]";
          return;
        }

        normalizedHeaders[normalizedKey] = normalizeForLogging(
          headerValue,
          options,
          redactKeyMatcher,
          depth + 1,
          seen,
          [...path, normalizedKey],
        );
      });
    } catch {
      // no-op by design
    }

    seen.delete(value);
    return normalizedHeaders;
  }

  if (isFormDataLike(value)) {
    const normalizedFields: Record<string, unknown> = {};

    if (typeof value.forEach === "function") {
      try {
        value.forEach((fieldValue, fieldKey) => {
          const normalizedKey = String(fieldKey || "");
          if (!normalizedKey) {
            return;
          }

          if (shouldRedactKey(normalizedKey, path, redactKeyMatcher)) {
            normalizedFields[normalizedKey] = "[REDACTED]";
            return;
          }

          normalizedFields[normalizedKey] = normalizeForLogging(
            fieldValue,
            options,
            redactKeyMatcher,
            depth + 1,
            seen,
            [...path, normalizedKey],
          );
        });
      } catch {
        // no-op by design
      }
    } else if (Array.isArray(value._parts)) {
      value._parts.slice(0, options.maxArrayLength).forEach((entry) => {
        if (!Array.isArray(entry) || entry.length < 2) {
          return;
        }

        const normalizedKey = String(entry[0] || "");
        if (!normalizedKey) {
          return;
        }

        if (shouldRedactKey(normalizedKey, path, redactKeyMatcher)) {
          normalizedFields[normalizedKey] = "[REDACTED]";
          return;
        }

        normalizedFields[normalizedKey] = normalizeForLogging(
          entry[1],
          options,
          redactKeyMatcher,
          depth + 1,
          seen,
          [...path, normalizedKey],
        );
      });
    }

    seen.delete(value);
    return {
      __type: "FormData",
      fields: normalizedFields,
    };
  }

  if (isRequestLike(value)) {
    const normalizedRequest = {
      __type: "Request",
      url: normalizeForLogging(
        value.url,
        options,
        redactKeyMatcher,
        depth + 1,
        seen,
        [...path, "url"],
      ),
      method: normalizeForLogging(
        value.method,
        options,
        redactKeyMatcher,
        depth + 1,
        seen,
        [...path, "method"],
      ),
      bodyUsed: normalizeForLogging(
        value.bodyUsed,
        options,
        redactKeyMatcher,
        depth + 1,
        seen,
        [...path, "bodyUsed"],
      ),
      credentials: normalizeForLogging(
        value.credentials,
        options,
        redactKeyMatcher,
        depth + 1,
        seen,
        [...path, "credentials"],
      ),
      mode: normalizeForLogging(
        value.mode,
        options,
        redactKeyMatcher,
        depth + 1,
        seen,
        [...path, "mode"],
      ),
      cache: normalizeForLogging(
        value.cache,
        options,
        redactKeyMatcher,
        depth + 1,
        seen,
        [...path, "cache"],
      ),
      redirect: normalizeForLogging(
        value.redirect,
        options,
        redactKeyMatcher,
        depth + 1,
        seen,
        [...path, "redirect"],
      ),
      headers: normalizeForLogging(
        value.headers,
        options,
        redactKeyMatcher,
        depth + 1,
        seen,
        [...path, "headers"],
      ),
    };

    seen.delete(value);
    return normalizedRequest;
  }

  if (isResponseLike(value)) {
    const normalizedResponse = {
      __type: "Response",
      status: normalizeForLogging(
        value.status,
        options,
        redactKeyMatcher,
        depth + 1,
        seen,
        [...path, "status"],
      ),
      ok: normalizeForLogging(
        value.ok,
        options,
        redactKeyMatcher,
        depth + 1,
        seen,
        [...path, "ok"],
      ),
      statusText: normalizeForLogging(
        value.statusText,
        options,
        redactKeyMatcher,
        depth + 1,
        seen,
        [...path, "statusText"],
      ),
      url: normalizeForLogging(
        value.url,
        options,
        redactKeyMatcher,
        depth + 1,
        seen,
        [...path, "url"],
      ),
      bodyUsed: normalizeForLogging(
        value.bodyUsed,
        options,
        redactKeyMatcher,
        depth + 1,
        seen,
        [...path, "bodyUsed"],
      ),
      type: normalizeForLogging(
        value.type,
        options,
        redactKeyMatcher,
        depth + 1,
        seen,
        [...path, "type"],
      ),
      headers: normalizeForLogging(
        value.headers,
        options,
        redactKeyMatcher,
        depth + 1,
        seen,
        [...path, "headers"],
      ),
    };

    seen.delete(value);
    return normalizedResponse;
  }

  if (typeof URL !== "undefined" && value instanceof URL) {
    seen.delete(value);
    return value.toString();
  }

  if (value instanceof RegExp) {
    seen.delete(value);
    return value.toString();
  }

  if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) {
    seen.delete(value);
    return {
      __type: "ArrayBuffer",
      byteLength: value.byteLength,
    };
  }

  if (typeof DataView !== "undefined" && value instanceof DataView) {
    seen.delete(value);
    return {
      __type: "DataView",
      byteLength: value.byteLength,
    };
  }

  if (isTypedArrayLike(value)) {
    const typedArrayValues = Array.from(value as ArrayLike<unknown>);
    const cappedValues = typedArrayValues.slice(0, options.maxArrayLength);
    const remainingCount = Math.max(
      0,
      typedArrayValues.length - options.maxArrayLength,
    );
    const constructorName = getConstructorName(value);
    const normalizedType =
      constructorName && constructorName !== "Object"
        ? constructorName
        : "TypedArray";

    seen.delete(value);
    return {
      __type: normalizedType,
      length: typedArrayValues.length,
      values:
        remainingCount > 0
          ? [...cappedValues, `[+${remainingCount} more items]`]
          : cappedValues,
    };
  }

  if (isPromiseLike(value)) {
    seen.delete(value);
    return "[Promise]";
  }

  if (Array.isArray(value)) {
    const output: unknown[] = [];
    const cappedLength = Math.min(value.length, options.maxArrayLength);

    for (let index = 0; index < cappedLength; index += 1) {
      output.push(
        normalizeForLogging(
          value[index],
          options,
          redactKeyMatcher,
          depth + 1,
          seen,
          [...path, String(index)],
        ),
      );
    }

    if (value.length > options.maxArrayLength) {
      output.push(`[+${value.length - options.maxArrayLength} more items]`);
    }

    seen.delete(value);
    return output;
  }

  const objectValue = value as Record<string, unknown>;
  const keys = Object.keys(objectValue);
  const normalized: Record<string, unknown> = {};
  const cappedKeys = Math.min(keys.length, options.maxKeys);

  for (let index = 0; index < cappedKeys; index += 1) {
    const key = keys[index];
    if (!key) {
      continue;
    }

    if (shouldRedactKey(key, path, redactKeyMatcher)) {
      normalized[key] = "[REDACTED]";
      continue;
    }

    normalized[key] = normalizeForLogging(
      objectValue[key],
      options,
      redactKeyMatcher,
      depth + 1,
      seen,
      [...path, key],
    );
  }

  if (keys.length > options.maxKeys) {
    normalized.__truncatedKeys = keys.length - options.maxKeys;
  }

  if (keys.length === 0) {
    const constructorName = getConstructorName(value);
    if (constructorName && constructorName !== "Object") {
      const fallbackText = tryStringifyWithFallback(
        value,
        options.maxStringLength,
      );
      const defaultObjectTag = `[object ${constructorName}]`;

      if (
        fallbackText &&
        fallbackText !== "[object Object]" &&
        fallbackText !== defaultObjectTag
      ) {
        normalized.__type = constructorName;
        normalized.__value = fallbackText;
      } else {
        normalized.__type = constructorName;
      }
    }
  }

  seen.delete(value);
  return normalized;
};

export const mergeNormalizeOptions = (
  defaults: NormalizeOptions,
  partial?: Partial<NormalizeOptions>,
): NormalizeOptions => {
  return {
    maxDepth: partial?.maxDepth ?? defaults.maxDepth,
    maxKeys: partial?.maxKeys ?? defaults.maxKeys,
    maxArrayLength: partial?.maxArrayLength ?? defaults.maxArrayLength,
    maxStringLength: partial?.maxStringLength ?? defaults.maxStringLength,
  };
};
