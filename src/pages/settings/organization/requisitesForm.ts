import type { OrganizationRequisites } from "../../../api/organization";

export type RequisitesField = keyof OrganizationRequisites;

/** Поля в порядке шапки формы №2; half — поле на пол-строки. */
export const REQUISITE_FIELDS: { field: RequisitesField; half?: boolean }[] = [
  { field: "legalName" },
  { field: "inn", half: true },
  { field: "okpo", half: true },
  { field: "activityName", half: true },
  { field: "activityCode", half: true },
  { field: "governingBody", half: true },
  { field: "governingBodyCode", half: true },
  { field: "ownershipForm", half: true },
  { field: "ownershipFormCode", half: true },
  { field: "legalAddress" },
  { field: "directorName" },
  { field: "chiefAccountantName", half: true },
  { field: "chiefAccountantPhone", half: true },
];

export function requisitesErrors(values: OrganizationRequisites): Partial<Record<RequisitesField, string>> {
  const errors: Partial<Record<RequisitesField, string>> = {};
  const inn = values.inn.trim();
  if (inn && !/^\d{14}$/.test(inn)) errors.inn = "ИНН — 14 цифр";
  const okpo = values.okpo.trim();
  if (okpo && !/^\d+$/.test(okpo)) errors.okpo = "ОКПО — только цифры";
  return errors;
}

export function changedRequisites(
  initial: OrganizationRequisites,
  values: OrganizationRequisites,
): Partial<OrganizationRequisites> {
  const changed: Partial<OrganizationRequisites> = {};
  for (const { field } of REQUISITE_FIELDS) {
    const next = values[field].trim();
    if (next !== initial[field]) changed[field] = next;
  }
  return changed;
}
