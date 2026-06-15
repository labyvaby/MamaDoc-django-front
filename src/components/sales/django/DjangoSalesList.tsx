import React from "react";
import {
    Box,
    Typography,
    Paper,
    Avatar,
    Chip,
    Stack,
    ButtonBase,
    alpha,
} from "@mui/material";
import { Inventory } from "@mui/icons-material";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import { DjangoSale } from "../../../api/sales";
import { formatKGS } from "../../../utility/format";
import { getSaleStatusConfig, getSaleStatusChipSx } from "../../../config/saleStatuses";
import { ListLoadingSkeleton, ListEmptyState } from "../../ui";

interface DjangoSalesListProps {
    sales: DjangoSale[];
    selectedSale: DjangoSale | null;
    onSelect: (sale: DjangoSale) => void;
    loading: boolean;
    loadMoreRef?: React.Ref<HTMLDivElement>;
    loadingMore?: boolean;
}

export const DjangoSalesList: React.FC<DjangoSalesListProps> = ({
    sales,
    selectedSale,
    onSelect,
    loading,
    loadMoreRef,
    loadingMore,
}) => {
    return (
        <Paper
            elevation={0}
            variant="outlined"
            sx={{
                height: { xs: "auto", md: "100%" },
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                position: "relative",
            }}
        >
            <Box sx={{ p: 1.5, borderBottom: 1, borderColor: "divider" }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    Список продаж ({sales.length})
                </Typography>
            </Box>

            {!loading && sales.length === 0 && (
                <Box sx={{ position: "absolute", inset: 0, display: "flex", pointerEvents: "none" }}>
                    <ListEmptyState
                        icon={<ReceiptLongOutlinedIcon />}
                        title="Продаж пока нет"
                        description="Здесь появятся оформленные продажи за выбранный период."
                    />
                </Box>
            )}

            <Box sx={{ overflowY: "auto", flex: 1 }}>
                {loading && sales.length === 0 ? (
                    <ListLoadingSkeleton rows={6} />
                ) : sales.length === 0 ? null : (
                    <Stack spacing={1} sx={{ p: 1.5 }}>
                        {sales.map((sale) => {
                            const isSelected = selectedSale?.id === sale.id;
                            const displayStatus =
                                sale.discountPercent > 0 && sale.status === "paid"
                                    ? "discounted"
                                    : sale.status;
                            const statusConfig = getSaleStatusConfig(displayStatus);
                            const chipLabel =
                                sale.discountPercent > 0 && sale.status === "paid"
                                    ? `Со скидкой ${sale.discountPercent}%`
                                    : statusConfig.label;

                            return (
                                <ButtonBase
                                    key={sale.id}
                                    focusRipple
                                    onClick={() => onSelect(sale)}
                                    sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 1.5,
                                        width: "100%",
                                        textAlign: "left",
                                        p: 1.25,
                                        borderRadius: 2,
                                        border: 1,
                                        borderColor: isSelected ? "primary.main" : "divider",
                                        bgcolor: (theme) =>
                                            isSelected
                                                ? alpha(theme.palette.primary.main, 0.08)
                                                : "background.paper",
                                        transition:
                                            "border-color .15s ease, box-shadow .15s ease, transform .1s ease, background-color .15s ease",
                                        "&:hover": {
                                            borderColor: "primary.main",
                                            boxShadow: (theme) =>
                                                `0 4px 16px ${alpha(theme.palette.primary.main, 0.12)}`,
                                        },
                                        "&:active": { transform: "translateY(0.5px)" },
                                    }}
                                >
                                    <Avatar
                                        variant="rounded"
                                        src={sale.lines?.[0]?.productImageUrl || undefined}
                                        sx={{
                                            flexShrink: 0,
                                            width: 48,
                                            height: 48,
                                            borderRadius: 2,
                                            bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                                            color: "primary.main",
                                        }}
                                    >
                                        <Inventory fontSize="small" />
                                    </Avatar>

                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                                            {sale.lines
                                                ?.map((l) => l.productName)
                                                .filter(Boolean)
                                                .join(", ") || "Товар удалён"}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" noWrap display="block">
                                            {sale.patientName || "Анонимный"}
                                        </Typography>
                                    </Box>

                                    <Stack alignItems="flex-end" spacing={0.5} sx={{ flexShrink: 0 }}>
                                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                            {formatKGS(sale.totalAmount ?? 0)}
                                        </Typography>
                                        <Chip
                                            label={chipLabel}
                                            icon={statusConfig.icon}
                                            size="small"
                                            sx={getSaleStatusChipSx(displayStatus)}
                                        />
                                    </Stack>
                                </ButtonBase>
                            );
                        })}

                        {loadMoreRef && <Box ref={loadMoreRef} sx={{ height: 1 }} />}
                        {loadingMore && <ListLoadingSkeleton rows={2} />}
                    </Stack>
                )}
            </Box>
        </Paper>
    );
};
