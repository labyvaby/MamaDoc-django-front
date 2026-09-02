/**
 * Акцентная палитра приложения.
 *
 * Акцент — СВЯЗКА токенов, своя для светлой и тёмной темы: он тянет за собой
 * фон страницы, цвет карточек и границы, поэтому интерфейс получается
 * тонированным под выбранный цвет, а не «цветная кнопка на сером фоне».
 *
 * Три правила держат набор:
 *
 * 1. Контраст. Каждая пара — accent на surface, accent на accentBg, accentFg
 *    на заливке accent — не ниже 4.5:1 (WCAG AA).
 * 2. Расстояние до статусных цветов. Приложение говорит цветом о состоянии
 *    приёма (`config/appointmentStatuses.tsx`): error — отменён/долг, warning —
 *    идёт приём, success — оплачено, info — подтверждён, teal — «Пациент
 *    здесь», purple — частично оплачено. Акцент, совпадающий с любым из них,
 *    делает чипы статусов неотличимыми от кнопок, поэтому такие оттенки в
 *    палитру не попадают (ΔE ≥ 20 в обеих темах).
 * 3. Различимость. Два акцента, которые глаз не отличает, — это не выбор, а
 *    шум в сетке.
 *
 * Все три зафиксированы тестом: правя значения, прогоняй
 * `npm run test -- accentPalette`.
 */

/** Шесть цветов, из которых собирается тема для одного режима (день/ночь). */
export type AccentTokens = {
  /** Основной акцент: заливка кнопок, активные состояния, ссылки. */
  accent: string;
  /**
   * Непрозрачный фон под акцентом: чипы, активный пункт меню, дорожка прогресса.
   * Именно непрозрачный, а не alpha(accent): полупрозрачная подложка «плывёт»
   * поверх цветных строк таблиц.
   */
  accentBg: string;
  /** Текст и иконки поверх заливки accent. */
  accentFg: string;
  /** Фон приложения (background.default). */
  page: string;
  /** Фон карточек и панелей (background.paper). */
  surface: string;
  /** Границы карточек и разделители (divider). */
  border: string;
};

export type AccentPreset = {
  /** Стабильный ключ — он и хранится в настройках, а не хекс. */
  id: string;
  /** Название для подсказки в кастомайзере. */
  name: string;
  light: AccentTokens;
  dark: AccentTokens;
};

/**
 * Цветные темы — 24 оттенка по кругу цветового тона. Фон страницы и карточек
 * здесь подтонирован акцентом, поэтому тема выбирается одним кликом:
 * отдельного выбора фона в интерфейсе нет, сочетание задано самим пресетом.
 *
 * Круг проходится крупным шагом намеренно: близкие оттенки — не выбор, а шум,
 * и в клинике цветной интерфейс нужен реже, чем спокойный.
 */
