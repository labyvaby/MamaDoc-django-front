/**
 * AuthCard.tsx
 * Обёртка формы для экранов аутентификации.
 *
 * В split-screen-раскладке (см. AuthLayout) форма сидит плоско в левой колонке,
 * поэтому карточка-контейнер (рамка/тень) больше не нужна — это просто
 * ограничитель ширины с адаптивными полями. Так форма выглядит частью экрана,
 * а не «плавает» отдельным блоком.
 *
 * minHeight резервирует стабильную высоту: вкладки «Телефон» и «Email» имеют
 * разную высоту содержимого, и без резерва блок (центрированный по вертикали в
 * AuthLayout) пере-центрируется при переключении — визуальный «прыжок».
 * Контент выравниваем по верху, поэтому заголовок/вкладки/первое поле всегда
 * остаются на одном месте.
 */
import React from "react";
import { Box } from "@mui/material";

type Props = {
  children: React.ReactNode;
};

const AuthCard: React.FC<Props> = ({ children }) => {
  return (
    <Box
      sx={(theme) => ({
        width: "100%",
        maxWidth: 400,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-start",
        minHeight: { xs: "auto", md: theme.appLayout.auth.cardMinHeight },
      })}
    >
      {children}
    </Box>
  );
};

export default AuthCard;
