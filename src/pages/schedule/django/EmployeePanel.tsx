import React from "react";
import { Box, Button, ButtonBase, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddOutlined from "@mui/icons-material/AddOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import EditOutlined from "@mui/icons-material/EditOutlined";
import EventBusyOutlined from "@mui/icons-material/EventBusyOutlined";
import dayjs from "dayjs";

import {
  SCHEDULE_RULE_ONLINE_BOOKING_ENABLED,
  isRuleOnlineBookingEnabled,
  type ScheduleRule,
} from "../../../api/scheduling";
import { UserAvatar } from "../../../components/ui";
import { subtleBg } from "../../../theme/uiHelpers";
import { isAbsenceKind } from "./occurrences";
import {
  WEEKDAY_SHORT,
  formatWeeklyHours,
  weekdaysShort,
  type EmployeeSchedule,
  type ExceptionItem,
} from "./scheduleSettingsModel";
import {
  exceptionDetails,
  exceptionKindTitle,
  exceptionWhen,
  pluralVisits,
  type EmployeeIssue,
} from "./scheduleMatrixModel";
import { PanelHeader, SwipeToDelete } from "./scheduleUi";
import { accentFg, absenceBg, errorFg, warningFg } from "./scheduleTones";

export interface EmployeePanelProps {
  schedule: EmployeeSchedule;
  issue: EmployeeIssue | null;
  /** Филиал сотрудника для подзаголовка. */
  branchLabel: string | null;
  canManage: boolean;
  absenceCount: (item: ExceptionItem) => number;
  onIssueAction: (issue: EmployeeIssue) => void;
  onEditRule: (rule: ScheduleRule) => void;
  onAddRule: () => void;
  onAddAbsence: () => void;
  onDeleteException: (item: ExceptionItem) => void;
  onClose: () => void;
  /**
   * Действующие правила сотрудника в других филиалах — только для справки:
   * править их можно, переключившись на тот филиал.
   */
  otherRules: ScheduleRule[];
}

const fmtShort = (d: string) => dayjs(d).format("DD.MM.YY");

/** Полоска недели в тон акцента: сплошная заливка давала «стену синего». */
const WeekStrip: React.FC<{ weekdays: number[] }> = ({ weekdays }) => (
  <Stack direction="row" gap="4px" aria-label={`Дни: ${weekdaysShort(weekdays)}`}>
    {WEEKDAY_SHORT.map((label, d) => {
      const on = weekdays.includes(d);
      return (
        <Box
          key={label}
          sx={(t) => ({
            width: 26,
            height: 26,
            borderRadius: "7px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 600,
            border: 1,
            borderColor: on ? "transparent" : "divider",
            bgcolor: on ? "primary.lighter" : "transparent",
            color: on ? accentFg(t) : "text.disabled",
          })}
        >
          {label}
        </Box>
      );
    })}
  </Stack>
);

const Caption: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary", mb: 0.5 }}>{children}</Typography>
);

/**
 * Панель сотрудника (правый Drawer): главная проблема, недельные графики и
 * ближайшие отсутствия. Формы открываются в этой же панели (см. index.tsx).
 */
