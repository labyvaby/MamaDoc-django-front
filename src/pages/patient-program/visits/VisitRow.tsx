import React from "react";
import { Box, Chip, Stack, Typography, alpha, keyframes, useTheme, type Theme } from "@mui/material";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import EditNoteOutlined from "@mui/icons-material/EditNoteOutlined";
import dayjs, { type Dayjs } from "dayjs";

import AppointmentStatusChips from "../../../components/appointments/AppointmentStatusChips";
import { UserAvatar } from "../../../components/ui";
import { subtleBorder } from "../../../theme/uiHelpers";
import { cancelReasonLabel } from "../../../utility/cancelReasonLabel";
import { pluralRu } from "../../../utility/amountInWords";
import { formatKGS } from "../../../utility/format";
import type { DjangoAppointment } from "../../../api/appointments";
import { monthShort, type Segment, type Visit } from "./visitsData";

const rise = keyframes`
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
`;

const COLUMNS = { xs: "46px 18px minmax(0, 1fr)", md: "84px 28px minmax(0, 1fr)" } as const;
const COLUMN_GAP = { xs: 1, md: 1.25 } as const;
/** Центр точки — на уровне числа даты. */
const DOT_TOP = 20;

interface RailProps {
  top: Segment;
  bottom: Segment;
  dot?: React.ReactNode;
  dotTop?: number;
}

/** Вертикальная линия ленты со своей точкой: строки стыкуются без зазоров. */
export const Rail: React.FC<RailProps> = ({ top, bottom, dot, dotTop = DOT_TOP }) => {
  const theme = useTheme();
  const line = (segment: Segment, from: number | string, to: number | string) =>
    segment === "none" ? null : (
      <Box
        sx={{
          position: "absolute",
          left: "50%",
          top: from,
          bottom: to,
          borderLeft: `2px ${segment} ${segment === "dashed" ? alpha(theme.palette.primary.main, 0.45) : subtleBorder(theme)}`,
          transform: "translateX(-1px)",
        }}
      />
    );
  return (
    <Box sx={{ position: "relative", minHeight: "100%" }}>
      {line(top, 0, `calc(100% - ${dotTop}px)`)}
      {line(bottom, dotTop, 0)}
      {dot && (
        <Box sx={{ position: "absolute", left: "50%", top: dotTop, transform: "translate(-50%, -50%)", display: "flex" }}>{dot}</Box>
      )}
    </Box>
  );
};

function dotSx(theme: Theme, visit: Visit) {
  const primary = theme.palette.primary.main;
  const paper = theme.palette.background.paper;
  if (visit.phase === "upcoming") return { bgcolor: paper, border: `2px solid ${primary}` };
  if (visit.phase === "cancelled") {
    const color = visit.noShow ? theme.palette.warning.main : theme.palette.text.disabled;
    return { bgcolor: paper, border: `2px solid ${color}` };
  }
  if (visit.conclusion === "done") return { bgcolor: primary, boxShadow: `0 0 0 4px ${alpha(primary, 0.16)}` };
  return { bgcolor: alpha(primary, 0.55) };
}

const DiagnosisChip: React.FC<{ code: string; title: string }> = ({ code, title }) => (
  <Chip
    size="small"
    label={
      <Box component="span" sx={{ display: "inline-flex", gap: 0.5, minWidth: 0 }}>
        {code && (
          <Box component="span" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            {code}
          </Box>
        )}
        <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis" }}>
          {title}
        </Box>
      </Box>
    }
    sx={(theme) => ({
      height: 24,
      maxWidth: "100%",
      borderRadius: "7px",
      bgcolor: alpha(theme.palette.info.main, 0.1),
      color: theme.palette.mode === "dark" ? theme.palette.info.light : theme.palette.info.dark,
      "& .MuiChip-label": { px: 1 },
    })}
  />
);

const MAX_DIAGNOSES = 3;

interface VisitRowProps {
  visit: Visit;
  index: number;
  top: Segment;
  bottom: Segment;
  /** Специальность врача по справочнику сотрудников; null — не знаем. */
  specialization: (doctorId: number) => string | null;
  showBranch: boolean;
  canViewFinance: boolean;
  onOpen: (appointment: DjangoAppointment) => void;
}

