/**
 * Иконки специализаций для витрины записи.
 *
 * Картинки выгружены из макета Figma (`src/assets/specialties/*.png`, 128×128 —
 * это 32 CSS-пикселя из макета в @4x). Они растровые, поэтому подобрать их
 * иконкой MUI нельзя: рисунок у каждой специальности свой.
 *
 * Названия специализаций приходят из справочника бэка и не совпадают с именами
 * файлов ни по написанию, ни по составу: в базе встречаются «Врач-терапевт»,
 * «ЛОР (отоларинголог)», «Акушер-гинеколог». Поэтому сопоставляем не строкой
 * целиком, а корнем слова — и отдаём null, если корень незнаком, чтобы вызывающий
 * показал нейтральную заглушку вместо чужой картинки.
 */

// Vite инлайнит пути на этапе сборки; ключ карты — имя файла без расширения.
const FILES = import.meta.glob<string>("../../assets/specialties/*.png", {
  eager: true,
  import: "default",
  query: "?url",
});

const byName = new Map<string, string>();
for (const [path, url] of Object.entries(FILES)) {
  const name = path.split("/").pop()?.replace(".png", "");
  if (name) byName.set(name, url);
}

/**
 * Корни названий → файл иконки. Порядок значим: проверяем сверху вниз и берём
 * первое совпадение, поэтому уточняющие корни стоят выше общих —
 * «нейрохирург» до «хирург», «физиотерапевт» до «терапевт», иначе
 * нейрохирург получил бы иконку хирурга.
 */
const RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/нейрохирург/, "neyrohirurg"],
  [/физиотерапевт|физио/, "fizioterapevt"],
  [/психиатр|психотерапевт|психолог/, "psihiatr"],
  [/невролог|невропатолог/, "nevrolog"],
  [/терапевт/, "terapevt"],
  [/хирург/, "hirurg"],
  [/дерматолог/, "dermatolog"],
  [/лор|отоларинголог|оториноларинголог/, "lor"],
  [/онколог/, "onkolog"],
  [/гинеколог|акушер/, "ginekolog"],
  [/эндокринолог/, "endokrinolog"],
  [/ортодонт/, "ortodont"],
  [/анестезиолог|анастезиолог/, "anesteziolog"],
  [/гастроэнтеролог/, "gastroenterolog"],
  [/трихолог/, "triholog"],
  [/офтальмолог|окулист/, "oftalmolog"],
  [/ревматолог/, "revmatolog"],
  [/травматолог/, "travmatolog"],
  [/стоматолог|дантист/, "stomatolog"],
  [/кардиолог/, "kardiolog"],
  [/педиатр/, "pediatr"],
  [/аллерголог/, "allergolog"],
  [/венеролог/, "venerolog"],
  [/проктолог|колопроктолог/, "proktolog"],
  [/уролог/, "urolog"],
];

/** Иконка специализации по её названию; null — подходящей картинки нет. */
export function specialtyIconUrl(title: string): string | null {
  // «ё» пишут и через «е»: «Врач-акушёр» должен найтись по корню «акушер».
  const normalized = title.toLowerCase().replace(/ё/g, "е");
  for (const [pattern, file] of RULES) {
    if (pattern.test(normalized)) return byName.get(file) ?? null;
  }
  return null;
}
