import { createLogger } from "./logger";
import type { InAppLogger, LoggerConfig } from "../types";

let defaultLogger: InAppLogger = createLogger();

export const getDefaultLogger = (): InAppLogger => {
  return defaultLogger;
};

export const configureDefaultLogger = (config: LoggerConfig): InAppLogger => {
  defaultLogger = createLogger(config);
  return defaultLogger;
};

export const __resetDefaultLoggerForTests = (): void => {
  defaultLogger = createLogger({ enabled: true });
};
