import dayjs from "dayjs";

import type { FamilyLine, FamilyMember, FamilyRelation, PersonSex } from "../../../api/health";
import { RELATION_META, memberSex, relationRole, relationTitle, type Generation } from "./anamnesisTypes";
import { diseaseShort } from "./familyDiseases";
import { ageNominative, ageParts, lowerFirst, plural, type ChildSex } from "./russian";

/**
 * Родословная из строк «Паспорта семьи» (ТЗ §4.4, справка §2.1): поколения
 * римскими цифрами, линия отца слева, матери справа, дедушка левее бабушки,
 * братья и сёстры по возрасту, ребёнок среди них. Пустые места матери, отца и
 * четырёх бабушек и дедушек — пунктиром с «+». Здесь только координаты.
 */

export const PEDIGREE = {
  symbol: 24,
  /** Шаг между людьми одного ряда. */
  slot: 96,
  /** Шаг между детьми одной пары. */
  kidSlot: 78,
  /** Половина расстояния между бабушкой и дедушкой. */
  couple: 52,
  rowGap: 100,
  top: 30,
  left: 40,
  /** Место под подписи справа и слева от крайних символов. */
  pad: 50,
} as const;

export interface PedigreeNode {
  key: string;
  memberId: number | null;
  /** Пустое место: нажатие открывает нового родственника с этим родством. */
  placeholder: { relation: FamilyRelation; line: FamilyLine } | null;
  proband: boolean;
  generation: Generation;
  x: number;
  y: number;
  sex: PersonSex;
  /** Есть болезни — закрашен. */
  affected: boolean;
  /** «Нет сведений» — «?» внутри. */
  unknown: boolean;
  deceased: boolean;
  /** «† в 62 г.» под символом. */
  death: string;
  role: string;
  /** Краткие названия болезней (до двух) и «+N». */
  diseases: string;
  /** «II-2» — номер в поколении. */
  code: string;
  tooltip: string;
}

export interface PedigreeLine {
  key: string;
  d: string;
  double?: boolean;
  dashed?: boolean;
}

export interface PedigreeLayout {
  width: number;
  height: number;
  nodes: PedigreeNode[];
  lines: PedigreeLine[];
  rows: Array<{ roman: string; y: number }>;
  /** «I-1 — гипертоническая болезнь». */
  legend: string[];
  /** «Не кровные: отчим, опекун». */
  nonBlood: string[];
}

export interface PedigreeChild {
  sex: ChildSex;
  birthDate: string | null;
  consanguineous: boolean;
}

const ROMAN = ["0", "I", "II", "III"];

type Draft = Omit<PedigreeNode, "x" | "y" | "code"> & { x: number };

