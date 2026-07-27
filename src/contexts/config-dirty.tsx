"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface ConfigDirtyContextValue {
  isDirty: boolean;
  setDirty: (dirty: boolean) => void;
}

const ConfigDirtyContext = createContext<ConfigDirtyContextValue | undefined>(undefined);

export function ConfigDirtyProvider({ children }: { children: ReactNode }) {
  const [isDirty, setIsDirty] = useState(false);
  const setDirty = useCallback((dirty: boolean) => setIsDirty(dirty), []);

  return (
    <ConfigDirtyContext.Provider value={{ isDirty, setDirty }}>
      {children}
    </ConfigDirtyContext.Provider>
  );
}

export function useConfigDirty(): ConfigDirtyContextValue {
  const ctx = useContext(ConfigDirtyContext);
  if (!ctx) throw new Error("useConfigDirty must be used within a ConfigDirtyProvider");
  return ctx;
}
