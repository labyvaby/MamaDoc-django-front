import React from "react";
import { Box, ButtonBase, Chip, FormControlLabel, Stack, Switch, Typography } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CheckCircleOutlineRounded from "@mui/icons-material/CheckCircleOutlineRounded";
import VerifiedOutlined from "@mui/icons-material/VerifiedOutlined";
import WarningAmberRounded from "@mui/icons-material/WarningAmberRounded";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { confirmNoAllergies, getAllergies, type Allergy } from "../../api/health";
import { DJANGO_LIST_STALE_TIME_MS, djangoQueryKeys } from "../../api/queryKeys";
import { subtleBg } from "../../theme/uiHelpers";
import { AppButton } from "../ui";
import { AllergyDrawer } from "./AllergyDrawer";
import { healthErrorText } from "./healthForms";
import { HealthSectionCard } from "./HealthSectionCard";
import {
  ALLERGY_CATEGORIES,
  ALLERGY_SEVERITIES,
  ALLERGY_STATUSES,
  formatDate,
  optionLabel,
  severityTone,
} from "./healthMeta";
import { useHealthScope, useInvalidateHealth, usePatientHealth } from "./useHealth";

interface AllergiesSectionProps {
  patientId: number;
  canManage: boolean;
  /** Заголовок карточки (в книжке — название раздела). */
  title?: string;
}

const AllergyRow: React.FC<{ allergy: Allergy; canManage: boolean; onEdit: (allergy: Allergy) => void }> = ({
  allergy,
  canManage,
  onEdit,
}) => {
  const active = allergy.status === "active";
  const tone = severityTone(allergy.severity);
  const meta = [
    optionLabel(ALLERGY_CATEGORIES, allergy.category),
    allergy.notedOn ? `с ${formatDate(allergy.notedOn)}` : "",
    allergy.createdBy?.fullName ?? "",
  ]
    .filter(Boolean)
    .join(" · ");
  const content = (
    <Stack
      direction="row"
      alignItems="flex-start"
      gap={1.25}
      sx={(theme) => ({
        width: "100%",
        textAlign: "left",
        p: 1.5,
        borderRadius: "12px",
        border: 1,
        borderColor: active && (tone === "error" || tone === "warning") ? `${tone}.light` : "divider",
        bgcolor: active ? subtleBg(theme) : "transparent",
        opacity: active ? 1 : 0.7,
      })}
    >
      <WarningAmberRounded fontSize="small" color={active && tone !== "default" ? tone : "disabled"} sx={{ mt: 0.25 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" gap={0.75} flexWrap="wrap">
          <Typography variant="body2" fontWeight={700} sx={{ textDecoration: allergy.status === "refuted" ? "line-through" : undefined }}>
            {allergy.allergen}
          </Typography>
          {allergy.severity !== "unknown" && (
            <Chip size="small" color={tone} variant={active ? "filled" : "outlined"} label={optionLabel(ALLERGY_SEVERITIES, allergy.severity)} sx={{ height: 20 }} />
          )}
          {allergy.isConfirmed && <VerifiedOutlined sx={{ fontSize: 16 }} color="action" titleAccess="Подтверждена" />}
          {!active && <Chip size="small" variant="outlined" label={optionLabel(ALLERGY_STATUSES, allergy.status)} sx={{ height: 20 }} />}
        </Stack>
        {allergy.reaction && (
          <Typography variant="body2" color="text.secondary">
            {allergy.reaction}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary">
          {meta}
        </Typography>
      </Box>
    </Stack>
  );
  return canManage ? (
    <ButtonBase onClick={() => onEdit(allergy)} sx={{ display: "block", width: "100%", borderRadius: "12px" }}>
      {content}
    </ButtonBase>
  ) : (
    content
  );
};

/** Аллергии: действующие, «аллергий нет» с подтверждением, история по кнопке. */
export const AllergiesSection: React.FC<AllergiesSectionProps> = ({ patientId, canManage, title = "Аллергии" }) => {
  const { enqueueSnackbar } = useSnackbar();
  const { orgId, scope, ready } = useHealthScope();
  const invalidate = useInvalidateHealth(patientId);
  const summary = usePatientHealth(patientId);
  const [showAll, setShowAll] = React.useState(false);
  const [drawer, setDrawer] = React.useState<{ open: boolean; allergy: Allergy | null }>({ open: false, allergy: null });

  const all = useQuery({
    queryKey: djangoQueryKeys.health.allergies(patientId, "all", orgId),
    queryFn: ({ signal }) => getAllergies(scope, patientId, "all", signal),
    enabled: ready && showAll,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });

  const confirm = useMutation({
    mutationFn: () => confirmNoAllergies(scope, patientId),
    onSuccess: async () => {
      enqueueSnackbar("Отмечено: аллергий нет", { variant: "success" });
      await invalidate();
    },
    onError: (error) => enqueueSnackbar(healthErrorText(error), { variant: "error" }),
  });

  const data = summary.data;
  const status = data?.alert.allergyStatus ?? "unknown";
  const rows = showAll ? all.data ?? [] : data?.allergies ?? [];
  const profile = data?.profile;

  const subheader =
    status === "has" ? (
      <Typography variant="body2" color="error.main" fontWeight={600} component="span">
        Есть аллергии — видно всем в карточке, на приёме и на прививке
      </Typography>
    ) : status === "none" ? (
      <Stack direction="row" gap={0.5} alignItems="center" component="span">
        <CheckCircleOutlineRounded fontSize="inherit" color="success" />
        <span>
          Аллергий нет
          {profile?.allergiesReviewedAt
            ? ` · подтверждено ${formatDate(profile.allergiesReviewedAt)}${profile.allergiesReviewedBy ? `, ${profile.allergiesReviewedBy.fullName}` : ""}`
            : ""}
        </span>
      </Stack>
    ) : (
      <Typography variant="body2" color="warning.main" component="span">
        Не уточнены — спросите у родителей
      </Typography>
    );

  return (
    <>
      <HealthSectionCard
        title={title}
        subheader={subheader}
        loading={summary.isLoading}
        error={summary.isError}
        actions={
          canManage ? (
            <>
              {status !== "has" && status !== "none" && (
                <AppButton variant="outlined" size="small" loading={confirm.isPending} onClick={() => confirm.mutate()}>
                  Аллергий нет
                </AppButton>
              )}
              <AppButton variant="contained" size="small" startIcon={<AddOutlined />} onClick={() => setDrawer({ open: true, allergy: null })}>
                Аллергия
              </AppButton>
            </>
          ) : undefined
        }
      >
        <Stack gap={1}>
          {rows.length === 0 && !showAll && (
            <Typography variant="body2" color="text.secondary">
              {status === "none" ? "Родители подтвердили: аллергий нет." : "Действующих аллергий не внесено."}
            </Typography>
          )}
          {rows.map((allergy) => (
            <AllergyRow key={allergy.id} allergy={allergy} canManage={canManage} onEdit={(row) => setDrawer({ open: true, allergy: row })} />
          ))}
          <FormControlLabel
            sx={{ m: 0, alignSelf: "flex-start" }}
            control={<Switch size="small" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} />}
            label={<Typography variant="caption">Показать прошедшие и ошибочные</Typography>}
          />
        </Stack>
      </HealthSectionCard>
      <AllergyDrawer
        open={drawer.open}
        patientId={patientId}
        allergy={drawer.allergy}
        onClose={() => setDrawer({ open: false, allergy: null })}
      />
    </>
  );
};
