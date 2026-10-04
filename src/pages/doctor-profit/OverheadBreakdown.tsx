import React from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import EditCalendarOutlined from "@mui/icons-material/EditCalendarOutlined";

import { formatKGS } from "../../utility/format";
import type { ProfitOverhead, ProfitOverheadItem } from "../../api/doctorProfit";
import { toNumber } from "./profitRows";

const GROUPS: { key: keyof ProfitOverhead; title: string; empty: string }[] = [
  { key: "expenses", title: "Расходы по категориям", empty: "Расходов с отметкой «В прибыли» за месяц нет" },
  { key: "staff", title: "Зарплата персонала без своих приёмов", empty: "Нет начислений" },
  { key: "fixed", title: "Постоянные расходы", empty: "Не внесены — аренда, коммунальные, налоги" },
];

const Group: React.FC<{ title: string; empty: string; items: ProfitOverheadItem[] }> = ({ title, empty, items }) => {
  const total = items.reduce((acc, it) => acc + toNumber(it.amount), 0);
  return (
    <Box sx={{ minWidth: 0 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.75 }}>
        <Typography variant="body2" fontWeight={600}>
          {title}
        </Typography>
        <Typography variant="body2" fontWeight={600} sx={{ whiteSpace: "nowrap" }}>
          {formatKGS(total)}
        </Typography>
      </Stack>
      {items.length === 0 ? (
        <Typography variant="caption" color="text.disabled">
          {empty}
        </Typography>
      ) : (
        items.map((it, index) => (
          <Box
            // У начислений удалённых сотрудников номер 0 — ключу нужна позиция.
            key={`${it.id}-${it.branchId ?? "org"}-${index}`}
            sx={{ display: "flex", justifyContent: "space-between", gap: 2, py: 0.25 }}
          >
            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 0 }} noWrap>
              {it.name}
              <Box component="span" sx={{ color: "text.disabled" }}>
                {" · "}
                {it.branchName ?? "вся организация"}
              </Box>
            </Typography>
            <Typography variant="caption" sx={{ whiteSpace: "nowrap" }}>
              {formatKGS(it.amount)}
            </Typography>
          </Box>
        ))
      )}
    </Box>
  );
};

export const OverheadBreakdown: React.FC<{
  overhead: ProfitOverhead;
  branchSelected: boolean;
  onEditFixed: () => void;
}> = ({ overhead, branchSelected, onEditFixed }) => (
  <Box
    sx={{
      border: "1px solid",
      borderColor: "divider",
      borderRadius: "14px",
      bgcolor: "background.paper",
      p: { xs: 1.5, sm: 2 },
    }}
  >
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      flexWrap="wrap"
      useFlexGap
      sx={{ mb: 1.5, gap: 1 }}
    >
      <Box>
        <Typography variant="subtitle2" fontWeight={600}>
          Из чего сложились общие расходы
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {branchSelected
            ? "Расходы филиала делятся между его врачами, расходы без филиала — между всеми врачами клиники, по часам."
            : "Делятся между врачами пропорционально часам: график плюс приёмы вне графика."}
        </Typography>
      </Box>
      <Button size="small" variant="outlined" startIcon={<EditCalendarOutlined />} onClick={onEditFixed}>
        Постоянные расходы
      </Button>
    </Stack>
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" },
        gap: { xs: 2, md: 3 },
      }}
    >
      {GROUPS.map((g) => (
        <Group key={g.key} title={g.title} empty={g.empty} items={overhead[g.key]} />
      ))}
    </Box>
  </Box>
);

export default OverheadBreakdown;
