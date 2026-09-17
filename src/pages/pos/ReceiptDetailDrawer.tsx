import React from "react";
import { Box, Divider, Drawer, IconButton, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";

import CloseOutlined from "@mui/icons-material/CloseOutlined";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import BadgeOutlined from "@mui/icons-material/BadgeOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import PrintOutlined from "@mui/icons-material/PrintOutlined";
import KeyboardReturnOutlined from "@mui/icons-material/KeyboardReturnOutlined";
import ChatBubbleOutlineOutlined from "@mui/icons-material/ChatBubbleOutlineOutlined";

import type { PosSavedReceipt } from "../../api/pos";
import { AppButton, InfoTile, TonedChip } from "../../components/ui";
import { useSheetBackClose } from "../../hooks/useSheetBackClose";
import { subtleBg, subtleBorder } from "../../theme/uiHelpers";
import { formatQuantity } from "../../utility/format";
import {
  auditActionLabel,
  clientLabel,
  paymentMethodLabel,
  paymentsSummary,
  receiptDateFull,
  receiptDateLabel,
  receiptNumber,
  receiptStatusMeta,
  unitsCount,
} from "./historyMeta";
import { PosAmount } from "./ui";

export interface ReceiptDetailDrawerProps {
  receipt: PosSavedReceipt | null;
  open: boolean;
  onClose: () => void;
  /** Справочник безнала: у платежа «Карта» показываем, каким терминалом. */
  cashlessMethods?: Array<{ id: number; name: string }>;
  canPrint?: boolean;
  canReturn?: boolean;
  onPrint?: (receipt: PosSavedReceipt) => void;
  onReturn?: (receipt: PosSavedReceipt) => void;
}

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography
    variant="overline"
    sx={{ display: "block", color: "text.secondary", fontWeight: 600, letterSpacing: ".08em", lineHeight: 1.4, mb: 1 }}
  >
    {children}
  </Typography>
);

/**
 * Карточка чека из истории: итог, кто и чем платил, состав, журнал действий.
 * На десктопе — правый дровер, на телефоне — во весь экран, а аппаратный
 * «назад» закрывает карточку, а не уводит со страницы.
 */
