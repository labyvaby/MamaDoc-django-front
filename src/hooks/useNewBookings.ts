import React from "react";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { getBookings, type BookingListItem, type BookingStatus } from "../api/bookings";
import { djangoQueryKeys } from "../api/queryKeys";
import { sortBookingsByPriority } from "../pages/bookings/meta";
import { useActiveScope } from "./useActiveScope";
import { useCan } from "./useCan";
import { usePermissions } from "./usePermissions";

/**
 * Непросмотренные заявки онлайн-записи — единый источник для всех мест, где
 * «новое» показывается: колокольчик и список на `/bookings`, глобальный тост и
 * счётчик в заголовке вкладки браузера.
 *
 * «Новая» = `pending`, которую никто не взял в работу (`claimedAt: null`),
 * пришедшая не слишком давно (`createdAt` свежее NEW_MAX_AGE_DAYS) и не
 * просмотренная на этом устройстве.
 *
 * `claimedAt` и `createdAt` появились в контракте броней §8 (10.09.2026) и
 * сняли два худших свойства прежней схемы: подсветку висяков как новинок и
 * «после релиза всё новое». `claimedAt` вдобавок общий для сотрудников — взял
 * коллега, погасло у всех.
 *
 * ⚠ Локальный список просмотренных id остаётся, и убрать его пока нечем:
 * серверной отметки «прочитано» у броней нет (`claim` — это «взято в работу»,
 * явное действие, а не факт открытия карточки). Поэтому «прочитанность» всё
 * ещё не переезжает между устройствами.
 *
 * ⚠ На 10.09.2026 §8 выложен только на тест: на проде ни `createdAt`, ни
 * `claimedAt` нет. Обе проверки написаны так, что без полей ведут себя как
 * раньше — фильтрация просто не срабатывает.
 */

// ── Хранилище «просмотрено» ───────────────────────────────────────────────────

/** Префикс сохранён с первой версии колокольчика — прочитанное не сбрасывается. */
const SEEN_KEY_PREFIX = "mamadoc:bookings:notifSeen";
/** Сколько id держим — не даём ключу localStorage расти бесконечно. */
const SEEN_CAP = 300;

function seenStorageKey(organizationId?: number, branchId?: number): string {
  return `${SEEN_KEY_PREFIX}:${organizationId ?? "x"}:${branchId ?? "x"}`;
}

/**
 * Снимки для `useSyncExternalStore` обязаны быть стабильными по ссылке, пока
 * ничего не менялось, поэтому разобранное множество живёт в модульном кэше, а
 * не перечитывается из localStorage на каждый рендер.
 */
const seenCache = new Map<string, ReadonlySet<number>>();
const listeners = new Set<() => void>();
let storageBound = false;

function loadSeen(key: string): ReadonlySet<number> {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? (arr as number[]) : []);
  } catch {
    return new Set();
  }
}

function getSeen(key: string): ReadonlySet<number> {
  const cached = seenCache.get(key);
  if (cached) return cached;
  const loaded = loadSeen(key);
  seenCache.set(key, loaded);
  return loaded;
}

function emit(): void {
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Вторая вкладка того же браузера: там прочитали — здесь гасим. Вешаем один
  // раз на первую подписку, снимать не нужно (живёт столько же, сколько вкладка).
  if (!storageBound && typeof window !== "undefined") {
    storageBound = true;
    window.addEventListener("storage", (e) => {
      if (!e.key || !e.key.startsWith(SEEN_KEY_PREFIX)) return;
      seenCache.delete(e.key);
      emit();
    });
  }
  return () => {
    listeners.delete(onChange);
  };
}

function markSeenInStore(key: string, ids: number[]): void {
  if (ids.length === 0) return;
  const current = getSeen(key);
  const next = new Set(current);
  let changed = false;
  for (const id of ids) {
    if (!next.has(id)) {
      next.add(id);
      changed = true;
    }
  }
  if (!changed) return;
  // Set хранит порядок вставки — обрезаем самые старые отметки.
  const trimmed: ReadonlySet<number> = new Set(Array.from(next).slice(-SEEN_CAP));
  seenCache.set(key, trimmed);
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(trimmed)));
  } catch {
    /* приватный режим / отказ доступа — просто не запомним между сессиями */
  }
  emit();
}

// ── Хуки ──────────────────────────────────────────────────────────────────────

export interface SeenBookings {
  seen: ReadonlySet<number>;
  markSeen: (ids: number[]) => void;
}

/**
 * Множество просмотренных заявок текущей организации и филиала.
 *
 * Организацию берём из `usePermissions`, а не из `useActiveScope`: последний
 * отдаёт `organizationId` только когда его требует бэк (суперадмин /
 * мультиорганизационный пользователь), и у обычного сотрудника ключ хранилища
 * склеился бы с «неизвестной организацией».
 */
export function useSeenBookings(): SeenBookings {
  const { activeOrganization, activeBranch } = usePermissions();
  const key = seenStorageKey(activeOrganization?.id, activeBranch?.id);
  const getSnapshot = React.useCallback(() => getSeen(key), [key]);
  const seen = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const markSeen = React.useCallback((ids: number[]) => markSeenInStore(key, ids), [key]);
  return { seen, markSeen };
}

