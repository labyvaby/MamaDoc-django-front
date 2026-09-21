/**
 * AuthLayout.tsx
 * Контейнер для всех страниц аутентификации (login, update-password).
 *
 * Раскладка:
 * - Десктоп (md+): split-screen. Слева — брендовая панель ErkinAI
 *   (ErkinBrandPanel: тёмный градиент, логотип, заголовок, мини-доска).
 *   Справа — форма.
 * - Мобильные (xs–sm): брендовая боковая панель скрыта, вместо неё сверху —
 *   компактный брендовый блок (тот же primary, со скруглённым низом), а под
 *   ним форма. Так на телефоне сохраняется бренд-присутствие, а не пустой лист.
 *
 * Цвета — только токены темы (primary / contrastText), без хардкод-hex.
 * Никакой бизнес-логики: чисто презентационный слой.
 */

import React from "react";
import { Box, Stack, Typography, alpha } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import AximoLogo from "./AximoLogo";
import ErkinBrandPanel from "./ErkinBrandPanel";

type Props = {
  children: React.ReactNode;
};

// Декоративный паттерн из медицинских крестиков на брендовой панели.
// Координаты в px относительно панели; прозрачность через alpha(contrastText).
type PatternDot = { top?: number; bottom?: number; left?: number; right?: number; size: number; opacity: number };

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
        // 3/5 бренд-панель, 2/5 форма; форме не даём ужаться ниже 420px.
        gridTemplateColumns: { xs: "1fr", md: "3fr minmax(420px, 2fr)" },
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

      {/* Десктоп: левая колонка — брендовая панель ErkinAI (скрыта на мобильных) */}
      <ErkinBrandPanel />

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
