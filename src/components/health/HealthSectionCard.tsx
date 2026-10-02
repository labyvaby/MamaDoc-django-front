import React from "react";
import { Alert, Box, Stack, Typography } from "@mui/material";

import { AppCard, ListEmptyState } from "../ui";

interface HealthSectionCardProps {
  title: string;
  subheader?: React.ReactNode;
  /** Кнопки справа (на телефоне — под заголовком). */
  actions?: React.ReactNode;
  loading?: boolean;
  error?: boolean;
  /** Пусто: иконка, заголовок и подсказка вместо содержимого. */
  empty?: { icon: React.ReactNode; title: string; description?: string; action?: React.ReactNode } | null;
  children?: React.ReactNode;
}

/** Карточка раздела медпрофиля — как «Зрение» и «Рост» в книжке. */
export const HealthSectionCard: React.FC<HealthSectionCardProps> = ({
  title,
  subheader,
  actions,
  loading,
  error,
  empty,
  children,
}) => (
  <AppCard
    variant="outlined"
    header={
      <Stack
        direction={{ xs: "column", md: "row" }}
        justifyContent="space-between"
        alignItems={{ md: "center" }}
        gap={1.5}
        sx={{ px: 2, pt: 2 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" fontWeight={700}>
            {title}
          </Typography>
          {subheader && (
            <Typography variant="body2" color="text.secondary" component="div">
              {subheader}
            </Typography>
          )}
        </Box>
        {actions && (
          <Stack direction="row" gap={1} flexWrap="wrap" sx={{ flexShrink: 0 }}>
            {actions}
          </Stack>
        )}
      </Stack>
    }
  >
    {error ? (
      <Alert severity="error">Не удалось загрузить раздел «{title}».</Alert>
    ) : loading ? (
      <Typography variant="body2" color="text.secondary">
        Загрузка…
      </Typography>
    ) : empty ? (
      <ListEmptyState icon={empty.icon} title={empty.title} description={empty.description} action={empty.action} />
    ) : (
      children
    )}
  </AppCard>
);
