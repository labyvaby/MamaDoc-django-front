/**
 * Генерация штрихкода Code 128 (подмножество B) как самодостаточного SVG —
 * для печатных документов, которые уходят в отдельное окно печати и не могут
 * тянуть внешние библиотеки/картинки.
 *
 * Подмножество B покрывает ASCII 32–126 (цифры, латиница, знаки) — этого
 * хватает для номера счёта. Символы вне диапазона отбрасываются: печатный
 * документ важнее, чем исключение посреди печати.
 */

/**
 * 107 паттернов Code 128: 103 значения данных + 3 старта (103/104/105).
 * Каждая строка — ширины полос в модулях, начиная с чёрной: 6 цифр,
 * в сумме 11 модулей (инвариант зафиксирован тестом).
 */
const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312",
  "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222",
  "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131",
  "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321",
  "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121",
  "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321",
  "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224",
  "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114",
  "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112",
  "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113",
  "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412",
  "211214", "211232",
];

/** Завершающий паттерн — единственный из 13 модулей (7 полос). */
const STOP = "2331112";

const START_B = 104;

/** Ширины полос штрихкода для значения — включая старт, контрольную сумму и стоп. */
export function code128bModules(value: string): number[] {
  const codes: number[] = [];
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 126) continue;
    codes.push(code - 32);
  }

  let checksum = START_B;
  codes.forEach((code, i) => {
    checksum += code * (i + 1);
  });
  checksum %= 103;

  const patterns = [
    PATTERNS[START_B],
    ...codes.map((code) => PATTERNS[code]),
    PATTERNS[checksum],
    STOP,
  ];

  return patterns.join("").split("").map(Number);
}

export type Barcode128Options = {
  /** Ширина одного модуля в пикселях (толщина самой тонкой полосы). */
  moduleWidth?: number;
  /** Высота полос в пикселях. */
  height?: number;
  /** Печатать значение под кодом. */
  showValue?: boolean;
};

/**
 * Штрихкод как строка `<svg>…</svg>`, готовая к вставке в HTML печати.
 * Пустое значение даёт пустую строку — вызывающий код просто ничего не рисует.
 */
export function barcode128Svg(value: string, options: Barcode128Options = {}): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const moduleWidth = options.moduleWidth ?? 1.6;
  const height = options.height ?? 44;
  const showValue = options.showValue ?? true;
  const textHeight = showValue ? 13 : 0;

  const modules = code128bModules(trimmed);
  const totalModules = modules.reduce((sum, m) => sum + m, 0);
  const width = totalModules * moduleWidth;

  let x = 0;
  const bars: string[] = [];
  modules.forEach((m, i) => {
    const barWidth = m * moduleWidth;
    // Чётный индекс — чёрная полоса, нечётный — пробел (Code 128 всегда
    // начинается с чёрной).
    if (i % 2 === 0) {
      bars.push(
        `<rect x="${x.toFixed(2)}" y="0" width="${barWidth.toFixed(2)}" height="${height}" fill="#000"/>`,
      );
    }
    x += barWidth;
  });

  const label = showValue
    ? `<text x="${(width / 2).toFixed(2)}" y="${height + 11}" font-family="monospace" font-size="11" text-anchor="middle" fill="#000">${trimmed.replace(
        /[&<>]/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] ?? c),
      )}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width.toFixed(2)}" height="${
    height + textHeight
  }" viewBox="0 0 ${width.toFixed(2)} ${height + textHeight}">${bars.join("")}${label}</svg>`;
}
