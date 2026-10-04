import React from "react";
import { Box, Stack, Typography, useTheme } from "@mui/material";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import { useSnackbar } from "notistack";

import { AppButton } from "../../ui";
import type { LifeAnamnesisParagraph } from "./anamnesisParagraph";
import { sunkBg } from "./anamnesisTone";
import { Caption } from "./anamnesisUi";

/** Копирование с запасным путём для старых браузеров и http. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // запасной путь ниже
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

const PREFIX = "Заключение по анамнезу";

/**
 * «Абзац для заключения» (ТЗ §4.2, п. 7): текст §3.7 с подписью «собран из
 * полей · врач правит перед вставкой» и кнопкой «Скопировать». Вставляет его
 * кнопка в окне заключения — книжка не знает, какое заключение пишет врач.
 */
export const ParagraphBlock = React.forwardRef<HTMLDivElement, { paragraph: LifeAnamnesisParagraph }>(({ paragraph }, ref) => {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();
  const copy = async () => {
    const ok = await copyText(paragraph.text);
    enqueueSnackbar(ok ? "Абзац скопирован — вставьте его в поле «Анамнез» заключения" : "Не удалось скопировать: выделите текст вручную", {
      variant: ok ? "success" : "warning",
    });
  };
  const conclusion = paragraph.conclusion.startsWith(PREFIX) ? paragraph.conclusion.slice(PREFIX.length) : paragraph.conclusion;
  return (
    <Box
      ref={ref}
      sx={{
        border: 1,
        borderColor: "divider",
        borderLeft: `3px solid ${theme.palette.primary.main}`,
        borderRadius: "10px",
        px: 1.75,
        py: 1.5,
        bgcolor: sunkBg(theme),
        display: "flex",
        flexDirection: "column",
        gap: 0.75,
        scrollMarginTop: 96,
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} flexWrap="wrap">
        <Stack direction={{ xs: "column", md: "row" }} gap={{ xs: 0, md: 1.5 }}>
          <Caption>Абзац для заключения</Caption>
          <Caption sx={{ fontWeight: 500 }}>собран из полей · врач правит перед вставкой</Caption>
        </Stack>
        <AppButton size="small" variant="outlined" startIcon={<ContentCopyOutlined />} disabled={paragraph.empty} onClick={() => void copy()}>
          Скопировать
        </AppButton>
      </Stack>
      {paragraph.empty ? (
        <Typography variant="body2" color="text.secondary">
          В медкарте нет сведений для анамнеза жизни.
        </Typography>
      ) : (
        <>
          {paragraph.body && (
            <Typography sx={{ fontSize: 13.5, lineHeight: 1.6, userSelect: "text" }}>{paragraph.body}</Typography>
          )}
          {paragraph.conclusion && (
            <Typography sx={{ fontSize: 13.5, lineHeight: 1.6, userSelect: "text" }}>
              {conclusion !== paragraph.conclusion && <b>{PREFIX}</b>}
              {conclusion}
            </Typography>
          )}
        </>
      )}
    </Box>
  );
});
ParagraphBlock.displayName = "ParagraphBlock";
