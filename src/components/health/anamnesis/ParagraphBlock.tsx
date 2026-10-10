import React from "react";
import { Box, Stack, Typography, useTheme } from "@mui/material";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import { useSnackbar } from "notistack";

import { AppButton, InfoHint } from "../../ui";
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
/** Свёрнутый абзац — три строки. */
const LINES = 3;

interface ParagraphBlockProps {
  paragraph: LifeAnamnesisParagraph;
  /** Текст раскрыт целиком; держит раздел — кнопка «Абзац для заключения» в шапке раскрывает его. */
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}

/**
 * «Абзац для заключения» (ТЗ §4.2, п. 7): текст §3.7 (свёрнут до трёх строк)
 * и кнопка «Скопировать». Вставляет его кнопка в окне заключения — книжка не
 * знает, какое заключение пишет врач.
 */
export const ParagraphBlock = React.forwardRef<HTMLDivElement, ParagraphBlockProps>(({ paragraph, expanded, onExpandedChange }, ref) => {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();
  const bodyRef = React.useRef<HTMLParagraphElement>(null);
  // Обрезан ли текст — по факту, а не по числу знаков: ширина карточки разная.
  const [clamped, setClamped] = React.useState(false);
  React.useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => {
      if (!expanded) {
        setClamped(el.scrollHeight > el.clientHeight + 1);
        return;
      }
      const line = parseFloat(window.getComputedStyle(el).lineHeight);
      if (Number.isFinite(line)) setClamped(el.scrollHeight > line * LINES + 1);
    };
    measure();
    // Шрифт догружается позже: высота свёрнутых трёх строк та же, а текст уже не влезает.
    let alive = true;
    void document.fonts?.ready.then(() => {
      if (alive) measure();
    });
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => {
        alive = false;
        window.removeEventListener("resize", measure);
      };
    }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [paragraph.body, expanded]);
  const copy = async () => {
    // Копируется весь текст — пусть врач видит его целиком.
    if (!expanded && clamped) onExpandedChange(true);
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
        <Caption>
          Абзац для заключения
          <InfoHint text="Собран из полей медкарты. Врач правит текст перед вставкой в заключение." />
        </Caption>
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
            <Typography
              ref={bodyRef}
              sx={{
                fontSize: 13.5,
                lineHeight: 1.6,
                userSelect: "text",
                ...(!expanded && { display: "-webkit-box", WebkitLineClamp: LINES, WebkitBoxOrient: "vertical", overflow: "hidden" }),
              }}
            >
              {paragraph.body}
            </Typography>
          )}
          {paragraph.body && clamped && (
            <AppButton size="small" variant="text" onClick={() => onExpandedChange(!expanded)} sx={{ alignSelf: "flex-start" }}>
              {expanded ? "Свернуть" : "Показать полностью"}
            </AppButton>
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
