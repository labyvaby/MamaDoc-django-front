import React from "react";
import {
  Alert,
  Box,
  ButtonBase,
  FormControlLabel,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Switch,
  Tooltip,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import BloodtypeOutlined from "@mui/icons-material/BloodtypeOutlined";
import HealingOutlined from "@mui/icons-material/HealingOutlined";
import MedicalServicesOutlined from "@mui/icons-material/MedicalServicesOutlined";
import MoreHorizOutlined from "@mui/icons-material/MoreHorizOutlined";
import EmergencyOutlined from "@mui/icons-material/EmergencyOutlined";
import VaccinesOutlined from "@mui/icons-material/VaccinesOutlined";
import WarningAmberRounded from "@mui/icons-material/WarningAmberRounded";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { getHospitalizations, type Surgery, type SurgeryKind } from "../../api/health";
import { DJANGO_LIST_STALE_TIME_MS, djangoQueryKeys } from "../../api/queryKeys";
import { pluralRu } from "../../utility/amountInWords";
import { subtleBorder } from "../../theme/uiHelpers";
import { AppCard, ListEmptyState, ListLoadingSkeleton } from "../ui";
import { AttachmentStrip } from "./HealthFilesField";
import { HealthHeaderButton } from "./HealthHeaderButton";
import { attachmentsCaption, formatPrecisionDate, lowerFirst, precisionAge } from "./illnessData";
import { cardContainerSx } from "./illnessUi";
import { Tag, type TagTone } from "./IllnessRibbon";
import { SurgeryDrawer } from "./SurgeryDrawer";
import {
  SURGERY_KIND_TAGS,
  TRANSFUSION_VACCINE_HINT,
  anesthesiaLabel,
  anesthesiaSummary,
  injuriesHint,
  outcomeLabel,
  recentTransfusion,
  stayLabel,
  surgeryDetailsLine,
  transfusionLead,
  treatmentsLabel,
} from "./surgeryData";
import { useHealthScope, usePatientHealth, usePatientSurgeries } from "./useHealth";

const KIND_TONE: Record<SurgeryKind, TagTone> = { operation: "primary", injury: "warning", procedure: "neutral", transfusion: "error" };

const KIND_ICON: Record<SurgeryKind, React.ReactElement> = {
  operation: <MedicalServicesOutlined fontSize="small" />,
  injury: <HealingOutlined fontSize="small" />,
  procedure: <EmergencyOutlined fontSize="small" />,
  transfusion: <BloodtypeOutlined fontSize="small" />,
};

const KIND_COUNT_WORDS: Record<SurgeryKind, [string, string, string]> = {
  operation: ["операция", "операции", "операций"],
  injury: ["травма", "травмы", "травм"],
  procedure: ["процедура", "процедуры", "процедур"],
  transfusion: ["переливание", "переливания", "переливаний"],
};

/** «Внесено: 1 травма, 1 процедура» — когда строки наркоза нет. */
function countsLine(rows: ReadonlyArray<Surgery>): string {
  const parts = (Object.keys(KIND_COUNT_WORDS) as SurgeryKind[])
    .map((kind) => {
      const count = rows.filter((row) => row.kind === kind).length;
      return count ? `${count} ${pluralRu(count, KIND_COUNT_WORDS[kind])}` : "";
    })
    .filter(Boolean);
  return parts.length ? `Внесено: ${parts.join(", ")}` : "Операций, травм и переливаний не внесено";
}

const SurgeryCard: React.FC<{ row: Surgery; birthDate: string | null; canManage: boolean; onOpen: (row: Surgery) => void }> = ({
  row,
  birthDate,
  canManage,
  onOpen,
}) => {
  const theme = useTheme();
  const refuted = row.status === "refuted";
  const tone = KIND_TONE[row.kind];
  const accent = tone === "neutral" ? theme.palette.text.secondary : theme.palette[tone].main;
  const anesthesia = anesthesiaLabel(row);
  const outcome = outcomeLabel(row.outcome);
  const stay = stayLabel(row);
  const treatments = row.kind === "injury" ? treatmentsLabel(row.treatments) : "";
  const complications = row.complications.trim();
  const facts = [
    formatPrecisionDate(row.performedOn, row.datePrecision),
    precisionAge(row.performedOn, row.datePrecision, birthDate),
    row.facility.trim(),
    row.surgeon.trim(),
  ].filter(Boolean);
  const reasonWord = row.kind === "injury" ? "как случилось" : row.kind === "transfusion" ? "причина" : "показание";
  const details = [row.reason.trim() ? `${reasonWord}: ${lowerFirst(row.reason)}` : "", treatments].filter(Boolean).join(" · ");
  const body = (
    <Stack direction="row" gap={1.25} alignItems="flex-start" sx={{ width: "100%", textAlign: "left" }}>
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: "10px",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: tone === "neutral" ? "text.secondary" : theme.palette[tone].onSurface,
          bgcolor: alpha(accent, theme.palette.mode === "dark" ? 0.2 : 0.1),
        }}
      >
        {KIND_ICON[row.kind]}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" gap={1} alignItems="flex-start" justifyContent="space-between">
          <Typography
            variant="body2"
            fontWeight={700}
            sx={{ overflowWrap: "anywhere", textDecoration: refuted ? "line-through" : undefined, lineHeight: 1.45 }}
          >
            {row.title}
          </Typography>
          <Stack direction="row" gap={0.5} sx={{ flexShrink: 0 }}>
            {refuted && <Tag>ошибочно внесена</Tag>}
            <Tag tone={tone}>{SURGERY_KIND_TAGS[row.kind]}</Tag>
          </Stack>
        </Stack>
        <Typography variant="caption" color="text.secondary" component="div" sx={{ fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}>
          {facts.join(" · ")}
        </Typography>
        {details && (
          <Typography variant="caption" color="text.secondary" component="div" sx={{ overflowWrap: "anywhere" }}>
            {details}
          </Typography>
        )}
        {(anesthesia || outcome || stay) && (
          <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ mt: 0.75 }}>
            {anesthesia && (
              <Tag tone={anesthesia.tone === "error" ? "error" : anesthesia.tone === "success" ? "success" : "neutral"}>{anesthesia.label}</Tag>
            )}
            {outcome && <Tag tone={outcome.tone === "success" ? "success" : outcome.tone === "warning" ? "warning" : "info"}>{outcome.label}</Tag>}
            {stay && <Tag tone="error">{stay}</Tag>}
          </Stack>
        )}
        {(complications || row.anesthesiaNotes.trim()) && (
          <Typography variant="caption" component="div" sx={{ mt: 0.5, color: "error.onSurface", fontWeight: 600, overflowWrap: "anywhere" }}>
            {[
              row.anesthesiaNotes.trim() ? `обезболивание: ${row.anesthesiaNotes.trim()}` : "",
              complications ? `${row.kind === "transfusion" ? "реакция" : "осложнения"}: ${complications}` : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </Typography>
        )}
        {row.notes.trim() && (
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.25, overflowWrap: "anywhere" }}>
            {row.notes.trim()}
          </Typography>
        )}
      </Box>
    </Stack>
  );
  return (
    <Box sx={{ p: 1.5, borderRadius: "14px", border: `1px solid ${subtleBorder(theme)}`, opacity: refuted ? 0.65 : 1 }}>
      {canManage ? (
        <ButtonBase
          onClick={() => onOpen(row)}
          aria-label={[row.title, formatPrecisionDate(row.performedOn, row.datePrecision), surgeryDetailsLine(row)].filter(Boolean).join(". ")}
          sx={{ display: "block", width: "100%", borderRadius: "10px" }}
        >
          {body}
        </ButtonBase>
      ) : (
        body
      )}
      <AttachmentStrip attachments={row.attachments} caption={attachmentsCaption(row.attachments)} indent />
    </Box>
  );
};

