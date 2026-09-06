import React from "react";
import {
    Box,
    ButtonBase,
    Divider,
    FormControlLabel,
    MenuItem,
    Stack,
    Switch,
    TextField,
    Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import CategoryOutlined from "@mui/icons-material/CategoryOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import WarehouseOutlined from "@mui/icons-material/WarehouseOutlined";

import { AppButton, AppCard, InfoTile } from "../../../ui";
import { subtleBg } from "../../../../theme/uiHelpers";
import type { DjangoWarehouse } from "../../../../api/warehouse";
import { money, positionsLabel } from "./inventoryModel";

export type InventoryCategoryOption = {
    name: string;
    count: number;
};

export type InventorySetupCardProps = {
    warehouses: DjangoWarehouse[];
    warehouseId: number | null;
    onWarehouseChange: (id: number) => void;
    categories: InventoryCategoryOption[];
    /** Выбранные категории; пустой массив — ничего не пересчитываем. */
    selected: string[];
    onToggleCategory: (name: string) => void;
    onToggleAll: () => void;
    /** Сколько позиций попадёт в документ и на какую ожидаемую сумму. */
    scopeCount: number;
    /** Сколько позиций выбранных категорий имеют остаток именно на этом складе. */
    scopeWithStock?: number;
    /** Сколько всего позиций в выбранных категориях (без фильтра по остатку). */
    scopeTotal?: number;
    /** Включён ли фильтр «только с остатком на складе». */
    onlyWithStock?: boolean;
    onToggleOnlyWithStock?: () => void;
    /** Фильтр доступен, только если на складе вообще что-то лежит. */
    stockFilterAvailable?: boolean;
    scopeSum: number;
    responsibleName: string;
    /** Активный филиал: склад другого филиала бэк не даст открыть. */
    activeBranchId?: number | null;
    disabled?: boolean;
};

/**
 * Шаг 1 — настройка документа: склад, категории товаров и сводка по охвату.
 * Кнопка «Начать инвентаризацию» живёт в шапке страницы (PageHeader), поэтому
 * здесь её нет: карточка отвечает только за выбор охвата.
 */
export const InventorySetupCard: React.FC<InventorySetupCardProps> = ({
    warehouses,
    warehouseId,
    onWarehouseChange,
    categories,
    selected,
    onToggleCategory,
    onToggleAll,
    scopeCount,
    scopeWithStock,
    scopeTotal,
    onlyWithStock = false,
    onToggleOnlyWithStock,
    stockFilterAvailable = false,
    scopeSum,
    responsibleName,
    activeBranchId = null,
    disabled = false,
}) => {
    const allSelected = categories.length > 0 && selected.length === categories.length;
    const isForeign = (warehouse: DjangoWarehouse) =>
        activeBranchId != null && warehouse.branchId !== activeBranchId;
    const chosen = warehouses.find((warehouse) => warehouse.id === warehouseId);
    // Ловим чужой филиал до запроса: бэк на него отвечает сухим «Не найдено».
    const foreignChosen = chosen != null && isForeign(chosen);

    return (
        <AppCard
            title="Новая инвентаризация"
            subheader="Ожидаемые остатки снимаются на момент старта — продажи в это время не блокируются"
        >
            <Stack spacing={2.5}>
                <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
                    <TextField
                        select
                        label="Склад"
                        value={warehouseId ?? ""}
                        onChange={(event) => onWarehouseChange(Number(event.target.value))}
                        disabled={disabled || warehouses.length === 0}
                        error={foreignChosen}
                        helperText={foreignChosen
                            ? "Склад другого филиала — переключите филиал в шапке, иначе документ не откроется"
                            : undefined}
                        fullWidth
                    >
                        {warehouses.map((warehouse) => (
                            <MenuItem key={warehouse.id} value={warehouse.id}>
                                {warehouse.name}
                                {isForeign(warehouse) || warehouse.isLinked ? ` · ${warehouse.branchName}` : ""}
                            </MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        label="Ответственный"
                        value={responsibleName}
                        InputProps={{ readOnly: true }}
                        fullWidth
                    />
                </Box>

                <Divider />

                <Box>
                    <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1.5}
                        alignItems={{ xs: "stretch", sm: "center" }}
                        sx={{ mb: 1.5 }}
                    >
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="subtitle2" fontWeight={600}>
                                Что пересчитываем
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                В документ попадут товары выбранных категорий
                            </Typography>
                        </Box>
                        <AppButton
                            variant="outlined"
                            size="small"
                            onClick={onToggleAll}
                            disabled={disabled || categories.length === 0}
                            sx={{ flexShrink: 0 }}
                        >
                            {allSelected ? "Снять все" : "Выбрать все"}
                        </AppButton>
                    </Stack>

                    <Box
                        sx={{
                            display: "grid",
                            gap: 1.25,
                            gridTemplateColumns: { xs: "1fr", sm: "repeat(auto-fill, minmax(220px, 1fr))" },
                        }}
                    >
                        {categories.map((category) => {
                            const on = selected.includes(category.name);
                            return (
                                <ButtonBase
                                    key={category.name}
                                    onClick={() => onToggleCategory(category.name)}
                                    disabled={disabled}
                                    aria-pressed={on}
                                    sx={(t) => ({
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 1.25,
                                        px: 1.5,
                                        py: 1.25,
                                        borderRadius: "12px",
                                        border: 1,
                                        borderColor: on ? alpha(t.palette.primary.main, 0.3) : "divider",
                                        bgcolor: on ? t.palette.primary.lighter : subtleBg(t),
                                        textAlign: "left",
                                        justifyContent: "flex-start",
                                        transition: "background-color .15s ease, border-color .15s ease",
                                        "&:hover": {
                                            borderColor: alpha(t.palette.primary.main, 0.3),
                                            bgcolor: on ? t.palette.primary.lighter : subtleBg(t, true),
                                        },
                                    })}
                                >
                                    <Box
                                        sx={(t) => ({
                                            width: 20,
                                            height: 20,
                                            flexShrink: 0,
                                            borderRadius: "6px",
                                            display: "grid",
                                            placeItems: "center",
                                            border: on ? "none" : `1.5px solid ${t.palette.divider}`,
                                            bgcolor: on ? "primary.main" : "background.paper",
                                            color: on ? "primary.contrastText" : "transparent",
                                            "& .MuiSvgIcon-root": { fontSize: 14 },
                                        })}
                                    >
                                        <CheckOutlined />
                                    </Box>
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography
                                            variant="body2"
                                            fontWeight={500}
                                            noWrap
                                            color={on ? "primary.onSurface" : "text.primary"}
                                        >
                                            {category.name}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" display="block">
                                            {positionsLabel(category.count)}
                                        </Typography>
                                    </Box>
                                </ButtonBase>
                            );
                        })}
                        {categories.length === 0 && (
                            <Typography variant="body2" color="text.secondary">
                                В организации нет активных товаров — нечего пересчитывать.
                            </Typography>
                        )}
                    </Box>
                </Box>

                <Box
                    sx={{
                        display: "grid",
                        gap: 1.25,
                        gridTemplateColumns: { xs: "1fr", sm: "repeat(auto-fit, minmax(180px, 1fr))" },
                    }}
                >
                    <InfoTile
                        icon={<Inventory2Outlined />}
                        label="Позиций к пересчёту"
                        value={scopeCount}
                        active={scopeCount > 0}
                    />
                    <InfoTile
                        icon={<CategoryOutlined />}
                        label="Категорий выбрано"
                        value={`${selected.length} из ${categories.length}`}
                        active={selected.length > 0}
                    />
                    <InfoTile
                        icon={<WarehouseOutlined />}
                        label="С остатком на складе"
                        value={scopeWithStock == null ? "—" : `${scopeWithStock} из ${scopeTotal ?? scopeCount}`}
                        active={(scopeWithStock ?? 0) > 0}
                    />
                    <InfoTile
                        icon={<PaymentsOutlined />}
                        label="Ожидаемая сумма"
                        value={money(scopeSum)}
                        active={scopeSum > 0}
                    />
                </Box>

                <FormControlLabel
                    control={(
                        <Switch
                            checked={onlyWithStock}
                            onChange={() => onToggleOnlyWithStock?.()}
                            disabled={disabled || !stockFilterAvailable || !onToggleOnlyWithStock}
                        />
                    )}
                    label={(
                        <Box>
                            <Typography variant="body2">Только позиции с остатком на складе</Typography>
                            <Typography variant="caption" color="text.secondary">
                                Товар без остатка всё равно можно пикнуть — он добавится в документ как излишек
                            </Typography>
                        </Box>
                    )}
                    sx={{ alignItems: "flex-start", ml: 0, "& .MuiSwitch-root": { mt: -0.5 } }}
                />

                <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ color: "text.secondary" }}>
                    <InfoOutlined sx={{ fontSize: 16, mt: "2px", color: "text.disabled" }} />
                    <Typography variant="caption" sx={{ lineHeight: 1.55 }}>
                        Ожидаемый остаток берётся по этому складу и замораживается в момент подсчёта
                        позиции — до пика в строке стоит текущий остаток склада. Штрихкоды, которых нет
                        в базе, не потеряются: они соберутся в блок «Неизвестные товары» на итогах.
                    </Typography>
                </Stack>
            </Stack>
        </AppCard>
    );
};

export default InventorySetupCard;