export const TINTED_PRESETS: AccentPreset[] = [
  {
    id: "tomato",
    name: "Томатный",
    light: { accent: "#C52D23", accentBg: "#FEEBE8", accentFg: "#FFFFFF", page: "#FEEEEC", surface: "#FEFBFB", border: "#F0D1CC" },
    dark: { accent: "#FF9688", accentBg: "#4D2621", accentFg: "#1A0907", page: "#1A0907", surface: "#271310", border: "#422825" },
  },
  {
    id: "terracotta",
    name: "Терракотовый",
    light: { accent: "#B74600", accentBg: "#FFECE4", accentFg: "#FFFFFF", page: "#FFEFE8", surface: "#FFFBF9", border: "#EED2C7" },
    dark: { accent: "#FE996F", accentBg: "#4C2818", accentFg: "#1A0904", page: "#1A0904", surface: "#27140C", border: "#422A20" },
  },
  {
    id: "orange",
    name: "Оранжевый",
    light: { accent: "#A55700", accentBg: "#FFECDF", accentFg: "#FFFFFF", page: "#FFEFE4", surface: "#FEFBF9", border: "#ECD4C3" },
    dark: { accent: "#FA9F55", accentBg: "#492A11", accentFg: "#180A02", page: "#180A02", surface: "#251509", border: "#402B1C" },
  },
  {
    id: "amber",
    name: "Янтарный",
    light: { accent: "#8D6300", accentBg: "#FDEED6", accentFg: "#FFFFFF", page: "#FBF1E1", surface: "#FEFBF7", border: "#E6D7C0" },
    dark: { accent: "#E7AC3E", accentBg: "#432F08", accentFg: "#160C01", page: "#160C01", surface: "#221706", border: "#3B2E18" },
  },
  {
    id: "mustard",
    name: "Горчичный",
    light: { accent: "#816A02", accentBg: "#F8F0D6", accentFg: "#FFFFFF", page: "#F8F3E1", surface: "#FDFCF7", border: "#E1D9C0" },
    dark: { accent: "#D5B53B", accentBg: "#3D3207", accentFg: "#130E01", page: "#130E01", surface: "#1F1906", border: "#373018" },
  },
  {
    id: "khaki",
    name: "Хаки",
    light: { accent: "#737001", accentBg: "#F2F2D8", accentFg: "#FFFFFF", page: "#F4F4E2", surface: "#FCFCF7", border: "#DBDBC1" },
    dark: { accent: "#C0BE46", accentBg: "#36350B", accentFg: "#100F01", page: "#100F01", surface: "#1B1B07", border: "#323219" },
  },
  {
    id: "grass",
    name: "Травяной",
    light: { accent: "#4E7703", accentBg: "#E9F5DD", accentFg: "#FFFFFF", page: "#EDF6E5", surface: "#FAFDF8", border: "#D2DEC6" },
    dark: { accent: "#9AC964", accentBg: "#293916", accentFg: "#0A1103", page: "#0A1103", surface: "#141D0B", border: "#2A341E" },
  },
  {
    id: "forest",
    name: "Лесной",
    light: { accent: "#2A6E34", accentBg: "#E7FAEA", accentFg: "#FFFFFF", page: "#EBFAED", surface: "#FBFDFB", border: "#D3E0D5" },
    dark: { accent: "#82C78D", accentBg: "#27382A", accentFg: "#09130A", page: "#09130A", surface: "#141C15", border: "#2E312E" },
  },
  {
    id: "emerald",
    name: "Изумрудный",
    light: { accent: "#047E3D", accentBg: "#E0F7E5", accentFg: "#FFFFFF", page: "#E7F7EA", surface: "#F9FDF9", border: "#C9E0CE" },
    dark: { accent: "#6CD189", accentBg: "#183B23", accentFg: "#041207", page: "#041207", surface: "#0D1E11", border: "#213626" },
  },
  {
    id: "malachite",
    name: "Малахитовый",
    light: { accent: "#037D4E", accentBg: "#DEF8E7", accentFg: "#FFFFFF", page: "#E6F8EC", surface: "#F8FDFA", border: "#C7E1D1" },
    dark: { accent: "#5AD295", accentBg: "#123C27", accentFg: "#021209", page: "#021209", surface: "#0A1E13", border: "#1E3729" },
  },
  {
    id: "sky",
    name: "Небесный",
    light: { accent: "#087684", accentBg: "#D6F7FD", accentFg: "#FFFFFF", page: "#E1F7FB", surface: "#F7FDFE", border: "#C0E0E5" },
    dark: { accent: "#04CEE5", accentBg: "#003A42", accentFg: "#001215", page: "#001215", surface: "#031E22", border: "#14363B" },
  },
  {
    id: "lightblue",
    name: "Голубой",
    light: { accent: "#047795", accentBg: "#DCF5FF", accentFg: "#FFFFFF", page: "#E2F6FE", surface: "#F8FDFE", border: "#C1DFEA" },
    dark: { accent: "#22CAF8", accentBg: "#003949", accentFg: "#001118", page: "#001118", surface: "#051D25", border: "#17353F" },
  },
  {
    id: "cornflower",
    name: "Васильковый",
    light: { accent: "#0374A6", accentBg: "#E3F3FE", accentFg: "#FFFFFF", page: "#E7F5FF", surface: "#F9FCFF", border: "#C5DDEE" },
    dark: { accent: "#5FC3FE", accentBg: "#0E374E", accentFg: "#02101A", page: "#02101A", surface: "#081C27", border: "#1C3342" },
  },
  {
    id: "sapphire",
    name: "Сапфировый",
    light: { accent: "#10469D", accentBg: "#E3EDFE", accentFg: "#FFFFFF", page: "#E7F0FE", surface: "#FAFCFE", border: "#CAD6E9" },
    dark: { accent: "#79A2E5", accentBg: "#1B2B44", accentFg: "#050C17", page: "#050C17", surface: "#0E1622", border: "#232D3C" },
  },
  {
    id: "denim",
    name: "Джинсовый",
    light: { accent: "#2A436E", accentBg: "#E7EEFA", accentFg: "#FFFFFF", page: "#EBF0FA", surface: "#FBFCFD", border: "#D3D8E0" },
    dark: { accent: "#829CC7", accentBg: "#272D38", accentFg: "#090D13", page: "#090D13", surface: "#14171C", border: "#2E2F31" },
  },
  {
    id: "electric",
    name: "Электрик",
    light: { accent: "#172CC9", accentBg: "#E4E7FD", accentFg: "#FFFFFF", page: "#E8EBFD", surface: "#FAFBFE", border: "#CDD0E6" },
    dark: { accent: "#A3ACEE", accentBg: "#1F2340", accentFg: "#060816", page: "#060816", surface: "#101220", border: "#262839" },
  },
  {
    id: "ultraviolet",
    name: "Ультрафиолет",
    light: { accent: "#4C17C9", accentBg: "#ECE4FD", accentFg: "#FFFFFF", page: "#EEE8FD", surface: "#FBFAFE", border: "#D4CDE6" },
    dark: { accent: "#BAA3EE", accentBg: "#291F40", accentFg: "#0B0616", page: "#0B0616", surface: "#151020", border: "#2C2639" },
  },
  {
    id: "purple",
    name: "Пурпурный",
    light: { accent: "#9044BF", accentBg: "#F6ECFE", accentFg: "#FFFFFF", page: "#F7EEFF", surface: "#FDFBFE", border: "#E0D3EB" },
    dark: { accent: "#D29DFA", accentBg: "#3C2A4A", accentFg: "#120A19", page: "#120A19", surface: "#1E1525", border: "#362B40" },
  },
  {
    id: "mulberry",
    name: "Шелковичный",
    light: { accent: "#83109D", accentBg: "#F9E3FE", accentFg: "#FFFFFF", page: "#FAE7FE", surface: "#FDFAFE", border: "#E3CAE9" },
    dark: { accent: "#D179E5", accentBg: "#3C1B44", accentFg: "#140517", page: "#140517", surface: "#1E0E22", border: "#38233C" },
  },
  {
    id: "fuchsia",
    name: "Фуксия",
    light: { accent: "#A937A0", accentBg: "#FFE8FB", accentFg: "#FFFFFF", page: "#FDEDFA", surface: "#FFFAFE", border: "#E7D1E4" },
    dark: { accent: "#EA95E0", accentBg: "#442741", accentFg: "#160915", page: "#160915", surface: "#221321", border: "#3C293A" },
  },
  {
    id: "cyclamen",
    name: "Цикламен",
    light: { accent: "#C0168D", accentBg: "#FDE4F5", accentFg: "#FFFFFF", page: "#FDE8F7", surface: "#FEFAFD", border: "#E6CDDF" },
    dark: { accent: "#EEA3D7", accentBg: "#401F36", accentFg: "#160611", page: "#160611", surface: "#20101B", border: "#392633" },
  },
  {
    id: "peony",
    name: "Пионовый",
    light: { accent: "#BA2C78", accentBg: "#FFEAF2", accentFg: "#FFFFFF", page: "#FEEDF4", surface: "#FFFAFC", border: "#EDD0DB" },
    dark: { accent: "#FB90BF", accentBg: "#4A2536", accentFg: "#190810", page: "#190810", surface: "#26131B", border: "#402832" },
  },
  {
    id: "crimson",
    name: "Малиновый",
    light: { accent: "#BE296A", accentBg: "#FEEAEF", accentFg: "#FFFFFF", page: "#FFEDF2", surface: "#FFFAFC", border: "#EED0D8" },
    dark: { accent: "#FF8FB4", accentBg: "#4B2532", accentFg: "#19080E", page: "#19080E", surface: "#261319", border: "#41282F" },
  },
  {
    id: "scarlet",
    name: "Алый",
    light: { accent: "#C4284B", accentBg: "#FEEBEC", accentFg: "#FFFFFF", page: "#FEEEEF", surface: "#FEFBFB", border: "#EFD0D2" },
    dark: { accent: "#FF939D", accentBg: "#4D2529", accentFg: "#1A080A", page: "#1A080A", surface: "#271314", border: "#42282A" },
  },
];

