import { getDefaultLogger } from "../core/defaultLogger";
import type { InAppLogger } from "../types";

type UnknownAction = {
  type?: unknown;
  payload?: unknown;
  meta?: unknown;
  error?: unknown;
};

const isLoggableAction = (action: unknown): action is UnknownAction => {
  if (!action || typeof action !== "object") {
    return false;
  }

  return "type" in action;
};

const buildActionLogDetails = (
  action: UnknownAction,
): Record<string, unknown> => {
  const details: Record<string, unknown> = {
    type: action.type,
  };

  if (typeof action.payload !== "undefined") {
    details.payload = action.payload;
  }

  if (typeof action.meta !== "undefined") {
    details.meta = action.meta;
  }

  if (typeof action.error !== "undefined") {
    details.error = action.error;
  }

  return details;
};

export interface BuildActionLogSummaryOptions {
  includePayloadInSummary?: boolean;
}

export const buildActionLogSummary = (
  logger: InAppLogger,
  action: UnknownAction,
  options: BuildActionLogSummaryOptions = {},
): string => {
  const actionType = String(action.type);
  const includePayloadInSummary = options.includePayloadInSummary ?? false;

  if (!includePayloadInSummary) {
    return actionType;
  }

  if (typeof action.payload === "undefined") {
    return actionType;
  }

  const payloadPreview = logger.toPreview(action.payload);
  if (!payloadPreview) {
    return actionType;
  }

  return `${actionType} payload=${payloadPreview}`;
};

export interface ReduxActionLogOptions {
  enabled?: boolean;
  includePayloadInSummary?: boolean;
}

type ReduxDispatchLike = (action: unknown) => unknown;
type ReduxMiddlewareApiLike = {
  dispatch: ReduxDispatchLike;
  getState: () => unknown;
};
type ReduxMiddlewareNext = (action: unknown) => unknown;
type ReduxMiddlewareLike = (
  api: ReduxMiddlewareApiLike,
) => (next: ReduxMiddlewareNext) => (action: unknown) => unknown;

export const createReduxActionLogMiddleware = (
  logger: InAppLogger = getDefaultLogger(),
  options: ReduxActionLogOptions = {},
): ReduxMiddlewareLike => {
  return (_api) => (next) => (action) => {
    if ((options.enabled ?? logger.isEnabled()) && isLoggableAction(action)) {
      logger.log({
        source: "action",
        level: "info",
        summary: buildActionLogSummary(logger, action, {
          includePayloadInSummary: options.includePayloadInSummary,
        }),
        details: buildActionLogDetails(action),
      });
    }

    return next(action);
  };
};
