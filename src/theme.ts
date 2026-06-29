import { alpha, createTheme, responsiveFontSizes, lighten, darken, getContrastRatio } from "@mui/material/styles";
import type { PaletteMode, Theme } from "@mui/material/styles";
import { RefineThemes } from "@refinedev/mui";
import "@mui/x-data-grid/themeAugmentation";

const fontStack =
  "'Inter', ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, 'Apple Color Emoji', 'Segoe UI Emoji'";

// ---- DESIGN TOKENS: single source of truth ---------------------------------
// Мы расширяем MUI Theme собственным пространством appLayout — сюда складываем
// все layout-токены (высоты шапки, оффсеты контента, размеры сайдбара,
// высоту мобильных bottom-sheet и т.п.), чтобы НИГДЕ в коде не писать "85vh",
// "120px" и подобные magic numbers напрямую.

export interface AppLayoutConfig {
  header: {
    // Фактическая высота тулбара в AppBar (px)
    height: {
      mobile: number; // ~56px
      desktop: number; // ~64px
    };
  };
  page: {
    // Базовые отступы страниц в spacing-юнитах MUI (1 = 8px)
    paddingX: number;
    paddingY: number;
  };
  sidebar: {
    width: {
      desktopExpanded: number; // px
      desktopCollapsed: number; // px
      mobile: number; // px
    };
  };
  fullPage: {
    minHeight: string; // базовая высота полноэкранных контейнеров (например, "100vh")
  };
  controls: {
    buttonHeight: number; // px — единственная высота кнопок
    inputHeight: number; // px — единственная высота однострочных инпутов
  };
  card: {
    paddingX: number; // spacing-юниты для горизонтальных отступов
    paddingY: number; // spacing-юниты для вертикальных отступов
  };
  table: {
    rowHeight: number; // px — базовая высота строки таблиц/гридов
    headerRowHeight: number; // px — высота строки заголовка
  };
  viewportOffset: {
    // Высота видимой области для основной страницы приёмов
    home: {
      mobileOffset: number; // px (100dvh - mobileOffset)
      desktopOffset: number; // px (100dvh - desktopOffset)
    };
    // Колонки и корень страницы сотрудников
    employees: {
      desktopOffset: number; // px (100dvh - desktopOffset)
      minHeightMobile: string; // обычно "100svh"
    };
    // Основные высоты для страницы поиска пациентов
    patientSearch: {
      mobileOffset: number; // px (100dvh - mobileOffset)
      // Высота колонки со списком на планшете, как выражение calc(...)
      listTabletHeight: string;
      // Высота колонки со списком на десктопе, как выражение calc(...)
      listDesktopHeight: string;
    };
  };
  drawer: {
    bottomSheet: {
      height: string; // vh-выражение (например, "85vh")
      handleWidth: number; // px
      handleHeight: number; // px
      handleRadius: number; // px
    };
  };
}

declare module "@mui/material/styles" {
  // Расширяем Theme, чтобы внутри sx иметь theme.appLayout.* токены
  interface Theme {
    appLayout: AppLayoutConfig;
  }
  // И опции темы, чтобы createTheme принимал appLayout
  interface ThemeOptions {
    appLayout?: Partial<AppLayoutConfig>;
  }
  // Лёгкий тон для фонов активных состояний (например, активная кнопка
  // фильтра): bgcolor: "primary.lighter".
  interface PaletteColor {
    lighter: string;
    /**
     * Контраст-безопасный вариант цвета для использования КАК ТЕКСТ/иконка на
     * поверхности (background.paper): затемнён в светлой теме, осветлён — в
     * тёмной, чтобы всегда читаться (≈AA). Не путать с contrastText (текст
     * поверх заливки этого цвета).
     */
    onSurface: string;
  }
  interface SimplePaletteColorOptions {
    lighter?: string;
    onSurface?: string;
  }
  // Кастомный акцент «purple/indigo» — единый токен вместо расползшихся по
  // коду хексов (#7c6af7, #6366f1, #4f46e5 и т.п.). Используется для ночных
  // смен, процентных надбавок и фиолетового статуса.
  interface Palette {
    purple: PaletteColor;
  }
  interface PaletteOptions {
    purple?: SimplePaletteColorOptions;
  }
}

