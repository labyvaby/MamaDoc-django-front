import { PAGE_PERMISSIONS } from "../../config/accessPermissions";
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
  | "money"
  | "appointments"
  | "availability"
  | "bookings"
  | "branches"
  | "month"
  | "staff"
  | "tasks"
  | "deals"
  | "reviews";

export type WidgetSpan = 4 | 6 | 12;

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

/** Порядок по умолчанию: деньги и загрузка сверху, справочное ниже. */
export const WIDGETS: WidgetMeta[] = [
  { id: "money", label: "Деньги", permission: PAGE_PERMISSIONS.cashbox, span: 6 },
  {
    id: "appointments",
    label: "Записи",
    permission: PAGE_PERMISSIONS.appointments,
    span: 6,
  },
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
  {
    id: "branches",
    label: "Сравнение филиалов",
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
  {
    id: "staff",
    label: "Сотрудники",
    permission: PAGE_PERMISSIONS.payroll,
    span: 6,
  },
  { id: "tasks", label: "Задачи", permission: PAGE_PERMISSIONS.tasks, span: 6 },
  { id: "deals", label: "Воронка продаж", permission: PAGE_PERMISSIONS.deals, span: 6 },
  { id: "reviews", label: "Отзывы", permission: PAGE_PERMISSIONS.reviews, span: 6 },
];

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
  { value: 12, label: "Широкий", hint: "во всю ширину" },
];

export const DEFAULT_LAYOUT: DashboardLayout = {
  order: WIDGETS.map((w) => w.id),
  hidden: [],
  sizes: {},
};

const STORAGE_KEY = "mamadoc:dashboard:layout";

/**
 * Читаем сохранённую раскладку, достраивая её до актуального реестра: новые
 * блоки появляются в конце, исчезнувшие отбрасываются. Без этого добавление
 * виджета в код не дошло бы до тех, кто хоть раз открывал настройки.
 */
export function normalizeLayout(saved: Partial<DashboardLayout> | null): DashboardLayout {
  const known = new Set(WIDGETS.map((w) => w.id));
  const savedOrder = (saved?.order ?? []).filter((id): id is WidgetId => known.has(id));
  const missing = WIDGETS.map((w) => w.id).filter((id) => !savedOrder.includes(id));
  const allowedSpans = new Set(SPAN_OPTIONS.map((o) => o.value));
  const sizes: Partial<Record<WidgetId, WidgetSpan>> = {};
  for (const [id, span] of Object.entries(saved?.sizes ?? {})) {
    // Чужие ключи и произвольные числа отбрасываем: раскладка приходит из
    // localStorage, то есть её мог поправить кто угодно.
    if (known.has(id as WidgetId) && allowedSpans.has(span as WidgetSpan)) {
      sizes[id as WidgetId] = span as WidgetSpan;
    }
  }

  return {
    order: [...savedOrder, ...missing],
    hidden: (saved?.hidden ?? []).filter((id): id is WidgetId => known.has(id)),
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
