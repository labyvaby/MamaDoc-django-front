/**
 * Проверка показателей заключения (рост, вес, температура) и точность бэка.
 * Вынесено из DjangoConclusionDrawer 28.09.2026 без изменений логики.
 */
import { tt } from "../../i18n/t";

// ── vitals validation helpers ──────────────────────────────────────────────────

// Контракт точности — как у бэка: вес numeric(6,3), рост numeric(5,2),
// температура numeric(4,1). Лишние знаки ловим на клиенте, чтобы врач получил
// понятную ошибку на родном языке, а не HTTP 400 от Django.
export const WEIGHT_DECIMALS = 3;
export const HEIGHT_DECIMALS = 2;
export const TEMPERATURE_DECIMALS = 1;

function decimalPlacesOf(raw: string): number {
  // Поле type="number" отдаёт value с точкой независимо от локали.
  return raw.trim().split(".")[1]?.length ?? 0;
}

export function validateVitals(
  weight: string,
  height: string,
  temp: string,
): string | null {
  if (weight.trim()) {
    const w = Number(weight);
    if (isNaN(w) || w < 1 || w > 999)
      return tt("appointments:conclusion.errors.weightRange");
    if (decimalPlacesOf(weight) > WEIGHT_DECIMALS)
      return tt("appointments:conclusion.errors.weightPrecision");
  }
  if (height.trim()) {
    const h = Number(height);
    if (isNaN(h) || h < 1 || h > 999)
      return tt("appointments:conclusion.errors.heightRange");
    if (decimalPlacesOf(height) > HEIGHT_DECIMALS)
      return tt("appointments:conclusion.errors.heightPrecision");
  }
  if (temp.trim()) {
    const t = Number(temp);
    if (isNaN(t) || t < 34 || t > 42)
      return tt("appointments:conclusion.errors.temperatureRange");
    if (decimalPlacesOf(temp) > TEMPERATURE_DECIMALS)
      return tt("appointments:conclusion.errors.temperaturePrecision");
  }
  return null;
}
