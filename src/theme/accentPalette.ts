/**
 * Акцентная палитра приложения.
 *
 * Отличие от прежней модели «один хекс на обе темы»: акцент здесь — СВЯЗКА
 * токенов, и она своя для светлой и тёмной темы. Акцент тянет за собой фон
 * страницы, цвет карточек и границы, поэтому интерфейс получается тонированным
 * под выбранный цвет, а не «цветная кнопка на сером фоне».
 *
 * Каждая пара (accent × поверхность) проверена на контраст: accent как текст на
 * surface, accent как текст на accentBg и accentFg на заливке accent — везде
 * не ниже 4.5:1 (WCAG AA). Правя значения, прогоняй `npm run test -- accentPalette`.
 */

/** Шесть цветов, из которых собирается тема для одного режима (день/ночь). */
export type AccentTokens = {
  /** Основной акцент: заливка кнопок, активные состояния, ссылки. */
  accent: string;
  /**
   * Непрозрачный фон под акцентом: чипы, активный пункт меню, дорожка прогресса.
   * Именно непрозрачный, а не alpha(accent): полупрозрачная подложка «плывёт»
   * поверх цветных строк таблиц и выделения.
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
 * Акценты, отсортированные по кругу цветового тона; замыкает список нейтральный
 * «Графитовый» — он вне круга и добавлен нами: в прежней палитре нейтральных
 * оттенка было два («Графит», «Сталь»), и без него выбор тех, кто сознательно
 * отказался от цвета, мигрировал бы в бирюзу.
 */
export const ACCENT_PRESETS: AccentPreset[] = [
  {
    id: "crimson",
    name: "Малиновый",
    light: { accent: "#BE296A", accentBg: "#FEEAEF", accentFg: "#FFFFFF", page: "#FFEDF2", surface: "#FFFAFC", border: "#EED0D8" },
    dark: { accent: "#FF8FB4", accentBg: "#4B2532", accentFg: "#19080E", page: "#19080E", surface: "#261319", border: "#41282F" },
  },
  {
    id: "cherry",
    name: "Вишнёвый",
    light: { accent: "#C2285B", accentBg: "#FFEAED", accentFg: "#FFFFFF", page: "#FEEEF0", surface: "#FFFAFB", border: "#EFD0D5" },
    dark: { accent: "#FF91A8", accentBg: "#4C252D", accentFg: "#1A080C", page: "#1A080C", surface: "#271317", border: "#42282D" },
  },
  {
    id: "scarlet",
    name: "Алый",
    light: { accent: "#C4284B", accentBg: "#FEEBEC", accentFg: "#FFFFFF", page: "#FEEEEF", surface: "#FEFBFB", border: "#EFD0D2" },
    dark: { accent: "#FF939D", accentBg: "#4D2529", accentFg: "#1A080A", page: "#1A080A", surface: "#271314", border: "#42282A" },
  },
  {
    id: "red",
    name: "Красный",
    light: { accent: "#C52A39", accentBg: "#FEEBEA", accentFg: "#FFFFFF", page: "#FFEEED", surface: "#FEFBFB", border: "#F0D1CF" },
    dark: { accent: "#FF9593", accentBg: "#4D2525", accentFg: "#1A0808", page: "#1A0808", surface: "#271312", border: "#422827" },
  },
  {
    id: "tomato",
    name: "Томатный",
    light: { accent: "#C52D23", accentBg: "#FEEBE8", accentFg: "#FFFFFF", page: "#FEEEEC", surface: "#FEFBFB", border: "#F0D1CC" },
    dark: { accent: "#FF9688", accentBg: "#4D2621", accentFg: "#1A0907", page: "#1A0907", surface: "#271310", border: "#422825" },
  },
  {
    id: "brick",
    name: "Кирпичный",
    light: { accent: "#C23502", accentBg: "#FEECE7", accentFg: "#FFFFFF", page: "#FEEFEA", surface: "#FFFBF9", border: "#EFD2C9" },
    dark: { accent: "#FE987C", accentBg: "#4D271D", accentFg: "#1A0905", page: "#1A0905", surface: "#27140E", border: "#422922" },
  },
  {
    id: "terracotta",
    name: "Терракотовый",
    light: { accent: "#B74600", accentBg: "#FFECE4", accentFg: "#FFFFFF", page: "#FFEFE8", surface: "#FFFBF9", border: "#EED2C7" },
    dark: { accent: "#FE996F", accentBg: "#4C2818", accentFg: "#1A0904", page: "#1A0904", surface: "#27140C", border: "#422A20" },
  },
  {
    id: "coral",
    name: "Коралловый",
    light: { accent: "#AD5000", accentBg: "#FFECE2", accentFg: "#FFFFFF", page: "#FEEFE7", surface: "#FFFBF9", border: "#EDD3C5" },
    dark: { accent: "#FE9B60", accentBg: "#4B2914", accentFg: "#190A03", page: "#190A03", surface: "#26150A", border: "#412A1E" },
  },
  {
    id: "orange",
    name: "Оранжевый",
    light: { accent: "#A55700", accentBg: "#FFECDF", accentFg: "#FFFFFF", page: "#FFEFE4", surface: "#FEFBF9", border: "#ECD4C3" },
    dark: { accent: "#FA9F55", accentBg: "#492A11", accentFg: "#180A02", page: "#180A02", surface: "#251509", border: "#402B1C" },
  },
  {
    id: "carrot",
    name: "Морковный",
    light: { accent: "#9D5D04", accentBg: "#FFEDDC", accentFg: "#FFFFFF", page: "#FEF0E2", surface: "#FEFBF8", border: "#EAD5C2" },
    dark: { accent: "#F4A34C", accentBg: "#482C0D", accentFg: "#180B01", page: "#180B01", surface: "#241608", border: "#3E2C1A" },
  },
  {
    id: "pumpkin",
    name: "Тыквенный",
    light: { accent: "#976100", accentBg: "#FFEDD9", accentFg: "#FFFFFF", page: "#FDF0E1", surface: "#FFFBF7", border: "#E8D6C1" },
    dark: { accent: "#EEA743", accentBg: "#452D0A", accentFg: "#170C01", page: "#170C01", surface: "#231707", border: "#3D2D19" },
  },
  {
    id: "amber",
    name: "Янтарный",
    light: { accent: "#8D6300", accentBg: "#FDEED6", accentFg: "#FFFFFF", page: "#FBF1E1", surface: "#FEFBF7", border: "#E6D7C0" },
    dark: { accent: "#E7AC3E", accentBg: "#432F08", accentFg: "#160C01", page: "#160C01", surface: "#221706", border: "#3B2E18" },
  },
  {
    id: "honey",
    name: "Медовый",
    light: { accent: "#876601", accentBg: "#FBEFD6", accentFg: "#FFFFFF", page: "#FAF2E1", surface: "#FEFCF7", border: "#E3D8C0" },
    dark: { accent: "#DFB03A", accentBg: "#403007", accentFg: "#140D01", page: "#140D01", surface: "#201806", border: "#392F18" },
  },
  {
    id: "mustard",
    name: "Горчичный",
    light: { accent: "#816A02", accentBg: "#F8F0D6", accentFg: "#FFFFFF", page: "#F8F3E1", surface: "#FDFCF7", border: "#E1D9C0" },
    dark: { accent: "#D5B53B", accentBg: "#3D3207", accentFg: "#130E01", page: "#130E01", surface: "#1F1906", border: "#373018" },
  },
  {
    id: "olive",
    name: "Оливковый",
    light: { accent: "#7A6D02", accentBg: "#F5F1D7", accentFg: "#FFFFFF", page: "#F6F3E1", surface: "#FDFCF7", border: "#DEDAC0" },
    dark: { accent: "#CBB93F", accentBg: "#3A3308", accentFg: "#110F01", page: "#110F01", surface: "#1D1A06", border: "#353118" },
  },
  {
    id: "khaki",
    name: "Хаки",
    light: { accent: "#737001", accentBg: "#F2F2D8", accentFg: "#FFFFFF", page: "#F4F4E2", surface: "#FCFCF7", border: "#DBDBC1" },
    dark: { accent: "#C0BE46", accentBg: "#36350B", accentFg: "#100F01", page: "#100F01", surface: "#1B1B07", border: "#323219" },
  },
  {
    id: "lime",
    name: "Лаймовый",
    light: { accent: "#6A7301", accentBg: "#EFF3D9", accentFg: "#FFFFFF", page: "#F1F5E3", surface: "#FBFCF7", border: "#D8DCC2" },
    dark: { accent: "#B4C24E", accentBg: "#32360E", accentFg: "#0E1002", page: "#0E1002", surface: "#191B08", border: "#2F331B" },
  },
  {
    id: "spring",
    name: "Салатовый",
    light: { accent: "#5D7402", accentBg: "#ECF4DB", accentFg: "#FFFFFF", page: "#EFF5E4", surface: "#FBFDF7", border: "#D5DDC4" },
    dark: { accent: "#A8C559", accentBg: "#2D3812", accentFg: "#0C1002", page: "#0C1002", surface: "#171C09", border: "#2D341C" },
  },
  {
    id: "grass",
    name: "Травяной",
    light: { accent: "#4E7703", accentBg: "#E9F5DD", accentFg: "#FFFFFF", page: "#EDF6E5", surface: "#FAFDF8", border: "#D2DEC6" },
    dark: { accent: "#9AC964", accentBg: "#293916", accentFg: "#0A1103", page: "#0A1103", surface: "#141D0B", border: "#2A341E" },
  },
  {
    id: "green",
    name: "Зелёный",
    light: { accent: "#377C02", accentBg: "#E6F6DF", accentFg: "#FFFFFF", page: "#EBF7E7", surface: "#FAFDF8", border: "#CFDFC8" },
    dark: { accent: "#8CCC70", accentBg: "#243A1A", accentFg: "#081104", page: "#081104", surface: "#121D0D", border: "#273521" },
  },
  {
    id: "meadow",
    name: "Луговой",
    light: { accent: "#018018", accentBg: "#E3F7E2", accentFg: "#FFFFFF", page: "#E9F7E9", surface: "#F9FDF9", border: "#CCE0CB" },
    dark: { accent: "#7CCE7C", accentBg: "#1E3B1E", accentFg: "#061206", page: "#061206", surface: "#0F1E0F", border: "#243623" },
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
    id: "mint",
    name: "Мятный",
    light: { accent: "#027C5A", accentBg: "#DBF8EB", accentFg: "#FFFFFF", page: "#E4F8EF", surface: "#F8FDFB", border: "#C5E1D4" },
    dark: { accent: "#47D3A2", accentBg: "#0A3C2B", accentFg: "#01130B", page: "#01130B", surface: "#081E16", border: "#1B372B" },
  },
  {
    id: "seagreen",
    name: "Морская волна",
    light: { accent: "#007B63", accentBg: "#DAF8EE", accentFg: "#FFFFFF", page: "#E3F8F1", surface: "#F7FDFB", border: "#C3E1D7" },
    dark: { accent: "#31D4AE", accentBg: "#033D30", accentFg: "#00130D", page: "#00130D", surface: "#061E18", border: "#19372E" },
  },
  {
    id: "turquoise",
    name: "Бирюзовый",
    light: { accent: "#027A6B", accentBg: "#D8F8F1", accentFg: "#FFFFFF", page: "#E2F8F3", surface: "#F7FDFC", border: "#C1E1DA" },
    dark: { accent: "#0FD4BB", accentBg: "#003C34", accentFg: "#00130F", page: "#00130F", surface: "#041E1A", border: "#163731" },
  },
  {
    id: "aquamarine",
    name: "Аквамарин",
    light: { accent: "#037972", accentBg: "#D7F8F4", accentFg: "#FFFFFF", page: "#E1F8F5", surface: "#F7FDFC", border: "#C0E1DD" },
    dark: { accent: "#01D3C6", accentBg: "#003C38", accentFg: "#001311", page: "#001311", surface: "#031E1C", border: "#153734" },
  },
  {
    id: "cyan",
    name: "Циан",
    light: { accent: "#047878", accentBg: "#D6F8F7", accentFg: "#FFFFFF", page: "#E1F8F7", surface: "#F7FDFD", border: "#C0E1E0" },
    dark: { accent: "#0DD1D1", accentBg: "#013B3B", accentFg: "#001212", page: "#001212", surface: "#021E1E", border: "#143736" },
  },
  {
    id: "lagoon",
    name: "Лагунный",
    light: { accent: "#02787E", accentBg: "#D6F8FA", accentFg: "#FFFFFF", page: "#E1F8F9", surface: "#F7FDFE", border: "#BFE1E3" },
    dark: { accent: "#07D0DB", accentBg: "#013B3E", accentFg: "#001214", page: "#001214", surface: "#021E20", border: "#143639" },
  },
  {
    id: "sky",
    name: "Небесный",
    light: { accent: "#087684", accentBg: "#D6F7FD", accentFg: "#FFFFFF", page: "#E1F7FB", surface: "#F7FDFE", border: "#C0E0E5" },
    dark: { accent: "#04CEE5", accentBg: "#003A42", accentFg: "#001215", page: "#001215", surface: "#031E22", border: "#14363B" },
  },
  {
    id: "azure",
    name: "Лазурный",
    light: { accent: "#02768B", accentBg: "#D8F6FE", accentFg: "#FFFFFF", page: "#E1F7FD", surface: "#F7FDFF", border: "#C0DFE8" },
    dark: { accent: "#05CCEF", accentBg: "#013A45", accentFg: "#001217", page: "#001217", surface: "#031D23", border: "#15353D" },
  },
  {
    id: "lightblue",
    name: "Голубой",
    light: { accent: "#047795", accentBg: "#DCF5FF", accentFg: "#FFFFFF", page: "#E2F6FE", surface: "#F8FDFE", border: "#C1DFEA" },
    dark: { accent: "#22CAF8", accentBg: "#003949", accentFg: "#001118", page: "#001118", surface: "#051D25", border: "#17353F" },
  },
  {
    id: "steelblue",
    name: "Стальной",
    light: { accent: "#00769D", accentBg: "#E0F4FE", accentFg: "#FFFFFF", page: "#E4F6FF", surface: "#F9FCFF", border: "#C3DEEC" },
    dark: { accent: "#3FC7FF", accentBg: "#06384C", accentFg: "#001119", page: "#001119", surface: "#061C26", border: "#193441" },
  },
  {
    id: "cornflower",
    name: "Васильковый",
    light: { accent: "#0374A6", accentBg: "#E3F3FE", accentFg: "#FFFFFF", page: "#E7F5FF", surface: "#F9FCFF", border: "#C5DDEE" },
    dark: { accent: "#5FC3FE", accentBg: "#0E374E", accentFg: "#02101A", page: "#02101A", surface: "#081C27", border: "#1C3342" },
  },
  {
    id: "cobalt",
    name: "Кобальтовый",
    light: { accent: "#0371B2", accentBg: "#E4F2FF", accentFg: "#FFFFFF", page: "#E9F4FE", surface: "#F9FCFF", border: "#C7DCEF" },
    dark: { accent: "#71BFFF", accentBg: "#14364F", accentFg: "#03101B", page: "#03101B", surface: "#0B1B28", border: "#1E3243" },
  },
  {
    id: "blue",
    name: "Синий",
    light: { accent: "#016CC3", accentBg: "#E6F1FE", accentFg: "#FFFFFF", page: "#EAF4FF", surface: "#FAFCFE", border: "#C9DBF0" },
    dark: { accent: "#80BCFE", accentBg: "#1A3450", accentFg: "#040F1C", page: "#040F1C", surface: "#0D1A29", border: "#213244" },
  },
  {
    id: "royal",
    name: "Королевский синий",
    light: { accent: "#1B68DA", accentBg: "#E8F1FF", accentFg: "#FFFFFF", page: "#EBF3FF", surface: "#FAFCFE", border: "#CCDAF1" },
    dark: { accent: "#8CB9FF", accentBg: "#203351", accentFg: "#060E1C", page: "#060E1C", surface: "#101A29", border: "#243145" },
  },
  {
    id: "ultramarine",
    name: "Ультрамарин",
    light: { accent: "#3B62DB", accentBg: "#EAF0FF", accentFg: "#FFFFFF", page: "#EDF2FE", surface: "#FBFCFE", border: "#CED9F1" },
    dark: { accent: "#97B6FE", accentBg: "#253151", accentFg: "#080E1C", page: "#080E1C", surface: "#121929", border: "#273045" },
  },
  {
    id: "indigo",
    name: "Индиго",
    light: { accent: "#505DDA", accentBg: "#EBF0FF", accentFg: "#FFFFFF", page: "#EEF2FF", surface: "#FBFCFE", border: "#D1D8F1" },
    dark: { accent: "#A1B2FE", accentBg: "#293051", accentFg: "#0A0D1C", page: "#0A0D1C", surface: "#141829", border: "#2A2F45" },
  },
  {
    id: "iris",
    name: "Ирисовый",
    light: { accent: "#6058D8", accentBg: "#EDEFFE", accentFg: "#FFFFFF", page: "#F0F1FF", surface: "#FBFBFE", border: "#D4D7F0" },
    dark: { accent: "#AAAFFF", accentBg: "#2D2F51", accentFg: "#0C0C1C", page: "#0C0C1C", surface: "#171729", border: "#2C2E44" },
  },
  {
    id: "viola",
    name: "Фиалковый",
    light: { accent: "#6E53D4", accentBg: "#EFEEFE", accentFg: "#FFFFFF", page: "#F1F1FE", surface: "#FBFBFF", border: "#D7D6F0" },
    dark: { accent: "#B4ABFF", accentBg: "#312D50", accentFg: "#0E0C1B", page: "#0E0C1B", surface: "#191728", border: "#2F2D44" },
  },
  {
    id: "violet",
    name: "Фиолетовый",
    light: { accent: "#7A4ECF", accentBg: "#F1EDFE", accentFg: "#FFFFFF", page: "#F3F0FF", surface: "#FCFBFF", border: "#DAD5EE" },
    dark: { accent: "#BDA7FE", accentBg: "#352C4E", accentFg: "#0F0B1B", page: "#0F0B1B", surface: "#1B1627", border: "#322C43" },
  },
  {
    id: "lilac",
    name: "Лиловый",
    light: { accent: "#8549C8", accentBg: "#F3EDFF", accentFg: "#FFFFFF", page: "#F5F0FE", surface: "#FCFBFF", border: "#DDD4ED" },
    dark: { accent: "#C8A2FE", accentBg: "#392B4C", accentFg: "#110B1A", page: "#110B1A", surface: "#1C1526", border: "#342B41" },
  },
  {
    id: "purple",
    name: "Пурпурный",
    light: { accent: "#9044BF", accentBg: "#F6ECFE", accentFg: "#FFFFFF", page: "#F7EEFF", surface: "#FDFBFE", border: "#E0D3EB" },
    dark: { accent: "#D29DFA", accentBg: "#3C2A4A", accentFg: "#120A19", page: "#120A19", surface: "#1E1525", border: "#362B40" },
  },
  {
    id: "amethyst",
    name: "Аметистовый",
    light: { accent: "#9940B6", accentBg: "#F9EAFE", accentFg: "#FFFFFF", page: "#F9EEFE", surface: "#FEFAFF", border: "#E3D2E9" },
    dark: { accent: "#DB9AF3", accentBg: "#3F2947", accentFg: "#140A17", page: "#140A17", surface: "#201424", border: "#392A3E" },
  },
  {
    id: "orchid",
    name: "Орхидея",
    light: { accent: "#A13BAB", accentBg: "#FDE9FE", accentFg: "#FFFFFF", page: "#FBEDFC", surface: "#FEFAFE", border: "#E5D2E6" },
    dark: { accent: "#E397EA", accentBg: "#422844", accentFg: "#150916", page: "#150916", surface: "#211422", border: "#3A293C" },
  },
  {
    id: "fuchsia",
    name: "Фуксия",
    light: { accent: "#A937A0", accentBg: "#FFE8FB", accentFg: "#FFFFFF", page: "#FDEDFA", surface: "#FFFAFE", border: "#E7D1E4" },
    dark: { accent: "#EA95E0", accentBg: "#442741", accentFg: "#160915", page: "#160915", surface: "#221321", border: "#3C293A" },
  },
  {
    id: "magenta",
    name: "Маджента",
    light: { accent: "#AF3393", accentBg: "#FEE9F7", accentFg: "#FFFFFF", page: "#FEEDF8", surface: "#FEFAFD", border: "#EAD1E1" },
    dark: { accent: "#F193D6", accentBg: "#46263D", accentFg: "#170913", page: "#170913", surface: "#24131F", border: "#3E2837" },
  },
  {
    id: "pink",
    name: "Розовый",
    light: { accent: "#B52F86", accentBg: "#FFE9F4", accentFg: "#FFFFFF", page: "#FEEDF6", surface: "#FEFAFC", border: "#EBD0DE" },
    dark: { accent: "#F691CB", accentBg: "#482539", accentFg: "#180811", page: "#180811", surface: "#25131D", border: "#3F2835" },
  },
  {
    id: "peony",
    name: "Пионовый",
    light: { accent: "#BA2C78", accentBg: "#FFEAF2", accentFg: "#FFFFFF", page: "#FEEDF4", surface: "#FFFAFC", border: "#EDD0DB" },
    dark: { accent: "#FB90BF", accentBg: "#4A2536", accentFg: "#190810", page: "#190810", surface: "#26131B", border: "#402832" },
  },
  {
    id: "graphite",
    name: "Графитовый",
    light: { accent: "#4A5A70", accentBg: "#E7EBF1", accentFg: "#FFFFFF", page: "#EFF2F6", surface: "#FBFCFD", border: "#D5DBE4" },
    dark: { accent: "#A7B6CC", accentBg: "#2C3542", accentFg: "#0D1116", page: "#0D1116", surface: "#171C24", border: "#2E3542" },
  },
];

/**
 * Акцент по умолчанию — «Ирисовый». Прежний дефолт был «Ирис» #5b5bd6; в новой
 * палитре ему соответствует iris (#6058D8 в светлой теме), поэтому у тех, кто
 * ничего не менял, цвет остаётся тем же на глаз.
 */
export const DEFAULT_ACCENT_ID = "iris";

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

/**
 * Приводит сохранённое значение к ключу пресета.
 *
 * Нужно для миграции: в настройках сотрудников и в `themeConfig` организаций
 * лежит хекс старой палитры (`#5b5bd6` и т.п.). Подбираем ближайший акцент по
 * светлой теме, чтобы после релиза цвет не «прыгнул» на дефолтный.
 */
export const resolveAccentId = (value: string | null | undefined): string => {
  if (!value) return DEFAULT_ACCENT_ID;
  if (BY_ID.has(value)) return value;
  if (!/^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(value)) return DEFAULT_ACCENT_ID;

  const [r, g, b] = hexToRgb(value);
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
