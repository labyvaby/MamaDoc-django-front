import React from "react";
import {
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import type { DjangoProduct, DjangoProductCategoryNode } from "../../../api/warehouse";
import { SegmentedTabs } from "../../../components/ui";
import { computeNewPrice, type PriceChangeMode } from "./bulk";

export type CategoryChoice = { categoryId: number; name: string } | { name: string };

/**
 * Смена категории у выбранных товаров. У магазина категории — справочник
 * (дерево), поэтому только выбор из него; у остальных — свободная строка с
 * подсказками, как в форме товара.
 */
export const BulkCategoryDialog: React.FC<{
  open: boolean;
  count: number;
  /** null — у организации справочника нет, категория строкой. */
  tree: DjangoProductCategoryNode[] | null;
  legacyCategories: string[];
  onClose: () => void;
  onSubmit: (choice: CategoryChoice) => void;
}> = ({ open, count, tree, legacyCategories, onClose, onSubmit }) => {
  const [categoryId, setCategoryId] = React.useState<number | "">("");
  const [name, setName] = React.useState("");
  React.useEffect(() => {
    if (open) {
      setCategoryId("");
      setName("");
    }
  }, [open]);

  const activeTree = (tree ?? []).filter((c) => c.isActive);
  const picked = activeTree.find((c) => c.id === categoryId);
  const canSubmit = tree ? Boolean(picked) : name.trim().length > 0;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Сменить категорию</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Товаров выбрано: {count}. Остальные поля не изменятся.
        </Typography>
        {tree ? (
          <TextField
            select
            fullWidth
            label="Категория"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value === "" ? "" : Number(e.target.value))}
          >
            {activeTree.length === 0 && <MenuItem value="" disabled>Категорий пока нет</MenuItem>}
            {activeTree.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
        ) : (
          <Autocomplete<string, false, false, true>
            freeSolo
            options={legacyCategories}
            value={name}
            onChange={(_, next) => setName(next ?? "")}
            onInputChange={(_, next) => setName(next)}
            renderInput={(params) => (
              <TextField {...params} autoFocus label="Категория" helperText="Выберите из заведённых или введите новую" />
            )}
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Отмена</Button>
        <Button
          variant="contained"
          disabled={!canSubmit}
          onClick={() =>
            onSubmit(picked ? { categoryId: picked.id, name: picked.name } : { name: name.trim() })
          }
        >
          Применить
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const MODE_TABS: { key: PriceChangeMode; label: string }[] = [
  { key: "set", label: "Новая цена" },
  { key: "percent", label: "± %" },
  { key: "amount", label: "± сом" },
];

/** Массовая правка цены продажи: точное значение, процент или сумма. */
export const BulkPriceDialog: React.FC<{
  open: boolean;
  products: readonly DjangoProduct[];
  onClose: () => void;
  onSubmit: (prices: Map<number, number>) => void;
}> = ({ open, products, onClose, onSubmit }) => {
  const [mode, setMode] = React.useState<PriceChangeMode>("percent");
  const [raw, setRaw] = React.useState("");
  React.useEffect(() => {
    if (open) setRaw("");
  }, [open]);

  const value = raw.trim() === "" ? Number.NaN : Number(raw.replace(",", "."));
  const changes = React.useMemo(() => {
    const out = new Map<number, number>();
    for (const p of products) {
      const next = computeNewPrice(p.price, mode, value);
      if (next != null && next !== p.price) out.set(p.id, next);
    }
    return out;
  }, [products, mode, value]);
  const preview = products.filter((p) => changes.has(p.id)).slice(0, 4);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Изменить цену</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <SegmentedTabs<PriceChangeMode>
            tabs={MODE_TABS}
            value={mode}
            onChange={setMode}
            layoutId="bulk-price-mode"
          />
          <TextField
            autoFocus
            fullWidth
            label={mode === "set" ? "Цена продажи" : mode === "percent" ? "Изменить на, %" : "Изменить на, сом"}
            placeholder={mode === "set" ? "1500" : "10 или -10"}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            inputProps={{ inputMode: "decimal" }}
            InputProps={{
              endAdornment: <InputAdornment position="end">{mode === "percent" ? "%" : "сом"}</InputAdornment>,
            }}
            helperText="Цена округляется до целого сома и не бывает ниже нуля"
          />
          <Box>
            <Typography variant="body2" color="text.secondary">
              Изменится цен: {changes.size} из {products.length}
            </Typography>
            {preview.map((p) => (
              <Typography key={p.id} variant="caption" display="block" color="text.secondary" noWrap>
                {p.name}: {p.price.toLocaleString()} → {changes.get(p.id)?.toLocaleString()} сом
              </Typography>
            ))}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Отмена</Button>
        <Button variant="contained" disabled={changes.size === 0} onClick={() => onSubmit(changes)}>
          Применить
        </Button>
      </DialogActions>
    </Dialog>
  );
};
