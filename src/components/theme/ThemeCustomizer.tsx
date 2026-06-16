import React from "react";
import {
  Box,
  Drawer,
  Stack,
  Typography,
  IconButton,
  Divider,
  ToggleButton,
  ToggleButtonGroup,
  Button,
  Tooltip,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import LightModeOutlined from "@mui/icons-material/LightModeOutlined";
import DarkModeOutlined from "@mui/icons-material/DarkModeOutlined";
import SettingsBrightnessOutlined from "@mui/icons-material/SettingsBrightnessOutlined";
import CheckIcon from "@mui/icons-material/Check";
import RestartAltOutlined from "@mui/icons-material/RestartAltOutlined";
import CropSquareOutlined from "@mui/icons-material/CropSquareOutlined";
import LayersOutlined from "@mui/icons-material/LayersOutlined";

import {
  ColorModeContext,
  PRIMARY_PRESETS,
  DEFAULT_PRIMARY,
  type ColorScheme,
} from "../../contexts/color-mode";
import {
  LIGHT_SURFACES,
  DARK_SURFACES,
  DEFAULT_LIGHT_SURFACE,
  DEFAULT_DARK_SURFACE,
  DEFAULT_CARD_SKIN,
  type CardSkin,
  type SurfacePreset,
} from "../../theme";

type ThemeCustomizerProps = {
  open: boolean;
  onClose: () => void;
};

const SCHEME_OPTIONS: { value: ColorScheme; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "Светлая", icon: <LightModeOutlined fontSize="small" /> },
  { value: "dark", label: "Тёмная", icon: <DarkModeOutlined fontSize="small" /> },
  { value: "system", label: "Системная", icon: <SettingsBrightnessOutlined fontSize="small" /> },
];

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5, mt: 3 }}>
    {children}
  </Typography>
);

/** Сетка цветовых свотчей (общая для основного цвета и поверхностей). */
const SwatchGrid: React.FC<{
  items: { key: string; color: string; name: string; bordered?: boolean }[];
  selected: string;
  onSelect: (key: string) => void;
}> = ({ items, selected, onSelect }) => (
  <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1.5 }}>
    {items.map((it) => {
      const isSel = selected.toLowerCase() === it.key.toLowerCase();
      return (
        <Tooltip key={it.key} title={it.name}>
          <Box
            component="button"
            type="button"
            onClick={() => onSelect(it.key)}
            aria-label={it.name}
            sx={{
              cursor: "pointer",
              p: 0,
              height: 44,
              borderRadius: 1.5,
              bgcolor: it.color,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              border: it.bordered ? "1px solid" : "1px solid transparent",
              borderColor: it.bordered ? "divider" : "transparent",
              outline: isSel ? "2px solid" : "2px solid transparent",
              outlineColor: isSel ? "primary.main" : "transparent",
              outlineOffset: 2,
              transition: "transform .1s ease",
              "&:active": { transform: "scale(0.96)" },
            }}
          >
            {isSel && (
              <CheckIcon
                fontSize="small"
                sx={{ color: it.bordered ? "text.primary" : "#fff" }}
              />
            )}
          </Box>
        </Tooltip>
      );
    })}
  </Box>
);

const surfaceToSwatch = (s: SurfacePreset, light: boolean) => ({
  key: s.key,
  color: s.swatch,
  name: s.name,
  bordered: light, // светлые свотчи почти белые — нужна рамка
});

export const ThemeCustomizer: React.FC<ThemeCustomizerProps> = ({ open, onClose }) => {
  const {
    scheme,
    setScheme,
    primaryColor,
    setPrimaryColor,
    lightSurface,
    setLightSurface,
    darkSurface,
    setDarkSurface,
    cardSkin,
    setCardSkin,
    reset,
  } = React.useContext(ColorModeContext);

  const isDefault =
    scheme === "system" &&
    primaryColor === DEFAULT_PRIMARY &&
    lightSurface === DEFAULT_LIGHT_SURFACE &&
    darkSurface === DEFAULT_DARK_SURFACE &&
    cardSkin === DEFAULT_CARD_SKIN;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: "100%", sm: 360 },
          maxWidth: "100%",
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 2 }}>
        <Box>
          <Typography variant="h6" fontWeight={700}>
            Настройка темы
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Внешний вид интерфейса
          </Typography>
        </Box>
        <IconButton onClick={onClose} aria-label="Закрыть">
          <CloseOutlined />
        </IconButton>
      </Stack>
      <Divider />

      <Box sx={{ p: 2, flex: 1, overflowY: "auto" }}>
        {/* Цветовая схема */}
        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
          Цветовая схема
        </Typography>
        <ToggleButtonGroup
          value={scheme}
          exclusive
          fullWidth
          onChange={(_, val) => val && setScheme(val as ColorScheme)}
        >
          {SCHEME_OPTIONS.map((o) => (
            <ToggleButton key={o.value} value={o.value} sx={{ gap: 0.75, py: 1 }}>
              {o.icon}
              <Typography variant="caption" fontWeight={600}>
                {o.label}
              </Typography>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {/* Основной цвет */}
        <SectionTitle>Основной цвет</SectionTitle>
        <SwatchGrid
          items={PRIMARY_PRESETS.map((c) => ({ key: c.value, color: c.value, name: c.name }))}
          selected={primaryColor}
          onSelect={setPrimaryColor}
        />

        {/* Светлая палитра */}
        <SectionTitle>Светлая палитра</SectionTitle>
        <SwatchGrid
          items={LIGHT_SURFACES.map((s) => surfaceToSwatch(s, true))}
          selected={lightSurface}
          onSelect={setLightSurface}
        />

        {/* Тёмная палитра */}
        <SectionTitle>Тёмная палитра</SectionTitle>
        <SwatchGrid
          items={DARK_SURFACES.map((s) => surfaceToSwatch(s, false))}
          selected={darkSurface}
          onSelect={setDarkSurface}
        />

        {/* Оформление карточек */}
        <SectionTitle>Оформление карточек</SectionTitle>
        <ToggleButtonGroup
          value={cardSkin}
          exclusive
          fullWidth
          onChange={(_, val) => val && setCardSkin(val as CardSkin)}
        >
          <ToggleButton value="bordered" sx={{ gap: 0.75, py: 1 }}>
            <CropSquareOutlined fontSize="small" />
            <Typography variant="caption" fontWeight={600}>
              С рамкой
            </Typography>
          </ToggleButton>
          <ToggleButton value="shadow" sx={{ gap: 0.75, py: 1 }}>
            <LayersOutlined fontSize="small" />
            <Typography variant="caption" fontWeight={600}>
              С тенью
            </Typography>
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Divider />
      <Box sx={{ p: 2 }}>
        <Button
          fullWidth
          variant="outlined"
          color="inherit"
          startIcon={<RestartAltOutlined />}
          onClick={reset}
          disabled={isDefault}
        >
          Сбросить
        </Button>
      </Box>
    </Drawer>
  );
};

export default ThemeCustomizer;
