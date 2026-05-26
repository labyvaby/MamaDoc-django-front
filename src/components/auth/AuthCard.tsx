/**
 * AuthCard.tsx
 * Переиспользуемая «плавающая» карточка для экранов аутентификации.
 * Оборачивает содержимое формы (поля, кнопки, ссылки).
 * Стиль: MUI Card с приподнятостью и скруглением в духе «чистоты и спокойствия».
 *
 * Параметры:
 * - elevation: степень приподнятости (по умолчанию 12)
 */
import React from "react";
import { CardContent } from "@mui/material";
import { AppCard } from "../ui";

type Props = {
  children: React.ReactNode;
  elevation?: number;
};

const AuthCard: React.FC<Props> = ({ children, elevation = 12 }) => {
  return (
    <AppCard
      elevation={elevation}
      sx={{
        width: "100%",
        maxWidth: 400,
        borderRadius: 4, // 16px
        // Лёгкая «стеклянность» и контраст с фоном
        backdropFilter: "saturate(110%) blur(2px)",
        bgcolor: (theme) =>
          theme.palette.mode === "dark"
            ? "rgba(0,0,0,0.40)"
            : "rgba(255,255,255,0.85)",
      }}
      disableContentPadding
    >
      <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>{children}</CardContent>
    </AppCard>
  );
};

export default AuthCard;
