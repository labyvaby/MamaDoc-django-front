import React from "react";
import { Stack, Tooltip, Typography } from "@mui/material";
import ScienceOutlined from "@mui/icons-material/ScienceOutlined";

import { APPOINTMENT_CONSUMPTIONS_ENABLED } from "../../../api/appointments";
import type { ServiceRelatedProduct } from "../../../api/catalog";
import { formatKGS, formatQuantity } from "../../../utility/format";
import { useT } from "../../../i18n/VerticalProvider";

/**
 * Сколько платные позиции состава добавят к цене услуги при данном количестве.
 * Цена — прайс товара из справочника: именно её бэк снапшотит в строку расхода.
 */
export function previewBillableTotal(
  products: ServiceRelatedProduct[],
  serviceQuantity = 1,
): number {
  const multiplier = serviceQuantity > 0 ? serviceQuantity : 1;
  return products.reduce(
    (sum, p) => (p.billable ? sum + p.price * p.quantity * multiplier : sum),
    0,
  );
}

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
    // Платность важнее автосписания: она меняет сумму к оплате, поэтому её
    // помечаем всегда, а «не списывается» — только у бесплатных строк.
    if (p.billable) {
      return `${line} — ${t("consumptions.extra", {
        amount: formatKGS(p.price * p.quantity * multiplier),
      })}`;
    }
    return p.autoWriteOff ? line : `${line} (${t("consumptions.noWriteOff").toLowerCase()})`;
  });

  // Общая доплата — только когда платных позиций несколько: при одной она уже
  // написана в самой позиции, и вторая такая же сумма читалась бы как удвоение.
  const billableCount = products.filter((p) => p.billable).length;
  const extraCharge = billableCount > 1 ? previewBillableTotal(products, serviceQuantity) : 0;

  return (
    <Tooltip title={t("consumptions.hint")}>
      <Stack direction="row" spacing={0.5} alignItems="flex-start" sx={{ minWidth: 0 }}>
        <ScienceOutlined sx={{ fontSize: 14, color: "text.disabled", mt: 0.25, flexShrink: 0 }} />
        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 0 }}>
          {t("consumptions.previewLabel")} {items.join(" · ")}
        </Typography>
        {extraCharge > 0 && (
          <Typography
            variant="caption"
            color="primary.onSurface"
            fontWeight={600}
            sx={{ flexShrink: 0 }}
          >
            {t("consumptions.extra", { amount: formatKGS(extraCharge) })}
          </Typography>
        )}
      </Stack>
    </Tooltip>
  );
};

export default ServiceConsumptionsPreview;
