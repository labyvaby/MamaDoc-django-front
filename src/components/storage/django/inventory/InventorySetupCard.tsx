import React from "react";
import {
    Box,
    ButtonBase,
    Divider,
    MenuItem,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import CategoryOutlined from "@mui/icons-material/CategoryOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import InfoOutlined from "@mui/icons-material/InfoOutlined";

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
    comment: string;
    onCommentChange: (value: string) => void;
    /** Сколько позиций попадёт в документ и на какую ожидаемую сумму. */
    scopeCount: number;
    scopeSum: number;
    responsibleName: string;
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
    comment,
    onCommentChange,
    scopeCount,
    scopeSum,
    responsibleName,
    disabled = false,
}) => {
    const allSelected = categories.length > 0 && selected.length === categories.length;

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
                        fullWidth
                    >
                        {warehouses.map((warehouse) => (
                            <MenuItem key={warehouse.id} value={warehouse.id}>
                                {warehouse.name}
                                {warehouse.isLinked ? ` · ${warehouse.branchName}` : ""}
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
                        icon={<PaymentsOutlined />}
                        label="Ожидаемая сумма"
                        value={money(scopeSum)}
                        active={scopeSum > 0}
                    />
                </Box>

                <TextField
                    label="Комментарий к документу"
                    placeholder="Например: плановый пересчёт за август"
                    value={comment}
                    onChange={(event) => onCommentChange(event.target.value)}
                    disabled={disabled}
                    fullWidth
                />

                <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ color: "text.secondary" }}>
                    <InfoOutlined sx={{ fontSize: 16, mt: "2px", color: "text.disabled" }} />
                    <Typography variant="caption" sx={{ lineHeight: 1.55 }}>
                        Штрихкоды, которых нет в базе, не потеряются — они соберутся в отдельный блок
                        «Неизвестные товары» на экране итогов.
                    </Typography>
                </Stack>
            </Stack>
        </AppCard>
    );
};

export default InventorySetupCard;
