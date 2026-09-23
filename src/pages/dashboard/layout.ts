import { PAGE_PERMISSIONS } from "../../config/accessPermissions";
import { DEALS_MODULE_ENABLED } from "../../api/deals";
import type { PeriodKey } from "./period";

/**
 * Состав и порядок блоков сводки. Реестр отдельным модулем: страница из него
 * только рисует, а правила «кому виден блок» и «в каком он порядке» живут в
 * одном месте и покрыты тестами.
 *
 * Это же основа настраиваемого главного экрана (задача #232): пользователь
 * прячет и переставляет блоки, выбор хранится у него в браузере.
 */
export type WidgetId =
  | "pulse"
  | "attention"
  | "money"
  | "appointments"
  | "availability"
  | "bookings"
  | "branches"
  | "month"
  | "staff"
  | "ops";

/**
 * 5 и 7 — только ширины по умолчанию (ряд «Операции 7 + Сотрудники 5» из
 * макета). В настройках пользователь выбирает из SPAN_OPTIONS.
 */
export type WidgetSpan = 4 | 5 | 6 | 7 | 8 | 12;

export interface WidgetMeta {
  id: WidgetId;
  /** Подпись в настройках состава. */
  label: string;
  /** Право (или любое из списка), без которого блок не показывается вовсе. */
  permission: string | string[];
  /** Ширина по умолчанию на широком экране, в колонках сетки из 12. */
  span: WidgetSpan;
  /** Блок имеет смысл только на этом периоде. */
  onlyPeriod?: PeriodKey;
  /** Блоку нужно больше одного филиала — иначе сравнивать не с чем. */
  needsManyBranches?: boolean;
}

/**
 * Порядок по умолчанию — по тому, как владелец читает экран утром:
 * 1. «Пульс» — сколько заработали и куда идёт месяц (единственная крупная цифра);
 * 2. «Требует внимания» — что решить сегодня, из всех разделов одним списком;
 * 3. разбор денег и потока записей — почему цифра такая;
 * 4. операционка «сейчас» (задачи, воронка, отзывы) и люди;
 * 5. справочное: филиалы, месяц целиком.
 *
 * Ряды на широком экране: 8+4 · 6+6 · 7+5 · 12 · 12.
 */
export const WIDGETS: WidgetMeta[] = [
  { id: "pulse", label: "Пульс: выручка и темп", permission: PAGE_PERMISSIONS.cashbox, span: 8 },
  {
    id: "attention",
    label: "Требует внимания",
    // Блок собирает сигналы из всех разделов — нужен доступ хотя бы к одному.
    permission: [
      PAGE_PERMISSIONS.cashbox,
      PAGE_PERMISSIONS.reports,
      PAGE_PERMISSIONS.schedule,
      PAGE_PERMISSIONS.tasks,
      ...PAGE_PERMISSIONS.bookings,
      ...PAGE_PERMISSIONS.reviews,
      ...PAGE_PERMISSIONS.deals,
    ],
    span: 4,
  },
  { id: "money", label: "Движение денег", permission: PAGE_PERMISSIONS.cashbox, span: 6 },
  {
    id: "appointments",
    label: "Записи",
    permission: PAGE_PERMISSIONS.appointments,
    span: 6,
  },
  {
    id: "ops",
    label: "Задачи, воронка, отзывы",
    // Секции внутри гейтятся каждая своим правом; карточка нужна, если есть
    // хотя бы одна.
    permission: [PAGE_PERMISSIONS.tasks, ...PAGE_PERMISSIONS.deals, ...PAGE_PERMISSIONS.reviews],
    span: 7,
  },
  {
    id: "staff",
    label: "Сотрудники",
    permission: PAGE_PERMISSIONS.payroll,
    span: 5,
  },
  {
    id: "branches",
    label: "Филиалы",
    permission: PAGE_PERMISSIONS.cashbox,
    span: 12,
    needsManyBranches: true,
  },
  {
    id: "month",
    label: "Месяц целиком",
    permission: PAGE_PERMISSIONS.reports,
    span: 12,
    onlyPeriod: "month",
  },
  // Подробности того, что уже есть в «Пульсе» (загрузка) и «Требует внимания»
  // (заявки). По умолчанию спрятаны, но их можно вернуть в настройках состава.
  {
    id: "availability",
    label: "Свободны сегодня",
    permission: PAGE_PERMISSIONS.schedule,
    span: 6,
  },
  {
    id: "bookings",
    label: "Заявки с витрины",
    permission: PAGE_PERMISSIONS.bookings,
    span: 6,
  },
];