interface SurgeriesSectionProps {
  patientId: number;
  canManage: boolean;
  birthDate?: string | null;
  title?: string;
}

/**
 * «Операции и травмы» (ТЗ 2026-10-04 §4.2): операции, травмы, процедуры и
 * переливания крови с обезболиванием, исходом, госпитализацией и документами;
 * в шапке — как ребёнок перенёс наркоз, ниже — подсказки о травмах и живых прививках.
 */
export const SurgeriesSection: React.FC<SurgeriesSectionProps> = ({ patientId, canManage, birthDate = null, title = "Операции и травмы" }) => {
  const theme = useTheme();
  const { orgId, scope, ready } = useHealthScope();
  const query = usePatientSurgeries(patientId);
  const [showRefuted, setShowRefuted] = React.useState(false);
  const [moreAnchor, setMoreAnchor] = React.useState<HTMLElement | null>(null);
  const [drawer, setDrawer] = React.useState<{ open: boolean; surgery: Surgery | null; kind: SurgeryKind }>({
    open: false,
    surgery: null,
    kind: "operation",
  });
  const summary = usePatientHealth(patientId, canManage);
  const stays = useQuery({
    queryKey: djangoQueryKeys.health.hospitalizations(patientId, orgId),
    queryFn: ({ signal }) => getHospitalizations(scope, patientId, signal),
    enabled: ready && canManage,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });
  const today = React.useMemo(() => dayjs(), []);

  const all = React.useMemo(
    () => [...(query.data ?? [])].sort((a, b) => b.performedOn.localeCompare(a.performedOn) || b.id - a.id),
    [query.data],
  );
  const recorded = all.filter((row) => row.status !== "refuted");
  const refutedCount = all.length - recorded.length;
  const shown = showRefuted ? all : recorded;
  const narcosis = anesthesiaSummary(all);
  const injuries = injuriesHint(all, today);
  const transfusion = recentTransfusion(all, today);
  const open = (kind: SurgeryKind, surgery: Surgery | null = null) => setDrawer({ open: true, surgery, kind });

  return (
    <>
      <AppCard
        variant="outlined"
        sx={cardContainerSx}
        header={
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1.5} sx={{ px: 2, pt: 2 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" fontWeight={700}>
                {title}
              </Typography>
              {query.isLoading ? (
                <Typography variant="body2" color="text.secondary">
                  Загрузка…
                </Typography>
              ) : narcosis ? (
                <Typography
                  variant="body2"
                  fontWeight={narcosis.danger ? 700 : 500}
                  sx={{ color: narcosis.danger ? theme.palette.error.onSurface : "text.secondary", overflowWrap: "anywhere" }}
                >
                  {narcosis.danger && <WarningAmberRounded sx={{ fontSize: 16, mr: 0.5, verticalAlign: "-3px" }} />}
                  {narcosis.text}
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  {countsLine(recorded)}
                </Typography>
              )}
            </Box>
            {canManage && (
              <Stack direction="row" gap={1} sx={{ flexShrink: 0 }}>
                <HealthHeaderButton label="Травма" icon={<HealingOutlined />} onClick={() => open("injury")} />
                <HealthHeaderButton label="Операция" icon={<MedicalServicesOutlined />} contained onClick={() => open("operation")} />
                <Tooltip title="Ещё: процедура, переливание">
                  <IconButton
                    aria-label="Ещё"
                    onClick={(event) => setMoreAnchor(event.currentTarget)}
                    sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: "10px" }}
                  >
                    <MoreHorizOutlined />
                  </IconButton>
                </Tooltip>
                <Menu anchorEl={moreAnchor} open={Boolean(moreAnchor)} onClose={() => setMoreAnchor(null)}>
                  <MenuItem
                    onClick={() => {
                      setMoreAnchor(null);
                      open("procedure");
                    }}
                  >
                    <EmergencyOutlined fontSize="small" sx={{ mr: 1.25, color: "text.secondary" }} />
                    Процедура
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      setMoreAnchor(null);
                      open("transfusion");
                    }}
                  >
                    <BloodtypeOutlined fontSize="small" sx={{ mr: 1.25, color: "text.secondary" }} />
                    Переливание крови
                  </MenuItem>
                </Menu>
              </Stack>
            )}
          </Stack>
        }
      >
        {query.isError ? (
          <Alert severity="error">Не удалось загрузить раздел «{title}».</Alert>
        ) : query.isLoading ? (
          <ListLoadingSkeleton rows={2} />
        ) : all.length === 0 ? (
          <ListEmptyState
            icon={<HealingOutlined />}
            title="Операций, травм и переливаний не внесено"
            description="Операции, травмы, процедуры и переливания крови — с обезболиванием, исходом и документами. Как ребёнок перенёс наркоз, увидят все в «Главном о здоровье»."
          />
        ) : (
          <Stack gap={1.25}>
            {injuries && (
              <Alert severity="warning" sx={{ py: 0.25 }}>
                {injuries}
              </Alert>
            )}
            {transfusion && (
              <Alert severity="info" icon={<VaccinesOutlined fontSize="small" />} sx={{ py: 0.25 }}>
                <b>{transfusionLead(transfusion)}.</b> {TRANSFUSION_VACCINE_HINT}
              </Alert>
            )}
            {shown.map((row) => (
              <SurgeryCard key={row.id} row={row} birthDate={birthDate} canManage={canManage} onOpen={(item) => open(item.kind, item)} />
            ))}
            {refutedCount > 0 && (
              <FormControlLabel
                sx={{ m: 0, alignSelf: "flex-start" }}
                control={<Switch size="small" checked={showRefuted} onChange={(event) => setShowRefuted(event.target.checked)} />}
                label={<Typography variant="caption">Показать ошибочно внесённые: {refutedCount}</Typography>}
              />
            )}
          </Stack>
        )}
      </AppCard>
      <SurgeryDrawer
        open={drawer.open}
        patientId={patientId}
        surgery={drawer.surgery}
        initialKind={drawer.kind}
        birthDate={birthDate}
        hospitalizations={stays.data ?? []}
        conditions={summary.data?.conditions ?? []}
        onClose={() => setDrawer((current) => ({ ...current, open: false }))}
      />
    </>
  );
};
