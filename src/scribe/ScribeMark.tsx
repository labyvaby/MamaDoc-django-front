import React from "react";
import { Button, Chip, Stack } from "@mui/material";
import { useT } from "../i18n/VerticalProvider";

/** Метка у поля, вписанного ИИ: пропадает при правке поля или по «Верно». */
export const ScribeMark: React.FC<{ onOk: () => void }> = ({ onOk }) => {
  const { t } = useT("scribe");
  return (
    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
      <Chip size="small" color="secondary" variant="outlined" label={t("mark.label")} />
      <Button size="small" onClick={onOk} sx={{ minWidth: 0, px: 1 }}>
        {t("mark.ok")}
      </Button>
    </Stack>
  );
};
