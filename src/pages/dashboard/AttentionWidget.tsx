import React from "react";
import { Box, Skeleton, Stack, Typography } from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";
import { Link as RouterLink } from "react-router";

import TaskAltOutlined from "@mui/icons-material/TaskAltOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";

import { DashCard, WidgetError, type WidgetProps } from "./widgetKit";
import {
  ATTENTION_GROUPS,
  attentionInputFromSections,
  buildAttentionItems,
  type AttentionSeverity,
} from "./attention";
import { useDashboardData } from "./DashboardData";

/**
 * Цвет группы как ТЕКСТ — `onSurface` из темы: тот же статус, но с
 * гарантированным контрастом на карточке в обеих темах (мелкий капс в основном
 * тоне на светлом фоне читался бы плохо).
 */
const groupInk = (t: Theme, severity: AttentionSeverity): string =>
  severity === "urgent"
    ? t.palette.error.onSurface
    : severity === "today"
      ? t.palette.warning.onSurface
      : t.palette.primary.onSurface;

/** Сколько строк без прокрутки: длинный список — это уже не «внимание», а шум. */
const MAX_ROWS = 8;

/**
 * «Требует внимания» — одна лента того, что владелец должен решить сегодня,
 * собранная из всех разделов: брони, касса, задачи, отзывы, отчёт, воронка,
 * загрузка. Вместо того чтобы обходить десять плиток и самому искать красные,
 * он читает готовый список, отсортированный по срочности, и кликает в раздел.
 *
 * Правила «что считать проблемой» — в `attention.ts` (с тестами). Раздел без
 * прав, ещё не загруженный или без нужной метрики молчит, а не рисует ложный
 * ноль.
 */
export const AttentionWidget: React.FC<WidgetProps> = ({ range }) => {
  const data = useDashboardData();
  const sections = [
    "bookings",
    "tasks",
    "deals",
    "reviews",
    "money",
    "load",
  ] as const;
  // Пока грузится хоть что-то и лента пуста — скелет, а не преждевременное
  // «всё под контролем».
  const loading = sections.some((k) => data.isLoading(k));
  // Ошибка агрегата — одна на все разделы; на прежних ручках раздел с ошибкой
  // просто молчит, как раньше.
  const error = data.source === "legacy" ? undefined : data.error("money");

  const items = React.useMemo(
    () => buildAttentionItems(attentionInputFromSections(data.sections, range.label)),
    [data.sections, range.label],
  );

  const toDecide = items.filter((i) => i.severity !== "opportunity").length;
  // Лимит строк — на весь блок, а не на группу: срочное идёт первым и не
  // вытесняется возможностями.
  const shown = items.slice(0, MAX_ROWS);
  const groups = ATTENTION_GROUPS.map((g) => ({
    ...g,
    items: shown.filter((i) => i.severity === g.severity),
    total: items.filter((i) => i.severity === g.severity).length,
  })).filter((g) => g.items.length > 0);

  return (
    <DashCard
      title="Требует внимания"
      subheader={
        items.length > 0
          ? toDecide > 0
            ? `${toDecide} к решению`
            : "только возможности"
          : undefined
      }
    >
      {error && items.length === 0 ? (
        <WidgetError error={error} />
      ) : items.length === 0 && loading ? (
        <Stack spacing={1}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" height={36} sx={{ borderRadius: "9px" }} />
          ))}
        </Stack>
      ) : items.length === 0 ? (
        <Stack
          alignItems="center"
          justifyContent="center"
          spacing={0.75}
          sx={(t) => ({
            py: 3,
            height: "100%",
            borderRadius: "10px",
            bgcolor: alpha(t.palette.success.main, t.palette.mode === "dark" ? 0.1 : 0.06),
            color: "success.main",
            textAlign: "center",
          })}
        >
          <TaskAltOutlined />
          <Typography sx={{ fontWeight: 600, color: "text.primary" }}>Всё под контролем</Typography>
          <Typography variant="caption" sx={{ color: "text.secondary", px: 2 }}>
            Просрочек, заявок без ответа и минуса в кассе нет
          </Typography>
        </Stack>
      ) : (
        <Stack spacing={1.5} sx={{ mx: -0.75 }}>
          {groups.map((g) => (
            <Box key={g.severity}>
              <Stack
                direction="row"
                alignItems="center"
                spacing={0.75}
                sx={(t) => ({
                  px: 1,
                  pb: 0.5,
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: groupInk(t, g.severity),
                })}
              >
                <Box
                  sx={(t) => ({
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    bgcolor: groupInk(t, g.severity),
                  })}
                />
                <span>{g.label}</span>
                <Box component="span" sx={{ color: "text.disabled" }}>
                  {g.total}
                </Box>
              </Stack>
              {g.items.map((item) => (
                <Box
                  key={item.id}
                  component={RouterLink}
                  to={item.href}
                  sx={(t) => ({
                    display: "flex",
                    alignItems: "center",
                    gap: 1.25,
                    p: 1,
                    borderRadius: "9px",
                    color: "inherit",
                    textDecoration: "none",
                    transition: "background-color .15s ease",
                    "&:hover": {
                      bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.12 : 0.06),
                    },
                  })}
                >
                  <Typography
                    sx={(t) => ({
                      minWidth: 44,
                      fontSize: "0.875rem",
                      fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                      whiteSpace: "nowrap",
                      color:
                        item.severity === "opportunity"
                          ? "text.primary"
                          : groupInk(t, item.severity),
                    })}
                  >
                    {item.value}
                  </Typography>
                  <Typography
                    sx={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: "0.8125rem",
                      lineHeight: 1.35,
                      color: "text.secondary",
                    }}
                  >
                    {item.text}
                  </Typography>
                  <ChevronRightOutlined sx={{ fontSize: 18, color: "text.disabled" }} />
                </Box>
              ))}
            </Box>
          ))}
          {items.length > MAX_ROWS && (
            <Typography variant="caption" sx={{ color: "text.secondary", px: 1 }}>
              и ещё {items.length - MAX_ROWS}
            </Typography>
          )}
        </Stack>
      )}
    </DashCard>
  );
};

export default AttentionWidget;
