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
 * 50 акцентов по кругу цветового тона; замыкает список нейтральный
 * «Графитовый» — он вне круга и нужен тем, кто сознательно отказывается от
 * цвета.
 */
export const ACCENT_PRESETS: AccentPreset[] = [
  {
    id: "chestnut",
    name: "Каштановый",
    light: { accent: "#6E2E2A", accentBg: "#FAE8E7", accentFg: "#FFFFFF", page: "#FAEBEB", surface: "#FDFBFB", border: "#E0D4D3" },
    dark: { accent: "#C78682", accentBg: "#382827", accentFg: "#130909", page: "#130909", surface: "#1C1414", border: "#312E2E" },
  },
  {
    id: "tomato",
    name: "Томатный",
    light: { accent: "#C52D23", accentBg: "#FEEBE8", accentFg: "#FFFFFF", page: "#FEEEEC", surface: "#FEFBFB", border: "#F0D1CC" },
    dark: { accent: "#FF9688", accentBg: "#4D2621", accentFg: "#1A0907", page: "#1A0907", surface: "#271310", border: "#422825" },
  },
  {
    id: "sienna",
    name: "Сиена",
    light: { accent: "#A83524", accentBg: "#FCE8E5", accentFg: "#FFFFFF", page: "#FCECE9", surface: "#FEFBFA", border: "#E3D2D0" },
    dark: { accent: "#E4A399", accentBg: "#3C2623", accentFg: "#150907", page: "#150907", surface: "#1E1312", border: "#352B2A" },
  },
  {
    id: "rust",
    name: "Ржавый",
    light: { accent: "#9D3A10", accentBg: "#FEEBE3", accentFg: "#FFFFFF", page: "#FEEEE7", surface: "#FEFBFA", border: "#E9D3CA" },
    dark: { accent: "#E59979", accentBg: "#44271B", accentFg: "#170A05", page: "#170A05", surface: "#22140E", border: "#3C2A23" },
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
    id: "coffee",
    name: "Кофейный",
    light: { accent: "#6E4A2A", accentBg: "#FAF0E7", accentFg: "#FFFFFF", page: "#FAF2EB", surface: "#FDFCFB", border: "#E0D9D3" },
    dark: { accent: "#C7A282", accentBg: "#382F27", accentFg: "#130E09", page: "#130E09", surface: "#1C1814", border: "#312F2E" },
  },
  {
    id: "orange",
    name: "Оранжевый",
    light: { accent: "#A55700", accentBg: "#FFECDF", accentFg: "#FFFFFF", page: "#FFEFE4", surface: "#FEFBF9", border: "#ECD4C3" },
    dark: { accent: "#FA9F55", accentBg: "#492A11", accentFg: "#180A02", page: "#180A02", surface: "#251509", border: "#402B1C" },
  },
  {
    id: "ochre",
    name: "Охра",
    light: { accent: "#93611F", accentBg: "#FCF2E5", accentFg: "#FFFFFF", page: "#FCF4E9", surface: "#FEFCFA", border: "#E3DBD0" },
    dark: { accent: "#E4C399", accentBg: "#3C3123", accentFg: "#150F07", page: "#150F07", surface: "#1E1912", border: "#35302A" },
  },
  {
    id: "carrot",
    name: "Морковный",
    light: { accent: "#9D5D04", accentBg: "#FFEDDC", accentFg: "#FFFFFF", page: "#FEF0E2", surface: "#FEFBF8", border: "#EAD5C2" },
    dark: { accent: "#F4A34C", accentBg: "#482C0D", accentFg: "#180B01", page: "#180B01", surface: "#241608", border: "#3E2C1A" },
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
    id: "brass",
    name: "Латунный",
    light: { accent: "#6E652A", accentBg: "#FAF8E7", accentFg: "#FFFFFF", page: "#FAF8EB", surface: "#FDFDFB", border: "#E0DED3" },
    dark: { accent: "#C7BE82", accentBg: "#383527", accentFg: "#131209", page: "#131209", surface: "#1C1B14", border: "#31312E" },
  },
  {
    id: "khaki",
    name: "Хаки",
    light: { accent: "#737001", accentBg: "#F2F2D8", accentFg: "#FFFFFF", page: "#F4F4E2", surface: "#FCFCF7", border: "#DBDBC1" },
    dark: { accent: "#C0BE46", accentBg: "#36350B", accentFg: "#100F01", page: "#100F01", surface: "#1B1B07", border: "#323219" },
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
    id: "moss",
    name: "Мшистый",
    light: { accent: "#4F6E2A", accentBg: "#F1FAE7", accentFg: "#FFFFFF", page: "#F3FAEB", surface: "#FCFDFB", border: "#DAE0D3" },
    dark: { accent: "#A7C782", accentBg: "#303827", accentFg: "#0E1309", page: "#0E1309", surface: "#181C14", border: "#30312E" },
  },
  {
    id: "green",
    name: "Зелёный",
    light: { accent: "#377C02", accentBg: "#E6F6DF", accentFg: "#FFFFFF", page: "#EBF7E7", surface: "#FAFDF8", border: "#CFDFC8" },
    dark: { accent: "#8CCC70", accentBg: "#243A1A", accentFg: "#081104", page: "#081104", surface: "#121D0D", border: "#273521" },
  },
  {
    id: "forest",
    name: "Лесной",
    light: { accent: "#2A6E34", accentBg: "#E7FAEA", accentFg: "#FFFFFF", page: "#EBFAED", surface: "#FBFDFB", border: "#D3E0D5" },
    dark: { accent: "#82C78D", accentBg: "#27382A", accentFg: "#09130A", page: "#09130A", surface: "#141C15", border: "#2E312E" },
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
    id: "polar",
    name: "Полярный",
    light: { accent: "#2A5F6E", accentBg: "#E7F6FA", accentFg: "#FFFFFF", page: "#EBF7FA", surface: "#FBFDFD", border: "#D3DDE0" },
    dark: { accent: "#82B7C7", accentBg: "#273438", accentFg: "#091113", page: "#091113", surface: "#141A1C", border: "#2E3131" },
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
    id: "midnight",
    name: "Полуночный",
    light: { accent: "#2A2A6E", accentBg: "#E7E7FA", accentFg: "#FFFFFF", page: "#EBEBFA", surface: "#FBFBFD", border: "#D3D3E0" },
    dark: { accent: "#8D8DCC", accentBg: "#272738", accentFg: "#090913", page: "#090913", surface: "#14141C", border: "#2E2E31" },
  },
  {
    id: "ultraviolet",
    name: "Ультрафиолет",
    light: { accent: "#4C17C9", accentBg: "#ECE4FD", accentFg: "#FFFFFF", page: "#EEE8FD", surface: "#FBFAFE", border: "#D4CDE6" },
    dark: { accent: "#BAA3EE", accentBg: "#291F40", accentFg: "#0B0616", page: "#0B0616", surface: "#151020", border: "#2C2639" },
  },
  {
    id: "grape",
    name: "Виноградный",
    light: { accent: "#4D109D", accentBg: "#EFE3FE", accentFg: "#FFFFFF", page: "#F1E7FE", surface: "#FCFAFE", border: "#D7CAE9" },
    dark: { accent: "#A879E5", accentBg: "#2D1B44", accentFg: "#0D0517", page: "#0D0517", surface: "#170E22", border: "#2E233C" },
  },
  {
    id: "purple",
    name: "Пурпурный",
    light: { accent: "#9044BF", accentBg: "#F6ECFE", accentFg: "#FFFFFF", page: "#F7EEFF", surface: "#FDFBFE", border: "#E0D3EB" },
    dark: { accent: "#D29DFA", accentBg: "#3C2A4A", accentFg: "#120A19", page: "#120A19", surface: "#1E1525", border: "#362B40" },
  },
  {
    id: "plum",
    name: "Сливовый",
    light: { accent: "#592A6E", accentBg: "#F4E7FA", accentFg: "#FFFFFF", page: "#F5EBFA", surface: "#FCFBFD", border: "#DCD3E0" },
    dark: { accent: "#B282C7", accentBg: "#322738", accentFg: "#100913", page: "#100913", surface: "#19141C", border: "#302E31" },
  },
  {
    id: "mulberry",
    name: "Шелковичный",
    light: { accent: "#83109D", accentBg: "#F9E3FE", accentFg: "#FFFFFF", page: "#FAE7FE", surface: "#FDFAFE", border: "#E3CAE9" },
    dark: { accent: "#D179E5", accentBg: "#3C1B44", accentFg: "#140517", page: "#140517", surface: "#1E0E22", border: "#38233C" },
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
    id: "blackberry",
    name: "Ежевичный",
    light: { accent: "#6E2A5F", accentBg: "#FAE7F6", accentFg: "#FFFFFF", page: "#FAEBF7", surface: "#FDFBFD", border: "#E0D3DD" },
    dark: { accent: "#C782B7", accentBg: "#382734", accentFg: "#130911", page: "#130911", surface: "#1C141A", border: "#312E31" },
  },
  {
    id: "magenta",
    name: "Маджента",
    light: { accent: "#AF3393", accentBg: "#FEE9F7", accentFg: "#FFFFFF", page: "#FEEDF8", surface: "#FEFAFD", border: "#EAD1E1" },
    dark: { accent: "#F193D6", accentBg: "#46263D", accentFg: "#170913", page: "#170913", surface: "#24131F", border: "#3E2837" },
  },
  {
    id: "cyclamen",
    name: "Цикламен",
    light: { accent: "#C0168D", accentBg: "#FDE4F5", accentFg: "#FFFFFF", page: "#FDE8F7", surface: "#FEFAFD", border: "#E6CDDF" },
    dark: { accent: "#EEA3D7", accentBg: "#401F36", accentFg: "#160611", page: "#160611", surface: "#20101B", border: "#392633" },
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
    id: "marsala",
    name: "Марсала",
    light: { accent: "#6E2A48", accentBg: "#FAE7EF", accentFg: "#FFFFFF", page: "#FAEBF1", surface: "#FDFBFC", border: "#E0D3D9" },
    dark: { accent: "#C782A0", accentBg: "#38272E", accentFg: "#13090D", page: "#13090D", surface: "#1C1417", border: "#312E2F" },
  },
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
    id: "garnet",
    name: "Гранатовый",
    light: { accent: "#A82435", accentBg: "#FCE5E8", accentFg: "#FFFFFF", page: "#FCE9EC", surface: "#FEFAFB", border: "#E3D0D2" },
    dark: { accent: "#E499A3", accentBg: "#3C2326", accentFg: "#150709", page: "#150709", surface: "#1E1213", border: "#352A2B" },
  },
  {
    id: "red",
    name: "Красный",
    light: { accent: "#C52A39", accentBg: "#FEEBEA", accentFg: "#FFFFFF", page: "#FFEEED", surface: "#FEFBFB", border: "#F0D1CF" },
    dark: { accent: "#FF9593", accentBg: "#4D2525", accentFg: "#1A0808", page: "#1A0808", surface: "#271312", border: "#422827" },
  },
  {
    id: "graphite",
    name: "Графитовый",
    light: { accent: "#4A5A70", accentBg: "#E7EBF1", accentFg: "#FFFFFF", page: "#EFF2F6", surface: "#FBFCFD", border: "#D5DBE4" },
    dark: { accent: "#A7B6CC", accentBg: "#2C3542", accentFg: "#0D1116", page: "#0D1116", surface: "#171C24", border: "#2E3542" },
  },
];

/**
 * Акценты, убранные из палитры, и их прежние оттенки: одни совпадали со
 * статусными цветами, другие дублировали соседей. Нужны только для миграции —
 * эти ключи уже сохранены у сотрудников и организаций, и по оттенку мы
 * подбираем им ближайшую замену.
 */
const REMOVED_ACCENTS: Record<string, string> = {
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
