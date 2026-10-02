/**
 * Распознавание паспорта — «пыль в глаза» по просьбе руководителя, по мотивам
 * сканера из «Новой накладной» (ReceiptFormDialog): снимок в тёмном «экране»
 * сканера — сетка, луч, рамка видоискателя, точки, которые «находит» модель,
 * бегущая строка машиночитаемой зоны, — а рядом этапы с галочками и процент.
 *
 * Честность: сервер отвечает одним куском и прогресса не сообщает (см.
 * useDocumentScan), поэтому этапы — подсказка по порядку, привязанная к
 * имитируемому проценту: идут только вперёд и держат последний, пока ответа
 * нет. Точки и строка — декорация, не настоящие найденные поля. Итог («Готово»
 * или «Не получилось») показывается по реальному ответу.
 */
import React from "react";
import { Box, Button, CircularProgress, LinearProgress, Stack, Typography } from "@mui/material";
import { alpha, keyframes, useTheme } from "@mui/material/styles";
import AutoAwesomeRounded from "@mui/icons-material/AutoAwesomeRounded";
import CheckRounded from "@mui/icons-material/CheckRounded";
import WarningAmberRounded from "@mui/icons-material/WarningAmberRounded";
import PictureAsPdfOutlined from "@mui/icons-material/PictureAsPdfOutlined";

import type { DocumentScanOutcome } from "./useDocumentScan";

/** Свой цвет «экрана» сканера, не акцент темы: на тёмном стекле он должен светиться при любом акценте. */
const SCAN = "#3EE6C1";
const SCAN_2 = "#5AB8FF";
const OK = "#4ADE80";
const BAD = "#FBBF24";
const MONO = '"JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace';

/** Этап — с какого процента начинается. Тайминги — по обычному снимку (3–8 с). */
const STAGES: { label: string; from: number }[] = [
  { label: "Загружаем снимок", from: 0 },
  { label: "Выравниваем документ, убираем блики", from: 12 },
  { label: "Находим фото и поля документа", from: 26 },
  { label: "Читаем ФИО, даты и номер", from: 40 },
  { label: "Сверяем машиночитаемую зону", from: 54 },
  { label: "Заполняем анкету гостя", from: 70 },
];

const scanStageAt = (progress: number): number => STAGES.reduce((stage, s, i) => (progress >= s.from ? i : stage), 0);

/** Точки, которые «находит» модель (% от ширины и высоты снимка) — появляются по мере процента. */
const POINTS: [number, number][] = [
  [14, 30], [22, 52], [17, 68], [40, 24], [58, 26], [76, 23], [44, 38], [66, 40],
  [84, 39], [42, 53], [61, 55], [80, 57], [12, 86], [36, 88], [60, 86], [86, 88],
];

const beamSweep = keyframes`
  0% { transform: translateY(0%); }
  100% { transform: translateY(100%); }
`;
const gridDrift = keyframes`
  from { background-position: 0 0, 0 0; }
  to { background-position: 0 20px, 20px 0; }
`;
const bracketPulse = keyframes`
  0%, 100% { transform: scale(1); opacity: .95; }
  50% { transform: scale(.955); opacity: .6; }
`;
const pointIn = keyframes`
  from { transform: translate(-50%, -50%) scale(0); opacity: 0; }
  to { transform: translate(-50%, -50%) scale(1); opacity: 1; }
`;
const ripple = keyframes`
  from { transform: scale(1); opacity: .75; }
  to { transform: scale(3.4); opacity: 0; }
`;
const blink = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: .25; }
`;
const flash = keyframes`
  0% { opacity: 0; }
  25% { opacity: .45; }
  100% { opacity: 0; }
`;
const popIn = keyframes`
  0% { transform: scale(.4); opacity: 0; }
  60% { transform: scale(1.12); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
`;
const breathe = keyframes`
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 ${alpha(SCAN, 0.35)}; }
  50% { transform: scale(1.06); box-shadow: 0 0 0 8px ${alpha(SCAN, 0)}; }