/**
 * Спокойные темы — те же шесть токенов, но фон страницы и карточек
 * нейтральный: белый и светло-серый днём, угольный ночью. Раньше нейтральный
 * фон был вторым, отдельным выбором в кастомайзере и об акценте ничего не
 * знал — сочетание собирал сам пользователь, часто мимо. Теперь это готовые
 * темы со своим приглушённым акцентом, и выбор снова в один клик.
 *
 * Их 12 против 24 цветных: на рабочем экране, где цветом говорят статусы
 * приёма, спокойный фон нужен чаще яркого.
 */
export const CALM_PRESETS: AccentPreset[] = [
  {
    id: "graphite",
    name: "Графитовая",
    light: { accent: "#4A5A70", accentBg: "#E8EBF0", accentFg: "#FFFFFF", page: "#F1F3F6", surface: "#FFFFFF", border: "#DDE1E8" },
    dark: { accent: "#A7B6CC", accentBg: "#2C3542", accentFg: "#0D1116", page: "#0E1116", surface: "#171C24", border: "#2A303A" },
  },
  {
    id: "snow",
    name: "Снежная",
    light: { accent: "#24417A", accentBg: "#E7EBF3", accentFg: "#FFFFFF", page: "#F5F6F9", surface: "#FFFFFF", border: "#E0E3EA" },
    dark: { accent: "#A8C0EA", accentBg: "#23293A", accentFg: "#0D0F14", page: "#0D0F14", surface: "#161A21", border: "#282E39" },
  },
  {
    id: "linen",
    name: "Льняная",
    light: { accent: "#5E4B3C", accentBg: "#EFEAE4", accentFg: "#FFFFFF", page: "#F7F5F1", surface: "#FFFFFF", border: "#E4DFD7" },
    dark: { accent: "#D2C0AC", accentBg: "#332C25", accentFg: "#12100E", page: "#12100E", surface: "#1B1815", border: "#2E2A25" },
  },
  {
    id: "pine",
    name: "Хвойная",
    light: { accent: "#2E5B45", accentBg: "#E6EDE9", accentFg: "#FFFFFF", page: "#F2F5F3", surface: "#FFFFFF", border: "#DDE4E0" },
    dark: { accent: "#8FC6A8", accentBg: "#22302A", accentFg: "#0D110F", page: "#0D110F", surface: "#161B18", border: "#272F2B" },
  },
  {
    id: "ink",
    name: "Чернильная",
    light: { accent: "#333333", accentBg: "#EAEAEA", accentFg: "#FFFFFF", page: "#F4F4F4", surface: "#FFFFFF", border: "#E0E0E0" },
    dark: { accent: "#CFCFCF", accentBg: "#2A2A2A", accentFg: "#0F0F0F", page: "#0F0F0F", surface: "#191919", border: "#2C2C2C" },
  },
  {
    id: "steel",
    name: "Стальная",
    light: { accent: "#2C4A63", accentBg: "#E6EBF0", accentFg: "#FFFFFF", page: "#F1F4F7", surface: "#FFFFFF", border: "#DCE1E7" },
    dark: { accent: "#9BBBD6", accentBg: "#243039", accentFg: "#0D1114", page: "#0D1114", surface: "#161B20", border: "#272E35" },
  },
  {
    id: "sage",
    name: "Шалфейная",
    light: { accent: "#55705C", accentBg: "#E9EEEA", accentFg: "#FFFFFF", page: "#F3F6F4", surface: "#FFFFFF", border: "#E0E5E1" },
    dark: { accent: "#A8C4AF", accentBg: "#293430", accentFg: "#0E110F", page: "#0E110F", surface: "#171B18", border: "#282E2B" },
  },
  {
    id: "fog",
    name: "Туманная",
    light: { accent: "#3E5F63", accentBg: "#E5EDEE", accentFg: "#FFFFFF", page: "#F0F4F5", surface: "#FFFFFF", border: "#DBE2E3" },
    dark: { accent: "#9FC0C4", accentBg: "#22302F", accentFg: "#0C1112", page: "#0C1112", surface: "#151A1B", border: "#262D2E" },
  },
  {
    id: "clay",
    name: "Глиняная",
    light: { accent: "#7A4A38", accentBg: "#F2E9E5", accentFg: "#FFFFFF", page: "#F7F4F1", surface: "#FFFFFF", border: "#E6DED8" },
    dark: { accent: "#D9AE9B", accentBg: "#352A25", accentFg: "#12100E", page: "#12100E", surface: "#1B1816", border: "#2F2A26" },
  },
  {
    id: "sand",
    name: "Песочная",
    light: { accent: "#6B5A28", accentBg: "#F1EDE1", accentFg: "#FFFFFF", page: "#F7F5EE", surface: "#FFFFFF", border: "#E6E1D3" },
    dark: { accent: "#CDBC8B", accentBg: "#312C1E", accentFg: "#12110C", page: "#12110C", surface: "#1B1914", border: "#2E2B22" },
  },
  {
    id: "heather",
    name: "Вересковая",
    light: { accent: "#5B4A72", accentBg: "#EDE9F2", accentFg: "#FFFFFF", page: "#F4F2F7", surface: "#FFFFFF", border: "#E2DEE8" },
    dark: { accent: "#BCAAD4", accentBg: "#2C2635", accentFg: "#100E14", page: "#100E14", surface: "#191720", border: "#2B2733" },
  },
  {
    id: "rose",
    name: "Пепельная роза",
    light: { accent: "#7A3F55", accentBg: "#F3E8EC", accentFg: "#FFFFFF", page: "#F7F3F4", surface: "#FFFFFF", border: "#E7DDE1" },
    dark: { accent: "#D9A4B5", accentBg: "#352730", accentFg: "#131011", page: "#131011", surface: "#1C181A", border: "#2F292C" },
  },
];

