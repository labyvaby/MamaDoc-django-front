/**
 * Печатные формы приёма анализов.
 *
 * Три формы, все по кнопкам — ничего не открывается автоматически. Следствие
 * этого решения: метку можно забыть напечатать, и пробирка уедет
 * неподписанной. Страховка обсуждается отдельно, здесь её нет.
 *
 * Штрихкод и регистрационный лист приходят готовыми картинками из ЛИС
 * (base64). Свой `barcode128Svg` для этикеток не годится: лабораторный
 * сканер узнаёт только код ЛИС.
 *
 * Сборка HTML отделена от печати, чтобы её можно было проверить тестом:
 * рендер-тестов в проекте нет, и вся логика живёт в чистых функциях.
 */

const PRINT_DELAY_MS = 250;
const PRINT_WINDOW_WIDTH = 420;

export interface LabelData {
  patientName: string;
  birthDate: string;
  orderCode: number | null;
  barcodeBase64: string;
}

export interface TicketData extends LabelData {
  ticketBase64: string;
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

const esc = (value: string): string =>
  value.replace(/[&<>"]/g, (char) => ESCAPES[char] ?? char);

const image = (base64: string, alt: string): string =>
  base64
    ? `<img src="data:image/png;base64,${base64}" alt="${esc(alt)}" />`
    : "";

const page = (title: string, body: string): string => `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 8mm; color: #000; }
  .head { font-size: 13px; line-height: 1.4; }
  .name { font-weight: 600; font-size: 15px; }
  img { max-width: 100%; }
  .block { margin-bottom: 6mm; page-break-inside: avoid; }
  h2 { font-size: 14px; margin: 0 0 2mm; }
</style></head><body>${body}</body></html>`;

const header = (data: LabelData): string => `
  <div class="head">
    <div class="name">${esc(data.patientName)}</div>
    <div>Дата рождения: ${esc(data.birthDate)}</div>
    <div>Заказ: ${data.orderCode ?? "—"}</div>
  </div>`;

export function buildLabelsHtml(data: LabelData): string {
  return page(
    "Этикетки",
    `<div class="block">${header(data)}${image(data.barcodeBase64, "Штрихкод")}</div>`,
  );
}

export function buildTicketHtml(data: TicketData): string {
  return page(
    "Регистрационный лист",
    `<div class="block">${image(data.ticketBase64, "Регистрационный лист")}</div>`,
  );
}

export function buildPreparationHtml(
  data: LabelData,
  texts: string[],
): string {
  const body = texts.length
    ? texts.map((text) => `<div class="block">${esc(text)}</div>`).join("")
    : '<div class="block">Особой подготовки не требуется.</div>';
  return page(
    "Подготовка к анализам",
    `${header(data)}<h2>Как подготовиться</h2>${body}`,
  );
}

/**
 * Открыть окно печати с готовым HTML.
 *
 * Возвращает false, если браузер заблокировал попап — вызывающий код обязан
 * показать подсказку, а не промолчать: регистратор иначе решит, что печать
 * прошла, и отправит пробирку без метки.
 */
export function printHtml(html: string, width = PRINT_WINDOW_WIDTH): boolean {
  const win = window.open("", "_blank", `width=${width},height=760`);
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  window.setTimeout(() => win.print(), PRINT_DELAY_MS);
  return true;
}
