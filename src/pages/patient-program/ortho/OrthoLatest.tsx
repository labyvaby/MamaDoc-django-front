import React from "react";
import { Alert, Box, Chip, Stack, Tooltip, Typography, alpha, useTheme } from "@mui/material";
import TipsAndUpdatesOutlined from "@mui/icons-material/TipsAndUpdatesOutlined";

import type { ProgramModuleRecord } from "../../../api/programs";
import { AppButton, InfoHint } from "../../../components/ui";
import { NextCheckLine } from "../vision/VisionLatest";
import { BackView, FootPrints, Heels, HipUltrasound, Legs, PostureStrip } from "./art";
import { HIP_RISKS, MOBILITY, optionLabel } from "./orthoCatalog";
import { conclusionLabels, footEmpty, hipsEmpty, legsEmpty, spineEmpty, type OrthoExam } from "./orthoData";
import {
  ageMonths,
  ageWeeks,
  atrStatus,
  flatfootPhysiological,
  heelStatus,
  legAxisStatus,
  type OrthoStatus,
} from "./orthoNorms";
import {
  examSummary,
  footArchStatus,
  heelsStatus,
  hipSide,
  hipsStatus,
  legsAxisStatus,
  postureStatus,
  spineStatus,
  type AgeOnExam,
} from "./orthoSummary";
import { orthoColor, orthoTextColor } from "./orthoUi";
import dayjs from "dayjs";

/** Чип статуса с точкой — как в проекте раздела. Норма без заливки: цвет только у точки. */
export const StatusChip: React.FC<{ status: OrthoStatus; label: string }> = ({ status, label }) => {
  const theme = useTheme();
  const color = orthoColor(theme, status);
  const neutral = status === "unknown" || status === "ok";
  return (
    <Chip
      size="small"
      label={label}
      icon={<Box component="span" sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: color, ml: "8px !important" }} />}
      sx={{
        height: 26,
        borderRadius: "999px",
        fontWeight: 500,
        bgcolor: neutral ? alpha(theme.palette.text.primary, 0.05) : alpha(color, 0.12),
        color: status === "unknown" ? theme.palette.text.secondary : status === "ok" ? theme.palette.text.primary : orthoTextColor(theme, status),
        maxWidth: "100%",
      }}
    />
  );
};

const SUMMARY_RANK: Record<OrthoStatus, number> = { bad: 0, warn: 1, unknown: 2, ok: 3 };

/**
 * Находки осмотра чипами: на виду отклонения (красные, потом жёлтые) и
 * неоценённое, всё в норме — одним чипом «В норме: N» с перечнем в подсказке.
 * `max` — сколько чипов показать, остальное — «+ ещё N» с подсказкой.
 */
export const SummaryChips: React.FC<{ items: ReadonlyArray<{ status: OrthoStatus; text: string }>; max?: number }> = ({ items, max }) => {
  const visible = items.filter((item) => item.status !== "ok").sort((a, b) => SUMMARY_RANK[a.status] - SUMMARY_RANK[b.status]);
  const ok = items.filter((item) => item.status === "ok");
  const shown = max ? visible.slice(0, max) : visible;
  const rest = visible.slice(shown.length);
  return (
    <Stack direction="row" gap={0.5} flexWrap="wrap" alignItems="center">
      {shown.map((item, index) => (
        <StatusChip key={`${item.text}-${index}`} status={item.status} label={item.text} />
      ))}
      {ok.length > 0 && (
        <Tooltip title={ok.map((item) => item.text).join(", ")} arrow enterTouchDelay={0}>
          <Box component="span" tabIndex={0} sx={{ display: "inline-flex" }}>
            <StatusChip status="ok" label={visible.length ? `В норме: ${ok.length}` : "Без отклонений"} />
          </Box>
        </Tooltip>
      )}
      {rest.length > 0 && (
        <Tooltip title={`Ещё: ${rest.map((item) => item.text).join("; ")}`} arrow enterTouchDelay={0}>
          <Typography component="span" variant="caption" color="text.secondary" tabIndex={0} sx={{ cursor: "help" }}>
            + ещё {rest.length}
          </Typography>
        </Tooltip>
      )}
    </Stack>
  );
};

/** Панели с рисунками раскладываются по ширине карточки, а не экрана. */
const PANELS = "ortho-panels";
const whenTwoColumns = `@container ${PANELS} (min-width: 520px)`;

