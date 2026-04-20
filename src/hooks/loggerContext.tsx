import React, { createContext, useContext } from "react";

import { getDefaultLogger } from "../core/defaultLogger";
import type { InAppLogger } from "../types";

const LoggerContext = createContext<InAppLogger | null>(null);

export type InAppLoggerProviderProps = {
  logger?: InAppLogger;
  children: React.ReactNode;
};

export const InAppLoggerProvider = ({
  logger,
  children,
}: InAppLoggerProviderProps) => {
  const value = logger ?? getDefaultLogger();

  return (
    <LoggerContext.Provider value={value}>{children}</LoggerContext.Provider>
  );
};

export const useInAppLogger = (): InAppLogger => {
  return useContext(LoggerContext) ?? getDefaultLogger();
};
