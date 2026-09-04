/**
 * Расчёт суммы корзины анализов.
 *
 * Считается на фронте только для показа: истина — бэкенд, и он отвергает
 * приём, если оплата не равна его сумме. Расхождение возможно, если ночной
 * синк каталога изменил прайс между открытием дровера и отправкой, — тогда
 * регистратор получит 422 с внятным текстом вместо молчаливой продажи по
 * устаревшей цене. Подгонять число под бэкенд нельзя.
 *
 * Правила повторяют `server/apps/lab/basket.py`: скидка применяется только к
 * анализам, пробирки входят в сумму лишь при включённой плате за них.
 *
 * Округляется СКИДКА, а не итог, — как на экране продаж
 * (`DjangoSaleFormDrawer`) и как в `basket.quote_basket`. Порядок здесь не
 * косметика: бэкенд требует, чтобы оплата в точности равнялась его сумме, а
 * регистратор платит ту, что видит здесь. Округли мы итог вместо скидки —
 * разошлись бы на копейку на ровной половине (100.05 минус 50 %) и получили
 * бы заблокированный приём.
 */

export interface BasketLineInput {
  testId: number;
  /** Цена приходит из API строкой — деньги наружу отдаются строками. */
  priceStandard: string;
  priceExpress: string;
  count: number;
  express: boolean;
}

export interface BasketTubeInput {
  instrumentId: number;
  price: string;
  count: number;
}

export interface BasketTotalsInput {
  lines: BasketLineInput[];
  tubes: BasketTubeInput[];
  discountPercent: number;
  chargeTubes: boolean;
}

export interface BasketTotals {
  testsTotal: number;
  tubesTotal: number;
  total: number;
}

function money(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Цена строки: экспресс, если он задан и ненулевой, иначе обычная. */
function linePrice(line: BasketLineInput): number {
  const express = money(line.priceExpress);
  if (line.express && express > 0) return express;
  return money(line.priceStandard);
}

export function basketTotals(input: BasketTotalsInput): BasketTotals {
  const testsGross = input.lines.reduce(
    (sum, line) => sum + linePrice(line) * line.count,
    0,
  );
  const discount = round2((testsGross * input.discountPercent) / 100);
  const testsTotal = round2(testsGross - discount);
  const tubesTotal = round2(
    input.tubes.reduce((sum, item) => sum + money(item.price) * item.count, 0),
  );
  const total = round2(testsTotal + (input.chargeTubes ? tubesTotal : 0));
  return { testsTotal, tubesTotal, total };
}