const APP_BREAKPOINTS = { xs: 0, sm: 360, md: 768, lg: 1200, xl: 1536 } as const;

// ---- THEME CUSTOMIZATION PRESETS -------------------------------------------
// Поверхности (фон приложения + карточек) для светлого и тёмного режимов,
// и скин карточек. Используются кастомайзером темы.

export type SurfacePreset = {
  key: string;
  name: string;
  /** Цвет фона приложения (background.default). */
  default: string;
  /** Цвет карточек/панелей (background.paper). */
  paper: string;
  /** Цвет образца-свотча в кастомайзере. */
  swatch: string;
};

export const LIGHT_SURFACES: SurfacePreset[] = [
  { key: "slate", name: "Slate", default: "#f1f5f9", paper: "#ffffff", swatch: "#e2e8f0" },
  { key: "gray", name: "Gray", default: "#f4f4f5", paper: "#ffffff", swatch: "#e5e7eb" },
  { key: "sky", name: "Sky", default: "#eff6ff", paper: "#ffffff", swatch: "#dbeafe" },
  { key: "mist", name: "Mist", default: "#ecfeff", paper: "#ffffff", swatch: "#cffafe" },
  { key: "sage", name: "Sage", default: "#f0fdf4", paper: "#ffffff", swatch: "#dcfce7" },
  { key: "sand", name: "Sand", default: "#fffbeb", paper: "#ffffff", swatch: "#fef3c7" },
  { key: "blush", name: "Blush", default: "#fff1f2", paper: "#ffffff", swatch: "#ffe4e6" },
  { key: "lavender", name: "Lavender", default: "#f5f3ff", paper: "#ffffff", swatch: "#ede9fe" },
];

export const DARK_SURFACES: SurfacePreset[] = [
  { key: "navy", name: "Navy", default: "#0f172a", paper: "#1e293b", swatch: "#1e293b" },
  { key: "mirage", name: "Mirage", default: "#18212f", paper: "#212c3f", swatch: "#212c3f" },
  { key: "mint", name: "Mint", default: "#0d1f1b", paper: "#15302a", swatch: "#15302a" },
  { key: "cinder", name: "Cinder", default: "#141319", paper: "#1e1c26", swatch: "#1e1c26" },
  { key: "black", name: "Black", default: "#000000", paper: "#121212", swatch: "#121212" },
];

export const DEFAULT_LIGHT_SURFACE = "slate";
export const DEFAULT_DARK_SURFACE = "navy";

export type CardSkin = "bordered" | "shadow";
export const DEFAULT_CARD_SKIN: CardSkin = "bordered";

export type ThemeCustomization = {
  primaryColor?: string;
  surface?: { default: string; paper: string };
  cardSkin?: CardSkin;
};

