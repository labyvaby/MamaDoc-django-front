import { Alert, Link, Stack } from "@mui/material";
import { Link as RouterLink } from "react-router";

import type { PnlWarning } from "../../api/pnl";
import { formatSom } from "../../features/pnl/format";
import { num } from "../../features/pnl/model";

/** Подсказки над отчётом: чего в цифрах не хватает и почему. */
export function PnlHints({ warnings }: { warnings: PnlWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <Stack spacing={1}>
      {warnings.map((warning) => {
        if (warning.code === "products_without_cost") {
          return (
            <Alert key={warning.code} severity="warning">
              Закупочная стоимость товаров посчитана не полностью: у {warning.count} товаров не указана закупочная
              цена. Пока себестоимость складывается из расходов на материалы.{" "}
              <Link component={RouterLink} to="/products">Открыть товары</Link>
            </Alert>
          );
        }
        if (warning.code === "org_level_excluded") {
          return (
            <Alert key={warning.code} severity="info">
              Выбран один филиал: общие расходы организации без филиала ({formatSom(num(warning.amount))} сом) в
              отчёт не вошли. Чтобы их увидеть, выберите «Все филиалы» в меню слева.
            </Alert>
          );
        }
        return null;
      })}
    </Stack>
  );
}
