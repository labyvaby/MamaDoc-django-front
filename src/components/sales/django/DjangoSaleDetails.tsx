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
import { InventoryOutlined as Inventory, EditOutlined, DeleteOutline } from "@mui/icons-material";
import MedicalServicesOutlinedIcon from "@mui/icons-material/MedicalServicesOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import { useNotification } from "@refinedev/core";
import { DjangoSale } from "../../../api/sales";
import { getPatient, type DjangoPatient } from "../../../api/patients";
import { useCan } from "../../../hooks/useCan";
import DjangoEditPatientDrawer from "../../patients/DjangoEditPatientDrawer";
import { formatKGS, formatDateRu } from "../../../utility/format";

import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { PaymentInfoBlock, ListEmptyState } from "../../ui";
import { getSaleStatusConfig, getSaleStatusChipSx } from "../../../config/saleStatuses";
import { useT } from "../../../i18n/VerticalProvider";

interface DjangoSaleDetailsProps {
    sale: DjangoSale | null;
    onEdit?: (sale: DjangoSale) => void;
    onDelete?: (sale: DjangoSale) => void;
    canEdit?: boolean;
    canDelete?: boolean;
    /** Карту покупателя поправили — обновить список продаж (ФИО и телефон в нём). */
    onPatientUpdated?: () => void;
}

