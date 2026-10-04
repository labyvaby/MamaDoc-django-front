import React from "react";
import { Alert, Box, Chip, Stack, Typography, alpha, useTheme } from "@mui/material";
import TipsAndUpdatesOutlined from "@mui/icons-material/TipsAndUpdatesOutlined";

import type { ProgramModuleRecord } from "../../../api/programs";
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

const fmt = (value: number): string => String(value).replace(".", ",");

/** Чип статуса с точкой — как в проекте раздела. */
export const StatusChip: React.FC<{ status: OrthoStatus; label: string }> = ({ status, label }) => {
  const theme = useTheme();
  const color = orthoColor(theme, status);
  return (
    <Chip
      size="small"
      label={label}
      icon={<Box component="span" sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: color, ml: "8px !important" }} />}
      sx={{
        height: 26,
        borderRadius: "999px",
        fontWeight: 500,
        bgcolor: status === "unknown" ? alpha(theme.palette.text.primary, 0.05) : alpha(color, 0.12),
        color: status === "unknown" ? theme.palette.text.secondary : orthoTextColor(theme, status),
        maxWidth: "100%",
      }}
    />
  );
};

const Panel: React.FC<{
  title: string;
  caption?: string;
  status: OrthoStatus;
  children: React.ReactNode;
  /** Во всю ширину ряда. */
  wide?: boolean;
  /** Две колонки на широком экране — снимкам УЗИ нужно место. */
  double?: boolean;
}> = ({ title, caption, status, children, wide = false, double = false }) => {
  const theme = useTheme();
  const color = orthoColor(theme, status);
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
        gridColumn: wide ? "1 / -1" : double ? { xs: "auto", md: "span 2" } : undefined,
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" gap={1}>
        <Typography variant="subtitle2" fontWeight={700}>
          {title}
        </Typography>
        {caption && (
          <Typography variant="caption" color="text.secondary" sx={{ textAlign: "right" }}>
            {caption}
          </Typography>
        )}
      </Stack>
      {children}
    </Box>
  );
};

