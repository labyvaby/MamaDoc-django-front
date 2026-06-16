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

export type ColorScheme = "light" | "dark" | "system";

/** Палитра доступных основных цветов для кастомайзера. */
export const PRIMARY_PRESETS: { name: string; value: string }[] = [
  { name: "Синий", value: "#4361ee" },
  { name: "Индиго", value: "#4f46e5" },
  { name: "Фиолетовый", value: "#7c3aed" },
  { name: "Бирюзовый", value: "#0d9488" },
  { name: "Зелёный", value: "#16a34a" },
  { name: "Янтарный", value: "#d97706" },
  { name: "Розовый", value: "#e11d48" },
  { name: "Графит", value: "#475569" },
];

/** Цвет по умолчанию — соответствует базовой теме Refine Blue. */
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
      primaryColor: primaryColor === DEFAULT_PRIMARY ? undefined : primaryColor,
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