/** Строка ленты: дата слева, точка на линии, карточка приёма справа. */
export const VisitRow: React.FC<VisitRowProps> = ({ visit, index, top, bottom, specialization, showBranch, canViewFinance, onOpen }) => {
  const theme = useTheme();
  const date = dayjs(visit.at);
  const appointment = visit.appointment;
  const cancelled = visit.phase === "cancelled";
  const doctor = visit.doctors[0];
  const doctorRole = doctor ? specialization(doctor.id) : null;
  // У отменённого сумма ничего не значит — не показываем.
  const total =
    canViewFinance && !cancelled && Number(appointment.totalAmount) > 0 ? formatKGS(appointment.totalAmount) : null;
  const reason = cancelled ? cancelReasonLabel(appointment.cancelReason) : null;
  const title = visit.services[0] ?? "Приём";
  const open = () => onOpen(appointment);

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: COLUMNS,
        columnGap: COLUMN_GAP,
        animation: `${rise} .32s ease-out both`,
        animationDelay: `${Math.min(index, 10) * 35}ms`,
        "@media (prefers-reduced-motion: reduce)": { animation: "none" },
      }}
    >
      <Box sx={{ textAlign: "right", pt: 0.75, pb: 1.5, color: cancelled ? "text.disabled" : "text.primary" }}>
        <Typography sx={{ fontSize: { xs: 20, md: 26 }, fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          {date.format("D")}
        </Typography>
        <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "text.secondary", mt: 0.25 }}>
          {monthShort(visit.at)}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: { xs: "none", md: "block" }, lineHeight: 1.3 }}>
          {date.format("dd")} · {date.format("HH:mm")}
        </Typography>
      </Box>

      <Rail top={top} bottom={bottom} dot={<Box sx={{ width: 12, height: 12, borderRadius: "50%", ...dotSx(theme, visit) }} />} />

      <Box sx={{ pb: 1.25, minWidth: 0 }}>
        <Box
          role="button"
          tabIndex={0}
          aria-label={`Приём ${date.format("D MMMM YYYY, HH:mm")}: ${title}`}
          onClick={open}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              open();
            }
          }}
          sx={{
            p: cancelled ? 1 : { xs: 1.25, md: 1.5 },
            borderRadius: "12px",
            border: `1px ${cancelled ? "dashed" : "solid"} ${cancelled ? subtleBorder(theme) : alpha(theme.palette.primary.main, visit.phase === "upcoming" ? 0.3 : 0.14)}`,
            bgcolor: cancelled ? "transparent" : visit.phase === "upcoming" ? alpha(theme.palette.primary.main, 0.04) : "background.paper",
            cursor: "pointer",
            transition: "border-color .15s ease, box-shadow .15s ease, transform .15s ease",
            "&:hover": {
              borderColor: alpha(theme.palette.primary.main, 0.45),
              boxShadow: `0 6px 18px ${alpha(theme.palette.common.black, theme.palette.mode === "dark" ? 0.35 : 0.06)}`,
              transform: "translateY(-1px)",
            },
            "&:focus-visible": { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
          }}
        >
          <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={{ xs: 1, md: 2 }}>
            <Box sx={{ minWidth: 0, flex: 1, color: cancelled ? "text.secondary" : "text.primary" }}>
              <Typography variant={cancelled ? "body2" : "subtitle1"} fontWeight={cancelled ? 600 : 700} sx={{ lineHeight: 1.3, overflowWrap: "anywhere" }}>
                {title}
                {visit.services.length > 1 && (
                  <Box component="span" sx={{ color: "text.secondary", fontWeight: 500 }}>
                    {" "}
                    + ещё {visit.services.length - 1}
                  </Box>
                )}
              </Typography>

              <Stack direction="row" alignItems="center" gap={0.75} flexWrap="wrap" sx={{ mt: 0.5, rowGap: 0.5 }}>
                {doctor && (
                  <Stack direction="row" alignItems="center" gap={0.75} sx={{ minWidth: 0 }}>
                    {!cancelled && <UserAvatar src={doctor.photoUrl} name={doctor.name} size={22} />}
                    <Typography variant="body2" fontWeight={600} sx={{ overflowWrap: "anywhere" }}>
                      {doctor.name}
                    </Typography>
                  </Stack>
                )}
                {[
                  visit.doctors.length > 1 ? `и ещё ${visit.doctors.length - 1}` : "",
                  doctorRole ?? "",
                  showBranch ? appointment.branchName ?? "" : "",
                ]
                  .filter(Boolean)
                  .map((text) => (
                    <Typography key={text} variant="body2" color="text.secondary">
                      · {text}
                    </Typography>
                  ))}
                <Typography variant="body2" color="text.secondary" sx={{ display: { md: "none" } }}>
                  · {date.format("HH:mm")}
                </Typography>
                {visit.age && !cancelled && (
                  <Typography variant="body2" color="text.secondary">
                    · {visit.age}
                  </Typography>
                )}
              </Stack>

              {visit.diagnoses.length > 0 && (
                <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ mt: 1 }}>
                  {visit.diagnoses.slice(0, MAX_DIAGNOSES).map((diagnosis) => (
                    <DiagnosisChip key={`${diagnosis.code}-${diagnosis.title}`} code={diagnosis.code} title={diagnosis.title} />
                  ))}
                  {visit.diagnoses.length > MAX_DIAGNOSES && (
                    <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center" }}>
                      + ещё {visit.diagnoses.length - MAX_DIAGNOSES}
                    </Typography>
                  )}
                </Stack>
              )}

              {/* На компьютере причина отмены — в подсказке чипа «Отменено» (в карточке приёма её нет); у неявки подсказки нет — строка остаётся. */}
              {reason && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mt: 0.75, display: appointment.status === "canceled" ? { xs: "block", md: "none" } : "block" }}
                >
                  Причина: {reason}
                </Typography>
              )}
            </Box>

            <Stack
              direction={{ xs: "row", md: "column" }}
              alignItems={{ xs: "center", md: "flex-end" }}
              flexWrap="wrap"
              gap={0.5}
              flexShrink={0}
            >
              {total && (
                <Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: "tabular-nums" }}>
                  {total}
                </Typography>
              )}
              <AppointmentStatusChips appointment={appointment} direction="row" chipHeight={22} showPaymentMethodIcons={false} />
              {visit.conclusion !== "none" && (
                <Chip
                  size="small"
                  icon={visit.conclusion === "done" ? <DescriptionOutlined /> : <EditNoteOutlined />}
                  label={visit.conclusion === "done" ? "Заключение" : "Черновик заключения"}
                  sx={(t) => {
                    const tone = visit.conclusion === "done" ? t.palette.success : t.palette.warning;
                    return {
                      height: 22,
                      borderRadius: "7px",
                      fontWeight: 600,
                      bgcolor: alpha(tone.main, 0.12),
                      color: t.palette.mode === "dark" ? tone.light : tone.dark,
                      "& .MuiChip-icon": { fontSize: 15, color: "inherit" },
                    };
                  }}
                />
              )}
            </Stack>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
};

