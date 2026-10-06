import React from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import type { DjangoStockItem } from "../../../api/warehouse";
import { SegmentedTabs } from "../../../components/ui";
import { planBulkQuantities, type BulkQuantityMode } from "./stockBulk";

const MODE_TABS: { key: BulkQuantityMode; label: string }[] = [
  { key: "all", label: "Весь остаток" },
  { key: "each", label: "По N каждого" },
];

export type StockBulkSubmit = {
  moves: Map<number, number>;
  comment: string;
  toWarehouseId?: number;
};

/**
 * Массовое перемещение или списание выбранных позиций склада. Сколько уйдёт —
 * весь остаток или по N штук с каждой позиции (не больше, чем лежит);
 * позиции без остатка пропускаются.
 */
export const StockBulkDialog: React.FC<{
  open: boolean;
  kind: "transfer" | "writeoff";
  items: readonly DjangoStockItem[];
  /** Склады-получатели (без текущего) — только для перемещения. */
  targets?: { id: number; label: string }[];
  onClose: () => void;
  onSubmit: (data: StockBulkSubmit) => void;
}> = ({ open, kind, items, targets = [], onClose, onSubmit }) => {
  const [mode, setMode] = React.useState<BulkQuantityMode>("all");
  const [each, setEach] = React.useState("");
  const [comment, setComment] = React.useState("");
  const [toWarehouseId, setToWarehouseId] = React.useState<number | "">("");
  React.useEffect(() => {
    if (!open) return;
    setMode("all");
    setEach("");
    setComment("");
    setToWarehouseId(targets.length === 1 ? targets[0].id : "");
    // targets меняются только вместе со складом — достаточно открытия.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const plan = React.useMemo(
    () => planBulkQuantities(items, mode, Number(each.replace(",", "."))),
    [items, mode, each],
  );
  const isTransfer = kind === "transfer";
  const canSubmit = plan.moves.size > 0 && (!isTransfer || toWarehouseId !== "");

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{isTransfer ? "Переместить выбранные" : "Списать выбранные"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          {isTransfer && (
            <TextField
              select
              fullWidth
              label="На склад"
              value={toWarehouseId}
              onChange={(e) => setToWarehouseId(e.target.value === "" ? "" : Number(e.target.value))}
            >
              {targets.map((w) => (
                <MenuItem key={w.id} value={w.id}>
                  {w.label}
                </MenuItem>
              ))}
            </TextField>
          )}
          <SegmentedTabs<BulkQuantityMode>
            tabs={MODE_TABS}
            value={mode}
            onChange={setMode}
            layoutId={`stock-bulk-${kind}`}
          />
          {mode === "each" && (
            <TextField
              autoFocus
              fullWidth
              label="Сколько с каждой позиции"
              value={each}
              onChange={(e) => setEach(e.target.value)}
              inputProps={{ inputMode: "decimal" }}
              helperText="Если на складе меньше — уйдёт сколько есть"
            />
          )}
          <TextField
            fullWidth
            label={isTransfer ? "Комментарий" : "Причина списания"}
            placeholder={isTransfer ? "Необязательно" : "Например, брак или пересорт"}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <Box>
            <Typography variant="body2">
              {isTransfer ? "Переместится" : "Спишется"}: {plan.moves.size} поз., всего{" "}
              {plan.total.toLocaleString()} ед.
            </Typography>
            {plan.skipped > 0 && (
              <Typography variant="caption" color="text.secondary">
                Без остатка, пропустим: {plan.skipped}
              </Typography>
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Отмена</Button>
        <Button
          variant="contained"
          color={isTransfer ? "primary" : "error"}
          disabled={!canSubmit}
          onClick={() =>
            onSubmit({
              moves: plan.moves,
              comment: comment.trim(),
              toWarehouseId: toWarehouseId === "" ? undefined : toWarehouseId,
            })
          }
        >
          {isTransfer ? "Переместить" : "Списать"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
