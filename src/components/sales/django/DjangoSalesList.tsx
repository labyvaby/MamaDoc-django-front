import React from "react";
import {
    Box,
    Typography,
    Paper,
    List,
    ListItemButton,
    Avatar,
    Chip,
    Stack,
} from "@mui/material";
import { Inventory } from "@mui/icons-material";
import { DjangoSale } from "../../../api/sales";
import { formatKGS } from "../../../utility/format";
import { getSaleStatusConfig, getSaleStatusChipSx } from "../../../config/saleStatuses";

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

    if (loading && sales.length === 0) {
        return (
            <Box sx={{ p: 4, textAlign: "center" }}>
                <Typography variant="body2" color="text.secondary">
                    Загрузка...
                </Typography>
            </Box>
        );
    }

    if (sales.length === 0) {
        return (
            <Box sx={{ p: 4, textAlign: "center" }}>
                <Typography variant="body2" color="text.secondary">
                    Нет продаж
                </Typography>
            </Box>
        );
    }

    return (
        <Paper
            elevation={0}
            variant="outlined"
            sx={{
                height: { xs: "auto", md: "100%" },
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
            }}
        >
            <Box sx={{ p: 1.5, borderBottom: 1, borderColor: "divider" }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Список продаж ({sales.length})
                </Typography>
            </Box>
            <Box
                sx={{
                    overflowY: "auto",
                    flex: 1,
                    pb: 2,
                }}
            >
                <List sx={{ py: 0.5 }}>
                    {sales.map((sale) => {
                        const displayStatus = sale.discountPercent > 0 && sale.status === "paid"
                            ? "discounted"
                            : sale.status;
                        const statusConfig = getSaleStatusConfig(displayStatus);
                        const chipLabel = sale.discountPercent > 0 && sale.status === "paid"
                            ? `Со скидкой ${sale.discountPercent}%`
                            : statusConfig.label;

                        return (
                            <ListItemButton
                                key={sale.id}
                                sx={{
                                    px: 2,
                                    py: 1.5,
                                    bgcolor: selectedSale?.id === sale.id ? "action.selected" : "transparent",
                                    "&:hover": { bgcolor: "action.hover" },
                                    borderBottom: 1,
                                    borderColor: "divider",
                                }}
                                onClick={() => onSelect(sale)}
                            >
                                <Avatar
                                    variant="rounded"
                                    src={sale.lines?.[0]?.productImageUrl || undefined}
                                    sx={{ mr: 2, width: 40, height: 40, bgcolor: "action.selected", color: "text.secondary" }}
                                >
                                    <Inventory />
                                </Avatar>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant="body1" sx={{ fontWeight: 500 }} noWrap>
                                        {sale.lines?.map((l) => l.productName).filter(Boolean).join(", ") || "Товар удален"}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" noWrap>
                                        {sale.patientName || "Анонимный"}
                                    </Typography>
                                </Box>
                                <Stack alignItems="flex-end" spacing={0.5}>
                                    <Chip
                                        label={chipLabel}
                                        icon={statusConfig.icon}
                                        size="small"
                                        sx={getSaleStatusChipSx(displayStatus)}
                                    />
                                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                                        {formatKGS(sale.totalAmount ?? 0)}
                                    </Typography>
                                </Stack>
                            </ListItemButton>
                        );
                    })}
                </List>
                {loadMoreRef && <Box ref={loadMoreRef} sx={{ height: 1 }} />}
                {loadingMore && (
                    <Box sx={{ py: 2, textAlign: "center" }}>
                        <Typography variant="body2" color="text.secondary">
                            Загрузка...
                        </Typography>
                    </Box>
                )}
            </Box>
        </Paper>
    );
};
