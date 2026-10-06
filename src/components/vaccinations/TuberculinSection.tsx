import React from "react";
import { Alert, Box, ButtonBase, Chip, Skeleton, Stack, Typography } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { DJANGO_LIST_STALE_TIME_MS, djangoQueryKeys } from "../../api/queryKeys";
import { getTuberculinTests, type TuberculinTest } from "../../api/vaccinations";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { AppButton } from "../ui";
import { ageLabel } from "./patientGaps";
import {
  TUBERCULIN_KIND_OPTIONS,
  TUBERCULIN_RESULT_OPTIONS,
  optionLabel,
  optionTone,
} from "./reactionMeta";
import { TuberculinDialog } from "./TuberculinDialog";

const TestRow: React.FC<{ test: TuberculinTest; birthDate: string | null }> = ({ test, birthDate }) => {
  const age = ageLabel(birthDate, dayjs(test.performedOn).toDate());
  const shown = test.result || test.suggestedResult;
  return (
    <Stack
      direction="row"
      alignItems="center"
      gap={1.5}
      sx={{
        width: "100%",
        textAlign: "left",
        px: 1.5,
        py: 1,
        border: 1,
        borderColor: "divider",
        borderRadius: "10px",
        bgcolor: "background.paper",
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" fontWeight={500} noWrap>
          {optionLabel(TUBERCULIN_KIND_OPTIONS, test.kind)} · {dayjs(test.performedOn).format("DD.MM.YYYY")}
          {age ? ` · ${age}` : ""}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap display="block">
          {test.readOn
            ? `оценка ${dayjs(test.readOn).format("DD.MM.YYYY")}${test.indurationMm != null ? ` · ${test.indurationMm} мм` : ""}`
            : "ждёт оценки"}
          {test.batchNumber ? ` · серия ${test.batchNumber}` : ""}
        </Typography>
      </Box>
      {shown ? (
        <Chip
          size="small"
          variant={test.result ? "filled" : "outlined"}
          color={optionTone(TUBERCULIN_RESULT_OPTIONS, shown)}
          label={
            test.result
              ? optionLabel(TUBERCULIN_RESULT_OPTIONS, shown)
              : `подсказка: ${optionLabel(TUBERCULIN_RESULT_OPTIONS, shown).toLowerCase()}`
          }
        />
      ) : (
        !test.readOn && <Chip size="small" color="warning" variant="outlined" label="оценить" />
      )}
    </Stack>
  );
};

interface TuberculinSectionProps {
  patientId: number;
  birthDate: string | null;
  canRecord: boolean;
  /** Заголовок раздела — в стиле панели, где он стоит. */
  renderTitle: (title: string) => React.ReactNode;
}

/** «Манту и Диаскинтест» (112/у, «Реакция Манту»): пробы с оценкой. */
export const TuberculinSection: React.FC<TuberculinSectionProps> = ({ patientId, birthDate, canRecord, renderTitle }) => {
  const orgId = useApiOrgId();
  const [dialog, setDialog] = React.useState<{ open: boolean; test: TuberculinTest | null }>({
    open: false,
    test: null,
  });
  const query = useQuery({
    queryKey: djangoQueryKeys.vaccinations.tuberculinTests(patientId, orgId),
    queryFn: ({ signal }) => getTuberculinTests(patientId, orgId, signal),
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });
  const tests = query.data ?? [];

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
        {renderTitle("Манту и Диаскинтест")}
        {canRecord && (
          <AppButton size="small" variant="text" startIcon={<AddOutlined />} onClick={() => setDialog({ open: true, test: null })}>
            Проба
          </AppButton>
        )}
      </Stack>
      {query.isError ? (
        <Alert severity="error" sx={{ mt: 0.75 }}>
          Не удалось загрузить пробы
        </Alert>
      ) : query.isLoading ? (
        <Skeleton variant="rounded" height={56} sx={{ mt: 0.75 }} />
      ) : tests.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Проб ещё не было.
        </Typography>
      ) : (
        <Stack spacing={1} sx={{ mt: 0.75 }}>
          {tests.map((test) =>
            canRecord ? (
              <ButtonBase
                key={test.id}
                onClick={() => setDialog({ open: true, test })}
                sx={{ display: "block", width: "100%", borderRadius: "10px" }}
              >
                <TestRow test={test} birthDate={birthDate} />
              </ButtonBase>
            ) : (
              <TestRow key={test.id} test={test} birthDate={birthDate} />
            ),
          )}
        </Stack>
      )}
      <TuberculinDialog
        open={dialog.open}
        patientId={patientId}
        test={dialog.test}
        onClose={() => setDialog({ open: false, test: null })}
      />
    </Box>
  );
};