`;

const MRZ_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<<<<<<<<<<";
const MRZ_LEN = 30;
const randomChar = () => MRZ_CHARS[Math.floor(Math.random() * MRZ_CHARS.length)];

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Две строки «машиночитаемой зоны»: символы перебираются и по мере процента «застывают». Декорация. */
const MrzTicker: React.FC<{ progress: number; outcome: DocumentScanOutcome | null }> = ({ progress, outcome }) => {
  const settledRef = React.useRef<string[]>(Array.from({ length: MRZ_LEN * 2 }, randomChar));
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    if (outcome || prefersReducedMotion()) return undefined;
    const timer = window.setInterval(() => setTick((t) => t + 1), 75);
    return () => window.clearInterval(timer);
  }, [outcome]);
  const settled = outcome === "success" ? MRZ_LEN * 2 : Math.floor((Math.min(progress, 97) / 100) * MRZ_LEN * 2);
  const line = (row: number) =>
    Array.from({ length: MRZ_LEN }, (_, i) => {
      const idx = row * MRZ_LEN + i;
      const locked = idx < settled;
      return (
        <Box key={`${i}-${locked ? "l" : tick}`} component="span" sx={{ opacity: locked ? 1 : 0.38 }}>
          {locked ? settledRef.current[idx] : randomChar()}
        </Box>
      );
    });
  return (
    <Box aria-hidden sx={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.4, letterSpacing: "0.18em", color: outcome === "error" ? BAD : SCAN, whiteSpace: "nowrap", overflow: "hidden", textShadow: `0 0 6px ${alpha(SCAN, 0.6)}` }}>
      <div>{line(0)}</div>
      <div>{line(1)}</div>
    </Box>
  );
};

interface DocumentScanPanelProps {
  /** Object URL снимка; null — PDF (рисуем условный документ). */
  preview: string | null;
  /** 0–100 из useDocumentScan. */
  progress: number;
  /** Ответ уже пришёл: успех — «Готово», ошибка — «Не получилось» (объяснение — в notice формы). */
  outcome: DocumentScanOutcome | null;
  onCancel?: () => void;
}

export const DocumentScanPanel: React.FC<DocumentScanPanelProps> = ({ preview, progress, outcome, onCancel }) => {
  const theme = useTheme();
  const pct = Math.round(progress);
  const stage = scanStageAt(progress);
  const done = outcome != null;
  const tone = outcome === "error" ? BAD : outcome === "success" ? OK : SCAN;
  const visiblePoints = done ? (outcome === "success" ? POINTS.length : 0) : Math.min(POINTS.length, Math.floor(Math.max(0, progress - 18) / 4.2));

  const title = outcome === "success" ? "Готово — анкета заполнена" : outcome === "error" ? "Распознать не получилось" : "Распознаём документ";
  const subtitle =
    outcome === "success"
      ? "Проверьте поля перед сохранением."
      : outcome === "error"
        ? "Фото прикреплено — поля можно заполнить вручную."
        : progress >= 85
          ? "Снимок сложнее обычного — ещё немного."
          : "Обычно 3–8 секунд. Фото уже прикреплено к гостю.";

  return (
    <Box
      role="group"
      aria-label="Распознавание документа"
      sx={{
        display: "grid",
        gap: 1.75,
        p: 1.5,
        borderRadius: "16px",
        border: "1px solid",
        borderColor: alpha(tone, 0.4),
        background: `linear-gradient(135deg, ${alpha(SCAN, theme.palette.mode === "dark" ? 0.1 : 0.07)}, ${alpha(SCAN_2, 0.05)} 60%, transparent)`,
        transition: "border-color .3s ease",
        "@media (prefers-reduced-motion: reduce)": { "& *": { animation: "none !important" } },
      }}
    >
      {/* ── «Экран» сканера ── */}
      <Box
        sx={{
          position: "relative",
          aspectRatio: "16 / 9",
          width: "100%",
          maxWidth: "100%",
          borderRadius: "12px",
          overflow: "hidden",
          bgcolor: "#05090D",
          border: `1px solid ${alpha(tone, 0.55)}`,
          boxShadow: `0 0 0 3px ${alpha(tone, 0.08)}, 0 14px 34px -14px ${alpha(tone, 0.7)}`,
          transition: "border-color .3s ease, box-shadow .3s ease",
        }}
      >
        {preview ? (
          <Box
            component="img"
            src={preview}
            alt=""
            sx={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              filter: done ? "none" : "grayscale(.35) contrast(1.15) brightness(.72)",
              transition: "filter .5s ease",
            }}
          />
        ) : (
          <Stack alignItems="center" justifyContent="center" gap={1} sx={{ position: "absolute", inset: 0, color: alpha(SCAN, 0.8) }}>
            <PictureAsPdfOutlined sx={{ fontSize: 42 }} />
            {[70, 54, 62].map((w, i) => (
              <Box key={i} sx={{ width: `${w}%`, height: 5, borderRadius: 3, bgcolor: alpha(SCAN, 0.18) }} />
            ))}
          </Stack>
        )}

        {/* тонировка и сетка */}
        <Box
          aria-hidden
          sx={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(180deg, ${alpha(SCAN, 0.1)}, ${alpha(SCAN_2, 0.16)})`,
            mixBlendMode: "screen",
            opacity: done ? 0 : 1,
            transition: "opacity .5s ease",
          }}
        />
        <Box
          aria-hidden
          sx={{
            position: "absolute",
            inset: 0,
            backgroundImage: `linear-gradient(${alpha(SCAN, 0.16)} 1px, transparent 1px), linear-gradient(90deg, ${alpha(SCAN, 0.16)} 1px, transparent 1px)`,
            backgroundSize: "20px 20px",
            maskImage: "radial-gradient(ellipse at center, #000 35%, transparent 85%)",
            animation: `${gridDrift} 1.4s linear infinite`,
            opacity: done ? 0 : 0.7,
            transition: "opacity .5s ease",
          }}
        />

        {/* точки, которые «находит» модель */}
        {POINTS.slice(0, visiblePoints).map(([x, y], i) => (
          <Box
            key={i}
            aria-hidden
            sx={{
              position: "absolute",
              left: `${x}%`,
              top: `${y}%`,
              width: 5,
              height: 5,
              borderRadius: "50%",
              bgcolor: tone,
              boxShadow: `0 0 8px 1px ${alpha(tone, 0.9)}`,
              animation: `${pointIn} .35s ease-out both`,
              "&::after": {
                content: '""',
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                border: `1px solid ${tone}`,
                animation: done ? "none" : `${ripple} 1.6s ease-out ${(i % 4) * 0.35}s infinite`,
              },
            }}
          />
        ))}

        {/* луч */}
        {!done && (
          <Box aria-hidden sx={{ position: "absolute", inset: 0, animation: `${beamSweep} 1.7s ease-in-out infinite alternate` }}>
            <Box
              sx={{
                position: "absolute",
                left: 0,
                right: 0,
                top: -18,
                height: 36,
                background: `linear-gradient(180deg, transparent, ${alpha(SCAN, 0.28)} 45%, ${alpha(SCAN, 0.28)} 55%, transparent)`,
                "&::after": {
                  content: '""',
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: "50%",
                  height: 2,
                  bgcolor: SCAN,
                  boxShadow: `0 0 14px 3px ${alpha(SCAN, 0.75)}`,
                },
              }}
            />
          </Box>
        )}

        {/* рамка видоискателя */}
        <Box aria-hidden sx={{ position: "absolute", inset: 10, animation: done ? "none" : `${bracketPulse} 1.3s ease-in-out infinite` }}>
          {(["tl", "tr", "bl", "br"] as const).map((c) => (
            <Box
              key={c}
              sx={{
                position: "absolute",
                width: 22,
                height: 22,
                borderColor: tone,
                borderStyle: "solid",
                borderWidth: 0,
                transition: "border-color .3s ease",
                ...(c[0] === "t" ? { top: 0, borderTopWidth: 2 } : { bottom: 0, borderBottomWidth: 2 }),
                ...(c[1] === "l" ? { left: 0, borderLeftWidth: 2, borderTopLeftRadius: c === "tl" ? 6 : 0, borderBottomLeftRadius: c === "bl" ? 6 : 0 } : { right: 0, borderRightWidth: 2, borderTopRightRadius: c === "tr" ? 6 : 0, borderBottomRightRadius: c === "br" ? 6 : 0 }),
              }}
            />
          ))}
        </Box>

        {/* HUD сверху */}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          aria-hidden
          sx={{ position: "absolute", top: 9, left: 18, right: 18, fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", color: tone }}
        >
          <Stack direction="row" alignItems="center" gap={0.75}>
            <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: tone, boxShadow: `0 0 6px ${tone}`, animation: done ? "none" : `${blink} 1s steps(2) infinite` }} />
            {outcome === "success" ? "ДАННЫЕ ПРОЧИТАНЫ" : outcome === "error" ? "НЕ РАСПОЗНАНО" : "СКАНИРОВАНИЕ"}
          </Stack>
          <span>{pct}%</span>
        </Stack>

        {/* «машиночитаемая зона» снизу */}
        <Box sx={{ position: "absolute", left: 0, right: 0, bottom: 0, px: 2, pt: 2.5, pb: 1, background: "linear-gradient(180deg, transparent, rgba(5,9,13,.92) 55%)" }}>
          <MrzTicker progress={progress} outcome={outcome} />
        </Box>

        {/* итог */}
        {done && (
          <>
            <Box aria-hidden sx={{ position: "absolute", inset: 0, bgcolor: tone, animation: `${flash} .9s ease-out both`, pointerEvents: "none" }} />
            <Box
              aria-hidden
              sx={{
                position: "absolute",
                left: "50%",
                top: "44%",
                width: 56,
                height: 56,
                ml: "-28px",
                mt: "-28px",
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                color: "#05090D",
                bgcolor: tone,
                boxShadow: `0 0 24px 4px ${alpha(tone, 0.6)}`,
                animation: `${popIn} .45s cubic-bezier(.2,.9,.3,1.3) both`,
              }}
            >
              {outcome === "success" ? <CheckRounded sx={{ fontSize: 36 }} /> : <WarningAmberRounded sx={{ fontSize: 30 }} />}
            </Box>
          </>
        )}
      </Box>

      {/* ── Этапы ── */}
      <Stack gap={1.25} sx={{ minWidth: 0 }}>
        <Stack direction="row" alignItems="center" gap={1.25}>
          <Box
            sx={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              color: outcome === "error" ? "warning.main" : outcome === "success" ? "success.main" : "primary.main",
              bgcolor: alpha(outcome === "error" ? theme.palette.warning.main : outcome === "success" ? theme.palette.success.main : theme.palette.primary.main, 0.12),
              animation: done ? "none" : `${breathe} 1.8s ease-in-out infinite`,
            }}
          >
            {outcome === "success" ? <CheckRounded /> : outcome === "error" ? <WarningAmberRounded /> : <AutoAwesomeRounded />}
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }} role="status" aria-live="polite">
            <Typography variant="subtitle2" fontWeight={800} sx={{ lineHeight: 1.25 }}>
              {title}
            </Typography>
            <Typography variant="caption" color="text.secondary" component="div" sx={{ lineHeight: 1.35 }}>
              {subtitle}
            </Typography>
          </Box>
          <Typography sx={{ fontWeight: 800, fontSize: "1.45rem", fontVariantNumeric: "tabular-nums", color: outcome === "error" ? "warning.main" : "primary.main", flexShrink: 0 }}>
            {pct}%
          </Typography>
        </Stack>

        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", columnGap: 2, rowGap: 0.75 }}>
          {STAGES.map(({ label }, i) => {
            const passed = outcome === "success" || i < stage;
            const current = !done && i === stage;
            return (
              <Stack key={label} direction="row" alignItems="center" gap={1}>
                <Box
                  sx={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                    border: "1.5px solid",
                    borderColor: passed || current ? "primary.main" : "divider",
                    bgcolor: passed ? "primary.main" : current ? alpha(theme.palette.primary.main, 0.12) : "transparent",
                    color: "primary.contrastText",
                    transition: "background-color .3s ease, border-color .3s ease",
                  }}
                >
                  {passed ? <CheckRounded sx={{ fontSize: 13 }} /> : current ? <CircularProgress size={9} thickness={7} /> : null}
                </Box>
                <Typography
                  variant="caption"
                  sx={{ fontSize: "0.78rem", fontWeight: current ? 700 : 500, color: passed || current ? "text.primary" : "text.secondary", lineHeight: 1.3 }}
                >
                  {label}
                </Typography>
              </Stack>
            );
          })}
        </Box>

        <Stack direction="row" alignItems="center" gap={1}>
          <LinearProgress
            variant="determinate"
            value={progress}
            aria-label="Распознаём документ"
            sx={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              bgcolor: alpha(SCAN, 0.15),
              "& .MuiLinearProgress-bar": {
                borderRadius: 3,
                background: outcome === "error" ? BAD : `linear-gradient(90deg, ${SCAN}, ${SCAN_2})`,
                boxShadow: `0 0 10px ${alpha(SCAN, 0.6)}`,
                transition: "transform .2s linear",
              },
            }}
          />
          {onCancel && !done && (
            <Button size="small" color="inherit" onClick={onCancel} sx={{ flexShrink: 0, minWidth: 0, px: 1, color: "text.secondary" }}>
              Отменить
            </Button>
          )}
        </Stack>
      </Stack>
    </Box>
  );
};

export default DocumentScanPanel;
