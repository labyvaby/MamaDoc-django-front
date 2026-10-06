import type { Theme } from "@mui/material/styles";

import type { Tone } from "../../api/estateDashboard";
import { formatKGS } from "../../utility/format";

export const cardSx = { border: 1, borderColor: "divider", borderRadius: "14px", bgcolor: "background.paper" } as const;

/** Тон бэка → цвет палитры. Неизвестный тон — нейтральный. */
export function toneColor(theme: Theme, tone: Tone | null | undefined): string {
  switch (tone) {
    case "red":
      return theme.palette.error.main;
    case "amber":
      return theme.palette.warning.main;
    case "green":
      return theme.palette.success.main;
    case "blue":
      return theme.palette.info.main;
    default:
      return theme.palette.text.disabled;
  }
}

/** «162,1 млн» для крупных сумм, иначе сомы целиком. */
export function compactMoney(value: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (Math.abs(value) >= 1_000_000) {
    const mln = (value / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 });
    return t("common.millions", { value: mln });
  }
  return formatKGS(value);
}

/**
 * Экран прототипа → адрес в CRM. Только экраны, которые уже сделаны;
 * остальное (воронка, стройка, кадры…) — без перехода, пока экрана нет.
 */
export function estateHref(view: string, objectId?: number | null): string | null {
  switch (view) {
    case "edo":
    case "contracts":
      return objectId ? `/edo?doc=${objectId}` : "/edo";
    case "billing":
      return objectId ? `/finance/billing?account=${objectId}` : "/finance/billing";
    case "construction":
      return objectId ? `/construction/schedule?stage=${objectId}` : "/construction/schedule";
    case "cashbank":
      return objectId ? `/finance/cashbank?operation=${objectId}` : "/finance/cashbank";
    case "paycal":
      return objectId ? `/finance/paycal?payment=${objectId}` : "/finance/paycal";
    case "budget":
      return objectId ? `/finance/budget?project=${objectId}` : "/finance/budget";
    case "receivables":
      return "/finance/receivables";
    case "inventory":
      return "/realestate/chessboard";
    case "documents":
      return "/realestate/documents";
    case "today":
      return "/realestate/today";
    case "funnel":
      return "/realestate/funnel";
    case "leads":
      return "/realestate/leads";
    case "motivation":
      return "/realestate/motivation";
    case "marketing":
      return "/realestate/marketing";
    case "partners":
      return objectId ? `/realestate/partners?partner=${objectId}` : "/realestate/partners";
    case "mortgage":
      return objectId ? `/realestate/mortgage?application=${objectId}` : "/realestate/mortgage";
    case "objects":
      return objectId ? `/realestate/catalog?project=${objectId}` : "/realestate/catalog";
    case "estimates":
      return "/realestate/deals";
    case "measurements":
      return "/realestate/shows";
    case "calls":
      return objectId ? `/realestate/calls?call=${objectId}` : "/realestate/calls";
    default:
      return null;
  }
}
