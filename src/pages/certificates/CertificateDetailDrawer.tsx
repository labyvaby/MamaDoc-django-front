import React from "react";
import { Alert, Box, Divider, Drawer, IconButton, LinearProgress, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import dayjs from "dayjs";
import "dayjs/locale/ru";

import CloseOutlined from "@mui/icons-material/CloseOutlined";
import BlockOutlined from "@mui/icons-material/BlockOutlined";

import { getErrorMessage } from "../../api/client";
import type { GiftCertificateDetail, GiftCertificateMoneyRow, GiftCertificateUseRow } from "../../api/promotions";
import { AppButton, TonedChip } from "../../components/ui";
import { useSheetBackClose } from "../../hooks/useSheetBackClose";
import { subtleBg, subtleBorder } from "../../theme/uiHelpers";
import { PosAmount } from "../pos/ui";
import { certificateExpiryLabel, certificateStatusMeta } from "./certificateMeta";

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography
    variant="overline"
    sx={{ display: "block", color: "text.secondary", fontWeight: 600, letterSpacing: ".08em", lineHeight: 1.4, mb: 1 }}
  >
    {children}
  </Typography>
);

const dateTime = (iso: string | null | undefined) => (iso ? dayjs(iso).locale("ru").format("D MMM YYYY, HH:mm") : "—");

const METHOD_LABELS: Record<string, string> = { cash: "Наличные", card: "Карта", cashless: "Безнал" };

const Field: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode }> = ({ label, value, hint }) => (
  <Box sx={{ minWidth: 0 }}>
    <Typography variant="caption" color="text.secondary" display="block">
      {label}
    </Typography>
    <Typography variant="body2" fontWeight={600} sx={{ wordBreak: "break-word" }}>
      {value}
    </Typography>
    {hint && (
      <Typography variant="caption" color="text.secondary" display="block">
        {hint}
      </Typography>
    )}
  </Box>
);

/** One line of history: who, where, when on the left; signed amount on the right. */
const HistoryRow: React.FC<{
  title: string;
  lines: Array<string | null | false | undefined>;
  amount: number;
  sign: 1 | -1;
  tone: "success" | "error" | "neutral";
}> = ({ title, lines, amount, sign, tone }) => (
  <Stack
    direction="row"
    justifyContent="space-between"
    gap={1.5}
    sx={(t) => ({ py: 1.25, borderTop: `1px solid ${subtleBorder(t)}`, "&:first-of-type": { borderTop: 0 } })}
  >
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="body2" fontWeight={600}>
        {title}
      </Typography>
      {lines.filter(Boolean).map((line, index) => (
        <Typography key={index} variant="caption" color="text.secondary" display="block">
          {line}
        </Typography>
      ))}
    </Box>
    <Typography
      variant="body2"
      fontWeight={700}
      sx={{
        whiteSpace: "nowrap",
        fontVariantNumeric: "tabular-nums",
        color: tone === "success" ? "success.main" : tone === "error" ? "error.main" : "text.primary",
      }}
    >
      {sign < 0 ? "− " : "+ "}
      <PosAmount value={amount} />
    </Typography>
  </Stack>
);

const paymentRow = (payment: GiftCertificateMoneyRow) => {
  const refund = payment.operation === "refund";
  const method = METHOD_LABELS[payment.method] ?? payment.method;
  return (
    <HistoryRow
      key={`payment-${payment.id}`}
      title={refund ? "Возврат денег при аннулировании" : "Оплата продажи"}
      lines={[
        [method, payment.cashlessMethodName].filter(Boolean).join(" · "),
        [payment.branchName, payment.createdByName].filter(Boolean).join(" · "),
        `${dateTime(payment.createdAt)}${payment.cashboxShiftId ? ` · смена #${payment.cashboxShiftId}` : ""}`,
      ]}
      amount={Number(payment.amount)}
      sign={refund ? -1 : 1}
      tone={refund ? "error" : "success"}
    />
  );
};

const redemptionRow = (use: GiftCertificateUseRow) => {
  const restore = use.operation === "restore";
  const receipt = use.receiptNumber ? `чек №${use.receiptNumber.slice(0, 8)}` : use.receiptId ? `чек #${use.receiptId}` : null;
  return (
    <HistoryRow
      key={`use-${use.id}`}
      title={restore ? "Возврат товара — деньги вернулись на сертификат" : "Покупка товара"}
      lines={[
        [use.branchName || "Без филиала", receipt, restore && use.returnId ? `возврат #${use.returnId}` : null]
          .filter(Boolean)
          .join(" · "),
        [use.clientName ? `Клиент: ${use.clientName}` : null, use.createdByName ? `Кассир: ${use.createdByName}` : null]
          .filter(Boolean)
          .join(" · "),
        `${dateTime(use.createdAt)} · остаток после: ${Number(use.balanceAfter).toLocaleString("ru-RU")} с`,
      ]}
      amount={Number(use.amount)}
      sign={restore ? 1 : -1}
      tone="neutral"
    />
  );
};

export interface CertificateDetailDrawerProps {
  open: boolean;
  certificate: GiftCertificateDetail | null;
  loading: boolean;
  error: unknown;
  canVoid: boolean;
  onVoid: (certificate: GiftCertificateDetail) => void;
  /** Отказ аннулирования (например, сертификатом уже платили). */
  actionError?: string | null;
  onDismissError?: () => void;
  onClose: () => void;
}

