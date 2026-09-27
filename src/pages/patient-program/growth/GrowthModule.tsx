import React from "react";
import { Alert, Box, Stack, Typography } from "@mui/material";
import StraightenOutlined from "@mui/icons-material/StraightenOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import { getProgramModuleRecords, type EffectiveProgramModule, type ProgramModuleRecord } from "../../../api/programs";
import { djangoQueryKeys } from "../../../api/queryKeys";
import { AppButton, AppCard, ListEmptyState } from "../../../components/ui";
import type { ActiveScope } from "../../../hooks/useActiveScope";
import { ageLabel } from "../vision/visionNorms";
import { GrowthChart } from "./GrowthChart";
import { GrowthDrawer } from "./GrowthDrawer";
import { GrowthHistory } from "./GrowthHistory";
import { GrowthMetrics } from "./GrowthMetrics";
import { Stadiometer } from "./Stadiometer";
import { assessMeasurement, growthSex, previousWith, readMeasurements } from "./growthData";

interface GrowthModuleProps {
  enrollmentId: number;
  module: EffectiveProgramModule;
  scope: ActiveScope;
  canManage: boolean;
  icon: React.ReactNode;
  birthDate: string | null;
  gender: string | null | undefined;
}

interface DrawerState {
  open: boolean;
  record: ProgramModuleRecord | null;
}

const CLOSED: DrawerState = { open: false, record: null };

/** Раздел «Рост и развитие»: ростомер, показатели с центилями ВОЗ, график, история (ТЗ «Рост» §3). */
export const GrowthModule: React.FC<GrowthModuleProps> = ({ enrollmentId, module, scope, canManage, icon, birthDate, gender }) => {
  const queryClient = useQueryClient();
  const queryKey = djangoQueryKeys.programs.records(enrollmentId, module.id, scope);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => getProgramModuleRecords(scope, enrollmentId, module.id, signal),
    enabled: scope.isReady && scope.orgReady,
  });
  const [drawer, setDrawer] = React.useState<DrawerState>(CLOSED);
  const sex = growthSex(gender);
  const list = React.useMemo(() => readMeasurements(query.data?.results ?? [], birthDate), [query.data, birthDate]);
  const latest = list.find((item) => item.heightCm != null) ?? list[0] ?? null;
  const previousHeight = latest ? previousWith(list, latest, "heightCm") : null;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey });
    void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.programs.upcoming(enrollmentId, scope) });
  };
  const open = (record: ProgramModuleRecord | null) => setDrawer({ open: true, record });
  const subheader = latest
    ? [
        "Последний замер",
        dayjs(latest.at).format("DD.MM.YYYY"),
        latest.months == null ? "" : ageLabel(Math.floor(latest.months)),
        latest.record.createdByName ?? "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "Антропометрия и динамика развития";

  return (
    <>
      <AppCard
        variant="outlined"
        header={
          <Stack
            direction={{ xs: "column", md: "row" }}
            justifyContent="space-between"
            alignItems={{ md: "center" }}
            gap={1.5}
            sx={{ px: 2, pt: 2 }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" fontWeight={700}>
                {module.name}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {subheader}
              </Typography>
            </Box>
            {canManage && (
              <AppButton variant="contained" size="small" startIcon={<StraightenOutlined />} onClick={() => open(null)} sx={{ alignSelf: { xs: "flex-start", md: "center" } }}>
                Замер
              </AppButton>
            )}
          </Stack>
        }
      >
        {query.error ? (
          <Alert severity="error">Не удалось загрузить замеры.</Alert>
        ) : query.isLoading ? (
          <Typography variant="body2" color="text.secondary">
            Загрузка…
          </Typography>
        ) : !latest ? (
          <ListEmptyState
            icon={icon}
            title="Замеров пока нет"
            description="Рост, вес и окружность головы — с центилями ВОЗ по ходу ввода."
            action={
              canManage ? (
                <AppButton variant="outlined" startIcon={<StraightenOutlined />} onClick={() => open(null)}>
                  Сделать замер
                </AppButton>
              ) : undefined
            }
          />
        ) : (
          <Stack gap={2.5}>
            <Box
              sx={{
                display: "grid",
                gap: 2,
                alignItems: "center",
                gridTemplateColumns: { xs: "1fr", md: "260px minmax(0, 1fr)" },
              }}
            >
              <Stadiometer
                key={latest.record.id}
                heightCm={latest.heightCm}
                previousCm={previousHeight?.heightCm ?? null}
                previousAt={previousHeight?.at ?? null}
                sex={sex}
                status={assessMeasurement(latest, "heightCm", sex)?.status ?? "unknown"}
              />
              <GrowthMetrics key={`m-${latest.record.id}`} latest={latest} list={list} sex={sex} />
            </Box>
            {list.length > 0 && <GrowthChart list={list} sex={sex} />}
            <GrowthHistory list={list} sex={sex} canManage={canManage} onEdit={open} />
          </Stack>
        )}
      </AppCard>
      <GrowthDrawer
        open={drawer.open}
        enrollmentId={enrollmentId}
        module={module}
        scope={scope}
        birthDate={birthDate}
        sex={sex}
        record={drawer.record}
        onClose={() => setDrawer(CLOSED)}
        onSaved={refresh}
      />
    </>
  );
};
