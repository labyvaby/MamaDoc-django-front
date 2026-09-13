import React from "react";
import { Chip, Tooltip } from "@mui/material";

import type { WhatsAppTemplate } from "../../api/whatsapp";
import { useT } from "../../i18n/VerticalProvider";

type ChipColor = "default" | "success" | "warning" | "error" | "info";

/**
 * Цвет по вердикту Meta. Неизвестный статус — серый, а не ошибка: Raven
 * может передать новый статус раньше, чем фронт о нём узнает.
 */
const STATUS_COLOR: Record<string, ChipColor> = {
  APPROVED: "success",
  PENDING: "info",
  REJECTED: "error",
  PAUSED: "warning",
  DISABLED: "default",
};

export interface WhatsAppTemplateStatusChipProps {
  template: Pick<
    WhatsAppTemplate,
    "status" | "available" | "supported" | "sendable" | "problemLabel"
  >;
}

/**
 * Статус шаблона одной меткой: удалённый в WhatsApp Manager — «недоступен»,
 * неподдерживаемый MVP — «не поддерживается», остальное — статус модерации
 * Meta. Причина — в подсказке, чтобы таблица каталога не расползалась.
 */
export const WhatsAppTemplateStatusChip: React.FC<WhatsAppTemplateStatusChipProps> = ({
  template,
}) => {
  const { t } = useT("settings");
  let label: string;
  let color: ChipColor;
  if (!template.available) {
    label = t("whatsapp.templateStatus.unavailable");
    color = "default";
  } else if (!template.supported) {
    label = t("whatsapp.templateStatus.unsupported");
    color = "warning";
  } else {
    label = t(`whatsapp.templateStatus.${template.status}`, {
      defaultValue: template.status,
    });
    color = STATUS_COLOR[template.status] ?? "default";
  }
  const chip = (
    <Chip size="small" label={label} color={color} variant="outlined" sx={{ fontWeight: 600 }} />
  );
  return template.problemLabel ? <Tooltip title={template.problemLabel}>{chip}</Tooltip> : chip;
};

export default WhatsAppTemplateStatusChip;