function initials(fullName: string): string {
  const parts = fullName.replace(/^демо:\s*/i, "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  return parts.map((part, index) => (index === 0 ? part : `${part.charAt(0)}.`)).join(" ");
}

function byBirth(a: { birthDate: string | null }, b: { birthDate: string | null }): number {
  if (a.birthDate && b.birthDate) return a.birthDate.localeCompare(b.birthDate);
  if (a.birthDate) return -1;
  if (b.birthDate) return 1;
  return 0;
}

function draftOf(member: FamilyMember, at: string, withAge = false): Draft {
  const affected = member.healthStatus === "ill" && member.diseases.length > 0;
  const shorts = member.diseases.map(diseaseShort);
  const diseases = shorts.length > 2 ? `${shorts.slice(0, 2).join(", ")} +${shorts.length - 2}` : shorts.join(", ");
  const deceased = member.vitalStatus === "deceased";
  const death = deceased ? (member.deathAge != null ? `† в ${member.deathAge} г.` : member.deathYear != null ? `† ${member.deathYear}` : "†") : "";
  let role = relationRole(member);
  if (withAge && member.birthDate && !deceased) {
    const age = ageParts(member.birthDate, at);
    if (age) role = `${role}, ${age.years ? `${age.years} ${plural(age.years, "год", "года", "лет")}` : ageNominative(age)}`;
  }
  const who = [relationTitle(member), initials(member.fullName)].filter(Boolean).join(" · ");
  const titles = member.diseases.map((disease) => lowerFirst(disease.title)).join(", ");
  return {
    key: `m${member.id}`,
    memberId: member.id,
    placeholder: null,
    proband: false,
    generation: (RELATION_META[member.relation].generation ?? 3) as Generation,
    x: 0,
    sex: memberSex(member),
    affected,
    unknown: member.healthStatus === "unknown" || (member.healthStatus === "ill" && !member.diseases.length),
    deceased,
    death,
    role,
    diseases,
    tooltip: [who, titles || (member.healthStatus === "healthy" ? "здоров(а)" : "нет сведений"), death].filter(Boolean).join(" · "),
  };
}

function placeholder(relation: FamilyRelation, line: FamilyLine, generation: Generation, role: string, sex: PersonSex): Draft {
  return {
    key: `add:${relation}:${line}`,
    memberId: null,
    placeholder: { relation, line },
    proband: false,
    generation,
    x: 0,
    sex,
    affected: false,
    unknown: false,
    deceased: false,
    death: "",
    role,
    diseases: "",
    tooltip: `Добавить: ${role}`,
  };
}

export function pedigreeLayout(family: ReadonlyArray<FamilyMember>, child: PedigreeChild, at: string): PedigreeLayout {
  const blood = family.filter((member) => RELATION_META[member.relation]?.blood);
  const rows = (relation: FamilyRelation, line?: FamilyLine) =>
    blood.filter((member) => member.relation === relation && (line == null || member.line === line)).sort(byBirth);
  const first = (relation: FamilyRelation, line?: FamilyLine) => rows(relation, line)[0] ?? null;

  const father = first("father");
  const mother = first("mother");
  const fatherDraft = father ? draftOf(father, at) : placeholder("father", "", 2, "папа", "male");
  const motherDraft = mother ? draftOf(mother, at) : placeholder("mother", "", 2, "мама", "female");
  // Остальные строки отца и матери (если внесены дважды) — к тётям и дядям не относятся, просто рядом.
  const extraParents = [...rows("father").slice(1), ...rows("mother").slice(1)].map((member) => draftOf(member, at));

  const paternalSibs = [...rows("aunt", "paternal"), ...rows("uncle", "paternal")].sort(byBirth).map((member) => draftOf(member, at));
  const maternalSibs = [...rows("aunt", "maternal"), ...rows("uncle", "maternal")].sort(byBirth).map((member) => draftOf(member, at));
  const unlinedSibs = [...rows("aunt", ""), ...rows("uncle", "")].map((member) => draftOf(member, at));

  const grand = (relation: "grandfather" | "grandmother", line: "paternal" | "maternal") => {
    const row = first(relation, line);
    if (row) return draftOf(row, at);
    return placeholder(relation, line, 1, relation === "grandfather" ? "дедушка" : "бабушка", relation === "grandfather" ? "male" : "female");
  };
  const gfP = grand("grandfather", "paternal");
  const gmP = grand("grandmother", "paternal");
  const gfM = grand("grandfather", "maternal");
  const gmM = grand("grandmother", "maternal");
  const extraGrand = [
    ...rows("grandfather", "paternal").slice(1),
    ...rows("grandmother", "paternal").slice(1),
    ...rows("grandfather", "maternal").slice(1),
    ...rows("grandmother", "maternal").slice(1),
    ...rows("grandfather", ""),
    ...rows("grandmother", ""),
  ].map((member) => draftOf(member, at));

  // Дети пары: братья и сёстры по возрасту, ребёнок среди них.
  const proband: Draft & { birthDate: string | null } = {
    key: "proband",
    memberId: null,
    placeholder: null,
    proband: true,
    generation: 3,
    x: 0,
    sex: child.sex,
    affected: false,
    unknown: false,
    deceased: false,
    death: "",
    role: "ребёнок",
    diseases: "",
    tooltip: "Ребёнок",
    birthDate: child.birthDate,
  };
  const kids: Array<Draft & { birthDate: string | null }> = [
    ...rows("sibling").map((member) => ({ ...draftOf(member, at, true), birthDate: member.birthDate })),
    proband,
  ].sort(byBirth);
  const halfP = rows("half_sibling", "paternal").map((member) => draftOf(member, at, true));
  const halfM = [...rows("half_sibling", "maternal"), ...rows("half_sibling", "")].map((member) => draftOf(member, at, true));
  const cousinsP = rows("cousin", "paternal").map((member) => draftOf(member, at, true));
  const cousinsM = [...rows("cousin", "maternal"), ...rows("cousin", "")].map((member) => draftOf(member, at, true));
  const greatP = rows("great_grandparent", "paternal").map((member) => draftOf(member, at));
  const greatM = [...rows("great_grandparent", "maternal"), ...rows("great_grandparent", "")].map((member) => draftOf(member, at));

  // ── Горизонталь ──
  const { slot, kidSlot, couple } = PEDIGREE;
  const paternalBlock = [...paternalSibs, fatherDraft];
  paternalBlock.forEach((draft, index) => (draft.x = index * slot));
  const fatherX = fatherDraft.x;
  const kidsWidth = (kids.length - 1) * kidSlot;
  const paternalCenter = paternalBlock.length > 1 ? (paternalBlock[0].x + fatherX) / 2 : fatherX;
  let gap = Math.max(2 * couple + slot * 0.95, kidsWidth + slot * 0.7);
  const maternalOffsets = maternalSibs.map((_, index) => (index + 1) * slot);
  const maternalCenterOffset = maternalSibs.length ? maternalOffsets[maternalOffsets.length - 1] / 2 : 0;
  // Бабушки и дедушки двух линий не должны наезжать друг на друга.
  const minGrand = paternalCenter + couple + slot * 0.95 + couple;
  gap = Math.max(gap, minGrand - fatherX - maternalCenterOffset);
  motherDraft.x = fatherX + gap;
  maternalSibs.forEach((draft, index) => (draft.x = motherDraft.x + maternalOffsets[index]));
  const maternalCenter = motherDraft.x + maternalCenterOffset;
  gfP.x = paternalCenter - couple;
  gmP.x = paternalCenter + couple;
  gfM.x = maternalCenter - couple;
  gmM.x = maternalCenter + couple;
  const coupleMid = (fatherX + motherDraft.x) / 2;
  kids.forEach((draft, index) => (draft.x = coupleMid - kidsWidth / 2 + index * kidSlot));
  const kidsLeft = kids[0].x;
  const kidsRight = kids[kids.length - 1].x;
  [...halfP, ...cousinsP].reverse().forEach((draft, index) => (draft.x = kidsLeft - (index + 1) * kidSlot));
  [...halfM, ...cousinsM].forEach((draft, index) => (draft.x = kidsRight + (index + 1) * kidSlot));
  greatP.forEach((draft, index) => (draft.x = paternalCenter - ((greatP.length - 1) * kidSlot) / 2 + index * kidSlot));
  greatM.forEach((draft, index) => (draft.x = maternalCenter - ((greatM.length - 1) * kidSlot) / 2 + index * kidSlot));
  const generationII = [...paternalBlock, motherDraft, ...maternalSibs];
  let rightII = Math.max(...generationII.map((draft) => draft.x));
  [...extraParents, ...unlinedSibs].forEach((draft) => {
    rightII += slot;
    draft.x = rightII;
  });
  let rightI = Math.max(gmM.x, gfM.x);
  extraGrand.forEach((draft) => {
    rightI += slot;
    draft.x = rightI;
  });

  const drafts: Draft[] = [
    ...greatP,
    ...greatM,
    gfP,
    gmP,
    gfM,
    gmM,
    ...extraGrand,
    ...paternalBlock,
    motherDraft,
    ...maternalSibs,
    ...extraParents,
    ...unlinedSibs,
    ...halfP,
    ...cousinsP,
    ...kids,
    ...halfM,
    ...cousinsM,
  ];

  // ── Вертикаль: поколение 0 — только если есть прадеды ──
  const generations: Generation[] = greatP.length || greatM.length ? [0, 1, 2, 3] : [1, 2, 3];
  const rowY = new Map<Generation, number>(generations.map((generation, index) => [generation, PEDIGREE.top + index * PEDIGREE.rowGap]));

  // Сдвиг, чтобы слева хватило места римским цифрам и подписям.
  const minX = Math.min(...drafts.map((draft) => draft.x));
  const shift = PEDIGREE.left + PEDIGREE.pad - minX;
  const round = (value: number) => Math.round(value * 10) / 10;

  // Номера в поколении слева направо — только у людей, не у пустых мест.
  const counters = new Map<Generation, number>();
  const nodes: PedigreeNode[] = drafts
    .map((draft) => ({ ...draft, x: round(draft.x + shift), y: rowY.get(draft.generation) ?? PEDIGREE.top }))
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((node) => {
      if (node.placeholder) return { ...node, code: "" };
      const index = (counters.get(node.generation) ?? 0) + 1;
      counters.set(node.generation, index);
      const code = `${ROMAN[node.generation]}-${index}`;
      return { ...node, code, tooltip: `${code} · ${node.tooltip}` };
    });

  // ── Линии ──
  const h = PEDIGREE.symbol / 2;
  const find = (key: string) => nodes.find((node) => node.key === key) as PedigreeNode;
  const lines: PedigreeLine[] = [];
  const marriage = (left: PedigreeNode, right: PedigreeNode, key: string, double = false) => {
    lines.push({
      key,
      d: `M${round(left.x + h)} ${left.y} L${round(right.x - h)} ${right.y}`,
      double,
      dashed: Boolean(left.placeholder || right.placeholder),
    });
  };
  const descent = (fromX: number, fromY: number, children: PedigreeNode[], key: string, dashed: boolean) => {
    if (!children.length) return;
    const childY = children[0].y;
    if (children.length === 1 && Math.abs(children[0].x - fromX) < 0.5) {
      lines.push({ key, d: `M${round(fromX)} ${fromY} L${round(fromX)} ${childY - h}`, dashed });
      return;
    }
    const bar = childY - h - 16;
    const xs = children.map((child) => child.x);
    let d = `M${round(fromX)} ${fromY} L${round(fromX)} ${bar} M${round(Math.min(...xs, fromX))} ${bar} L${round(Math.max(...xs, fromX))} ${bar}`;
    for (const x of xs) d += ` M${round(x)} ${bar} L${round(x)} ${childY - h}`;
    lines.push({ key, d, dashed });
  };
  const nGfP = find(gfP.key);
  const nGmP = find(gmP.key);
  const nGfM = find(gfM.key);
  const nGmM = find(gmM.key);
  const nFather = find(fatherDraft.key);
  const nMother = find(motherDraft.key);
  marriage(nGfP, nGmP, "marriage-p");
  marriage(nGfM, nGmM, "marriage-m");
  marriage(nFather, nMother, "marriage-parents", child.consanguineous);
  descent((nGfP.x + nGmP.x) / 2, nGfP.y, paternalBlock.map((draft) => find(draft.key)), "descent-p", Boolean(nGfP.placeholder && nGmP.placeholder));
  descent((nGfM.x + nGmM.x) / 2, nGfM.y, [nMother, ...maternalSibs.map((draft) => find(draft.key))], "descent-m", Boolean(nGfM.placeholder && nGmM.placeholder));
  descent((nFather.x + nMother.x) / 2, nFather.y + (child.consanguineous ? 2 : 0), kids.map((draft) => find(draft.key)), "descent-kids", false);

  const legend = nodes
    .filter((node) => node.memberId != null && node.affected)
    .map((node) => {
      const member = family.find((row) => row.id === node.memberId) as FamilyMember;
      return `${node.code} — ${member.diseases.map((disease) => lowerFirst(disease.title)).join(", ")}`;
    });
  const nonBlood = family.filter((member) => !RELATION_META[member.relation]?.blood).map((member) => relationTitle(member).toLowerCase());

  const maxX = Math.max(...nodes.map((node) => node.x));
  const maxY = Math.max(...nodes.map((node) => node.y));
  return {
    width: Math.ceil(maxX + PEDIGREE.pad + 8),
    height: maxY + h + 46,
    nodes,
    lines,
    rows: generations.map((generation) => ({ roman: ROMAN[generation], y: rowY.get(generation) as number })),
    legend,
    nonBlood,
  };
}

/** Сегодняшняя дата для подписей возраста. */
export const todayIso = (): string => dayjs().format("YYYY-MM-DD");
