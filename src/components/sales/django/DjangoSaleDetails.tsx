import React from "react";
import {
    Box,
    Typography,
    Paper,
    Stack,
    Divider,
    Avatar,
    Button,
    IconButton,
    Tooltip,
    alpha,
    Chip,
} from "@mui/material";
import { Inventory, EditOutlined, DeleteOutline } from "@mui/icons-material";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import { DjangoSale } from "../../../api/sales";
import { formatKGS, formatDateRu } from "../../../utility/format";

import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { PaymentInfoBlock, ListEmptyState } from "../../ui";
import { getSaleStatusConfig, getSaleStatusChipSx } from "../../../config/saleStatuses";

interface DjangoSaleDetailsProps {
    sale: DjangoSale | null;
    onEdit?: (sale: DjangoSale) => void;
    onDelete?: (sale: DjangoSale) => void;
    canEdit?: boolean;
    canDelete?: boolean;
}

export const DjangoSaleDetails: React.FC<DjangoSaleDetailsProps> = ({
    sale,
    onEdit,
    onDelete,
    canEdit = true,
    canDelete = true,
}) => {
    const [confirmOpen, setConfirmOpen] = React.useState(false);

    if (!sale) {
        return (
            <Box
                sx={{
                    height: "100%",
                    display: "flex",
                    border: "1px dashed",
                    borderColor: "divider",
                    borderRadius: 2,
                }}
            >
                <ListEmptyState
                    icon={<ReceiptLongOutlinedIcon />}
                    title="Выберите продажу"
                    description="Нажмите на продажу в списке, чтобы увидеть состав, оплату и покупателя."
                />
            </Box>
        );
    }

    const hasDiscount = sale.status === "paid" && sale.discountPercent > 0;
    const displayStatus = hasDiscount ? "discounted" : sale.status;
    const discountAmount = Math.max(0, sale.baseTotal - sale.totalAmount);
    const debt = sale.status === "paid"
        ? 0
        : Math.max(0, sale.totalAmount - sale.paidCash - sale.paidCard);

    return (
        <>
            <Paper
                elevation={0}
                variant="outlined"
                sx={{
                    display: "flex",
                    flexDirection: "column",
                    minHeight: 0,
                }}
            >
                {/* Кнопки управления */}
                <Box sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}>
                    <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                        <Stack direction="row" spacing={1} alignItems="center">
                            {canEdit && onEdit && (
                                <Button
                                    variant="outlined"
                                    size="small"
                                    startIcon={<EditOutlined />}
                                    onClick={() => onEdit?.(sale)}
                                >
                                    Изменить
                                </Button>
                            )}
                        </Stack>

                        {canDelete && onDelete && (
                            <Tooltip title="Удалить">
                                <span>
                                    <IconButton
                                        size="small"
                                        onClick={() => setConfirmOpen(true)}
                                        sx={{
                                            border: "1px solid",
                                            borderColor: "error.main",
                                            color: "error.main",
                                            "&:hover": {
                                                borderColor: "error.dark",
                                                backgroundColor: (theme) => alpha(theme.palette.error.main, 0.08),
                                            },
                                        }}
                                    >
                                        <DeleteOutline fontSize="small" />
                                    </IconButton>
                                </span>
                            </Tooltip>
                        )}
                    </Stack>
                </Box>

                <Box sx={{ p: 3 }}>
                    <Stack spacing={3}>
                        {/* Заголовок продажи */}
                        <Box>
                            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                    Продажа #{sale.id}
                                </Typography>
                                <Chip
                                    label={
                                        hasDiscount
                                            ? `Со скидкой ${sale.discountPercent}%`
                                            : getSaleStatusConfig(displayStatus).label
                                    }
                                    icon={getSaleStatusConfig(displayStatus).icon}
                                    size="small"
                                    sx={getSaleStatusChipSx(displayStatus)}
                                />
                            </Stack>
                        </Box>

                        {/* Дата и время */}
                        <Box>
                            <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                                Дата и время
                            </Typography>
                            <Typography variant="body1">
                                {sale.createdAt
                                    ? `${formatDateRu(sale.createdAt)}, ${new Date(sale.createdAt).toLocaleTimeString("ru-RU", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                    })}`
                                    : "—"}
                                {sale.createdByName ? ` • ${sale.createdByName}` : ""}
                            </Typography>
                        </Box>

                        <Divider />

                        {/* Информация о покупателе */}
                        <Box>
                            <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                                Покупатель
                            </Typography>
                            <Paper
                                variant="outlined"
                                sx={{
                                    p: 2,
                                    display: "flex",
                                    alignItems: "center",
                                    bgcolor: (theme) => alpha(theme.palette.primary.main, 0.02),
                                }}
                            >
                                <Avatar
                                    src={sale.patientAvatarUrl || undefined}
                                    sx={{
                                        width: 56,
                                        height: 56,
                                        mr: 2,
                                        bgcolor: "primary.light",
                                        color: "primary.contrastText",
                                    }}
                                >
                                    {sale.patientName?.charAt(0) || "А"}
                                </Avatar>
                                <Box sx={{ flex: 1 }}>
                                    <Typography variant="subtitle1" fontWeight={600}>
                                        {sale.patientName || "Анонимный покупатель"}
                                    </Typography>
                                    {sale.patientPhone && (
                                        <Typography variant="body2" color="text.secondary">
                                            {sale.patientPhone}
                                        </Typography>
                                    )}
                                    {sale.patientId && (
                                        <Typography variant="caption" color="text.disabled" display="block">
                                            ID: {sale.patientId}
                                        </Typography>
                                    )}
                                </Box>
                            </Paper>
                        </Box>

                        <Divider />

                        {/* Товары */}
                        <Box>
                            <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                                Товары
                            </Typography>
                            <Stack spacing={1.5}>
                                {sale.lines?.map((line) => (
                                    <Paper
                                        key={line.id}
                                        variant="outlined"
                                        sx={{
                                            p: 2,
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 2,
                                        }}
                                    >
                                        <Avatar
                                            variant="rounded"
                                            src={line.productImageUrl || undefined}
                                            sx={{
                                                width: 48,
                                                height: 48,
                                                borderRadius: 2,
                                                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                                                color: "primary.onSurface",
                                            }}
                                        >
                                            <Inventory />
                                        </Avatar>
                                        <Box sx={{ flex: 1 }}>
                                            <Typography variant="body1" fontWeight={600}>
                                                {line.productName || "Товар удален"}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {line.quantity} шт × {formatKGS(line.price)}
                                            </Typography>
                                        </Box>
                                        <Typography variant="body1" fontWeight={700}>
                                            {formatKGS(line.total)}
                                        </Typography>
                                    </Paper>
                                ))}
                            </Stack>
                        </Box>

                        <Divider />

                        {/* Payment Information */}
                        <PaymentInfoBlock
                            payment={{
                                baseTotal: sale.baseTotal,
                                discountPercent: sale.discountPercent || undefined,
                                discountAmount: discountAmount || undefined,
                                cash: sale.paidCash,
                                card: sale.paidCard,
                                finalTotal: sale.totalAmount,
                                debt,
                                status: displayStatus,
                            }}
                            variant="detailed"
                            showIcons={true}
                        />

                        {/* Комментарий */}
                        {sale.comment && (
                            <>
                                <Divider />
                                <Box>
                                    <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                                        Комментарий
                                    </Typography>
                                    <Typography variant="body2">{sale.comment}</Typography>
                                </Box>
                            </>
                        )}
                    </Stack>
                </Box>
            </Paper>

            <ConfirmDialog
                open={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                onConfirm={() => {
                    onDelete?.(sale);
                    setConfirmOpen(false);
                }}
                title="Удаление продажи"
                message="Вы уверены, что хотите удалить эту продажу? Это действие нельзя отменить, а товары вернутся на склад."
                confirmText="Удалить"
                variant="error"
            />
        </>
    );
};