const Panel: React.FC<{
  title: string;
  caption?: string;
  /** Как читать рисунок — в значок ⓘ у названия, а не строкой под рисунком. */
  hint?: string;
  status: OrthoStatus;
  /** Рисунок: занимает свободную высоту панели, подписи прижаты к низу. */
  art?: React.ReactNode;
  children?: React.ReactNode;
  /** Во всю ширину ряда. */
  wide?: boolean;
  /** Две колонки — снимкам УЗИ нужно место. */
  double?: boolean;
  /** Последняя панель без пары: на всю строку, рисунок слева, подписи справа. */
  fill?: boolean;
}> = ({ title, caption, hint, status, art, children, wide = false, double = false, fill = false }) => {
  const theme = useTheme();
  const color = orthoColor(theme, status);
  // без текста одиночная панель просто центрирует рисунок
  const fillRow = fill && Boolean(children);
  return (
    <Box
      sx={{
        border: `1px solid ${status === "unknown" ? theme.palette.divider : alpha(color, 0.45)}`,
        borderRadius: "14px",
        p: 1.5,
        display: "flex",
        flexDirection: "column",
        gap: 1,
        minWidth: 0,
        gridColumn: wide ? "1 / -1" : undefined,
        ...(double || fill ? { [whenTwoColumns]: { gridColumn: "span 2" } } : {}),
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" gap={1}>
        <Stack direction="row" alignItems="center">
          <Typography variant="subtitle2" fontWeight={700}>
            {title}
          </Typography>
          {hint && <InfoHint text={hint} />}
        </Stack>
        {caption && (
          <Typography variant="caption" color="text.secondary" sx={{ textAlign: "right" }}>
            {caption}
          </Typography>
        )}
      </Stack>
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 1,
          ...(fillRow ? { [whenTwoColumns]: { flexDirection: "row", alignItems: "center", gap: 3 } } : {}),
        }}
      >
        {art && (
          <Box
            sx={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              ...(fillRow ? { [whenTwoColumns]: { flex: "0 1 300px" } } : {}),
            }}
          >
            {art}
          </Box>
        )}
        {children && (
          <Stack gap={1} sx={{ minWidth: 0, ...(fillRow ? { [whenTwoColumns]: { flex: 1 } } : {}) }}>
            {children}
          </Stack>
        )}
      </Box>
    </Box>
  );
};

const Verdict: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.45 }}>
    {children}
  </Typography>
);

const ATR_RULE = "Ротация по сколиометру: до 3° — норма, 4–6° — повтор через 4–12 мес, от 7° — снимок и ортопед.";

const Art: React.FC<{ children: React.ReactNode; maxWidth?: number }> = ({ children, maxWidth = 280 }) => (
  <Box sx={{ width: "100%", maxWidth, mx: "auto" }}>{children}</Box>
);

interface OrthoLatestProps {
  /** Проведённые осмотры, от новых к старым; первый — последний осмотр. */
  exams: OrthoExam[];
  birthDate: string | null;
  nextPlanned: ProgramModuleRecord | null;
  canManage: boolean;
  onConduct: (record: ProgramModuleRecord) => void;
}

/**
 * Последний осмотр (ТЗ §4.3): сводка-чипы и панели с рисунками только для
 * заполненных блоков, ниже — красные признаки, заключение, рекомендации и
 * следующий осмотр.
 */
