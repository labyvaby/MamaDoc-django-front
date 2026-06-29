/**
 * AuthCard.tsx
 * Переиспользуемая карточка для экранов аутентификации.
 * Оборачивает содержимое формы (поля, кнопки, ссылки).
 * Стиль: плоская AppCard на гранях, в духе общего гайда.
 */
import React from "react";
import { CardContent } from "@mui/material";
import { AppCard } from "../ui";

type Props = {
  children: React.ReactNode;
};

const AuthCard: React.FC<Props> = ({ children }) => {
  return (
    <AppCard
      variant="outlined"
      sx={{
        width: "100%",
        maxWidth: 400,
        bgcolor: "background.paper",
      }}
      disableContentPadding
    >
      <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>{children}</CardContent>
    </AppCard>
  );
};

export default AuthCard;