/** Спрятаны у тех, кто раскладку ещё не настраивал. */
const DEFAULT_HIDDEN: WidgetId[] = ["availability", "bookings"];

const WIDGET_BY_ID = new Map(WIDGETS.map((w) => [w.id, w]));

export interface DashboardLayout {
  order: WidgetId[];
  hidden: WidgetId[];
  /** Личная ширина блока; отсутствие ключа = ширина по умолчанию из реестра. */
  sizes: Partial<Record<WidgetId, WidgetSpan>>;
}

export const SPAN_OPTIONS: { value: WidgetSpan; label: string; hint: string }[] = [
  { value: 4, label: "Узкий", hint: "треть ширины" },
  { value: 6, label: "Средний", hint: "половина ширины" },
  { value: 8, label: "Большой", hint: "две трети ширины" },
  { value: 12, label: "Широкий", hint: "во всю ширину" },
];

export const DEFAULT_LAYOUT: DashboardLayout = {
  order: WIDGETS.map((w) => w.id),
  hidden: DEFAULT_HIDDEN,
  sizes: {},
};

const STORAGE_KEY = "mamadoc:dashboard:layout";

/**
 * Читаем сохранённую раскладку, достраивая её до актуального реестра: новые
 * блоки встают на своё место из реестра, исчезнувшие отбрасываются. Без этого
 * добавление виджета в код не дошло бы до тех, кто хоть раз открывал настройки.
 *
 * «Своё место» — сразу за предыдущим по реестру блоком, который у пользователя
 * уже есть, а если такого нет — перед ближайшим следующим. Так «Пульс» у
 * старой раскладки встаёт перед «Деньгами», а не теряется в конце под десятком
 * карточек.
 */
export function normalizeLayout(saved: Partial<DashboardLayout> | null): DashboardLayout {
  if (!saved) return { order: [...DEFAULT_LAYOUT.order], hidden: [...DEFAULT_HIDDEN], sizes: {} };
  const known = new Set(WIDGETS.map((w) => w.id));
  const registry = WIDGETS.map((w) => w.id);
  const order = (saved.order ?? []).filter((id): id is WidgetId => known.has(id));
  registry.forEach((id, index) => {
    if (order.includes(id)) return;
    const after = registry
      .slice(0, index)
      .reverse()
      .find((prev) => order.includes(prev));
    if (after) {
      order.splice(order.indexOf(after) + 1, 0, id);
      return;
    }
    const before = registry.slice(index + 1).find((next) => order.includes(next));
    if (before) order.splice(order.indexOf(before), 0, id);
    else order.push(id);
  });
  const allowedSpans = new Set(SPAN_OPTIONS.map((o) => o.value));
  const sizes: Partial<Record<WidgetId, WidgetSpan>> = {};
  for (const [id, span] of Object.entries(saved.sizes ?? {})) {
    // Чужие ключи и произвольные числа отбрасываем: раскладка приходит из
    // localStorage, то есть её мог поправить кто угодно.
    if (known.has(id as WidgetId) && allowedSpans.has(span as WidgetSpan)) {
      sizes[id as WidgetId] = span as WidgetSpan;
    }
  }

  return {
    order,
    hidden: (saved.hidden ?? []).filter((id): id is WidgetId => known.has(id)),
    sizes,
  };
}

/** Ширина блока с учётом личной настройки; без неё — из реестра. */
export function resolveSpan(meta: WidgetMeta, layout: DashboardLayout): WidgetSpan {
  return layout.sizes[meta.id] ?? meta.span;
}

/** Задать ширину; выбор «как по умолчанию» стирает ключ, а не пишет то же число. */
export function setSpan(
  layout: DashboardLayout,
  id: WidgetId,
  span: WidgetSpan,
): DashboardLayout {
  const meta = WIDGET_BY_ID.get(id);
  const sizes = { ...layout.sizes };
  if (!meta || meta.span === span) delete sizes[id];
  else sizes[id] = span;
  return { ...layout, sizes };
}

