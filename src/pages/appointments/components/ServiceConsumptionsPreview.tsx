import React from "react";
import { Stack, Tooltip, Typography } from "@mui/material";
import ScienceOutlined from "@mui/icons-material/ScienceOutlined";

import { APPOINTMENT_CONSUMPTIONS_ENABLED } from "../../../api/appointments";
import type { ServiceRelatedProduct } from "../../../api/catalog";
import { formatQuantity } from "../../../utility/format";
import { useT } from "../../../i18n/VerticalProvider";

export interface ServiceConsumptionsPreviewProps {
  /** Состав расходников из справочника выбранной услуги. */
  products: ServiceRelatedProduct[];
  /** Количество услуги в строке — состав умножается на него (по умолчанию 1). */
  serviceQuantity?: number;
}

/**
 * Предпросмотр расходников выбранной услуги в форме приёма.
 *
 * Отличие от `AppointmentConsumptions` (карточка приёма): там реальный снапшот
 * из API приёма с остатками склада, здесь — только состав справочника, потому
 * что до сохранения строки расходов ещё не существует (их создаёт бэк). Остаток
 * склада поэтому не показываем вообще: в справочнике он по всей организации и
 * законно отличается от остатка склада филиала — обещать регистратору цифру,
 * которая потом поменяется, хуже, чем не показывать её.
 */
const ServiceConsumptionsPreview: React.FC<ServiceConsumptionsPreviewProps> = ({
  products,
  serviceQuantity = 1,
}) => {
  const { t } = useT("appointments");

  if (!APPOINTMENT_CONSUMPTIONS_ENABLED || products.length === 0) return null;

  const multiplier = serviceQuantity > 0 ? serviceQuantity : 1;

  const items = products.map((p) => {
    const quantity = formatQuantity(p.quantity * multiplier);
    const unit = p.unit ? ` ${p.unit}` : "";
    const line = `${p.name} × ${quantity}${unit}`;
    return p.autoWriteOff ? line : `${line} (${t("consumptions.noWriteOff").toLowerCase()})`;
  });

  return (
    <Tooltip title={t("consumptions.hint")}>
      <Stack direction="row" spacing={0.5} alignItems="flex-start" sx={{ minWidth: 0 }}>
        <ScienceOutlined sx={{ fontSize: 14, color: "text.disabled", mt: 0.25, flexShrink: 0 }} />
        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 0 }}>
          {t("consumptions.previewLabel")} {items.join(" · ")}
        </Typography>
      </Stack>
    </Tooltip>
  );
};

export default ServiceConsumptionsPreview;