export function getAppTheme(
  mode: PaletteMode | string,
  custom: ThemeCustomization = {},
): Theme {
  const { primaryColor, surface, cardSkin = DEFAULT_CARD_SKIN } = custom;
  const m = (mode === "dark" ? "dark" : "light") as PaletteMode;
  const base = m === "light" ? RefineThemes.Blue : RefineThemes.BlueDark;

  // Layout токены — единственный источник правды для размеров layout'а
  const appLayout: AppLayoutConfig = {
    header: {
      height: {
        mobile: 56,
        desktop: 64,
      },
    },
    page: {
      paddingX: 2, // theme.spacing(2) = 16px — достаточно для мобильных 375–425px
      paddingY: 2,
    },
    sidebar: {
      width: {
        desktopExpanded: 260,
        desktopCollapsed: 64,
        mobile: 260,
      },
    },
    fullPage: {
      minHeight: "100vh",
    },
    controls: {
      buttonHeight: 40,
      inputHeight: 40,
    },
    card: {
      paddingX: 3,
      paddingY: 3,
    },
    table: {
      rowHeight: 44,
      headerRowHeight: 52,
    },
    viewportOffset: {
      home: {
        // Высоты, использовавшиеся раньше как calc(100dvh - 80px / 128px)
        mobileOffset: 52, // Высота AppBar (56) + внутренние отступы (24)
        desktopOffset: 63, // Высота AppBar (64) + внутренние отступы (24)
      },
      employees: {
        // Ранее: calc(100dvh - 120px)
        desktopOffset: 120,
        // Ранее: minHeight: { xs: "100svh", md: "auto" }
        minHeightMobile: "100svh",
      },
      patientSearch: {
        // Ранее: calc(100dvh - 64px)
        mobileOffset: 64,
        // Планшет: список чуть компактнее из-за двух колонок
        listTabletHeight: "calc(100dvh - 164px - 16px)",
        // Ранее: calc(100dvh - 164px - 16px)
        listDesktopHeight: "calc(100dvh - 164px - 16px)",
      },
    },
    drawer: {
      bottomSheet: {
        // Общая высота bottom-sheet на мобильных
        height: "85vh",
        // Габариты "ручки" для перетаскивания
        handleWidth: 40,
        handleHeight: 4,
        handleRadius: 2,
      },
    },
  };

  // Derive tokens from base to keep compatibility with Refine defaults.
  // primaryColor (если задан в кастомайзере) переопределяет основной цвет —
  // от него же зависят бордеры карточек, divider, акценты и т.п.
  const primary = primaryColor || base.palette.primary.main;
  const primaryLight = primaryColor ? lighten(primaryColor, 0.25) : base.palette.primary.light;
  const primaryDark = primaryColor ? darken(primaryColor, 0.2) : base.palette.primary.dark;
  const backgroundPaper = surface?.paper || base.palette.background.paper;
  const backgroundDefault = surface?.default || base.palette.background.default;

  // Автоподбор цвета текста НА ЗАЛИВКЕ основного цвета — выбираем тот вариант
  // (белый/тёмный), у которого контраст ВЫШЕ, а не просто «тёмный если ≥3».
  const useWhiteOnPrimary =
    getContrastRatio(primary, "#ffffff") >= getContrastRatio(primary, "#000000");
  const primaryContrastText = useWhiteOnPrimary ? "#fff" : "rgba(0, 0, 0, 0.87)";

  // Контраст-безопасный вариант основного цвета для использования КАК ТЕКСТ на
  // поверхности: подкручиваем яркость (темнее в светлой теме, светлее в тёмной),
  // пока контраст к background.paper не достигнет ~AA (4.5:1).
  const ensureOnSurface = (color: string, bg: string, dark: boolean, min = 4.5): string => {
    let c = color;
    let guard = 0;
    while (getContrastRatio(c, bg) < min && guard < 24) {
      c = dark ? lighten(c, 0.06) : darken(c, 0.06);
      guard += 1;
    }
    return c;
  };
  const primaryOnSurface = ensureOnSurface(primary, backgroundPaper, m === "dark");

  // Производные акцентные поля для ЛЮБОГО цвета палитры: контраст-безопасный
  // вариант как текст/иконка (onSurface) и лёгкий тон для фонов (lighter).
  // Раньше эти поля были объявлены в типах, но присвоены только primary —
  // из-за чего error.lighter / success.onSurface и т.п. были undefined.
  const accent = (mainColor: string) => ({
    onSurface: ensureOnSurface(mainColor, backgroundPaper, m === "dark"),
    lighter: alpha(mainColor, m === "dark" ? 0.24 : 0.12),
  });

  // Единый кастомный токен purple/indigo.
  const purpleMain = "#6366f1";
  const purpleContrastText =
    getContrastRatio(purpleMain, "#ffffff") >= getContrastRatio(purpleMain, "#000000")
      ? "#fff"
      : "rgba(0, 0, 0, 0.87)";

  let theme = createTheme({
    ...base,
    appLayout,
    breakpoints: {
      values: APP_BREAKPOINTS,
    },
    palette: {
      ...base.palette,
      mode: m,
      // Fine-tune neutrals and accents for a calmer, designer look
      primary: {
        ...base.palette.primary,
        main: primary,
        light: primaryLight,
        dark: primaryDark,
        contrastText: primaryContrastText,
        // Лёгкий тон для фонов активных состояний (кнопки фильтра и т.п.).
        lighter: alpha(primary, m === "dark" ? 0.24 : 0.12),
        // Контраст-безопасный цвет для primary КАК ТЕКСТ на поверхности.
        onSurface: primaryOnSurface,
      },
      secondary: {
        ...base.palette.secondary,
        main: base.palette.secondary.main,
      },
      // Статусным цветам добавляем lighter/onSurface (были undefined).
      error: { ...base.palette.error, ...accent(base.palette.error.main) },
      success: { ...base.palette.success, ...accent(base.palette.success.main) },
      warning: { ...base.palette.warning, ...accent(base.palette.warning.main) },
      info: { ...base.palette.info, ...accent(base.palette.info.main) },
      // Кастомный акцент purple/indigo.
      purple: {
        main: purpleMain,
        light: lighten(purpleMain, 0.25),
        dark: darken(purpleMain, 0.2),
        contrastText: purpleContrastText,
        ...accent(purpleMain),
      },
      background: {
        default: backgroundDefault,
        paper: backgroundPaper,
      },
      divider: alpha(primary, m === "dark" ? 0.18 : 0.12),
    },
    shape: {
      // Базовый радиус для всего: карточки/кнопки переопределяются ниже
      borderRadius: 12,
    },
    typography: {
      ...base.typography,
      fontFamily: fontStack,
      h1: { fontWeight: 600, letterSpacing: -0.5 },
      h2: { fontWeight: 600, letterSpacing: -0.5 },
      h3: { fontWeight: 600, letterSpacing: -0.4 },
      h4: { fontWeight: 600, letterSpacing: -0.3 },
      h5: { fontWeight: 600, letterSpacing: -0.2 },
      h6: { fontWeight: 600, letterSpacing: -0.15 },
      subtitle1: { fontWeight: 500 },
      subtitle2: { fontWeight: 500 },
      button: { fontWeight: 500, textTransform: "none", letterSpacing: 0.2 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          // Global scrollbar hiding
          "*": {
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            "&::-webkit-scrollbar": {
              display: "none",
            },
          },
          ":root": {
            colorScheme: m,
          },
          body: {
            margin: 0,
            overflowX: "hidden",
            WebkitTapHighlightColor: "transparent",
            backgroundImage:
              m === "dark"
                ? `linear-gradient(180deg, rgba(15,18,24,0.9), rgba(15,18,24,0.9)), radial-gradient(1200px 600px at 0% 0%, ${alpha(primary, 0.06)}, transparent)`
                : `radial-gradient(1200px 600px at 0% 0%, ${alpha(primary, 0.06)}, transparent)`,
            backgroundRepeat: "no-repeat",
            backgroundAttachment: "fixed",
          },
          // Hide scrollbars inside MUI X time picker (hours/minutes) columns
          ".MuiPickersSectionList-root, .MuiMultiSectionDigitalClock-root .MuiPickersSectionList-root, .MuiMultiSectionDigitalClock-root ul, .MuiMultiSectionDigitalClock-root [role='listbox']": {
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            "&::-webkit-scrollbar": { width: 0, height: 0 },
          },
          // Fallback: hide any scrollbar inside the pickers popper (Chrome/Edge/Firefox)
          ".MuiPickersPopper-root *": {
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          },
          ".MuiPickersPopper-root *::-webkit-scrollbar": {
            width: 0,
            height: 0,
          },
        },
      },
      MuiAppBar: {
        defaultProps: { elevation: 0, color: "default" },
        styleOverrides: {
          root: {
            backdropFilter: "saturate(180%) blur(10px)",
            backgroundColor:
              m === "dark"
                ? alpha(backgroundPaper, 0.75)
                : alpha("#ffffff", 0.7),
            borderBottom: `1px solid ${alpha(primary, m === "dark" ? 0.22 : 0.12)}`,
          },
        },
      },
      MuiToolbar: {
        styleOverrides: {
          root: ({ theme }) => ({
            minHeight: theme.appLayout.header.height.mobile,
            [theme.breakpoints.up("md")]: {
              minHeight: theme.appLayout.header.height.desktop,
            },
          }),
        },
      },
      MuiCard: {
        defaultProps: { elevation: 0, variant: "outlined" },
        styleOverrides: {
          root: {
            borderRadius: 14,
            backgroundImage: "none",
            transition: "box-shadow .2s ease, transform .2s ease",
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: 10,
            minHeight: theme.appLayout.controls.buttonHeight,
          }),
          containedPrimary: {
            backgroundImage:
              "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(0,0,0,0.06))",
          },
          // Текстовые/контурные primary-кнопки используют primary как ТЕКСТ —
          // берём контраст-безопасный вариант (важно для тёмной темы и ссылок).
          textPrimary: { color: primaryOnSurface },
          outlinedPrimary: { color: primaryOnSurface },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            "&.Mui-selected": { color: primaryOnSurface },
          },
        },
      },
      MuiInputBase: {
        styleOverrides: {
          root: ({ theme }) => ({
            minHeight: theme.appLayout.controls.inputHeight,
          }),
        },
      },
      MuiCardContent: {
        styleOverrides: {
          root: ({ theme }) => ({
            padding: `${theme.spacing(theme.appLayout.card.paddingY)} ${theme.spacing(theme.appLayout.card.paddingX)}`,
          }),
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            fontWeight: 500,
            borderRadius: 8,
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            transition: "background-color .15s ease, transform .1s ease",
            "&:active": {
              transform: "translateY(0.5px)",
            },
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            borderLeft: `1px solid ${alpha(primary, m === "dark" ? 0.18 : 0.1)}`,
            backgroundImage: "none",
          },
        },
      },
      MuiDivider: {
        styleOverrides: {
          root: {
            opacity: 0.9,
          },
        },
      },
      // Скин панелей (Card и Paper используют класс MuiPaper-outlined):
      // bordered — рамка без тени; shadow — мягкая тень без рамки.
      MuiPaper: {
        styleOverrides: {
          outlined:
            cardSkin === "shadow"
              ? {
                  borderColor: "transparent",
                  boxShadow:
                    m === "dark"
                      ? "0 1px 2px rgba(0,0,0,0.30), 0 6px 20px rgba(0,0,0,0.30)"
                      : "0 1px 2px rgba(2,6,23,0.04), 0 6px 20px rgba(2,6,23,0.07)",
                }
              : {
                  borderColor: alpha(primary, m === "dark" ? 0.18 : 0.1),
                },
        },
      },
      MuiTextField: {
        defaultProps: {
          size: "small",
        },
      },
      MuiDataGrid: {
        styleOverrides: {
          root: ({ theme }) => ({
            "& .MuiDataGrid-row": {
              maxHeight: theme.appLayout.table.rowHeight,
              minHeight: theme.appLayout.table.rowHeight,
            },
            "& .MuiDataGrid-columnHeaders": {
              maxHeight: theme.appLayout.table.headerRowHeight,
              minHeight: theme.appLayout.table.headerRowHeight,
            },
          }),
        },
      },
      MuiIconButton: {
        defaultProps: {
          size: "small",
        },
      },
    },
  });

  // Make typography responsive
  theme = responsiveFontSizes(theme, { factor: 2.6 });

  return theme;
}

/**
 * Лёгкая подложка под плитки/иконки/ховеры — единственное «исключение» с
 * вычисляемым цветом, и оно централизовано здесь. Используй вместо ручных
 * `rgba(255,255,255,0.0x)` / `rgba(0,0,0,0.0x)` в компонентах.
 * В тёмной теме — светлее фона на пару %, в светлой — чуть темнее.
 */
export const subtleBg = (t: Theme, strong = false) =>
  t.palette.mode === "dark"
    ? alpha("#ffffff", strong ? 0.06 : 0.03)
    : alpha("#0b0d0f", strong ? 0.04 : 0.018);
