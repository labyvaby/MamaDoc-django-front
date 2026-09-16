import React from "react";
import Box from "@mui/material/Box";
import dayjs from "dayjs";

import type { PosSavedReceipt } from "../../api/pos";
import { formatPosAmount } from "./format";
import { clientLabel, paymentMethodLabel, receiptDateFull, receiptNumber } from "./historyMeta";

type Props = {
  receipt: PosSavedReceipt | null;
  organization?: string;
  branch?: string;
};

/**
 * Печатная форма товарного чека (80 мм) для повторной печати из истории.
 *
 * На экране не видна: при печати страница прячет всё, кроме `#pos-print`, —
 * тот же приём, что у кассы (`LivePosPage`), чтобы дубликат из истории
 * совпадал с тем, что покупатель получил у кассы. Помечен как дубликат,
 * иначе две одинаковые бумажки на возврате не отличить.
 */
export const ReceiptPrintForm: React.FC<Props> = ({ receipt, organization, branch }) => {
  if (!receipt) return null;
  const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 8 };
  const muted: React.CSSProperties = { color: "#555", fontSize: 10 };
  return (
    <>
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #pos-print, #pos-print * { visibility: visible !important; }
        #pos-print { display: block !important; position: fixed; left: 0; top: 0; width: 80mm; background: #fff; color: #000; padding: 8mm; font: 12px/1.35 "Segoe UI", Arial, sans-serif; }
      }`}</style>
      <Box id="pos-print" sx={{ display: "none" }}>
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          {organization && <div style={{ fontWeight: 800, letterSpacing: ".12em" }}>{organization.toUpperCase()}</div>}
          {branch && <div style={muted}>{branch}</div>}
          <div style={muted}>Товарный чек · не фискальный · дубликат</div>
        </div>
        <div style={row}>
          <span>ЧЕК №{receiptNumber(receipt)}</span>
          <span>{receiptDateFull(receipt.createdAt)}</span>
        </div>
        <div style={{ ...row, ...muted, marginBottom: 6 }}>
          <span>{clientLabel(receipt)}</span>
          {receipt.sellerName && <span>Продавец: {receipt.sellerName}</span>}
        </div>
        <div style={{ borderTop: "1px dashed #999", borderBottom: "1px dashed #999", padding: "6px 0" }}>
          {receipt.lines.map((line) => (
            <div key={line.id} style={{ ...row, padding: "3px 0" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{line.productName}</div>
                <div style={muted}>
                  {formatPosAmount(Number(line.quantity))} × {formatPosAmount(Number(line.unitPrice))} с
                </div>
              </div>
              <div style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{formatPosAmount(Number(line.total))} с</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8 }}>
          <div style={row}><span>Подытог</span><span>{formatPosAmount(Number(receipt.subtotal))} с</span></div>
          {Number(receipt.discountTotal) > 0 && (
            <div style={row}><span>Скидка</span><span>− {formatPosAmount(Number(receipt.discountTotal))} с</span></div>
          )}
          <div style={{ ...row, fontWeight: 800, fontSize: 14, marginTop: 4 }}>
            <span>ИТОГО</span><span>{formatPosAmount(Number(receipt.totalAmount))} с</span>
          </div>
        </div>
        {receipt.payments.length > 0 && (
          <div style={{ marginTop: 8, borderTop: "1px dashed #999", paddingTop: 6 }}>
            {receipt.payments.map((payment) => (
              <div key={payment.id} style={row}>
                <span>{paymentMethodLabel(payment.method)}</span>
                <span>{formatPosAmount(Number(payment.amount))} с</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ ...muted, textAlign: "center", marginTop: 12 }}>
          Напечатано {dayjs().locale("ru").format("D MMMM YYYY, HH:mm")}
        </div>
      </Box>
    </>
  );
};

export default ReceiptPrintForm;
