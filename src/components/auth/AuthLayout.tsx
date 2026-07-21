/**
 * AuthLayout.tsx
 * Контейнер для всех страниц аутентификации (login, update-password).
 *
 * Раскладка:
 * - Десктоп (md+): split-screen. Слева — брендовая панель на основном цвете
 *   темы (primary): логотип, слоган, ключевые возможности. Справа — форма.
 * - Мобильные (xs–sm): брендовая боковая панель скрыта, вместо неё сверху —
 *   компактный брендовый блок (тот же primary, со скруглённым низом), а под
 *   ним форма. Так на телефоне сохраняется бренд-присутствие, а не пустой лист.
 *
 * Цвета — только токены темы (primary / contrastText), без хардкод-hex.
 * Никакой бизнес-логики: чисто презентационный слой.
 */

import React from "react";
import { Box, Stack, Typography, alpha } from "@mui/material";
import EventAvailableOutlined from "@mui/icons-material/EventAvailableOutlined";
import FolderSharedOutlined from "@mui/icons-material/FolderSharedOutlined";
import GroupsOutlined from "@mui/icons-material/GroupsOutlined";
import AddOutlined from "@mui/icons-material/AddOutlined";
import AximoLogo from "./AximoLogo";

type Props = {
  children: React.ReactNode;
};

const FEATURES: { icon: React.ReactNode; text: string }[] = [
  { icon: <EventAvailableOutlined fontSize="small" />, text: "Задачи, встречи и рабочее расписание" },
  { icon: <FolderSharedOutlined fontSize="small" />, text: "Все данные и документы в одном месте" },
  { icon: <GroupsOutlined fontSize="small" />, text: "Единое пространство для вашей команды" },
];

// Декоративный паттерн из медицинских крестиков на брендовой панели.
// Координаты в px относительно панели; прозрачность через alpha(contrastText).
type PatternDot = { top?: number; bottom?: number; left?: number; right?: number; size: number; opacity: number };

const PANEL_PATTERN: PatternDot[] = [
  { top: 48, left: 40, size: 22, opacity: 0.14 },
  { top: 150, left: 128, size: 30, opacity: 0.1 },
  { bottom: 120, left: 56, size: 20, opacity: 0.13 },
  { top: 96, right: 96, size: 26, opacity: 0.1 },
  { bottom: 180, right: 44, size: 18, opacity: 0.13 },
  { bottom: 60, right: 130, size: 24, opacity: 0.09 },
];

const MOBILE_PATTERN: PatternDot[] = [
  { top: 16, right: 24, size: 20, opacity: 0.16 },
  { bottom: 14, right: 74, size: 26, opacity: 0.12 },
  { top: 40, right: 120, size: 16, opacity: 0.14 },
];

const PatternLayer: React.FC<{ dots: PatternDot[] }> = ({ dots }) => (
  <>
    {dots.map((d, i) => (
      <AddOutlined
        key={i}
        aria-hidden
        sx={(theme) => ({
          position: "absolute",
          top: d.top,
          bottom: d.bottom,
          left: d.left,
          right: d.right,
          fontSize: d.size,
          color: alpha(theme.palette.primary.contrastText, d.opacity),
          pointerEvents: "none",
        })}
      />
    ))}
  </>
);

