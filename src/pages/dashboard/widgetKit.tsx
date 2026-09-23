import React from "react";
import { Alert, Box, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import { AppCard } from "../../components/ui";
import type { ActiveScope } from "../../hooks/useActiveScope";
import type { PeriodKey, PeriodRange } from "./period";

/** Общий контракт всех блоков сводки: период, его ключ и скоуп пользователя. */
export type WidgetProps = {
  range: PeriodRange;
  periodKey: PeriodKey;
  scope: ActiveScope;
};

/** Ошибка одного блока не должна ронять остальные — показываем её внутри карточки. */
export const WidgetError: React.FC<{ error: unknown }> = ({ error }) => (
  <Alert severity="error" variant="outlined" sx={{ borderRadius: "10px" }}>
    {error instanceof Error ? error.message : "Не удалось загрузить данные"}
  </Alert>
);

export type DashCardProps = {
  title: React.ReactNode;
  /** Период или пояснение — одной строкой рядом с заголовком, не отдельной. */
  subheader?: React.ReactNode;
  /** Куда ведёт ссылка в шапке: весь раздел, а не отдельная цифра. */
  href?: string;
  /** Подпись ссылки — названием раздела («Касса», «Зарплата»), не «Открыть». */
  linkLabel?: string;
  /** Своё действие справа — рядом со ссылкой (например, чип изменения). */
  action?: React.ReactNode;
  children: React.ReactNode;
};

/**
 * Карточка блока сводки — плотнее стандартной AppCard.
 *
 * У AppCard шапка CardHeader и контент по 24px: на экране формы это воздух, на
 * сводке из десяти блоков — лишний экран прокрутки. Здесь шапка в одну строку
 * (заголовок · период … «Открыть»), контент 16px. Остальное — как у AppCard:
 * outlined, без теней, радиус из темы.
 */
export const DashCard: React.FC<DashCardProps> = ({
  title,
  subheader,
  href,
  linkLabel = "Открыть",
  action,
  children,
}) => (
  <AppCard
    variant="outlined"
    elevation={0}
    disableContentPadding
    sx={{ height: "100%", display: "flex", flexDirection: "column" }}
  >
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      sx={{ px: 2, pt: 1.75, pb: 1, minHeight: 44 }}
    >
      <Typography sx={{ fontWeight: 650, fontSize: "0.9375rem", letterSpacing: "-0.01em" }}>
        {title}
      </Typography>
      {subheader && (
        <Typography
          variant="caption"
          sx={{ color: "text.secondary", minWidth: 0 }}
          noWrap
        >
          {subheader}
        </Typography>
      )}
      <Box sx={{ ml: "auto !important", display: "flex", alignItems: "center", gap: 0.5 }}>
        {action}
        {href && (
          <Box
            component={RouterLink}
            to={href}
            sx={{
              display: "inline-flex",
              alignItems: "center",
              color: "text.secondary",
              textDecoration: "none",
              fontSize: "0.75rem",
              fontWeight: 500,
              borderRadius: "7px",
              pl: 0.75,
              py: 0.25,
              "&:hover": { color: "primary.onSurface" },
            }}
          >
            {linkLabel}
            <ChevronRightOutlined sx={{ fontSize: 16 }} />
          </Box>
        )}
      </Box>
    </Stack>
    <Box sx={{ px: 2, pb: 2, flex: 1, minWidth: 0 }}>{children}</Box>
  </AppCard>
);
