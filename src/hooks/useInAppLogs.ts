import { useMemo, useSyncExternalStore } from "react";

import { useInAppLogger } from "./loggerContext";
import type { InAppLogger, LogEntry, LogFilter } from "../types";

export const useInAppLogs = (
  filter: LogFilter = "all",
  loggerProp?: InAppLogger,
): LogEntry[] => {
  const contextLogger = useInAppLogger();
  const logger = loggerProp ?? contextLogger;

  const logs = useSyncExternalStore(
    logger.subscribe,
    logger.getSnapshot,
    logger.getSnapshot,
  );

  return useMemo(() => {
    if (filter === "all") {
      return logs;
    }

    return logs.filter((log) => log.source === filter);
  }, [filter, logs]);
};