export const ReceiptDetailDrawer: React.FC<ReceiptDetailDrawerProps> = ({
  receipt,
  open,
  onClose,
  cashlessMethods = [],
  canPrint = false,
  canReturn = false,
  onPrint,
  onReturn,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  useSheetBackClose(open, onClose, isMobile);

  const status = receipt ? receiptStatusMeta(receipt.status) : null;
  const discount = receipt ? Number(receipt.discountTotal) : 0;
  const audit = React.useMemo(
    () => [...(receipt?.audit ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [receipt],
  );
  const methodName = (id?: number | null) => cashlessMethods.find((method) => method.id === id)?.name;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: { width: { xs: "100%", md: 480 }, maxWidth: "100vw", display: "flex", flexDirection: "column" },
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1.5 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: -0.2, lineHeight: 1.25 }}>
            Чек №{receipt ? receiptNumber(receipt) : ""}
          </Typography>
          {receipt && (
            <Typography variant="body2" color="text.secondary" noWrap>
              {receiptDateFull(receipt.createdAt)}
            </Typography>
          )}
        </Box>
        <IconButton size="small" onClick={onClose} aria-label="Закрыть">
          <CloseOutlined fontSize="small" />
        </IconButton>
      </Stack>
      <Divider />

      {receipt && status && (
        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 2, py: 2 }}>
          {/* ── Итог ── */}
          <Box
            sx={{
              p: 2,
              borderRadius: "14px",
              border: 1,
              borderColor: "divider",
              bgcolor: subtleBg(theme),
            }}
          >
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
              <Box>
                <Typography variant="caption" color="text.secondary" display="block">
                  Итого по чеку
                </Typography>
                <Typography
                  sx={{ fontSize: "1.75rem", fontWeight: 800, lineHeight: 1.15, letterSpacing: -0.5, fontVariantNumeric: "tabular-nums" }}
                >
                  <PosAmount value={Number(receipt.totalAmount)} />
                </Typography>
                {discount > 0 && (
                  <Typography variant="caption" color="text.secondary">
                    со скидкой <PosAmount value={discount} /> от <PosAmount value={Number(receipt.subtotal)} />
                  </Typography>
                )}
              </Box>
              <TonedChip label={status.label} toneName={status.tone} />
            </Stack>
          </Box>

          {/* ── Кто, кому, чем ── */}
          {/* На телефоне — в столбик: в двух колонках имена клиента и продавца обрезаются. */}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" }, gap: 1, mt: 1.5 }}>
            <InfoTile icon={<PersonOutlineOutlined />} label="Клиент" value={clientLabel(receipt)} active={receipt.clientId != null} />
            <InfoTile icon={<BadgeOutlined />} label="Продавец" value={receipt.sellerName ?? undefined} active={Boolean(receipt.sellerName)} />
            <InfoTile icon={<PaymentsOutlined />} label="Оплата" value={paymentsSummary(receipt.payments)} active={receipt.payments.length > 0} />
            <InfoTile
              icon={<Inventory2Outlined />}
              label="Позиций"
              value={`${receipt.lines.length} · ${formatQuantity(unitsCount(receipt.lines))} шт.`}
            />
          </Box>

          {/* ── Действия ── */}
          {(canPrint || (canReturn && receipt.status === "completed")) && (
            <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 2, "& .MuiButton-root": { whiteSpace: "nowrap" } }}>
              {canPrint && (
                <AppButton
                  variant="outlined"
                  startIcon={<PrintOutlined fontSize="small" />}
                  onClick={() => onPrint?.(receipt)}
                  sx={{ flex: 1, minWidth: 140 }}
                >
                  Печать чека
                </AppButton>
              )}
              {canReturn && receipt.status === "completed" && (
                <AppButton
                  variant="outlined"
                  color="error"
                  startIcon={<KeyboardReturnOutlined fontSize="small" />}
                  onClick={() => onReturn?.(receipt)}
                  sx={{ flex: 1, minWidth: 140 }}
                >
                  Оформить возврат
                </AppButton>
              )}
            </Stack>
          )}

          {receipt.comment && (
            <Stack direction="row" gap={1} alignItems="flex-start" sx={{ mt: 2, p: 1.5, borderRadius: "10px", bgcolor: subtleBg(theme, true) }}>
              <ChatBubbleOutlineOutlined sx={{ fontSize: 18, color: "text.secondary", mt: "1px" }} />
              <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {receipt.comment}
              </Typography>
            </Stack>
          )}

          {/* ── Состав ── */}
          <Box sx={{ mt: 3 }}>
            <SectionTitle>Состав</SectionTitle>
            <Box sx={{ borderRadius: "12px", border: 1, borderColor: "divider", overflow: "hidden" }}>
              {receipt.lines.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ p: 1.5, textAlign: "center" }}>
                  В чеке нет товаров
                </Typography>
              )}
              {receipt.lines.map((line, index) => {
                const lineDiscount = Number(line.discountAmount ?? 0);
                return (
                  <Stack
                    key={line.id}
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    gap={1.5}
                    sx={{ px: 1.5, py: 1.25, borderTop: index === 0 ? "none" : `1px solid ${subtleBorder(theme)}` }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600} sx={{ wordBreak: "break-word" }}>
                        {line.productName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatQuantity(line.quantity)} шт. × <PosAmount value={Number(line.unitPrice)} />
                        {lineDiscount > 0 && (
                          <>
                            {" · скидка "}
                            <PosAmount value={lineDiscount} />
                          </>
                        )}
                      </Typography>
                    </Box>
                    <Typography variant="body2" fontWeight={700} sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                      <PosAmount value={Number(line.total)} />
                    </Typography>
                  </Stack>
                );
              })}
              <Stack gap={0.5} sx={{ px: 1.5, py: 1.25, bgcolor: subtleBg(theme), borderTop: 1, borderColor: "divider" }}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">Подытог</Typography>
                  <Typography variant="body2"><PosAmount value={Number(receipt.subtotal)} /></Typography>
                </Stack>
                {discount > 0 && (
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">Скидка</Typography>
                    <Typography variant="body2" sx={{ color: "warning.onSurface" }}>
                      <PosAmount value={discount} negative />
                    </Typography>
                  </Stack>
                )}
                <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                  <Typography variant="body2" fontWeight={700}>Итого</Typography>
                  <Typography fontWeight={800} sx={{ fontSize: "1.05rem" }}>
                    <PosAmount value={Number(receipt.totalAmount)} />
                  </Typography>
                </Stack>
              </Stack>
            </Box>
          </Box>

          {/* ── Оплата ── */}
          <Box sx={{ mt: 3 }}>
            <SectionTitle>Оплата</SectionTitle>
            {receipt.payments.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {receipt.status === "held" ? "Чек отложен — оплата ещё не принята." : "Оплаты по чеку нет."}
              </Typography>
            ) : (
              <Stack gap={0.75}>
                {receipt.payments.map((payment) => {
                  const terminal = methodName(payment.cashlessMethodId);
                  return (
                    <Stack
                      key={payment.id}
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                      gap={1.5}
                      sx={{ px: 1.5, py: 1, borderRadius: "10px", border: 1, borderColor: "divider" }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600}>
                          {paymentMethodLabel(payment.method)}
                          {terminal && (
                            <Typography component="span" variant="body2" color="text.secondary">
                              {" · "}{terminal}
                            </Typography>
                          )}
                        </Typography>
                        {payment.reference && (
                          <Typography variant="caption" color="text.secondary" noWrap display="block">
                            {payment.reference}
                          </Typography>
                        )}
                      </Box>
                      <Typography variant="body2" fontWeight={700} sx={{ whiteSpace: "nowrap" }}>
                        <PosAmount value={Number(payment.amount)} />
                      </Typography>
                    </Stack>
                  );
                })}
              </Stack>
            )}
          </Box>

          {/* ── Журнал ── */}
          {audit.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <SectionTitle>История чека</SectionTitle>
              <Stack>
                {audit.map((entry, index) => (
                  <Stack key={entry.id} direction="row" gap={1.25} alignItems="stretch">
                    <Stack alignItems="center" sx={{ width: 12, flexShrink: 0 }}>
                      <Box
                        sx={{
                          width: 10,
                          height: 10,
                          mt: "5px",
                          borderRadius: "50%",
                          flexShrink: 0,
                          bgcolor: alpha(theme.palette.primary.main, 0.85),
                        }}
                      />
                      {index < audit.length - 1 && <Box sx={{ width: "1px", flex: 1, bgcolor: "divider", my: 0.5 }} />}
                    </Stack>
                    <Box sx={{ pb: index < audit.length - 1 ? 1.5 : 0, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600}>
                        {auditActionLabel(entry.action)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {receiptDateLabel(entry.createdAt)}
                        {entry.userName ? ` · ${entry.userName}` : ""}
                      </Typography>
                      {entry.reason && (
                        <Typography variant="caption" sx={{ display: "block", mt: 0.25, wordBreak: "break-word" }}>
                          {entry.reason}
                        </Typography>
                      )}
                    </Box>
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}
        </Box>
      )}
    </Drawer>
  );
};

export default ReceiptDetailDrawer;
