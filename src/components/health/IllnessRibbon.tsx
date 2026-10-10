import React from "react";
import { Box, ButtonBase, Collapse, Stack, Typography, alpha, useTheme, type Theme } from "@mui/material";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import LocalHospitalOutlined from "@mui/icons-material/LocalHospitalOutlined";
import MonitorHeartOutlined from "@mui/icons-material/MonitorHeartOutlined";

import type { Hospitalization, IllnessDiagnosis, IllnessEpisode, IllnessVisit, InfectionSummary } from "../../api/health";
import { Rail } from "../../pages/patient-program/visits/VisitRow";
import type { Segment } from "../../pages/patient-program/visits/visitsData";
import { subtleBg, subtleBorder } from "../../theme/uiHelpers";
import { AppButton } from "../ui";
import { formatDate } from "./healthMeta";
import {
  RIBBON_PAGE,
  SOURCE_LABELS,
  episodeAge,
  episodeTitleParts,
  episodeTitleText,
  episodeWhen,
  formatPrecisionDate,
  infectionRibbonText,
  limitRibbon,
  lowerFirst,
  medicationCaption,
  medicationsCaption,
  precisionAge,
  stayDocsCaption,
  stayPeriod,
  visitsCaption,
  yearCaption,
  type RibbonItem,
  type RibbonYear,
} from "./illnessData";
import { markColor, type IllnessMark } from "./illnessUi";

const COLUMNS = { xs: "16px minmax(0, 1fr)", md: "92px 22px minmax(0, 1fr)" } as const;
const COLUMN_GAP = { xs: 1, md: 1.25 } as const;
const DOT_TOP = 21;

export type TagTone = "neutral" | "primary" | "warning" | "error" | "success" | "info";

function toneColors(theme: Theme, tone: TagTone): { bg: string; fg: string } {
  if (tone === "neutral") return { bg: subtleBg(theme, true), fg: theme.palette.text.secondary };
  const palette = theme.palette[tone];
  return { bg: alpha(palette.main, theme.palette.mode === "dark" ? 0.2 : 0.12), fg: palette.onSurface };
}

/** Короткая метка: «из приёма», «вручную», «хроническое», «стационар». */
export const Tag: React.FC<{ tone?: TagTone; children: React.ReactNode }> = ({ tone = "neutral", children }) => {
  const theme = useTheme();
  const { bg, fg } = toneColors(theme, tone);
  return (
    <Box
      component="span"
      sx={{ px: 0.75, py: 0.125, borderRadius: "6px", fontSize: 11.5, fontWeight: 600, lineHeight: 1.6, whiteSpace: "nowrap", bgcolor: bg, color: fg }}
    >
      {children}
    </Box>
  );
};

/** Код МКБ-10 после названия. */
export const CodeTag: React.FC<{ code: string }> = ({ code }) => (
  <Box
    component="span"
    sx={(theme) => ({
      ml: 0.5,
      px: 0.6,
      borderRadius: "5px",
      fontSize: 11.5,
      fontWeight: 700,
      fontVariantNumeric: "tabular-nums",
      whiteSpace: "nowrap",
      color: "text.secondary",
      bgcolor: alpha(theme.palette.text.primary, 0.06),
      verticalAlign: "1px",
    })}
  >
    {code}
  </Box>
);

/** «ОРВИ J06.9 → острый бронхит J20.9» с кодами метками. */
export const DiagnosesTitle: React.FC<{ diagnoses: IllnessDiagnosis[]; strike?: boolean }> = ({ diagnoses, strike }) => (
  <Typography component="div" variant="body2" fontWeight={700} sx={{ lineHeight: 1.45, overflowWrap: "anywhere", textDecoration: strike ? "line-through" : undefined }}>
    {diagnoses.map((diagnosis, index) => (
      <React.Fragment key={`${diagnosis.code}-${diagnosis.title}-${index}`}>
        {index > 0 && (
          <Box component="span" sx={{ color: "text.disabled", mx: 0.5, fontWeight: 500 }}>
            →
          </Box>
        )}
        <span>{diagnosis.title || "Без названия"}</span>
        {diagnosis.code && <CodeTag code={diagnosis.code} />}
      </React.Fragment>
    ))}
  </Typography>
);