/**
 * Карточка сертификата: остаток, кто купил и кому, вся история денег —
 * оплата продажи и возврат при аннулировании, покупки и возвраты товара в
 * любом филиале. История видна целиком, даже если сертификат тратили в
 * филиале, которого у сотрудника нет: остаток — одна цифра на организацию.
 */
export const CertificateDetailDrawer: React.FC<CertificateDetailDrawerProps> = ({
  open,
  certificate,
  loading,
  error,
  canVoid,
  onVoid,
  actionError = null,
  onDismissError,
  onClose,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  useSheetBackClose(open, onClose, isMobile);
  const status = certificate ? certificateStatusMeta(certificate.status) : null;

  // Покупки и возвраты товара — от новых к старым, как в любой истории.
  const uses = React.useMemo(
    () => [...(certificate?.uses ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [certificate],
  );
  const payments = React.useMemo(
    () => [...(certificate?.payments ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [certificate],
  );

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: { width: { xs: "100%", md: 520 }, maxWidth: "100vw", display: "flex", flexDirection: "column" },
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1.5 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: -0.2, lineHeight: 1.25 }} noWrap>
            Сертификат {certificate ? `№${certificate.code}` : ""}
          </Typography>
          {certificate && (
            <Typography variant="body2" color="text.secondary" noWrap>
              {certificate.soldAt ? `Продан ${dateTime(certificate.soldAt)}` : `Выпущен ${dateTime(certificate.createdAt)}`}
            </Typography>
          )}
        </Box>
        <IconButton size="small" onClick={onClose} aria-label="Закрыть">
          <CloseOutlined fontSize="small" />
        </IconButton>
      </Stack>
      <Divider />
      {loading && <LinearProgress />}

      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 2, py: 2 }}>
        {actionError && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={onDismissError}>
            {actionError}
          </Alert>
        )}
        {error ? (
          <Alert severity="error">{getErrorMessage(error, "Не удалось загрузить сертификат.")}</Alert>
        ) : certificate && status ? (
          <Stack gap={2.5}>
            {/* ── Остаток ── */}
            <Box sx={{ p: 2, borderRadius: "14px", border: 1, borderColor: "divider", bgcolor: subtleBg(theme) }}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Остаток
                  </Typography>
                  <Typography
                    sx={{ fontSize: "1.75rem", fontWeight: 800, lineHeight: 1.15, letterSpacing: -0.5, fontVariantNumeric: "tabular-nums" }}
                  >
                    <PosAmount value={Number(certificate.balance)} />
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    из <PosAmount value={Number(certificate.nominal)} /> · {certificateExpiryLabel(certificate.expiresAt)}
                  </Typography>
                </Box>
                <TonedChip label={status.label} toneName={status.tone} />
              </Stack>
            </Box>

            {certificate.status === "void" && (
              <Alert severity="error" variant="outlined">
                Аннулирован {dateTime(certificate.voidedAt)}
                {certificate.voidedByName ? ` · ${certificate.voidedByName}` : ""}
                {certificate.voidReason ? `. Причина: ${certificate.voidReason}` : ""}
              </Alert>
            )}

            {/* ── Кто и кому ── */}
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1.5 }}>
              <Field
                label="Продан"
                value={certificate.soldBranchName || "Выпущен без продажи"}
                hint={certificate.soldByName ? `Кассир: ${certificate.soldByName}` : undefined}
              />
              <Field
                label="Получено за карту"
                value={<PosAmount value={Number(certificate.paidAmount)} />}
                hint={`Потрачено: ${Number(certificate.spentAmount).toLocaleString("ru-RU")} с`}
              />
              <Field
                label="Покупатель"
                value={certificate.buyerName || "Не указан"}
                hint={certificate.buyerPhone || undefined}
              />
              <Field
                label="Получатель"
                value={certificate.recipientName || "Не указан"}
                hint={certificate.recipientPhone || undefined}
              />
            </Box>
            {certificate.comment && <Field label="Комментарий" value={certificate.comment} />}

            {/* ── Деньги за карту ── */}
            <Box>
              <SectionTitle>Оплата сертификата</SectionTitle>
              {payments.length ? (
                <Box>{payments.map(paymentRow)}</Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Денег за карту не принимали — сертификат выпущен бесплатно.
                </Typography>
              )}
            </Box>

            {/* ── Покупки сертификатом ── */}
            <Box>
              <SectionTitle>Погашения</SectionTitle>
              {uses.length ? (
                <Box>{uses.map(redemptionRow)}</Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Сертификатом ещё не платили.
                </Typography>
              )}
            </Box>

            {canVoid && certificate.canVoid && (
              <Box>
                <AppButton
                  color="error"
                  variant="outlined"
                  startIcon={<BlockOutlined />}
                  onClick={() => onVoid(certificate)}
                  fullWidth={isMobile}
                >
                  Аннулировать
                </AppButton>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.75 }}>
                  Для ошибки кассира: деньги за карту вернутся из кассы филиала продажи. Сертификатом, которым уже
                  платили, аннулировать нельзя.
                </Typography>
              </Box>
            )}
          </Stack>
        ) : null}
      </Box>
    </Drawer>
  );
};
