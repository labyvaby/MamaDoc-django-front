import React from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import BabyChangingStationOutlined from "@mui/icons-material/BabyChangingStationOutlined";
import ChildFriendlyOutlined from "@mui/icons-material/ChildFriendlyOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import LocalHospitalOutlined from "@mui/icons-material/LocalHospitalOutlined";
import MailOutlineOutlined from "@mui/icons-material/MailOutlineOutlined";
import MonitorWeightOutlined from "@mui/icons-material/MonitorWeightOutlined";
import RestaurantOutlined from "@mui/icons-material/RestaurantOutlined";
import ScheduleOutlined from "@mui/icons-material/ScheduleOutlined";

import { AppButton, InfoTile } from "../ui";
import { buildAnamnesisModel } from "./anamnesis/anamnesisModel";
import { NewbornTab } from "./anamnesis/NewbornTab";
import { useAnamnesisInput } from "./anamnesis/useAnamnesis";
import { HealthProfileDrawer } from "./HealthProfileDrawer";
import { HealthSectionCard } from "./HealthSectionCard";
import {
  DELIVERY_TYPES,
  ageLabel,
  birthSummary,
  dayOfLife,
  formatDate,
  gestationLabel,
  isPremature,
  optionLabel,
} from "./healthMeta";
import { usePatientHealth } from "./useHealth";

interface BirthHistorySectionProps {
  patientId: number;
  birthDate: string | null;
  canManage: boolean;
  title?: string;
}

const withDay = (date: string | null, birthDate: string | null): string => {
  if (!date) return "не указано";
  const day = dayOfLife(birthDate, date);
  return day ? `${formatDate(date)} · ${day}-й день жизни` : formatDate(date);
};

/** «Сведения о новорождённом» формы 112/у: роддом, выписка, рождение, прикорм. */
export const BirthHistorySection: React.FC<BirthHistorySectionProps> = ({
  patientId,
  birthDate,
  canManage,
  title = "Сведения о новорождённом",
}) => {
  const summary = usePatientHealth(patientId);
  const [editing, setEditing] = React.useState(false);
  // Тот же блок «Новорождённый», что в «Анамнезе жизни», — только чтение (ТЗ анамнеза §4.3).
  const anamnesis = useAnamnesisInput(patientId);
  const anamnesisInput = anamnesis.input;
  const canSeeVaccinations = anamnesis.access.canSeeVaccinations;
  const newbornModel = React.useMemo(
    () =>
      anamnesisInput?.perinatal?.exists
        ? buildAnamnesisModel(anamnesisInput, anamnesis.at, { canSeeSensitive: false, canSeeVaccinations })
        : null,
    [anamnesisInput, anamnesis.at, canSeeVaccinations],
  );
  const profile = summary.data?.profile;
  // Вес, длина и голова без срока гестации — он своей плиткой.
  const measures = profile ? birthSummary({ ...profile, gestationalAgeWeeks: null }) : "";
  const apgar =
    profile && (profile.apgar1min != null || profile.apgar5min != null)
      ? `${profile.apgar1min ?? "—"} / ${profile.apgar5min ?? "—"}`
      : "";

  return (
    <>
      <HealthSectionCard
        title={title}
        subheader={birthDate ? `Родился ${formatDate(birthDate)}` : "Дата рождения в карточке не указана"}
        loading={summary.isLoading}
        error={summary.isError}
        actions={
          canManage ? (
            <AppButton variant="outlined" size="small" startIcon={<EditOutlined />} onClick={() => setEditing(true)}>
              Заполнить
            </AppButton>
          ) : undefined
        }
      >
        {profile && (
          <Stack gap={1.5}>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" }, gap: 1 }}>
              <InfoTile
                icon={<LocalHospitalOutlined fontSize="small" />}
                label="Роддом"
                value={profile.maternityHospital || "не указан"}
                active={Boolean(profile.maternityHospital)}
                wrapValue
              />
              <InfoTile
                icon={<BabyChangingStationOutlined fontSize="small" />}
                label="Выписан"
                value={withDay(profile.maternityDischargedOn, birthDate)}
                active={Boolean(profile.maternityDischargedOn)}
              />
              <InfoTile
                icon={<MailOutlineOutlined fontSize="small" />}
                label="Извещение о новорождённом"
                value={withDay(profile.birthNoticeReceivedOn, birthDate)}
                active={Boolean(profile.birthNoticeReceivedOn)}
              />
              <InfoTile
                icon={<ScheduleOutlined fontSize="small" />}
                label="Срок гестации"
                value={gestationLabel(profile.gestationalAgeWeeks, profile.gestationalAgeDays) || "не указан"}
                active={profile.gestationalAgeWeeks != null}
              />
              <InfoTile
                icon={<MonitorWeightOutlined fontSize="small" />}
                label="При рождении"
                value={[measures, apgar ? `Апгар ${apgar}` : ""].filter(Boolean).join(" · ") || "не указано"}
                active={profile.birthWeightG != null}
                wrapValue
              />
              <InfoTile
                icon={<RestaurantOutlined fontSize="small" />}
                label="Первый прикорм"
                value={
                  profile.complementaryFeedingOn
                    ? `${formatDate(profile.complementaryFeedingOn)}${birthDate ? ` · в ${ageLabel(birthDate, profile.complementaryFeedingOn)}` : ""}`
                    : "не указан"
                }
                active={Boolean(profile.complementaryFeedingOn)}
              />
            </Box>
            <Stack direction="row" gap={0.75} flexWrap="wrap">
              {isPremature(profile.gestationalAgeWeeks) && (
                <Chip size="small" color="warning" icon={<ChildFriendlyOutlined />} label="Недоношенный: рост оценивается по скорректированному возрасту" />
              )}
              {profile.deliveryType && <Chip size="small" variant="outlined" label={optionLabel(DELIVERY_TYPES, profile.deliveryType)} />}
            </Stack>
            {profile.perinatalNotes && (
              <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                {profile.perinatalNotes}
              </Typography>
            )}
            {newbornModel && <NewbornTab model={newbornModel} />}
          </Stack>
        )}
      </HealthSectionCard>
      {profile && editing && (
        <HealthProfileDrawer
          open
          patientId={patientId}
          birthDate={birthDate}
          profile={profile}
          parts={["birth", "maternity"]}
          title="Сведения о новорождённом"
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
};
