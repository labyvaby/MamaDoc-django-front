/**
 * RegistryCourseFeed — вторая раскладка ленты процедур: по пациентам и курсам.
 *
 * Процедуры почти всегда идут курсом: пять капельниц подряд в ленте по дням
 * лежат в пяти разных днях, и «сколько прокапали этому пациенту» приходится
 * считать глазами. Здесь пациент — карточка, внутри строки курсов
 * («Капельница ×5 · 12–16 августа»), а раскрытие курса показывает сами
 * записи — с теми же действиями, что и в дневной ленте.
 */
import React from "react";
import { Box, Button, Paper, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import dayjs from "dayjs";
import "dayjs/locale/ru";

import AppointmentStatusChips from "../../../../components/appointments/AppointmentStatusChips";
import { subtleBg } from "../../../../theme";
import { useT } from "../../../../i18n/VerticalProvider";
import { formatAmount } from "./registryFormat";
import RegistryRowDetails, { type RegistryRowActions } from "./RegistryRowDetails";
import type { LinesOf, PatientCourse, PatientGroup } from "./registryStats";

/** Сколько пациентов добавляет одно нажатие «Показать ещё». */
const PATIENTS_STEP = 12;

interface Props extends RegistryRowActions {
  groups: PatientGroup[];
  linesOf: LinesOf;
  openId: number | null;
  onToggle: (id: number) => void;
  canUpdate: boolean;
  canViewFinance: boolean;
  canManageFinance: boolean;
  /** Подпись счётчика: «5 процедур». */
  countLabel: (count: number) => string;
}

/** «12–16 августа» или «12 августа», если курс был один день. */
const rangeLabel = (firstIso: string, lastIso: string): string => {
  const first = dayjs(firstIso);
  const last = dayjs(lastIso);
  if (firstIso === lastIso) return first.format("D MMMM");
  if (first.month() === last.month()) return `${first.format("D")}–${last.format("D MMMM")}`;
  return `${first.format("D MMM")} – ${last.format("D MMM")}`;
};

export const RegistryCourseFeed: React.FC<Props> = ({
  groups,
  linesOf,
  openId,
  onToggle,
  canUpdate,
  canViewFinance,
  canManageFinance,
  countLabel,
  ...actions
}) => {
  const { t } = useT("appointments");
  const theme = useTheme();
  const [visible, setVisible] = React.useState(PATIENTS_STEP);
  const [openCourse, setOpenCourse] = React.useState<string | null>(null);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    setVisible(PATIENTS_STEP);
    setOpenCourse(null);
  }, [groups]);

  const shown = groups.slice(0, visible);
  const hidden = groups.length - shown.length;

  // Догрузка при прокрутке — как в дневной ленте.
  React.useEffect(() => {
    const node = sentinelRef.current;
    if (!node || hidden <= 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible((count) => count + PATIENTS_STEP);
        }
      },
      { rootMargin: "600px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hidden]);

  const renderCourse = (group: PatientGroup, course: PatientCourse) => {
    const courseKey = `${group.key}:${course.key}`;
    const isOpen = openCourse === courseKey;
    return (
      <Box key={courseKey}>
        <Box
          role="button"
          tabIndex={0}
          aria-expanded={isOpen}
          onClick={() => setOpenCourse(isOpen ? null : courseKey)}
          onKeyDown={(event: React.KeyboardEvent) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setOpenCourse(isOpen ? null : courseKey);
            }
          }}
          sx={{
            display: "grid",
            // На телефоне диапазон дат уезжает во вторую строку, чтобы в первой
            // остались название, кратность и сумма.
            gridTemplateColumns: {
              xs: "minmax(0, 1fr) 44px 84px",
              md: "minmax(0, 1.6fr) 96px minmax(140px, 1fr) 116px 24px",
            },
            alignItems: "center",
            columnGap: 1.5,
            rowGap: 0.5,
            px: 2,
            py: 1,
            cursor: "pointer",
            borderBottom: 1,
            borderColor: "divider",
            bgcolor: isOpen ? subtleBg(theme, true) : "transparent",
            transition: "background-color .13s ease",
            "&:hover": { bgcolor: subtleBg(theme, isOpen) },
          }}
        >
          <Typography variant="body2" fontWeight={600} noWrap>
            {course.serviceName}
          </Typography>

          <Typography
            variant="body2"
            sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "primary.onSurface" }}
          >
            ×{course.count}
          </Typography>

          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            sx={{ gridColumn: { xs: "1 / -1", md: "auto" }, order: { xs: 1, md: 0 } }}
          >
            {rangeLabel(course.firstIso, course.lastIso)}
          </Typography>

          {canViewFinance ? (
            <Typography
              variant="body2"
              sx={{ textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
            >
              {course.money.accrued > 0 ? formatAmount(course.money.accrued) : "—"}
            </Typography>
          ) : (
            <Box />
          )}

          <Box
            sx={{
              display: { xs: "none", md: "flex" },
              justifyContent: "center",
              color: isOpen ? "primary.onSurface" : "text.disabled",
              transform: isOpen ? "rotate(180deg)" : "none",
              transition: "transform .18s ease",
            }}
          >
            <ExpandMoreOutlined sx={{ fontSize: 18 }} />
          </Box>
        </Box>

        {isOpen &&
          course.items.map((appt) => {
            const rowOpen = openId === appt.id;
            return (
              <Box key={appt.id}>
                <Box
                  role="button"
                  tabIndex={0}
                  aria-expanded={rowOpen}
                  onClick={() => onToggle(appt.id)}
                  onKeyDown={(event: React.KeyboardEvent) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onToggle(appt.id);
                    }
                  }}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    pl: 4,
                    pr: 2,
                    py: 0.75,
                    cursor: "pointer",
                    borderBottom: 1,
                    borderColor: "divider",
                    bgcolor: "background.default",
                    "&:hover": { bgcolor: subtleBg(theme, true) },
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{ fontVariantNumeric: "tabular-nums", minWidth: 116 }}
                  >
                    {dayjs(appt.scheduledAt).format("DD.MM · HH:mm")}
                  </Typography>
                  <Typography variant="caption" color="text.disabled" noWrap sx={{ flex: 1, minWidth: 0 }}>
                    {linesOf(appt)[0]?.employee?.fullName ?? t("journal.details.noPerformer")}
                  </Typography>
                  <AppointmentStatusChips
                    appointment={appt}
                    chipHeight={20}
                    showPaymentMethodIcons={false}
                  />
                </Box>

                {rowOpen && (
                  <RegistryRowDetails
                    appointment={appt}
                    lines={linesOf(appt)}
                    canUpdate={canUpdate}
                    canViewFinance={canViewFinance}
                    canManageFinance={canManageFinance}
                    {...actions}
                  />
                )}
              </Box>
            );
          })}
      </Box>
    );
  };

  return (
    <Stack gap={1.5}>
      {shown.map((group) => (
        <Paper key={group.key} elevation={0} variant="outlined" sx={{ overflow: "hidden" }}>
          <Stack
            direction="row"
            alignItems="center"
            gap={1.5}
            flexWrap="wrap"
            sx={{
              px: 2,
              py: 1.25,
              bgcolor: "background.default",
              borderBottom: 1,
              borderColor: "divider",
            }}
          >
            <Typography variant="subtitle2" fontWeight={600} noWrap>
              {group.patientName || t("journal.feed.noPatient")}
            </Typography>
            <Typography variant="caption" color="text.disabled">
              {rangeLabel(group.firstIso, group.lastIso)}
            </Typography>
            <Stack direction="row" gap={2} sx={{ ml: "auto" }} flexWrap="wrap" justifyContent="flex-end">
              <Typography variant="caption" color="text.secondary">
                {countLabel(group.visits)}
              </Typography>
              {canViewFinance && (
                <Typography variant="caption" color="text.secondary">
                  {t("journal.feed.dayRevenue")}{" "}
                  <Box
                    component="span"
                    sx={{ fontWeight: 600, color: "text.primary", fontVariantNumeric: "tabular-nums" }}
                  >
                    {formatAmount(group.money.paid)}
                  </Box>
                </Typography>
              )}
            </Stack>
          </Stack>

          {group.courses.map((course) => renderCourse(group, course))}
        </Paper>
      ))}

      {hidden > 0 && (
        <Box ref={sentinelRef} sx={{ display: "flex", justifyContent: "center" }}>
          <Button variant="outlined" onClick={() => setVisible((count) => count + PATIENTS_STEP)}>
            {t("journal.courses.showMore", { count: hidden })}
          </Button>
        </Box>
      )}
    </Stack>
  );
};

export default RegistryCourseFeed;
