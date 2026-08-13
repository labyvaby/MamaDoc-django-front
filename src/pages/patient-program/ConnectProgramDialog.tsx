import React from "react";
import {
  Alert,
  Box,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import WorkspacePremiumOutlined from "@mui/icons-material/WorkspacePremiumOutlined";
import { useMutation, useQuery } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { useSnackbar } from "notistack";

import { getBranches } from "../../api/organization";
import {
  createProgramEnrollment,
  getPrograms,
  type ProgramEnrollment,
} from "../../api/programs";
import { djangoQueryKeys } from "../../api/queryKeys";
import { AppButton, CustomDatePicker } from "../../components/ui";
import { type ActiveScope } from "../../hooks/useActiveScope";
import { usePermissions } from "../../hooks/usePermissions";

interface ConnectProgramDialogProps {
  open: boolean;
  patientId: number;
  patientName: string;
  scope: ActiveScope;
  connectedProgramIds: number[];
  onClose: () => void;
  onConnected: (enrollment: ProgramEnrollment) => void;
}

export const ConnectProgramDialog: React.FC<ConnectProgramDialogProps> = ({
  open,
  patientId,
  patientName,
  scope,
  connectedProgramIds,
  onClose,
  onConnected,
}) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const { enqueueSnackbar } = useSnackbar();
  const { activeOrganization, activeBranch } = usePermissions();
  const [programId, setProgramId] = React.useState<number | "">("");
  const [branchId, setBranchId] = React.useState<number | "">(activeBranch?.id ?? "");
  const [startsAt, setStartsAt] = React.useState<Dayjs | null>(dayjs());
  const [expiresAt, setExpiresAt] = React.useState<Dayjs | null>(dayjs().add(1, "year"));

  const programsQuery = useQuery({
    queryKey: djangoQueryKeys.programs.list(scope),
    queryFn: ({ signal }) => getPrograms(scope, signal),
    enabled: open && scope.isReady && scope.orgReady,
  });
  const branchesQuery = useQuery({
    queryKey: ["django", "organization", "branches", activeOrganization?.id ?? null],
    queryFn: () => getBranches(activeOrganization?.id),
    enabled: open && !activeBranch && scope.isReady && scope.orgReady,
  });

  const programs = React.useMemo(
    () => (programsQuery.data?.results ?? []).filter(
      (program) => program.status === "active"
        && program.isEnabled
        && !connectedProgramIds.includes(program.id),
    ),
    [connectedProgramIds, programsQuery.data?.results],
  );
  const branches = React.useMemo(
    () => activeBranch
      ? [{ id: activeBranch.id, name: activeBranch.name, isActive: true }]
      : (branchesQuery.data ?? []).filter((branch) => branch.isActive),
    [activeBranch, branchesQuery.data],
  );
  const selectedProgram = programs.find((program) => program.id === programId);

  React.useEffect(() => {
    if (!open) return;
    setProgramId((current) => programs.some((program) => program.id === current)
      ? current
      : programs[0]?.id ?? "");
  }, [open, programs]);

  React.useEffect(() => {
    if (!open) return;
    setBranchId(activeBranch?.id ?? branches[0]?.id ?? "");
  }, [activeBranch?.id, branches, open]);

  const connectMutation = useMutation({
    mutationFn: () => createProgramEnrollment(scope, {
      patientId,
      programId: Number(programId),
      branchId: Number(branchId),
      organizationId: scope.organizationId,
      status: "active",
      startsAt: startsAt?.startOf("day").toISOString() ?? null,
      expiresAt: expiresAt?.endOf("day").toISOString() ?? null,
      source: "manual-ui",
    }),
    onSuccess: (enrollment) => {
      enqueueSnackbar("Программа подключена", { variant: "success" });
      onConnected(enrollment);
      onClose();
    },
  });

  const invalidDates = !!startsAt && !!expiresAt && !expiresAt.isAfter(startsAt, "day");
  const canSubmit = programId !== "" && branchId !== "" && !invalidDates;
  const loading = programsQuery.isLoading || branchesQuery.isLoading;
  const error = programsQuery.error || branchesQuery.error || connectMutation.error;

  return (
    <Dialog open={open} onClose={connectMutation.isPending ? undefined : onClose} fullWidth maxWidth="sm" fullScreen={fullScreen}>
      <DialogTitle sx={{ fontWeight: 700 }}>Подключить программу</DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ pt: 0.75 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">Клиент</Typography>
            <Typography variant="body1" fontWeight={600}>{patientName}</Typography>
          </Box>

          {error && (
            <Alert severity="error">
              {error instanceof Error ? error.message : "Не удалось подключить программу."}
            </Alert>
          )}

          <TextField
            select
            fullWidth
            label="Программа"
            value={programId}
            onChange={(event) => setProgramId(Number(event.target.value))}
            disabled={loading || connectMutation.isPending || programs.length === 0}
            helperText={programs.length === 0 && !loading ? "Нет доступных программ для подключения" : "Состав разделов задаётся выбранной программой"}
          >
            {programs.map((program) => (
              <MenuItem key={program.id} value={program.id}>
                <Stack direction="row" gap={1} alignItems="center" sx={{ minWidth: 0 }}>
                  <Typography variant="body2" noWrap>{program.name}</Typography>
                  {program.grantsVip && (
                    <Chip size="small" color="warning" icon={<WorkspacePremiumOutlined />} label="VIP" />
                  )}
                </Stack>
              </MenuItem>
            ))}
          </TextField>

          {selectedProgram?.description && (
            <Alert severity="info" icon={false}>{selectedProgram.description}</Alert>
          )}

          <TextField
            select
            fullWidth
            label="Филиал"
            value={branchId}
            onChange={(event) => setBranchId(Number(event.target.value))}
            disabled={!!activeBranch || loading || connectMutation.isPending}
          >
            {branches.map((branch) => (
              <MenuItem key={branch.id} value={branch.id}>{branch.name}</MenuItem>
            ))}
          </TextField>

          <Stack direction={{ xs: "column", sm: "row" }} gap={1.5}>
            <CustomDatePicker
              label="Начало"
              value={startsAt}
              onChange={setStartsAt}
              slotProps={{ textField: { fullWidth: true } }}
            />
            <CustomDatePicker
              label="Действует до"
              value={expiresAt}
              onChange={setExpiresAt}
              minDate={startsAt?.add(1, "day") ?? undefined}
              slotProps={{ textField: { fullWidth: true, error: invalidDates, helperText: invalidDates ? "Дата окончания должна быть позже начала" : undefined } }}
            />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <AppButton onClick={onClose} disabled={connectMutation.isPending}>Отмена</AppButton>
        <AppButton
          variant="contained"
          onClick={() => connectMutation.mutate()}
          disabled={!canSubmit || loading || programs.length === 0}
          loading={connectMutation.isPending}
        >
          Подключить
        </AppButton>
      </DialogActions>
    </Dialog>
  );
};

export default ConnectProgramDialog;
