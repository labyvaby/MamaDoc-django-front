import React from "react";
import {
  Box,
  Button,
  Drawer,
  IconButton,
  Skeleton,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import CheckRounded from "@mui/icons-material/CheckRounded";
import DoNotDisturbAltRounded from "@mui/icons-material/DoNotDisturbAltRounded";
import OpenInNewRounded from "@mui/icons-material/OpenInNewRounded";
import TaskAltRounded from "@mui/icons-material/TaskAltRounded";
import { useQuery } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import { AnimatePresence, motion } from "framer-motion";
import dayjs from "dayjs";

import {
  approveTimesheetRequest,
  getTimesheetRequests,
  rejectTimesheetRequest,
  type TimesheetCode,
  type TimesheetRequest,
} from "../../api/timesheet";
import { getErrorCode } from "../../api/client";
import { AppBottomSheet, UserAvatar } from "../../components/ui";
import { subtleBg } from "../../theme/uiHelpers";
import { formatHours, longDate } from "./model";

const MotionBox = motion.create(Box);

export interface RequestsDrawerProps {
  open: boolean;
  organizationId?: number | null;
  callerEmployeeId?: number | null;
  codes: TimesheetCode[];
  onClose: () => void;
  onOpenCell: (employeeId: number, date: string) => void;
  onReviewed: () => void;
}

export const RequestsDrawer: React.FC<RequestsDrawerProps> = ({
  open,
  organizationId,
  callerEmployeeId,
  codes,
  onClose,
  onOpenCell,
  onReviewed,
}) => {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down("md"));
  const { open: notify } = useNotification();
  const byKey = React.useMemo(() => new Map(codes.map((c) => [c.key, c])), [codes]);
  const [busyId, setBusyId] = React.useState<number | null>(null);
  const [hours, setHours] = React.useState<Record<number, string>>({});
  const [comments, setComments] = React.useState<Record<number, string>>({});

  const query = useQuery({
    queryKey: ["django", "timesheet", "requests", organizationId ?? null, "pending"],
    queryFn: ({ signal }) => getTimesheetRequests({ status: "pending" }, organizationId, signal),
    enabled: open,
  });

  const review = async (request: TimesheetRequest, approve: boolean) => {
    setBusyId(request.id);
    try {
      const comment = comments[request.id] ?? "";
      if (approve) {
        const override = hours[request.id];
        await approveTimesheetRequest(
          request.id,
          {
            comment,
            ...(override ? { dayHours: Number(override.replace(",", ".")) || 0, nightHours: 0 } : {}),
          },
          organizationId,
        );
      } else {
        await rejectTimesheetRequest(request.id, comment, organizationId);
      }
      notify?.({
        type: "success",
        message: approve ? `${request.employeeName}: день исправлен` : "Заявка отклонена",
      });
      onReviewed();
      await query.refetch();
    } catch (error) {
      notify?.({
        type: "error",
        message:
          getErrorCode(error) === "SELF_APPROVAL"
            ? "Свою заявку подтверждает другой сотрудник"
            : error instanceof Error
              ? error.message
              : "Не удалось",
      });
    } finally {
      setBusyId(null);
    }
  };

  const items = query.data?.items ?? [];

  const body = (
    <Box sx={{ p: { xs: 2, md: 2.5 } }}>
      <Stack direction="row" alignItems="center" sx={{ mb: 2 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" fontWeight={800}>
            Заявки на исправление
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Сотрудники просят исправить дни, когда забыли отметиться
          </Typography>
        </Box>
        {!isPhone && (
          <IconButton onClick={onClose} aria-label="Закрыть">
            <CloseOutlined />
          </IconButton>
        )}
      </Stack>
      {query.isLoading ? (
        <Stack spacing={1.5}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" height={128} />
          ))}
        </Stack>
      ) : items.length === 0 ? (
        <Stack alignItems="center" spacing={1} sx={{ py: 6, color: "text.secondary" }}>
          <TaskAltRounded sx={{ fontSize: 48, color: "success.main" }} />
          <Typography fontWeight={700}>Все заявки рассмотрены</Typography>
        </Stack>
      ) : (
        <Stack spacing={1.25}>
          <AnimatePresence initial={false}>
            {items.map((request) => {
              const own = callerEmployeeId != null && request.employeeId === callerEmployeeId;
              const code = byKey.get(request.code);
              return (
                <MotionBox
                  key={request.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 40 }}
                  sx={{ p: 1.5, borderRadius: "14px", border: 1, borderColor: "divider", bgcolor: "background.paper" }}
                >
                  <Stack direction="row" spacing={1.25} alignItems="center">
                    <UserAvatar name={request.employeeName} size={36} />
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography fontWeight={800} noWrap>
                        {request.employeeName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap display="block">
                        {longDate(request.date)} · {code?.name ?? request.code}
                        {request.startTime ? ` · ${request.startTime}–${request.endTime}` : ""}
                      </Typography>
                    </Box>
                    <IconButton
                      size="small"
                      title="Открыть день"
                      onClick={() => onOpenCell(request.employeeId, request.date)}
                    >
                      <OpenInNewRounded fontSize="small" />
                    </IconButton>
                  </Stack>
                  <Box sx={{ mt: 1, p: 1, borderRadius: "10px", bgcolor: subtleBg(theme) }}>
                    <Typography variant="body2">{request.reason}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      подана {dayjs(request.createdAt).format("DD.MM HH:mm")}
                    </Typography>
                  </Box>
                  {own ? (
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                      Это ваша заявка — её подтверждает другой сотрудник.
                    </Typography>
                  ) : (
                    <>
                      <Stack direction="row" spacing={1} sx={{ mt: 1.25 }}>
                        <TextField
                          size="small"
                          label="Часы"
                          value={hours[request.id] ?? formatHours(request.requestedHours).replace(",", ".")}
                          onChange={(e) => setHours((prev) => ({ ...prev, [request.id]: e.target.value }))}
                          sx={{ width: 96 }}
                        />
                        <TextField
                          size="small"
                          label="Комментарий"
                          value={comments[request.id] ?? ""}
                          onChange={(e) => setComments((prev) => ({ ...prev, [request.id]: e.target.value }))}
                          fullWidth
                        />
                      </Stack>
                      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                        <Button
                          variant="contained"
                          color="success"
                          size="small"
                          startIcon={<CheckRounded />}
                          disabled={busyId === request.id}
                          onClick={() => void review(request, true)}
                          sx={{ flex: 1, borderRadius: "10px" }}
                        >
                          Подтвердить
                        </Button>
                        <Button
                          color="error"
                          size="small"
                          startIcon={<DoNotDisturbAltRounded />}
                          disabled={busyId === request.id}
                          onClick={() => void review(request, false)}
                          sx={{ borderRadius: "10px" }}
                        >
                          Отклонить
                        </Button>
                      </Stack>
                    </>
                  )}
                </MotionBox>
              );
            })}
          </AnimatePresence>
        </Stack>
      )}
    </Box>
  );

  if (isPhone) {
    return (
      <AppBottomSheet open={open} onClose={onClose}>
        {body}
      </AppBottomSheet>
    );
  }
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: 460, maxWidth: "100vw", borderTopLeftRadius: 16, borderBottomLeftRadius: 16 } }}
    >
      {body}
    </Drawer>
  );
};

export default RequestsDrawer;