/**
 * Полный набор тем: сначала цветные, за ними спокойные — одной сеткой и в этом
 * же порядке они стоят в кастомайзере.
 */
export const ACCENT_PRESETS: AccentPreset[] = [...TINTED_PRESETS, ...CALM_PRESETS];

/**
 * Акценты, убранные из палитры, и их прежние оттенки: одни совпадали со
 * статусными цветами, другие дублировали соседей. Нужны только для миграции —
 * эти ключи уже сохранены у сотрудников и организаций, и по оттенку мы
 * подбираем им ближайшую замену.
 */
const REMOVED_ACCENTS: Record<string, string> = {
  chestnut: "#6E2E2A", // Каштановый
  sienna: "#A83524", // Сиена
  rust: "#9D3A10", // Ржавый
  coral: "#AD5000", // Коралловый
  coffee: "#6E4A2A", // Кофейный
  ochre: "#93611F", // Охра
  carrot: "#9D5D04", // Морковный
  brass: "#6E652A", // Латунный
  spring: "#5D7402", // Салатовый
  moss: "#4F6E2A", // Мшистый
  green: "#377C02", // Зелёный
  meadow: "#018018", // Луговой
  polar: "#2A5F6E", // Полярный
  cobalt: "#0371B2", // Кобальтовый
  midnight: "#2A2A6E", // Полуночный
  grape: "#4D109D", // Виноградный
  plum: "#592A6E", // Сливовый
  orchid: "#A13BAB", // Орхидея
  blackberry: "#6E2A5F", // Ежевичный
  magenta: "#AF3393", // Маджента
  pink: "#B52F86", // Розовый
  marsala: "#6E2A48", // Марсала
  cherry: "#C2285B", // Вишнёвый
  garnet: "#A82435", // Гранатовый
  red: "#C52A39", // Красный
  brick: "#C23502", // Кирпичный
  mint: "#027C5A", // Мятный
  seagreen: "#007B63", // Морская волна
  turquoise: "#027A6B", // Бирюзовый
  aquamarine: "#037972", // Аквамарин
  cyan: "#047878", // Циан
  lagoon: "#02787E", // Лагунный
  blue: "#016CC3", // Синий
  royal: "#1B68DA", // Королевский синий
  ultramarine: "#3B62DB", // Ультрамарин
  indigo: "#505DDA", // Индиго
  iris: "#6058D8", // Ирисовый
  viola: "#6E53D4", // Фиалковый
  violet: "#7A4ECF", // Фиолетовый
  lilac: "#8549C8", // Лиловый
  pumpkin: "#976100", // Тыквенный
  honey: "#876601", // Медовый
  olive: "#7A6D02", // Оливковый
  lime: "#6A7301", // Лаймовый
  azure: "#02768B", // Лазурный
  steelblue: "#00769D", // Стальной
  amethyst: "#9940B6", // Аметистовый
};