export const DjangoSaleDetails: React.FC<DjangoSaleDetailsProps> = ({
    sale,
    onEdit,
    onDelete,
    canEdit = true,
    canDelete = true,
    onPatientUpdated,
}) => {
    const { t } = useT("sales");
    const { open: notify } = useNotification();
    const [confirmOpen, setConfirmOpen] = React.useState(false);
    const canUpdatePatient = useCan("patients.update");

    // Продажа отдаёт только id/ФИО/телефон покупателя, а форма правки шлёт
    // дату рождения, пол и адрес явно — карту догружаем целиком, иначе PATCH
    // обнулил бы недостающие поля.
    const [editPatient, setEditPatient] = React.useState<DjangoPatient | null>(null);
    const [editOpen, setEditOpen] = React.useState(false);
    const [editLoading, setEditLoading] = React.useState(false);
    const openEditPatient = React.useCallback(
        async (patientId: number) => {
            setEditLoading(true);
            try {
                const fresh = await getPatient(patientId);
                setEditPatient(fresh);
                setEditOpen(true);
            } catch {
                notify?.({ type: "error", message: t("details.editPatientFailed") });
            } finally {
                setEditLoading(false);
            }
        },
        [notify, t],
    );

    if (!sale) {
        return (
            <Box
                sx={{
                    height: "100%",
                    display: "flex",
                    border: "1px dashed",
                    borderColor: "divider",
                    borderRadius: "14px",
                }}
            >
                <ListEmptyState
                    icon={<ReceiptLongOutlinedIcon />}
                    title={t("details.emptyTitle")}
                    description={t("details.emptyDescription")}
                />
            </Box>
        );
    }

    const fromAppointment = sale.source === "appointment";
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
                {/* Кнопки управления — недоступны для записей из приёма:
                    товары приёма редактируются в самом приёме, не здесь. */}
                {fromAppointment ? (
                    <Box sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}>
                        <Chip
                            label={t("details.fromVisitChip")}
                            icon={<MedicalServicesOutlinedIcon />}
                            size="small"
                            color="info"
                            variant="outlined"
                        />
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                            {t("details.fromVisitHint")}
                        </Typography>
                    </Box>
                ) : (
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
                                        {t("details.editAction")}
                                    </Button>
                                )}
                            </Stack>

                            {canDelete && onDelete && (
                                <Tooltip title={t("details.deleteTooltip")}>
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
                )}

                <Box sx={{ p: 3 }}>
                    <Stack spacing={3}>
                        {/* Заголовок продажи */}
                        <Box>
                            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                    {fromAppointment
                                        ? t("details.visitTitle", { id: sale.appointmentId ?? sale.id })
                                        : t("details.saleTitle", { id: sale.id })}
                                </Typography>
                                {!fromAppointment && (
                                    <Chip
                                        label={
                                            hasDiscount
                                                ? t("details.discountedChip", { percent: sale.discountPercent })
                                                : getSaleStatusConfig(displayStatus).label
                                        }
                                        icon={getSaleStatusConfig(displayStatus).icon}
                                        size="small"
                                        sx={getSaleStatusChipSx(displayStatus)}
                                    />
                                )}
                            </Stack>
                        </Box>

                        {/* Дата и время */}
                        <Box>
                            <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                                {t("details.dateTime")}
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
                                {t("details.buyer")}
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
                                        {sale.patientName || t("details.anonymousBuyer")}
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
                                {sale.patientId && canUpdatePatient && (
                                    <Tooltip title={t("details.editPatient")}>
                                        <IconButton
                                            size="small"
                                            disabled={editLoading}
                                            onClick={() => void openEditPatient(sale.patientId!)}
                                        >
                                            <EditOutlined sx={{ fontSize: 18 }} />
                                        </IconButton>
                                    </Tooltip>
                                )}
                            </Paper>
                        </Box>

                        <Divider />

                        {/* Товары */}
                        <Box>
                            <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                                {t("details.products")}
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
                                                borderRadius: "14px",
                                                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                                                color: "primary.onSurface",
                                            }}
                                        >
                                            <Inventory />
                                        </Avatar>
                                        <Box sx={{ flex: 1 }}>
                                            <Typography variant="body1" fontWeight={600}>
                                                {line.productName || t("details.productDeleted")}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {t("details.qtyByPrice", { quantity: line.quantity, price: formatKGS(line.price) })}
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
                        {fromAppointment ? (
                            <Box>
                                <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                                    {t("details.paymentInVisit")}
                                </Typography>
                                <Stack spacing={1}>
                                    {[
                                        { label: t("details.paymentCash"), value: sale.paidCash },
                                        { label: t("details.paymentCard"), value: sale.paidCard },
                                        { label: t("details.paymentBalance"), value: sale.paidBalance },
                                        { label: t("details.paymentBonuses"), value: sale.paidBonuses },
                                    ]
                                        .filter((row) => (row.value ?? 0) > 0)
                                        .map((row) => (
                                            <Stack key={row.label} direction="row" justifyContent="space-between">
                                                <Typography variant="body2" color="text.secondary">{row.label}</Typography>
                                                <Typography variant="body2" fontWeight={600}>{formatKGS(row.value ?? 0)}</Typography>
                                            </Stack>
                                        ))}
                                    {sale.paidCash === 0 && sale.paidCard === 0 && sale.paidBalance === 0 && sale.paidBonuses === 0 && (
                                        <Typography variant="body2" color="text.secondary">
                                            {t("details.noVisitPayment")}
                                        </Typography>
                                    )}
                                    <Divider />
                                    <Stack direction="row" justifyContent="space-between">
                                        <Typography variant="body2" fontWeight={600}>{t("details.productsSum")}</Typography>
                                        <Typography variant="body2" fontWeight={700}>{formatKGS(sale.totalAmount ?? 0)}</Typography>
                                    </Stack>
                                </Stack>
                            </Box>
                        ) : (
                            <PaymentInfoBlock
                                payment={{
                                    baseTotal: sale.baseTotal,
                                    discountPercent: sale.discountPercent || undefined,
                                    discountAmount: discountAmount || undefined,
                                    cash: sale.paidCash,
                                    card: sale.paidCard,
                                    cashlessMethodName: sale.cashlessMethodName,
                                    finalTotal: sale.totalAmount,
                                    debt,
                                    status: displayStatus,
                                }}
                                variant="detailed"
                                showIcons={true}
                            />
                        )}

                        {/* Комментарий */}
                        {sale.comment && (
                            <>
                                <Divider />
                                <Box>
                                    <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                                        {t("details.comment")}
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
                title={t("details.deleteDialogTitle")}
                message={t("details.deleteDialogMessage")}
                confirmText={t("details.deleteConfirm")}
                variant="error"
            />

            <DjangoEditPatientDrawer
                open={editOpen}
                patient={editPatient}
                onClose={() => setEditOpen(false)}
                onUpdated={(p) => {
                    setEditOpen(false);
                    setEditPatient(p);
                    onPatientUpdated?.();
                }}
            />
        </>
    );
};
