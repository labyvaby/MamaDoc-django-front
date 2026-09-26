import React from "react";
import { Box } from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";
import dayjs from "dayjs";
import "dayjs/locale/ru";

import {
  RECEIPT_PAYMENT_STATUS_LABEL,
  SUPPLIER_PAYMENT_METHOD_LABEL,
  type GoodsReceipt,
  type ReceiptPaymentStatus,
  type SupplierPaymentMethod,
} from "../../api/procurement";

dayjs.locale("ru");

/**
 * Цвета статусов — по семантике приложения (config/appointmentStatuses):
 * долг → error, частично оплачено → purple, оплачено → success. Отменённая
 * накладная — нейтральный серый: это не состояние денег, а «документа нет».
 */
export type StatusTone = "success" | "error" | "purple" | "info" | "neutral";

export type ReceiptChipStatus = ReceiptPaymentStatus | "canceled";

export const RECEIPT_STATUS_META: Record<ReceiptChipStatus, { label: string; short: string; tone: StatusTone }> = {
  unpaid: { label: RECEIPT_PAYMENT_STATUS_LABEL.unpaid, short: "Не оплачена", tone: "error" },
  partial: { label: RECEIPT_PAYMENT_STATUS_LABEL.partial, short: "Частично", tone: "purple" },
  paid: { label: RECEIPT_PAYMENT_STATUS_LABEL.paid, short: "Оплачена", tone: "success" },
  canceled: { label: "Отменена", short: "Отменена", tone: "neutral" },
};

export const receiptChipStatus = (receipt: Pick<GoodsReceipt, "status" | "paymentStatus">): ReceiptChipStatus =>
  receipt.status === "canceled" ? "canceled" : receipt.paymentStatus;

export const paymentMethodLabel = (method: SupplierPaymentMethod, cashlessName?: string): string => {
  const base = SUPPLIER_PAYMENT_METHOD_LABEL[method] ?? method;
  return cashlessName ? `${base} · ${cashlessName}` : base;
};

const toneColor = (t: Theme, tone: StatusTone) => {
  switch (tone) {
    case "success":
      return t.palette.success;
    case "error":
      return t.palette.error;
    case "purple":
      return t.palette.purple;
    case "info":
      return t.palette.info;
    default:
      return null;
  }
};

/** Статус-чип по гайду §5.5: точка + текст на статус-тинте, радиус 7px. */
export const StatusChip: React.FC<{ tone: StatusTone; label: string; compact?: boolean }> = ({
  tone,
  label,
  compact = false,
}) => (
  <Box
    component="span"
    sx={(t) => {
      const c = toneColor(t, tone);
      return {
        display: "inline-flex",
        alignItems: "center",
        gap: 0.75,
        height: 24,
        px: compact ? 0.75 : 1,
        borderRadius: "7px",
        fontSize: "0.75rem",
        fontWeight: 500,
        whiteSpace: "nowrap",
        flexShrink: 0,
        bgcolor: c
          ? alpha(c.main, t.palette.mode === "dark" ? 0.2 : 0.14)
          : t.palette.mode === "dark"
            ? alpha("#ffffff", 0.06)
            : alpha("#0b0d0f", 0.04),
        color: c ? (t.palette.mode === "dark" ? c.light : c.dark) : "text.secondary",
      };
    }}
  >
    <Box
      component="span"
      sx={(t) => ({
        width: 7,
        height: 7,
        borderRadius: "50%",
        bgcolor: toneColor(t, tone)?.main ?? t.palette.grey[500],
        flexShrink: 0,
      })}
    />
    {label}
  </Box>
);

export const ReceiptStatusChip: React.FC<{
  receipt: Pick<GoodsReceipt, "status" | "paymentStatus">;
  compact?: boolean;
}> = ({ receipt, compact }) => {
  const meta = RECEIPT_STATUS_META[receiptChipStatus(receipt)];
  return <StatusChip tone={meta.tone} label={compact ? meta.short : meta.label} compact={compact} />;
};

/** «184 300» — без знака валюты: он идёт отдельным приглушённым «сом». */
export const formatMoney = (value: string | number | null | undefined): string => {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(num);
};

/** «184 300 сом» одной строкой — для подписей и вторичного текста. */
export const formatSom = (value: string | number | null | undefined): string => `${formatMoney(value)} сом`;

/** «13 сен, 10:42» — короткая дата для строк списка. */
export const formatShortDateTime = (iso: string | null | undefined): string =>
  iso ? dayjs(iso).format("D MMM, HH:mm") : "—";

/** «13 сентября 2026, 10:42» — полная дата для карточки. */
export const formatLongDateTime = (iso: string | null | undefined): string =>
  iso ? dayjs(iso).format("D MMMM YYYY, HH:mm") : "—";

/** «13.10.2026 · через 30 дней» / «просрочено на 3 дня». */
export const formatDueAt = (iso: string | null | undefined): { text: string; overdue: boolean } | null => {
  if (!iso) return null;
  const due = dayjs(iso);
  const days = due.startOf("day").diff(dayjs().startOf("day"), "day");
  if (days < 0) return { text: `${due.format("DD.MM.YYYY")} · просрочено на ${Math.abs(days)} дн.`, overdue: true };
  if (days === 0) return { text: `${due.format("DD.MM.YYYY")} · сегодня`, overdue: false };
  return { text: `${due.format("DD.MM.YYYY")} · через ${days} дн.`, overdue: false };
};

/** Первая буква названия для аватара строки. */
export const initialOf = (name: string): string => {
  const cleaned = name.replace(/^(ОсОО|ОАО|ЗАО|ООО|ИП|LLC|Ltd)\s*/i, "").replace(/[«»"']/g, "").trim();
  return (cleaned || name).charAt(0).toUpperCase() || "?";
};
