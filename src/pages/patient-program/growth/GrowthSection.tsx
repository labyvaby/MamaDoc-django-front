import React from "react";
import { Alert, Box, Divider, Stack, Typography } from "@mui/material";
import StraightenOutlined from "@mui/icons-material/StraightenOutlined";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { getGrowth } from "../../../api/health";
import { DJANGO_DETAIL_STALE_TIME_MS, djangoQueryKeys } from "../../../api/queryKeys";
import { FeedingSection } from "../../../components/health/FeedingSection";
import { isChild } from "../../../components/health/healthMeta";
import { useHealthScope } from "../../../components/health/useHealth";
import { AppButton, AppCard, ListEmptyState } from "../../../components/ui";
import { ageLabel } from "../vision/visionNorms";
import { GrowthChart } from "./GrowthChart";
import { GrowthDrawer } from "./GrowthDrawer";
import { GrowthHistory } from "./GrowthHistory";
import { GrowthMetrics } from "./GrowthMetrics";
import { Stadiometer } from "./Stadiometer";
import { assessMeasurement, feedingInputs, growthSex, previousWith, readGrowth, type Measurement } from "./growthData";

interface GrowthSectionProps {
  patientId: number;
  title?: string;
  canManage: boolean;
  /** Блок «Вскармливание и прикорм» внизу; false — он отдельным разделом книжки. */
  showFeeding?: boolean;
}

interface DrawerState {
  open: boolean;
  measurement: Measurement | null;
}

const CLOSED: DrawerState = { open: false, measurement: null };

/**
 * «Рост и развитие»: ростомер, показатели с центилями ВОЗ, график, история
 * замеров (ручные, из заключений приёмов, из архива) и — пока в программе нет
 * отдельного раздела — вскармливание.
 */
export const GrowthSection: React.FC<GrowthSectionProps> = ({ patientId, title = "Рост и развитие", canManage, showFeeding = true }) => {
  const { orgId, scope, ready } = useHealthScope();
  const query = useQuery({
    queryKey: djangoQueryKeys.health.growth(patientId, orgId),
    queryFn: ({ signal }) => getGrowth(scope, patientId, signal),
    enabled: ready,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  });
  const [drawer, setDrawer] = React.useState<DrawerState>(CLOSED);
  const data = query.data;
  const sex = growthSex(data?.sex);
  const birthDate = data?.birthDate ?? null;
  const weeks = data?.gestationalAgeWeeks ?? null;
  const days = data?.gestationalAgeDays ?? null;
  const gestation = React.useMemo(() => ({ weeks, days }), [weeks, days]);
  const list = React.useMemo(() => (data ? readGrowth(data) : []), [data]);
  const measured = list.filter((item) => item.key !== "birth");
  const latest = measured.find((item) => item.heightCm != null) ?? measured[0] ?? null;
  const previousHeight = latest ? previousWith(list, latest, "heightCm") : null;
  const feeding = React.useMemo(() => (data && showFeeding ? feedingInputs(data) : null), [data, showFeeding]);
  const open = (measurement: Measurement | null) => setDrawer({ open: true, measurement });

  const subheader = latest
    ? [
        "Последний замер",
        dayjs(latest.at).format("DD.MM.YYYY"),
        latest.months == null ? "" : `${latest.corrected ? "скорр. " : ""}${ageLabel(Math.floor(latest.months))}`,
        latest.sourceLabel,
        latest.author,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Рост, вес и окружность головы с центилями ВОЗ";

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
                {title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {subheader}
              </Typography>
            </Box>
            {canManage && (
              <AppButton
                variant="contained"
                size="small"
                startIcon={<StraightenOutlined />}
                onClick={() => open(null)}
                sx={{ alignSelf: { xs: "flex-start", md: "center" } }}
              >
                Замер
              </AppButton>
            )}
          </Stack>
        }
      >
        {query.error ? (
          <Alert severity="error">Не удалось загрузить замеры.</Alert>
        ) : query.isLoading || !data ? (
          <Typography variant="body2" color="text.secondary">
            Загрузка…
          </Typography>
        ) : (
          <Stack gap={2.5}>
            {!latest ? (
              <ListEmptyState
                icon={<StraightenOutlined />}
                title="Замеров пока нет"
                description="Вес, рост и голова из заключения приёма попадают сюда сами; можно внести и вручную."
                action={
                  canManage ? (
                    <AppButton variant="outlined" startIcon={<StraightenOutlined />} onClick={() => open(null)}>
                      Сделать замер
                    </AppButton>
                  ) : undefined
                }
              />
            ) : (
              <>
                <Box
                  sx={{
                    display: "grid",
                    gap: 2,
                    alignItems: "center",
                    gridTemplateColumns: { xs: "1fr", md: "260px minmax(0, 1fr)" },
                  }}
                >
                  <Stadiometer
                    key={latest.key}
                    heightCm={latest.heightCm}
                    previousCm={previousHeight?.heightCm ?? null}
                    previousAt={previousHeight?.at ?? null}
                    sex={sex}
                    status={assessMeasurement(latest, "heightCm", sex)?.status ?? "unknown"}
                  />
                  <GrowthMetrics key={`m-${latest.key}`} latest={latest} list={list} sex={sex} />
                </Box>
                <GrowthChart list={list} sex={sex} />
                <GrowthHistory list={list} sex={sex} canManage={canManage} onEdit={open} />
              </>
            )}
            {feeding && isChild(birthDate) && (
              <>
                <Divider />
                <FeedingSection patientId={patientId} canManage={canManage} {...feeding} />
              </>
            )}
          </Stack>
        )}
      </AppCard>
      <GrowthDrawer
        open={drawer.open}
        patientId={patientId}
        birthDate={birthDate}
        sex={sex}
        gestation={gestation}
        measurement={drawer.measurement}
        onClose={() => setDrawer(CLOSED)}
      />
    </>
  );
};
