import type { FamilyLine, FamilyMember, FamilyRelation, NeonatalScreening, PersonSex } from "../../../api/health";
import { frequentIllness, type Factor } from "./anamnesisFactors";
import { buildLifeAnamnesisParagraph, type LifeAnamnesisParagraph } from "./anamnesisParagraph";
import {
  DEFAULT_SETTINGS,
  THRESHOLDS,
  anamnesisFactors,
  anamnesisFlags,
  assessBiological,
  assessGenealogical,
  assessSocial,
  completeness,
  suggestRiskGroups,
  type AnamnesisFlag,
  type AnamnesisSettings,
  type BiologicalAssessment,
  type Completeness,
  type GenealogicalAssessment,
  type RiskSuggestion,
  type SocialAssessment,
} from "./anamnesisRules";
import type { AnamnesisInput, AssessmentKind } from "./anamnesisTypes";
import { pedigreeLayout, type PedigreeLayout, type PedigreeNode } from "./pedigreeLayout";
import { pregnancyTimeline, type PregnancyTimelineLayout } from "./pregnancyTimeline";
import type { RiskDrawerState } from "./RiskGroupDrawer";
import { ageParts } from "./russian";

/** Всё, что показывает раздел, — одним расчётом на дату. */
export interface AnamnesisModel {
  input: AnamnesisInput;
  at: string;
  factors: Factor[];
  genealogy: GenealogicalAssessment;
  bio: BiologicalAssessment;
  social: SocialAssessment;
  suggestions: RiskSuggestion[];
  flags: AnamnesisFlag[];
  completeness: Completeness;
  paragraph: LifeAnamnesisParagraph;
  pedigree: PedigreeLayout;
  timeline: PregnancyTimelineLayout;
  frequentIll: boolean;
  /** Ребёнку до года — незаполненный счётчик оранжевый. */
  underOneYear: boolean;
  /** Раздел пуст — приглашение «Заполните анамнез…». */
  empty: boolean;
}

export function buildAnamnesisModel(
  input: AnamnesisInput,
  at: string,
  options: { canSeeSensitive: boolean; canSeeVaccinations: boolean; settings?: AnamnesisSettings },
): AnamnesisModel {
  const settings = options.settings ?? DEFAULT_SETTINGS;
  const factors = anamnesisFactors(input, at, settings);
  const genealogy = assessGenealogical(input, settings.scales.genealogical);
  const bio = assessBiological(input, at, settings, factors);
  const social = assessSocial(input, { canSeeSensitive: options.canSeeSensitive }, settings.scales.social);
  const age = ageParts(input.birthDate, at);
  const profile = input.profile;
  const empty =
    !input.perinatal?.exists &&
    !input.social?.exists &&
    !input.screenings.length &&
    !input.riskGroups.length &&
    !input.family.length &&
    profile?.gestationalAgeWeeks == null &&
    profile?.birthWeightG == null &&
    !profile?.deliveryType &&
    profile?.apgar1min == null;
  return {
    input,
    at,
    factors,
    genealogy,
    bio,
    social,
    suggestions: suggestRiskGroups(input, at, settings, factors),
    flags: anamnesisFlags(input, at, settings, factors),
    completeness: completeness(input),
    paragraph: buildLifeAnamnesisParagraph(input, {
      at,
      canSeeSensitive: options.canSeeSensitive,
      canSeeVaccinations: options.canSeeVaccinations,
      settings,
    }),
    pedigree: pedigreeLayout(
      input.family,
      { sex: input.sex, birthDate: input.birthDate, consanguineous: input.social?.parentsConsanguineous === true },
      at,
    ),
    timeline: pregnancyTimeline(input.perinatal, input.profile),
    frequentIll: frequentIllness(input, at, THRESHOLDS)?.isFrequent ?? false,
    underOneYear: age != null && age.years < 1,
    empty,
  };
}

/** Что вкладки могут открыть: окна §5 и соседние разделы книжки. */
export interface AnamnesisActions {
  canManage: boolean;
  /** Право `medical.health.sensitive.view` (и сервер отдал закрытые сведения). */
  canSeeSensitive: boolean;
  canSeeVaccinations: boolean;
  openPerinatal: (tab: "pregnancy" | "birth") => void;
  openNewborn: () => void;
  openScreening: (screening: NeonatalScreening | null, kind?: "neonatal" | "hearing") => void;
  openSocial: () => void;
  openSensitive: () => void;
  openAssessment: (kind: AssessmentKind, preset?: boolean) => void;
  openRisk: (state: RiskDrawerState) => void;
  openMember: (member: FamilyMember | null, preset?: { relation: FamilyRelation; line: FamilyLine; sex: PersonSex } | null) => void;
  /** Переход в раздел книжки, если он есть в программе. */
  openSection?: (type: string) => void;
  hasSection?: (type: string) => boolean;
}

/** Нажатие на символ родословной: свой родственник или новый с уже выбранным родством. */
export function pedigreeClick(actions: AnamnesisActions, model: AnamnesisModel) {
  return (node: PedigreeNode) => {
    if (!actions.canManage) return;
    if (node.placeholder) {
      actions.openMember(null, { relation: node.placeholder.relation, line: node.placeholder.line, sex: node.sex });
      return;
    }
    const member = model.input.family.find((row) => row.id === node.memberId);
    if (member) actions.openMember(member);
  };
}
