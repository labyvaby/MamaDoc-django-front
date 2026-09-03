/**
 * Напоминание о старых правилах подстановки бланка.
 *
 * До 03.09.2026 правила «филиал × услуга → бланк» лежали отдельным списком в
 * `organization.themeConfig.conclusionFormDefaults`: полей под них на модели
 * бланка у бэка не было. Теперь есть (`serviceIds`, `branchIds`, `isDefault`),
 * и подстановка читает только их — старый ключ больше ни на что не влияет.
 *
 * Переносить правила автоматически нельзя: за id бланка в правиле мог остаться
 * удалённый или выключенный шаблон, а тихая запись в чужие бланки — не то, что
 * администратор ожидает от открытия страницы настроек. Поэтому показываем, что
 * там записано, и даём убрать ключ вручную — когда привязки уже перенесены в
 * сами бланки.
 *
 * Секция исчезает вместе с ключом; когда клиенты его вычистят, компонент можно
 * удалить целиком.
 */
import React from "react";
import { Alert, AlertTitle, Button, Stack, Typography } from "@mui/material";

import type { ConclusionFormTemplate } from "../../api/conclusionForms";
import type { RbacBranch } from "../../api/auth";
import type { Service } from "../../api/catalog";

/** Ключ, под которым правила лежали в themeConfig организации. */
export const CONCLUSION_FORM_DEFAULTS_KEY = "conclusionFormDefaults";

export interface StaleDefaultRule {
  branchId: number | null;
  serviceId: number | null;
  formId: number;
}

const isPositiveInt = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

/** Правила из themeConfig; мусор молча отбрасываем — это чужой свободный JSON. */
export function readStaleDefaults(
  themeConfig: Record<string, unknown> | null | undefined,
): StaleDefaultRule[] {
  const raw = themeConfig?.[CONCLUSION_FORM_DEFAULTS_KEY];
  if (!Array.isArray(raw)) return [];
  const rules: StaleDefaultRule[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rule = item as Record<string, unknown>;
    if (!isPositiveInt(rule.formId)) continue;
    const branchId = rule.branchId ?? null;
    const serviceId = rule.serviceId ?? null;
    if (branchId !== null && !isPositiveInt(branchId)) continue;
    if (serviceId !== null && !isPositiveInt(serviceId)) continue;
    rules.push({ branchId, serviceId, formId: rule.formId });
  }
  return rules;
}

/**
 * themeConfig без ключа старых правил.
 *
 * ⚠ Строго поверх текущего значения: в themeConfig лежат палитра CRM, лендинг
 * `/site` и терминология организации — запись целиком стёрла бы их.
 */
export function buildThemeConfigWithoutDefaults(
  themeConfig: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const next = { ...(themeConfig ?? {}) };
  delete next[CONCLUSION_FORM_DEFAULTS_KEY];
  return next;
}

type Props = {
  rules: StaleDefaultRule[];
  forms: ConclusionFormTemplate[];
  services: Service[];
  branches: RbacBranch[];
  /** Чистку гейтит organization.update — ключ лежит в настройках организации. */
  canClear: boolean;
  clearing: boolean;
  error: string | null;
  onClear: () => void;
};

export const StaleDefaultsNotice: React.FC<Props> = ({
  rules,
  forms,
  services,
  branches,
  canClear,
  clearing,
  error,
  onClear,
}) => {
  if (rules.length === 0) return null;

  const formName = (id: number) => forms.find((f) => f.id === id)?.name ?? `бланк #${id}`;
  const serviceName = (id: number) => services.find((s) => s.id === id)?.name ?? `#${id}`;
  const branchName = (id: number) => branches.find((b) => b.id === id)?.name ?? `#${id}`;

  return (
    <Alert severity="warning" sx={{ alignItems: "flex-start" }}>
      <AlertTitle>Старые правила подстановки больше не работают</AlertTitle>
      <Typography variant="body2" sx={{ mb: 1 }}>
        Раньше бланк по умолчанию задавался отдельным списком. Теперь услуги,
        филиалы и признак «запасной» задаются в самом бланке — откройте нужный
        бланк и перенесите правила туда.
      </Typography>
      <Stack spacing={0.25} sx={{ mb: 1 }}>
        {rules.map((rule) => (
          <Typography
            key={`${rule.branchId ?? "any"}:${rule.serviceId ?? "any"}`}
            variant="caption"
          >
            {formName(rule.formId)} ·{" "}
            {rule.serviceId == null ? "любая услуга" : serviceName(rule.serviceId)} ·{" "}
            {rule.branchId == null ? "все филиалы" : branchName(rule.branchId)}
          </Typography>
        ))}
      </Stack>
      {error && (
        <Typography variant="caption" color="error" sx={{ display: "block", mb: 1 }}>
          {error}
        </Typography>
      )}
      {canClear && (
        <Button size="small" color="inherit" disabled={clearing} onClick={onClear}>
          Убрать старые правила
        </Button>
      )}
    </Alert>
  );
};

export default StaleDefaultsNotice;
