import type { RbacBranch, RbacMembership } from "../../api/auth";

/** Действующие филиалы членства — только их можно выбрать в меню. */
export const activeBranchesOf = (m: RbacMembership): RbacBranch[] =>
  (m.branches ?? []).filter((b) => b.isActive);

/**
 * Пункт «вся организация» в меню: «Все филиалы» при двух и более филиалах,
 * «Без филиала» — если филиалов нет. При одном филиале пункта нет: сессия
 * всегда стоит в нём (бэкенд, 2026-09-27), и выбор ничего бы не дал.
 */
export const showsOrgWideItem = (branchCount: number): boolean => branchCount !== 1;

/** Меню нужно, только если есть из чего выбрать. */
export const isSwitcherInteractive = (memberships: RbacMembership[]): boolean =>
  memberships.length > 1 || memberships.some((m) => activeBranchesOf(m).length > 1);
