import React from "react";
import { Box, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import ApartmentOutlined from "@mui/icons-material/ApartmentOutlined";
import TrendingUpOutlined from "@mui/icons-material/TrendingUpOutlined";
import TrendingDownOutlined from "@mui/icons-material/TrendingDownOutlined";

import { subtleBg } from "../../theme/uiHelpers";
import { formatKGS } from "../../utility/format";
import type { ProfitTotals } from "../../api/doctorProfit";
import { formatMargin, toNumber } from "./profitRows";

type Tone = "accent" | "success" | "error";

// Плитка как в «Нагрузке»: плоская, на хайрлайне, иконка в тонированном квадрате.
const Tile: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: Tone;
}> = ({ icon, label, value, sub, tone = "accent" }) => (
  <Box
    sx={(t) => ({
      flex: "1 1 200px",
      minWidth: 0,
      display: "flex",
      gap: 1.5,
      alignItems: "center",
      p: 1.75,
      borderRadius: "10px",
      border: 1,
      borderColor: "divider",
      bgcolor: subtleBg(t),
    })}
  >
    <Box
      sx={(t) => {
        const c =
          tone === "success" ? t.palette.success.main : tone === "error" ? t.palette.error.main : t.palette.primary.main;
        return {
          width: 40,
          height: 40,
          borderRadius: "10px",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: tone === "accent" ? "primary.onSurface" : tone === "success" ? "success.main" : "error.main",
          bgcolor: alpha(c, t.palette.mode === "dark" ? 0.16 : 0.1),
          "& .MuiSvgIcon-root": { fontSize: 20 },
        };
      }}
    >
      {icon}
    </Box>
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: "0.75rem" }}>
        {label}
      </Typography>
      <Typography
        variant="body1"
        fontWeight={600}
        noWrap
        sx={{ color: tone === "error" ? "error.main" : undefined }}
      >
        {value}
      </Typography>
      {sub && (
        <Typography variant="caption" color="text.disabled" display="block">
          {sub}
        </Typography>
      )}
    </Box>
  </Box>
);

export const ProfitKpiTiles: React.FC<{ totals: ProfitTotals; branchSelected: boolean }> = ({
  totals,
  branchSelected,
}) => {
  const direct = toNumber(totals.salary) + toNumber(totals.cost);
  const unallocated = toNumber(totals.unallocated);
  const profit = toNumber(totals.profit);
  return (
    <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1.5}>
      <Tile icon={<PaymentsOutlined />} label="Выручка" value={formatKGS(totals.revenue)} sub="получено за приёмы месяца" />
      <Tile
        icon={<ReceiptLongOutlined />}
        label="Прямые расходы"
        value={formatKGS(direct)}
        sub={`зарплата ${formatKGS(totals.salary)} · себестоимость ${formatKGS(totals.cost)}`}
      />
      <Tile
        icon={<ApartmentOutlined />}
        label="Общие расходы"
        value={formatKGS(totals.overhead)}
        sub={unallocated > 0 ? `не распределено ${formatKGS(unallocated)}` : "делятся по часам врачей"}
      />
      <Tile
        icon={profit < 0 ? <TrendingDownOutlined /> : <TrendingUpOutlined />}
        label={branchSelected ? "Прибыль филиала" : "Прибыль клиники"}
        value={formatKGS(totals.profit)}
        sub={`маржа ${formatMargin(totals.marginPct)}`}
        tone={profit < 0 ? "error" : "success"}
      />
    </Stack>
  );
};

export default ProfitKpiTiles;
