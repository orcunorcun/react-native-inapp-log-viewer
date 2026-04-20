import type { Middleware } from "@reduxjs/toolkit";

import { createReduxActionLogMiddleware } from "../adapters/redux";
import { createLogger } from "../core/logger";

type RootState = {
  auth: {
    token: string | null;
  };
};

const logger = createLogger({ enabled: true });

const directMiddleware: Middleware<{}, RootState> =
  createReduxActionLogMiddleware(logger);

const explicitStateMiddleware: Middleware<{}, RootState> =
  createReduxActionLogMiddleware<RootState>(logger);

export const middlewareCompatibility: Middleware<{}, RootState>[] = [
  directMiddleware,
  explicitStateMiddleware,
];
