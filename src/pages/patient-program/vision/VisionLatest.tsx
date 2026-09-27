import React from "react";
import { Alert, Box, Button, Chip, Stack, Typography, alpha } from "@mui/material";
import EventOutlined from "@mui/icons-material/EventOutlined";
import TipsAndUpdatesOutlined from "@mui/icons-material/TipsAndUpdatesOutlined";
import dayjs from "dayjs";

import type { ProgramModuleRecord } from "../../../api/programs";
import { EyeCard } from "./EyeCard";
import { CONCLUSIONS, CORRECTIONS, optionLabel } from "./visionCatalog";
import type { VisionExam } from "./visionData";
import { acuityNorm, acuityStatus, ageInMonths, parseAcuity } from "./visionNorms";
import { acuityTrend, type VisionSignal } from "./visionSignals";
import { pairGridSx, signalText } from "./visionUi";

/** «Следующий осмотр — дата» и «Провести». */
export const NextCheckLine: React.FC<{
  planned: ProgramModuleRecord;
  canManage: boolean;
  onConduct: (record: ProgramModuleRecord) => void;
}> = ({ planned, canManage, onConduct }) => (
  <Stack
    direction="row"
    gap={1}
    alignItems="center"
    sx={(theme) => ({ px: 1.5, py: 1, borderRadius: "12px", bgcolor: alpha(theme.palette.info.main, 0.08) })}
  >
    <EventOutlined fontSize="small" color="info" />
    <Typography variant="body2" sx={{ flex: 1 }}>
      Следующий осмотр — {dayjs(planned.occurredAt).format("DD.MM.YYYY")}
    </Typography>
    {canManage && (
      <Button size="small" onClick={() => onConduct(planned)} sx={{ textTransform: "none" }}>
        Провести
      </Button>
    )}
  </Stack>
);

interface VisionLatestProps {
  latest: VisionExam;
  /** Прежние осмотры, от новых к старым. */
  previous: VisionExam[];
  birthDate: string | null;
  signals: VisionSignal[];
  nextPlanned: ProgramModuleRecord | null;
  canManage: boolean;
  onConduct: (record: ProgramModuleRecord) => void;
}

/** Последний осмотр: два глаза, сигналы, заключение, рекомендации, следующий осмотр. */
export const VisionLatest: React.FC<VisionLatestProps> = ({
  latest,
  previous,
  birthDate,
  signals,
  nextPlanned,
  canManage,
  onConduct,
}) => {
  const norm = acuityNorm(ageInMonths(birthDate, latest.record.occurredAt));
  const eye = (side: "OD" | "OS") => {
    const read = (exam: VisionExam) => (side === "OD" ? exam.acuityRight : exam.acuityLeft);
    const raw = read(latest);
    const value = parseAcuity(raw);
    const before = previous.find((exam) => parseAcuity(read(exam)) != null);
    const previousRaw = before ? read(before) : null;
    return (
      <EyeCard
        side={side}
        raw={raw}
        status={acuityStatus(value, norm)}
        norm={norm}
        corrected={side === "OD" ? latest.acuityRightCorrected : latest.acuityLeftCorrected}
        previous={previousRaw}
        trend={acuityTrend(value, previousRaw == null ? null : parseAcuity(previousRaw))}
        refraction={(side === "OD" ? latest.refraction?.right : latest.refraction?.left) ?? null}
      />
    );
  };
  return (
    <Stack gap={1.5}>
      <Box sx={pairGridSx}>
        {eye("OD")}
        {eye("OS")}
      </Box>
      {signals.map((signal) => {
        const { severity, text } = signalText(signal);
        return (
          <Alert key={`${signal.kind}-${"eye" in signal ? signal.eye : ""}`} severity={severity} sx={{ borderRadius: "12px" }}>
            {text}
          </Alert>
        );
      })}
      {(latest.conclusions.length > 0 || (latest.correction && latest.correction !== "none")) && (
        <Stack direction="row" gap={0.75} flexWrap="wrap">
          {latest.conclusions.map((code) => (
            <Chip
              key={code}
              size="small"
              label={optionLabel(CONCLUSIONS, code)}
              color={code === "normal" ? "success" : "default"}
              sx={{ borderRadius: "8px", fontWeight: 600 }}
            />
          ))}
          {latest.correction && latest.correction !== "none" && (
            <Chip size="small" variant="outlined" label={optionLabel(CORRECTIONS, latest.correction)} sx={{ borderRadius: "8px" }} />
          )}
        </Stack>
      )}
      {latest.recommendation && (
        <Stack direction="row" gap={1} alignItems="flex-start">
          <TipsAndUpdatesOutlined fontSize="small" color="action" sx={{ mt: 0.25 }} />
          <Typography variant="body2">{latest.recommendation}</Typography>
        </Stack>
      )}
      {nextPlanned && <NextCheckLine planned={nextPlanned} canManage={canManage} onConduct={onConduct} />}
    </Stack>
  );
};
