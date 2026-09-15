/**
 * Разбор текстов карточки анализа из ЛИС.
 *
 * ЛИС хранит показания и подготовку одной строкой, где пункты склеены
 * через « - »: «- Скрининговые обследования … - диагностика анемий - …».
 * На экране такая простыня читается плохо, а пациент спрашивает «а что
 * это» именно у стойки — регистратору нужен список, по которому можно
 * пробежать глазами. Здесь текст режется обратно на пункты; где пунктов
 * нет, отдаётся как есть.
 */

/** Пункт списка ЛИС начинается с дефиса и пробела; «кон-ия» — не пункт. */
const BULLET = /(?:^|\s)[-–—]\s+/;

/**
 * Разбить текст на пункты списка. Меньше двух пунктов — не список, вернуть
 * текст целиком одним элементом (дефис внутри фразы не считается).
 */
export function splitLisBullets(text: string): string[] {
  const parts = text
    .split(BULLET)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length >= 2) return parts;
  // Единственный пункт — абзац, но ведущий дефис ему ни к чему.
  return [text.trim().replace(/^[-–—]\s+/, "")].filter(Boolean);
}

export interface NoticeParts {
  /** Служебная часть до звёздочки: «Код: 1.2 Ежедн.» — без неё, если нет. */
  meta: string;
  /** Показатели состава: «Гемоглобин (HGB)», «Эритроциты (RBC)» … */
  analytes: string[];
  /** Текст, который не удалось разобрать как состав, — показать как есть. */
  rest: string;
}

/**
 * Разобрать «Примечание» ЛИС.
 *
 * У составных анализов примечание выглядит как «Код: 1.2 Ежедн.
 * *Гемоглобин (HGB), Эритроциты (RBC), … Тромбоциты (PLT).» — звёздочка
 * отделяет служебное от перечня показателей. Перечень читается как набор
 * плашек куда лучше, чем абзац из тридцати запятых. Если после звёздочки
 * не похоже на перечень (меньше трёх показателей с кодами в скобках),
 * текст отдаётся как есть — угадывать формат ЛИС наугад не стоит.
 */
export function parseNotice(notice: string): NoticeParts {
  const star = notice.indexOf("*");
  if (star < 0) return { meta: "", analytes: [], rest: notice.trim() };

  const meta = notice.slice(0, star).trim();
  const list = notice.slice(star + 1).trim().replace(/\.$/, "");
  const analytes = list
    .split(/,\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
  const coded = analytes.filter((item) => /\([^)]+\)\s*$/.test(item)).length;
  if (analytes.length < 3 || coded < analytes.length / 2) {
    return { meta: "", analytes: [], rest: notice.trim() };
  }
  return { meta, analytes, rest: "" };
}
