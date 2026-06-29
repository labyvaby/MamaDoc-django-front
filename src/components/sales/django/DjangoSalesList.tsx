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
import { InventoryOutlined as Inventory } from "@mui/icons-material";
import MedicalServicesOutlinedIcon from "@mui/icons-material/MedicalServicesOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import dayjs from "dayjs";
import { DjangoSale } from "../../../api/sales";
import { subtleBg } from "../../../theme";
import { formatKGS } from "../../../utility/format";
import { getSaleStatusConfig, getSaleStatusChipSx } from "../../../config/saleStatuses";
import { ListLoadingSkeleton, ListEmptyState } from "../../ui";

/** Подпись способа оплаты по суммам нал/безнал. */
const paymentLabel = (sale: DjangoSale): string | null => {
    const cash = sale.paidCash > 0;
    const card = sale.paidCard > 0;
    if (cash && card) return "Смеш.";
    if (cash) return "Нал";
    if (card) return "Безнал";
    return null;
};

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
                            const isSelected =
                                selectedSale?.id === sale.id &&
                                selectedSale?.source === sale.source;
                            const fromAppointment = sale.source === "appointment";
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
                                    key={`${sale.source}-${sale.id}`}
                                    focusRipple
                                    onClick={() => onSelect(sale)}
                                    sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 1.5,
                                        width: "100%",
                                        textAlign: "left",
                                        p: 1.25,
                                        borderRadius: "14px",
                                        border: 1,
                                        borderColor: isSelected ? "primary.main" : "divider",
                                        bgcolor: (theme) =>
                                            isSelected
                                                ? alpha(theme.palette.primary.main, 0.08)
                                                : "background.paper",
                                        transition:
                                            "border-color .15s ease, background-color .15s ease",
                                        "&:hover": {
                                            borderColor: (theme) => alpha(theme.palette.primary.main, 0.28),
                                            bgcolor: (theme) => subtleBg(theme, true),
                                        },
                                    }}
                                >
                                    <Avatar
                                        variant="rounded"
                                        src={sale.lines?.[0]?.productImageUrl || undefined}
                                        sx={{
                                            flexShrink: 0,
                                            width: 48,
                                            height: 48,
                                            borderRadius: "14px",
                                            bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                                            color: "primary.onSurface",
                                        }}
                                    >
                                        {fromAppointment ? (
                                            <MedicalServicesOutlinedIcon fontSize="small" />
                                        ) : (
                                            <Inventory fontSize="small" />
                                        )}
                                    </Avatar>

                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                                            {sale.lines
                                                ?.map((l) => l.productName)
                                                .filter(Boolean)
                                                .join(", ") || "Товар удалён"}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" noWrap display="block">
                                            №{sale.id} · {sale.patientName || "Анонимный"}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" noWrap display="block">
                                            {dayjs(sale.createdAt).format("DD.MM HH:mm")}
                                        </Typography>
                                    </Box>

                                    <Stack alignItems="flex-end" spacing={0.5} sx={{ flexShrink: 0 }}>
                                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                            {formatKGS(sale.totalAmount ?? 0)}
                                        </Typography>
                                        {fromAppointment ? (
                                            <Chip
                                                label="С приёма"
                                                icon={<MedicalServicesOutlinedIcon />}
                                                size="small"
                                                color="info"
                                                variant="outlined"
                                            />
                                        ) : (
                                            <Stack direction="row" spacing={0.5} alignItems="center">
                                                {paymentLabel(sale) && (
                                                    <Chip
                                                        label={paymentLabel(sale)}
                                                        size="small"
                                                        variant="outlined"
                                                        sx={{ height: 22, borderRadius: "7px" }}
                                                    />
                                                )}
                                                <Chip
                                                    label={chipLabel}
                                                    icon={statusConfig.icon}
                                                    size="small"
                                                    sx={getSaleStatusChipSx(displayStatus)}
                                                />
                                            </Stack>
                                        )}
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
