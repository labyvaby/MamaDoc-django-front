import React from "react";
import { Button, Tooltip, useMediaQuery, useTheme } from "@mui/material";
import HistoryEduOutlined from "@mui/icons-material/HistoryEduOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useSnackbar } from "notistack";

import { getAppointment } from "../../../api/appointments";
import {
  getConditions,
  getFamily,
  getGrowth,
  getHospitalizations,
  getIllnessHistory,
  getLifeAnamnesis,
  getPatientHealth,
  getSurgeries,
} from "../../../api/health";
import { DJANGO_DETAIL_STALE_TIME_MS, djangoQueryKeys } from "../../../api/queryKeys";
import { getPatientHistory, getPatientSchedule } from "../../../api/vaccinations";
import { useApiOrgId } from "../../../hooks/useApiOrgId";
import { usePermissions } from "../../../hooks/usePermissions";
import { AppButton } from "../../ui";
import { useHealthScope } from "../useHealth";
import { appendParagraph, buildLifeAnamnesisParagraph } from "./anamnesisParagraph";
import { assembleAnamnesisInput, useAnamnesisAccess } from "./useAnamnesis";

interface InsertLifeAnamnesisButtonProps {
  /** Приём заключения: пациент и дата берутся из него (как у полосы здоровья). */
  appointmentId: number | null;
  /** Текущий текст поля «Анамнез». */
  value: string;
  onChange: (text: string) => void;
}

/**
 * «Анамнез жизни из книжки» в строке подписи поля «Анамнез» заключения
 * (ТЗ §5.9). Видна в клинике, с `medical.health.view`, у пациента младше 18
 * лет на дату приёма или без даты рождения. Абзац собирается на дату приёма;
 * дальше это обычный текст поля.
 */
export const InsertLifeAnamnesisButton: React.FC<InsertLifeAnamnesisButtonProps> = ({ appointmentId, value, onChange }) => {
  const theme = useTheme();
  const narrow = useMediaQuery(theme.breakpoints.down("md"));
  const queryClient = useQueryClient();
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();
  const { activeOrganization } = usePermissions();
  const access = useAnamnesisAccess();
  const health = useHealthScope();
  const apiOrgId = useApiOrgId();
  const clinic = activeOrganization?.vertical === "clinic";
  const enabled = clinic && access.canView && appointmentId != null;
  const [pending, setPending] = React.useState(false);

  const appointment = useQuery({
    queryKey: djangoQueryKeys.appointments.detail(appointmentId ?? 0),
    queryFn: () => getAppointment(appointmentId as number),
    enabled,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  });
  const patientId = appointment.data?.patient?.id ?? null;
  const growth = useQuery({
    queryKey: djangoQueryKeys.health.growth(patientId ?? 0, health.orgId),
    queryFn: ({ signal }) => getGrowth(health.scope, patientId as number, signal),
    enabled: enabled && health.ready && patientId != null,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  });

  const at = appointment.data?.scheduledAt ? dayjs(appointment.data.scheduledAt).format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD");
  const birthDate = growth.data?.birthDate ?? null;
  const child = !birthDate || dayjs(at).diff(dayjs(birthDate), "year") < 18;
  if (!enabled || patientId == null || !growth.data || !child) return null;

  const insert = async () => {
    setPending(true);
    try {
      const id = patientId;
      const scope = health.scope;
      const orgId = health.orgId;
      const [life, summary, family, conditions, hospitalizations, illness, surgeries, schedule, history] = await Promise.all([
        queryClient.fetchQuery({ queryKey: djangoQueryKeys.health.lifeAnamnesis(id, orgId), queryFn: ({ signal }) => getLifeAnamnesis(scope, id, signal) }),
        queryClient.fetchQuery({ queryKey: djangoQueryKeys.health.summary(id, orgId), queryFn: ({ signal }) => getPatientHealth(scope, id, signal) }),
        queryClient.fetchQuery({ queryKey: djangoQueryKeys.health.family(id, orgId), queryFn: ({ signal }) => getFamily(scope, id, signal) }),
        queryClient.fetchQuery({
          queryKey: djangoQueryKeys.health.conditions(id, { status: "all" }, orgId),
          queryFn: ({ signal }) => getConditions(scope, id, { status: "all" }, signal),
        }),
        queryClient.fetchQuery({ queryKey: djangoQueryKeys.health.hospitalizations(id, orgId), queryFn: ({ signal }) => getHospitalizations(scope, id, signal) }),
        queryClient.fetchQuery({ queryKey: djangoQueryKeys.health.illnessHistory(id, orgId), queryFn: ({ signal }) => getIllnessHistory(scope, id, signal) }),
        queryClient.fetchQuery({
          queryKey: djangoQueryKeys.health.surgeries(id, orgId),
          queryFn: ({ signal }) => getSurgeries(scope, id, { status: "all" }, signal),
        }),
        access.canSeeVaccinations
          ? queryClient.fetchQuery({ queryKey: djangoQueryKeys.vaccinations.patientSchedule(id), queryFn: ({ signal }) => getPatientSchedule(id, apiOrgId, signal) })
          : Promise.resolve(null),
        access.canSeeVaccinations
          ? queryClient.fetchQuery({ queryKey: djangoQueryKeys.vaccinations.patientHistory(id), queryFn: ({ signal }) => getPatientHistory(id, apiOrgId, signal) })
          : Promise.resolve(null),
      ]);
      const input = assembleAnamnesisInput(
        { life, health: summary, growth: growth.data, family, conditions, hospitalizations, illness, surgeries, schedule, history },
        access,
      );
      const paragraph = buildLifeAnamnesisParagraph(input, {
        at,
        canSeeSensitive: input.sensitiveAccess,
        canSeeVaccinations: access.canSeeVaccinations,
      });
      if (paragraph.empty) {
        enqueueSnackbar("В медкарте нет сведений для анамнеза жизни", { variant: "info" });
        return;
      }
      const previous = value;
      onChange(appendParagraph(previous, paragraph.text));
      enqueueSnackbar("Анамнез жизни вставлен", {
        variant: "success",
        action: (key) => (
          <Button
            color="inherit"
            size="small"
            onClick={() => {
              onChange(previous);
              closeSnackbar(key);
            }}
          >
            Отменить
          </Button>
        ),
      });
    } catch {
      enqueueSnackbar("Не удалось собрать анамнез жизни из книжки", { variant: "error" });
    } finally {
      setPending(false);
    }
  };

  return (
    <Tooltip title="Вставить анамнез жизни из книжки" arrow>
      <span>
        <AppButton size="small" variant="text" startIcon={<HistoryEduOutlined fontSize="small" />} loading={pending} onClick={() => void insert()} sx={{ py: 0, minHeight: 0 }}>
          {narrow ? "Из книжки" : "Анамнез жизни из книжки"}
        </AppButton>
      </span>
    </Tooltip>
  );
};
