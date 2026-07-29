import React from "react";
import { Avatar, Box, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import MedicalServicesOutlined from "@mui/icons-material/MedicalServicesOutlined";
import TaskAltOutlined from "@mui/icons-material/TaskAltOutlined";
import EditNoteOutlined from "@mui/icons-material/EditNoteOutlined";

import { useT } from "../../i18n/VerticalProvider";
import { buildEmployeeAccentMap, employeeInitials } from "./employeeAccent";

/** Услуга внутри группы исполнителя (уже посчитанная сумма строки). */
export interface ServiceGroupLine {
  /** id строки услуги приёма — ключ списка. */
  lineId: number;
  /** id услуги каталога; null — услуга не сохранилась/удалена. */
  serviceId: number | null;
  name: string;
  imageUrl?: string | null;
  quantity: number;
  /** Отформатированная сумма строки; null — не показывать (нет права на финансы). */
  amount: string | null;
  /**
   * Состояние заключения по строке (бэк шлёт его в каждой строке услуги).
   * Показываем значком: врач видит, по какой услуге он уже отписался, а по
   * какой ещё нет — раньше это было только в логике кнопок шапки.
   */
  conclusionState?: "not_required" | "not_created" | "draft" | "completed";
}

/** Исполнитель и его услуги в рамках одного приёма. */
export interface ServiceEmployeeGroup {
  employeeId: number | null;
  employeeName: string;
  employeePhotoUrl: string | null;
  lines: ServiceGroupLine[];
  /** Отформатированная сумма по исполнителю; null — не показывать. */
  total: string | null;
}

/**
 * Значок состояния заключения рядом с названием услуги. «Не требуется» и
 * «не создано» не помечаем: первое — шум, второе видно по отсутствию значка.
 */
function conclusionMark(
  state: ServiceGroupLine["conclusionState"],
  t: (key: string) => string,
): React.ReactNode {
  if (state === "completed") {
    return (
      <Tooltip title={t("serviceLine.conclusionReady")}>
        <TaskAltOutlined sx={{ fontSize: 15, color: "success.main", flexShrink: 0 }} />
      </Tooltip>
    );
  }
  if (state === "draft") {
    return (
      <Tooltip title={t("serviceLine.conclusionDraft")}>
        <EditNoteOutlined sx={{ fontSize: 16, color: "warning.main", flexShrink: 0 }} />
      </Tooltip>
    );
  }
  return null;
}

interface ServiceEmployeeGroupsProps {
  groups: ServiceEmployeeGroup[];
  onEmployeeClick?: (group: ServiceEmployeeGroup) => void;
  onServiceClick?: (serviceId: number) => void;
}

/**
 * Услуги приёма, сгруппированные по исполнителю: карточка на специалиста,
 * его услуги — ветками дерева от цветной полосы слева. Цвет полосы, аватара и
 * веток один на группу, поэтому связь «кто выполняет что» видна сразу, даже
 * когда в приёме несколько специалистов.
 */
const ServiceEmployeeGroups: React.FC<ServiceEmployeeGroupsProps> = ({
  groups,
  onEmployeeClick,
  onServiceClick,
}) => {
  const { t } = useT("appointments");
  const theme = useTheme();
  const mode = theme.palette.mode;

  const colorByEmployee = React.useMemo(
    () => buildEmployeeAccentMap(groups.map((g) => g.employeeId), mode),
    [groups, mode],
  );

  return (
    <Stack spacing={1.5}>
      {groups.map((group) => {
        const accent =
          (group.employeeId !== null ? colorByEmployee.get(group.employeeId) : null) ??
          theme.palette.text.disabled;
        const employeeClickable = group.employeeId !== null && Boolean(onEmployeeClick);

        return (
          <Paper
            key={group.employeeId ?? "__no_employee__"}
            variant="outlined"
            sx={{
              position: "relative",
              overflow: "hidden",
              borderRadius: "12px",
              bgcolor: "background.paper",
            }}
          >
            {/* Цветная полоса исполнителя — общая ось для всей группы */}
            <Box
              sx={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: 3,
                bgcolor: accent,
              }}
            />

            {/* Шапка группы: исполнитель */}
            <Stack
              direction="row"
              alignItems="center"
              spacing={1.5}
              onClick={employeeClickable ? () => onEmployeeClick?.(group) : undefined}
              sx={{
                p: 1.25,
                pl: 2,
                bgcolor: alpha(accent, mode === "dark" ? 0.16 : 0.08),
                cursor: employeeClickable ? "pointer" : "default",
                transition: "background-color 0.2s",
                ...(employeeClickable && {
                  "&:hover": { bgcolor: alpha(accent, mode === "dark" ? 0.24 : 0.14) },
                }),
              }}
            >
              <Avatar
                src={group.employeePhotoUrl ?? undefined}
                sx={{
                  width: 32,
                  height: 32,
                  bgcolor: accent,
                  color: theme.palette.getContrastText(accent),
                  fontSize: "0.8125rem",
                  fontWeight: 700,
                }}
              >
                {group.employeeId !== null ? employeeInitials(group.employeeName) : "?"}
              </Avatar>

              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle2" fontWeight={700} noWrap>
                  {group.employeeName}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t("common:counts.services", { count: group.lines.length })}
                </Typography>
              </Box>

              {group.total !== null && (
                <Typography variant="body2" fontWeight={700} sx={{ flexShrink: 0 }}>
                  {group.total}
                </Typography>
              )}
            </Stack>

            {/* Услуги исполнителя — ветками от полосы. Без вертикальных
                отступов у контейнера: иначе ствол дерева разрывается между
                шапкой и первой услугой. */}
            <Stack>
              {group.lines.map((line, index) => {
                const isLast = index === group.lines.length - 1;
                const serviceClickable = line.serviceId !== null && Boolean(onServiceClick);

                return (
                  <Stack
                    key={line.lineId}
                    direction="row"
                    alignItems="center"
                    spacing={1.5}
                    onClick={
                      serviceClickable ? () => onServiceClick?.(line.serviceId!) : undefined
                    }
                    sx={{
                      position: "relative",
                      py: 1.25,
                      pr: 1.5,
                      pl: 4.5,
                      cursor: serviceClickable ? "pointer" : "default",
                      transition: "background-color 0.2s",
                      ...(serviceClickable && {
                        "&:hover": { bgcolor: alpha(accent, mode === "dark" ? 0.1 : 0.05) },
                      }),
                      // Ветка дерева: вертикальный ствол + отвод к услуге.
                      // У последней услуги ствол обрывается на середине — так
                      // видно, где группа исполнителя заканчивается.
                      "&::before": {
                        content: '""',
                        position: "absolute",
                        left: 17,
                        top: 0,
                        bottom: isLast ? "50%" : 0,
                        width: "2px",
                        bgcolor: alpha(accent, 0.55),
                      },
                      "&::after": {
                        content: '""',
                        position: "absolute",
                        left: 17,
                        top: "50%",
                        width: 12,
                        height: "2px",
                        borderBottomLeftRadius: isLast ? "2px" : 0,
                        bgcolor: alpha(accent, 0.55),
                      },
                    }}
                  >
                    <Avatar
                      variant="rounded"
                      src={line.imageUrl ?? undefined}
                      sx={{
                        width: 32,
                        height: 32,
                        borderRadius: "8px",
                        bgcolor: alpha(accent, mode === "dark" ? 0.18 : 0.1),
                        color: accent,
                        flexShrink: 0,
                      }}
                    >
                      <MedicalServicesOutlined sx={{ fontSize: 18 }} />
                    </Avatar>

                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0 }}>
                        <Tooltip title={line.name} enterDelay={600}>
                          <Typography variant="body2" fontWeight={600} noWrap>
                            {line.name}
                          </Typography>
                        </Tooltip>
                        {conclusionMark(line.conclusionState, t)}
                      </Stack>
                      {line.quantity > 1 && (
                        <Typography variant="caption" color="text.secondary">
                          × {line.quantity}
                        </Typography>
                      )}
                    </Box>

                    {line.amount !== null && (
                      <Typography variant="body2" fontWeight={700} sx={{ flexShrink: 0 }}>
                        {line.amount}
                      </Typography>
                    )}
                  </Stack>
                );
              })}
            </Stack>
          </Paper>
        );
      })}
    </Stack>
  );
};

export default ServiceEmployeeGroups;
