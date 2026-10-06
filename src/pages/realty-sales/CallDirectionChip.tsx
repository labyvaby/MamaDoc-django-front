import { Box } from "@mui/material";
import CallMadeOutlined from "@mui/icons-material/CallMadeOutlined";
import CallMissedOutlined from "@mui/icons-material/CallMissedOutlined";
import CallReceivedOutlined from "@mui/icons-material/CallReceivedOutlined";

import type { Call } from "../../api/realtyCalls";
import { useT } from "../../i18n/VerticalProvider";
import { subtleBg } from "../../theme/uiHelpers";

/**
 * Направление звонка, как в макете: пропущенный входящий — красным, исходящий —
 * синим, входящий — зелёным. Недозвон исходящего остаётся «Исходящим»: итог
 * «Не отвечает» виден в колонке результата.
 */
export function CallDirectionChip({ call }: { call: Pick<Call, "direction" | "status"> }) {
  const { t } = useT("realtySales");
  const missed = call.status === "missed";
  const outgoing = call.direction === "outgoing";
  const color = missed ? "error.main" : outgoing ? "info.main" : "success.main";
  const Icon = missed ? CallMissedOutlined : outgoing ? CallMadeOutlined : CallReceivedOutlined;
  const label = missed ? t("calls.direction.missed") : t(`calls.direction.${outgoing ? "outgoing" : "incoming"}`);
  return (
    <Box
      component="span"
      sx={(th) => ({
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        px: 1,
        py: 0.35,
        borderRadius: "999px",
        fontSize: "0.75rem",
        fontWeight: 600,
        whiteSpace: "nowrap",
        color,
        bgcolor: subtleBg(th, true),
      })}
    >
      <Icon sx={{ fontSize: 14 }} />
      {label}
    </Box>
  );
}
