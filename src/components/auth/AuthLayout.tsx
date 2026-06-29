/**
 * AuthLayout.tsx
 * Контейнер для всех страниц аутентификации.
 * Обеспечивает полное центрирование карточки (например, AuthCard) и визуальный фон.
 *
 * Выбранный стиль фона (по запросу): Вариант B — тематическое изображение + сильное размытие,
 * поверх — мягкий светлый градиент-оверлей для контраста формы.
 * Это создает ощущение спокойствия и чистоты, соответствующее бренду "Мама Доктор".
 *
 * Реализация:
 * - Слой 1: backgroundImage (cover, center) + CSS filter: blur(10px), лёгкое scale.
 * - Слой 2: полупрозрачный белый градиент-оверлей поверх изображения.
 * - Контент по центру с помощью CSS Grid/MUI Box.
 * - Презентационный компонент: не содержит бизнес-логики.
 */

import React from "react";
import { Box, alpha } from "@mui/material";
import bgAuth from "../../assets/img/backround_auth.jpg";

type Props = {
  children: React.ReactNode;
};
const AuthLayout: React.FC<Props> = ({ children }) => {
  return (
    <Box
      sx={(theme) => ({
        position: "relative",
        minHeight: theme.appLayout.fullPage.minHeight,
        display: "grid",
        placeItems: "center",
        px: { xs: 2, md: 3 },
        bgcolor: "background.default",
        overflow: "hidden",
      })}
    >
      {/* Фон: Вариант B — тематическое изображение + сильное размытие + полупрозрачный градиент-оверлей */}
      {/* Слой 1: фоновое изображение с размытием */}
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url(${bgAuth})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "blur(10px)",
          transform: "scale(1.06)", // слегка увеличиваем, чтобы скрыть края после blur
          pointerEvents: "none",
        }}
      />
      {/* Слой 2: мягкий оверлей поверх для контраста формы */}
      <Box
        aria-hidden
        sx={(theme) => ({
          position: "absolute",
          inset: 0,
          bgcolor: alpha(theme.palette.background.default, theme.palette.mode === "dark" ? 0.5 : 0.35),
          pointerEvents: "none",
        })}
      />
      {/* Контент авторизации по центру */}
      <Box
        sx={{
          position: "relative",
          width: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {children}
      </Box>
    </Box>
  );
};

export default AuthLayout;