const Dot: React.FC<{ mark: IllnessMark; hollow?: boolean }> = ({ mark, hollow = false }) => {
  const theme = useTheme();
  const color = markColor(theme, mark);
  return (
    <Box
      sx={{
        width: 12,
        height: 12,
        borderRadius: "50%",
        bgcolor: hollow ? theme.palette.background.paper : color,
        border: hollow ? `2px solid ${color}` : undefined,
        boxShadow: hollow ? undefined : `0 0 0 3px ${alpha(color, 0.16)}`,
      }}
    />
  );
};

/** Дата слева: диапазон полных дат — в две строки («04.02» / «–09.02»), ниже возраст. */
const WhenColumn: React.FC<{ label: string; age?: string; muted?: boolean }> = ({ label, age, muted }) => {
  const parts = label.split("–");
  const [start, end] = parts.length === 2 && parts[0].includes(".") ? parts : [label, ""];
  return (
    <Box sx={{ display: { xs: "none", md: "block" }, textAlign: "right", pt: 1.1, pb: 1, color: muted ? "text.secondary" : "text.primary" }}>
      <Typography sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1.25, fontVariantNumeric: "tabular-nums" }}>
        {start}
        {end && (
          <Box component="span" sx={{ display: "block", fontSize: 12.5, color: "text.secondary" }}>
            –{end}
          </Box>
        )}
      </Typography>
      {age && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.3, mt: 0.25 }}>
          {age}
        </Typography>
      )}
    </Box>
  );
};

