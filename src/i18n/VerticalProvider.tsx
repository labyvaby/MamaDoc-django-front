import React, { useEffect, useMemo } from "react";

import { usePermissions } from "../hooks/usePermissions";
import { isVertical, resolveGlossary, setCurrentGlossary } from "./glossary";
import { GLOSSARY_CONFIG_KEY, readGlossaryOverrides } from "./glossaryOverrides";
import { DEFAULT_VERTICAL, type Vertical } from "./types";
import { VerticalContext, type VerticalContextValue } from "./context";
export { PublicVerticalProvider, useT, useVertical } from "./context";

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
 * (бэк отдаёт один из известных фронту кодов, включая "retail"). Отсутствующее
 * или незнакомое значение трактуется как клиника (см. DEFAULT_VERTICAL).
 */
export const VerticalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { activeOrganization } = usePermissions();

  const devVertical = readDevVertical();
  const vertical: Vertical =
    devVertical ??
    (isVertical(activeOrganization?.vertical) ? activeOrganization.vertical : DEFAULT_VERTICAL);

  // Собственная терминология организации (конструктор в настройках) лежит в
  // themeConfig — том же поле, что палитра и лендинг. Пересобираем только при
  // смене самого объекта, а не на каждый рендер: строка сравнения дешевле,
  // чем сверка 18 терминов по 12 форм.
  const overridesKey = JSON.stringify(
    activeOrganization?.themeConfig?.[GLOSSARY_CONFIG_KEY] ?? null,
  );
  const overrides = useMemo(
    () => readGlossaryOverrides(activeOrganization?.themeConfig),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [overridesKey],
  );

  // Синхронизируем модульный синглтон — им пользуется код вне React
  // (api/*, форматтеры), где контекст недоступен.
  useEffect(() => {
    setCurrentGlossary(vertical, overrides);
  }, [vertical, overrides]);

  const value = useMemo<VerticalContextValue>(
    () => ({ vertical, glossary: resolveGlossary(vertical, overrides) }),
    [vertical, overrides]
  );

  return <VerticalContext.Provider value={value}>{children}</VerticalContext.Provider>;
};
