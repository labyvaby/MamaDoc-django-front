import { ThemeProvider } from "@mui/material/styles";
import {
  getAppTheme,
  LIGHT_SURFACES,
  DARK_SURFACES,
  DEFAULT_LIGHT_SURFACE,
  DEFAULT_DARK_SURFACE,
  DEFAULT_CARD_SKIN,
  DEFAULT_UI_SCALE,
  DEFAULT_SIDEBAR_DENSITY,
  SIDEBAR_DENSITIES,
  ACCENT_SURFACE_KEY,
  type CardSkin,
  type UiScale,
  type SidebarDensity,
} from "../../theme";
import React, {
  PropsWithChildren,
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  DEFAULT_ACCENT_ID,
  getAccentPreset,
  resolveAccentId,
  type AccentPreset,
} from "../../theme/accentPalette";
import { usePermissions } from "../../hooks/usePermissions";

export type ColorScheme = "light" | "dark" | "system";

/**
 * Основной цвет больше не хранится хексом: акцент — это связка токенов
 * (`theme/accentPalette`), своя для дня и ночи, и он тянет за собой фон
 * страницы, цвет карточек и границы. В настройках сотрудника и в
 * `themeConfig` организации лежит ключ пресета; сохранённый ранее хекс
 * переводится в ближайший акцент через `resolveAccentId`.
 *
 * ⚠ Акцент соседствует с цветовой азбукой статусов приёма
 * (`config/appointmentStatuses.tsx`): info — подтверждён, teal `#0d9488` —
 * «Пациент здесь»/безнал, purple `#6366f1` — частично оплачено, success —
 * оплачено, warning — идёт приём, error — отменён/долг. Чем ближе выбранный
 * акцент к статусному цвету, тем хуже читаются чипы статусов.
 */
export { DEFAULT_ACCENT_ID };

type ColorModeContextType = {
  /** Пользовательская настройка схемы (включая «системная»). */
  scheme: ColorScheme;
  /** Фактически применённый режим (light/dark) с учётом системного. */
  mode: "light" | "dark";
  setScheme: (scheme: ColorScheme) => void;
  /** Ключ выбранного акцента (theme/accentPalette). */
  accentId: string;
  setAccentId: (id: string) => void;
  /** Пресет выбранного акцента целиком — для превью в кастомайзере. */
  accentPreset: AccentPreset;
  /** Акцент текущего режима как hex — для мест, где нужен именно цвет. */
  primaryColor: string;
  /** Ключ светлой поверхности: ACCENT_SURFACE_KEY либо нейтральный пресет. */
  lightSurface: string;
  setLightSurface: (key: string) => void;
  /** Ключ тёмной поверхности: ACCENT_SURFACE_KEY либо нейтральный пресет. */
  darkSurface: string;
  setDarkSurface: (key: string) => void;
  /** Скин карточек. */
  cardSkin: CardSkin;
  setCardSkin: (skin: CardSkin) => void;
  /** Размер интерфейса (масштаб типографики). */
  uiScale: UiScale;
  setUiScale: (scale: UiScale) => void;
  /** Плотность сайдбара (расстояние между пунктами меню). */
  sidebarDensity: SidebarDensity;
  setSidebarDensity: (density: SidebarDensity) => void;
  /** Сброс к значениям по умолчанию. */
  reset: () => void;
};

export const ColorModeContext = createContext<ColorModeContextType>(
  {} as ColorModeContextType,
);

const getSystemMode = (): "light" | "dark" =>
  window?.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

/** Настройки темы, которые пользователь может переопределить лично. */
type ThemeField =
  | "colorScheme"
  | "accentId"
  | "lightSurface"
  | "darkSurface"
  | "cardSkin"
  | "uiScale"
  | "sidebarDensity";

/**
 * Ключ localStorage со списком настроек, которые пользователь менял вручную.
 *
 * Палитра организации (`themeConfig`) — это значения по умолчанию для тех, кто
 * ничего не выбирал сам. Как только сотрудник трогает переключатель, его выбор
 * становится приоритетнее и больше не перетирается ответом `/auth/me/` (а он
 * приходит заново при каждом возврате на вкладку).
 */
const THEME_OVERRIDES_KEY = "themeOverrides";