/** На телефоне дата — строкой над карточкой (колонки слева нет). */
const MobileWhen: React.FC<{ label: string; age?: string }> = ({ label, age }) => (
  <Typography variant="caption" color="text.secondary" sx={{ display: { xs: "block", md: "none" }, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
    {[label, age].filter(Boolean).join(" · ")}
  </Typography>
);

const cardSx = (theme: Theme, tone: string, open = false) => ({
  borderRadius: "12px",
  border: `1px solid ${open ? alpha(tone, 0.45) : subtleBorder(theme)}`,
  bgcolor: "background.paper",
  overflow: "hidden",
  transition: "border-color .15s ease, box-shadow .15s ease",
  "&:hover": { borderColor: alpha(tone, 0.45) },
  ...(open ? { boxShadow: `0 6px 18px ${alpha(theme.palette.common.black, theme.palette.mode === "dark" ? 0.3 : 0.05)}` } : {}),
});

const RowShell: React.FC<{
  top: Segment;
  bottom: Segment;
  when: React.ReactNode;
  dot: React.ReactNode;
  children: React.ReactNode;
}> = ({ top, bottom, when, dot, children }) => (
  <Box sx={{ display: "grid", gridTemplateColumns: COLUMNS, columnGap: COLUMN_GAP }}>
    {when}
    <Rail top={top} bottom={bottom} dot={dot} dotTop={DOT_TOP} />
    <Box sx={{ pb: 1, minWidth: 0 }}>{children}</Box>
  </Box>
);

const VisitLine: React.FC<{ visit: IllnessVisit; canViewConclusions: boolean; onConclusion: (visit: IllnessVisit) => void }> = ({
  visit,
  canViewConclusions,
  onConclusion,
}) => {
  const doctor = visit.doctor?.fullName || visit.doctorName;
  const hasConclusion = visit.conclusionId != null || visit.legacyConclusionId != null;
  return (
    <Stack direction="row" gap={1} alignItems="flex-start" flexWrap="wrap" sx={{ py: 0.75 }}>
      <Box sx={{ flex: "1 1 240px", minWidth: 0 }}>
        <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
          <Box component="span" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            {formatDate(visit.on)}
          </Box>
          {[
            doctor,
            visit.specialty
              .split(",")
              .map(lowerFirst)
              .filter(Boolean)
              .join(", "),
            visit.branch?.name ?? "",
            visit.legacyConclusionId && !visit.conclusionId ? "архив" : "",
          ]
            .filter(Boolean)
            .map((part) => ` · ${part}`)
            .join("")}
        </Typography>
        {visit.diagnoses.length > 0 && (
          <Typography variant="caption" color="text.secondary" component="div" sx={{ overflowWrap: "anywhere" }}>
            {visit.diagnoses.map((diagnosis) => [diagnosis.code, diagnosis.title].filter(Boolean).join(" ")).join("; ")}
          </Typography>
        )}
      </Box>
      {canViewConclusions && hasConclusion && (
        <AppButton size="small" startIcon={<DescriptionOutlined />} onClick={() => onConclusion(visit)} sx={{ flexShrink: 0 }}>
          Заключение
        </AppButton>
      )}
    </Stack>
  );
};

export interface RibbonHandlers {
  canManage: boolean;
  canViewConclusions: boolean;
  onChronic: (episode: IllnessEpisode) => void;
  onStayFromEpisode: (episode: IllnessEpisode) => void;
  onEditManual: (episode: IllnessEpisode) => void;
  onOpenStay: (row: Hospitalization) => void;
  onOpenInfection: (info: InfectionSummary) => void;
  onConclusion: (visit: IllnessVisit) => void;
}

const EpisodeRow: React.FC<{
  episode: IllnessEpisode;
  birthDate: string | null;
  top: Segment;
  bottom: Segment;
  handlers: RibbonHandlers;
}> = ({ episode, birthDate, top, bottom, handlers }) => {
  const theme = useTheme();
  const [open, setOpen] = React.useState(false);
  const mark: IllnessMark = episode.counter ?? "other";
  const tone = markColor(theme, mark);
  const when = episodeWhen(episode);
  const age = episodeAge(episode, birthDate);
  const manual = episode.source === "manual";
  // У внесённой вручную вместо приёмов — где лечили и заметка.
  const facts = manual
    ? [episode.place ? `где лечили: ${lowerFirst(episode.place)}` : "", episode.notes].filter(Boolean).join(" · ")
    : visitsCaption(episode);
  const caption = [facts, medicationsCaption(episode.medications)].filter(Boolean).join(" · ");
  const expandable = episode.visits.length > 0 || episode.medications.length > 0 || handlers.canManage;
  const header = (
    <>
      <MobileWhen label={episodeWhen(episode, true)} age={age} />
      <Stack direction="row" gap={1} alignItems="flex-start">
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <DiagnosesTitle diagnoses={episodeTitleParts(episode)} />
          {caption && (
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.25, overflowWrap: "anywhere" }}>
              {caption}
            </Typography>
          )}
        </Box>
        <Stack direction="row" gap={0.5} alignItems="center" flexWrap="wrap" justifyContent="flex-end" sx={{ flexShrink: 0, maxWidth: "45%" }}>
          {episode.isChronic && <Tag tone="warning">хроническое</Tag>}
          {/* «из приёма» / «из архива» уже сказаны подписью «1 приём · …» и точкой */}
          {manual && <Tag tone="primary">{SOURCE_LABELS.manual}</Tag>}
          {expandable && (
            <ExpandMoreOutlined
              fontSize="small"
              sx={{ color: "text.secondary", transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }}
            />
          )}
        </Stack>
      </Stack>
    </>
  );
  const headerSx = { display: "block", width: "100%", textAlign: "left", px: { xs: 1.25, md: 1.5 }, py: 1 } as const;
  return (
    <RowShell
      top={top}
      bottom={bottom}
      when={<WhenColumn label={when} age={age} />}
      dot={<Dot mark={mark} hollow={manual} />}
    >
      <Box sx={cardSx(theme, tone, open)}>
        {expandable ? (
          <ButtonBase
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={`${episodeTitleText(episode)}, ${episodeWhen(episode, true)}`}
            sx={headerSx}
          >
            {header}
          </ButtonBase>
        ) : (
          <Box sx={headerSx}>{header}</Box>
        )}
        <Collapse in={open} unmountOnExit>
          <Box sx={{ px: { xs: 1.25, md: 1.5 }, pb: 1.25, borderTop: `1px solid ${subtleBorder(theme)}` }}>
            {episode.visits.length > 0 && (
              <Box sx={{ pt: 0.5 }}>
                {episode.visits.map((visit, index) => (
                  <VisitLine
                    key={`${visit.conclusionId ?? "a"}-${visit.legacyConclusionId ?? ""}-${visit.on}-${index}`}
                    visit={visit}
                    canViewConclusions={handlers.canViewConclusions}
                    onConclusion={handlers.onConclusion}
                  />
                ))}
              </Box>
            )}
            {episode.medications.length > 0 && (
              <Box sx={{ pt: 0.75 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                  Препараты — подробно в разделе «Препараты»
                </Typography>
                {episode.medications.map((course) => (
                  <Typography key={course.id} variant="body2">
                    {medicationCaption(course)}
                    <Box component="span" sx={{ color: "text.secondary" }}>
                      {" · "}
                      {course.endedOn ? `${formatDate(course.startedOn)}–${formatDate(course.endedOn)}` : `с ${formatDate(course.startedOn)}`}
                    </Box>
                  </Typography>
                ))}
              </Box>
            )}
            {handlers.canManage && (
              <Stack direction="row" gap={1} flexWrap="wrap" sx={{ pt: 1.25 }}>
                {!episode.isChronic && (
                  <AppButton size="small" variant="outlined" startIcon={<MonitorHeartOutlined />} onClick={() => handlers.onChronic(episode)}>
                    Хроническое
                  </AppButton>
                )}
                <AppButton size="small" variant="outlined" startIcon={<LocalHospitalOutlined />} onClick={() => handlers.onStayFromEpisode(episode)}>
                  Была госпитализация
                </AppButton>
                {manual && (
                  <AppButton size="small" startIcon={<EditOutlined />} onClick={() => handlers.onEditManual(episode)}>
                    Изменить
                  </AppButton>
                )}
              </Stack>
            )}
          </Box>
        </Collapse>
      </Box>
    </RowShell>
  );
};

const StayRibbonRow: React.FC<{ row: Hospitalization; top: Segment; bottom: Segment; birthDate: string | null; handlers: RibbonHandlers }> = ({
  row,
  top,
  bottom,
  birthDate,
  handlers,
}) => {
  const theme = useTheme();
  const tone = markColor(theme, "stay");
  const diagnosis = row.conditionTitle ?? row.diagnosisTitle;
  const docs = stayDocsCaption(row.attachments ?? []);
  const body = (
    <>
      <MobileWhen label={stayPeriod(row)} />
      <Stack direction="row" gap={1} alignItems="flex-start">
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" fontWeight={700} sx={{ overflowWrap: "anywhere" }}>
            Госпитализация · {row.facility}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="div" sx={{ overflowWrap: "anywhere" }}>
            {[diagnosis, docs].filter(Boolean).join(" · ") || "Диагноз не указан"}
          </Typography>
        </Box>
      </Stack>
    </>
  );
  return (
    <RowShell
      top={top}
      bottom={bottom}
      when={<WhenColumn label={stayPeriod(row, false)} age={precisionAge(row.admittedOn, "day", birthDate)} />}
      dot={<Dot mark="stay" />}
    >
      {handlers.canManage ? (
        <ButtonBase
          onClick={() => handlers.onOpenStay(row)}
          sx={{ ...cardSx(theme, tone), display: "block", width: "100%", textAlign: "left", px: { xs: 1.25, md: 1.5 }, py: 1 }}
        >
          {body}
        </ButtonBase>
      ) : (
        <Box sx={{ ...cardSx(theme, tone), px: { xs: 1.25, md: 1.5 }, py: 1 }}>{body}</Box>
      )}
    </RowShell>
  );
};

const InfectionRibbonRow: React.FC<{ info: InfectionSummary; top: Segment; bottom: Segment; handlers: RibbonHandlers }> = ({
  info,
  top,
  bottom,
  handlers,
}) => {
  const theme = useTheme();
  const tone = markColor(theme, "infection");
  const record = info.record;
  const when = record?.occurredOn ? formatPrecisionDate(record.occurredOn, record.datePrecision) : "дата неизвестна";
  const body = (
    <>
      <MobileWhen label={when} />
      <Stack direction="row" gap={1} alignItems="flex-start">
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" fontWeight={700} sx={{ overflowWrap: "anywhere" }}>
            {infectionRibbonText(info)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Детская инфекция{info.codes.length ? ` · ${info.codes.join(", ")}` : ""}
          </Typography>
        </Box>
        <Tag tone="primary">вручную</Tag>
      </Stack>
    </>
  );
  return (
    <RowShell top={top} bottom={bottom} when={<WhenColumn label={when} muted={!record?.occurredOn} />} dot={<Dot mark="infection" hollow />}>
      {handlers.canManage ? (
        <ButtonBase
          onClick={() => handlers.onOpenInfection(info)}
          sx={{ ...cardSx(theme, tone), display: "block", width: "100%", textAlign: "left", px: { xs: 1.25, md: 1.5 }, py: 1 }}
        >
          {body}
        </ButtonBase>
      ) : (
        <Box sx={{ ...cardSx(theme, tone), px: { xs: 1.25, md: 1.5 }, py: 1 }}>{body}</Box>
      )}
    </RowShell>
  );
};

const YearRow: React.FC<{ group: RibbonYear; top: Segment; bottom: Segment }> = ({ group, top, bottom }) => (
  <Box sx={{ display: "grid", gridTemplateColumns: COLUMNS, columnGap: COLUMN_GAP }}>
    <Box sx={{ display: { xs: "none", md: "block" }, textAlign: "right", py: 1 }}>
      <Typography sx={{ fontSize: 15, fontWeight: 800, letterSpacing: ".04em", fontVariantNumeric: "tabular-nums" }}>
        {group.year ?? "—"}
      </Typography>
    </Box>
    <Rail
      top={top}
      bottom={bottom}
      dotTop={21}
      dot={<Box sx={(theme) => ({ width: 8, height: 8, borderRadius: "2px", bgcolor: theme.palette.text.secondary, transform: "rotate(45deg)" })} />}
    />
    <Stack direction="row" alignItems="center" gap={1} sx={{ py: 1, minWidth: 0 }}>
      <Typography sx={{ display: { md: "none" }, fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
        {group.year ?? "Без даты"}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
        {group.year == null ? <Box component="span" sx={{ display: { xs: "none", md: "inline" } }}>Без даты · </Box> : null}
        {yearCaption(group)}
      </Typography>
      <Box sx={(theme) => ({ flex: 1, borderTop: `1px solid ${subtleBorder(theme)}` })} />
    </Stack>
  </Box>
);

interface IllnessRibbonProps {
  groups: RibbonYear[];
  birthDate: string | null;
  handlers: RibbonHandlers;
}

type Line = { kind: "year"; key: string; group: RibbonYear } | { kind: "item"; key: string; item: RibbonItem };

/**
 * Лента по годам (§4.1): случаи болезни, госпитализации и отметки детских
 * инфекций, новые сверху. Случай раскрывается: приёмы с заключениями, курсы
 * препаратов и кнопки «Хроническое», «Была госпитализация», «Изменить».
 */
export const IllnessRibbon: React.FC<IllnessRibbonProps> = ({ groups, birthDate, handlers }) => {
  const [limit, setLimit] = React.useState(RIBBON_PAGE);
  const visible = limitRibbon(groups, limit);
  const lines: Line[] = [];
  for (const group of visible.groups) {
    lines.push({ kind: "year", key: group.key, group });
    for (const item of group.items) lines.push({ kind: "item", key: item.key, item });
  }
  return (
    <Box>
      {lines.map((line, index) => {
        const top: Segment = index === 0 ? "none" : "solid";
        const bottom: Segment = index === lines.length - 1 ? "none" : "solid";
        if (line.kind === "year") return <YearRow key={line.key} group={line.group} top={top} bottom={bottom} />;
        const item = line.item;
        if (item.kind === "episode") {
          return <EpisodeRow key={line.key} episode={item.episode} birthDate={birthDate} top={top} bottom={bottom} handlers={handlers} />;
        }
        if (item.kind === "hospitalization") {
          return <StayRibbonRow key={line.key} row={item.row} birthDate={birthDate} top={top} bottom={bottom} handlers={handlers} />;
        }
        return <InfectionRibbonRow key={line.key} info={item.info} top={top} bottom={bottom} handlers={handlers} />;
      })}
      {visible.hidden > 0 && (
        <Box sx={{ pl: { xs: "24px", md: "126px" }, pt: 0.5 }}>
          <AppButton variant="outlined" size="small" onClick={() => setLimit((value) => value + RIBBON_PAGE * 2)}>
            Показать ещё {Math.min(RIBBON_PAGE * 2, visible.hidden)} из {visible.hidden}
          </AppButton>
        </Box>
      )}
    </Box>
  );
};