/** Как часто опрашиваем заявки. Чаще общего поллинга: заявка ждёт звонка. */
const NEW_BOOKINGS_POLL_MS = 45_000;
/**
 * Сколько заявка считается новинкой. Дольше висящий `pending` — это висяк: он
 * виден в списке и в счётчике «Ожидает», но подсвечивать его как новое
 * поступление и звенеть о нём в колокольчике незачем.
 */
const NEW_MAX_AGE_DAYS = 7;
/** Размер выборки поллера — окно ниже редко даёт больше сотни `pending`. */
const NEW_BOOKINGS_PAGE_SIZE = 100;

export interface NewBookings extends SeenBookings {
  /** Непросмотренные заявки, «то, что горит» — сверху. */
  items: BookingListItem[];
  count: number;
  /** `pending`, никем не взятая, свежая и не открытая на этом устройстве. */
  isNew: (b: {
    id: number;
    status: BookingStatus;
    createdAt?: string;
    claimedAt?: string | null;
  }) => boolean;
  enabled: boolean;
  isLoading: boolean;
  isError: boolean;
  /**
   * Приезжал ли хоть один ответ сервера. Нужен тем, кто сравнивает выдачи
   * между собой (тост о приходе заявки): до первого ответа `items` пуст, и
   * пустоту нельзя принимать за «заявок нет».
   */
  isSuccess: boolean;
}

/**
 * Поток новых заявок: общий поллинг `/bookings/?status=pending` + локальная
 * отметка о просмотре.
 *
 * queryKey фиксированный, поэтому колокольчик, тост и счётчик в заголовке
 * вкладки делят один запрос, сколько бы из них ни было смонтировано.
 *
 * Окно дат — как у бейджа в сайдбаре (30 дней назад … 90 вперёд), и назад оно
 * смотрит намеренно: `pending` на вчера — это висяк, по которому никто не
 * связался с пациентом, и терять его из вида нельзя. Считается один раз за
 * монтирование, после полуночи сдвинется на перезагрузке.
 */
export function useNewBookings(): NewBookings {
  const canView = useCan("bookings.view");
  const { organizationId, branchId, isReady, orgReady } = useActiveScope();
  const { seen, markSeen } = useSeenBookings();

  const window_ = React.useMemo(() => {
    const today = dayjs();
    return {
      from: today.subtract(30, "day").format("YYYY-MM-DD"),
      to: today.add(90, "day").format("YYYY-MM-DD"),
    };
  }, []);

  const enabled = canView && isReady && orgReady;

  const query = useQuery({
    queryKey: djangoQueryKeys.bookings.list({
      feed: "new",
      orgId: organizationId ?? null,
      branch: branchId ?? null,
      from: window_.from,
      to: window_.to,
    }),
    queryFn: ({ signal }) =>
      getBookings(
        {
          dateFrom: window_.from,
          dateTo: window_.to,
          status: "pending",
          organizationId,
          branchId,
          // Свежие сверху: при упоре в pageSize обрежется хвост из висяков, а
          // не сегодняшние заявки. До §8 на бэке параметр игнорируется.
          ordering: "-createdAt",
          page: 1,
          pageSize: NEW_BOOKINGS_PAGE_SIZE,
        },
        signal,
      ),
    enabled,
    refetchInterval: NEW_BOOKINGS_POLL_MS,
    staleTime: 20_000,
    refetchOnWindowFocus: true,
  });

  /**
   * Границу «свежести» считаем один раз за монтирование: пересчёт на каждом
   * рендере менял бы ссылку и обесценивал мемоизацию, а секунды тут не важны —
   * речь о днях.
   */
  const freshSince = React.useMemo(
    () => dayjs().subtract(NEW_MAX_AGE_DAYS, "day").valueOf(),
    [],
  );

  /** Заявка ещё ждёт своего часа: никто не взял и пришла недавно. */
  const isUnhandled = React.useCallback(
    (b: { createdAt?: string; claimedAt?: string | null }) => {
      if (b.claimedAt) return false;
      // Поля нет (прод до §8) — возраст не проверяем, ведём себя как раньше.
      if (!b.createdAt) return true;
      const ms = Date.parse(b.createdAt);
      return !Number.isFinite(ms) || ms >= freshSince;
    },
    [freshSince],
  );

  const items = React.useMemo(
    () =>
      sortBookingsByPriority(
        (query.data?.results ?? []).filter((b) => !seen.has(b.id) && isUnhandled(b)),
      ),
    [query.data, seen, isUnhandled],
  );

  const isNew = React.useCallback(
    (b: {
      id: number;
      status: BookingStatus;
      createdAt?: string;
      claimedAt?: string | null;
    }) => b.status === "pending" && !seen.has(b.id) && isUnhandled(b),
    [seen, isUnhandled],
  );

  return {
    items,
    count: items.length,
    seen,
    markSeen,
    isNew,
    enabled,
    isLoading: query.isLoading,
    isError: query.isError,
    isSuccess: query.isSuccess,
  };
}

export default useNewBookings;
