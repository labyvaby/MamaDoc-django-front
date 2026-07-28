import React, { createContext, useContext, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { usePermissions } from "../hooks/usePermissions";
import { getGlossary, isVertical, setCurrentGlossary } from "./glossary";
import { DEFAULT_VERTICAL, type Glossary, type Vertical } from "./types";
import type { Namespace } from "./index";

type VerticalContextValue = {
  vertical: Vertical;
  glossary: Glossary;
};

const VerticalContext = createContext<VerticalContextValue>({
  vertical: DEFAULT_VERTICAL,
  glossary: getGlossary(DEFAULT_VERTICAL),
});

/** Ключ dev-оверрайда вертикали (см. devVertical ниже). */
const DEV_VERTICAL_KEY = "mamadoc:vertical";

/**
 * Только для разработки: позволяет посмотреть интерфейс в другой вертикали
 * без организации с vertical="beauty" под рукой. В консоли браузера:
 *   localStorage.setItem("mamadoc:vertical", "beauty"); location.reload();
 *   localStorage.removeItem("mamadoc:vertical"); location.reload();
 * В проде игнорируется — вертикаль берётся только с бэкенда.
 */
const readDevVertical = (): Vertical | null => {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DEV_VERTICAL_KEY);
    return isVertical(raw) ? raw : null;
  } catch {
    return null;
  }
};

/**
 * Определяет вертикаль бизнеса по активной организации и раздаёт
 * соответствующий глоссарий вниз по дереву.
 *
 * Источник истины — поле `vertical` в activeOrganization из /auth/me/
 * (бэк отдаёт с 28.07.2026, choices "clinic" | "beauty"). Отсутствующее
 * или незнакомое значение трактуется как клиника (см. DEFAULT_VERTICAL).
 */
export const VerticalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { activeOrganization } = usePermissions();

  const devVertical = readDevVertical();
  const vertical: Vertical =
    devVertical ??
    (isVertical(activeOrganization?.vertical) ? activeOrganization.vertical : DEFAULT_VERTICAL);

  // Синхронизируем модульный синглтон — им пользуется код вне React
  // (api/*, форматтеры), где контекст недоступен.
  useEffect(() => {
    setCurrentGlossary(vertical);
  }, [vertical]);

  const value = useMemo<VerticalContextValue>(
    () => ({ vertical, glossary: getGlossary(vertical) }),
    [vertical]
  );

  return <VerticalContext.Provider value={value}>{children}</VerticalContext.Provider>;
};

/** Текущая вертикаль и её глоссарий. */
export const useVertical = (): VerticalContextValue => useContext(VerticalContext);

type TFunc = (key: string, options?: Record<string, unknown>) => string;

/**
 * Основной хук для текстов интерфейса.
 *
 *   const { t, term } = useT("patients");
 *   t("list.title")                       // «Пациенты» / «Клиенты»
 *   t("card.balance", { amount: "500" })  // интерполяция обычных значений
 *   term.patient.gen                      // словоформа напрямую, для aria/props
 *
 * Глоссарий подмешивается в каждый вызов, поэтому в JSON можно писать
 * {{patient.gen}} и {{visit.nomPl, capitalize}} без ручного проброса.
 */
export const useT = (
  ns: Namespace = "common"
): { t: TFunc; term: Glossary; vertical: Vertical } => {
  const { t: rawT } = useTranslation(ns);
  const { glossary, vertical } = useVertical();

  const t = useMemo<TFunc>(
    () => (key, options) => rawT(key, { ...glossary, ...options }) as unknown as string,
    [rawT, glossary]
  );

  return { t, term: glossary, vertical };
};
