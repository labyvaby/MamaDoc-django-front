import React from "react";
import { Box, ButtonBase, Chip, Stack, Typography } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import FamilyRestroomOutlined from "@mui/icons-material/FamilyRestroomOutlined";
import PersonOutlined from "@mui/icons-material/PersonOutlined";
import dayjs from "dayjs";
import { useQuery } from "@tanstack/react-query";

import { getFamily, getFamilySuggestions, type FamilyMember, type FamilySuggestion } from "../../api/health";
import { DJANGO_LIST_STALE_TIME_MS, djangoQueryKeys } from "../../api/queryKeys";
import { subtleBg } from "../../theme/uiHelpers";
import { AppButton } from "../ui";
import { FamilyMemberDrawer } from "./FamilyMemberDrawer";
import { HealthSectionCard } from "./HealthSectionCard";
import { relationTitle } from "./anamnesis/anamnesisTypes";
import { FAMILY_RELATIONS, fluorographyOverdue, formatDate, optionLabel } from "./healthMeta";
import { useHealthScope } from "./useHealth";

const MemberRow: React.FC<{ member: FamilyMember; canManage: boolean; onEdit: (member: FamilyMember) => void }> = ({
  member,
  canManage,
  onEdit,
}) => {
  const death =
    member.vitalStatus === "deceased"
      ? `${member.sex === "female" ? "умерла" : "умер"}${member.deathAge != null ? ` в ${member.deathAge} г.` : member.deathYear != null ? ` в ${member.deathYear}` : ""}`
      : "";
  const health = [
    member.healthStatus === "ill" && member.diseases.length
      ? member.diseases.map((disease) => disease.title).join(", ")
      : member.healthStatus === "healthy"
        ? member.sex === "female"
          ? "Здорова"
          : "Здоров"
        : member.healthStatus === "ill"
          ? "Есть болезни — список не указан"
          : "",
    death,
  ]
    .filter(Boolean)
    .join(" · ");
  const exams = [
    member.therapistExamOn ? `терапевт ${formatDate(member.therapistExamOn)}` : "",
    member.gynecologistExamOn ? `гинеколог ${formatDate(member.gynecologistExamOn)}` : "",
  ].filter(Boolean);
  const content = (
    <Stack
      direction="row"
      gap={1.25}
      alignItems="flex-start"
      sx={(theme) => ({ width: "100%", textAlign: "left", p: 1.5, borderRadius: "12px", bgcolor: subtleBg(theme) })}
    >
      <PersonOutlined fontSize="small" color={member.relative ? "primary" : "action"} sx={{ mt: 0.25 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" gap={0.75} alignItems="center" flexWrap="wrap">
          <Typography variant="caption" color="text.secondary" fontWeight={700}>
            {relationTitle(member)}
          </Typography>
          <Typography variant="body2" fontWeight={700}>
            {member.fullName}
          </Typography>
          {member.birthDate && (
            <Typography variant="caption" color="text.secondary">
              {dayjs(member.birthDate).format("YYYY")} г. р.
            </Typography>
          )}
        </Stack>
        <Typography variant="body2" color={health ? "text.primary" : "text.secondary"}>
          {health || "Здоровье не указано"}
        </Typography>
        {member.conditions && (
          <Typography variant="caption" color="text.secondary" component="div">
            Записано текстом: {member.conditions}
          </Typography>
        )}
        <Stack direction="row" gap={0.75} alignItems="center" flexWrap="wrap" sx={{ mt: 0.5 }}>
          {exams.length > 0 && (
            <Typography variant="caption" color="text.secondary">
              {exams.join(" · ")}
            </Typography>
          )}
          {member.fluorographyOn && (
            <Chip
              size="small"
              variant="outlined"
              color={fluorographyOverdue(member.fluorographyOn) ? "warning" : "default"}
              label={`флюорография ${formatDate(member.fluorographyOn)}`}
              sx={{ height: 20 }}
            />
          )}
        </Stack>
      </Box>
    </Stack>
  );
  return canManage ? (
    <ButtonBase onClick={() => onEdit(member)} sx={{ display: "block", width: "100%", borderRadius: "12px" }}>
      {content}
    </ButtonBase>
  ) : (
    content
  );
};

interface FamilySectionProps {
  patientId: number;
  canManage: boolean;
  title?: string;
}

/** «Паспорт семьи» 112/у: члены семьи, их болезни и диспансеризация семьи. */
export const FamilySection: React.FC<FamilySectionProps> = ({ patientId, canManage, title = "Паспорт семьи" }) => {
  const { orgId, scope, ready } = useHealthScope();
  const [drawer, setDrawer] = React.useState<{
    open: boolean;
    member: FamilyMember | null;
    suggestion: FamilySuggestion | null;
  }>({ open: false, member: null, suggestion: null });

  const family = useQuery({
    queryKey: djangoQueryKeys.health.family(patientId, orgId),
    queryFn: ({ signal }) => getFamily(scope, patientId, signal),
    enabled: ready,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });
  const suggestions = useQuery({
    queryKey: djangoQueryKeys.health.familySuggestions(patientId, orgId),
    queryFn: ({ signal }) => getFamilySuggestions(scope, patientId, signal),
    enabled: ready && canManage,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });

  const members = family.data ?? [];
  const offered = suggestions.data ?? [];
  const open = (member: FamilyMember | null, suggestion: FamilySuggestion | null = null) =>
    setDrawer({ open: true, member, suggestion });

  return (
    <>
      <HealthSectionCard
        title={title}
        subheader="Члены семьи, их заболевания и диспансеризация семьи"
        loading={family.isLoading}
        error={family.isError}
        actions={
          canManage ? (
            <AppButton variant="contained" size="small" startIcon={<AddOutlined />} onClick={() => open(null)}>
              Член семьи
            </AppButton>
          ) : undefined
        }
        empty={
          members.length === 0 && offered.length === 0
            ? {
                icon: <FamilyRestroomOutlined />,
                title: "Паспорт семьи пуст",
                description: "Мама, папа, братья и сёстры — с их заболеваниями и осмотрами.",
              }
            : null
        }
      >
        <Stack gap={1}>
          {members.map((member) => (
            <MemberRow key={member.id} member={member} canManage={canManage} onEdit={(row) => open(row)} />
          ))}
          {canManage && offered.length > 0 && (
            <Stack direction="row" gap={0.75} flexWrap="wrap" alignItems="center">
              <Typography variant="caption" color="text.secondary">
                Добавить из карточек:
              </Typography>
              {offered.map((item) => (
                <Chip
                  key={item.relative.id}
                  size="small"
                  icon={<AddOutlined />}
                  clickable
                  variant="outlined"
                  color="primary"
                  label={`${optionLabel(FAMILY_RELATIONS, item.relation)}: ${item.relative.fullName}`}
                  onClick={() => open(null, item)}
                />
              ))}
            </Stack>
          )}
        </Stack>
      </HealthSectionCard>
      <FamilyMemberDrawer
        open={drawer.open}
        patientId={patientId}
        member={drawer.member}
        suggestion={drawer.suggestion}
        suggestions={offered}
        onClose={() => setDrawer({ open: false, member: null, suggestion: null })}
      />
    </>
  );
};
