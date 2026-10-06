import dayjs from "dayjs";

import type { ToneName } from "../../components/ui";
import type { PosCertificateLookup } from "../../api/pos";
import type { GiftCertificateBranchUse, GiftCertificateStatus } from "../../api/promotions";
import { formatPosAmount } from "../pos/format";

/**
 * Labels and small calculations for gift certificates — shared by the till
 * (sell dialog, balance under the code field) and the registry page, so both
 * say the same thing about the same card.
 */

export const CERTIFICATE_STATUS_META: Record<GiftCertificateStatus, { label: string; tone: ToneName }> = {
  active: { label: "Активен", tone: "success" },
  spent: { label: "Израсходован", tone: null },
  expired: { label: "Просрочен", tone: "warning" },
  void: { label: "Аннулирован", tone: "error" },
};

export const certificateStatusMeta = (status: string) =>
  CERTIFICATE_STATUS_META[status as GiftCertificateStatus] ?? { label: status, tone: null as ToneName };

/**
 * The backend sends `expiresAt` as the moment the card stops working — the
 * start of the day after its last valid day. People read «действует до» as
 * the last valid day, so one second is taken off before formatting.
 */
export const certificateLastDay = (expiresAt: string | null | undefined): string | null => {
  if (!expiresAt) return null;
  const moment = dayjs(expiresAt);
  return moment.isValid() ? moment.subtract(1, "second").format("DD.MM.YYYY") : null;
};

/** «до 31.12.2027» or «бессрочный». */
export const certificateExpiryLabel = (expiresAt: string | null | undefined): string => {
  const lastDay = certificateLastDay(expiresAt);
  return lastDay ? `до ${lastDay}` : "бессрочный";
};

/** Where the card was spent: «Дордой 3 000, ЦУМ 800» — the largest share first. */
export const redeemedBranchesLabel = (branches: GiftCertificateBranchUse[] | null | undefined): string =>
  [...(branches ?? [])]
    .filter((branch) => Number(branch.amount) !== 0)
    .sort((a, b) => Number(b.amount) - Number(a.amount))
    .map((branch) => `${branch.branchName || "Без филиала"} ${formatPosAmount(Number(branch.amount))}`)
    .join(", ");

/** Cashier-facing line under the certificate code: balance or the refusal reason. */
export const certificateLookupMessage = (
  lookup: PosCertificateLookup,
): { tone: "ok" | "error"; text: string } => {
  if (!lookup.usable) {
    return { tone: "error", text: lookup.reason || "Сертификат нельзя принять к оплате." };
  }
  const lastDay = certificateLastDay(lookup.expiresAt);
  const balance = `Остаток: ${formatPosAmount(Number(lookup.balance))} сом`;
  return { tone: "ok", text: lastDay ? `${balance}, действует до ${lastDay}` : `${balance}, бессрочный` };
};

/**
 * Card number without spaces. The server compares numbers ignoring spaces and
 * case; the case is kept as printed on the card.
 */
export const cleanCertificateCode = (value: string): string => value.replace(/\s+/g, "");

/** Amount typed by a cashier → kopecks; NaN for anything that is not a money amount. */
export const amountToCents = (value: string): number => {
  const normalized = value.replace(/\s+/g, "").replace(",", ".");
  return /^\d+(?:\.\d{0,2})?$/.test(normalized) ? Math.round(Number(normalized) * 100) : NaN;
};

export const centsToAmount = (cents: number): string => (cents / 100).toFixed(2);
