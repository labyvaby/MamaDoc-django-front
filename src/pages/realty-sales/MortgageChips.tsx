import { Box } from "@mui/material";

import type { ApplicationBank } from "../../api/realtyMortgage";
import { useT } from "../../i18n/VerticalProvider";
import { subtleBg } from "../../theme/uiHelpers";

const statusTone = (status: string) =>
  status === "approved" ? "success.main" : status === "rejected" ? "error.main" : status === "signed" ? "text.primary" : status === "sent" || status === "review" ? "info.main" : "text.secondary";

function Pill({ color, children, title }: { color: string; children: React.ReactNode; title?: string }) {
  return (
    <Box
      component="span"
      title={title}
      sx={(th) => ({
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        px: 1,
        py: 0.3,
        borderRadius: "999px",
        fontSize: "0.75rem",
        fontWeight: 600,
        whiteSpace: "nowrap",
        maxWidth: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis",
        color,
        bgcolor: subtleBg(th, true),
      })}
    >
      <Box component="span" sx={{ width: 6, height: 6, flexShrink: 0, borderRadius: "50%", bgcolor: "currentColor" }} />
      {children}
    </Box>
  );
}

/** Статус ипотечной заявки: подпись бэка, иначе своя. */
export function MortgageStatusPill({ status, label }: { status: string; label: string }) {
  const { t } = useT("realtySales");
  const known = ["draft", "sent", "approved", "signed", "rejected"].includes(status);
  return <Pill color={statusTone(status)}>{label || (known ? t(`mortgage.statusOne.${status}`) : status)}</Pill>;
}

/** Решение банка по заявке: «KICB ✓», «Оптима ×», «Демир …». */
export function BankDecisionChip({ bank, compact = false }: { bank: ApplicationBank; compact?: boolean }) {
  const { t } = useT("realtySales");
  const mark = bank.status === "approved" ? "✓" : bank.status === "rejected" ? "×" : "…";
  const known = ["review", "approved", "rejected", "sent"].includes(bank.status);
  const label = bank.statusLabel || (known ? t(`mortgage.decision.${bank.status}`) : bank.status);
  return (
    <Pill color={statusTone(bank.status)} title={[bank.name, label, bank.rate != null && `${bank.rate.toLocaleString("ru-RU")}%`].filter(Boolean).join(" · ")}>
      {compact ? `${bank.name} ${mark}` : `${bank.name} · ${label}${bank.rate != null && bank.status === "approved" ? ` · ${bank.rate.toLocaleString("ru-RU")}%` : ""}`}
    </Pill>
  );
}
