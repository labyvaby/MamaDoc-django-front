import React from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import type { SxProps, Theme } from "@mui/material/styles";
import PhoneIphoneIcon from "@mui/icons-material/PhoneIphone";
import EmailIcon from "@mui/icons-material/Email";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";

import { subtleBg } from "../../theme";

/** Номерная метка: одна и та же цифра в шаге инструкции и на макете формы. */
const Marker: React.FC<{ n: number; sx?: SxProps<Theme> }> = ({ n, sx }) => (
  <Box
    component="span"
    aria-hidden
    sx={[
      {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 18,
        height: 18,
        borderRadius: "50%",
        bgcolor: "error.main",
        color: "error.contrastText",
        fontSize: "0.7rem",
        fontWeight: 700,
        lineHeight: 1,
        flexShrink: 0,
      },
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}
  >
    {n}
  </Box>
);

const Step: React.FC<{ n: number; children: React.ReactNode }> = ({ n, children }) => (
  <Stack component="li" direction="row" spacing={1} alignItems="flex-start">
    <Marker n={n} sx={{ mt: "2px" }} />
    <Typography variant="body2" color="text.secondary">
      {children}
    </Typography>
  </Stack>
);

const MockField: React.FC<{ label: string; value: React.ReactNode; marker: number; adornment?: React.ReactNode }> = ({
  label,
  value,
  marker,
  adornment,
}) => (
  <Box
    sx={{
      position: "relative",
      border: 1,
      borderColor: "divider",
      borderRadius: "10px",
      px: 1.25,
      py: 0.75,
      display: "flex",
      alignItems: "center",
      gap: 1,
    }}
  >
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.2 }}>
        {label}
      </Typography>
      <Typography variant="body2" noWrap sx={{ lineHeight: 1.3 }}>
        {value}
      </Typography>
    </Box>
    {adornment}
    <Marker n={marker} sx={{ position: "absolute", right: -9, top: "50%", mt: "-9px" }} />
  </Box>
);

/** Миниатюра формы входа с открытой вкладкой «Логин» — не интерактивна, только
 *  показывает, куда что вводить. Собрана из тех же приёмов оформления, что и
 *  настоящая форма (src/pages/auth/login.tsx), поэтому выглядит как она в
 *  любой теме и не устаревает как скриншот. */
const LoginFormMock: React.FC = () => {
  const tabSx: SxProps<Theme> = {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 0.5,
    py: 0.6,
    borderRadius: "10px",
    fontSize: "0.8rem",
    fontWeight: 500,
    color: "text.secondary",
    border: "1px solid transparent",
    position: "relative",
  };
  return (
    <Paper
      variant="outlined"
      role="img"
      aria-label="Форма входа: вкладка «Логин», поля «Email или логин» и «Пароль», кнопка «Войти»"
      sx={{
        p: 1.5,
        pr: 2,
        borderRadius: "14px",
        width: "100%",
        maxWidth: 300,
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      <Box sx={(t) => ({ display: "flex", p: 0.5, borderRadius: "12px", bgcolor: subtleBg(t), mb: 1.5 })}>
        <Box sx={tabSx}>
          <PhoneIphoneIcon sx={{ fontSize: 14 }} />
          Телефон
        </Box>
        <Box
          sx={[
            tabSx,
            (t) => ({ bgcolor: "background.paper", color: "text.primary", border: `1px solid ${t.palette.divider}` }),
          ]}
        >
          <EmailIcon sx={{ fontSize: 14 }} />
          Логин
          <Marker n={1} sx={{ position: "absolute", right: -9, top: -9 }} />
        </Box>
      </Box>

      <Stack spacing={1.25}>
        <MockField label="Email или логин" value="почта или номер телефона" marker={2} />
        <MockField
          label="Пароль"
          value="••••••••"
          marker={3}
          adornment={<VisibilityOutlined sx={{ fontSize: 16, color: "text.secondary" }} />}
        />
        <Box
          sx={{
            position: "relative",
            py: 0.9,
            textAlign: "center",
            borderRadius: "10px",
            bgcolor: "primary.main",
            color: "primary.contrastText",
            fontWeight: 600,
            fontSize: "0.85rem",
          }}
        >
          Войти
          <Marker n={4} sx={{ position: "absolute", right: -9, top: "50%", mt: "-9px", border: "2px solid", borderColor: "background.paper" }} />
        </Box>
      </Stack>
    </Paper>
  );
};

/** Зачем сотруднику пароль и как им входить — в рамке под формой установки
 *  пароля на вкладке «Безопасность» профиля (туда ведёт кнопка «Установить
 *  пароль» в шапке). */
const PasswordLoginHint: React.FC = () => (
  <Stack
    component={Paper}
    variant="outlined"
    direction={{ xs: "column", md: "row" }}
    spacing={{ xs: 2, md: 4 }}
    alignItems={{ md: "flex-start" }}
    sx={(t) => ({
      p: { xs: 2, md: 2.5 },
      borderRadius: "14px",
      // Подсказка: мягкий зелёный фон и зелёная рамка (как success-алерт), в обеих темах.
      bgcolor: alpha(t.palette.success.main, t.palette.mode === "dark" ? 0.12 : 0.08),
      borderColor: alpha(t.palette.success.main, 0.45),
    })}
  >
    <Stack spacing={1} sx={{ flex: 1, minWidth: 0 }}>
      <Typography variant="subtitle2">Зачем нужен пароль</Typography>
      <Typography variant="body2" color="text.secondary">
        С паролем вы входите в CRM сразу — без SMS-кода: не нужно ждать сообщение
        и вводить цифры. Выручает, когда связь слабая или телефон не под рукой.
      </Typography>
      <Typography variant="subtitle2" sx={{ pt: 0.5 }}>
        Как войти по паролю
      </Typography>
      <Stack component="ol" spacing={0.75} sx={{ m: 0, p: 0, listStyle: "none" }}>
        <Step n={1}>
          На странице входа переключитесь на вкладку <strong>«Логин»</strong>.
        </Step>
        <Step n={2}>
          В поле <strong>«Email или логин»</strong> укажите вашу <strong>почту</strong> или{" "}
          <strong>номер телефона</strong> — тот, что в карточке сотрудника.
        </Step>
        <Step n={3}>Введите пароль.</Step>
        <Step n={4}>
          Нажмите <strong>«Войти»</strong>.
        </Step>
      </Stack>
    </Stack>
    <Box sx={{ flexShrink: 0, width: { xs: "100%", md: 300 }, pr: 1 }}>
      <LoginFormMock />
    </Box>
  </Stack>
);

export default PasswordLoginHint;
