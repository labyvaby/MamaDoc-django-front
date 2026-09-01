import React from "react";
import {
  Box,
  Popover,
  type PopoverActions,
  Drawer,
  Stack,
  Typography,
  IconButton,
  Divider,
  ToggleButton,
  ToggleButtonGroup,
  Button,
  Tooltip,
  Collapse,
  useMediaQuery,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import LightModeOutlined from "@mui/icons-material/LightModeOutlined";
import DarkModeOutlined from "@mui/icons-material/DarkModeOutlined";
import SettingsBrightnessOutlined from "@mui/icons-material/SettingsBrightnessOutlined";
import CheckIcon from "@mui/icons-material/Check";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import RestartAltOutlined from "@mui/icons-material/RestartAltOutlined";
import CropSquareOutlined from "@mui/icons-material/CropSquareOutlined";
import LayersOutlined from "@mui/icons-material/LayersOutlined";
import ColorLensOutlined from "@mui/icons-material/ColorLensOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import PaletteOutlined from "@mui/icons-material/PaletteOutlined";
import DensitySmallOutlined from "@mui/icons-material/DensitySmallOutlined";
import DensityMediumOutlined from "@mui/icons-material/DensityMediumOutlined";
import DensityLargeOutlined from "@mui/icons-material/DensityLargeOutlined";
import ViewAgendaOutlined from "@mui/icons-material/ViewAgendaOutlined";

import { ColorModeContext, type ColorScheme } from "../../contexts/color-mode";
import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT_ID,
  getAccentPreset,
} from "../../theme/accentPalette";
import {
  LIGHT_SURFACES,
  DARK_SURFACES,
  DEFAULT_LIGHT_SURFACE,
  DEFAULT_DARK_SURFACE,
  ACCENT_SURFACE_KEY,
  DEFAULT_CARD_SKIN,
  DEFAULT_UI_SCALE,
  DEFAULT_SIDEBAR_DENSITY,
  type CardSkin,
  type SurfacePreset,
  type UiScale,
  type SidebarDensity,
} from "../../theme";
import { usePermissions } from "../../hooks/usePermissions";
import { updateOrganization } from "../../api/organization";

const SCHEME_OPTIONS: { value: ColorScheme; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "День", icon: <LightModeOutlined fontSize="small" /> },
  { value: "dark", label: "Ночь", icon: <DarkModeOutlined fontSize="small" /> },
  { value: "system", label: "Система", icon: <SettingsBrightnessOutlined fontSize="small" /> },
];

const SCALE_OPTIONS: { value: UiScale; label: string; letterSize: number }[] = [
  { value: "compact", label: "Компактный", letterSize: 12 },
  { value: "normal", label: "Обычный", letterSize: 15 },
  { value: "large", label: "Крупный", letterSize: 18 },
];

const DENSITY_OPTIONS: { value: SidebarDensity; label: string; icon: React.ReactNode }[] = [
  { value: "compact", label: "Плотно", icon: <DensitySmallOutlined fontSize="small" /> },
  { value: "normal", label: "Обычно", icon: <DensityMediumOutlined fontSize="small" /> },
  { value: "comfortable", label: "Свободно", icon: <DensityLargeOutlined fontSize="small" /> },
  { value: "spacious", label: "Просторно", icon: <ViewAgendaOutlined fontSize="small" /> },
];

/**
 * Хекс акцента в светлой теме. Кладём его в themeConfig рядом с accentId: так
 * версии фронта, которые ещё не знают про акцентную палитру, покажут близкий
 * цвет, а не дефолтный.
 */
const accentHex = (id: string) => getAccentPreset(id).light.accent;

const SectionTitle: React.FC<{ children: React.ReactNode; first?: boolean }> = ({
  children,
  first,
}) => (
  <Typography
    variant="caption"
    color="text.secondary"
    sx={{ display: "block", fontWeight: 700, letterSpacing: 0.6, mb: 1, mt: first ? 0 : 2.5 }}
  >
    {children}
  </Typography>
);

