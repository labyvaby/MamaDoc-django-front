import React from "react";
import { Box, Skeleton, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import ScheduleOutlined from "@mui/icons-material/ScheduleOutlined";
import StorefrontOutlined from "@mui/icons-material/StorefrontOutlined";

import type { ProcurementSummary } from "../../api/procurement";
import { subtleBg } from "../../theme/uiHelpers";
import { formatMoney } from "./meta";

type Tone = "primary" | "error" | "warning" | "success";

const Tile: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone?: Tone;
  loading?: boolean;
}> = ({ icon, label, value, tone = "primary", loading }) => (
  <Box
    sx={(t) => ({
      display: "flex",
      alignItems: "center",
      gap: 1.5,
      p: { xs: 1.25, md: 1.75 },
      borderRadius: "10px",
      border: 1,
      borderColor: "divider",
      bgcolor: "background.paper",
      minWidth: 0,
      transition: "background-color .15s ease, border-color .15s ease",
      "&:hover": { bgcolor: subtleBg(t, true), borderColor: alpha(t.palette.primary.main, 0.28) },
    })}
  >
    <Box
      sx={(t) => ({
        width: { xs: 32, md: 40 },
        height: { xs: 32, md: 40 },
        borderRadius: "10px",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: tone === "primary" ? "primary.onSurface" : `${tone}.onSurface`,
        bgcolor: alpha(t.palette[tone].main, t.palette.mode === "dark" ? 0.16 : 0.1),
        "& .MuiSvgIcon-root": { fontSize: { xs: 18, md: 20 } },
      })}
    >
      {icon}
    </Box>
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: "0.75rem", lineHeight: 1.3 }}>
        {label}
      </Typography>
      {loading ? (
        <Skeleton width={90} height={22} />
      ) : (
        <Typography variant="body2" fontWeight={600} noWrap sx={{ fontVariantNumeric: "tabular-nums" }}>
          {value}
        </Typography>
      )}
    </Box>
  </Box>
);

const Big: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box component="span" sx={{ fontSize: "1.05rem", fontWeight: 700 }}>
    {children}
  </Box>
);

const Unit: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box component="span" sx={{ fontWeight: 500 }}>
    {" "}
    {children}
  </Box>
);

/** Плитки над списком (§5.2): приход за период, долг, ждут оплаты, поставщики. */
export const ProcurementStatTiles: React.FC<{
  summary: ProcurementSummary | undefined;
  loading: boolean;
  periodLabel: string;
}> = ({ summary, loading, periodLabel }) => {
  const awaiting = summary?.awaitingCount ?? 0;
  const overdue = summary?.overdueCount ?? 0;
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr 1fr", lg: "repeat(4, minmax(0, 1fr))" },
        gap: { xs: 1, md: 1.5 },
        flexShrink: 0,
      }}
    >
      <Tile
        icon={<ReceiptLongOutlined />}
        label={`Приход · ${periodLabel}`}
        loading={loading}
        value={
          <>
            <Big>{formatMoney(summary?.periodTotal)}</Big>
            <Unit>сом</Unit>
          </>
        }
      />
      <Tile
        icon={<AccountBalanceWalletOutlined />}
        label="Задолженность поставщикам"
        tone={Number(summary?.payableTotal ?? 0) > 0 ? "error" : "success"}
        loading={loading}
        value={
          <>
            <Big>{formatMoney(summary?.payableTotal)}</Big>
            <Unit>сом</Unit>
          </>
        }
      />
      <Tile
        icon={<ScheduleOutlined />}
        label={overdue > 0 ? `Ждут оплаты · просрочено ${overdue}` : "Ждут оплаты"}
        tone={overdue > 0 ? "error" : "warning"}
        loading={loading}
        value={
          <>
            <Big>{awaiting}</Big>
            <Unit>{awaiting === 1 ? "накладная" : awaiting >= 2 && awaiting <= 4 ? "накладные" : "накладных"}</Unit>
          </>
        }
      />
      <Tile
        icon={<StorefrontOutlined />}
        label="Поставщики"
        tone="success"
        loading={loading}
        value={
          <>
            <Big>{summary?.suppliersActive ?? 0}</Big>
            <Unit>активных</Unit>
            {summary && summary.suppliersTotal > summary.suppliersActive && (
              <Box component="span" sx={{ color: "text.secondary", fontWeight: 400 }}>
                {" "}
                из {summary.suppliersTotal}
              </Box>
            )}
          </>
        }
      />
    </Box>
  );
};

export default ProcurementStatTiles;