const EmployeePanel: React.FC<EmployeePanelProps> = ({
  schedule,
  issue,
  branchLabel,
  canManage,
  absenceCount,
  onIssueAction,
  onEditRule,
  onAddRule,
  onAddAbsence,
  onDeleteException,
  onClose,
  otherRules,
}) => {
  const subtitle = [
    branchLabel,
    schedule.weeklyMinutes > 0 ? `${formatWeeklyHours(schedule.weeklyMinutes)} в неделю` : null,
    schedule.absentToday ? "сегодня отсутствует" : schedule.worksToday ? "работает сегодня" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <PanelHeader
        title={schedule.employeeName}
        subtitle={subtitle || undefined}
        onClose={onClose}
        leading={<UserAvatar name={schedule.employeeName} size={40} />}
      />

      <Box sx={{ flex: 1, overflowY: "auto", p: 2.5 }}>
        <Stack gap={2.5}>
          {issue && (
            <Stack
              direction="row"
              alignItems="center"
              gap={1.5}
              sx={(t) => ({
                px: 1.5,
                py: 1.25,
                borderRadius: "10px",
                ...(issue.tone === "error"
                  ? { bgcolor: alpha(t.palette.error.main, 0.08), color: errorFg(t) }
                  : issue.tone === "warning"
                    ? { bgcolor: alpha(t.palette.warning.main, 0.1), color: warningFg(t) }
                    : { bgcolor: subtleBg(t, true), color: "text.primary" }),
              })}
            >
              <Typography sx={{ fontSize: 13, flex: 1 }}>{issue.text}</Typography>
              {(canManage || issue.action.kind === "review") && (
                <ButtonBase
                  onClick={() => onIssueAction(issue)}
                  sx={{ fontSize: 13, fontWeight: 600, color: "inherit", borderRadius: "6px", px: 0.75, py: 0.5, whiteSpace: "nowrap" }}
                >
                  {issue.actionLabel}
                </ButtonBase>
              )}
            </Stack>
          )}

          <Box>
            <Caption>Недельные графики</Caption>
            {schedule.liveRules.length === 0 ? (
              <Box
                sx={{
                  p: 1.5,
                  mt: 0.5,
                  border: 1,
                  borderStyle: "dashed",
                  borderColor: "divider",
                  borderRadius: "10px",
                  fontSize: 13,
                  color: "text.secondary",
                }}
              >
                {otherRules.length > 0
                  ? "В этом филиале графика нет — сотрудник работает в другом"
                  : "Графика нет — окон для онлайн-записи не будет"}
              </Box>
            ) : (
              schedule.liveRules.map((rule) => (
                <Stack
                  key={rule.id}
                  direction="row"
                  alignItems="center"
                  gap={1.5}
                  sx={{ py: 1.5, borderTop: 1, borderColor: "divider" }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" alignItems="baseline" gap={1} flexWrap="wrap" useFlexGap>
                      <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{weekdaysShort(rule.weekdays)}</Typography>
                      <Typography sx={{ fontSize: 15, fontVariantNumeric: "tabular-nums" }}>
                        {rule.startTime}–{rule.endTime}
                      </Typography>
                    </Stack>
                    <Box sx={{ my: 0.75 }}>
                      <WeekStrip weekdays={rule.weekdays} />
                    </Box>
                    <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                      {[
                        rule.lunchStart ? `обед ${rule.lunchStart}–${rule.lunchEnd}` : "без обеда",
                        rule.branchName ?? "все филиалы",
                        rule.dateFrom > dayjs().format("YYYY-MM-DD")
                          ? `с ${fmtShort(rule.dateFrom)} до ${fmtShort(rule.dateTo)}`
                          : `до ${fmtShort(rule.dateTo)}`,
                      ].join(" · ")}
                    </Typography>
                    {SCHEDULE_RULE_ONLINE_BOOKING_ENABLED && !isRuleOnlineBookingEnabled(rule) && (
                      <Typography sx={(t) => ({ fontSize: 12, fontWeight: 500, color: warningFg(t), mt: 0.25 })}>
                        Окна этой смены не показываются на сайте записи
                      </Typography>
                    )}
                    {rule.comment && (
                      <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.25, wordBreak: "break-word" }}>
                        {rule.comment}
                      </Typography>
                    )}
                  </Box>
                  {canManage && (
                    <Tooltip title="Изменить график">
                      <IconButton
                        onClick={() => onEditRule(rule)}
                        aria-label="Изменить график"
                        sx={{ width: 40, height: 40, border: 1, borderColor: "divider", borderRadius: "10px" }}
                      >
                        <EditOutlined fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Stack>
              ))
            )}
          </Box>

          {otherRules.length > 0 && (
            <Box>
              <Caption>В других филиалах</Caption>
              {otherRules.map((rule) => (
                <Box key={rule.id} sx={{ py: 1.25, borderTop: 1, borderColor: "divider" }}>
                  <Stack direction="row" alignItems="baseline" gap={1} flexWrap="wrap" useFlexGap>
                    <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{weekdaysShort(rule.weekdays)}</Typography>
                    <Typography sx={{ fontSize: 14, fontVariantNumeric: "tabular-nums" }}>
                      {rule.startTime}–{rule.endTime}
                    </Typography>
                  </Stack>
                  <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                    {[rule.branchName, `до ${fmtShort(rule.dateTo)}`].filter(Boolean).join(" · ")}
                  </Typography>
                </Box>
              ))}
              <Typography sx={{ fontSize: 12, color: "text.disabled", mt: 0.5 }}>
                Изменить — переключитесь на этот филиал
              </Typography>
            </Box>
          )}

          <Box>
            <Caption>Отсутствия и разовые смены</Caption>
            {schedule.exceptions.length === 0 ? (
              <Typography sx={{ fontSize: 13, color: "text.disabled" }}>Нет</Typography>
            ) : (
              schedule.exceptions.map((item) => {
                const absence = isAbsenceKind(item.kind);
                const conflicts = absence ? absenceCount(item) : 0;
                const sub = [
                  exceptionDetails(item),
                  conflicts > 0 ? `${conflicts} ${pluralVisits(conflicts)} без разбора` : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  // Телефон: свайп влево → «Удалить» (иконка справа остаётся).
                  <SwipeToDelete
                    key={item.key}
                    enabled={canManage}
                    label={item.groupId ? "Снять" : "Удалить"}
                    onDelete={() => onDeleteException(item)}
                  >
                    <Stack
                      direction="row"
                      alignItems="center"
                      gap={1.5}
                      sx={{ py: 1.25, borderTop: 1, borderColor: "divider" }}
                    >
                      <Box
                        component="span"
                        sx={(t) => ({
                          fontSize: 12,
                          fontWeight: 600,
                          px: 1,
                          py: 0.5,
                          borderRadius: "7px",
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                          ...(absence
                            ? { bgcolor: absenceBg(t), color: warningFg(t) }
                            : { border: "1px dashed", borderColor: "primary.main", color: accentFg(t) }),
                        })}
                      >
                        {exceptionKindTitle(item.kind)}
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                          {exceptionWhen(item)}
                        </Typography>
                        {sub && (
                          <Typography
                            sx={(t) => ({
                              fontSize: 12,
                              color: conflicts > 0 ? errorFg(t) : "text.secondary",
                              wordBreak: "break-word",
                            })}
                          >
                            {sub}
                          </Typography>
                        )}
                      </Box>
                      {canManage && (
                        <Tooltip title={item.groupId ? "Снять весь период" : "Удалить"}>
                          <IconButton
                            onClick={() => onDeleteException(item)}
                            aria-label={item.groupId ? "Снять весь период" : "Удалить"}
                            sx={{ width: 40, height: 40 }}
                          >
                            <DeleteOutline fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Stack>
                  </SwipeToDelete>
                );
              })
            )}
          </Box>
        </Stack>
      </Box>

      {canManage && (
        <Stack direction="row" gap={1} sx={{ p: 2, borderTop: 1, borderColor: "divider", flexShrink: 0 }}>
          <Button fullWidth variant="outlined" startIcon={<AddOutlined />} onClick={onAddRule}>
            Правило
          </Button>
          <Button fullWidth variant="outlined" startIcon={<EventBusyOutlined />} onClick={onAddAbsence}>
            Отсутствие
          </Button>
        </Stack>
      )}
    </>
  );
};

export default EmployeePanel;
