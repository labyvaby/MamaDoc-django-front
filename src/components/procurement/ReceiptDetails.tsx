import React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import UndoOutlined from "@mui/icons-material/UndoOutlined";
import PrintOutlined from "@mui/icons-material/PrintOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import MoreVertOutlined from "@mui/icons-material/MoreVertOutlined";
import CancelOutlined from "@mui/icons-material/CancelOutlined";
import StorefrontOutlined from "@mui/icons-material/StorefrontOutlined";
import WarehouseOutlined from "@mui/icons-material/WarehouseOutlined";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import PersonOutlined from "@mui/icons-material/PersonOutlined";
import ScheduleOutlined from "@mui/icons-material/ScheduleOutlined";
import BadgeOutlined from "@mui/icons-material/BadgeOutlined";
import AccountBalanceOutlined from "@mui/icons-material/AccountBalanceOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import AddOutlined from "@mui/icons-material/AddOutlined";

import type { GoodsReceipt, SupplierPayment } from "../../api/procurement";
import { useInvoicePhotos } from "../../hooks/useInvoicePhotos";
import { InfoTile, InvoicePhotosField, ListEmptyState } from "../ui";
import { formatQuantity } from "../../utility/format";
import {
  ReceiptStatusChip,
  formatDueAt,
  formatLongDateTime,
  formatMoney,
  formatShortDateTime,
  paymentMethodLabel,
} from "./meta";

export interface ReceiptDetailsProps {
  receipt: GoodsReceipt | null;
  loading: boolean;
  payments: SupplierPayment[];
  paymentsLoading: boolean;
  organizationId: number | null;
  /** Права на кнопки — страница считает их один раз. */
  can: {
    pay: boolean;
    deletePayment: boolean;
    returnGoods: boolean;
    edit: boolean;
    cancel: boolean;
    photos: boolean;
    print: boolean;
  };
  onPay: () => void;
  onReturn: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onPrint: () => void;
  onDeletePayment: (payment: SupplierPayment) => void;
  /** Мобильный лист: кнопка «закрыть» в шапке. */
  onClose?: () => void;
}

const Section: React.FC<{ title: string; count?: React.ReactNode; children: React.ReactNode }> = ({ title, count, children }) => (
  <Box>
    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      {count != null && (
        <Typography variant="body2" color="text.secondary">
          {count}
        </Typography>
      )}
    </Stack>
    {children}
  </Box>
);

/**
 * Карточка накладной: сумма и прогресс оплаты, реквизиты плитками (§5.2),
 * позиции с партиями, оплаты по накладной, фото и комментарий. На десктопе —
 * правая колонка, на телефоне — содержимое bottom sheet.
 */
