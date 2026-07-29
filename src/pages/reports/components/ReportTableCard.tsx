import React from "react";
import { Box, Paper, Stack, Typography, alpha } from "@mui/material";

interface ReportTableCardProps {
  /** Подпись блока в шапке (в ЗП — роль, в отчётах — «По дням»). */
  title: string;
  /** Правая часть шапки: чип с итогом, кнопка и т.п. */
  headerActions?: React.ReactNode;
  /**
   * Приглушённая шапка — для служебных групп («Прочие»), чтобы они не
   * конкурировали по весу с основными.
   */
  muted?: boolean;
  /**
   * Карточка по высоте содержимого, но не выше доступного места: когда строк
   * больше, чем влезает, скроллится содержимое (липкие шапка и итог), а когда
   * меньше — карточка не растягивается и под таблицей нет пустой рамки.
   */
  scrollable?: boolean;
  children: React.ReactNode;
}

/**
 * Карточка-обёртка над таблицей отчёта: тонкая грань, шапка с подписью блока,
 * плоско (без тени). Используется и в «Отчётах», и в «Отчёте по зарплате» —
 * страницы должны выглядеть одинаково.
 */
export const ReportTableCard: React.FC<ReportTableCardProps> = ({
  title,
  headerActions,
  muted = false,
  scrollable = false,
  children,
}) => (
  <Paper
    variant="outlined"
    sx={{
      overflow: "hidden",
      ...(scrollable
        ? { display: "flex", flexDirection: "column", flex: "0 1 auto", minHeight: 0 }
        : null),
    }}
  >
    {/* Непрозрачная подложка под тинтом: содержимое карточки может скроллиться,
        и сквозь полупрозрачную шапку просвечивали бы уезжающие строки. */}
    <Box sx={{ bgcolor: "background.paper" }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
        sx={(t) => ({
          px: 2,
          py: 1,
          minHeight: 44,
          bgcolor: muted
            ? alpha(t.palette.text.primary, t.palette.mode === "dark" ? 0.06 : 0.04)
            : alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.12 : 0.05),
          borderBottom: `1px solid ${t.palette.divider}`,
        })}
      >
        <Typography
          variant="subtitle2"
          fontWeight={700}
          sx={{ color: muted ? "text.secondary" : "primary.onSurface" }}
        >
          {title}
        </Typography>
        {headerActions}
      </Stack>
    </Box>
    {scrollable ? (
      <Box sx={{ flex: "0 1 auto", minHeight: 0, display: "flex", flexDirection: "column" }}>
        {children}
      </Box>
    ) : (
      children
    )}
  </Paper>
);
