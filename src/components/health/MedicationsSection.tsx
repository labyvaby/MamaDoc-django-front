import React from "react";
import { Box, ButtonBase, Chip, Stack, Typography } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import MedicationOutlined from "@mui/icons-material/MedicationOutlined";
import dayjs from "dayjs";
import { useQuery } from "@tanstack/react-query";

import { getMedications, type AllergyInput, type MedicationCourse, type MedicationKind } from "../../api/health";
import { DJANGO_LIST_STALE_TIME_MS, djangoQueryKeys } from "../../api/queryKeys";
import { subtleBg } from "../../theme/uiHelpers";
import { AppButton } from "../ui";
import { AllergyDrawer } from "./AllergyDrawer";
import { HealthSectionCard } from "./HealthSectionCard";
import { MedicationDrawer } from "./MedicationDrawer";
import { MEDICATION_KINDS, MEDICATION_PURPOSES, formatDate, optionLabel } from "./healthMeta";
import { useHealthScope } from "./useHealth";

const KIND_TONE: Record<MedicationKind, "error" | "info" | "default"> = {
  antibiotic: "error",
  vitamin_d: "info",
  other: "default",
};

/** Курс идёт: без даты отмены или она ещё не наступила. */
function running(course: MedicationCourse): boolean {
  return !course.endedOn || !dayjs(course.endedOn).isBefore(dayjs(), "day");
}

const CourseRow: React.FC<{ course: MedicationCourse; canManage: boolean; onEdit: (course: MedicationCourse) => void }> = ({
  course,
  canManage,
  onEdit,
}) => {
  const period = course.endedOn
    ? `${formatDate(course.startedOn)} — ${formatDate(course.endedOn)}`
    : `с ${formatDate(course.startedOn)}`;
  const content = (
    <Stack
      direction="row"
      gap={1.25}
      alignItems="flex-start"
      sx={(theme) => ({
        width: "100%",
        textAlign: "left",
        p: 1.5,
        borderRadius: "12px",
        bgcolor: running(course) ? subtleBg(theme) : "transparent",
        border: 1,
        borderColor: "divider",
      })}
    >
      <MedicationOutlined fontSize="small" color={running(course) ? "primary" : "disabled"} sx={{ mt: 0.25 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" gap={0.75} alignItems="center" flexWrap="wrap">
          <Typography variant="body2" fontWeight={700}>
            {course.drug}
          </Typography>
          <Chip size="small" color={KIND_TONE[course.kind]} variant="outlined" label={optionLabel(MEDICATION_KINDS, course.kind)} sx={{ height: 20 }} />
          {course.purpose && (
            <Chip size="small" variant="outlined" label={optionLabel(MEDICATION_PURPOSES, course.purpose)} sx={{ height: 20 }} />
          )}
          {running(course) && <Chip size="small" color="primary" label="идёт" sx={{ height: 20 }} />}
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {[course.dose, course.courseTotal ? `всего ${course.courseTotal}` : ""].filter(Boolean).join(" · ") || "Доза не указана"}
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block">
          {[period, course.prescribedBy?.fullName ?? ""].filter(Boolean).join(" · ")}
        </Typography>
        {course.reaction && (
          <Typography variant="caption" color="error.main" fontWeight={600} display="block">
            Реакция: {course.reaction}
          </Typography>
        )}
      </Box>
    </Stack>
  );
  return canManage ? (
    <ButtonBase onClick={() => onEdit(course)} sx={{ display: "block", width: "100%", borderRadius: "12px" }}>
      {content}
    </ButtonBase>
  ) : (
    content
  );
};

interface MedicationsSectionProps {
  patientId: number;
  canManage: boolean;
  title?: string;
}

/** «Препараты»: учёт антибиотиков, профилактика рахита (витамин D) и прочие курсы. */
export const MedicationsSection: React.FC<MedicationsSectionProps> = ({ patientId, canManage, title = "Препараты" }) => {
  const { orgId, scope, ready } = useHealthScope();
  const [drawer, setDrawer] = React.useState<{ open: boolean; course: MedicationCourse | null }>({ open: false, course: null });
  const [allergy, setAllergy] = React.useState<Partial<AllergyInput> | null>(null);
  const query = useQuery({
    queryKey: djangoQueryKeys.health.medications(patientId, orgId),
    queryFn: ({ signal }) => getMedications(scope, patientId, signal),
    enabled: ready,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });
  const courses = query.data ?? [];
  const antibiotics = courses.filter((course) => course.kind === "antibiotic").length;
  const active = courses.filter(running).length;

  return (
    <>
      <HealthSectionCard
        title={title}
        subheader={
          courses.length
            ? [active ? `идут: ${active}` : "", antibiotics ? `антибиотиков: ${antibiotics}` : ""].filter(Boolean).join(" · ") ||
              "Антибиотики, витамин D и другие курсы"
            : "Антибиотики, витамин D и другие курсы"
        }
        loading={query.isLoading}
        error={query.isError}
        actions={
          canManage ? (
            <AppButton variant="contained" size="small" startIcon={<AddOutlined />} onClick={() => setDrawer({ open: true, course: null })}>
              Курс
            </AppButton>
          ) : undefined
        }
        empty={
          courses.length === 0
            ? {
                icon: <MedicationOutlined />,
                title: "Курсов пока нет",
                description: "Учёт антибиотиков и профилактика рахита — как в форме 112/у.",
              }
            : null
        }
      >
        <Stack gap={1}>
          {courses.map((course) => (
            <CourseRow key={course.id} course={course} canManage={canManage} onEdit={(row) => setDrawer({ open: true, course: row })} />
          ))}
        </Stack>
      </HealthSectionCard>
      <MedicationDrawer
        open={drawer.open}
        patientId={patientId}
        course={drawer.course}
        onClose={() => setDrawer({ open: false, course: null })}
        onSuggestAllergy={(drug, reaction) => setAllergy({ category: "drug", allergen: drug, reaction, isConfirmed: true })}
      />
      <AllergyDrawer
        open={allergy != null}
        patientId={patientId}
        allergy={null}
        initial={allergy ?? undefined}
        onClose={() => setAllergy(null)}
      />
    </>
  );
};
