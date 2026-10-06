import React from "react";
import { Autocomplete, Box, MenuItem, TextField, Typography } from "@mui/material";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { createMovement, getStock, supplyKeys, type MovementType } from "../../api/supply";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { formatKGS } from "../../utility/format";
import { FormDrawer } from "../realty-finance/shared";
import { parseNumber } from "./format";
import { useConstructionProjects, useNomenclature, useRefreshSupply, useWarehouses } from "./hooks";

export interface MovementPreset {
  type: MovementType;
  warehouseId: number | null;
}

/** ＋ Приход / − Списание / ⇄ Перемещение (`POST /movements/`, гайд §8). */
export function MovementDrawer({ preset, onClose }: { preset: MovementPreset | null; onClose: () => void }) {
  const { t } = useT("construction");
  const scope = useRealtyScope();
  const refresh = useRefreshSupply();
  const { enqueueSnackbar } = useSnackbar();
  const open = preset != null;
  const type = preset?.type ?? "in";
  const warehousesData = useWarehouses(open).data;
  const warehouses = React.useMemo(() => warehousesData ?? [], [warehousesData]);
  const noms = useNomenclature(open).data ?? [];
  const projects = useConstructionProjects(open && type === "out").data ?? [];
  const [warehouseId, setWarehouseId] = React.useState<number | "">("");
  const [toWarehouseId, setToWarehouseId] = React.useState<number | "">("");
  const [nomId, setNomId] = React.useState<number | null>(null);
  const [qty, setQty] = React.useState("");
  const [projectId, setProjectId] = React.useState<number | "">("");
  const [floor, setFloor] = React.useState("");
  const [ref, setRef] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  // Доступный остаток — подсказка при списании и перемещении (лимит проверит бэк).
  const stock = useQuery({
    queryKey: supplyKeys.stock(scope, warehouseId === "" ? 0 : warehouseId, ""),
    queryFn: ({ signal }) => getStock(warehouseId as number, "", scope, signal),
    enabled: open && type !== "in" && warehouseId !== "" && scope.orgReady !== false,
    staleTime: 15_000,
  }).data;
  const save = useMutation({
    mutationFn: () =>
      createMovement(
        {
          type,
          warehouseId: warehouseId as number,
          toWarehouseId: toWarehouseId === "" ? null : toWarehouseId,
          nomId: nomId as number,
          qty: parseNumber(qty) as number,
          projectId: projectId === "" ? null : projectId,
          floor,
          ref,
        },
        scope,
      ),
    onSuccess: () => {
      refresh();
      enqueueSnackbar(t("warehouse.movementForm.created"), { variant: "success" });
      onClose();
    },
  });
  React.useEffect(() => {
    if (!preset) return;
    setWarehouseId(preset.warehouseId ?? "");
    setToWarehouseId("");
    setNomId(null);
    setQty("");
    setProjectId("");
    setFloor("");
    setRef("");
    setTouched(false);
    save.reset();
  }, [preset]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс формы при открытии
  const nom = noms.find((n) => n.id === nomId) ?? null;
  const row = stock?.find((s) => s.nomId === nomId);
  // Списание со склада объекта — на его ЖК по умолчанию.
  React.useEffect(() => {
    if (type !== "out" || warehouseId === "") return;
    const wh = warehouses.find((w) => w.id === warehouseId);
    if (wh?.projectId != null) setProjectId(wh.projectId);
  }, [type, warehouseId, warehouses]);
  const q = parseNumber(qty);
  const invalid = {
    warehouse: warehouseId === "",
    to: type === "move" && (toWarehouseId === "" || toWarehouseId === warehouseId),
    nom: nomId == null,
    qty: q == null || q <= 0,
  };
  const hasErrors = Object.values(invalid).some(Boolean);
  const req = (bad: boolean, text = t("common.required")) => (touched && bad ? text : undefined);

  return (
    <FormDrawer
      open={open}
      title={t(`warehouse.movementForm.title_${type}`)}
      submitLabel={t("warehouse.movementForm.create")}
      busy={save.isPending}
      error={save.error}
      onClose={onClose}
      onSubmit={() => {
        setTouched(true);
        if (!hasErrors) save.mutate();
      }}
    >
      <TextField
        select
        size="small"
        label={t(type === "move" ? "warehouse.movementForm.from" : "warehouse.movementForm.warehouse")}
        value={warehouseId}
        onChange={(e) => setWarehouseId(Number(e.target.value))}
        error={touched && invalid.warehouse}
        helperText={req(invalid.warehouse)}
      >
        {warehouses.map((w) => (
          <MenuItem key={w.id} value={w.id}>
            {w.name}
          </MenuItem>
        ))}
      </TextField>
      {type === "move" && (
        <TextField
          select
          size="small"
          label={t("warehouse.movementForm.to")}
          value={toWarehouseId}
          onChange={(e) => setToWarehouseId(Number(e.target.value))}
          error={touched && invalid.to}
          helperText={touched && invalid.to ? (toWarehouseId !== "" ? t("warehouse.movementForm.sameWarehouse") : t("common.required")) : undefined}
        >
          {warehouses.map((w) => (
            <MenuItem key={w.id} value={w.id} disabled={w.id === warehouseId}>
              {w.name}
            </MenuItem>
          ))}
        </TextField>
      )}
      <Autocomplete
        size="small"
        options={noms}
        value={nom}
        onChange={(_, value) => setNomId(value?.id ?? null)}
        getOptionLabel={(o) => o.name}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        renderInput={(params) => <TextField {...params} label={t("warehouse.movementForm.nom")} error={touched && invalid.nom} helperText={req(invalid.nom)} />}
      />
      <TextField
        size="small"
        label={nom ? t("warehouse.movementForm.qty", { unit: nom.unit }) : t("warehouse.movementForm.qtyPlain")}
        value={qty}
        inputMode="decimal"
        onChange={(e) => setQty(e.target.value)}
        error={touched && invalid.qty}
        helperText={touched && invalid.qty ? t("common.number") : type !== "in" && row ? t("warehouse.movementForm.available", { qty: row.available.toLocaleString("ru-RU"), unit: row.unit }) : undefined}
      />
      {type === "out" && (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "2fr 1fr" }, gap: 1.5 }}>
          <TextField
            select
            size="small"
            label={t("warehouse.movementForm.project")}
            value={projectId}
            onChange={(e) => setProjectId(e.target.value === "" ? "" : Number(e.target.value))}
            SelectProps={{ displayEmpty: true }}
            InputLabelProps={{ shrink: true }}
            helperText={t("warehouse.movementForm.projectHint")}
          >
            <MenuItem value="">—</MenuItem>
            {projects.map((p) => (
              <MenuItem key={p.projectId} value={p.projectId}>
                {p.projectName}
              </MenuItem>
            ))}
          </TextField>
          <TextField size="small" label={t("warehouse.movementForm.floor")} value={floor} onChange={(e) => setFloor(e.target.value)} />
        </Box>
      )}
      <TextField size="small" label={t("warehouse.movementForm.ref")} value={ref} onChange={(e) => setRef(e.target.value)} helperText={t("warehouse.movementForm.refHint")} />
      {nom && q != null && q > 0 && nom.price > 0 && (
        <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>≈ {formatKGS(nom.price * q)}</Typography>
      )}
    </FormDrawer>
  );
}
