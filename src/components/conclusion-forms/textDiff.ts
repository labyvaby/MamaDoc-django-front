/**
 * Пословное сравнение «текст врача → предложение AI» для режима проверки.
 *
 * Сравниваем по словам, а не по символам: врач читает правку как «убрал это
 * слово, вписал то», посимвольная каша из подсвеченных букв нечитаема.
 * Пробелы и переводы строк — отдельные токены: иначе склейка строк моделью
 * («жалоб нет.\nТемпература…» → одна строка) была бы не видна.
 */

export type DiffPart = { kind: "same" | "added" | "removed"; text: string };

/**
 * Больше токенов на сторону — не считаем LCS (таблица n×m), показываем
 * правку целиком заменой. Заключение в тысячу слов на практике не бывает.
 */
const MAX_TOKENS = 1500;

const tokenize = (text: string): string[] => text.split(/(\s+)/).filter((t) => t !== "");

/** Склеить соседние части одного вида — меньше разрывов подсветки. */
const merge = (parts: DiffPart[]): DiffPart[] => {
  const out: DiffPart[] = [];
  for (const part of parts) {
    const last = out[out.length - 1];
    if (last && last.kind === part.kind) last.text += part.text;
    else out.push({ ...part });
  }
  return out;
};

/**
 * Пробел между двумя правками относим к ним: «~~старое~~ ~~слово~~» читается
 * как одна замена, а не две с белой щелью посередине. Подряд идущие правки
 * собираем в «сначала всё удалённое, потом всё добавленное».
 */
const absorbSpaces = (parts: DiffPart[]): DiffPart[] => {
  const out: DiffPart[] = [];
  let removed = "";
  let added = "";
  const flush = () => {
    if (removed) out.push({ kind: "removed", text: removed });
    if (added) out.push({ kind: "added", text: added });
    removed = "";
    added = "";
  };
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.kind === "removed") {
      removed += part.text;
      continue;
    }
    if (part.kind === "added") {
      added += part.text;
      continue;
    }
    const next = parts[i + 1];
    const inChange = (removed || added) && next && next.kind !== "same";
    if (inChange && /^[ \t]+$/.test(part.text)) {
      // Пробел уходит в обе стороны — каждая остаётся связным текстом.
      removed += part.text;
      added += part.text;
      continue;
    }
    flush();
    out.push(part);
  }
  flush();
  return merge(out);
};

export function diffWords(before: string, after: string): DiffPart[] {
  if (before === after) return before ? [{ kind: "same", text: before }] : [];
  const a = tokenize(before);
  const b = tokenize(after);
  if (a.length === 0) return [{ kind: "added", text: after }];
  if (b.length === 0) return [{ kind: "removed", text: before }];
  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) {
    return [
      { kind: "removed", text: before },
      { kind: "added", text: after },
    ];
  }

  // lcs[i][j] — длина общей подпоследовательности хвостов a[i..], b[j..].
  const n = a.length;
  const m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const parts: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      parts.push({ kind: "same", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      parts.push({ kind: "removed", text: a[i++] });
    } else {
      parts.push({ kind: "added", text: b[j++] });
    }
  }
  while (i < n) parts.push({ kind: "removed", text: a[i++] });
  while (j < m) parts.push({ kind: "added", text: b[j++] });
  return absorbSpaces(merge(parts));
}

/** Сколько слов правка добавила и убрала — подпись «+12 / −3». */
export function diffStats(parts: DiffPart[]): { added: number; removed: number } {
  const words = (text: string) => tokenize(text).filter((t) => !/^\s+$/.test(t)).length;
  let added = 0;
  let removed = 0;
  for (const part of parts) {
    if (part.kind === "added") added += words(part.text);
    else if (part.kind === "removed") removed += words(part.text);
  }
  return { added, removed };
}

/** Тексты совпадают с точностью до пробелов — правки по сути нет. */
export const sameText = (a: string, b: string): boolean =>
  a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();

const numbersOf = (text: string): string[] =>
  (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", "."));

/**
 * Добавленная часть вносит число, которого не было в заменённом тексте, —
 * доза, температура, вес. Такие места подсвечиваем отдельно: «38.2 → 38,2 °C»
 * — не новое число, а «парацетамол → парацетамол 240 мг» — новое.
 */
export function addsNewNumber(parts: DiffPart[], index: number): boolean {
  const part = parts[index];
  if (part?.kind !== "added") return false;
  const prev = parts[index - 1];
  const replaced = prev?.kind === "removed" ? numbersOf(prev.text) : [];
  return numbersOf(part.text).some((n) => !replaced.includes(n));
}