export const ReceiptDetails: React.FC<ReceiptDetailsProps> = ({
  receipt,
  loading,
  payments,
  paymentsLoading,
  organizationId,
  can,
  onPay,
  onReturn,
  onEdit,
  onCancel,
  onPrint,
  onDeletePayment,
  onClose,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [menuAnchor, setMenuAnchor] = React.useState<null | HTMLElement>(null);

  const photos = useInvoicePhotos({
    target: "goodsReceipt",
    entityId: receipt?.id ?? null,
    organizationId,
    open: receipt != null,
    canManage: can.photos && receipt?.status !== "canceled",
  });

  if (!receipt && !loading) {
    return (
      <Paper elevation={0} variant="outlined" sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 320 }}>
        <ListEmptyState
          icon={<ReceiptLongOutlined />}
          title="Выберите накладную"
          description="Слева — накладные вашего филиала. Откройте любую, чтобы увидеть позиции, оплаты и фото."
        />
      </Paper>
    );
  }

  if (!receipt) {
    return (
      <Paper elevation={0} variant="outlined" sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 320 }}>
        <CircularProgress />
      </Paper>
    );
  }

  const canceled = receipt.status === "canceled";
  const total = Number(receipt.totalCost);
  const paid = Number(receipt.paidTotal);
  const owed = total - Number(receipt.returnedTotal);
  const progress = owed > 0 ? Math.min(100, Math.round((paid / owed) * 100)) : 100;
  const due = formatDueAt(receipt.dueAt);
  const remaining = Number(receipt.remainingTotal);

  const actionsDisabled = canceled;

  return (
    <Paper
      elevation={0}
      variant={isMobile ? "elevation" : "outlined"}
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        minHeight: 0,
        bgcolor: "background.paper",
        ...(isMobile ? { border: 0, borderRadius: 0 } : null),
      }}
    >
      {/* Шапка */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}>
        <Stack direction="row" alignItems="flex-start" spacing={1.5}>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 1,
              flexShrink: 0,
              display: "grid",
              placeItems: "center",
              bgcolor: (t) => alpha(t.palette.primary.main, 0.1),
              color: "primary.onSurface",
            }}
          >
            <ReceiptLongOutlined />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
              <Typography variant="h6" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                {receipt.number}
              </Typography>
              <ReceiptStatusChip receipt={receipt} />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Приход от{" "}
              <Typography component="span" variant="body2" sx={{ color: "primary.onSurface", fontWeight: 500 }}>
                {receipt.supplierName}
              </Typography>{" "}
              · {formatLongDateTime(receipt.receivedAt)}
            </Typography>
          </Box>
          {onClose && (
            <IconButton size="small" onClick={onClose} aria-label="Закрыть">
              <CancelOutlined fontSize="small" />
            </IconButton>
          )}
          {!isMobile && (can.edit || can.cancel || can.print) && (
            <>
              <IconButton size="small" onClick={(e) => setMenuAnchor(e.currentTarget)} aria-label="Ещё">
                <MoreVertOutlined fontSize="small" />
              </IconButton>
              <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
                {can.edit && (
                  <MenuItem disabled={actionsDisabled} onClick={() => { setMenuAnchor(null); onEdit(); }}>
                    <ListItemIcon><EditOutlined fontSize="small" /></ListItemIcon>
                    <ListItemText>Изменить шапку</ListItemText>
                  </MenuItem>
                )}
                {can.print && (
                  <MenuItem onClick={() => { setMenuAnchor(null); onPrint(); }}>
                    <ListItemIcon><PrintOutlined fontSize="small" /></ListItemIcon>
                    <ListItemText>Печать</ListItemText>
                  </MenuItem>
                )}
                {can.cancel && (
                  <MenuItem disabled={actionsDisabled} onClick={() => { setMenuAnchor(null); onCancel(); }} sx={{ color: "error.main" }}>
                    <ListItemIcon><CancelOutlined fontSize="small" color="error" /></ListItemIcon>
                    <ListItemText>Отменить накладную</ListItemText>
                  </MenuItem>
                )}
              </Menu>
            </>
          )}
        </Stack>

        {canceled && (
          <Alert severity="info" sx={{ mt: 1.5 }}>
            Накладная отменена {formatShortDateTime(receipt.canceledAt)}
            {receipt.canceledByName ? ` · ${receipt.canceledByName}` : ""}. Товар снят со склада обратным движением.
          </Alert>
        )}

        {!canceled && (
          <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
            {can.pay && remaining > 0 && (
              <Button variant="contained" startIcon={<PaymentsOutlined />} onClick={onPay}>
                Оплатить
              </Button>
            )}
            {can.returnGoods && (
              <Button variant="outlined" startIcon={<UndoOutlined />} onClick={onReturn}>
                Возврат поставщику
              </Button>
            )}
            {can.print && (
              <Button variant="outlined" color="inherit" startIcon={<PrintOutlined />} onClick={onPrint} sx={{ borderColor: "divider" }}>
                Печать
              </Button>
            )}
            {isMobile && can.edit && (
              <Button variant="outlined" color="inherit" startIcon={<EditOutlined />} onClick={onEdit} sx={{ borderColor: "divider" }}>
                Изменить
              </Button>
            )}
            {isMobile && can.cancel && (
              <Button variant="outlined" color="error" startIcon={<CancelOutlined />} onClick={onCancel}>
                Отменить
              </Button>
            )}
          </Stack>
        )}
      </Box>

      {/* Тело */}
      <Box data-scrollable sx={{ overflowY: "auto", flex: 1, minHeight: 0, p: 2, display: "flex", flexDirection: "column", gap: 2.5 }}>
        {/* Сумма и оплата */}
        <Box>
          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "flex-end" }} spacing={1}>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Сумма накладной
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 600, lineHeight: 1.15, fontVariantNumeric: "tabular-nums" }}>
                {formatMoney(receipt.totalCost)}{" "}
                <Typography component="span" variant="h6" color="text.secondary" sx={{ fontWeight: 600 }}>
                  сом
                </Typography>
              </Typography>
            </Box>
            {due && (
              <Box sx={{ textAlign: { xs: "left", sm: "right" } }}>
                <Typography variant="caption" color="text.secondary">
                  Срок оплаты
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: due.overdue && remaining > 0 ? "error.onSurface" : "text.primary" }}>
                  {due.text}
                </Typography>
              </Box>
            )}
          </Stack>
          {!canceled && (
            <>
              <Box sx={{ height: 6, borderRadius: 3, bgcolor: "primary.lighter", overflow: "hidden", my: 1.5 }}>
                <Box sx={{ width: `${progress}%`, height: "100%", bgcolor: "primary.main", borderRadius: 3, transition: "width .3s ease" }} />
              </Box>
              <Stack direction="row" justifyContent="space-between" flexWrap="wrap" gap={1}>
                <Typography variant="body2" color="text.secondary">
                  Оплачено{" "}
                  <Typography component="span" variant="body2" sx={{ fontWeight: 600, color: "text.primary" }}>
                    {formatMoney(receipt.paidTotal)} сом
                  </Typography>{" "}
                  ({progress}%)
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Остаток{" "}
                  <Typography component="span" variant="body2" sx={{ fontWeight: 600, color: remaining > 0 ? "error.onSurface" : "success.onSurface" }}>
                    {formatMoney(receipt.remainingTotal)} сом
                  </Typography>
                </Typography>
              </Stack>
            </>
          )}
        </Box>

        {/* Реквизиты */}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "repeat(2, minmax(0, 1fr))" }, gap: 1.25 }}>
          <InfoTile icon={<StorefrontOutlined />} label="Поставщик" value={receipt.supplierName} />
          <InfoTile
            icon={<WarehouseOutlined />}
            label="Склад"
            value={receipt.branchName ? `${receipt.warehouseName} · ${receipt.branchName}` : receipt.warehouseName}
          />
          <InfoTile
            icon={<DescriptionOutlined />}
            label="Заказ поставщику"
            value={receipt.purchaseOrderNumber || undefined}
            active={Boolean(receipt.purchaseOrderNumber)}
          />
          <InfoTile icon={<PersonOutlined />} label="Принял" value={receipt.createdByName || undefined} active={Boolean(receipt.createdByName)} />
          <InfoTile icon={<ScheduleOutlined />} label="Дата прихода" value={formatLongDateTime(receipt.receivedAt)} />
          <InfoTile
            icon={<BadgeOutlined />}
            label="Номер поставщика"
            value={receipt.supplierNumber || undefined}
            active={Boolean(receipt.supplierNumber)}
            monospace
          />
        </Box>

        {/* Позиции */}
        <Section title="Позиции" count={`${receipt.lines.length}`}>
          {isMobile ? (
            <Stack spacing={1}>
              {receipt.lines.map((line) => (
                <Box key={line.id} sx={{ p: 1.25, border: 1, borderColor: "divider", borderRadius: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {line.productName}
                  </Typography>
                  {(line.lotNumber || line.expiresAt) && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      {line.lotNumber ? `Партия ${line.lotNumber}` : ""}
                      {line.lotNumber && line.expiresAt ? " · " : ""}
                      {line.expiresAt ? `годен до ${formatShortDateTime(line.expiresAt).split(",")[0]}` : ""}
                    </Typography>
                  )}
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {formatQuantity(line.quantity)} {line.productUnit || "шт"} × {formatMoney(line.costAmount)}
                    {line.costCurrency && line.costCurrency !== "KGS" ? ` ${line.costCurrency}` : ""}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    {formatMoney(line.lineTotal)} сом
                  </Typography>
                </Box>
              ))}
            </Stack>
          ) : (
            <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, overflowX: "auto" }}>
              <Table size="small" sx={{ "& td, & th": { borderColor: "divider" }, "& th": { color: "text.secondary", fontWeight: 600, fontSize: "0.75rem" } }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Товар</TableCell>
                    <TableCell align="right">Кол-во</TableCell>
                    <TableCell align="right">Цена</TableCell>
                    <TableCell align="right">Сумма</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {receipt.lines.map((line) => (
                    <TableRow key={line.id} hover sx={{ "&:last-child td": { border: 0 } }}>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {line.productName}
                        </Typography>
                        {(line.lotNumber || line.expiresAt || line.productSku) && (
                          <Typography variant="caption" color="text.secondary">
                            {[
                              line.productSku ? `SKU ${line.productSku}` : null,
                              line.lotNumber ? `Партия ${line.lotNumber}` : null,
                              line.expiresAt ? `годен до ${formatShortDateTime(line.expiresAt).split(",")[0]}` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                        {formatQuantity(line.quantity)} {line.productUnit || "шт"}
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                        {formatMoney(line.costAmount)}
                        {line.costCurrency && line.costCurrency !== "KGS" ? (
                          <Typography component="span" variant="caption" color="text.secondary">
                            {" "}
                            {line.costCurrency} × {formatMoney(line.exchangeRate)}
                          </Typography>
                        ) : null}
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                        {formatMoney(line.lineTotal)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
          <Stack alignItems="flex-end" spacing={0.25} sx={{ pt: 1.5, pr: 1, fontVariantNumeric: "tabular-nums" }}>
            <Typography variant="body1" sx={{ fontWeight: 700 }}>
              <Typography component="span" variant="body2" color="text.secondary" sx={{ mr: 3 }}>
                Итого по накладной
              </Typography>
              {formatMoney(receipt.totalCost)} сом
            </Typography>
            {Number(receipt.returnedTotal) > 0 && (
              <Typography variant="body2">
                <Typography component="span" variant="body2" color="text.secondary" sx={{ mr: 3 }}>
                  Возвращено поставщику
                </Typography>
                −{formatMoney(receipt.returnedTotal)} сом
              </Typography>
            )}
            {!canceled && (
              <>
                <Typography variant="body2">
                  <Typography component="span" variant="body2" color="text.secondary" sx={{ mr: 3 }}>
                    Оплачено
                  </Typography>
                  −{formatMoney(receipt.paidTotal)} сом
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: remaining > 0 ? "error.onSurface" : "success.onSurface" }}>
                  <Typography component="span" variant="body2" color="text.secondary" sx={{ mr: 3, fontWeight: 400 }}>
                    К оплате
                  </Typography>
                  {formatMoney(receipt.remainingTotal)} сом
                </Typography>
              </>
            )}
          </Stack>
        </Section>

        {/* Оплаты */}
        {!canceled && (
          <Section title="Оплаты поставщику" count={paymentsLoading ? <CircularProgress size={14} /> : payments.length}>
            <Stack spacing={1}>
              {payments.length === 0 && !paymentsLoading && (
                <Typography variant="body2" color="text.secondary">
                  По этой накладной оплат ещё не было.
                </Typography>
              )}
              {payments.map((payment) => (
                <Stack key={payment.id} direction="row" alignItems="center" spacing={1.5} sx={{ p: 1.25, border: 1, borderColor: "divider", borderRadius: 1 }}>
                  <Box
                    sx={(t) => ({
                      width: 36,
                      height: 36,
                      borderRadius: "10px",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                      color: "success.onSurface",
                      bgcolor: alpha(t.palette.success.main, 0.12),
                    })}
                  >
                    {payment.paymentMethod === "cash" ? <PaymentsOutlined fontSize="small" /> : <AccountBalanceOutlined fontSize="small" />}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {formatMoney(payment.amount)} сом{" "}
                      <Typography component="span" variant="caption" color="text.secondary">
                        · {paymentMethodLabel(payment.paymentMethod, payment.cashlessMethodName)}
                      </Typography>
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap display="block">
                      {formatShortDateTime(payment.paidAt)}
                      {payment.createdByName ? ` · ${payment.createdByName}` : ""}
                      {payment.documentNumber ? ` · № ${payment.documentNumber}` : ""}
                      {payment.comment ? ` · «${payment.comment}»` : ""}
                    </Typography>
                  </Box>
                  {can.deletePayment && (
                    <Tooltip title="Удалить оплату">
                      <IconButton size="small" onClick={() => onDeletePayment(payment)} aria-label="Удалить оплату">
                        <DeleteOutlineOutlined fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Stack>
              ))}
              {can.pay && remaining > 0 && (
                <Button variant="text" size="small" startIcon={<AddOutlined />} onClick={onPay} sx={{ alignSelf: "flex-start" }}>
                  Добавить оплату
                </Button>
              )}
            </Stack>
          </Section>
        )}

        {/* Фото */}
        <InvoicePhotosField state={photos} readOnly={!can.photos || canceled} />

        {/* Комментарий */}
        {receipt.comment && (
          <Section title="Комментарий">
            <Box sx={(t) => ({ p: 1.5, borderRadius: "10px", bgcolor: t.palette.mode === "dark" ? alpha("#fff", 0.06) : alpha("#0b0d0f", 0.04), whiteSpace: "pre-wrap" })}>
              <Typography variant="body2">{receipt.comment}</Typography>
            </Box>
          </Section>
        )}

        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ color: "text.secondary" }}>
          <HistoryOutlined sx={{ fontSize: 16 }} />
          <Typography variant="caption">
            Создана {formatShortDateTime(receipt.createdAt)}
            {receipt.createdByName ? ` · ${receipt.createdByName}` : ""}
            {receipt.updatedAt && receipt.updatedAt !== receipt.createdAt ? ` · изменена ${formatShortDateTime(receipt.updatedAt)}` : ""}
          </Typography>
        </Stack>
      </Box>
    </Paper>
  );
};

export default ReceiptDetails;
