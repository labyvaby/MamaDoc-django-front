/**
 * Регистрационный лист приёма анализов — своя печатная форма.
 *
 * ЛИС под `ticket` отдаёт не картинку, а сериализованный Java-объект
 * `JasperPrint` (`lab-intake-live-findings.md`, находка 17): отрисовать его
 * без JasperReports нельзя. Поэтому лист собирается здесь из данных
 * заказа, которые у нас и так есть: пациент, состав с ценами, расходники,
 * итоги, номер регистрации в ЛИС и её штрихкод (тот приходит настоящим
 * PNG). Форма повторяет лист самой ЛИС по составу строк, чтобы пациенту и
 * лаборатории не пришлось привыкать к двум разным бумажкам.
 *
 * Чистая сборка HTML без окна печати — как `labLabels.ts`, проверяется
 * тестами. Открытие окна — `printHtml` там же.
 */

import { formatDateRu, formatKGS } from "./format";
import type { LabOrderDetail, LabTest } from "../api/lab";
import type { PatientGender } from "../api/patients";

export interface RegistrationSheetData {
  /** Название клиники — в шапке листа, вместо логотипа лаборатории. */
  clinicName: string;
  branchName: string;
  patientName: string;
  /** ISO-дата из карты пациента; печатается как дд.мм.гггг. */
  birthDate: string | null;
  gender: PatientGender;
  /** Момент приёма (`LabOrderDetail.createdAt`). */
  registeredAt: string;
  /** Рег. № в ЛИС — тот, что на этикетках и в её листе; null у неотправленного заказа. */
  regCode: number | null;
  referringDoctorName: string;
  lines: LabOrderDetail["lines"];
  instruments: LabOrderDetail["instruments"];
  discountPercent: number;
  totalAmount: number;
  paidAmount: number;
  /**
   * Самый долгий срок готовности среди анализов (дней); null — каталог не
   * дал ни одного срока. Дата результата считается от момента приёма.
   */
  maxRequiredDays: number | null;
  /** PNG штрихкода от ЛИС в base64; пусто — без штрихкода (заказ не отправлен). */
  barcodeBase64: string;
}

/**
 * Собрать данные листа из карточки заказа и справочников.
 *
 * Срок готовности заказ не хранит — берётся из каталога по id анализа,
 * самый долгий из строк; анализа нет в каталоге (снят после приёма) —
 * строка просто не участвует. Без единого срока дата результата не
 * печатается вовсе: лучше пусто, чем выдуманная дата.
 */
export function registrationSheetFromOrder(input: {
  order: LabOrderDetail;
  clinicName: string;
  patient: { birthDate: string | null; gender: PatientGender } | null;
  tests: LabTest[];
  barcodeBase64: string;
}): RegistrationSheetData {
  const { order } = input;
  const requiredById = new Map(input.tests.map((test) => [test.id, test.requiredDay]));
  const days = order.lines
    .map((line) => requiredById.get(line.testId))
    .filter((value): value is number => value != null);
  return {
    clinicName: input.clinicName,
    branchName: order.branchName,
    patientName: order.patientName,
    birthDate: input.patient?.birthDate ?? null,
    gender: input.patient?.gender ?? "unknown",
    registeredAt: order.createdAt,
    regCode: order.lisOrderCode,
    referringDoctorName: order.referringDoctorName,
    lines: order.lines,
    instruments: order.instruments,
    discountPercent: order.discountPercent,
    totalAmount: order.totalAmount,
    paidAmount: order.paidCash + order.paidCard,
    maxRequiredDays: days.length > 0 ? Math.max(...days) : null,
    barcodeBase64: input.barcodeBase64,
  };
}

const GENDER_LABEL: Record<PatientGender, string> = {
  male: "Муж.",
  female: "Жен.",
  unknown: "—",
};

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

