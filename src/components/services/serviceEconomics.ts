import type { Service, ServiceRelatedProduct } from "../../api/catalog";

export interface ServiceEconomics {
  /** Себестоимость расходников, входящих в цену услуги. */
  cost: number;
  /** Цена услуги минус себестоимость. */
  margin: number;
  /** Доля маржи в цене, % — null, если цена не задана. */
  marginPercent: number | null;
  /** Позиции, которых не хватит на складе при списании. */
  outOfStock: ServiceRelatedProduct[];
}

/**
 * Экономика услуги по её составу расходников.
 *
 * Себестоимость — только НЕплатные позиции: платные пациент оплачивает сверх
 * цены услуги, поэтому в маржу самой услуги они не входят ни доходом, ни
 * расходом. Остатки здесь общеорганизационные — в справочнике услуги филиала
 * нет, склад филиала считается уже в приёме.
 */
export function computeServiceEconomics(service: Service | null): ServiceEconomics {
  const items = service?.relatedProducts ?? [];
  const cost = items.reduce((sum, p) => (p.billable ? sum : sum + p.price * p.quantity), 0);
  const basePrice = Number(service?.basePrice ?? 0);
  return {
    cost,
    margin: basePrice - cost,
    marginPercent: basePrice > 0 ? ((basePrice - cost) / basePrice) * 100 : null,
    // Позиция без автосписания склада не касается — предупреждать не о чем.
    outOfStock: items.filter((p) => p.autoWriteOff && p.stock < p.quantity),
  };
}