const Verdict: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.45 }}>
    {children}
  </Typography>
);

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
  const since = (exam: OrthoExam | null): string =>
    exam && exam !== latest ? ` · на ${dayjs(exam.record.occurredAt).format("DD.MM.YYYY")}` : "";

  const usSides = hips?.us ? [hipSide("L", hips.us.left, hipsAge.weeks), hipSide("R", hips.us.right, hipsAge.weeks)] : [];
  const hasUs = usSides.some((side) => side.alpha != null || side.typeLabel);
  const hasArch = foot != null && (foot.arch.left != null || foot.arch.right != null);
  const hasHeel = foot != null && (foot.heel.left != null || foot.heel.right != null);
  const hasLegs = legs?.axis != null;
  const adams = spine?.adams ?? null;
  const shoulder = spine?.asymmetries.find((item) => item.code === "shoulder") ?? null;
  const hasBack = adams != null || (spine?.asymmetries.length ?? 0) > 0;
  const physiological = foot
    ? flatfootPhysiological([foot.arch.left, foot.arch.right], foot.mobility, foot.complaints, months)
    : false;
  const olderThan7 = months != null && months >= 84;
  const legsMonths = legsAge.months;

  return (
    <Stack gap={1.75}>
      <Stack direction="row" alignItems="baseline" justifyContent="space-between" gap={1} flexWrap="wrap">
        <Typography variant="subtitle2">Последний осмотр</Typography>
        <Typography variant="caption" color="text.secondary">
          {latest.record.title}
        </Typography>
      </Stack>

      {summary.length > 0 && (
        <Stack direction="row" gap={0.75} flexWrap="wrap">
          {summary.map((item, index) => (
            <StatusChip key={`${item.text}-${index}`} status={item.status} label={item.text} />
          ))}
        </Stack>
      )}

      {(latest.legacyPosture || latest.legacyFeet) && (
        <Typography variant="body2" color="text.secondary">
          {[latest.legacyPosture && `Осанка: ${latest.legacyPosture}`, latest.legacyFeet && `Стопы: ${latest.legacyFeet}`]
            .filter(Boolean)
            .join(" · ")}
        </Typography>
      )}

      {(hasUs || hasArch || hasHeel || hasLegs || hasBack) && (
        <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          {hasUs && hips && (
            <Panel title="Тазобедренные суставы" caption={`УЗИ по Графу${since(hipsExam)}`} status={hipsStatus(hips, hipsAge)} double>
              <Art maxWidth={460}>
                <HipUltrasound
                  left={{ alpha: usSides[0].alpha, beta: usSides[0].beta, status: usSides[0].status, type: usSides[0].typeLabel || null }}
                  right={{ alpha: usSides[1].alpha, beta: usSides[1].beta, status: usSides[1].status, type: usSides[1].typeLabel || null }}
                />
              </Art>
              <Stack direction="row" gap={0.5} flexWrap="wrap">
                {usSides
                  .filter((side) => side.alpha != null || side.typeLabel)
                  .map((side) => (
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
              <Verdict>
                Белая линия — подвздошная кость, цветная — костная крыша, серая — хрящевая. Тип IIa допустим до 12 недель. Тип
                система подсказывает по углам и возрасту, врач подтверждает.
              </Verdict>
            </Panel>
          )}

          {hasArch && foot && (
            <Panel title="Стопы" caption={`отпечаток стоя${since(footExam)}`} status={footArchStatus(foot, footAge)}>
              <Art maxWidth={240}>
                <FootPrints
                  left={{ arch: foot.arch.left, status: foot.arch.left ? footArchStatus(foot, footAge) : "unknown", index: foot.chizhin.left }}
                  right={{ arch: foot.arch.right, status: foot.arch.right ? footArchStatus(foot, footAge) : "unknown", index: foot.chizhin.right }}
                />
              </Art>
              <Stack direction="row" gap={0.5} flexWrap="wrap">
                {foot.mobility && <Chip size="small" label={optionLabel(MOBILITY, foot.mobility).split(" (")[0]} sx={{ height: 24, borderRadius: "999px" }} />}
                <Chip size="small" label={foot.complaints ? "Есть жалобы" : "Жалоб нет"} sx={{ height: 24, borderRadius: "999px" }} />
                {physiological && <StatusChip status="ok" label="Физиологично до 7–10 лет" />}
              </Stack>
              <Verdict>Тонкая линия — контур стопы, заливка — отпечаток. Мобильное плоскостопие без жалоб у детей не лечат.</Verdict>
            </Panel>
          )}

          {hasHeel && foot && (
            <Panel title="Пятки" caption={`вид сзади${since(footExam)}`} status={heelsStatus(foot, footAge)}>
              <Art maxWidth={240}>
                <Heels
                  left={{ deg: foot.heel.left, status: heelStatus(foot.heel.left, months) }}
                  right={{ deg: foot.heel.right, status: heelStatus(foot.heel.right, months) }}
                />
              </Art>
              <Verdict>
                Угол между осью голени и осью пятки. {olderThan7 ? "С 7 лет норма до 5°" : "До 7 лет норма до 10°"}, до 15° —
                пограничное.
              </Verdict>
            </Panel>
          )}

          {hasLegs && legs && (
            <Panel title="Ноги" caption={`вид спереди${since(legsExam)}`} status={legsAxisStatus(legs, legsAge)}>
              <Art maxWidth={240}>
                <Legs
                  axis={legs.axis}
                  distanceCm={legs.distance}
                  status={legAxisStatus(legs.axis, legs.distance, legs.symmetric, legsMonths)}
                  lengthDiff={legs.lengthDiff}
                />
              </Art>
              <Verdict>
                {legs.axis === "varus"
                  ? `Расстояние между коленями${legs.distance != null ? ` ${fmt(legs.distance)} см` : " не измерено"}. До 2 лет норма до 5 см.`
                  : legs.axis === "valgus"
                    ? `Расстояние между лодыжками${legs.distance != null ? ` ${fmt(legs.distance)} см` : " не измерено"}. До 8 лет норма до 7 см.`
                    : "Ноги прямые."}
              </Verdict>
            </Panel>
          )}

          {hasBack && spine && (
            <Panel title="Спина" caption={`${adams ? "вид сзади и наклон вперёд" : "вид сзади"}${since(spineExam)}`} status={spineStatus(spine)}>
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
              <Verdict>Ротация по сколиометру: до 3° — норма, 4–6° — повтор через 4–12 мес, от 7° — снимок и ортопед.</Verdict>
            </Panel>
          )}

          {spine?.posture && (
            <Panel title="Осанка" caption={`позвоночник сбоку${since(spineExam)}`} status={postureStatus(spine)} wide>
              <Box sx={{ overflowX: "auto", scrollbarWidth: "thin" }}>
                <Box sx={{ minWidth: 600 }}>
                  <PostureStrip selected={spine.posture} status={postureStatus(spine)} />
                </Box>
              </Box>
              <Verdict>Пунктир — нормальные изгибы для сравнения, линия от уха — отвес.</Verdict>
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
