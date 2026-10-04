import React from "react";
import { Box, ButtonBase, Stack, Typography } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import dayjs from "dayjs";

import type { NeonatalScreening } from "../../../api/health";
import { AppButton } from "../../ui";
import type { AnamnesisActions, AnamnesisModel } from "./anamnesisModel";
import { orDash } from "./anamnesisTone";
import { FIRST_CRY, HEARING_METHODS, HEARING_STAGES, JAUNDICE, NEONATAL_TRANSFER, SCREENING_RESULTS, type AnamnesisInput, type Option } from "./anamnesisTypes";
import { Fact, Panel } from "./anamnesisUi";
import { maternityVaccines } from "./anamnesisParagraph";
import { earWord } from "./anamnesisView";
import { dateText, decimal, ordinalDays } from "./russian";

const label = <T extends string>(options: ReadonlyArray<Option<T>>, value: T | ""): string =>
  options.find((option) => option.value === value)?.label ?? "";

/** Числа рождения крупно: масса, длина, голова, грудь, Апгар. */
const BirthNumbers: React.FC<{ input: AnamnesisInput }> = ({ input }) => {
  const profile = input.profile;
  const p = input.perinatal;
  const apgar = [profile?.apgar1min, profile?.apgar5min, p?.apgar10min].filter((value) => value != null);
  const items = [
    { value: profile?.birthWeightG != null ? String(profile.birthWeightG) : "—", label: "масса, г" },
    { value: profile?.birthLengthCm != null ? decimal(profile.birthLengthCm) : "—", label: "длина, см" },
    { value: profile?.birthHeadCircumferenceCm != null ? decimal(profile.birthHeadCircumferenceCm) : "—", label: "голова, см" },
    { value: p?.birthChestCircumferenceCm != null ? decimal(p.birthChestCircumferenceCm) : "—", label: "грудь, см" },
    { value: apgar.length ? apgar.join("/") : "—", label: "Апгар" },
  ];
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(3, minmax(0, 1fr))", md: "repeat(5, minmax(0, 1fr))" }, gap: 1 }}>
      {items.map((item) => (
        <Box key={item.label} sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 22, fontWeight: 600, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{item.value}</Typography>
          <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>{item.label}</Typography>
        </Box>
      ))}
    </Box>
  );
};

const ScreeningRows: React.FC<{ rows: NeonatalScreening[]; sex: AnamnesisInput["sex"]; onOpen?: (row: NeonatalScreening) => void }> = ({ rows, sex, onOpen }) => {
  const sorted = [...rows].sort((a, b) => (a.performedOn ?? a.createdAt).localeCompare(b.performedOn ?? b.createdAt));
  const ear = (value: string) => earWord(value, sex);
  return (
    <Box sx={{ display: "grid", gap: 0.5 }}>
      <Box
        sx={{
          display: { xs: "none", md: "grid" },
          gridTemplateColumns: "110px 120px minmax(0, 1fr) minmax(0, 1.4fr)",
          gap: 1,
          px: 1.25,
          color: "text.secondary",
          fontSize: 12,
        }}
      >
        <span>Дата</span>
        <span>Вид</span>
        <span>Этап, метод</span>
        <span>Результат</span>
      </Box>
      {sorted.map((row) => {
        const content = (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "110px 120px minmax(0, 1fr) minmax(0, 1.4fr)" },
              gap: { xs: 0.25, md: 1 },
              px: 1.25,
              py: 0.75,
              border: 1,
              borderColor: "divider",
              borderRadius: "10px",
              width: "100%",
              textAlign: "left",
              fontSize: 13.5,
            }}
          >
            <span>{row.performedOn ? dateText(row.performedOn) : "без даты"}</span>
            <span>{row.kind === "neonatal" ? "Неонатальный" : "Слух"}</span>
            <span>
              {row.kind === "hearing" ? [label(HEARING_STAGES, row.stage), label(HEARING_METHODS, row.method)].filter(Boolean).join(", ") || "—" : row.program || "—"}
            </span>
            <span>
              {row.kind === "neonatal"
                ? orDash(label(SCREENING_RESULTS, row.result).toLowerCase())
                : `справа: ${ear(row.rightEar)}, слева: ${ear(row.leftEar)}`}
              {row.reason ? ` · ${row.reason}` : ""}
            </span>
          </Box>
        );
        return onOpen ? (
          <ButtonBase key={row.id} onClick={() => onOpen(row)} sx={{ borderRadius: "10px", display: "block" }}>
            {content}
          </ButtonBase>
        ) : (
          <Box key={row.id}>{content}</Box>
        );
      })}
    </Box>
  );
};