/**
 * Сетка акцентов. Свотч показывает связку, а не один цвет: подложка — accentBg
 * (фон чипов и активных пунктов), точка — сам accent. Так на глаз видно, каким
 * получится интерфейс, а не только кнопка «Создать».
 */
const AccentGrid: React.FC<{
  mode: "light" | "dark";
  selected: string;
  onSelect: (id: string) => void;
}> = ({ mode, selected, onSelect }) => (
  <Box sx={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 1 }}>
    {ACCENT_PRESETS.map((preset) => {
      const tokens = preset[mode];
      const isSel = preset.id === selected;
      return (
        <Tooltip key={preset.id} title={preset.name}>
          <Box
            component="button"
            type="button"
            onClick={() => onSelect(preset.id)}
            aria-label={preset.name}
            aria-pressed={isSel}
            sx={{
              cursor: "pointer",
              p: 0,
              height: 34,
              borderRadius: "10px",
              bgcolor: tokens.accentBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid",
              borderColor: tokens.border,
              outline: isSel ? "2px solid" : "2px solid transparent",
              outlineColor: isSel ? "primary.main" : "transparent",
              outlineOffset: 2,
              transition: "transform .1s ease",
              "&:active": { transform: "scale(0.94)" },
            }}
          >
            <Box
              sx={{
                width: isSel ? 18 : 14,
                height: isSel ? 18 : 14,
                borderRadius: "50%",
                bgcolor: tokens.accent,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "width .1s ease, height .1s ease",
              }}
            >
              {isSel && <CheckIcon sx={{ fontSize: 12, color: tokens.accentFg }} />}
            </Box>
          </Box>
        </Tooltip>
      );
    })}
  </Box>
);

/** Мини-превью одной поверхности: фон темы + акцентная точка + «строки текста». */
const PalettePreview: React.FC<{
  surface: SurfacePreset;
  dark: boolean;
  accent: string;
  selected: boolean;
  onSelect: () => void;
}> = ({ surface, dark, accent, selected, onSelect }) => {
  const barStrong = dark ? "rgba(255,255,255,0.30)" : "rgba(0,0,0,0.22)";
  const barSoft = dark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.10)";
  return (
    <Box
      component="button"
      type="button"
      onClick={onSelect}
      aria-label={surface.name}
      sx={{
        p: 0,
        border: "none",
        bgcolor: "transparent",
        cursor: "pointer",
        textAlign: "left",
        display: "block",
        width: "100%",
      }}
    >
      <Box
        sx={{
          position: "relative",
          height: 66,
          borderRadius: "14px",
          p: 1,
          bgcolor: surface.default,
          border: "2px solid",
          borderColor: selected
            ? "primary.main"
            : dark
              ? "rgba(255,255,255,0.10)"
              : "rgba(0,0,0,0.10)",
          overflow: "hidden",
          transition: "border-color .15s ease, transform .1s ease",
          "&:active": { transform: "scale(0.98)" },
        }}
      >
        {/* Внутренняя «карточка» — цвет paper */}
        <Box
          sx={{
            height: "100%",
            borderRadius: "10px",
            bgcolor: surface.paper,
            px: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 0.6,
          }}
        >
          <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: accent, mb: 0.2 }} />
          <Box sx={{ width: "70%", height: 5, borderRadius: 1, bgcolor: barStrong }} />
          <Box sx={{ width: "45%", height: 5, borderRadius: 1, bgcolor: barSoft }} />
        </Box>

        {selected && (
          <Box
            sx={{
              position: "absolute",
              right: 6,
              bottom: 6,
              width: 18,
              height: 18,
              borderRadius: "50%",
              bgcolor: "primary.main",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: 1,
            }}
          >
            <CheckIcon sx={{ fontSize: 12, color: "primary.contrastText" }} />
          </Box>
        )}
      </Box>
      <Typography variant="caption" sx={{ display: "block", mt: 0.5, fontWeight: 600 }}>
        {surface.name}
      </Typography>
    </Box>
  );
};

