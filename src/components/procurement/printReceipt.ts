import type { GoodsReceipt, SupplierPayment } from "../../api/procurement";
import { formatQuantity } from "../../utility/format";
import { RECEIPT_STATUS_META, formatLongDateTime, formatMoney, paymentMethodLabel, receiptChipStatus } from "./meta";

const escape = (value: string | null | undefined): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Печатная форма накладной: открывается в новом окне и сразу уходит на печать.
 * Без сторонних библиотек — простой HTML с таблицей позиций и оплатами; так же
 * работают печатные формы касс в проекте.
 */
export function printReceipt(receipt: GoodsReceipt, payments: SupplierPayment[]): void {
  const status = RECEIPT_STATUS_META[receiptChipStatus(receipt)].label;
  const rows = receipt.lines
    .map(
      (line, index) => `
        <tr>
          <td class="c">${index + 1}</td>
          <td>${escape(line.productName)}${line.lotNumber ? `<div class="muted">Партия ${escape(line.lotNumber)}</div>` : ""}</td>
          <td class="r">${escape(formatQuantity(line.quantity))} ${escape(line.productUnit || "шт")}</td>
          <td class="r">${escape(formatMoney(line.costAmount))}${line.costCurrency && line.costCurrency !== "KGS" ? ` ${escape(line.costCurrency)}` : ""}</td>
          <td class="r">${escape(formatMoney(line.lineTotal))}</td>
        </tr>`,
    )
    .join("");
  const paymentRows = payments
    .map(
      (payment) => `
        <tr>
          <td>${escape(formatLongDateTime(payment.paidAt))}</td>
          <td>${escape(paymentMethodLabel(payment.paymentMethod, payment.cashlessMethodName))}${payment.documentNumber ? ` · № ${escape(payment.documentNumber)}` : ""}</td>
          <td class="r">${escape(formatMoney(payment.amount))}</td>
        </tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8" /><title>Накладная ${escape(receipt.number)}</title>
<style>
  body { font-family: Inter, Arial, sans-serif; font-size: 12px; color: #111; margin: 24px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .muted { color: #666; font-size: 11px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin: 16px 0; }
  .grid div span { color: #666; display: block; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { border-bottom: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { font-size: 11px; color: #666; font-weight: 600; }
  .r { text-align: right; white-space: nowrap; } .c { text-align: center; }
  .totals { margin-top: 12px; text-align: right; }
  .totals div { margin: 2px 0; } .totals b { font-size: 14px; }
  h2 { font-size: 13px; margin: 20px 0 4px; }
  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 32px; }
  .sign div { border-top: 1px solid #999; padding-top: 4px; font-size: 11px; color: #666; }
  @media print { body { margin: 12mm; } }
</style></head><body>
  <h1>Накладная ${escape(receipt.number)} <span class="muted">· ${escape(status)}</span></h1>
  <div class="muted">Приход от поставщика · ${escape(formatLongDateTime(receipt.receivedAt))}</div>
  <div class="grid">
    <div><span>Поставщик</span>${escape(receipt.supplierName)}</div>
    <div><span>Склад</span>${escape(receipt.branchName ? `${receipt.warehouseName} · ${receipt.branchName}` : receipt.warehouseName)}</div>
    <div><span>Номер у поставщика</span>${escape(receipt.supplierNumber || "—")}</div>
    <div><span>Заказ поставщику</span>${escape(receipt.purchaseOrderNumber || "—")}</div>
    <div><span>Принял</span>${escape(receipt.createdByName || "—")}</div>
    <div><span>Срок оплаты</span>${receipt.dueAt ? escape(formatLongDateTime(receipt.dueAt).split(",")[0]) : "—"}</div>
  </div>
  <table>
    <thead><tr><th class="c">№</th><th>Товар</th><th class="r">Кол-во</th><th class="r">Цена</th><th class="r">Сумма, сом</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div>Итого по накладной: <b>${escape(formatMoney(receipt.totalCost))} сом</b></div>
    ${Number(receipt.returnedTotal) > 0 ? `<div>Возвращено поставщику: −${escape(formatMoney(receipt.returnedTotal))} сом</div>` : ""}
    <div>Оплачено: −${escape(formatMoney(receipt.paidTotal))} сом</div>
    <div>К оплате: <b>${escape(formatMoney(receipt.remainingTotal))} сом</b></div>
  </div>
  ${
    payments.length
      ? `<h2>Оплаты поставщику</h2><table><thead><tr><th>Дата</th><th>Способ</th><th class="r">Сумма, сом</th></tr></thead><tbody>${paymentRows}</tbody></table>`
      : ""
  }
  ${receipt.comment ? `<h2>Комментарий</h2><div>${escape(receipt.comment).replace(/\n/g, "<br />")}</div>` : ""}
  <div class="sign"><div>Принял (подпись)</div><div>Сдал (подпись)</div></div>
  <script>window.addEventListener("load", function () { window.print(); });</script>
</body></html>`;

  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}
