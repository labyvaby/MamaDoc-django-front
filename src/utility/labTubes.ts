/**
 * Цветовая маркировка пробирок для экрана приёма анализов.
 *
 * ЛИС не отдаёт цвет крышки отдельным полем: он спрятан словом внутри
 * названия («вакутейнер (ОАК фиолетовый)») или внутри инструкции медсестре
 * («Вакутейнер с ЖЕЛТОЙ крышкой…»). У стола забора именно цвет крышки — то,
 * по чему пробирки различают в руках, поэтому слово вытаскивается и
 * превращается в метку и в оттенок для значка.
 */

export type TubeColor =
  | "violet"
  | "yellow"
  | "red"
  | "blue"
  | "green"
  | "grey"
  | "black"
  | "pink"
  | "orange"
  | "clear"
  | "neutral";

export interface TubeAppearance {
  /** Ключ цвета — по нему группируются одинаковые крышки. */
  color: TubeColor;
  /** Подпись под названием: «Фиолетовая крышка». */
  label: string;
  /** Оттенок крышки на значке. */
  cap: string;
  /** Оттенок стекла: тот же цвет, сильно разбавленный. */
  body: string;
}

interface Known {
  color: TubeColor;
  /** Корни слов без окончаний: род и падеж в каталоге ЛИС гуляют. */
  roots: string[];
  label: string;
  cap: string;
  body: string;
}

const KNOWN: Known[] = [
  {
    color: "violet",
    roots: ["фиолетов", "сиренев", "лиловый"],
    label: "Фиолетовая крышка",
    cap: "#7E57C2",
    body: "#EDE7F6",
  },
  {
    color: "yellow",
    roots: ["желт"],
    label: "Жёлтая крышка",
    cap: "#E4A81D",
    body: "#FDF3D7",
  },
  {
    color: "red",
    roots: ["красн", "бордов"],
    label: "Красная крышка",
    cap: "#CE4257",
    body: "#FBE4E7",
  },
  {
    color: "blue",
    roots: ["голуб", "син", "лазурн"],
    label: "Синяя крышка",
    cap: "#2F6FED",
    body: "#E3ECFD",
  },
  {
    color: "green",
    roots: ["зелен"],
    label: "Зелёная крышка",
    cap: "#2E9E5B",
    body: "#E2F4E9",
  },
  {
    color: "grey",
    roots: ["сер"],
    label: "Серая крышка",
    cap: "#8A939F",
    body: "#EDEFF2",
  },
  {
    color: "black",
    roots: ["черн"],
    label: "Чёрная крышка",
    cap: "#3A3F45",
    body: "#E6E8EA",
  },
  {
    color: "pink",
    roots: ["розов"],
    label: "Розовая крышка",
    cap: "#DD5C8A",
    body: "#FBE5ED",
  },
  {
    color: "orange",
    roots: ["оранжев"],
    label: "Оранжевая крышка",
    cap: "#DD7A2E",
    body: "#FCEBDD",
  },
  {
    color: "clear",
    roots: ["прозрачн", "бесцветн"],
    label: "Прозрачная крышка",
    cap: "#B9C0CA",
    body: "#F2F4F7",
  },
];

const NEUTRAL: TubeAppearance = {
  color: "neutral",
  label: "Без цветовой маркировки",
  cap: "#9AA3AE",
  body: "#EEF1F5",
};

/** Регистр и «ё» в каталоге ЛИС не выдержаны — приводим к одному виду. */
function normalize(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е");
}

function match(text: string): Known | null {
  const haystack = normalize(text);
  for (const known of KNOWN) {
    if (known.roots.some((root) => haystack.includes(root))) return known;
  }
  return null;
}

/**
 * Цвет пробирки по названию и инструкции.
 *
 * Название читается первым: инструкция часто пересказывает соседние
 * пробирки («в отличие от красной…»), и по ней цвет определился бы чужой.
 */
export function tubeAppearance(
  title: string,
  instruction: string,
): TubeAppearance {
  const found = match(title) ?? match(instruction);
  if (!found) return NEUTRAL;
  return {
    color: found.color,
    label: found.label,
    cap: found.cap,
    body: found.body,
  };
}
