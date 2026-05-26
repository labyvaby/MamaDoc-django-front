import React, { createContext, useContext, useState, ReactNode } from "react";

type RefreshContextType = {
  onRefresh: (() => void) | null;
  setOnRefresh: (callback: (() => void) | null) => void;
  triggerRefresh: () => void;
};

const RefreshContext = createContext<RefreshContextType | undefined>(undefined);

export const RefreshProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [onRefresh, setOnRefresh] = useState<(() => void) | null>(null);

  const triggerRefresh = () => {
    if (onRefresh) {
      onRefresh();
    }
  };

  return (
    <RefreshContext.Provider value={{ onRefresh, setOnRefresh, triggerRefresh }}>
      {children}
    </RefreshContext.Provider>
  );
};

export const useRefresh = () => {
  const context = useContext(RefreshContext);
  if (!context) {
    throw new Error("useRefresh must be used within RefreshProvider");
  }
  return context;
};
