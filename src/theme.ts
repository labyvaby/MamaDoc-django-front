import { alpha, createTheme, responsiveFontSizes } from "@mui/material/styles";
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
  }
  interface SimplePaletteColorOptions {
    lighter?: string;
  }
}

const APP_BREAKPOINTS = { xs: 0, sm: 360, md: 768, lg: 1200, xl: 1536 } as const;

export function getAppTheme(mode: PaletteMode | string): Theme {
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

  // Derive tokens from base to keep compatibility with Refine defaults
  const primary = base.palette.primary.main;
  const backgroundPaper = base.palette.background.paper;
  const backgroundDefault = base.palette.background.default;

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
        main: base.palette.primary.main,
        light: base.palette.primary.light,
        dark: base.palette.primary.dark,
        // Лёгкий тон для фонов активных состояний (кнопки фильтра и т.п.).
        lighter: alpha(base.palette.primary.main, m === "dark" ? 0.24 : 0.12),
      },
      secondary: {
        ...base.palette.secondary,
        main: base.palette.secondary.main,
      },
      background: {
        default: backgroundDefault,
        paper: backgroundPaper,
      },
      divider: alpha(base.palette.primary.main, m === "dark" ? 0.18 : 0.12),
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
                ? "linear-gradient(180deg, rgba(15,18,24,0.9), rgba(15,18,24,0.9)), radial-gradient(1200px 600px at 0% 0%, rgba(67,97,238,0.06), transparent)"
                : "radial-gradient(1200px 600px at 0% 0%, rgba(67,97,238,0.06), transparent)",
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
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            borderRadius: 14,
            border: `1px solid ${alpha(primary, m === "dark" ? 0.18 : 0.1)}`,
            backgroundImage: "none",
            transition: "box-shadow .2s ease, transform .2s ease",
            "&:hover": {
              boxShadow:
                m === "dark"
                  ? "0 8px 28px rgba(0,0,0,0.35)"
                  : "0 8px 28px rgba(2,6,23,0.08)",
            },
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
      MuiPaper: {
        styleOverrides: {
          outlined: {
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
