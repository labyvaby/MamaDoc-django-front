import React from "react";
import {
  Alert,
  Box,
  ButtonBase,
  Chip,
  Menu,
  MenuItem,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiOrgId } from "../../../hooks/useApiOrgId";
import { useCanChecker } from "../../../hooks/useCan";
import { djangoQueryKeys, DJANGO_LIST_STALE_TIME_MS } from "../../../api/queryKeys";
import {
  getPatientCalendar,
  updateSchedule,
  type CalendarCell,
} from "../../../api/vaccinations";
import type { DjangoPatient } from "../../../api/patients";
import AdministerVaccinationDrawer from "../../../components/vaccinations/AdministerVaccinationDrawer";
import RecordVaccinationDrawer from "../../../components/vaccinations/RecordVaccinationDrawer";
import {
  ExemptionDialog,
  RefusalDialog,
} from "../../../components/vaccinations/ExemptionRefusalDialogs";
import {
  CELL_STATE_META,
  calendarSummary,
  cellActionable,
  cellCaption,
  type Tone,
} from "../../../components/vaccinations/calendarGrid";
import { ageLabel } from "../../../components/vaccinations/patientGaps";

type Props = {
  patient: DjangoPatient | null;
  onEditPatient?: () => void;
};

type Action = "external" | "exemption" | "refusal" | null;

/**
 * «Календарь прививок» ребёнка: возрастные точки национального календаря и
 * состояние каждой дозы. С клетки — внести внешнюю прививку, медотвод, отказ
 * или пропустить дозу; черновик — оформить.
 */
