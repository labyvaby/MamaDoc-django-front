import React from "react";
import {
  Card,
  CardContent,
  CircularProgress,
  Divider,
  Stack,
  Typography,
} from "@mui/material";

interface IntakeSectionProps {
  /** Заголовок секции — приглушённый, как в форме приёма. */
  title: string;
  /** Пиктограмма перед заголовком — глазу проще найти нужный блок в длинном дровере. */
  icon?: React.ReactNode;
  /** Крутилка в шапке вместо действия, пока секция грузится. */
  loading?: boolean;
  /** Действие справа в шапке: счётчик, кнопка, что угодно. */
  action?: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * Обёртка одной секции дровера приёма анализов.
 *
 * Повторяет раскладку секций формы приёма (`DjangoAddAppointmentDrawer`):
 * карточка с рамкой, приглушённый заголовок обычного веса, тонкий разделитель
 * под ним и содержимое. Раньше секции лаборатории оформляли себя сами и
 * расходились: у одних была голубоватая заливка и жирный крупный заголовок, у
 * других — вообще ничего, из-за чего дровер выглядел набором чужих друг другу
 * блоков. Заголовок не спорит с содержимым за внимание: в форме приёма он
 * подпись к блоку, а не самостоятельная строка.
 */
const IntakeSection: React.FC<IntakeSectionProps> = ({
  title,
  icon,
  loading = false,
  action,
  children,
}) => (
  <Card variant="outlined" sx={{ bgcolor: "background.paper" }}>
    <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
      <Stack spacing={2}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          gap={1}
        >
          <Stack direction="row" alignItems="center" gap={0.75} sx={{ minWidth: 0 }}>
            {icon && (
              <Stack
                alignItems="center"
                justifyContent="center"
                sx={{ color: "text.secondary", "& svg": { fontSize: 18 } }}
              >
                {icon}
              </Stack>
            )}
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ fontWeight: 500 }}
            >
              {title}
            </Typography>
          </Stack>
          {loading ? <CircularProgress size={14} /> : action}
        </Stack>

        <Divider />

        {children}
      </Stack>
    </CardContent>
  </Card>
);

export default IntakeSection;