/**
 * Перенести блок на конкретную позицию — то, что нужно перетаскиванию.
 * `moveWidget` меняет местами соседей, а драг переносит через несколько строк.
 */
export function reorderWidget(
  order: WidgetId[],
  id: WidgetId,
  toIndex: number,
): WidgetId[] {
  const from = order.indexOf(id);
  if (from < 0) return order;
  const clamped = Math.max(0, Math.min(order.length - 1, toIndex));
  if (clamped === from) return order;
  const next = [...order];
  next.splice(from, 1);
  next.splice(clamped, 0, id);
  return next;
}

export function loadLayout(): DashboardLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return normalizeLayout(raw ? (JSON.parse(raw) as Partial<DashboardLayout>) : null);
  } catch {
    // Битый JSON или запрет на localStorage не должен ронять главный экран.
    return DEFAULT_LAYOUT;
  }
}

export function saveLayout(layout: DashboardLayout): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    /* приватный режим — раскладка просто не переживёт перезагрузку */
  }
}

/** Переставить блок на одну позицию; за границами списка — без изменений. */
export function moveWidget(
  order: WidgetId[],
  id: WidgetId,
  direction: -1 | 1,
): WidgetId[] {
  const from = order.indexOf(id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= order.length) return order;
  const next = [...order];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

export function toggleHidden(hidden: WidgetId[], id: WidgetId): WidgetId[] {
  return hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id];
}

export interface VisibilityContext {
  can: (permission: string | string[]) => boolean;
  period: PeriodKey;
  branchCount: number;
}

/**
 * Блоки, которые вообще имеет смысл показать этому пользователю сейчас —
 * до применения его личных настроек видимости.
 */
export function availableWidgets(ctx: VisibilityContext): WidgetMeta[] {
  return WIDGETS.filter((w) => {
    // Воронка ждёт бэкенда на проде и скрыта флагом. Если воронка — всё, что
    // есть у пользователя в «Операциях», карточка была бы пустой рамкой.
    if (
      w.id === "ops" &&
      !ctx.can([PAGE_PERMISSIONS.tasks, ...PAGE_PERMISSIONS.reviews]) &&
      !(DEALS_MODULE_ENABLED && ctx.can(PAGE_PERMISSIONS.deals))
    ) {
      return false;
    }
    if (!ctx.can(w.permission)) return false;
    if (w.onlyPeriod && w.onlyPeriod !== ctx.period) return false;
    if (w.needsManyBranches && ctx.branchCount < 2) return false;
    return true;
  });
}

/** Итоговый порядок отрисовки: доступные блоки минус спрятанные, в порядке пользователя. */
export function visibleWidgets(
  layout: DashboardLayout,
  ctx: VisibilityContext,
): WidgetMeta[] {
  const available = new Set(availableWidgets(ctx).map((w) => w.id));
  return layout.order
    .filter((id) => available.has(id) && !layout.hidden.includes(id))
    .map((id) => WIDGET_BY_ID.get(id)!)
    .filter(Boolean);
}

/**
 * Растянуть блоки так, чтобы каждый ряд сетки был заполнен.
 *
 * Раскладка задана рядами (8+4, 6+6, 7+5), но блок соседа может быть скрыт
 * правами или пользователем — тогда в ряду оставалась бы дыра. Раскладываем
 * блоки по рядам слева направо и недостающие колонки делим между блоками
 * ряда пропорционально их ширине: «Пульс» без «Внимания» становится во всю
 * ширину, две трети без трети — тоже.
 */
export function stretchRows(spans: number[], columns = 12): number[] {
  const out: number[] = [];
  let row: number[] = [];
  const flush = () => {
    if (!row.length) return;
    const sum = row.reduce((a, b) => a + b, 0);
    const scaled = row.map((span) => Math.floor((span * columns) / sum));
    // Остаток от округления — последнему в ряду, чтобы сумма была ровно 12.
    scaled[scaled.length - 1] += columns - scaled.reduce((a, b) => a + b, 0);
    out.push(...scaled);
    row = [];
  };
  for (const raw of spans) {
    const span = Math.min(columns, Math.max(1, raw));
    if (row.reduce((a, b) => a + b, 0) + span > columns) flush();
    row.push(span);
  }
  flush();
  return out;
}
