import React, { createContext, useContext, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { getGlossary, isVertical, setCurrentGlossary } from "./glossary";
import { DEFAULT_VERTICAL, type Glossary, type Vertical } from "./types";
import type { Namespace } from "./index";

export type VerticalContextValue = { vertical: Vertical; glossary: Glossary };
export const VerticalContext = createContext<VerticalContextValue>({
  vertical: DEFAULT_VERTICAL,
  glossary: getGlossary(DEFAULT_VERTICAL),
});

export const useVertical = (): VerticalContextValue => useContext(VerticalContext);

type TFunc = (key: string, options?: Record<string, unknown>) => string;

/** Shared translations have no dependency on the staff authentication layer. */
export const useT = (ns: Namespace = "common"): {
  t: TFunc; term: Glossary; vertical: Vertical;
} => {
  const { t: rawT } = useTranslation(ns);
  const { glossary, vertical } = useVertical();
  const t = useMemo<TFunc>(
    () => (key, options) => rawT(key, { ...glossary, ...options }) as unknown as string,
    [rawT, glossary],
  );
  return { t, term: glossary, vertical };
};

export const PublicVerticalProvider: React.FC<{
  vertical: string | null | undefined;
  children: React.ReactNode;
}> = ({ vertical, children }) => {
  const resolved: Vertical = isVertical(vertical) ? vertical : DEFAULT_VERTICAL;
  useEffect(() => { setCurrentGlossary(resolved); }, [resolved]);
  const value = useMemo<VerticalContextValue>(
    () => ({ vertical: resolved, glossary: getGlossary(resolved) }), [resolved],
  );
  return <VerticalContext.Provider value={value}>{children}</VerticalContext.Provider>;
};
