import { ThemeProvider } from "@mui/material/styles";
import {
  getAppTheme,
  LIGHT_SURFACES,
  DARK_SURFACES,
  DEFAULT_LIGHT_SURFACE,
  DEFAULT_DARK_SURFACE,
  DEFAULT_CARD_SKIN,
  type CardSkin,
} from "../../theme";
import React, {
  PropsWithChildren,
  createContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { usePermissions } from "../../hooks/usePermissions";

export type ColorScheme = "light" | "dark" | "system";

/**
 * Палитра основных цветов для кастомайзера.
 *
 * Подобраны современные, достаточно насыщенные оттенки (диапазон Tailwind
 * 600–700), которые читаемы белым текстом на заливке и не «теряются» при
 * использовании как цвет текста/ссылок на светлых поверхностях.
 */
export const PRIMARY_PRESETS: { name: string; value: string }[] = [
  { name: "Ирис", value: "#5b5bd6" },     // мягкий индиго-фиолет (Linear/Radix) — премиальный, по умолчанию
  { name: "Сапфир", value: "#2563eb" },   // blue-600 — насыщенный «электрический» синий
  { name: "Бирюза", value: "#0d9488" },   // teal-600 — глубокий спокойный сине-зелёный
  { name: "Изумруд", value: "#059669" },  // emerald-600 — свежий «медицинский» зелёный
  { name: "Аметист", value: "#7c3aed" },  // violet-600 — трендовый фиолетовый
  { name: "Фуксия", value: "#db2777" },   // pink-600 — яркая современная маджента
  { name: "Рубин", value: "#e11d48" },    // rose-600 — сочный красно-розовый
  { name: "Графит", value: "#475569" },   // slate-600 — нейтральный графитовый
];

/** Цвет по умолчанию. */
export const DEFAULT_PRIMARY = PRIMARY_PRESETS[0].value;

type ColorModeContextType = {
  /** Пользовательская настройка схемы (включая «системная»). */
  scheme: ColorScheme;
  /** Фактически применённый режим (light/dark) с учётом системного. */
  mode: "light" | "dark";
  setScheme: (scheme: ColorScheme) => void;
  /** Текущий основной цвет (hex). */
  primaryColor: string;
  setPrimaryColor: (color: string) => void;
  /** Ключ светлой поверхности (slate/gray/neutral). */
  lightSurface: string;
  setLightSurface: (key: string) => void;
  /** Ключ тёмной поверхности (navy/mirage/mint/cinder/black). */
  darkSurface: string;
  setDarkSurface: (key: string) => void;
  /** Скин карточек. */
  cardSkin: CardSkin;
  setCardSkin: (skin: CardSkin) => void;
  /** Сброс к значениям по умолчанию. */
  reset: () => void;
};

export const ColorModeContext = createContext<ColorModeContextType>(
  {} as ColorModeContextType,
);

const getSystemMode = (): "light" | "dark" =>
  window?.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

export const ColorModeContextProvider: React.FC<PropsWithChildren> = ({
  children,
}) => {
  const { activeOrganization } = usePermissions();
  const themeConfig = activeOrganization?.themeConfig;

  // Миграция со старого ключа "colorMode" (light/dark) на "colorScheme".
  const storedScheme =
    (localStorage.getItem("colorScheme") as ColorScheme | null) ||
    (localStorage.getItem("colorMode") as ColorScheme | null);
  const storedPrimary = localStorage.getItem("primaryColor");

  const [scheme, setSchemeState] = useState<ColorScheme>(
    storedScheme === "light" || storedScheme === "dark" || storedScheme === "system"
      ? storedScheme
      : "system",
  );
  const [primaryColor, setPrimaryColorState] = useState<string>(
    storedPrimary || DEFAULT_PRIMARY,
  );
  const [lightSurface, setLightSurfaceState] = useState<string>(
    localStorage.getItem("lightSurface") || DEFAULT_LIGHT_SURFACE,
  );
  const [darkSurface, setDarkSurfaceState] = useState<string>(
    localStorage.getItem("darkSurface") || DEFAULT_DARK_SURFACE,
  );
  const [cardSkin, setCardSkinState] = useState<CardSkin>(
    (localStorage.getItem("cardSkin") as CardSkin) || DEFAULT_CARD_SKIN,
  );
  const [systemMode, setSystemMode] = useState<"light" | "dark">(getSystemMode());

  // При получении или смене палитры организации от бэкенда применяем её.
  useEffect(() => {
    if (!themeConfig || typeof themeConfig !== "object") return;
    if (themeConfig.primaryColor && typeof themeConfig.primaryColor === "string") {
      setPrimaryColorState(themeConfig.primaryColor);
    }
    if (
      themeConfig.colorScheme &&
      (themeConfig.colorScheme === "light" ||
        themeConfig.colorScheme === "dark" ||
        themeConfig.colorScheme === "system")
    ) {
      setSchemeState(themeConfig.colorScheme as ColorScheme);
    }
    if (themeConfig.lightSurface && typeof themeConfig.lightSurface === "string") {
      setLightSurfaceState(themeConfig.lightSurface);
    }
    if (themeConfig.darkSurface && typeof themeConfig.darkSurface === "string") {
      setDarkSurfaceState(themeConfig.darkSurface);
    }
    if (
      themeConfig.cardSkin &&
      (themeConfig.cardSkin === "bordered" || themeConfig.cardSkin === "shadow")
    ) {
      setCardSkinState(themeConfig.cardSkin as CardSkin);
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
  useEffect(() => { window.localStorage.setItem("primaryColor", primaryColor); }, [primaryColor]);
  useEffect(() => { window.localStorage.setItem("lightSurface", lightSurface); }, [lightSurface]);
  useEffect(() => { window.localStorage.setItem("darkSurface", darkSurface); }, [darkSurface]);
  useEffect(() => { window.localStorage.setItem("cardSkin", cardSkin); }, [cardSkin]);

  const mode: "light" | "dark" = scheme === "system" ? systemMode : scheme;

  const value = useMemo<ColorModeContextType>(
    () => ({
      scheme,
      mode,
      setScheme: setSchemeState,
      primaryColor,
      setPrimaryColor: setPrimaryColorState,
      lightSurface,
      setLightSurface: setLightSurfaceState,
      darkSurface,
      setDarkSurface: setDarkSurfaceState,
      cardSkin,
      setCardSkin: setCardSkinState,
      reset: () => {
        setSchemeState("system");
        setPrimaryColorState(DEFAULT_PRIMARY);
        setLightSurfaceState(DEFAULT_LIGHT_SURFACE);
        setDarkSurfaceState(DEFAULT_DARK_SURFACE);
        setCardSkinState(DEFAULT_CARD_SKIN);
      },
    }),
    [scheme, mode, primaryColor, lightSurface, darkSurface, cardSkin],
  );

  const theme = useMemo(() => {
    const surfacePresets = mode === "dark" ? DARK_SURFACES : LIGHT_SURFACES;
    const surfaceKey = mode === "dark" ? darkSurface : lightSurface;
    const surface = surfacePresets.find((s) => s.key === surfaceKey);
    return getAppTheme(mode, {
      // Применяем выбранный цвет всегда (включая дефолтный), чтобы свотч в
      // кастомайзере совпадал с реальным цветом темы и контраст был предсказуем.
      primaryColor,
      surface: surface ? { default: surface.default, paper: surface.paper } : undefined,
      cardSkin,
    });
  }, [mode, primaryColor, lightSurface, darkSurface, cardSkin]);

  return (
    <ColorModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </ColorModeContext.Provider>
  );
};
