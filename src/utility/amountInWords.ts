/**
 * Сумма прописью на русском — для печатных документов (счёт к оплате).
 *
 * Формат: «Одна тысяча пятьсот сомов 00 тыйын». Целая часть словами, копеечная
 * (тыйын) — цифрами, как в бумажных бланках.
 */

const UNITS_M = [
  "ноль", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять",
  "десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать",
  "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать",
];
const UNITS_F = [...UNITS_M];
UNITS_F[1] = "одна";
UNITS_F[2] = "две";

const TENS = [
  "", "", "двадцать", "тридцать", "сорок", "пятьдесят",
  "шестьдесят", "семьдесят", "восемьдесят", "девяносто",
];

const HUNDREDS = [
  "", "сто", "двести", "триста", "четыреста", "пятьсот",
  "шестьсот", "семьсот", "восемьсот", "девятьсот",
];

/** Разряды: [ед., 2–4, 5+] + род числительного этого разряда. */
const SCALES: { forms: [string, string, string]; feminine: boolean }[] = [
  { forms: ["", "", ""], feminine: false },
  { forms: ["тысяча", "тысячи", "тысяч"], feminine: true },
  { forms: ["миллион", "миллиона", "миллионов"], feminine: false },
  { forms: ["миллиард", "миллиарда", "миллиардов"], feminine: false },
];

/** Выбор словоформы по числу: 1 сом / 2 сома / 5 сомов. */
export function pluralRu(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const tail = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (tail > 1 && tail < 5) return forms[1];
  if (tail === 1) return forms[0];
  return forms[2];
}

/** Группа из трёх цифр словами. */
function tripletToWords(n: number, feminine: boolean): string[] {
  const words: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds > 0) words.push(HUNDREDS[hundreds]);
  const units = feminine ? UNITS_F : UNITS_M;
  if (rest < 20) {
    if (rest > 0) words.push(units[rest]);
  } else {
    words.push(TENS[Math.floor(rest / 10)]);
    if (rest % 10 > 0) words.push(units[rest % 10]);
  }
  return words;
}

/** Целое число словами (до 999 999 999 999). */
export function integerInWords(value: number, feminine = false): string {
  const n = Math.floor(Math.abs(value));
  if (n === 0) return feminine ? UNITS_F[0] : UNITS_M[0];

  const triplets: number[] = [];
  let rest = n;
  while (rest > 0) {
    triplets.push(rest % 1000);
    rest = Math.floor(rest / 1000);
  }

  const words: string[] = [];
  for (let scale = triplets.length - 1; scale >= 0; scale--) {
    const triplet = triplets[scale];
    if (triplet === 0) continue;
    const meta = SCALES[scale] ?? SCALES[SCALES.length - 1];
    // Род числительного задаёт сам разряд («одна тысяча», но «один миллион»);
    // у единиц — род валюты, который приходит параметром.
    words.push(...tripletToWords(triplet, scale === 0 ? feminine : meta.feminine));
    if (scale > 0) words.push(pluralRu(triplet, meta.forms));
  }
  return words.join(" ");
}

function capitalizeFirst(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/**
 * Сумма в сомах прописью: `1500` → «Одна тысяча пятьсот сомов 00 тыйын».
 * Дробная часть округляется до тыйын и печатается цифрами.
 */
export function amountInWordsKgs(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.abs(amount) : 0;
  // Округляем до тыйын до разбора: 1500.999 не должно дать «1500 сомов 100 тыйын».
  const totalTiyin = Math.round(safe * 100);
  const som = Math.floor(totalTiyin / 100);
  const tiyin = totalTiyin % 100;
  const somWord = pluralRu(som, ["сом", "сома", "сомов"]);
  const tiyinWord = pluralRu(tiyin, ["тыйын", "тыйына", "тыйынов"]);
  const sign = amount < 0 ? "минус " : "";
  return capitalizeFirst(
    `${sign}${integerInWords(som)} ${somWord} ${String(tiyin).padStart(2, "0")} ${tiyinWord}`,
  );
}