const esc = (value: string): string =>
  value.replace(/[&<>"]/g, (char) => ESCAPES[char] ?? char);

const money = (value: string | number): number => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

function formatDateTimeRu(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return `${formatDateRu(iso)} ${time}`;
}

function addDays(iso: string, days: number): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export interface RegistrationSheetTotals {
  /** Анализы до скидки. */
  testsGross: number;
  discount: number;
  /** Расходники по ценам каталога. */
  instrumentsTotal: number;
  /**
   * Вошли ли расходники в сумму заказа. Организация может их не брать
   * (`OrganizationLabConfig.charge_instruments`) — тогда в итог они не
   * попали, и печатать по ним цену значило бы просить с пациента то, чего
   * с него не взяли. Сам флаг заказ не отдаёт — выводится из сумм.
   */
  instrumentsCharged: boolean;
  total: number;
  paid: number;
  debt: number;
}

/**
 * Разложить итог заказа на строки листа. `totalAmount` — истина с бэкенда,
 * остальное восстанавливается из строк тем же счётом, что в
 * `basket.quote_basket` (скидка — от анализов, округление до тыйына).
 */
export function registrationSheetTotals(data: RegistrationSheetData): RegistrationSheetTotals {
  const testsGross = round2(
    data.lines.reduce((sum, line) => sum + money(line.price) * line.countItem, 0),
  );
  const discount = round2((testsGross * data.discountPercent) / 100);
  const instrumentsTotal = round2(
    data.instruments.reduce((sum, item) => sum + money(item.price) * item.count, 0),
  );
  const total = round2(data.totalAmount);
  const instrumentsCharged =
    instrumentsTotal > 0 && Math.abs(total - (testsGross - discount + instrumentsTotal)) < 0.005;
  const paid = round2(data.paidAmount);
  return {
    testsGross,
    discount,
    instrumentsTotal,
    instrumentsCharged,
    total,
    paid,
    debt: Math.max(0, round2(total - paid)),
  };
}

const STYLE = `
  @page { size: A4; margin: 12mm; }
  body { font-family: system-ui, "Segoe UI", Arial, sans-serif; color: #000; margin: 0; font-size: 12px; line-height: 1.35; }
  .sheet { max-width: 170mm; margin: 0 auto; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8mm; border-bottom: 2px solid #000; padding-bottom: 3mm; margin-bottom: 4mm; }
  .clinic { font-size: 16px; font-weight: 700; }
  .branch { color: #333; }
  .doc { text-align: right; }
  .doc .title { font-size: 15px; font-weight: 700; }
  .doc .reg { font-size: 13px; margin-top: 1mm; }
  .patient { display: grid; grid-template-columns: 34mm 1fr; row-gap: 1mm; column-gap: 3mm; margin-bottom: 4mm; }
  .patient .k { color: #444; }
  .patient .v { font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4mm; }
  th, td { border: 1px solid #000; padding: 1.2mm 2mm; vertical-align: top; }
  th { text-align: left; font-weight: 600; background: #f2f2f2; }
  td.n { width: 6mm; text-align: right; color: #444; }
  td.q, th.q { width: 12mm; text-align: center; }
  td.s, th.s { width: 26mm; text-align: right; white-space: nowrap; }
  tr.sub td { color: #333; }
  tr.total td { font-weight: 700; }
  .tag { display: inline-block; border: 1px solid #000; border-radius: 2px; padding: 0 1mm; font-size: 10px; margin-left: 1.5mm; vertical-align: middle; }
  .bottom { display: flex; justify-content: space-between; align-items: flex-end; gap: 8mm; margin-top: 2mm; }
  .notes { color: #333; }
  .notes div { margin-bottom: 1mm; }
  .barcode { text-align: center; }
  .barcode img { max-width: 60mm; display: block; margin: 0 auto 1mm; }
  .barcode .code { font-size: 13px; font-weight: 700; letter-spacing: 0.5px; }
  .pending { border: 1px dashed #000; padding: 2mm 3mm; font-size: 11px; max-width: 60mm; }
  .foot { margin-top: 5mm; padding-top: 2mm; border-top: 1px solid #000; font-size: 11px; color: #333; display: flex; justify-content: space-between; }
`;

const lineTags = (line: LabOrderDetail["lines"][number]): string =>
  [line.isExpress ? "экспресс" : "", line.isBroughtIn ? "приносной" : ""]
    .filter(Boolean)
    .map((tag) => `<span class="tag">${tag}</span>`)
    .join("");

export function buildRegistrationSheetHtml(data: RegistrationSheetData): string {
  const totals = registrationSheetTotals(data);
  const resultAt =
    data.maxRequiredDays == null ? null : addDays(data.registeredAt, data.maxRequiredDays);

  const lineRows = data.lines
    .map(
      (line, index) => `
      <tr>
        <td class="n">${index + 1}</td>
        <td>${esc(line.titleSnapshot)}${lineTags(line)}</td>
        <td class="q">${line.countItem}</td>
        <td class="s">${esc(formatKGS(money(line.price) * line.countItem))}</td>
      </tr>`,
    )
    .join("");

  const instrumentRows = data.instruments
    .map(
      (item) => `
      <tr class="sub">
        <td class="n"></td>
        <td>${esc(item.titleSnapshot)}</td>
        <td class="q">${item.count}</td>
        <td class="s">${totals.instrumentsCharged ? esc(formatKGS(money(item.price) * item.count)) : "—"}</td>
      </tr>`,
    )
    .join("");

  const summaryRow = (label: string, value: string, cls = ""): string =>
    `<tr class="${cls}"><td class="n"></td><td colspan="2">${label}</td><td class="s">${esc(value)}</td></tr>`;

  const summaryRows = [
    totals.discount > 0
      ? summaryRow(`Скидка ${data.discountPercent}%`, `− ${formatKGS(totals.discount)}`)
      : "",
    summaryRow("Сумма итого", formatKGS(totals.total), "total"),
    summaryRow("Оплачено", formatKGS(totals.paid)),
    totals.debt > 0 ? summaryRow("Долг", formatKGS(totals.debt)) : "",
  ].join("");

  const barcode = data.barcodeBase64
    ? `<div class="barcode">
        <img src="data:image/png;base64,${data.barcodeBase64}" alt="Штрихкод" />
        ${data.regCode != null ? `<div class="code">№ ${data.regCode}</div>` : ""}
      </div>`
    : `<div class="pending">Заказ ещё не передан в лабораторию — номер регистрации и штрихкод появятся после отправки.</div>`;

  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Регистрационный лист</title>
<style>${STYLE}</style></head><body><div class="sheet">
  <div class="top">
    <div>
      <div class="clinic">${esc(data.clinicName)}</div>
      <div class="branch">${esc(data.branchName)}</div>
    </div>
    <div class="doc">
      <div class="title">Регистрационный лист</div>
      <div class="reg">${data.regCode != null ? `рег. № <b>${data.regCode}</b>` : "рег. № —"}</div>
    </div>
  </div>

  <div class="patient">
    <div class="k">ФИО</div><div class="v">${esc(data.patientName)}</div>
    <div class="k">Дата рождения</div><div class="v">${esc(formatDateRu(data.birthDate) || "—")}</div>
    <div class="k">Пол</div><div class="v">${GENDER_LABEL[data.gender]}</div>
    <div class="k">Дата регистрации</div><div class="v">${esc(formatDateTimeRu(data.registeredAt))}</div>
    ${data.referringDoctorName ? `<div class="k">Направил</div><div class="v">${esc(data.referringDoctorName)}</div>` : ""}
  </div>

  <table>
    <thead><tr><th></th><th>Исследование</th><th class="q">Кол-во</th><th class="s">Цена</th></tr></thead>
    <tbody>${lineRows}${instrumentRows}${summaryRows}</tbody>
  </table>

  <div class="bottom">
    <div class="notes">
      ${resultAt ? `<div>Дата результата: <b>${esc(formatDateRu(resultAt))}</b></div>` : ""}
      <div>Результаты выдаёт лаборатория ExpressLab — проверка на сайте www.expresslab.kg.</div>
    </div>
    ${barcode}
  </div>

  <div class="foot">
    <span>${data.regCode != null ? `№${data.regCode} · ` : ""}${esc(data.patientName)} · ${esc(formatDateRu(data.birthDate) || "—")} · ${GENDER_LABEL[data.gender]}</span>
    <span>${esc(formatDateRu(data.registeredAt))}</span>
  </div>
</div></body></html>`;
}