/** Вкладка «Новорождённый» (ТЗ §4.3); без `actions` — тот же блок только для чтения («Сведения о новорождённом»). */
export const NewbornTab: React.FC<{ model: AnamnesisModel; actions?: AnamnesisActions }> = ({ model, actions }) => {
  const input = model.input;
  const p = input.perinatal;
  const profile = input.profile;
  const canManage = actions?.canManage ?? false;
  const birth = input.birthDate;
  const dischargeDay = profile?.maternityDischargedOn && birth ? dayjs(profile.maternityDischargedOn).diff(dayjs(birth), "day") + 1 : null;
  const loss =
    profile?.birthWeightG != null && p?.dischargeWeightG != null && profile.birthWeightG > 0
      ? ((profile.birthWeightG - p.dischargeWeightG) / profile.birthWeightG) * 100
      : null;
  const jaundice = p?.jaundice
    ? [
        label(JAUNDICE, p.jaundice).toLowerCase(),
        p.jaundiceFirstDay === true ? "с первых суток" : "",
        p.jaundiceUntilDay != null ? `до ${p.jaundiceUntilDay}-х суток` : "",
        p.maxBilirubinUmol != null ? `билирубин до ${p.maxBilirubinUmol} мкмоль/л` : "",
        p.phototherapy === true ? "фототерапия" : "",
      ]
        .filter(Boolean)
        .join(", ")
    : "";
  const vaccines = input.vaccinations ? maternityVaccines(input) : null;
  const records = input.vaccinations?.records.filter(
    (record) => profile?.maternityDischargedOn && !dayjs(record.administeredAt).isAfter(dayjs(profile.maternityDischargedOn), "day"),
  );
  return (
    <Stack gap={2}>
      <Panel
        title={input.sex === "female" ? "Новорождённая" : "Новорождённый"}
        caption={profile?.maternityHospital || undefined}
        action={
          canManage ? (
            <AppButton size="small" startIcon={<EditOutlined />} onClick={actions?.openNewborn}>
              Изменить
            </AppButton>
          ) : undefined
        }
      >
        <BirthNumbers input={input} />
        <Box>
          <Fact label={input.sex === "female" ? "Закричала" : input.sex === "male" ? "Закричал" : "Закричал(а)"} value={orDash(p ? label(FIRST_CRY, p.firstCry).toLowerCase() : "")} />
          <Fact label="Реанимация" value={orDash(p?.resuscitation === true ? `да${p.resuscitationNote ? `: ${p.resuscitationNote}` : ""}` : p?.resuscitation === false ? "нет" : "")} tone={p?.resuscitation ? "bad" : undefined} />
          <Fact label="К груди" value={orDash(p?.firstLatchHours != null ? (p.firstLatchHours === 0 ? "сразу после рождения" : `через ${decimal(p.firstLatchHours)} ч`) : "")} />
          <Fact label="Желтуха" value={orDash(jaundice)} tone={p?.jaundice === "pathological" ? "bad" : p?.jaundice === "prolonged" ? "warn" : undefined} />
          <Fact
            label="Выписка"
            value={orDash(profile?.maternityDischargedOn ? `${dateText(profile.maternityDischargedOn)}${dischargeDay && dischargeDay > 0 ? `, на ${ordinalDays(dischargeDay)} сутки` : ""}` : "")}
          />
          <Fact
            label="Масса при выписке"
            value={orDash(p?.dischargeWeightG != null ? `${p.dischargeWeightG} г${loss != null ? `, убыль ${decimal(loss)} %` : ""}` : "")}
            tone={loss != null && loss > 8 ? "warn" : undefined}
          />
          <Fact label="Перевод" value={orDash(p ? label(NEONATAL_TRANSFER, p.neonatalTransfer).toLowerCase() : "")} />
          <Fact label="Диагноз при выписке" value={orDash(p?.dischargeDiagnosis)} />
          <Fact label="Особенности периода" value={orDash(profile?.perinatalNotes)} />
          {vaccines && (
            <Fact
              label="Прививки в роддоме"
              value={orDash(records?.map((record) => `${record.vaccineName} — ${dateText(record.administeredAt)}`).join(", "))}
            />
          )}
        </Box>
      </Panel>
      <Panel
        title="Скрининги"
        action={
          canManage ? (
            <AppButton size="small" startIcon={<AddOutlined />} onClick={() => actions?.openScreening(null)}>
              Скрининг
            </AppButton>
          ) : undefined
        }
      >
        {input.screenings.length ? (
          <ScreeningRows rows={input.screenings} sex={input.sex} onOpen={canManage ? (row) => actions?.openScreening(row) : undefined} />
        ) : (
          <Typography variant="body2" color="text.secondary">
            Неонатальный и аудиологический скрининги не внесены.
          </Typography>
        )}
      </Panel>
    </Stack>
  );
};