const readThemeOverrides = (): Set<ThemeField> => {
  try {
    const raw = window.localStorage.getItem(THEME_OVERRIDES_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const fields = Array.isArray(parsed) ? (parsed as string[]) : [];
    // Раньше акцент назывался primaryColor. Переименование не должно стирать
    // личный выбор сотрудника — иначе палитра организации перетрёт его цвет.
    return new Set(
      fields.map((k) => (k === "primaryColor" ? "accentId" : k)) as ThemeField[],
    );
  } catch {
    return new Set();
  }
};

export const ColorModeContextProvider: React.FC<PropsWithChildren> = ({
  children,
}) => {
  const { activeOrganization } = usePermissions();
  const themeConfig = activeOrganization?.themeConfig;

  // Миграция со старого ключа "colorMode" (light/dark) на "colorScheme".
  const storedScheme =
    (localStorage.getItem("colorScheme") as ColorScheme | null) ||
    (localStorage.getItem("colorMode") as ColorScheme | null);
  // Ключ акцента; до этого релиза здесь лежал хекс основного цвета — подбираем
  // по нему ближайший пресет, чтобы тема не «прыгнула» после обновления.
  const storedAccent =
    localStorage.getItem("accentId") || localStorage.getItem("primaryColor");

  const [scheme, setSchemeState] = useState<ColorScheme>(
    storedScheme === "light" || storedScheme === "dark" || storedScheme === "system"
      ? storedScheme
      : "system",
  );
  const [accentId, setAccentIdState] = useState<string>(resolveAccentId(storedAccent));
  const [lightSurface, setLightSurfaceState] = useState<string>(
    localStorage.getItem("lightSurface") || DEFAULT_LIGHT_SURFACE,
  );
  const [darkSurface, setDarkSurfaceState] = useState<string>(
    localStorage.getItem("darkSurface") || DEFAULT_DARK_SURFACE,
  );
  const [cardSkin, setCardSkinState] = useState<CardSkin>(
    (localStorage.getItem("cardSkin") as CardSkin) || DEFAULT_CARD_SKIN,
  );
  const [uiScale, setUiScaleState] = useState<UiScale>(
    (localStorage.getItem("uiScale") as UiScale) || DEFAULT_UI_SCALE,
  );
  const [sidebarDensity, setSidebarDensityState] = useState<SidebarDensity>(
    (localStorage.getItem("sidebarDensity") as SidebarDensity) || DEFAULT_SIDEBAR_DENSITY,
  );
  const [systemMode, setSystemMode] = useState<"light" | "dark">(getSystemMode());

  /** Настройки, выбранные пользователем вручную — их палитра организации не трогает. */
  const overridesRef = useRef<Set<ThemeField>>(readThemeOverrides());
  /** Последняя применённая палитра организации (по значению, не по ссылке). */
  const appliedConfigRef = useRef<string | null>(null);

  const markOverride = useCallback((field: ThemeField) => {
    if (overridesRef.current.has(field)) return;
    overridesRef.current.add(field);
    try {
      window.localStorage.setItem(
        THEME_OVERRIDES_KEY,
        JSON.stringify([...overridesRef.current]),
      );
    } catch {
      /* приватный режим/переполнение — переопределение живёт до перезагрузки */
    }
  }, []);

  // При получении или смене палитры организации от бэкенда применяем её —
  // но только к тем настройкам, которые пользователь не менял сам.
  useEffect(() => {
    if (!themeConfig || typeof themeConfig !== "object") return;
    // `/auth/me/` перезапрашивается при каждом фокусе вкладки и отдаёт новый
    // объект, поэтому сравниваем по значению: иначе эффект срабатывал бы
    // вхолостую и сбрасывал состояние на каждом возврате в приложение.
    const serialized = JSON.stringify(themeConfig);
    if (appliedConfigRef.current === serialized) return;
    appliedConfigRef.current = serialized;

    const overrides = overridesRef.current;
    // Организация может хранить как новый ключ акцента, так и старый хекс.
    const orgAccent = themeConfig.accentId || themeConfig.primaryColor;
    if (!overrides.has("accentId") && orgAccent && typeof orgAccent === "string") {
      setAccentIdState(resolveAccentId(orgAccent));
    }
    if (
      !overrides.has("colorScheme") &&
      themeConfig.colorScheme &&
      (themeConfig.colorScheme === "light" ||
        themeConfig.colorScheme === "dark" ||
        themeConfig.colorScheme === "system")
    ) {
      setSchemeState(themeConfig.colorScheme as ColorScheme);
    }
    if (
      !overrides.has("lightSurface") &&
      themeConfig.lightSurface &&
      typeof themeConfig.lightSurface === "string"
    ) {
      setLightSurfaceState(themeConfig.lightSurface);
    }
    if (
      !overrides.has("darkSurface") &&
      themeConfig.darkSurface &&
      typeof themeConfig.darkSurface === "string"
    ) {
      setDarkSurfaceState(themeConfig.darkSurface);
    }
    if (
      !overrides.has("cardSkin") &&
      themeConfig.cardSkin &&
      (themeConfig.cardSkin === "bordered" || themeConfig.cardSkin === "shadow")
    ) {
      setCardSkinState(themeConfig.cardSkin as CardSkin);
    }
    if (
      !overrides.has("uiScale") &&
      themeConfig.uiScale &&
      (themeConfig.uiScale === "compact" ||
        themeConfig.uiScale === "normal" ||
        themeConfig.uiScale === "large")
    ) {
      setUiScaleState(themeConfig.uiScale as UiScale);
    }
    if (
      !overrides.has("sidebarDensity") &&
      themeConfig.sidebarDensity &&
      SIDEBAR_DENSITIES.includes(themeConfig.sidebarDensity as SidebarDensity)
    ) {
      setSidebarDensityState(themeConfig.sidebarDensity as SidebarDensity);
    }
  }, [themeConfig]);

  // Следим за системной темой, когда выбрана схема «системная».
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemMode(e.matches ? "dark" : "light");
    mql.addEventListener?.("change", handler);
    return () => mql.removeEventListener?.("change", handler);
  }, []);

  useEffect(() => { window.localStorage.setItem("colorScheme", scheme); }, [scheme]);
  useEffect(() => { window.localStorage.setItem("accentId", accentId); }, [accentId]);
  useEffect(() => { window.localStorage.setItem("lightSurface", lightSurface); }, [lightSurface]);
  useEffect(() => { window.localStorage.setItem("darkSurface", darkSurface); }, [darkSurface]);
  useEffect(() => { window.localStorage.setItem("cardSkin", cardSkin); }, [cardSkin]);
  useEffect(() => { window.localStorage.setItem("uiScale", uiScale); }, [uiScale]);
  useEffect(() => { window.localStorage.setItem("sidebarDensity", sidebarDensity); }, [sidebarDensity]);

  const mode: "light" | "dark" = scheme === "system" ? systemMode : scheme;

  // Каждый сеттер помечает свою настройку как выбранную пользователем.
  const setScheme = useCallback((next: ColorScheme) => {
    markOverride("colorScheme");
    setSchemeState(next);
  }, [markOverride]);
  const setAccentId = useCallback((next: string) => {
    markOverride("accentId");
    setAccentIdState(resolveAccentId(next));
  }, [markOverride]);
  const setLightSurface = useCallback((next: string) => {
    markOverride("lightSurface");
    setLightSurfaceState(next);
  }, [markOverride]);
  const setDarkSurface = useCallback((next: string) => {
    markOverride("darkSurface");
    setDarkSurfaceState(next);
  }, [markOverride]);
  const setCardSkin = useCallback((next: CardSkin) => {
    markOverride("cardSkin");
    setCardSkinState(next);
  }, [markOverride]);
  const setUiScale = useCallback((next: UiScale) => {
    markOverride("uiScale");
    setUiScaleState(next);
  }, [markOverride]);
  const setSidebarDensity = useCallback((next: SidebarDensity) => {
    markOverride("sidebarDensity");
    setSidebarDensityState(next);
  }, [markOverride]);

  // Сброс убирает личные переопределения: тема возвращается к значениям по
  // умолчанию, а палитра организации применится снова при следующем ответе
  // `/auth/me/` (для админа к этому моменту там уже лежат дефолты, которые
  // сохранил ThemeCustomizer).
  const reset = useCallback(() => {
    overridesRef.current = new Set();
    appliedConfigRef.current = null;
    try {
      window.localStorage.removeItem(THEME_OVERRIDES_KEY);
    } catch {
      /* ignore */
    }
    setSchemeState("system");
    setAccentIdState(DEFAULT_ACCENT_ID);
    setLightSurfaceState(DEFAULT_LIGHT_SURFACE);
    setDarkSurfaceState(DEFAULT_DARK_SURFACE);
    setCardSkinState(DEFAULT_CARD_SKIN);
    setUiScaleState(DEFAULT_UI_SCALE);
    setSidebarDensityState(DEFAULT_SIDEBAR_DENSITY);
  }, []);

  const accentPreset = useMemo(() => getAccentPreset(accentId), [accentId]);
  const accentTokens = accentPreset[mode];

  const value = useMemo<ColorModeContextType>(
    () => ({
      scheme,
      mode,
      setScheme,
      accentId,
      setAccentId,
      accentPreset,
      primaryColor: accentTokens.accent,
      lightSurface,
      setLightSurface,
      darkSurface,
      setDarkSurface,
      cardSkin,
      setCardSkin,
      uiScale,
      setUiScale,
      sidebarDensity,
      setSidebarDensity,
      reset,
    }),
    [
      scheme,
      mode,
      accentId,
      accentPreset,
      accentTokens.accent,
      lightSurface,
      darkSurface,
      cardSkin,
      uiScale,
      sidebarDensity,
      setScheme,
      setAccentId,
      setLightSurface,
      setDarkSurface,
      setCardSkin,
      setUiScale,
      setSidebarDensity,
      reset,
    ],
  );

  const theme = useMemo(() => {
    const surfacePresets = mode === "dark" ? DARK_SURFACES : LIGHT_SURFACES;
    const surfaceKey = mode === "dark" ? darkSurface : lightSurface;
    // ACCENT_SURFACE_KEY — поверхности берутся из акцента (тонированный режим).
    // Любой другой ключ означает выбранный нейтральный фон: он передаётся явно
    // и отключает тонировку внутри getAppTheme.
    const surface =
      surfaceKey === ACCENT_SURFACE_KEY
        ? undefined
        : surfacePresets.find((p) => p.key === surfaceKey);
    return getAppTheme(mode, {
      // Токены акцента передаём всегда: даже с нейтральным фоном из них берутся
      // цвет заливки, текст на заливке и подложка активных состояний.
      accent: accentTokens,
      surface: surface ? { default: surface.default, paper: surface.paper } : undefined,
      cardSkin,
      uiScale,
      sidebarDensity,
    });
  }, [mode, accentTokens, lightSurface, darkSurface, cardSkin, uiScale, sidebarDensity]);

  return (
    <ColorModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </ColorModeContext.Provider>
  );
};