/** Заголовок года на ленте. */
export const YearRow: React.FC<{ year: number; count: number; top: Segment; bottom: Segment }> = ({ year, count, top, bottom }) => (
  <Box sx={{ display: "grid", gridTemplateColumns: COLUMNS, columnGap: COLUMN_GAP }}>
    <Box sx={{ textAlign: "right", py: 1 }}>
      <Typography sx={{ fontSize: 15, fontWeight: 800, letterSpacing: ".04em", fontVariantNumeric: "tabular-nums" }}>{year}</Typography>
    </Box>
    <Rail
      top={top}
      bottom={bottom}
      dotTop={21}
      dot={<Box sx={(theme) => ({ width: 8, height: 8, borderRadius: "2px", bgcolor: theme.palette.text.secondary, transform: "rotate(45deg)" })} />}
    />
    <Stack direction="row" alignItems="center" gap={1} sx={{ py: 1, minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
        {count} {pluralRu(count, ["приём", "приёма", "приёмов"])}
      </Typography>
      <Box sx={(theme) => ({ flex: 1, borderTop: `1px solid ${subtleBorder(theme)}` })} />
    </Stack>
  </Box>
);

/** Отметка «сегодня» между будущими и прошедшими приёмами. */
export const TodayRow: React.FC<{ now: Dayjs; top: Segment; bottom: Segment }> = ({ now, top, bottom }) => {
  const theme = useTheme();
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: COLUMNS, columnGap: COLUMN_GAP }}>
      <Box sx={{ textAlign: "right", py: 1.25 }}>
        {/* В узкой колонке телефона слово не помещается — там оно уходит к дате справа. */}
        <Typography
          sx={{ display: { xs: "none", md: "block" }, fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "primary.main" }}
        >
          Сегодня
        </Typography>
      </Box>
      <Rail
        top={top}
        bottom={bottom}
        dotTop={22}
        dot={
          <Box
            sx={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              bgcolor: "primary.main",
              boxShadow: `0 0 0 5px ${alpha(theme.palette.primary.main, 0.18)}`,
            }}
          />
        }
      />
      <Stack direction="row" alignItems="center" gap={1} sx={{ py: 1.25, minWidth: 0 }}>
        <Typography variant="caption" sx={{ color: "primary.main", fontWeight: 600, whiteSpace: "nowrap" }}>
          <Box component="span" sx={{ display: { md: "none" } }}>
            Сегодня,{" "}
          </Box>
          {now.format("D MMMM, dddd")}
        </Typography>
        <Box sx={{ flex: 1, borderTop: `1px dashed ${alpha(theme.palette.primary.main, 0.45)}` }} />
      </Stack>
    </Box>
  );
};