const AuthLayout: React.FC<Props> = ({ children }) => {
  return (
    <Box
      sx={(theme) => ({
        minHeight: theme.appLayout.fullPage.minHeight,
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
        gridTemplateRows: { xs: "auto 1fr", md: "auto" },
        bgcolor: "background.default",
      })}
    >
      {/* Мобильный брендовый блок (только xs–sm) */}
      <Box
        aria-hidden
        sx={{
          display: { xs: "flex", md: "none" },
          flexDirection: "column",
          gap: 1,
          bgcolor: "primary.main",
          color: "primary.contrastText",
          px: 3,
          pt: 5,
          pb: 4,
          borderBottomLeftRadius: 24,
          borderBottomRightRadius: 24,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <PatternLayer dots={MOBILE_PATTERN} />
        <Stack direction="row" alignItems="center" gap={1.25} sx={{ position: "relative" }}>
          <AximoLogo light compact />
        </Stack>
        <Typography variant="h5" sx={{ fontWeight: 600, mt: 1, lineHeight: 1.25 }}>
          Управляйте бизнесом с ясностью
        </Typography>
        <Typography variant="body2" sx={(theme) => ({ color: alpha(theme.palette.primary.contrastText, 0.85) })}>
          CRM-платформа для процессов, клиентов и команды
        </Typography>
      </Box>

      {/* Десктоп: левая колонка — брендовая панель (скрыта на мобильных) */}
      <Box
        aria-hidden
        sx={{
          display: { xs: "none", md: "flex" },
          position: "relative",
          overflow: "hidden",
          flexDirection: "column",
          justifyContent: "space-between",
          p: 6,
          bgcolor: "primary.main",
          color: "primary.contrastText",
        }}
      >
        {/* Декоративные мягкие круги (через alpha от contrastText — без hex) */}
        <Box
          sx={(theme) => ({
            position: "absolute",
            width: 460,
            height: 460,
            borderRadius: "50%",
            top: -160,
            right: -140,
            bgcolor: alpha(theme.palette.primary.contrastText, 0.07),
            pointerEvents: "none",
          })}
        />
        <Box
          sx={(theme) => ({
            position: "absolute",
            width: 300,
            height: 300,
            borderRadius: "50%",
            bottom: -120,
            left: -90,
            bgcolor: alpha(theme.palette.primary.contrastText, 0.05),
            pointerEvents: "none",
          })}
        />

        {/* Паттерн из медицинских крестиков */}
        <PatternLayer dots={PANEL_PATTERN} />

        {/* Верх: нейтральное описание продукта */}
        <Box sx={{ position: "relative", display: "flex", justifyContent: "flex-end" }}>
          <Typography
            variant="caption"
            sx={(theme) => ({
              px: 1.5,
              py: 0.5,
              borderRadius: 999,
              border: `1px solid ${alpha(theme.palette.primary.contrastText, 0.35)}`,
              color: alpha(theme.palette.primary.contrastText, 0.9),
              letterSpacing: 0.2,
            })}
          >
            CRM-платформа
          </Typography>
        </Box>

        {/* Центр: логотип + слоган */}
        <Stack spacing={2.5} sx={{ position: "relative", maxWidth: 420 }}>
          <AximoLogo light />
          <Typography variant="h3" sx={{ fontWeight: 600, lineHeight: 1.25 }}>
            Управляйте бизнесом с ясностью
          </Typography>
          <Typography variant="body1" sx={(theme) => ({ color: alpha(theme.palette.primary.contrastText, 0.85), lineHeight: 1.6 })}>
            Единое пространство для задач, клиентов, команды и роста вашего бизнеса.
          </Typography>
        </Stack>

        {/* Низ: ключевые возможности */}
        <Stack spacing={1.5} sx={{ position: "relative" }}>
          {FEATURES.map((f) => (
            <Stack key={f.text} direction="row" spacing={1.5} alignItems="center">
              <Box
                sx={(theme) => ({
                  width: 34,
                  height: 34,
                  borderRadius: 2,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  bgcolor: alpha(theme.palette.primary.contrastText, 0.14),
                  color: "primary.contrastText",
                })}
              >
                {f.icon}
              </Box>
              <Typography variant="body2" sx={(theme) => ({ color: alpha(theme.palette.primary.contrastText, 0.92) })}>
                {f.text}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Box>

      {/* Форма (десктоп — правая колонка, мобильные — под брендовым блоком).
          На мобильном выравниваем по верху, чтобы форма не пере-центрировалась
          (и не «прыгала») при переключении вкладок разной высоты. */}
      <Box
        sx={{
          display: "flex",
          alignItems: { xs: "flex-start", md: "center" },
          justifyContent: "center",
          bgcolor: "background.paper",
          px: { xs: 2, sm: 4 },
          py: { xs: 4, md: 4 },
        }}
      >
        {children}
      </Box>
    </Box>
  );
};

export default AuthLayout;
