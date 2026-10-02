import React from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import BloodtypeOutlined from "@mui/icons-material/BloodtypeOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import FavoriteBorderOutlined from "@mui/icons-material/FavoriteBorderOutlined";
import SportsGymnasticsOutlined from "@mui/icons-material/SportsGymnasticsOutlined";

import { AppButton, InfoTile } from "../ui";
import { HealthProfileDrawer } from "./HealthProfileDrawer";
import type { ProfilePart } from "./healthForms";
import { HealthSectionCard } from "./HealthSectionCard";
import { PE_GROUPS, RISK_GROUPS, bloodLabel, formatDate, healthGroupLabel, optionLabel } from "./healthMeta";
import { usePatientHealth } from "./useHealth";

interface HealthProfileCardProps {
  patientId: number;
  birthDate: string | null;
  canManage: boolean;
}

/** Группа здоровья и физкультуры, группы риска, кровь — с правкой по частям. */
export const HealthProfileCard: React.FC<HealthProfileCardProps> = ({ patientId, birthDate, canManage }) => {
  const summary = usePatientHealth(patientId);
  const [editing, setEditing] = React.useState<ReadonlyArray<ProfilePart> | null>(null);
  const profile = summary.data?.profile;

  return (
    <>
      <HealthSectionCard
        title="Профиль здоровья"
        subheader={
          profile?.updatedAt
            ? `Изменён ${formatDate(profile.updatedAt)}${profile.updatedBy ? ` · ${profile.updatedBy.fullName}` : ""}`
            : "Группы здоровья, риска и кровь"
        }
        loading={summary.isLoading}
        error={summary.isError}
        actions={
          canManage ? (
            <AppButton variant="outlined" size="small" startIcon={<EditOutlined />} onClick={() => setEditing(["groups", "blood"])}>
              Изменить
            </AppButton>
          ) : undefined
        }
      >
        {profile && (
          <Stack gap={1.5}>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" }, gap: 1 }}>
              <InfoTile
                icon={<FavoriteBorderOutlined fontSize="small" />}
                label="Группа здоровья"
                value={
                  profile.healthGroup
                    ? `${healthGroupLabel(profile.healthGroup)}${profile.healthGroupSetOn ? ` · с ${formatDate(profile.healthGroupSetOn)}` : ""}`
                    : "не указана"
                }
                active={Boolean(profile.healthGroup)}
              />
              <InfoTile
                icon={<SportsGymnasticsOutlined fontSize="small" />}
                label="Физкультура"
                value={profile.peGroup ? optionLabel(PE_GROUPS, profile.peGroup) : "не указана"}
                active={Boolean(profile.peGroup)}
              />
              <InfoTile
                icon={<BloodtypeOutlined fontSize="small" />}
                label="Группа крови"
                value={bloodLabel(profile)}
                active={Boolean(profile.bloodGroup)}
              />
            </Box>
            {profile.riskGroups.length > 0 && (
              <Stack direction="row" gap={0.75} flexWrap="wrap" alignItems="center">
                <Typography variant="caption" color="text.secondary">
                  Группы риска:
                </Typography>
                {profile.riskGroups.map((group) => (
                  <Chip key={group} size="small" color="warning" variant="outlined" label={optionLabel(RISK_GROUPS, group)} />
                ))}
              </Stack>
            )}
          </Stack>
        )}
      </HealthSectionCard>
      {profile && editing && (
        <HealthProfileDrawer
          open
          patientId={patientId}
          birthDate={birthDate}
          profile={profile}
          parts={editing}
          title="Профиль здоровья"
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
};
