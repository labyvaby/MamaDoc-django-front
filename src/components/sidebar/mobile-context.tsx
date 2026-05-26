import React from "react";

export type MobileSidebarContextType = {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  toggle: () => void;
};

const MobileSidebarContext = React.createContext<MobileSidebarContextType | undefined>(undefined);

export const MobileSidebarProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const toggle = React.useCallback(() => setMobileOpen((prev) => !prev), []);

  const value = React.useMemo(() => ({ mobileOpen, setMobileOpen, toggle }), [mobileOpen, toggle]);

  return (
    <MobileSidebarContext.Provider value={value}>
      {children}
    </MobileSidebarContext.Provider>
  );
};

export const useMobileSidebar = () => {
  const ctx = React.useContext(MobileSidebarContext);
  if (!ctx) {
    throw new Error("useMobileSidebar must be used within MobileSidebarProvider");
  }
  return ctx;
};
