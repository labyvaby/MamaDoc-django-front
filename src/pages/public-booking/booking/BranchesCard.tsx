import React from "react";
import { Box, ButtonBase, Paper, Skeleton, Stack, Typography } from "@mui/material";
import PlaceOutlined from "@mui/icons-material/PlaceOutlined";
import ScheduleOutlined from "@mui/icons-material/ScheduleOutlined";

import type { ProfessionalScheduleBranch } from "../../../api/publicBooking";
import {
  BOOKING_PRIMARY,
  BOOKING_RADIUS,
  BOOKING_SHADOW,
  BORDER,
  BORDER_HOVER,
  MUTED,
  PILL_RADIUS,
  TILE_RADIUS,
  accentChip,
} from "../theme";
import { useT } from "../../../i18n/VerticalProvider";
import {
  branchHasSchedule,
  hhmm,
  lunchRange,
  ruleLabel,
  shortDate,
  timeRange,
  upcomingExceptions,
} from "./schedule";

/** Сегодняшняя дата в YYYY-MM-DD — исключения сравниваем строками. */
function todayIso(): string {
  const now = new Date();
  const m = `${now.getMonth() + 1}`.padStart(2, "0");
  const d = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

/** Чип ближайшего исключения: «5 сент · дополнительно 10:00 – 14:00». */
const ExceptionChip: React.FC<{ label: string }> = ({ label }) => (
  <Box
    sx={{
      px: 1,
      py: 0.4,
      borderRadius: PILL_RADIUS,
      fontSize: 11,
      fontWeight: 500,
      lineHeight: 1.3,
      whiteSpace: "nowrap",
      bgcolor: "background.default",
      border: `1px solid ${BORDER}`,
      color: MUTED,
    }}
  >
    {label}
  </Box>
);

/**
 * Есть ли в филиале свободное время: «ближайшее 3 сент» или «нет свободного
 * времени». Отвечает на вопрос, ради которого пациент и открыл карточку.
 */
const SlotChip: React.FC<{ nearest: string | null }> = ({ nearest }) => {
  const { t } = useT("publicBooking");
  return (
    <Box
      sx={{
        px: 0.85,
        py: 0.3,
        borderRadius: PILL_RADIUS,
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1.3,
        whiteSpace: "nowrap",
        ...(nearest
          ? accentChip
          : { bgcolor: "background.default", border: `1px solid ${BORDER}`, color: MUTED }),
      }}
    >
      {nearest
        ? t("branches.nearestSlot", { date: shortDate(nearest) })
        : t("branches.noSlotsHere")}
    </Box>
  );
};

/** График филиала: правила строками, ближайшие исключения — чипами. */
const BranchSchedule: React.FC<{ branch: ProfessionalScheduleBranch }> = ({ branch }) => {
  const { t } = useT("publicBooking");
  const today = todayIso();
  const exceptions = upcomingExceptions(branch.exceptions, today);

  const kindLabel = (kind: string): string => {
    if (kind === "day_off") return t("branches.excDayOff");
    if (kind === "vacation") return t("branches.excVacation");
    if (kind === "extra") return t("branches.excExtra");
    if (kind === "override") return t("branches.excOverride");
    return kind;
  };

  if (!branchHasSchedule(branch) && !exceptions.length) {
    return (
      <Typography sx={{ fontSize: 12, color: MUTED }}>{t("branches.noSchedule")}</Typography>
    );
  }

  return (
    <Stack spacing={0.75} sx={{ mt: 0.75 }}>
      {branch.rules.map((rule) => (
        <Stack key={rule.id} direction="row" alignItems="center" spacing={0.75}>
          <ScheduleOutlined sx={{ fontSize: 14, color: MUTED, flexShrink: 0 }} />
          <Typography sx={{ fontSize: 12.5, lineHeight: 1.4 }}>
            {ruleLabel(rule, t("branches.everyday"))}
            {lunchRange(rule) && (
              <Box component="span" sx={{ color: MUTED }}>
                {" "}
                ·{" "}
                {t("branches.lunch", {
                  from: hhmm(rule.lunchStart ?? ""),
                  to: hhmm(rule.lunchEnd ?? ""),
                })}
              </Box>
            )}
          </Typography>
        </Stack>
      ))}

      {!branch.rules.length && (
        <Typography sx={{ fontSize: 12, color: MUTED }}>{t("branches.noSchedule")}</Typography>
      )}

      {exceptions.length > 0 && (
        <Stack direction="row" flexWrap="wrap" gap={0.5}>
          {exceptions.map((exc) => (
            <ExceptionChip
              key={exc.id}
              label={[
                shortDate(exc.date),
                kindLabel(exc.kind),
                exc.startTime && exc.endTime ? timeRange(exc.startTime, exc.endTime) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
};

interface BranchesCardProps {
  branches: ProfessionalScheduleBranch[];
  loading: boolean;
  selectedId: number | null;
  onSelect: (id: number) => void;
  /**
   * Ближайшее свободное окно каждого филиала (YYYY-MM-DD) или null, если окон
   * нет; undefined — календари ещё грузятся.
   *
   * Без этого график филиала («Пн – Пт 09:00 – 16:30») читается как обещание
   * записи, хотя свободных дней там может не быть вовсе — и наоборот, филиал
   * без строки графика выглядит нерабочим, хотя окна в нём есть.
   */
  nearestByBranch?: Record<number, string | null>;
}

/**
 * «Филиалы и график» — где специалист принимает и когда.
 *
 * Зачем отдельный блок: в карточке врача филиал один («домашний»), а работать
 * он может в нескольких — второй филиал виден только через ручку расписания.
 * До этого блока пациент узнавал адрес уже после отправки заявки.
 *
 * ⚠ Филиал выбирает пациент, а не бэк: available-times/ строит окна по графику
 * специалиста независимо от branch_id (проверено на проде 28.08.2026), поэтому
 * из времени филиал не выводится. График рядом с выбором — чтобы адрес не
 * расходился со сменой.
 */
export const BranchesCard: React.FC<BranchesCardProps> = ({
  branches,
  loading,
  selectedId,
  onSelect,
  nearestByBranch,
}) => {
  const { t } = useT("publicBooking");
  const pickable = branches.length > 1;

  if (loading) {
    return <Skeleton variant="rounded" height={120} sx={{ borderRadius: BOOKING_RADIUS }} />;
  }
  if (!branches.length) return null;

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2, md: 2.5 },
        borderRadius: BOOKING_RADIUS,
        border: "none",
        boxShadow: BOOKING_SHADOW,
      }}
    >
      <Typography sx={{ fontSize: 15, fontWeight: 600, mb: 1.5 }}>{t("branches.title")}</Typography>

      {pickable && (
        <Typography sx={{ fontSize: 12.5, color: MUTED, mb: 1.5 }}>{t("branches.hint")}</Typography>
      )}

      <Stack spacing={1}>
        {branches.map((branch) => {
          const active = branch.id === selectedId;
          const content = (
            <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ width: "100%" }}>
              <PlaceOutlined
                sx={{ fontSize: 18, mt: 0.25, flexShrink: 0, color: active ? BOOKING_PRIMARY : MUTED }}
              />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap">
                  <Typography
                    sx={{ fontSize: 14, fontWeight: 600, color: active ? BOOKING_PRIMARY : "text.primary" }}
                  >
                    {branch.name}
                  </Typography>
                  {nearestByBranch && <SlotChip nearest={nearestByBranch[branch.id] ?? null} />}
                </Stack>
                {branch.address && (
                  <Typography sx={{ fontSize: 12.5, color: MUTED, lineHeight: 1.4 }}>
                    {branch.address}
                  </Typography>
                )}
                <BranchSchedule branch={branch} />
              </Box>
            </Stack>
          );

          const boxSx = {
            width: "100%",
            textAlign: "left" as const,
            p: 1.5,
            borderRadius: TILE_RADIUS,
            border: 1,
            borderColor: active && pickable ? accentChip.border : BORDER,
            bgcolor: active && pickable ? accentChip.bg : "transparent",
            transition: "all .2s",
          };

          // Один филиал — выбирать нечего: показываем адрес и график справкой,
          // чтобы кнопка не обещала выбор, которого нет.
          return pickable ? (
            <ButtonBase
              key={branch.id}
              onClick={() => onSelect(branch.id)}
              sx={{
                ...boxSx,
                display: "block",
                "&:hover": active ? {} : { borderColor: BORDER_HOVER },
              }}
            >
              {content}
            </ButtonBase>
          ) : (
            <Box key={branch.id} sx={boxSx}>
              {content}
            </Box>
          );
        })}
      </Stack>
    </Paper>
  );
};