const PatientCalendarPanel: React.FC<Props> = ({ patient, onEditPatient }) => {
  const theme = useTheme();
  const orgId = useApiOrgId();
  const queryClient = useQueryClient();
  const { can } = useCanChecker();
  const canRecord = can("vaccinations.record");
  const patientId = patient?.id ?? null;

  const [menu, setMenu] = React.useState<{ anchor: HTMLElement; cell: CalendarCell } | null>(null);
  const [action, setAction] = React.useState<{ kind: Action; cell: CalendarCell } | null>(null);
  const [administerId, setAdministerId] = React.useState<number | null>(null);

  const calendarQuery = useQuery({
    queryKey: djangoQueryKeys.vaccinations.patientCalendar(patientId ?? 0, orgId),
    queryFn: ({ signal }) => getPatientCalendar(patientId!, orgId, signal),
    enabled: patientId != null,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });

  const skipMutation = useMutation({
    mutationFn: (slotId: number) => updateSchedule(slotId, { status: "skipped" }, orgId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.vaccinations.all }),
  });

  if (!patient) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography color="text.secondary">Выберите пациента</Typography>
      </Box>
    );
  }

  const data = calendarQuery.data;
  const toneColor = (tone: Tone) =>
    tone === "default" ? theme.palette.text.secondary : theme.palette[tone].main;

  const onCellClick = (event: React.MouseEvent<HTMLElement>, cell: CalendarCell) => {
    if (!canRecord) return;
    if (cell.state === "draft" && cell.record) {
      setAdministerId(cell.record.id);
      return;
    }
    if (cellActionable(cell)) setMenu({ anchor: event.currentTarget, cell });
  };

  const summary = data ? calendarSummary(data.groups) : null;

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap" sx={{ mb: 1.5, flexShrink: 0 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 200 }}>
          {patient.gender === "female" ? "Девочка" : patient.gender === "male" ? "Мальчик" : "Пол не указан"}
          {patient.birthDate ? ` · ${ageLabel(patient.birthDate)}` : ""}
        </Typography>
        {summary && (
          <>
            <Chip size="small" color="success" variant="outlined" label={`Сделано ${summary.done} из ${summary.total}`} />
            {summary.due > 0 && <Chip size="small" color="warning" label={`Пора: ${summary.due}`} />}
            {summary.overdue > 0 && <Chip size="small" color="error" label={`Просрочено: ${summary.overdue}`} />}
          </>
        )}
      </Stack>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", pr: 0.5 }}>
        {!patient.birthDate ? (
          <Alert
            severity="warning"
            action={
              onEditPatient && (
                <ButtonBase onClick={onEditPatient} sx={{ px: 1, fontWeight: 600 }}>
                  Указать
                </ButtonBase>
              )
            }
          >
            Календарь прививок строится от даты рождения — укажите её в карточке пациента.
          </Alert>
        ) : calendarQuery.isLoading ? (
          <Stack spacing={1}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" height={64} />
            ))}
          </Stack>
        ) : calendarQuery.error ? (
          <Alert severity="error">Не удалось загрузить календарь</Alert>
        ) : !data || data.groups.length === 0 ? (
          <Alert severity="info">
            Календарь организации пуст. Загрузите календарь КР в разделе «Вакцины» → «Календарь».
          </Alert>
        ) : (
          <Stack spacing={1.5}>
            {data.groups.map((group) => (
              <Box
                key={group.label}
                sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "130px 1fr" }, gap: 1 }}
              >
                <Typography variant="subtitle2" sx={{ pt: { sm: 1 } }}>
                  {group.label}
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                  {group.cells.map((cell) => {
                    const meta = CELL_STATE_META[cell.state];
                    const color = toneColor(meta.tone);
                    return (
                      <ButtonBase
                        key={cell.templateId}
                        onClick={(e) => onCellClick(e, cell)}
                        disabled={!canRecord}
                        sx={{
                          display: "block",
                          textAlign: "left",
                          minWidth: 150,
                          px: 1.25,
                          py: 0.75,
                          borderRadius: "10px",
                          border: 1,
                          borderColor: alpha(color, 0.5),
                          bgcolor: alpha(color, 0.08),
                        }}
                      >
                        <Typography variant="body2" fontWeight={600} noWrap>
                          {cell.vaccineName} · {cell.doseNumber}
                        </Typography>
                        <Typography variant="caption" sx={{ color, fontWeight: 600 }}>
                          {meta.label}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block">
                          {cellCaption(cell)}
                        </Typography>
                      </ButtonBase>
                    );
                  })}
                </Box>
              </Box>
            ))}
          </Stack>
        )}
      </Box>

      <Menu anchorEl={menu?.anchor ?? null} open={menu != null} onClose={() => setMenu(null)}>
        <MenuItem
          onClick={() => {
            setAction({ kind: "external", cell: menu!.cell });
            setMenu(null);
          }}
        >
          Внести сделанную в другом месте
        </MenuItem>
        <MenuItem
          onClick={() => {
            setAction({ kind: "exemption", cell: menu!.cell });
            setMenu(null);
          }}
        >
          Медотвод
        </MenuItem>
        <MenuItem
          onClick={() => {
            setAction({ kind: "refusal", cell: menu!.cell });
            setMenu(null);
          }}
        >
          Отказ
        </MenuItem>
        {menu?.cell.slotId != null && menu.cell.state !== "skipped" && (
          <MenuItem
            onClick={() => {
              skipMutation.mutate(menu.cell.slotId!);
              setMenu(null);
            }}
          >
            Пропустить дозу
          </MenuItem>
        )}
      </Menu>

      <RecordVaccinationDrawer
        open={action?.kind === "external"}
        onClose={() => {
          setAction(null);
          void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.vaccinations.all });
        }}
        initialPatient={patient}
        lockedScenario="external"
        initialVaccineId={action?.cell.vaccineId ?? null}
        initialDoseNumber={action?.cell.doseNumber ?? null}
      />
      <ExemptionDialog
        open={action?.kind === "exemption"}
        onClose={() => setAction(null)}
        patientId={patientId}
        vaccineId={action?.cell.vaccineId ?? null}
      />
      <RefusalDialog
        open={action?.kind === "refusal"}
        onClose={() => setAction(null)}
        patientId={patientId}
        vaccineId={action?.cell.vaccineId ?? null}
      />
      <AdministerVaccinationDrawer
        open={administerId != null}
        recordId={administerId}
        onClose={() => setAdministerId(null)}
      />
    </Box>
  );
};

export default PatientCalendarPanel;
