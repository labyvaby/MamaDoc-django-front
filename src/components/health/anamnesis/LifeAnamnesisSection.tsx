import React from "react";
import { Alert, Box, ButtonBase, Popover, Stack, Tab, Tabs, Typography } from "@mui/material";
import EditNoteOutlined from "@mui/icons-material/EditNoteOutlined";
import HistoryEduOutlined from "@mui/icons-material/HistoryEduOutlined";
import SubjectOutlined from "@mui/icons-material/SubjectOutlined";

import type { FamilyMember, NeonatalScreening, ScreeningKind } from "../../../api/health";
import { AppButton, AppCard, ListEmptyState } from "../../ui";
import { FamilyMemberDrawer, type RelativePreset } from "../FamilyMemberDrawer";
import { AssessmentDrawer, type AssessmentRequest } from "./AssessmentDrawer";
import { factorText } from "./anamnesisFactors";
import { buildAnamnesisModel, type AnamnesisActions } from "./anamnesisModel";
import { firstFillTarget, type FillTarget } from "./anamnesisRules";
import type { AssessmentKind } from "./anamnesisTypes";
import { headerLine } from "./anamnesisView";
import { FamilyTab } from "./FamilyTab";
import { HeredityTab } from "./HeredityTab";
import { IllnessTab } from "./IllnessTab";
import { NewbornDrawer } from "./NewbornDrawer";
import { NewbornTab } from "./NewbornTab";
import { OverviewTab } from "./OverviewTab";
import { PerinatalDrawer, type PerinatalTab } from "./PerinatalDrawer";
import { PregnancyTab } from "./PregnancyTab";
import { RiskGroupDrawer, type RiskDrawerState } from "./RiskGroupDrawer";
import { ScreeningDrawer } from "./ScreeningDrawer";
import { SensitiveDrawer } from "./SensitiveDrawer";
import { SocialDrawer } from "./SocialDrawer";
import { useAnamnesisInput } from "./useAnamnesis";

type TabKey = "overview" | "pregnancy" | "newborn" | "heredity" | "family" | "illness";

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "overview", label: "Обзор" },
  { key: "pregnancy", label: "Беременность и роды" },
  { key: "newborn", label: "Новорождённый" },
  { key: "heredity", label: "Наследственность" },
  { key: "family", label: "Семья и быт" },
  { key: "illness", label: "Болезни и аллергии" },
];

type DrawerState =
  | { kind: "perinatal"; tab: PerinatalTab }
  | { kind: "newborn" }
  | { kind: "screening"; screening: NeonatalScreening | null; screeningKind: ScreeningKind }
  | { kind: "social" }
  | { kind: "sensitive" }
  | { kind: "assessment"; request: AssessmentRequest }
  | { kind: "risk"; state: RiskDrawerState }
  | { kind: "member"; member: FamilyMember | null; preset: RelativePreset | null };

interface LifeAnamnesisSectionProps {
  patientId: number;
  title?: string;
  /** Переход в соседний раздел книжки (аллергии, диагнозы, прививки). */
  openSection?: (type: string) => void;
  hasSection?: (type: string) => boolean;
  /** Дата расчёта (YYYY-MM-DD); по умолчанию сегодня. */
  at?: string;
}

/**
 * Раздел книжки «Анамнез жизни» (ТЗ docs/specs/2026-10-04-book-life-anamnesis-design.md):
 * три оценки анамнеза, группы риска с пересмотрами, беременность по неделям,
 * новорождённость, родословная, семья и быт, абзац для заключения.
 */
