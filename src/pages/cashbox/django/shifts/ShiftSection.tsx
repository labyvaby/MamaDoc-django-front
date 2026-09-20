import React from "react";
import { Box, Button, Chip, CircularProgress, Collapse, Stack, Typography } from "@mui/material";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import LockOpenOutlined from "@mui/icons-material/LockOpenOutlined";
import LockOutlined from "@mui/icons-material/LockOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import { AppCard } from "../../../../components/ui";
import {
  getCashboxShiftSummary,
  getCurrentShift,
  type CashboxShift,
} from "../../../../api/cashboxShifts";
import { djangoQueryKeys, DJANGO_DETAIL_STALE_TIME_MS } from "../../../../api/queryKeys";
import { formatSom } from "../money";
import ShiftOpenDialog from "./ShiftOpenDialog";
import ShiftCloseDialog from "./ShiftCloseDialog";
import ShiftHistoryPanel from "./ShiftHistoryPanel";
import ShiftXReportDialog from "./ShiftXReportDialog";

type Branch = { id: number; name: string };

type Props = {
  organizationId: number | undefined;
  branches: Branch[];
  activeBranch: Branch | undefined;
  queriesEnabled: boolean;
  canManage: boolean;
};

/**
 * Смена кассы на странице кассы: текущая смена, X-отчёт по ней и история.
 *
 * Диалоги смены лежали в репозитории с самого MVP и ни к чему не были
 * подключены — снять X-отчёт было неоткуда, поэтому раздел собран здесь.
 */
const ShiftSection: React.FC<Props> = ({
  organizationId,
  branches,
  activeBranch,
  queriesEnabled,
  canManage,
}) => {
  const queryClient = useQueryClient();
  const [openDialog, setOpenDialog] = React.useState(false);
  const [closeDialog, setCloseDialog] = React.useState(false);
  const [xReportShift, setXReportShift] = React.useState<CashboxShift | null>(null);
  const [historyOpen, setHistoryOpen] = React.useState(false);

  const branchId = activeBranch?.id;
  const enabled = queriesEnabled && branchId != null;

  const currentQuery = useQuery({
    queryKey: djangoQueryKeys.shifts.current({ branchId, organizationId }),
    queryFn: ({ signal }) =>
      getCurrentShift({ branchId: branchId!, organizationId }, signal),
    enabled,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  });

  const shift = currentQuery.data ?? null;

  // Закрытие смены показывает ожидаемую наличность — сводку тянем заранее,
  // иначе диалог открывается с пустыми цифрами.
  const summaryQuery = useQuery({
    queryKey: shift ? djangoQueryKeys.shifts.summary(shift.id) : ["noop"],
    queryFn: ({ signal }) => getCashboxShiftSummary(shift!.id, organizationId, signal),
    enabled: enabled && shift !== null,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.shifts.all });
  };

  return (
    <AppCard sx={{ mb: 1.5 }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        useFlexGap
        sx={{ rowGap: 1, columnGap: 1.5 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="subtitle2" fontWeight={700}>
              Смена кассы
            </Typography>
            {currentQuery.isLoading ? (
              <CircularProgress size={13} />
            ) : shift ? (
              <Chip size="small" color="success" label={`Открыта · #${shift.id}`} sx={{ height: 20 }} />
            ) : (
              <Chip size="small" variant="outlined" label="Закрыта" sx={{ height: 20 }} />
            )}
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {branchId == null
              ? "Выберите филиал, чтобы работать со сменой"
              : shift
                ? `${shift.openedByName ?? "—"} · с ${dayjs(shift.openedAt).format("DD.MM HH:mm")} · начальные ${formatSom(parseFloat(shift.openingCash) || 0)}`
                : "Открытой смены нет — X-отчёт можно снять по прошлым сменам в истории"}
          </Typography>
        </Box>

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button
            size="small"
            variant="outlined"
            startIcon={<ReceiptLongOutlined fontSize="small" />}
            disabled={!shift}
            onClick={() => setXReportShift(shift)}
          >
            X-отчёт
          </Button>
          {canManage &&
            (shift ? (
              <Button
                size="small"
                variant="outlined"
                color="warning"
                startIcon={<LockOutlined fontSize="small" />}
                onClick={() => setCloseDialog(true)}
              >
                Закрыть смену
              </Button>
            ) : (
              <Button
                size="small"
                variant="contained"
                startIcon={<LockOpenOutlined fontSize="small" />}
                disabled={branchId == null}
                onClick={() => setOpenDialog(true)}
              >
                Открыть смену
              </Button>
            ))}
          <Button
            size="small"
            endIcon={
              <ExpandMoreOutlined
                fontSize="small"
                sx={{ transform: historyOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }}
              />
            }
            onClick={() => setHistoryOpen((value) => !value)}
          >
            История смен
          </Button>
        </Stack>
      </Stack>

      <Collapse in={historyOpen} unmountOnExit>
        <Box sx={{ mt: 1.5 }}>
          <ShiftHistoryPanel
            organizationId={organizationId}
            branches={branches}
            queriesEnabled={queriesEnabled}
          />
        </Box>
      </Collapse>

      <ShiftOpenDialog
        open={openDialog}
        organizationId={organizationId}
        branches={branches}
        defaultBranchId={branchId}
        onClose={() => setOpenDialog(false)}
        onOpened={() => {
          setOpenDialog(false);
          invalidate();
        }}
      />
      <ShiftCloseDialog
        open={closeDialog}
        shift={shift}
        summary={summaryQuery.data}
        onClose={() => setCloseDialog(false)}
        onClosed={() => {
          setCloseDialog(false);
          invalidate();
        }}
      />
      <ShiftXReportDialog
        open={xReportShift !== null}
        shift={xReportShift}
        onClose={() => setXReportShift(null)}
      />
    </AppCard>
  );
};

export default ShiftSection;