/**
 * Акцент по умолчанию — «Сапфировый». Прежний дефолт «Ирисовый» из палитры
 * ушёл: он почти совпадал со статусом «частично оплачено» (ΔE 8).
 */
export const DEFAULT_ACCENT_ID = "sapphire";

const BY_ID = new Map(ACCENT_PRESETS.map((p) => [p.id, p]));

/** Пресет по ключу; неизвестный ключ отдаёт дефолтный акцент, а не undefined. */
export const getAccentPreset = (id: string | null | undefined): AccentPreset =>
  (id ? BY_ID.get(id) : undefined) ?? BY_ID.get(DEFAULT_ACCENT_ID)!;

/** Токены выбранного акцента для конкретного режима. */
export const getAccentTokens = (
  id: string | null | undefined,
  mode: "light" | "dark",
): AccentTokens => getAccentPreset(id)[mode];

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
};

/** Ближайший акцент палитры к произвольному цвету. */
const nearestAccentId = (hex: string): string => {
  const [r, g, b] = hexToRgb(hex);
  let bestId = DEFAULT_ACCENT_ID;
  let bestDist = Infinity;
  for (const preset of ACCENT_PRESETS) {
    const [pr, pg, pb] = hexToRgb(preset.light.accent);
    const dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      bestId = preset.id;
    }
  }
  return bestId;
};

/**
 * Приводит сохранённое значение к ключу пресета.
 *
 * Нужно для миграции: в настройках сотрудников и в `themeConfig` организаций
 * лежит либо хекс старой палитры (`#5b5bd6`), либо ключ акцента, которого уже
 * нет (`iris`). И то и другое переводим в ближайший оттенок, чтобы после
 * релиза тема не «прыгнула» на дефолтную.
 */
export const resolveAccentId = (value: string | null | undefined): string => {
  if (!value) return DEFAULT_ACCENT_ID;
  if (BY_ID.has(value)) return value;
  const removed = REMOVED_ACCENTS[value];
  if (removed) return nearestAccentId(removed);
  if (!/^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(value)) return DEFAULT_ACCENT_ID;
  return nearestAccentId(value);
};