export const OrthoLatest: React.FC<OrthoLatestProps> = ({ exams, birthDate, nextPlanned, canManage, onConduct }) => {
  const latest = exams[0];
  const ageOn = (exam: OrthoExam): AgeOnExam => ({
    months: ageMonths(birthDate, exam.record.occurredAt),
    weeks: ageWeeks(birthDate, exam.record.occurredAt),
  });
  const age = ageOn(latest);
  const summary = examSummary(latest, age);
  const conclusions = conclusionLabels(latest.conclusions);
  // Панели показывают последнее известное состояние каждого блока: если в
  // последнем осмотре блока нет (УЗИ суставов делали в 1 мес.), берётся
  // ближайший прежний осмотр — с его датой в подписи.
  const hipsExam = exams.find((exam) => !hipsEmpty(exam.hips) && exam.hips?.us != null) ?? null;
  const footExam = exams.find((exam) => !footEmpty(exam.foot)) ?? null;
  const legsExam = exams.find((exam) => !legsEmpty(exam.legs) && exam.legs?.axis != null) ?? null;
  const spineExam = exams.find((exam) => !spineEmpty(exam.spine)) ?? null;
  const hips = hipsExam?.hips ?? null;
  const foot = footExam?.foot ?? null;
  const legs = legsExam?.legs ?? null;
  const spine = spineExam?.spine ?? null;
  const hipsAge = hipsExam ? ageOn(hipsExam) : age;
  const footAge = footExam ? ageOn(footExam) : age;
  const legsAge = legsExam ? ageOn(legsExam) : age;
  const months = footAge.months;
  const sinceDate = (exam: OrthoExam | null): string | undefined =>
    exam && exam !== latest ? `на ${dayjs(exam.record.occurredAt).format("DD.MM.YYYY")}` : undefined;
  const [hipsOpen, setHipsOpen] = React.useState(false);

  const usSides = hips?.us ? [hipSide("L", hips.us.left, hipsAge.weeks), hipSide("R", hips.us.right, hipsAge.weeks)] : [];
  const hasUs = usSides.some((side) => side.alpha != null || side.typeLabel);
  // чипы УЗИ — только где есть что сказать сверх рисунка: подсказка системы или подтверждённое отклонение
  const usChips = usSides.filter((side) => (side.alpha != null || side.typeLabel) && (!side.confirmed || side.status !== "ok"));
  // «Тип IIa допустим до 12 недель» на виду, только когда это про этого ребёнка
  const iiaRelevant = usSides.some((side) => side.typeLabel.includes("IIa")) || (hipsAge.weeks != null && hipsAge.weeks < 16);
  // старое УЗИ с нормой с обеих сторон — одной строкой, рисунок по кнопке; факторы риска остаются на виду
  const hipsCompact = hips != null && hipsExam !== latest && usSides.every((side) => side.status === "ok") && hipsStatus(hips, hipsAge) === "ok";
  const hasArch = foot != null && (foot.arch.left != null || foot.arch.right != null);
  const hasHeel = foot != null && (foot.heel.left != null || foot.heel.right != null);
  const hasLegs = legs?.axis != null;
  const adams = spine?.adams ?? null;
  const shoulder = spine?.asymmetries.find((item) => item.code === "shoulder") ?? null;
  const hasBack = adams != null || (spine?.asymmetries.length ?? 0) > 0;
  // правило про ротацию на виду, только когда ротация не в норме; иначе — в ⓘ
  const atrOff = adams?.atr != null && atrStatus(adams.atr) !== "ok";
  const physiological = foot
    ? flatfootPhysiological([foot.arch.left, foot.arch.right], foot.mobility, foot.complaints, months)
    : false;
  const olderThan7 = months != null && months >= 84;
  const legsMonths = legsAge.months;

  // панели без пары: последняя одиночная растягивается на всю строку
  const singles = [hasArch && "feet", hasHeel && "heels", hasLegs && "legs", hasBack && "back"].filter(Boolean);
  const fillKey = singles.length % 2 === 1 ? singles[singles.length - 1] : null;
  const hasLegacy = Boolean(latest.legacyPosture || latest.legacyFeet);

  // «Последний осмотр» и дата — в шапке раздела; здесь сразу сводка
  return (
    <Stack gap={1.75} sx={{ containerType: "inline-size", containerName: PANELS }}>
      {summary.length > 0 && <SummaryChips items={summary} />}

      {hasLegacy && (
        <Box
          sx={(theme) => ({
            p: 1.5,
            borderRadius: "12px",
            bgcolor: alpha(theme.palette.text.primary, 0.035),
            display: "grid",
            gridTemplateColumns: "auto minmax(0, 1fr)",
            columnGap: 2,
            rowGap: 0.5,
          })}
        >
          {latest.legacyPosture && (
            <>
              <Typography variant="body2" color="text.secondary">
                Осанка
              </Typography>
              <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
                {latest.legacyPosture}
              </Typography>
            </>
          )}
          {latest.legacyFeet && (
            <>
              <Typography variant="body2" color="text.secondary">
                Стопы
              </Typography>
              <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
                {latest.legacyFeet}
              </Typography>
            </>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ gridColumn: "1 / -1", mt: 0.5 }}>
            Запись в прежнем виде, без рисунков
            <InfoHint text="Рисунки строятся по осмотрам, внесённым кнопками «Осмотр ортопеда» и «Скрининг педиатра»." />
          </Typography>
        </Box>
      )}

      {(hasUs || hasArch || hasHeel || hasLegs || hasBack) && (
        <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: "minmax(0, 1fr)", [whenTwoColumns]: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" } }}>
          {hasUs && hips && hipsExam && hipsCompact && !hipsOpen && (
            <Stack
              direction="row"
              alignItems="center"
              flexWrap="wrap"
              columnGap={1}
              rowGap={0.5}
              sx={{ gridColumn: "1 / -1", minWidth: 0, border: 1, borderColor: "divider", borderRadius: "14px", px: 1.5, py: 0.5 }}
            >
              <Box component="span" sx={(theme) => ({ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, bgcolor: orthoColor(theme, "ok") })} />
              <Typography variant="body2" sx={{ minWidth: 0, py: 0.5 }}>
                УЗИ суставов {dayjs(hipsExam.record.occurredAt).format("DD.MM.YYYY")}:{" "}
                {usSides.map((side) => `${side.typeLabel}${side.confirmed ? "" : " (подсказка)"}`).join(" / ")} — норма
              </Typography>
              {hips.risks.map((risk) => (
                <Chip key={risk} size="small" label={`Риск: ${optionLabel(HIP_RISKS, risk).toLowerCase()}`} sx={{ height: 24, borderRadius: "999px" }} />
              ))}
              <AppButton size="small" variant="text" onClick={() => setHipsOpen(true)} sx={{ ml: "auto" }}>
                Показать рисунок
              </AppButton>
            </Stack>
          )}
          {hasUs && hips && (!hipsCompact || hipsOpen) && (
            <Panel
              title="Тазобедренные суставы"
              caption={["УЗИ по Графу", sinceDate(hipsExam)].filter(Boolean).join(" · ")}
              hint={`Белая линия — подвздошная кость, цветная — костная крыша, серая — хрящевая.${iiaRelevant ? "" : " Тип IIa допустим до 12 недель."} Тип система подсказывает по углам и возрасту, врач подтверждает.`}
              status={hipsStatus(hips, hipsAge)}
              double
              art={
                <Art maxWidth={460}>
                  <HipUltrasound
                    left={{ alpha: usSides[0].alpha, beta: usSides[0].beta, status: usSides[0].status, type: usSides[0].typeLabel || null }}
                    right={{ alpha: usSides[1].alpha, beta: usSides[1].beta, status: usSides[1].status, type: usSides[1].typeLabel || null }}
                  />
                </Art>
              }
            >
              {usChips.length > 0 || hips.risks.length > 0 || iiaRelevant || hipsCompact ? (
                <>
                  {(usChips.length > 0 || hips.risks.length > 0) && (
                    <Stack direction="row" gap={0.5} flexWrap="wrap">
                      {usChips.map((side) => (
                        <StatusChip
                          key={side.side}
                          status={side.status}
                          label={`${side.side === "L" ? "Л" : "П"}: ${side.typeLabel}${side.alpha != null ? ` · α ${side.alpha}°` : ""}${side.beta != null ? ` · β ${side.beta}°` : ""}${side.confirmed ? "" : " (подсказка)"}`}
                        />
                      ))}
                      {hips.risks.map((risk) => (
                        <Chip key={risk} size="small" label={`Риск: ${optionLabel(HIP_RISKS, risk).toLowerCase()}`} sx={{ height: 24, borderRadius: "999px" }} />
                      ))}
                    </Stack>
                  )}
                  {iiaRelevant && <Verdict>Тип IIa допустим до 12 недель.</Verdict>}
                  {hipsCompact && (
                    <AppButton size="small" variant="text" onClick={() => setHipsOpen(false)} sx={{ alignSelf: "flex-start" }}>
                      Свернуть
                    </AppButton>
                  )}
                </>
              ) : null}
            </Panel>
          )}

          {hasArch && foot && (
            <Panel
              title="Стопы"
              caption={sinceDate(footExam)}
              hint="Отпечаток стоя. Тонкая линия — контур стопы, заливка — отпечаток."
              status={footArchStatus(foot, footAge)}
              fill={fillKey === "feet"}
              art={
                <Art maxWidth={240}>
                  <FootPrints
                    left={{ arch: foot.arch.left, status: foot.arch.left ? footArchStatus(foot, footAge) : "unknown", index: foot.chizhin.left }}
                    right={{ arch: foot.arch.right, status: foot.arch.right ? footArchStatus(foot, footAge) : "unknown", index: foot.chizhin.right }}
                  />
                </Art>
              }
            >
              <Stack direction="row" gap={0.5} flexWrap="wrap">
                {foot.mobility && <Chip size="small" label={optionLabel(MOBILITY, foot.mobility).split(" (")[0]} sx={{ height: 24, borderRadius: "999px" }} />}
                <Chip size="small" label={foot.complaints ? "Есть жалобы" : "Жалоб нет"} sx={{ height: 24, borderRadius: "999px" }} />
                {physiological && <StatusChip status="ok" label="Физиологично до 7–10 лет" />}
              </Stack>
              <Verdict>Мобильное плоскостопие без жалоб у детей не лечат.</Verdict>
            </Panel>
          )}

          {hasHeel && foot && (
            <Panel
              title="Пятки"
              caption={sinceDate(footExam)}
              hint="Вид сзади. Угол между осью голени и осью пятки."
              status={heelsStatus(foot, footAge)}
              fill={fillKey === "heels"}
              art={
                <Art maxWidth={240}>
                  <Heels
                    left={{ deg: foot.heel.left, status: heelStatus(foot.heel.left, months) }}
                    right={{ deg: foot.heel.right, status: heelStatus(foot.heel.right, months) }}
                  />
                </Art>
              }
            >
              <Verdict>{olderThan7 ? "С 7 лет норма до 5°" : "До 7 лет норма до 10°"}, до 15° — пограничное.</Verdict>
            </Panel>
          )}

          {hasLegs && legs && (
            <Panel
              title="Ноги"
              caption={sinceDate(legsExam)}
              hint="Вид спереди."
              status={legsAxisStatus(legs, legsAge)}
              fill={fillKey === "legs"}
              art={
                <Art maxWidth={240}>
                  <Legs
                    axis={legs.axis}
                    distanceCm={legs.distance}
                    status={legAxisStatus(legs.axis, legs.distance, legs.symmetric, legsMonths)}
                    lengthDiff={legs.lengthDiff}
                  />
                </Art>
              }
            >
              <Verdict>
                {/* измеренное расстояние подписано на рисунке — здесь только норма */}
                {legs.axis === "varus"
                  ? `${legs.distance != null ? "" : "Расстояние между коленями не измерено. "}До 2 лет норма до 5 см.`
                  : legs.axis === "valgus"
                    ? `${legs.distance != null ? "" : "Расстояние между лодыжками не измерено. "}До 8 лет норма до 7 см.`
                    : "Ноги прямые."}
              </Verdict>
            </Panel>
          )}

          {hasBack && spine && (
            <Panel
              title="Спина"
              caption={sinceDate(spineExam)}
              hint={`${adams ? "Вид сзади и наклон вперёд." : "Вид сзади."}${atrOff ? "" : ` ${ATR_RULE}`}`}
              status={spineStatus(spine)}
              fill={fillKey === "back"}
              art={
                <Art maxWidth={240}>
                  <BackView
                    shoulderHigher={shoulder && shoulder.side !== "both" ? shoulder.side : null}
                    curve={adams?.result === "rib" && adams.side ? adams.side : null}
                    humpSide={adams?.result && adams.result !== "negative" ? adams.side : null}
                    atr={adams?.atr ?? null}
                    status={adams?.atr != null ? atrStatus(adams.atr) : spineStatus(spine)}
                    showAdams={adams != null}
                  />
                </Art>
              }
            >
              {atrOff && <Verdict>{ATR_RULE}</Verdict>}
            </Panel>
          )}

          {spine?.posture && (
            <Panel
              title="Осанка"
              caption={sinceDate(spineExam)}
              hint="Позвоночник сбоку. Пунктир — нормальные изгибы для сравнения, линия от уха — отвес."
              status={postureStatus(spine)}
              wide
            >
              <Box sx={{ overflowX: "auto", scrollbarWidth: "thin" }}>
                <Box sx={{ minWidth: 600 }}>
                  <PostureStrip selected={spine.posture} status={postureStatus(spine)} />
                </Box>
              </Box>
            </Panel>
          )}
        </Box>
      )}

      {conclusions.length > 0 && (
        <Typography variant="body2">
          <b>Заключение:</b> {conclusions.join("; ")}
        </Typography>
      )}
      {latest.recommendation && (
        <Alert severity="info" icon={<TipsAndUpdatesOutlined fontSize="small" />} sx={{ py: 0.25 }}>
          {latest.recommendation}
        </Alert>
      )}
      {nextPlanned && <NextCheckLine planned={nextPlanned} canManage={canManage} onConduct={onConduct} />}
    </Stack>
  );
};
