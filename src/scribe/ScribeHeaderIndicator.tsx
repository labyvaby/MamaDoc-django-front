import React from "react";
import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { useT } from "../i18n/VerticalProvider";
import { useScribeClock, useScribeRecorder } from "./ScribeRecorderProvider";

/** Красная точка «идёт запись · мм:сс» в шапке CRM — видна на любой странице. */
export const ScribeHeaderIndicator: React.FC = () => {
  const recorder = useScribeRecorder();
  const phase = recorder?.state.phase;
  if (phase !== "recording" && phase !== "paused" && phase !== "stopping") return null;
  return <IndicatorDot paused={phase === "paused"} />;
};

const IndicatorDot: React.FC<{ paused: boolean }> = ({ paused }) => {
  const { t } = useT("scribe");
  const { elapsed } = useScribeClock();
  const total = Math.floor(elapsed / 1000);
  const time = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  return (
    <Tooltip title={t("header.recording")}>
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ px: 1 }}>
        <Box
          sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: paused ? "text.disabled" : "error.main" }}
        />
        <Typography variant="caption" fontWeight={600}>
          {time}
        </Typography>
      </Stack>
    </Tooltip>
  );
};
