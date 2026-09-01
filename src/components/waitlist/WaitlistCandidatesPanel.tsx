import React from "react";
import {
  Alert,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import PhoneOutlined from "@mui/icons-material/PhoneOutlined";
import EventAvailableOutlined from "@mui/icons-material/EventAvailableOutlined";
import BlockOutlined from "@mui/icons-material/BlockOutlined";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import { AppButton } from "../ui";
import { subtleBg } from "../../theme/uiHelpers";
import { useT } from "../../i18n/VerticalProvider";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { djangoQueryKeys } from "../../api/queryKeys";
import {
  contactWaitlistEntry,
  getWaitlist,
  offerWaitlistEntry,
  type WaitlistEntry,
} from "../../api/waitlist";
import {
  displayName,
  periodLabel,
  timeRangeLabel,
  waitingDays,
  waitlistErrorMessage,
} from "../../pages/waitlist/meta";
import { WaitlistPriorityChip, WaitlistSourceChip, WaitlistStatusChip } from "./WaitlistChips";
import { formatPhoneDisplay } from "../../utility/phone";

/** Освободившееся окно, под которое ищем кандидатов. */
export interface WaitlistSlotRef {
  employeeId: number;
  employeeName?: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM */
  time: string;
  branchId?: number | null;
}

export interface WaitlistCandidatesPanelProps {
  open: boolean;
  onClose: () => void;
  slot: WaitlistSlotRef | null;
  /**
   * «Записать сюда» — открыть создание приёма с предзаполнением. Закрытие
   * записи листа (`scheduleWaitlistEntry`) делает вызывающая сторона, когда
   * приём действительно создан.
   */
  onBook?: (entry: WaitlistEntry, slot: WaitlistSlotRef) => void;
}

/**
 * Кто из листа ожидания подходит на освободившееся окно.
 *
 * Слот при этом не резервируется (решение заказчика): пока регистратор
 * дозванивается, окно остаётся свободным для всех — иначе освободившееся время
 * простаивает, пока никто не берёт трубку.
 */
const WaitlistCandidatesPanel: React.FC<WaitlistCandidatesPanelProps> = ({
  open,
  onClose,
  slot,
  onBook,
}) => {
  const { t } = useT("waitlist");
  const orgId = useApiOrgId();
  const queryClient = useQueryClient();
  const [error, setError] = React.useState<string | null>(null);

  const params = slot
    ? {
        status: ["waiting", "offered"] as const,
        matchEmployeeId: slot.employeeId,
        matchDate: slot.date,
        matchTime: slot.time,
        matchBranchId: slot.branchId ?? undefined,
        organizationId: orgId,
      }
    : null;

  const candidatesQuery = useQuery({
    queryKey: djangoQueryKeys.waitlist.matches(params ?? {}),
    queryFn: ({ signal }) => getWaitlist(params!, signal),
    enabled: open && params != null,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.waitlist.all });
  };

  const offerMutation = useMutation({
    mutationFn: (entry: WaitlistEntry) =>
      offerWaitlistEntry(
        entry.id,
        { employeeId: slot!.employeeId, start: `${slot!.date}T${slot!.time}:00` },
        orgId,
      ),
    onSuccess: invalidate,
    onError: (e) => setError(waitlistErrorMessage(e, "Не удалось отметить предложение")),
  });

  const refuseMutation = useMutation({
    mutationFn: (entry: WaitlistEntry) =>
      contactWaitlistEntry(entry.id, { result: "refused" }, orgId),
    onSuccess: invalidate,
    onError: (e) => setError(waitlistErrorMessage(e, "Не удалось отметить отказ")),
  });

  const candidates = candidatesQuery.data?.results ?? [];

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1}>
          <Stack>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {t("candidates.title")}
            </Typography>
            {slot && (
              <Typography variant="body2" color="text.secondary">
                {t("candidates.slot", {
                  date: dayjs(slot.date).format("DD.MM.YYYY"),
                  time: slot.time,
                  employee: slot.employeeName ?? "",
                })}
              </Typography>
            )}
          </Stack>
          <IconButton size="small" onClick={onClose}>
            <CloseOutlined />
          </IconButton>
        </Stack>
      </DialogTitle>
      <Divider />

      <DialogContent sx={{ pt: 2 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {candidatesQuery.isLoading && (
          <Stack spacing={1}>
            <Skeleton variant="rounded" height={72} />
            <Skeleton variant="rounded" height={72} />
          </Stack>
        )}

        {!candidatesQuery.isLoading && candidates.length === 0 && (
          <Alert severity="info" icon={false}>
            {t("candidates.none")}
          </Alert>
        )}

        <Stack spacing={1.25}>
          {candidates.map((entry) => (
            <Stack
              key={entry.id}
              spacing={1}
              sx={(theme) => ({
                p: 1.5,
                borderRadius: "10px",
                bgcolor: subtleBg(theme, true),
              })}
            >
              <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
                <Typography sx={{ fontWeight: 600 }}>{displayName(entry)}</Typography>
                <WaitlistPriorityChip priority={entry.priority} />
                <WaitlistSourceChip source={entry.source} />
                {entry.status === "offered" && <WaitlistStatusChip status={entry.status} />}
              </Stack>

              <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
                <Typography variant="body2" color="text.secondary">
                  {formatPhoneDisplay(entry.phone)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  · {periodLabel(entry)}
                  {timeRangeLabel(entry) ? ` · ${timeRangeLabel(entry)}` : ""}
                </Typography>
                <Chip
                  size="small"
                  variant="outlined"
                  label={t("waitingDays", { count: waitingDays(entry) })}
                  sx={{ height: 22 }}
                />
              </Stack>

              {entry.comment && (
                <Typography variant="body2" color="text.secondary">
                  {entry.comment}
                </Typography>
              )}

              <Stack direction="row" gap={1} flexWrap="wrap">
                {/* Звонок из панели кандидатов = предложение этого окна:
                    статус offered показывает второму регистратору, что по
                    записи уже работают, и он не позвонит тому же человеку. */}
                <Tooltip title={t("candidates.offered")}>
                  <AppButton
                    size="small"
                    variant="outlined"
                    href={`tel:${entry.phone}`}
                    startIcon={<PhoneOutlined />}
                    onClick={() => offerMutation.mutate(entry)}
                  >
                    {t("actions.call")}
                  </AppButton>
                </Tooltip>
                <AppButton
                  size="small"
                  variant="contained"
                  startIcon={<EventAvailableOutlined />}
                  onClick={() => slot && onBook?.(entry, slot)}
                >
                  {t("candidates.bookHere")}
                </AppButton>
                <AppButton
                  size="small"
                  color="inherit"
                  startIcon={<BlockOutlined />}
                  onClick={() => refuseMutation.mutate(entry)}
                  disabled={refuseMutation.isPending}
                >
                  {t("candidates.notSuitable")}
                </AppButton>
              </Stack>
            </Stack>
          ))}
        </Stack>
      </DialogContent>
    </Dialog>
  );
};

export default WaitlistCandidatesPanel;
