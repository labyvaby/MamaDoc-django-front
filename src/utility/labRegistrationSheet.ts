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

import { formatDateRu } from "./format";
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
  /** Ответы на вопросы ЛИС — на отрывных талонах, как печатает ЛИС. */
  answers: LabOrderDetail["answers"];
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
  /**
   * Печатать ли цены и итоги. Сотрудник без `finance.view` получает от
   * бэкенда суммы `null` — лист у него без колонки «Цена» и без итогов,
   * а не с нулями.
   */
  withPrices: boolean;
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
    answers: order.answers,
    discountPercent: order.discountPercent,
    totalAmount: order.totalAmount,
    paidAmount: order.paidCash + order.paidCard,
    maxRequiredDays: days.length > 0 ? Math.max(...days) : null,
    barcodeBase64: input.barcodeBase64,
    withPrices: order.financeVisible,
  };
}

/** Пол двумя языками, как на листе ЛИС («А.Ж.» — Аял / Жен.). */
const GENDER_LABEL: Record<PatientGender, string> = {
  male: "Э. / Муж.",
  female: "А. / Жен.",
  unknown: "—",
};
const GENDER_SHORT: Record<PatientGender, string> = { male: "М", female: "Ж", unknown: "—" };

/** Дата как на листе ЛИС: дд-мм-гггг. */
const formatDateDash = (iso: string | null): string => {
  const text = formatDateRu(iso);
  return text ? text.replace(/\./g, "-") : "";
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

/**
 * Скидка от суммы анализов — в тыйынах, как `basket.quote_basket`
 * (`Decimal`, ROUND_HALF_UP). Счёт во float даёт другой тыйын на ровной
 * половине: 1.45 × 10 % = 0.145 → 0.14 у float, 0.15 у бэкенда.
 */
const discountOf = (gross: number, percent: number): number =>
  Math.round((Math.round(gross * 100) * percent) / 100) / 100;

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
    data.lines.reduce((sum, line) => sum + money(line.price ?? "0") * line.countItem, 0),
  );
  const discount = discountOf(testsGross, data.discountPercent);
  const instrumentsTotal = round2(
    data.instruments.reduce((sum, item) => sum + money(item.price ?? "0") * item.count, 0),
  );
  const total = round2(data.totalAmount);
  // Какая из двух сумм ближе к итогу бэкенда — та и правда; строгое
  // равенство ломалось бы на любой тыйын расхождения в округлении.
  const withInstruments = testsGross - discount + instrumentsTotal;
  const withoutInstruments = testsGross - discount;
  const instrumentsCharged =
    instrumentsTotal > 0 &&
    Math.abs(total - withInstruments) < Math.abs(total - withoutInstruments);
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
  @page { size: A4; margin: 10mm 12mm; }
  body { font-family: Arial, "Segoe UI", system-ui, sans-serif; color: #000; margin: 0; font-size: 12px; line-height: 1.3; }
  .sheet { max-width: 150mm; margin: 0 auto; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 6mm; margin-bottom: 5mm; }
  .clinic { font-size: 17px; font-weight: 700; line-height: 1.15; }
  .clinic small { display: block; font-size: 11px; font-weight: 400; color: #333; margin-top: 1mm; }
  .lic { font-size: 9px; color: #333; text-align: right; white-space: pre-line; }
  .title { font-size: 15px; font-weight: 700; line-height: 1.2; margin-bottom: 3mm; }
  .intro { display: flex; justify-content: space-between; align-items: flex-start; gap: 6mm; }
  .fields { flex: 1; display: grid; grid-template-columns: 46mm 1fr; column-gap: 3mm; row-gap: 1.2mm; align-items: baseline; }
  .fields .k { font-size: 11px; line-height: 1.2; }
  .fields .v { font-weight: 700; }
  .fields .reg { font-size: 13px; }
  .code { text-align: center; width: 42mm; flex-shrink: 0; }
  .code img { max-width: 42mm; display: block; margin: 0 auto 1mm; }
  .code .hint { font-size: 9px; color: #333; }
  .pending { border: 1px dashed #000; padding: 2mm; font-size: 9.5px; text-align: left; }
  table { width: 100%; border-collapse: collapse; margin: 3mm 0 2.5mm; }
  th, td { border: 1.5px solid #000; padding: 1mm 2mm; vertical-align: middle; }
  th { text-align: center; font-weight: 400; padding: 3mm 2mm; }
  td.s, th.s { width: 24mm; text-align: center; white-space: nowrap; }
  .tag { display: inline-block; border: 1px solid #000; border-radius: 2px; padding: 0 1mm; font-size: 9px; margin-left: 1.5mm; vertical-align: middle; }
  .site { display: grid; grid-template-columns: 1fr auto; column-gap: 4mm; row-gap: 1.5mm; align-items: center; margin-top: 1mm; }
  .site .url { font-weight: 700; text-decoration: underline; }
  .site .box { border: 1.5px solid #000; padding: 1.5mm 6mm; font-size: 15px; font-weight: 700; text-align: center; letter-spacing: 0.5px; }
  .call { font-style: italic; margin-top: 1.5mm; }
  .stubs { margin-top: 7mm; }
  .stub { border-top: 2px solid #000; padding: 2mm 0 3mm; page-break-inside: avoid; }
  .stub .num { text-align: right; font-size: 12px; margin-top: -5.5mm; margin-bottom: 1mm; }
  .stub .row { display: flex; justify-content: space-between; align-items: flex-start; gap: 4mm; }
  .stub .row img { max-width: 36mm; max-height: 12mm; }
  .stub .date { margin: 3mm 0 2mm; display: flex; gap: 6mm; align-items: baseline; }
  .stub .date b { font-size: 12.5px; }
  .stub .who { margin-bottom: 1.5mm; }
  .stub .who span { margin-right: 4mm; }
  .stub ol { margin: 0; padding: 0; list-style: none; }
  .stub ol li { font-weight: 700; font-size: 13px; line-height: 1.45; }
  .stub .ans { font-style: italic; margin-top: 1mm; }
`;

const lineTags = (line: LabOrderDetail["lines"][number]): string =>
  [line.isExpress ? "экспресс" : "", line.isBroughtIn ? "приносной" : ""]
    .filter(Boolean)
    .map((tag) => `<span class="tag">${tag}</span>`)
    .join("");

/**
 * Регистрационный лист по образцу листа ЛИС ExpressLab: двуязычные
 * (кыргызча / русский) подписи, таблица «Исследование / цена» с итогами,
 * строка про результаты на сайте, и ниже — отрывные талоны, как их печатает
 * ЛИС: по одному на анализ (штрихкод, дата сдачи, филиал, номер, пациент,
 * анализ и ответы на вопросы) плюс сводный со всем заказом.
 *
 * Чего у нас нет и что на листе ЛИС есть: QR-код проверки результатов и
 * длинный «номер заказа» для сайта (API их не отдаёт) — вместо QR стоит
 * штрихкод заказа, в рамке — рег. №; и штрихкоды на каждую пробирку
 * (у нас один на заказ — он и печатается на каждом талоне).
 */
export function buildRegistrationSheetHtml(data: RegistrationSheetData): string {
  const totals = registrationSheetTotals(data);
  const resultAt =
    data.maxRequiredDays == null ? null : addDays(data.registeredAt, data.maxRequiredDays);
  const birth = formatDateDash(data.birthDate) || "—";
  const regDate = formatDateRu(data.registeredAt);
  const priceOf = (value: number): string => String(Math.round(value * 100) / 100);

  const lineRows = data.lines
    .map(
      (line, index) => `
      <tr>
        <td>${index + 1}. ${esc(line.titleSnapshot)}${line.countItem > 1 ? ` × ${line.countItem}` : ""}${lineTags(line)}</td>
        ${data.withPrices ? `<td class="s">${priceOf(money(line.price ?? "0") * line.countItem)}</td>` : ""}
      </tr>`,
    )
    .join("");

  const row = (label: string, value: string): string =>
    `<tr><td>${label}</td><td class="s">${esc(value)}</td></tr>`;

  const summaryRows = !data.withPrices
    ? ""
    : [
        totals.instrumentsCharged
          ? row("Забор биоматериала / Расходные материалы", priceOf(totals.instrumentsTotal))
          : "",
        row("Баардык төлөм / Сумма итого", priceOf(totals.total)),
        row(`Скидка ${data.discountPercent}% / Сумма скидки`, priceOf(totals.discount)),
        row("Төлөндү / Оплачено", priceOf(totals.paid)),
        row("Карыз / Долг", priceOf(totals.debt)),
      ].join("");
  const resultRow = resultAt
    ? row("Жыйынтыктын күнү / Дата результата", formatDateRu(resultAt))
    : "";

  const barcodeImg = data.barcodeBase64
    ? `<img src="data:image/png;base64,${data.barcodeBase64}" alt="Штрихкод" />`
    : "";
  const headCode = data.barcodeBase64
    ? `<div class="code">${barcodeImg}<div class="hint">Натыйжаларды текшерүү<br>(Проверка результатов)</div></div>`
    : `<div class="code"><div class="pending">Заказ ещё не передан в лабораторию — номер регистрации и штрихкод появятся после отправки.</div></div>`;
  const regNo = data.regCode != null ? String(data.regCode) : "—";

  const answersOf = (): string =>
    data.answers.length > 0
      ? `<div class="ans">${data.answers.map((a) => esc(`${a.title}: ${a.value}`)).join("; ")}</div>`
      : "";

  const stub = (items: string[], withAnswers: boolean, withCode: boolean): string => `
    <div class="stub">
      ${withCode && data.regCode != null ? `<div class="num">${regNo}</div>` : ""}
      <div class="row">
        <div>Каттоо баракчасы / Регистрационный лист</div>
        ${withCode ? barcodeImg : ""}
      </div>
      <div class="date"><span>Дата сдачи:</span><span>${esc(regDate)}</span><b>${esc(data.branchName)}</b></div>
      <div class="who"><span>№${regNo}</span><span>${esc(data.patientName)}</span><span>${birth}</span><span>${GENDER_SHORT[data.gender]}</span></div>
      <ol>${items.map((item, i) => `<li>${i + 1}. ${esc(item)}</li>`).join("")}</ol>
      ${withAnswers ? answersOf() : ""}
    </div>`;

  const instrumentTitles = data.instruments.map((item) =>
    item.count > 1 ? `${item.titleSnapshot} — ${item.count} шт` : item.titleSnapshot,
  );
  // Талон на каждый анализ: у одного анализа — с его расходниками (они и
  // есть его пробирки), у нескольких — расходники на сводном талоне: связь
  // «пробирка → анализ» заказ не хранит.
  const perTest = data.lines.map((line) =>
    stub(
      data.lines.length === 1
        ? [line.titleSnapshot, ...instrumentTitles]
        : [line.titleSnapshot],
      true,
      true,
    ),
  );
  const summary =
    data.lines.length > 1
      ? stub([...data.lines.map((line) => line.titleSnapshot), ...instrumentTitles], true, false)
      : "";

  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Регистрационный лист</title>
<style>${STYLE}</style></head><body><div class="sheet">
  <div class="head">
    <div class="clinic">${esc(data.clinicName)}<small>${esc(data.branchName)}</small></div>
    <div class="lic">Лаборатория-исполнитель: ЭКСПРЕСС ПЛЮС
Бишкек, Токтоналиева 60/1</div>
  </div>

  <div class="intro">
    <div>
      <div class="title">Каттоо баракчасы /<br>Регистрационный лист</div>
      <div class="fields">
        <div class="k">Аты жөнү / ФИО</div><div class="v">${esc(data.patientName)}</div>
        <div class="k">Туулган күнү /<br>Дата рождения:</div><div class="v">${birth}</div>
        <div class="k">Жынысы / Пол:</div><div class="v">${GENDER_LABEL[data.gender]}</div>
        <div class="k">Катталган күнү / Дата<br>регистрации:</div><div class="v">${esc(formatDateTimeRu(data.registeredAt))}</div>
        ${data.referringDoctorName ? `<div class="k">Дарыгер / Врач:</div><div class="v">${esc(data.referringDoctorName)}</div>` : ""}
        <div class="k"></div><div class="reg">рег. № <b>${regNo}</b></div>
      </div>
    </div>
    ${headCode}
  </div>

  <table>
    <thead><tr><th>Изилдөө / Исследование</th>${data.withPrices ? '<th class="s">Баасы / цена</th>' : ""}</tr></thead>
    <tbody>${lineRows}${summaryRows}${resultRow}</tbody>
  </table>

  <div class="site">
    <div>Жыйынтыгын сайт аркылуу да алсаңыз болот /<br>Результаты на нашем сайте: <span class="url">www.expresslab.kg</span></div>
    <div></div>
    <div>Тапшырыктын номери / Номер заказа</div>
    <div class="box">${regNo}</div>
  </div>
  <div class="call">Колл центр: +996 (312) 90-90-09, whatsapp: +996 (505) 90-90-09</div>

  <div class="stubs">${perTest.join("")}${summary}</div>
</div></body></html>`;
}