export const LifeAnamnesisSection: React.FC<LifeAnamnesisSectionProps> = ({ patientId, title = "Анамнез жизни", openSection, hasSection, at: atProp }) => {
  const data = useAnamnesisInput(patientId, { at: atProp });
  const { access, input, at, life, health } = data;
  const [tab, setTab] = React.useState<TabKey>("overview");
  const [drawer, setDrawer] = React.useState<DrawerState | null>(null);
  const [missingAnchor, setMissingAnchor] = React.useState<HTMLElement | null>(null);
  const paragraphRef = React.useRef<HTMLDivElement>(null);
  const canSeeSensitive = access.canSeeSensitive && Boolean(life?.sensitiveAccess);

  const model = React.useMemo(
    () => (input ? buildAnamnesisModel(input, at, { canSeeSensitive, canSeeVaccinations: access.canSeeVaccinations }) : null),
    [input, at, canSeeSensitive, access.canSeeVaccinations],
  );

  const screeningKindToAdd = (): ScreeningKind => {
    const rows = input?.screenings ?? [];
    if (!rows.some((row) => row.kind === "neonatal")) return "neonatal";
    if (!rows.some((row) => row.kind === "hearing")) return "hearing";
    return "neonatal";
  };

  const openTarget = (target: FillTarget | null) => {
    if (target === "pregnancy" || target === "birth" || target == null) setDrawer({ kind: "perinatal", tab: target === "birth" ? "birth" : "pregnancy" });
    else if (target === "newborn") setDrawer({ kind: "newborn" });
    else if (target === "screening") setDrawer({ kind: "screening", screening: null, screeningKind: screeningKindToAdd() });
    else if (target === "social") setDrawer({ kind: "social" });
    else setTab("heredity");
  };

  const openAssessment = (kind: AssessmentKind, preset = false) => {
    if (!model) return;
    const assessment = kind === "genealogical" ? model.genealogy : kind === "biological" ? model.bio : model.social;
    setDrawer({
      kind: "assessment",
      request: {
        kind,
        scale: assessment.scale,
        manual: assessment.manual,
        computed: assessment.computedLevel,
        preset: preset ? { level: "high", reason: model.bio.strongest.map(factorText).join(", ") } : undefined,
      },
    });
  };

  const actions: AnamnesisActions = {
    canManage: access.canManage,
    canSeeSensitive,
    canSeeVaccinations: access.canSeeVaccinations,
    openPerinatal: (perinatalTab) => setDrawer({ kind: "perinatal", tab: perinatalTab }),
    openNewborn: () => setDrawer({ kind: "newborn" }),
    openScreening: (screening, kind) => setDrawer({ kind: "screening", screening, screeningKind: kind ?? screening?.kind ?? screeningKindToAdd() }),
    openSocial: () => setDrawer({ kind: "social" }),
    openSensitive: () => setDrawer({ kind: "sensitive" }),
    openAssessment,
    openRisk: (state) => setDrawer({ kind: "risk", state }),
    openMember: (member, preset) => setDrawer({ kind: "member", member, preset: preset ?? null }),
    openSection,
    hasSection,
  };

  const showParagraph = () => {
    setTab("overview");
    window.setTimeout(() => paragraphRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  const close = () => setDrawer(null);
  const completeness = model?.completeness;
  const counterWarn = model != null && model.underOneYear && model.completeness.filled < model.completeness.total;

  const header = (
    <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ md: "center" }} gap={1.5} sx={{ px: 2, pt: 2 }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h6" fontWeight={700}>
          {title}
        </Typography>
        {model && completeness && (
          <ButtonBase
            onClick={(event) => completeness.missing.length && setMissingAnchor(event.currentTarget)}
            disabled={!completeness.missing.length}
            sx={{ borderRadius: "6px", textAlign: "left", justifyContent: "flex-start" }}
          >
            <Typography variant="body2" sx={{ color: counterWarn ? "warning.main" : "text.secondary", fontWeight: counterWarn ? 600 : 400 }}>
              {headerLine(completeness, life)}
            </Typography>
          </ButtonBase>
        )}
      </Box>
      {model && (
        <Stack direction="row" gap={1} flexWrap="wrap" sx={{ flexShrink: 0 }}>
          {access.canManage && (
            <AppButton variant="outlined" size="small" startIcon={<EditNoteOutlined />} onClick={() => openTarget(firstFillTarget(model.completeness))}>
              Заполнить
            </AppButton>
          )}
          {!model.empty && (
            <AppButton variant="contained" size="small" startIcon={<SubjectOutlined />} onClick={showParagraph}>
              Абзац для заключения
            </AppButton>
          )}
        </Stack>
      )}
    </Stack>
  );

  let content: React.ReactNode;
  if (!access.canView) {
    content = <Alert severity="info">Нет права просматривать медкарту.</Alert>;
  } else if (data.isError) {
    content = <Alert severity="error">Не удалось загрузить раздел «{title}».</Alert>;
  } else if (data.isLoading || !model) {
    content = (
      <Typography variant="body2" color="text.secondary">
        Загрузка…
      </Typography>
    );
  } else if (model.empty) {
    content = (
      <ListEmptyState
        icon={<HistoryEduOutlined />}
        title="Анамнез жизни не заполнен"
        description="Заполните анамнез по обменной карте и со слов родителей."
        action={
          access.canManage ? (
            <AppButton variant="outlined" startIcon={<EditNoteOutlined />} onClick={() => openTarget("pregnancy")}>
              Заполнить
            </AppButton>
          ) : undefined
        }
      />
    );
  } else {
    content = (
      <Stack gap={2}>
        <Tabs
          value={tab}
          onChange={(_, value: TabKey) => setTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{ minHeight: 40, borderBottom: 1, borderColor: "divider", "& .MuiTab-root": { minHeight: 40, textTransform: "none", px: 1.5 } }}
        >
          {TABS.map((item) => (
            <Tab key={item.key} value={item.key} label={item.label} />
          ))}
        </Tabs>
        {tab === "overview" && <OverviewTab model={model} actions={actions} paragraphRef={paragraphRef} />}
        {tab === "pregnancy" && <PregnancyTab model={model} actions={actions} />}
        {tab === "newborn" && <NewbornTab model={model} actions={actions} />}
        {tab === "heredity" && <HeredityTab model={model} actions={actions} />}
        {tab === "family" && <FamilyTab model={model} actions={actions} />}
        {tab === "illness" && <IllnessTab model={model} actions={actions} patientId={patientId} />}
      </Stack>
    );
  }

  return (
    <>
      <AppCard variant="outlined" header={header}>
        {content}
      </AppCard>
      <Popover
        open={missingAnchor != null}
        anchorEl={missingAnchor}
        onClose={() => setMissingAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        slotProps={{ paper: { sx: { p: 1.5, maxWidth: 360, borderRadius: "12px" } } }}
      >
        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
          Не заполнено
        </Typography>
        <Stack gap={0.25}>
          {completeness?.missing.map((item) => (
            <ButtonBase
              key={item.index}
              disabled={!access.canManage && item.target !== "heredity"}
              onClick={() => {
                setMissingAnchor(null);
                openTarget(item.target);
              }}
              sx={{ justifyContent: "flex-start", textAlign: "left", borderRadius: "6px", px: 0.75, py: 0.5, "&:hover": { bgcolor: "action.hover" } }}
            >
              <Typography variant="body2">
                {item.index}. {item.title}
              </Typography>
            </ButtonBase>
          ))}
        </Stack>
      </Popover>
      {model && life && health && (
        <>
          <PerinatalDrawer
            open={drawer?.kind === "perinatal"}
            patientId={patientId}
            perinatal={life.perinatal}
            profile={health.profile}
            initialTab={drawer?.kind === "perinatal" ? drawer.tab : "pregnancy"}
            onClose={close}
            onNext={() => setDrawer({ kind: "newborn" })}
          />
          <NewbornDrawer
            open={drawer?.kind === "newborn"}
            patientId={patientId}
            birthDate={model.input.birthDate}
            sex={model.input.sex}
            perinatal={life.perinatal}
            profile={health.profile}
            screenings={life.screenings}
            onClose={close}
            onScreening={(screening) => setDrawer({ kind: "screening", screening, screeningKind: screening?.kind ?? screeningKindToAdd() })}
            onNext={() => setDrawer({ kind: "screening", screening: null, screeningKind: screeningKindToAdd() })}
          />
          <ScreeningDrawer
            open={drawer?.kind === "screening"}
            patientId={patientId}
            birthDate={model.input.birthDate}
            screening={drawer?.kind === "screening" ? drawer.screening : null}
            initialKind={drawer?.kind === "screening" ? drawer.screeningKind : "neonatal"}
            onClose={close}
            onNext={drawer?.kind === "screening" && !drawer.screening ? () => setDrawer({ kind: "social" }) : undefined}
          />
          <SocialDrawer
            open={drawer?.kind === "social"}
            patientId={patientId}
            social={life.social}
            family={model.input.family}
            onClose={close}
            onEditMember={(member, relation) =>
              setDrawer({ kind: "member", member, preset: member ? null : { relation, line: "", sex: relation === "mother" ? "female" : "male" } })
            }
          />
          {canSeeSensitive && <SensitiveDrawer open={drawer?.kind === "sensitive"} patientId={patientId} sensitive={life.sensitive} onClose={close} />}
          <AssessmentDrawer open={drawer?.kind === "assessment"} patientId={patientId} request={drawer?.kind === "assessment" ? drawer.request : null} onClose={close} />
          <RiskGroupDrawer
            open={drawer?.kind === "risk"}
            patientId={patientId}
            state={drawer?.kind === "risk" ? drawer.state : null}
            input={model.input}
            factors={model.factors}
            at={at}
            frequentIll={model.frequentIll}
            onState={(state) => setDrawer({ kind: "risk", state })}
            onClose={close}
          />
          <FamilyMemberDrawer
            open={drawer?.kind === "member"}
            patientId={patientId}
            member={drawer?.kind === "member" ? drawer.member : null}
            suggestion={null}
            suggestions={[]}
            preset={drawer?.kind === "member" ? drawer.preset : null}
            onClose={close}
          />
        </>
      )}
    </>
  );
};