/** Сетка мини-превью палитры (2 колонки). */
const PalettePreviewGrid: React.FC<{
  surfaces: SurfacePreset[];
  dark: boolean;
  accent: string;
  selected: string;
  onSelect: (key: string) => void;
}> = ({ surfaces, dark, accent, selected, onSelect }) => (
  <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 1.25 }}>
    {surfaces.map((s) => (
      <PalettePreview
        key={s.key}
        surface={s}
        dark={dark}
        accent={accent}
        selected={selected.toLowerCase() === s.key.toLowerCase()}
        onSelect={() => onSelect(s.key)}
      />
    ))}
  </Box>
);

/** Внутреннее наполнение кастомайзера — переиспользуется в поповере и нижнем листе. */
const ThemeCustomizerContent: React.FC<{
  onClose: () => void;
  /** Сигнал об изменении высоты — поповер пересчитывает позицию. */
  onResize?: () => void;
  /** Растягивать на всю ширину (для нижнего листа на мобильных). */
  fullWidth?: boolean;
}> = ({ onClose, onResize, fullWidth }) => {
  const {
    scheme,
    setScheme,
    mode,
    accentId,
    setAccentId,
    accentPreset,
    primaryColor,
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
  } = React.useContext(ColorModeContext);

  const { activeOrganization, isSuperAdmin, hasPermission, activeMembership } = usePermissions();
  const canManageOrgTheme =
    isSuperAdmin() ||
    hasPermission("organization.update") ||
    Boolean(activeMembership?.isOwner) ||
    activeMembership?.role?.code === "manager";

  const handleUpdate = React.useCallback(
    (patch: {
      colorScheme?: ColorScheme;
      accentId?: string;
      lightSurface?: string;
      darkSurface?: string;
      cardSkin?: CardSkin;
      uiScale?: UiScale;
      sidebarDensity?: SidebarDensity;
    }) => {
      const nextScheme = patch.colorScheme ?? scheme;
      const nextAccentId = patch.accentId ?? accentId;
      const nextLight = patch.lightSurface ?? lightSurface;
      const nextDark = patch.darkSurface ?? darkSurface;
      const nextCard = patch.cardSkin ?? cardSkin;
      const nextScale = patch.uiScale ?? uiScale;
      const nextDensity = patch.sidebarDensity ?? sidebarDensity;

      if (patch.colorScheme) setScheme(patch.colorScheme);
      if (patch.accentId) setAccentId(patch.accentId);
      if (patch.lightSurface) setLightSurface(patch.lightSurface);
      if (patch.darkSurface) setDarkSurface(patch.darkSurface);
      if (patch.cardSkin) setCardSkin(patch.cardSkin);
      if (patch.uiScale) setUiScale(patch.uiScale);
      if (patch.sidebarDensity) setSidebarDensity(patch.sidebarDensity);

      if (canManageOrgTheme && activeOrganization?.id) {
        const newThemeConfig = {
          colorScheme: nextScheme,
          accentId: nextAccentId,
          // Хекс акцента остаётся в конфиге для совместимости: его читают версии
          // фронта, которые ещё не знают про accentId (кэш PWA, публичные темы).
          primaryColor: accentHex(nextAccentId),
          lightSurface: nextLight,
          darkSurface: nextDark,
          cardSkin: nextCard,
          uiScale: nextScale,
          sidebarDensity: nextDensity,
        };
        updateOrganization(activeOrganization.id, { themeConfig: newThemeConfig }).catch(
          (err) => console.error("Failed to save organization theme config", err),
        );
      }
    },
    [
      scheme,
      accentId,
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
      canManageOrgTheme,
      activeOrganization?.id,
    ],
  );

  const handleReset = React.useCallback(() => {
    reset();
    if (canManageOrgTheme && activeOrganization?.id) {
      const defaultThemeConfig = {
        colorScheme: "system",
        accentId: DEFAULT_ACCENT_ID,
        primaryColor: accentHex(DEFAULT_ACCENT_ID),
        lightSurface: DEFAULT_LIGHT_SURFACE,
        darkSurface: DEFAULT_DARK_SURFACE,
        cardSkin: DEFAULT_CARD_SKIN,
        uiScale: DEFAULT_UI_SCALE,
        sidebarDensity: DEFAULT_SIDEBAR_DENSITY,
      };
      updateOrganization(activeOrganization.id, { themeConfig: defaultThemeConfig }).catch(
        (err) => console.error("Failed to reset organization theme config", err),
      );
    }
  }, [reset, canManageOrgTheme, activeOrganization?.id]);

  /**
   * Поверхность «под акцент» — псевдо-пресет для той же сетки превью, что и
   * нейтральные фоны. Значения берутся из выбранного акцента, поэтому карточка
   * меняется вместе с ним.
   */
  const tintedSurface: SurfacePreset = React.useMemo(() => {
    const tokens = accentPreset[mode];
    return {
      key: ACCENT_SURFACE_KEY,
      name: "Под акцент",
      default: tokens.page,
      paper: tokens.surface,
      swatch: tokens.accentBg,
    };
  }, [accentPreset, mode]);

  const [colorsOpen, setColorsOpen] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  // При раскрытии блока цветов подматываем тело вниз, чтобы палитра и кнопка
  // «Сбросить» оказались в зоне видимости на невысоких экранах.
  React.useEffect(() => {
    if (!colorsOpen) return;
    const el = scrollRef.current;
    if (!el) return;
    const id = window.setTimeout(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }, 240);
    return () => window.clearTimeout(id);
  }, [colorsOpen]);

  // При раскрытии/сворачивании блока цветов высота меняется. Поповер
  // позиционируется по нижнему краю (transformOrigin: bottom), поэтому
  // в течение анимации Collapse пересчитываем позицию по кадрам — блок
  // растёт вверх, оставаясь полностью видимым над кнопкой.
  React.useEffect(() => {
    if (!onResize) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      onResize();
      if (now - start < 360) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // mode тоже влияет на высоту: светлая палитра — 1 ряд, тёмная — 2 ряда.
  }, [colorsOpen, mode, onResize]);

  const isDefault =
    scheme === "system" &&
    accentId === DEFAULT_ACCENT_ID &&
    lightSurface === DEFAULT_LIGHT_SURFACE &&
    darkSurface === DEFAULT_DARK_SURFACE &&
    cardSkin === DEFAULT_CARD_SKIN &&
    uiScale === DEFAULT_UI_SCALE &&
    sidebarDensity === DEFAULT_SIDEBAR_DENSITY;

  return (
    <Box
      sx={{
        width: fullWidth ? "100%" : { xs: "calc(100vw - 32px)", sm: 320 },
        maxWidth: fullWidth ? "100%" : 360,
        display: "flex",
        flexDirection: "column",
        // Ограничиваем высоту всего кастомайзера по вьюпорту, чтобы на низких
        // экранах он не вылезал за поповер/лист. Тело ниже шапки скроллится.
        maxHeight: fullWidth ? "calc(90dvh - 28px)" : "min(620px, calc(100dvh - 32px))",
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 2, py: 1.5, flexShrink: 0 }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <PaletteOutlined fontSize="small" color="primary" />
          <Typography variant="subtitle1" fontWeight={700}>
            Настройка темы
          </Typography>
        </Stack>
        <IconButton size="small" onClick={onClose} aria-label="Закрыть">
          <CloseOutlined fontSize="small" />
        </IconButton>
      </Stack>
      <Divider sx={{ flexShrink: 0 }} />

      {/* Прокручиваемое тело — всё, кроме шапки. Единый скролл вместо
          отдельного скролла только у блока цветов. */}
      <Box ref={scrollRef} sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
      {/* Всегда видимая часть */}
      <Box sx={{ px: 2, pt: 2, pb: 2 }}>
        {canManageOrgTheme && (
          <Typography variant="caption" color="primary" sx={{ display: "block", mb: 1, fontWeight: 600 }}>
            Вы управляете палитрой организации
          </Typography>
        )}
        {/* Цветовая схема */}
        <SectionTitle first>Тема</SectionTitle>
        <ToggleButtonGroup
          value={scheme}
          exclusive
          fullWidth
          size="small"
          onChange={(_, val) => val && handleUpdate({ colorScheme: val as ColorScheme })}
        >
          {SCHEME_OPTIONS.map((o) => (
            <ToggleButton key={o.value} value={o.value} sx={{ flexDirection: "column", gap: 0.5, py: 1 }}>
              {o.icon}
              <Typography variant="caption" fontWeight={600}>
                {o.label}
              </Typography>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {/* Размер интерфейса */}
        <SectionTitle>Размер интерфейса</SectionTitle>
        <ToggleButtonGroup
          value={uiScale}
          exclusive
          fullWidth
          size="small"
          onChange={(_, val) => val && handleUpdate({ uiScale: val as UiScale })}
        >
          {SCALE_OPTIONS.map((o) => (
            <ToggleButton key={o.value} value={o.value} sx={{ flexDirection: "column", gap: 0.25, py: 1 }}>
              <Box
                component="span"
                sx={{ fontSize: o.letterSize, fontWeight: 700, lineHeight: 1 }}
              >
                А
              </Box>
              <Typography variant="caption" fontWeight={600}>
                {o.label}
              </Typography>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {/* Плотность бокового меню */}
        <SectionTitle>Плотность меню</SectionTitle>
        <ToggleButtonGroup
          value={sidebarDensity}
          exclusive
          fullWidth
          size="small"
          onChange={(_, val) => val && handleUpdate({ sidebarDensity: val as SidebarDensity })}
        >
          {DENSITY_OPTIONS.map((o) => (
            <ToggleButton
              key={o.value}
              value={o.value}
              sx={{ flexDirection: "column", gap: 0.5, py: 1, px: 0.5 }}
            >
              {o.icon}
              <Typography
                variant="caption"
                fontWeight={600}
                sx={{ fontSize: 10.5, lineHeight: 1.2, whiteSpace: "nowrap" }}
              >
                {o.label}
              </Typography>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {/* Раскрывающийся блок настройки цветов */}
        <Box
          component="button"
          type="button"
          onClick={() => setColorsOpen((v) => !v)}
          sx={{
            mt: 2,
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 1.5,
            py: 1,
            cursor: "pointer",
            borderRadius: "10px",
            border: "1px solid",
            borderColor: "divider",
            bgcolor: (t) => (colorsOpen ? alpha(t.palette.primary.main, 0.06) : "transparent"),
            color: "text.primary",
            transition: "background-color .15s ease",
            "&:hover": { bgcolor: (t) => alpha(t.palette.primary.main, 0.08) },
          }}
        >
          <ColorLensOutlined fontSize="small" color="primary" />
          <Typography variant="body2" fontWeight={600} sx={{ flex: 1, textAlign: "left" }}>
            Настройка цветов
          </Typography>
          <ExpandMoreOutlined
            fontSize="small"
            sx={{
              transition: "transform .2s ease",
              transform: colorsOpen ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </Box>

        {/* Сброс — всегда доступен, вне скрытого блока цветов */}
        <Button
          fullWidth
          variant="outlined"
          color="inherit"
          size="small"
          startIcon={<RestartAltOutlined />}
          onClick={handleReset}
          disabled={isDefault}
          sx={{ mt: 2 }}
        >
          Сбросить
        </Button>
      </Box>

      {/* Раскрываемый блок цветов — прокрутка обеспечивается общим телом выше */}
      <Collapse in={colorsOpen} unmountOnExit>
        <Box
          sx={{
            px: 2,
            pb: 2,
            pt: 0,
          }}
        >
          <Box>
            <Divider sx={{ mb: 1.5 }} />
            {/* Стиль карточек */}
            <SectionTitle first>Стиль карточек</SectionTitle>
            <ToggleButtonGroup
              value={cardSkin}
              exclusive
              fullWidth
              size="small"
              onChange={(_, val) => val && handleUpdate({ cardSkin: val as CardSkin })}
            >
              <ToggleButton value="bordered" sx={{ gap: 0.75, py: 1 }}>
                <CropSquareOutlined fontSize="small" />
                <Typography variant="caption" fontWeight={600}>
                  Обводка
                </Typography>
              </ToggleButton>
              <ToggleButton value="shadow" sx={{ gap: 0.75, py: 1 }}>
                <LayersOutlined fontSize="small" />
                <Typography variant="caption" fontWeight={600}>
                  Тень
                </Typography>
              </ToggleButton>
            </ToggleButtonGroup>

            {/* Акцент */}
            <SectionTitle>
              Акцент — {accentPreset.name.toLowerCase()}
            </SectionTitle>
            <AccentGrid
              mode={mode}
              selected={accentId}
              onSelect={(id) => handleUpdate({ accentId: id })}
            />

            {/* Палитра фона — только для активного режима (день/ночь).
                Первый вариант тонирует поверхности под акцент, остальные —
                нейтральные фоны для тех, кому цветной фон не нужен. */}
            {mode === "light" ? (
              <>
                <SectionTitle>Светлая палитра</SectionTitle>
                <PalettePreviewGrid
                  surfaces={[tintedSurface, ...LIGHT_SURFACES]}
                  dark={false}
                  accent={primaryColor}
                  selected={lightSurface}
                  onSelect={(k) => handleUpdate({ lightSurface: k })}
                />
              </>
            ) : (
              <>
                <SectionTitle>Тёмная палитра</SectionTitle>
                <PalettePreviewGrid
                  surfaces={[tintedSurface, ...DARK_SURFACES]}
                  dark
                  accent={primaryColor}
                  selected={darkSurface}
                  onSelect={(k) => handleUpdate({ darkSurface: k })}
                />
              </>
            )}
          </Box>
        </Box>
      </Collapse>
      </Box>
    </Box>
  );
};

type ThemeCustomizerButtonProps = {
  /** Размещение тултипа над иконкой. */
  tooltipPlacement?: "top" | "right" | "bottom" | "left";
};

/**
 * Кнопка-триггер кастомайзера темы для подвала сайдбара.
 * Открывает поповер с настройками над собой.
 */
export const ThemeCustomizerButton: React.FC<ThemeCustomizerButtonProps> = ({
  tooltipPlacement = "top",
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const open = isMobile ? sheetOpen : Boolean(anchorEl);
  const popoverActionRef = React.useRef<PopoverActions | null>(null);

  const handleResize = React.useCallback(() => {
    popoverActionRef.current?.updatePosition();
  }, []);

  const handleOpen = (e: React.MouseEvent<HTMLElement>) => {
    if (isMobile) setSheetOpen(true);
    else setAnchorEl(e.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
    setSheetOpen(false);
  };

  return (
    <>
      <Tooltip title="Настройка темы" placement={tooltipPlacement}>
        <IconButton
          onClick={handleOpen}
          size="small"
          aria-label="Настройка темы"
          color={open ? "primary" : "default"}
        >
          <PaletteOutlined fontSize="small" />
        </IconButton>
      </Tooltip>

      {isMobile ? (
        <Drawer
          anchor="bottom"
          open={sheetOpen}
          onClose={handleClose}
          // Выше overlay-сайдбара (zIndex.drawer + 5), из которого открывается.
          sx={{ zIndex: (t) => t.zIndex.drawer + 10 }}
          slotProps={{
            paper: {
              sx: {
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                maxHeight: "90dvh",
                overflow: "hidden",
              },
            },
          }}
        >
          {/* «Ручка» нижнего листа */}
          <Box
            sx={{
              width: 40,
              height: 4,
              borderRadius: "14px",
              bgcolor: "divider",
              mx: "auto",
              mt: 1,
              mb: 0.5,
            }}
          />
          <ThemeCustomizerContent onClose={handleClose} fullWidth />
        </Drawer>
      ) : (
        <Popover
          open={Boolean(anchorEl)}
          action={popoverActionRef}
          anchorEl={anchorEl}
          onClose={handleClose}
          anchorOrigin={{ vertical: "top", horizontal: "left" }}
          transformOrigin={{ vertical: "bottom", horizontal: "left" }}
          slotProps={{
            paper: {
              sx: {
                mt: -1,
                borderRadius: "14px",
                overflow: "hidden",
                boxShadow: (t) => t.shadows[8],
              },
            },
          }}
        >
          <ThemeCustomizerContent onClose={handleClose} onResize={handleResize} />
        </Popover>
      )}
    </>
  );
};

export default ThemeCustomizerButton;
