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

export type ReduxActionLike<T extends string = string> = {
  type: T;
};

export interface ReduxUnknownActionLike extends ReduxActionLike {
  [extraProps: string]: unknown;
}

export interface ReduxDispatchLike<
  Action extends ReduxActionLike = ReduxUnknownActionLike,
> {
  <ActionToDispatch extends Action>(
    action: ActionToDispatch,
    ...extraArgs: unknown[]
  ): ActionToDispatch;
}

export type ReduxMiddlewareNext = (action: unknown) => unknown;

export interface ReduxMiddlewareApiLike<
  Dispatch extends ReduxDispatchLike = ReduxDispatchLike,
  State = any,
> {
  dispatch: Dispatch;
  getState(): State;
}

export type ReduxMiddlewareLike<
  State = any,
  Dispatch extends ReduxDispatchLike = ReduxDispatchLike,
> = (
  api: ReduxMiddlewareApiLike<Dispatch, State>,
) => (next: ReduxMiddlewareNext) => (action: unknown) => unknown;

export const createReduxActionLogMiddleware = <
  State = any,
  Dispatch extends ReduxDispatchLike = ReduxDispatchLike,
>(
  logger: InAppLogger = getDefaultLogger(),
  options: ReduxActionLogOptions = {},
): ReduxMiddlewareLike<State, Dispatch> => {
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
