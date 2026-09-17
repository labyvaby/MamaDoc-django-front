/**
 * Демо-данные для пустой тестовой базы — ТОЛЬКО для локального просмотра.
 *
 * Тестовый бэкенд может быть пуст (нет сотрудников/расписания/приёмов), и
 * тогда «Приёмы» и «Расписание» выглядят как сломанные, хотя UI в порядке —
 * просто нечего показывать. Этот модуль подменяет ответы конкретных GET-
 * эндпоинтов на правдоподобный JSON той же формы, что отдаёт бэкенд, — код
 * страниц (нормализация, сетка слотов, шахматка смен) остаётся настоящим и
 * работает с этими данными как с настоящим ответом сервера.
 *
 * Включается только явно, флагом в `.env.local` (не коммитится, см.
 * .gitignore): `VITE_MOCK_DEMO_DATA=true`. Без флага модуль не трогает
 * fetch вообще. В production-сборке не активируется даже при случайно
 * оставшемся флаге — двойная защита ниже.
 *
 * ⚠ Это НЕ часть контракта API проекта (в отличие от src/api/*.ts) и не
 * предназначено для коммита как фича — удобство для локальной отладки.
 * Перехватываются только перечисленные ниже GET-пути; всё остальное
 * (авторизация, запись/оплата и т.д.) уходит на настоящий тестовый бэкенд
 * как обычно.
 */
import dayjs, { type Dayjs } from "dayjs";
import type { Theme } from "@mui/material/styles";
import { usePermissions } from "../hooks/usePermissions";

const ENV_FLAG = "VITE_MOCK_DEMO_DATA";

// ── Детерминированный псевдослучайный генератор ─────────────────────────────
// Один и тот же seed (обычно дата) всегда даёт одну и ту же выдачу: список
// приёмов на «вчера» не скачет при каждом открытии дня.

function hashString(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rngFor = (seed: string): (() => number) => mulberry32(hashString(seed));

/** 0=Пн … 6=Вс — конвенция ScheduleRule.weekdays, а не dayjs.day() (0=Вс). */
const mondayIndex = (d: Dayjs): number => (d.day() + 6) % 7;

const pad2 = (n: number): string => String(n).padStart(2, "0");

// ── Справочники демо-клиники ────────────────────────────────────────────────

interface MockEmployee {
  id: number;
  fullName: string;
  clinicalRole: "doctor" | "nurse";
  specializationId: number;
  specializationName: string;
}

const MOCK_EMPLOYEES: MockEmployee[] = [
  { id: 900001, fullName: "Иванова Алина Сергеевна", clinicalRole: "doctor", specializationId: 900101, specializationName: "Педиатр" },
  { id: 900002, fullName: "Петров Марат Русланович", clinicalRole: "doctor", specializationId: 900102, specializationName: "ЛОР" },
  { id: 900004, fullName: "Асанов Данияр Талантович", clinicalRole: "doctor", specializationId: 900104, specializationName: "УЗИ-диагностика" },
  { id: 900003, fullName: "Сидорова Жамиля Бакытовна", clinicalRole: "nurse", specializationId: 900103, specializationName: "Процедурная медсестра" },
];

const MOCK_SERVICES = [
  { id: 900201, name: "Приём педиатра", basePrice: "1200.00", durationMinutes: 30 },
  { id: 900202, name: "Осмотр ЛОР-врача", basePrice: "1000.00", durationMinutes: 30 },
  { id: 900203, name: "УЗИ брюшной полости", basePrice: "1800.00", durationMinutes: 40 },
  { id: 900204, name: "Прививка АКДС", basePrice: "600.00", durationMinutes: 15 },
  { id: 900205, name: "Повторная консультация", basePrice: "800.00", durationMinutes: 20 },
];

const MOCK_PATIENT_NAMES = [
  "Асанова Дана", "Бекова Аяна", "Осмонов Тимур", "Жумабекова Айгерим",
  "Кадыров Эрлан", "Садыкова Мээрим", "Турсунов Бекзат", "Ниязова Камила",
  "Абдыкадыров Нурлан", "Молдоева Жаныл",
];

const STATUS_CYCLE = ["scheduled", "confirmed", "arrived", "in_progress", "completed", "completed", "no_show", "canceled"];
const PAYMENT_CYCLE = ["unpaid", "unpaid", "partial", "paid", "paid", "unpaid", "unpaid", "unpaid"];

/** Фиксированная точка отсчёта: heartbeat (`/appointments/last-update/`) не
 *  должен «плыть» на каждый опрос — иначе поллинг решит, что что-то
 *  изменилось, и будет дёргать рефетч раз в 10 секунд без остановки. */
const MOCK_LAST_UPDATE = "2026-09-01T09:00:00Z";

const MOCK_BRANCH_NAME = "Филиал (демо)";

// ── Номера и брони — для RoomBookingGrid.tsx ────────────────────────────────
//
// Отдельная сущность от MOCK_EMPLOYEES/appointments: «шахматка броней» —
// номера по строкам, даты по столбцам, бары — брони на несколько ночей.
// Единый список используется и в форме создания брони (CreateBookingButton),
// и в счётчике «всего номеров» карточки загрузки (getHotelOccupancySnapshot).

export interface HotelRoomCategory {
  name: string;
  rooms: string[];
  /** Цена номера «без ничего», сом/ночь — своя у категории. Итоговая цена — через getCategoryTotalPrice, не это поле напрямую. */
  pricePerNight: number;
  /** Вместимость, гостей. */
  capacity: number;
  /** Вид из окна — основная характеристика категории, не «удобство». */
  view: string;
  /** Тип кровати — основная характеристика категории. */
  bedType: string;
  /** Планировка/комнатность — основная характеристика категории. */
  roomLayout: string;
  /** Ключи из справочника характеристик — что отличает номер от обычного (холодильник, два санузла…) и на сколько дороже делает (extraPrice каждой). */
  amenities: string[];
  /** Люкс-уровень — бейдж и акцентный цвет в гриде/модалке деталей. */
  luxury?: boolean;
}

// ── Характеристики категории номера — справочник, тот же принцип, что права ──
//
// Со слов заказчика: характеристика — это наличие чего-то в номере, что
// отличает его от обычного («холодильник», «два санузла», «Wi-Fi»…) и делает
// его дороже. Категория номера так же собирает характеристики в поимённый
// набор, как роль собирает права (HOTEL_PERMISSION_CATALOG/HotelRole ниже) —
// тот же справочник + группировка по разделу, та же форма «название +
// отмеченные пункты». В отличие от прав, справочник характеристик —
// изменяемый браузерный стор (тот же приём, что HOTEL_ROOM_CATEGORIES/
// HOTEL_ROLES): персонал может добавить новую характеристику через
// «Настройка» → «Номера», она сразу доступна во всех категориях. У каждой
// характеристики — своя наценка (extraPrice, сом/ночь), тоже редактируемая.
// Итоговая цена номера = category.pricePerNight (цена «номера без ничего») +
// сумма наценок его отмеченных характеристик — считайте через
// getCategoryTotalPrice, не через одно pricePerNight.

export interface HotelRoomCharacteristicDef {
  key: string;
  label: string;
  category: string;
  /** Наценка к цене номера за ночь, сом — 0, если характеристика не влияет на цену. */
  extraPrice: number;
}

const DEFAULT_ROOM_CHARACTERISTIC_CATALOG: HotelRoomCharacteristicDef[] = [
  { key: "fridge", label: "Холодильник", category: "Техника", extraPrice: 150 },
  { key: "minibar", label: "Мини-бар", category: "Техника", extraPrice: 300 },
  { key: "ac", label: "Кондиционер", category: "Техника", extraPrice: 200 },
  { key: "wifi", label: "Wi-Fi", category: "Техника", extraPrice: 100 },
  { key: "tv", label: "Телевизор", category: "Техника", extraPrice: 150 },
  { key: "shower", label: "Душ", category: "Ванная", extraPrice: 100 },
  { key: "jacuzzi", label: "Джакузи", category: "Ванная", extraPrice: 800 },
  { key: "twoBathrooms", label: "Два санузла", category: "Ванная", extraPrice: 500 },
  { key: "bathrobe", label: "Халат", category: "Ванная", extraPrice: 50 },
  { key: "slippers", label: "Тапочки", category: "Ванная", extraPrice: 30 },
  { key: "livingRoom", label: "Отдельная гостиная", category: "Планировка", extraPrice: 700 },
  { key: "balcony", label: "Балкон", category: "Планировка", extraPrice: 400 },
];

const ROOM_CHARACTERISTIC_CATALOG_KEY = "mamadoc:mockRoomCharacteristicCatalog";
const roomCharacteristicCatalogListeners = new Set<() => void>();

function isHotelRoomCharacteristicDef(c: unknown): c is HotelRoomCharacteristicDef {
  return (
    !!c &&
    typeof c === "object" &&
    typeof (c as HotelRoomCharacteristicDef).key === "string" &&
    typeof (c as HotelRoomCharacteristicDef).label === "string" &&
    typeof (c as HotelRoomCharacteristicDef).category === "string" &&
    typeof (c as HotelRoomCharacteristicDef).extraPrice === "number"
  );
}

function readRoomCharacteristicCatalogFromStorage(): HotelRoomCharacteristicDef[] {
  try {
    const raw = window.localStorage.getItem(ROOM_CHARACTERISTIC_CATALOG_KEY);
    if (!raw) return DEFAULT_ROOM_CHARACTERISTIC_CATALOG;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(isHotelRoomCharacteristicDef)) return DEFAULT_ROOM_CHARACTERISTIC_CATALOG;
    return parsed;
  } catch {
    return DEFAULT_ROOM_CHARACTERISTIC_CATALOG;
  }
}

let roomCharacteristicCatalogCache: HotelRoomCharacteristicDef[] = readRoomCharacteristicCatalogFromStorage();

function persistRoomCharacteristicCatalog(next: HotelRoomCharacteristicDef[]): void {
  roomCharacteristicCatalogCache = next;
  try {
    window.localStorage.setItem(ROOM_CHARACTERISTIC_CATALOG_KEY, JSON.stringify(next));
  } catch {
    // приватный режим/запрет на localStorage — доживёт до конца вкладки в памяти
  }
  roomCharacteristicCatalogListeners.forEach((fn) => fn());
}

export function subscribeRoomCharacteristicCatalog(onChange: () => void): () => void {
  roomCharacteristicCatalogListeners.add(onChange);
  return () => roomCharacteristicCatalogListeners.delete(onChange);
}

export function getRoomCharacteristicCatalogSnapshot(): HotelRoomCharacteristicDef[] {
  return roomCharacteristicCatalogCache;
}

export function getRoomCharacteristicLabel(key: string): string {
  return roomCharacteristicCatalogCache.find((c) => c.key === key)?.label ?? key;
}

/** Наценка характеристики к цене номера за ночь, сом — 0, если ключ не найден. */
export function getRoomCharacteristicExtraPrice(key: string): number {
  return roomCharacteristicCatalogCache.find((c) => c.key === key)?.extraPrice ?? 0;
}

/** Есть ли уже характеристика с таким названием (без учёта регистра) — валидация при добавлении. */
export function roomCharacteristicLabelExists(label: string): boolean {
  const trimmed = label.trim().toLowerCase();
  return roomCharacteristicCatalogCache.some((c) => c.label.toLowerCase() === trimmed);
}

/** Добавляет новую характеристику в общий справочник — доступна сразу во всех категориях. Дубль по названию — не добавляет. */
export function addRoomCharacteristic(label: string, category: string, extraPrice: number): HotelRoomCharacteristicDef | null {
  const trimmed = label.trim();
  if (!trimmed || roomCharacteristicLabelExists(trimmed)) return null;
  const def: HotelRoomCharacteristicDef = {
    key: `custom_${Date.now()}`,
    label: trimmed,
    category: category.trim() || "Другое",
    extraPrice: Number.isFinite(extraPrice) ? extraPrice : 0,
  };
  persistRoomCharacteristicCatalog([...roomCharacteristicCatalogCache, def]);
  return def;
}

/** Правит наценку уже существующей характеристики — общая для всех категорий, где она отмечена. */
export function updateRoomCharacteristicPrice(key: string, extraPrice: number): void {
  const next = roomCharacteristicCatalogCache.map((c) =>
    c.key === key ? { ...c, extraPrice: Number.isFinite(extraPrice) ? extraPrice : 0 } : c,
  );
  persistRoomCharacteristicCatalog(next);
}

const DEFAULT_HOTEL_ROOM_CATEGORIES: HotelRoomCategory[] = [
  {
    name: "Twin без окна",
    rooms: ["111", "112", "113"],
    // Цена номера «без ничего» — 1800 сом/ночь итог = 1700 (база) + 100 (Душ).
    pricePerNight: 1700,
    capacity: 2,
    view: "Без окна",
    bedType: "2 отдельные кровати",
    roomLayout: "Студия",
    amenities: ["shower"],
  },
  {
    name: "Standard",
    rooms: ["201", "202", "203", "204"],
    // 2500 итог = 2200 (база) + 200 (Кондиционер) + 100 (Wi-Fi).
    pricePerNight: 2200,
    capacity: 2,
    view: "Двор",
    bedType: "Двуспальная кровать",
    roomLayout: "1 комната",
    amenities: ["ac", "wifi"],
  },
  {
    name: "Делюкс",
    rooms: ["301", "302", "303"],
    // 4200 итог = 3750 (база) + 300 (Мини-бар) + 100 (Wi-Fi) + 50 (Халат).
    pricePerNight: 3750,
    capacity: 3,
    view: "Улица",
    bedType: "Двуспальная кровать King-size",
    roomLayout: "1 комната",
    amenities: ["minibar", "wifi", "bathrobe"],
  },
  {
    name: "Люкс",
    rooms: ["401", "402"],
    // 7500 итог = 5620 (база) + 800 (Джакузи) + 300 (Мини-бар) + 700 (Гостиная) + 50 (Халат) + 30 (Тапочки).
    pricePerNight: 5620,
    capacity: 4,
    view: "Горы",
    bedType: "Кровать King-size",
    roomLayout: "Апартаменты (спальня + гостиная)",
    amenities: ["jacuzzi", "minibar", "livingRoom", "bathrobe", "slippers"],
    luxury: true,
  },
];

// Номера — тот же изменяемый браузерный стор, что HOTEL_ROLES ниже (localStorage +
// слушатели): «Настройка» → «Номера» добавляет номер в существующую категорию, и
// шахматка/форма брони должны увидеть его без reload. HOTEL_ROOM_CATEGORIES/HOTEL_ROOMS
// раньше были статическими константами — теперь это функции, читающие живой снимок
// на каждый вызов, а не застывший список из 12 номеров на момент импорта модуля.

const HOTEL_ROOM_CATEGORIES_KEY = "mamadoc:mockHotelRoomCategories";
const hotelRoomCategoriesListeners = new Set<() => void>();

function isHotelRoomCategory(c: unknown): c is HotelRoomCategory {
  return (
    !!c &&
    typeof c === "object" &&
    typeof (c as HotelRoomCategory).name === "string" &&
    Array.isArray((c as HotelRoomCategory).rooms)
  );
}

function readHotelRoomCategoriesFromStorage(): HotelRoomCategory[] {
  try {
    const raw = window.localStorage.getItem(HOTEL_ROOM_CATEGORIES_KEY);
    if (!raw) return DEFAULT_HOTEL_ROOM_CATEGORIES;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(isHotelRoomCategory)) return DEFAULT_HOTEL_ROOM_CATEGORIES;
    return parsed;
  } catch {
    return DEFAULT_HOTEL_ROOM_CATEGORIES;
  }
}

let hotelRoomCategoriesCache: HotelRoomCategory[] = readHotelRoomCategoriesFromStorage();

function persistHotelRoomCategories(next: HotelRoomCategory[]): void {
  hotelRoomCategoriesCache = next;
  try {
    window.localStorage.setItem(HOTEL_ROOM_CATEGORIES_KEY, JSON.stringify(next));
  } catch {
    // приватный режим/запрет на localStorage — доживёт до конца вкладки в памяти
  }
  hotelRoomCategoriesListeners.forEach((fn) => fn());
}

export function subscribeHotelRoomCategories(onChange: () => void): () => void {
  hotelRoomCategoriesListeners.add(onChange);
  return () => hotelRoomCategoriesListeners.delete(onChange);
}

export function getHotelRoomCategoriesSnapshot(): HotelRoomCategory[] {
  return hotelRoomCategoriesCache;
}

/** Плоский список всех номеров — читает текущий стор на каждый вызов. */
export function getHotelRooms(): string[] {
  return hotelRoomCategoriesCache.flatMap((c) => c.rooms);
}

/** Категория (тариф/удобства) по номеру комнаты. */
export function getRoomCategory(room: string): HotelRoomCategory | undefined {
  return hotelRoomCategoriesCache.find((c) => c.rooms.includes(room));
}

/** Итоговая цена за ночь: pricePerNight категории (номер «без ничего») + наценка каждой отмеченной характеристики. */
export function getCategoryTotalPrice(category: HotelRoomCategory): number {
  return category.amenities.reduce((sum, key) => sum + getRoomCharacteristicExtraPrice(key), category.pricePerNight);
}

/** Занят ли номер таким названием уже в какой-либо категории — проверка дублей при добавлении. */
export function roomNumberExists(room: string): boolean {
  return hotelRoomCategoriesCache.some((c) => c.rooms.includes(room));
}

/** Добавляет номер в существующую категорию (по имени). Дубль по всему отелю — не добавляет. */
export function addHotelRoom(categoryName: string, room: string): void {
  const trimmed = room.trim();
  if (!trimmed || roomNumberExists(trimmed)) return;
  const next = hotelRoomCategoriesCache.map((c) =>
    c.name === categoryName ? { ...c, rooms: [...c.rooms, trimmed] } : c,
  );
  persistHotelRoomCategories(next);
}

/** Убирает номер из категории — исправить опечатку при добавлении. */
export function deleteHotelRoom(categoryName: string, room: string): void {
  const next = hotelRoomCategoriesCache.map((c) =>
    c.name === categoryName ? { ...c, rooms: c.rooms.filter((r) => r !== room) } : c,
  );
  persistHotelRoomCategories(next);
  clearRoomAdditionalTariffs(room);
}

/** Есть ли уже категория с таким именем (без учёта регистра) — валидация при создании. */
export function roomCategoryNameExists(name: string): boolean {
  const trimmed = name.trim().toLowerCase();
  return hotelRoomCategoriesCache.some((c) => c.name.toLowerCase() === trimmed);
}

/** Добавляет новую категорию (тариф) с пустым списком номеров. Дубль по имени — не добавляет. */
export function addHotelRoomCategory(category: Omit<HotelRoomCategory, "rooms">): boolean {
  const name = category.name.trim();
  if (!name || roomCategoryNameExists(name)) return false;
  persistHotelRoomCategories([...hotelRoomCategoriesCache, { ...category, name, rooms: [] }]);
  return true;
}

/** Правит уже созданную категорию (цену, характеристики, можно и название) — состав номеров не трогает. */
export function updateHotelRoomCategory(originalName: string, patch: Omit<HotelRoomCategory, "rooms">): boolean {
  const name = patch.name.trim();
  if (!name) return false;
  if (name.toLowerCase() !== originalName.toLowerCase() && roomCategoryNameExists(name)) return false;
  const next = hotelRoomCategoriesCache.map((c) => (c.name === originalName ? { ...patch, name, rooms: c.rooms } : c));
  persistHotelRoomCategories(next);
  return true;
}

/**
 * Переносит номер в другую категорию и/или переименовывает его — правка при
 * заведении номера без удаления и создания заново. Доп. тарифы номера
 * переезжают вместе с ним, если номер переименован.
 */
export function updateHotelRoom(fromCategoryName: string, room: string, toCategoryName: string, newRoomNumber: string): boolean {
  const trimmed = newRoomNumber.trim();
  if (!trimmed) return false;
  if (trimmed !== room && roomNumberExists(trimmed)) return false;
  const next = hotelRoomCategoriesCache.map((c) => {
    const withoutRoom = c.name === fromCategoryName ? { ...c, rooms: c.rooms.filter((r) => r !== room) } : c;
    return withoutRoom.name === toCategoryName ? { ...withoutRoom, rooms: [...withoutRoom.rooms, trimmed] } : withoutRoom;
  });
  persistHotelRoomCategories(next);
  if (trimmed !== room) {
    const tariffs = getRoomAdditionalTariffs(room);
    clearRoomAdditionalTariffs(room);
    setRoomAdditionalTariffs(trimmed, tariffs);
  }
  return true;
}

// ── Доп. тарифы номера — задаются при добавлении номера («Настройка» → «Номера») ──
//
// Не то же самое, что boardType/BOARD_TYPE_LABELS ниже: тариф брони —
// единственный выбранный пакет на конкретный заезд («Тариф» в
// CreateBookingButton), а доп. тарифы — набор отдельных опций питания,
// которые вообще доступны в этом номере (можно комбинировать: Завтрак+Обед
// без Ужина и т.п.) — свойство номера, не брони, поэтому свой стор и свой тип.

export type AdditionalTariff = "breakfast" | "lunch" | "dinner" | "allInclusive";

export const ADDITIONAL_TARIFF_LABELS: Record<AdditionalTariff, string> = {
  breakfast: "Завтрак",
  lunch: "Обед",
  dinner: "Ужин",
  allInclusive: "Всё включено",
};

const ROOM_ADDITIONAL_TARIFFS_KEY = "mamadoc:mockRoomAdditionalTariffs";
const roomAdditionalTariffsListeners = new Set<() => void>();

function readRoomAdditionalTariffsFromStorage(): Record<string, AdditionalTariff[]> {
  try {
    const raw = window.localStorage.getItem(ROOM_ADDITIONAL_TARIFFS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, AdditionalTariff[]>;
  } catch {
    return {};
  }
}

let roomAdditionalTariffsCache: Record<string, AdditionalTariff[]> = readRoomAdditionalTariffsFromStorage();

function persistRoomAdditionalTariffs(next: Record<string, AdditionalTariff[]>): void {
  roomAdditionalTariffsCache = next;
  try {
    window.localStorage.setItem(ROOM_ADDITIONAL_TARIFFS_KEY, JSON.stringify(next));
  } catch {
    // приватный режим/запрет на localStorage — доживёт до конца вкладки в памяти
  }
  roomAdditionalTariffsListeners.forEach((fn) => fn());
}

export function setRoomAdditionalTariffs(room: string, tariffs: AdditionalTariff[]): void {
  const next = { ...roomAdditionalTariffsCache };
  if (tariffs.length === 0) delete next[room];
  else next[room] = tariffs;
  persistRoomAdditionalTariffs(next);
}

function clearRoomAdditionalTariffs(room: string): void {
  if (!(room in roomAdditionalTariffsCache)) return;
  const next = { ...roomAdditionalTariffsCache };
  delete next[room];
  persistRoomAdditionalTariffs(next);
}

export function getRoomAdditionalTariffs(room: string): AdditionalTariff[] {
  return roomAdditionalTariffsCache[room] ?? [];
}

export function subscribeRoomAdditionalTariffs(onChange: () => void): () => void {
  roomAdditionalTariffsListeners.add(onChange);
  return () => roomAdditionalTariffsListeners.delete(onChange);
}

export function getRoomAdditionalTariffsSnapshot(): Record<string, AdditionalTariff[]> {
  return roomAdditionalTariffsCache;
}

/** Статус уборки номера — независим от того, занят номер бронью или нет. */
export type RoomHousekeepingStatus = "dirty" | "cleaned" | "inspected" | "repair";

export const ROOM_HOUSEKEEPING_STATUS_LABELS: Record<RoomHousekeepingStatus, string> = {
  dirty: "Грязно",
  cleaned: "Убрано",
  inspected: "Проверено",
  repair: "Ремонт",
};

/**
 * Статус уборки номера — детерминирован по номеру и дню (не по каждому
 * рендеру): один и тот же номер весь день «Убран», а не мигает при каждом
 * клике. Меняется на следующий день — тот же сид-приём, что у ops-цифр в
 * getHotelOccupancySnapshot, только теперь по каждому номеру отдельно, а не
 * общим счётчиком, — родная связка с точками в RoomBookingGrid и чипом в
 * RoomDetailsDialog, а не отдельная независимая цифра.
 */
export function getRoomHousekeepingStatus(room: string): RoomHousekeepingStatus {
  const today = dayjs().format("YYYY-MM-DD");
  const rnd = rngFor(`roomstatus:${room}:${today}`);
  const r = rnd();
  if (r < 0.08) return "repair";
  if (r < 0.35) return "dirty";
  if (r < 0.65) return "inspected";
  return "cleaned";
}

/** Цвет статуса уборки из активной MUI-темы — тот же в точке-индикаторе и в чипе. */
export function getRoomHousekeepingStatusColor(status: RoomHousekeepingStatus, theme: Theme): string {
  switch (status) {
    case "dirty":
      return theme.palette.error.main;
    case "cleaned":
      return theme.palette.success.main;
    case "inspected":
      return theme.palette.info.main;
    case "repair":
      return theme.palette.warning.main;
  }
}

export type HotelBookingStatus = "confirmed" | "arrived" | "completed";

/** Гражданин КР — паспорт/ИНН; иностранец — загранпаспорт/миграционный учёт. */
export type GuestType = "resident" | "foreign";
export type BookingGuaranteeMethod = "card" | "prepayment" | "cash" | "corporate";
export type BookingSource = "direct" | "phone" | "ota" | "agent" | "walkin";
export type VisitPurpose = "tourism" | "business" | "other";
/** Тариф проживания — что включено в стоимость номера, помимо самого проживания. */
export type BookingBoardType = "roomOnly" | "breakfast" | "halfBoard" | "allInclusive";

export const GUEST_TYPE_LABELS: Record<GuestType, string> = {
  resident: "Гражданин КР",
  foreign: "Иностранец",
};

export const GUARANTEE_METHOD_LABELS: Record<BookingGuaranteeMethod, string> = {
  card: "Карта (удержание)",
  prepayment: "Предоплата",
  cash: "Наличные при заезде",
  corporate: "Корпоративный счёт",
};

export const BOOKING_SOURCE_LABELS: Record<BookingSource, string> = {
  direct: "Сайт отеля",
  phone: "Звонок",
  ota: "Booking.com / OTA",
  agent: "Турагент",
  walkin: "Без брони (walk-in)",
};

// ── Имитация распознавания фото паспорта — AddGuestDrawer.tsx/CreateBookingButton.tsx ──
//
// Настоящее распознавание — отдельная фича на потом (нужен бэкенд с OCR).
// Сейчас по выбранному файлу подставляются правдоподобные фейковые реквизиты
// — витрина того, как будет выглядеть автозаполнение. Детерминировано по
// имени файла+размеру: один и тот же файл всегда даёт один и тот же
// результат, повторный выбор того же фото не скачет.

export interface PassportScanResult {
  guestType: GuestType;
  idNumber?: string;
  inn?: string;
  citizenship?: string;
  passportNumber?: string;
  passportCountry?: string;
  /** YYYY-MM-DD. */
  passportExpiry?: string;
}

const FOREIGN_CITIZENSHIPS = ["Казахстан", "Узбекистан", "Россия", "Таджикистан", "Турция"];

function randomDigits(rnd: () => number, length: number): string {
  let s = "";
  for (let i = 0; i < length; i++) s += Math.floor(rnd() * 10);
  return s;
}

export function simulatePassportScan(fileSeed: string): PassportScanResult {
  const rnd = rngFor(`passport-scan:${fileSeed}`);
  if (rnd() > 0.3) {
    return {
      guestType: "resident",
      idNumber: randomDigits(rnd, 11),
      inn: randomDigits(rnd, 14),
    };
  }
  const citizenship = FOREIGN_CITIZENSHIPS[Math.floor(rnd() * FOREIGN_CITIZENSHIPS.length)];
  const passportLetters = String.fromCharCode(65 + Math.floor(rnd() * 26)) + String.fromCharCode(65 + Math.floor(rnd() * 26));
  return {
    guestType: "foreign",
    citizenship,
    passportNumber: `${passportLetters}${randomDigits(rnd, 7)}`,
    passportCountry: citizenship,
    passportExpiry: dayjs()
      .add(1 + Math.floor(rnd() * 5), "year")
      .format("YYYY-MM-DD"),
  };
}

export const VISIT_PURPOSE_LABELS: Record<VisitPurpose, string> = {
  tourism: "Туризм",
  business: "Бизнес",
  other: "Другое",
};

export const BOARD_TYPE_LABELS: Record<BookingBoardType, string> = {
  roomOnly: "Только проживание",
  breakfast: "Завтрак включён",
  halfBoard: "Завтрак и ужин",
  allInclusive: "Всё включено",
};

export interface HotelBooking {
  id: number;
  roomNumber: string;
  guestName: string;
  /** YYYY-MM-DD, включительно. */
  checkIn: string;
  /** YYYY-MM-DD, гость выезжает этим утром — бар не закрашивает этот столбец. */
  checkOut: string;
  status: HotelBookingStatus;

  // ── Всё ниже — необязательно и заполняется только вручную, через форму
  // CreateBookingButton. У процедурно сгенерированных броней (getHotelBookings)
  // этих полей нет — это не подключённый бэкенд, а то, что реально ввёл
  // пользователь при создании конкретной брони.
  guestPhone?: string;
  guestEmail?: string;
  adults?: number;
  children?: number;
  guaranteeMethod?: BookingGuaranteeMethod;
  boardType?: BookingBoardType;
  guestType?: GuestType;
  /** Гражданин КР: паспорт (ID-карта). */
  idNumber?: string;
  inn?: string;
  /** Иностранец: загранпаспорт + то, что требует миграционный учёт в КР. */
  citizenship?: string;
  passportNumber?: string;
  passportCountry?: string;
  /** YYYY-MM-DD. */
  passportExpiry?: string;
  /** YYYY-MM-DD — дата въезда в КР. */
  entryDate?: string;
  migrationCardNumber?: string;
  visitPurpose?: VisitPurpose;
  /** Фото документа как data URL — демо-хранилище (localStorage), не файловый сервер. */
  passportPhotoDataUrl?: string;
  bookingSource?: BookingSource;
  specialRequests?: string;
  /** Юрлицо/командировочное удостоверение — для закрывающих документов. */
  companyInfo?: string;
  dataConsent?: boolean;
  /** Кто создал бронь — имя реального залогиненного сотрудника (usePermissions().employee), не выбор из списка. */
  createdBy?: string;
  /** ISO-дата и время создания брони. */
  createdAt?: string;
}

/**
 * Брони на видимое окно дат + запас по 4 дня с каждой стороны (бар должен
 * «выходить» за левый/правый край грида у броней, начавшихся раньше окна).
 * Детерминировано по номеру — один и тот же диапазон дат всегда даёт одну и
 * ту же раскладку.
 */
export function getHotelBookings(dateFrom: string, dateTo: string): HotelBooking[] {
  const rangeStart = dayjs(dateFrom).subtract(4, "day");
  const rangeEnd = dayjs(dateTo).add(4, "day");
  const today = dayjs().startOf("day");
  const out: HotelBooking[] = [];
  let bookingId = 960001;

  for (const room of getHotelRooms()) {
    const rnd = rngFor(`bookings:${room}`);
    let cursor = rangeStart;
    let guard = 0;
    while (cursor.isBefore(rangeEnd) && guard < 15) {
      guard++;
      const gapDays = Math.floor(rnd() * 3); // 0–2 дня простоя между бронями
      cursor = cursor.add(gapDays, "day");
      if (!cursor.isBefore(rangeEnd)) break;
      const nights = 1 + Math.floor(rnd() * 6); // 1–6 ночей
      const checkIn = cursor;
      const checkOut = cursor.add(nights, "day");
      // isSameOrBefore не подключён глобально (см. src/index.tsx) — !isAfter эквивалентен.
      const status: HotelBookingStatus = !checkOut.isAfter(today, "day")
        ? "completed"
        : checkIn.isAfter(today, "day")
        ? "confirmed"
        : "arrived";
      // Источник — единственное «ручное» поле брони, которое всё же есть и у
      // сгенерированных: в реальности его определяет канал/интеграция (OTA,
      // сайт, звонок), не сотрудник за экраном — тот же принцип, по которому
      // «Тариф» на приёме OTA-платформы определяется автоматически.
      const sourceRoll = rnd();
      const bookingSource: BookingSource =
        sourceRoll < 0.35 ? "ota" : sourceRoll < 0.55 ? "direct" : sourceRoll < 0.75 ? "phone" : sourceRoll < 0.9 ? "agent" : "walkin";
      out.push({
        id: bookingId++,
        roomNumber: room,
        guestName: MOCK_PATIENT_NAMES[Math.floor(rnd() * MOCK_PATIENT_NAMES.length)],
        checkIn: checkIn.format("YYYY-MM-DD"),
        checkOut: checkOut.format("YYYY-MM-DD"),
        status,
        bookingSource,
      });
      cursor = checkOut;
    }
  }
  return out;
}

// ── Брони, созданные вручную (CreateBookingButton) — общее хранилище ───────
//
// CreateBookingButton и RoomBookingGrid — соседние, а не родитель-потомок
// компоненты на одной странице: обычные пропсы тут не помогут. Модульный
// стор + подписка (useSyncExternalStore в RoomBookingGrid) — созданная бронь
// появляется в сетке сразу, без reload. localStorage — переживает и
// перезагрузку страницы; это всё ещё демо-хранилище браузерной вкладки, не
// бэкенд. Обе страницы (CreateBookingButton/RoomBookingGrid) уже переведены
// на реальный createReservation/getCalendar — стор ниже осиротел, оставлен
// про запас (снос мока затронул только фейковый Viva-переключатель).

const CUSTOM_BOOKINGS_KEY = "mamadoc:mockCustomBookings";
const customBookingListeners = new Set<() => void>();

function readCustomBookingsFromStorage(): HotelBooking[] {
  try {
    const raw = window.localStorage.getItem(CUSTOM_BOOKINGS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (b): b is HotelBooking =>
        !!b &&
        typeof b === "object" &&
        typeof (b as HotelBooking).id === "number" &&
        typeof (b as HotelBooking).roomNumber === "string" &&
        typeof (b as HotelBooking).guestName === "string" &&
        typeof (b as HotelBooking).checkIn === "string" &&
        typeof (b as HotelBooking).checkOut === "string",
    );
  } catch {
    return [];
  }
}

/** Кэш-снимок для useSyncExternalStore: стабильная ссылка между записями —
 *  иначе getSnapshot() возвращал бы новый массив на каждый вызов и подписчик
 *  перерисовывался бы бесконечно. */
let customBookingsCache: HotelBooking[] = readCustomBookingsFromStorage();

function persistCustomBookings(next: HotelBooking[]): void {
  customBookingsCache = next;
  try {
    window.localStorage.setItem(CUSTOM_BOOKINGS_KEY, JSON.stringify(next));
  } catch {
    // приватный режим/запрет на localStorage — бронь доживёт до конца вкладки в памяти
  }
  customBookingListeners.forEach((fn) => fn());
}

/**
 * Добавляет бронь из формы CreateBookingButton; статус выводится из дат.
 * Принимает все поля HotelBooking кроме id/status — форма может прислать
 * только обязательный минимум (номер/гость/даты) или заполнить всё вплоть
 * до фото паспорта, остальное просто останется undefined.
 */
export function addCustomBooking(input: Omit<HotelBooking, "id" | "status">): HotelBooking {
  const today = dayjs().startOf("day");
  const status: HotelBookingStatus = !dayjs(input.checkOut).isAfter(today, "day")
    ? "completed"
    : dayjs(input.checkIn).isAfter(today, "day")
    ? "confirmed"
    : "arrived";
  const booking: HotelBooking = { ...input, id: Date.now(), status };
  persistCustomBookings([...customBookingsCache, booking]);
  return booking;
}

/** Подписка на изменения хранилища — для React.useSyncExternalStore. */
export function subscribeCustomBookings(onChange: () => void): () => void {
  customBookingListeners.add(onChange);
  return () => customBookingListeners.delete(onChange);
}

/** Снимок для useSyncExternalStore — стабильная ссылка, пока нет новых записей. */
export function getCustomBookingsSnapshot(): HotelBooking[] {
  return customBookingsCache;
}

// ── Доступность номера — для RoomDetailsDialog.tsx ──────────────────────────

/** Свободный период. `to` не включительно — тем же смыслом, что checkOut брони. */
export interface RoomFreeRange {
  from: string;
  to: string;
}

/**
 * Брони и свободные окна номера за диапазон [dateFrom, dateTo) — сгенерированные
 * (getHotelBookings) и ручные (customBookingsCache) вместе, склеенные в один
 * список по возрастанию заезда. Свободные периоды — то, что осталось между
 * бронями внутри окна: используется модалкой деталей номера.
 */
export function getRoomAvailability(
  room: string,
  dateFrom: string,
  dateTo: string,
): { bookings: HotelBooking[]; freeRanges: RoomFreeRange[] } {
  const generated = getHotelBookings(dateFrom, dateTo).filter((b) => b.roomNumber === room);
  const custom = customBookingsCache.filter((b) => b.roomNumber === room);
  const all = [...generated, ...custom].sort((a, b) =>
    a.checkIn < b.checkIn ? -1 : a.checkIn > b.checkIn ? 1 : 0,
  );

  const freeRanges: RoomFreeRange[] = [];
  let cursor = dayjs(dateFrom);
  const windowEnd = dayjs(dateTo);
  for (const b of all) {
    const checkIn = dayjs(b.checkIn);
    const checkOut = dayjs(b.checkOut);
    if (!checkOut.isAfter(cursor)) continue; // бронь целиком раньше курсора — не актуальна
    if (checkIn.isAfter(cursor)) {
      freeRanges.push({ from: cursor.format("YYYY-MM-DD"), to: checkIn.format("YYYY-MM-DD") });
    }
    cursor = checkOut;
  }
  if (cursor.isBefore(windowEnd)) {
    freeRanges.push({ from: cursor.format("YYYY-MM-DD"), to: windowEnd.format("YYYY-MM-DD") });
  }
  return { bookings: all, freeRanges };
}

// ── Отчёт за день — для HotelReportsPage.tsx ────────────────────────────────
//
// Кто заселён, на сколько ночей, сколько заплатит по тарифу номера и сколько
// номеров свободно на конкретную дату — та же смесь сгенерированных
// (getHotelBookings) и ручных (customBookingsCache) броней, что у
// getRoomAvailability/getHotelGuests выше, но по каждому номеру на один день,
// а не по одному номеру на диапазон. «Выручка» — тариф занятых на эту дату
// номеров за ночь, а не сумма броней целиком (иначе многодневная бронь
// задваивалась бы в отчётах за каждый день своего проживания).

export interface HotelDailyReportRow {
  room: string;
  categoryName: string;
  luxury: boolean;
  /** Итоговый тариф номера, сом/ночь — база категории + наценки характеристик (getCategoryTotalPrice). */
  pricePerNight: number;
  /** undefined — номер свободен на эту дату. */
  booking?: HotelBooking;
}

export interface HotelDailyReport {
  date: string;
  totalRooms: number;
  occupiedRooms: number;
  freeRooms: number;
  occupancyPercent: number;
  /** Брони с заездом/выездом именно в эту дату (не «проживающие», а конкретно заехавшие/выехавшие). */
  arrivals: number;
  departures: number;
  /** Сумма тарифов занятых на эту дату номеров — выручка за ночь. */
  revenue: number;
  rows: HotelDailyReportRow[];
}

/**
 * Отчёт по одной дате: по каждому номеру — свободен он или кем занят
 * (checkOut не включительно — тот же контракт, что у остальной шахматки),
 * плюс агрегаты (загрузка/выручка/заезды/выезды).
 */
export function getHotelDailyReport(date: string): HotelDailyReport {
  const windowTo = dayjs(date).add(1, "day").format("YYYY-MM-DD");
  const all = [...getHotelBookings(date, windowTo), ...customBookingsCache];

  const rows: HotelDailyReportRow[] = getHotelRooms().map((room) => {
    const category = getRoomCategory(room)!;
    const booking = all.find(
      (b) => b.roomNumber === room && !dayjs(date).isBefore(b.checkIn) && dayjs(date).isBefore(b.checkOut),
    );
    return {
      room,
      categoryName: category.name,
      luxury: !!category.luxury,
      pricePerNight: getCategoryTotalPrice(category),
      booking,
    };
  });

  const occupied = rows.filter((r) => r.booking);
  const totalRooms = getHotelRooms().length;

  return {
    date,
    totalRooms,
    occupiedRooms: occupied.length,
    freeRooms: totalRooms - occupied.length,
    occupancyPercent: Math.round((occupied.length / totalRooms) * 100),
    arrivals: all.filter((b) => b.checkIn === date).length,
    departures: all.filter((b) => b.checkOut === date).length,
    revenue: occupied.reduce((sum, r) => sum + r.pricePerNight, 0),
    rows,
  };
}

// ── Кухня — для HotelKitchenPage.tsx ────────────────────────────────────────
//
// Два слоя данных: (1) меню — во сколько какое блюдо готовить и на сколько
// порций (порции считаются от занятых на дату номеров getHotelDailyReport —
// та же «реальная» связка с бронями, что у выручки выше, а не оторванные
// случайные числа); (2) закупка — сколько продукта нужно по рецептам
// — план, и что реально купили — факт. План пересчитывается каждый раз
// заново (производный от меню), а факт — то единственное, что реально
// «отправляют» на этой странице, поэтому только он живёт в сторе с
// localStorage, тем же приёмом, что customBookings/интеграции: сотрудник
// мог купить 10 сосисок вместо 5 — план не редактируется (это норма
// расхода), а факт редактируется всегда, в том числе после того, как уже
// был один раз сохранён.

export type MealType = "breakfast" | "lunch" | "dinner";

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Завтрак",
  lunch: "Обед",
  dinner: "Ужин",
};

/**
 * Промежуток подачи — гость приходит в любой момент внутри окна, кухня не
 * готовит блюдо к строго одной минуте. Раньше время было у каждого блюда
 * отдельно (07:00/07:30 и т.п.) — по факту это один и тот же промежуток на
 * весь приём пищи, поэтому вынесено на уровень MealType, а не блюда.
 */
export const MEAL_SERVING_WINDOW: Record<MealType, { from: string; to: string }> = {
  breakfast: { from: "07:30", to: "10:00" },
  lunch: { from: "13:00", to: "15:00" },
  dinner: { from: "19:00", to: "21:00" },
};

export interface KitchenDishDef {
  id: string;
  meal: MealType;
  name: string;
  /** Порций на один занятый номер — дробное: не каждое блюдо берут все гости. */
  portionsPerRoom: number;
}

/** Условное меню отеля на день — три приёма пищи, без привязки к дате (повторяется каждый день демо). */
export const KITCHEN_MENU: KitchenDishDef[] = [
  { id: "b1", meal: "breakfast", name: "Омлет с зеленью", portionsPerRoom: 0.9 },
  { id: "b2", meal: "breakfast", name: "Каша овсяная", portionsPerRoom: 0.6 },
  { id: "b3", meal: "breakfast", name: "Сосиски с гарниром", portionsPerRoom: 0.7 },
  { id: "l1", meal: "lunch", name: "Борщ", portionsPerRoom: 0.8 },
  { id: "l2", meal: "lunch", name: "Плов", portionsPerRoom: 0.7 },
  { id: "l3", meal: "lunch", name: "Салат Оливье", portionsPerRoom: 0.6 },
  { id: "d1", meal: "dinner", name: "Шашлык из курицы", portionsPerRoom: 0.7 },
  { id: "d2", meal: "dinner", name: "Манты", portionsPerRoom: 0.6 },
  { id: "d3", meal: "dinner", name: "Овощи на гриле", portionsPerRoom: 0.5 },
];

export interface KitchenDish extends KitchenDishDef {
  /** Порций на выбранную дату = round(занятых номеров × portionsPerRoom), минимум 1. */
  portions: number;
}

interface KitchenIngredientUse {
  dishId: string;
  ingredient: string;
  unit: "шт" | "кг" | "г" | "л";
  qtyPerPortion: number;
}

const KITCHEN_RECIPE_INGREDIENTS: KitchenIngredientUse[] = [
  { dishId: "b1", ingredient: "Яйца", unit: "шт", qtyPerPortion: 2 },
  { dishId: "b1", ingredient: "Зелень", unit: "г", qtyPerPortion: 15 },
  { dishId: "b2", ingredient: "Овсяные хлопья", unit: "г", qtyPerPortion: 60 },
  { dishId: "b2", ingredient: "Молоко", unit: "л", qtyPerPortion: 0.2 },
  { dishId: "b3", ingredient: "Сосиски", unit: "шт", qtyPerPortion: 2 },
  { dishId: "b3", ingredient: "Картофель", unit: "кг", qtyPerPortion: 0.2 },
  { dishId: "l1", ingredient: "Свёкла", unit: "шт", qtyPerPortion: 0.3 },
  { dishId: "l1", ingredient: "Говядина", unit: "кг", qtyPerPortion: 0.12 },
  { dishId: "l2", ingredient: "Рис", unit: "кг", qtyPerPortion: 0.15 },
  { dishId: "l2", ingredient: "Баранина", unit: "кг", qtyPerPortion: 0.13 },
  { dishId: "l2", ingredient: "Морковь", unit: "шт", qtyPerPortion: 0.4 },
  { dishId: "l3", ingredient: "Картофель", unit: "кг", qtyPerPortion: 0.15 },
  { dishId: "l3", ingredient: "Колбаса варёная", unit: "кг", qtyPerPortion: 0.06 },
  { dishId: "d1", ingredient: "Курица (бедро)", unit: "кг", qtyPerPortion: 0.2 },
  { dishId: "d2", ingredient: "Тесто для мантов", unit: "кг", qtyPerPortion: 0.1 },
  { dishId: "d2", ingredient: "Баранина", unit: "кг", qtyPerPortion: 0.14 },
  { dishId: "d3", ingredient: "Овощи ассорти", unit: "кг", qtyPerPortion: 0.18 },
];

/** Ориентировочная цена за единицу измерения (сом) — для плановой суммы закупки. */
const INGREDIENT_PRICE_PER_UNIT: Record<string, number> = {
  "Яйца": 8,
  "Зелень": 4,
  "Овсяные хлопья": 3,
  "Молоко": 90,
  "Сосиски": 45,
  "Картофель": 45,
  "Свёкла": 20,
  "Говядина": 550,
  "Рис": 130,
  "Баранина": 650,
  "Морковь": 15,
  "Колбаса варёная": 480,
  "Курица (бедро)": 320,
  "Тесто для мантов": 180,
  "Овощи ассорти": 90,
};

/** Единица измерения продукта — берётся с первого рецепта, где он встречается (везде одна и та же). */
const KITCHEN_INGREDIENT_UNITS: Record<string, KitchenIngredientUse["unit"]> = {};
for (const use of KITCHEN_RECIPE_INGREDIENTS) {
  KITCHEN_INGREDIENT_UNITS[use.ingredient] ??= use.unit;
}

function roundQty(qty: number, unit: KitchenIngredientUse["unit"]): number {
  if (unit === "шт") return Math.ceil(qty);
  return Math.round(qty * 10) / 10;
}

// ── Остаток на складе — для HotelKitchenPage.tsx ────────────────────────────
//
// «Нужно по рецепту» — это весь расход, но часть продукта может уже лежать
// на кухне с прошлой закупки, и докупать нужно только разницу. В отличие от
// плана и факта закупки выше, остаток не привязан к дате — это состояние
// склада прямо сейчас, поэтому у него нет ключа даты, только продукт;
// стартовые значения детерминированы (сид по названию продукта), а любая
// правка сотрудником замещает их насовсем, тем же приёмом localStorage +
// useSyncExternalStore, что у факта закупки.

const KITCHEN_STOCK_KEY = "mamadoc:mockKitchenStock";
const kitchenStockListeners = new Set<() => void>();

function seededDefaultStock(ingredient: string, unit: KitchenIngredientUse["unit"]): number {
  const rnd = rngFor(`stock:${ingredient}`);
  const base =
    unit === "шт" ? 2 + Math.floor(rnd() * 6) : unit === "л" ? 1 + rnd() * 3 : unit === "кг" ? 0.5 + rnd() * 2.5 : 80 + rnd() * 250;
  return roundQty(base, unit);
}

function readKitchenStockFromStorage(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(KITCHEN_STOCK_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, number>;
  } catch {
    return {};
  }
}

/** Только правки сотрудника — продукты без записи здесь показывают детерминированный дефолт (seededDefaultStock). */
let kitchenStockOverrides: Record<string, number> = readKitchenStockFromStorage();

function persistKitchenStock(next: Record<string, number>): void {
  kitchenStockOverrides = next;
  try {
    window.localStorage.setItem(KITCHEN_STOCK_KEY, JSON.stringify(next));
  } catch {
    // приватный режим/запрет на localStorage — доживёт до конца вкладки в памяти
  }
  kitchenStockListeners.forEach((fn) => fn());
}

/** Текущий остаток продукта на складе — правка сотрудника, если есть, иначе детерминированный дефолт. */
export function getKitchenStock(ingredient: string): number {
  if (ingredient in kitchenStockOverrides) return kitchenStockOverrides[ingredient];
  return seededDefaultStock(ingredient, KITCHEN_INGREDIENT_UNITS[ingredient] ?? "шт");
}

export function setKitchenStock(ingredient: string, qty: number): void {
  persistKitchenStock({ ...kitchenStockOverrides, [ingredient]: qty });
}

export function subscribeKitchenStock(onChange: () => void): () => void {
  kitchenStockListeners.add(onChange);
  return () => kitchenStockListeners.delete(onChange);
}

export function getKitchenStockSnapshot(): Record<string, number> {
  return kitchenStockOverrides;
}

export interface KitchenShoppingItem {
  ingredient: string;
  unit: KitchenIngredientUse["unit"];
  /** Сколько нужно по рецептам на порции этой даты — весь расход, без поправки на остаток. */
  neededQty: number;
  /** Сколько уже есть на складе прямо сейчас (getKitchenStock). */
  inStockQty: number;
  /** Сколько реально докупить = max(0, neededQty − inStockQty). */
  toBuyQty: number;
  pricePerUnit: number;
  /** Плановая сумма закупки = toBuyQty × pricePerUnit — то, что реально придётся потратить. */
  plannedAmount: number;
}

export interface KitchenDayPlan {
  date: string;
  occupiedRooms: number;
  dishes: KitchenDish[];
  shoppingList: KitchenShoppingItem[];
}

/** Меню и закупка на дату — порции от занятых номеров (getHotelDailyReport), не случайные числа. */
export function getKitchenDayPlan(date: string): KitchenDayPlan {
  const occupiedRooms = getHotelDailyReport(date).occupiedRooms;

  const dishes: KitchenDish[] = KITCHEN_MENU.map((def) => ({
    ...def,
    portions: Math.max(1, Math.round(occupiedRooms * def.portionsPerRoom)),
  }));

  const needed = new Map<string, { unit: KitchenIngredientUse["unit"]; qty: number }>();
  for (const dish of dishes) {
    for (const use of KITCHEN_RECIPE_INGREDIENTS) {
      if (use.dishId !== dish.id) continue;
      const qty = use.qtyPerPortion * dish.portions;
      const existing = needed.get(use.ingredient);
      if (existing) existing.qty += qty;
      else needed.set(use.ingredient, { unit: use.unit, qty });
    }
  }

  const shoppingList: KitchenShoppingItem[] = [...needed.entries()]
    .map(([ingredient, { unit, qty }]) => {
      const neededQty = roundQty(qty, unit);
      const inStockQty = getKitchenStock(ingredient);
      const toBuyQty = Math.max(0, roundQty(neededQty - inStockQty, unit));
      const pricePerUnit = INGREDIENT_PRICE_PER_UNIT[ingredient] ?? 0;
      return {
        ingredient,
        unit,
        neededQty,
        inStockQty,
        toBuyQty,
        pricePerUnit,
        plannedAmount: Math.round(toBuyQty * pricePerUnit),
      };
    })
    .sort((a, b) => a.ingredient.localeCompare(b.ingredient, "ru"));

  return { date, occupiedRooms, dishes, shoppingList };
}

// ── Факт закупки — редактируемый ввод сотрудника (HotelKitchenPage.tsx) ─────
//
// План (выше) — чистая функция от даты, ничего не хранит. Факт — то, что
// реально ввёл сотрудник («купили 10 сосисок»), и именно его нужно уметь
// поправить, если он оказался неверным («на деле нужно было 5»), поэтому
// это единственная часть кухни, которая живёт в сторе — тот же приём
// localStorage + useSyncExternalStore, что customBookings/интеграции выше.

export interface KitchenPurchaseRecord {
  purchasedQty: number;
  actualPricePerUnit: number;
  purchasedBy?: string;
  /** ISO-дата и время последнего сохранения — «когда отметили купленным / поправили». */
  updatedAt: string;
}

const KITCHEN_PURCHASES_KEY = "mamadoc:mockKitchenPurchases";
const kitchenPurchaseListeners = new Set<() => void>();

/** Ключ записи в сторе — закупка привязана к дате отчёта и продукту. */
function purchaseKey(date: string, ingredient: string): string {
  return `${date}__${ingredient}`;
}

function readKitchenPurchasesFromStorage(): Record<string, KitchenPurchaseRecord> {
  try {
    const raw = window.localStorage.getItem(KITCHEN_PURCHASES_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, KitchenPurchaseRecord>;
  } catch {
    return {};
  }
}

let kitchenPurchasesCache: Record<string, KitchenPurchaseRecord> = readKitchenPurchasesFromStorage();

function persistKitchenPurchases(next: Record<string, KitchenPurchaseRecord>): void {
  kitchenPurchasesCache = next;
  try {
    window.localStorage.setItem(KITCHEN_PURCHASES_KEY, JSON.stringify(next));
  } catch {
    // приватный режим/запрет на localStorage — доживёт до конца вкладки в памяти
  }
  kitchenPurchaseListeners.forEach((fn) => fn());
}

/** Сохраняет/перезаписывает факт закупки — тот же вызов и для первой отметки, и для правки. */
export function setKitchenPurchase(
  date: string,
  ingredient: string,
  input: { purchasedQty: number; actualPricePerUnit: number; purchasedBy?: string },
): void {
  const key = purchaseKey(date, ingredient);
  persistKitchenPurchases({
    ...kitchenPurchasesCache,
    [key]: { ...input, updatedAt: dayjs().toISOString() },
  });
}

/** Убирает отметку «куплено» — строка возвращается к плановому состоянию. */
export function clearKitchenPurchase(date: string, ingredient: string): void {
  const key = purchaseKey(date, ingredient);
  if (!(key in kitchenPurchasesCache)) return;
  const next = { ...kitchenPurchasesCache };
  delete next[key];
  persistKitchenPurchases(next);
}

export function getKitchenPurchase(date: string, ingredient: string): KitchenPurchaseRecord | undefined {
  return kitchenPurchasesCache[purchaseKey(date, ingredient)];
}

export function subscribeKitchenPurchases(onChange: () => void): () => void {
  kitchenPurchaseListeners.add(onChange);
  return () => kitchenPurchaseListeners.delete(onChange);
}

export function getKitchenPurchasesSnapshot(): Record<string, KitchenPurchaseRecord> {
  return kitchenPurchasesCache;
}

// ── Гости — для HotelGuestsPage.tsx, AddGuestDrawer.tsx и GuestDetailsDialog.tsx ──
//
// Отдельной картотеки гостей в API нет — но с AddGuestDrawer.tsx гость может
// появиться и без брони (тот же принцип, что пациент в реальном МамаДокторе:
// «Добавить пациента» заводит запись независимо от того, есть ли уже приём).
// getHotelGuests() ниже склеивает две части в одну строку на гостя: имя,
// встреченное в брони (guestName — сгенерированной или ручной), и профиль без
// брони (customGuestsCache) — тот же человек не должен задвоиться в списке.

export interface HotelGuestSummary {
  name: string;
  phone: string;
  /** Все брони этого гостя за окно агрегации (см. getHotelGuests), по возрастанию заезда — пусто, если гость ещё не заезжал. */
  bookings: HotelBooking[];
  /** Фото — с самой свежей подробной брони или из профиля (AddGuestDrawer), для аватара в списке гостей, как photoUrl у реального пациента. */
  photoDataUrl?: string;
  /** Документ гостя — реквизиты личности, не привязаны к конкретной брони (в отличие от цели визита/источника брони). Источник — самая свежая бронь с этими полями, иначе профиль. */
  guestType?: GuestType;
  idNumber?: string;
  inn?: string;
  citizenship?: string;
  passportNumber?: string;
  passportCountry?: string;
  /** YYYY-MM-DD. */
  passportExpiry?: string;
  /** Платформа, с которой пришёл гость — самая свежая бронь с этим полем, иначе профиль (AddGuestDrawer). Показывается в колонке списка «Гости». */
  source?: BookingSource;
  isBlacklisted: boolean;
  blacklistReason?: string;
}

/** Телефон, детерминированный по имени — тот же гость всегда получает тот же номер. */
function phoneForGuestName(name: string): string {
  const digits = String(hashString(`phone:${name}`) % 1_000_000).padStart(6, "0");
  return `+996 700 ${digits.slice(0, 3)} ${digits.slice(3, 6)}`;
}

// ── Чёрный список гостей — как isBlacklisted у реального пациента ──────────
//
// Отдельной картотеки гостей нет (см. выше), поэтому чёрный список ведётся
// по имени, а не по id записи — тот же приём localStorage-стора, что у
// остальных редактируемых сущностей отеля.

export interface GuestBlacklistRecord {
  reason?: string;
}

const GUEST_BLACKLIST_KEY = "mamadoc:mockGuestBlacklist";
const guestBlacklistListeners = new Set<() => void>();

function readGuestBlacklistFromStorage(): Record<string, GuestBlacklistRecord> {
  try {
    const raw = window.localStorage.getItem(GUEST_BLACKLIST_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, GuestBlacklistRecord>;
  } catch {
    return {};
  }
}

let guestBlacklistCache: Record<string, GuestBlacklistRecord> = readGuestBlacklistFromStorage();

function persistGuestBlacklist(next: Record<string, GuestBlacklistRecord>): void {
  guestBlacklistCache = next;
  try {
    window.localStorage.setItem(GUEST_BLACKLIST_KEY, JSON.stringify(next));
  } catch {
    // приватный режим/запрет на localStorage — доживёт до конца вкладки в памяти
  }
  guestBlacklistListeners.forEach((fn) => fn());
}

export function setGuestBlacklisted(name: string, blacklisted: boolean, reason?: string): void {
  if (!blacklisted) {
    if (!(name in guestBlacklistCache)) return;
    const next = { ...guestBlacklistCache };
    delete next[name];
    persistGuestBlacklist(next);
    return;
  }
  persistGuestBlacklist({ ...guestBlacklistCache, [name]: { reason: reason?.trim() || undefined } });
}

export function subscribeGuestBlacklist(onChange: () => void): () => void {
  guestBlacklistListeners.add(onChange);
  return () => guestBlacklistListeners.delete(onChange);
}

export function getGuestBlacklistSnapshot(): Record<string, GuestBlacklistRecord> {
  return guestBlacklistCache;
}

// ── Гости без брони — AddGuestDrawer.tsx ────────────────────────────────────
//
// «Добавить» на «Гостях» заводит запись здесь, не бронь: тот же стор-приём,
// что HOTEL_ROOM_CATEGORIES/HOTEL_ROLES (localStorage + слушатели). Поля —
// то, что относится к самому человеку (документ), а не к конкретному заезду
// (цель визита, миграционная карта остаются полями брони в CreateBookingButton
// — они меняются от поездки к поездке). Источник — исключение: это канал, по
// которому гость ВООБЩЕ появился в базе (сайт/OTA/агент), тоже свойство
// человека, а не только брони — отдельная бронь может уточнить его позже
// (getHotelGuests ниже берёт самую свежую бронь с этим полем, иначе профиль).

export interface HotelGuestProfile {
  name: string;
  phone: string;
  photoDataUrl?: string;
  guestType?: GuestType;
  idNumber?: string;
  inn?: string;
  citizenship?: string;
  passportNumber?: string;
  passportCountry?: string;
  /** YYYY-MM-DD. */
  passportExpiry?: string;
  source?: BookingSource;
  /** Кто завёл гостя — usePermissions().employee, не выбор из списка. */
  createdBy?: string;
  createdAt?: string;
}

const CUSTOM_GUESTS_KEY = "mamadoc:mockCustomGuests";
const customGuestsListeners = new Set<() => void>();

function readCustomGuestsFromStorage(): HotelGuestProfile[] {
  try {
    const raw = window.localStorage.getItem(CUSTOM_GUESTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HotelGuestProfile[]) : [];
  } catch {
    return [];
  }
}

let customGuestsCache: HotelGuestProfile[] = readCustomGuestsFromStorage();

function persistCustomGuests(next: HotelGuestProfile[]): void {
  customGuestsCache = next;
  try {
    window.localStorage.setItem(CUSTOM_GUESTS_KEY, JSON.stringify(next));
  } catch {
    // приватный режим/запрет на localStorage — доживёт до конца вкладки в памяти
  }
  customGuestsListeners.forEach((fn) => fn());
}

/** Заводит гостя без брони. Повторное имя перезаписывает профиль тем же именем — не задваивает. */
export function addCustomGuest(profile: HotelGuestProfile): void {
  const idx = customGuestsCache.findIndex((g) => g.name === profile.name);
  const next = idx >= 0 ? customGuestsCache.map((g, i) => (i === idx ? profile : g)) : [...customGuestsCache, profile];
  persistCustomGuests(next);
}

export function subscribeCustomGuests(onChange: () => void): () => void {
  customGuestsListeners.add(onChange);
  return () => customGuestsListeners.delete(onChange);
}

export function getCustomGuestsSnapshot(): HotelGuestProfile[] {
  return customGuestsCache;
}

/**
 * Все гости за широкое окно (−60…+120 дней от сегодня) — сгенерированные
 * брони на такой диапазон дают достаточно разнообразия для списка, плюс
 * все ручные брони целиком (они не привязаны к окну дат по построению), плюс
 * профили без брони (customGuestsCache) — гости из AddGuestDrawer, у которых
 * заезда ещё не было.
 */
export function getHotelGuests(): HotelGuestSummary[] {
  const today = dayjs().startOf("day");
  const windowFrom = today.subtract(60, "day").format("YYYY-MM-DD");
  const windowTo = today.add(120, "day").format("YYYY-MM-DD");
  const all = [...getHotelBookings(windowFrom, windowTo), ...customBookingsCache];

  const byName = new Map<string, HotelBooking[]>();
  for (const b of all) {
    const arr = byName.get(b.guestName) ?? [];
    arr.push(b);
    byName.set(b.guestName, arr);
  }
  for (const profile of customGuestsCache) {
    if (!byName.has(profile.name)) byName.set(profile.name, []);
  }

  const guests: HotelGuestSummary[] = [];
  for (const [name, bookings] of byName) {
    bookings.sort((a, b) => (a.checkIn < b.checkIn ? -1 : a.checkIn > b.checkIn ? 1 : 0));
    // Реально введённый в форме телефон важнее сгенерированного — берём
    // с самой свежей брони, где он есть.
    const enteredPhone = [...bookings].reverse().find((b) => b.guestPhone)?.guestPhone;
    const latestSource = [...bookings].reverse().find((b) => b.bookingSource)?.bookingSource;
    const detailed = findDetailedGuestBooking(bookings);
    const profile = customGuestsCache.find((g) => g.name === name);
    const blacklist = guestBlacklistCache[name];
    guests.push({
      name,
      phone: enteredPhone ?? profile?.phone ?? phoneForGuestName(name),
      bookings,
      photoDataUrl: detailed?.passportPhotoDataUrl ?? profile?.photoDataUrl,
      guestType: detailed?.guestType ?? profile?.guestType,
      idNumber: detailed?.idNumber ?? profile?.idNumber,
      inn: detailed?.inn ?? profile?.inn,
      citizenship: detailed?.citizenship ?? profile?.citizenship,
      passportNumber: detailed?.passportNumber ?? profile?.passportNumber,
      passportCountry: detailed?.passportCountry ?? profile?.passportCountry,
      passportExpiry: detailed?.passportExpiry ?? profile?.passportExpiry,
      source: latestSource ?? profile?.source,
      isBlacklisted: blacklist != null,
      blacklistReason: blacklist?.reason,
    });
  }
  guests.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  return guests;
}

/**
 * Данные документа/контактов вводятся один раз в форме брони
 * (CreateBookingButton), не хранятся отдельно на гостя. Берём их с самой
 * свежей брони, где они реально заполнены — так последняя введённая версия
 * побеждает более раннюю. Общий хелпер для GuestDetailsDialog (что
 * показать) и CreateBookingButton (чем предзаполнить форму при выборе
 * существующего гостя) — то же самое «найти последнюю подробную бронь».
 */
export function findDetailedGuestBooking(bookings: HotelBooking[]): HotelBooking | undefined {
  return [...bookings].reverse().find((b) => b.guestType != null);
}

/** Последние 7 цифр номера — сравнение «тот же человек» устойчивое к формату (+996/8, пробелы, скобки). */
function phoneTail(phone: string): string {
  return phone.replace(/\D/g, "").slice(-7);
}

/**
 * Гости с тем же (или почти тем же) телефоном — защита от дублей в
 * CreateBookingButton, тот же принцип, что getSimilarPatients в реальном
 * МамаДоктор (там — по последним 9 цифрам на бэкенде, тут — по 7 на
 * локальных данных): подсказка, не блокировка. `excludeName` — не
 * предлагать гостя, которого уже выбрали в автоподборе.
 */
export function findGuestsByPhone(phone: string, excludeName?: string): HotelGuestSummary[] {
  const tail = phoneTail(phone);
  if (tail.length < 7) return [];
  return getHotelGuests().filter((g) => g.name !== excludeName && phoneTail(g.phone) === tail);
}

// ── Быстрая бронь — клик по свободной ячейке шахматки (RoomBookingGrid.tsx),
// кнопка «Добавить» на странице «Гости» (HotelGuestsPage) ──────────────────
//
// Грид/страница гостей и CreateBookingButton — соседние, не родитель-потомок
// компоненты (тот же расклад, что у customBookings/selectedHotelDate выше):
// клик по пустой ячейке кладёт сюда номер+дату, CreateBookingButton подписан
// и открывает форму с уже подставленными Номер/Заезд; «Добавить» на «Гостях»
// зовёт без аргументов — просто «открой пустую форму», без подстановки.
// Не персистится — это одноразовый сигнал, не состояние просмотра.

export interface QuickBookingRequest {
  room?: string;
  /** YYYY-MM-DD. */
  checkIn?: string;
}

let quickBookingRequest: QuickBookingRequest | null = null;
const quickBookingListeners = new Set<() => void>();

export function requestQuickBooking(room?: string, checkIn?: string): void {
  quickBookingRequest = { room, checkIn };
  quickBookingListeners.forEach((fn) => fn());
}

/** CreateBookingButton вызывает сразу после того, как забрал запрос себе в форму — иначе следующее открытие формы повторно её подставит. */
export function clearQuickBookingRequest(): void {
  if (quickBookingRequest == null) return;
  quickBookingRequest = null;
  quickBookingListeners.forEach((fn) => fn());
}

export function subscribeQuickBookingRequest(onChange: () => void): () => void {
  quickBookingListeners.add(onChange);
  return () => quickBookingListeners.delete(onChange);
}

export function getQuickBookingRequestSnapshot(): QuickBookingRequest | null {
  return quickBookingRequest;
}

// ── Оплата проживания — для GuestDetailsDialog.tsx ──────────────────────────
//
// Кто заселился — не значит, что оплачено: способ оплаты фиксируется отдельным
// действием персонала при заезде (тот же смысл, что «Оплата приёма» в реальном
// МамаДоктор), поэтому это отдельный стор, а не поле формы создания брони.
// Ключ — номер+заезд, а не id брони: у процедурно сгенерированных броней id
// не стабилен между разными окнами дат (getHotelBookings строит его заново на
// каждый вызов), а номер+дата заезда — единственное, что не меняется.

export type HotelPaymentMethod = "cash" | "card" | "transfer" | "online";

export const HOTEL_PAYMENT_METHOD_LABELS: Record<HotelPaymentMethod, string> = {
  cash: "Наличные",
  card: "Карта",
  transfer: "Банковский перевод",
  online: "Онлайн-оплата",
};

export interface HotelPaymentRecord {
  method: HotelPaymentMethod;
  amount: number;
  note?: string;
  /** Имя реального залогиненного сотрудника (usePermissions().employee), не выбор из списка. */
  acceptedBy: string;
  /** ISO-дата и время. */
  acceptedAt: string;
}

const HOTEL_PAYMENTS_KEY = "mamadoc:mockHotelPayments";
const hotelPaymentListeners = new Set<() => void>();

function paymentKey(roomNumber: string, checkIn: string): string {
  return `${roomNumber}__${checkIn}`;
}

function readHotelPaymentsFromStorage(): Record<string, HotelPaymentRecord> {
  try {
    const raw = window.localStorage.getItem(HOTEL_PAYMENTS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, HotelPaymentRecord>;
  } catch {
    return {};
  }
}

let hotelPaymentsCache: Record<string, HotelPaymentRecord> = readHotelPaymentsFromStorage();

function persistHotelPayments(next: Record<string, HotelPaymentRecord>): void {
  hotelPaymentsCache = next;
  try {
    window.localStorage.setItem(HOTEL_PAYMENTS_KEY, JSON.stringify(next));
  } catch {
    // приватный режим/запрет на localStorage — доживёт до конца вкладки в памяти
  }
  hotelPaymentListeners.forEach((fn) => fn());
}

export function setHotelPayment(
  roomNumber: string,
  checkIn: string,
  input: { method: HotelPaymentMethod; amount: number; note?: string; acceptedBy: string },
): void {
  const key = paymentKey(roomNumber, checkIn);
  persistHotelPayments({
    ...hotelPaymentsCache,
    [key]: { ...input, acceptedAt: dayjs().toISOString() },
  });
}

export function getHotelPayment(roomNumber: string, checkIn: string): HotelPaymentRecord | undefined {
  return hotelPaymentsCache[paymentKey(roomNumber, checkIn)];
}

export function subscribeHotelPayments(onChange: () => void): () => void {
  hotelPaymentListeners.add(onChange);
  return () => hotelPaymentListeners.delete(onChange);
}

export function getHotelPaymentsSnapshot(): Record<string, HotelPaymentRecord> {
  return hotelPaymentsCache;
}

/**
 * Признак Viva — настоящая организация — `vertical: "hotel"` в
 * activeOrganization из /auth/me/ (тот же признак, что VerticalProvider
 * берёт для глоссария). Раньше здесь же жил старый мок-переключатель
 * (фейковая Viva в /auth/context/, localStorage mamadoc:mockActiveContext) —
 * убран вместе с остальным перехватчиком /auth/*, теперь Viva тестируется
 * только настоящим логином (viva-admin), как и полагается реальной
 * организации (hotel-viva-frontend-api.md).
 */
export function useIsVivaActive(): boolean {
  const { activeOrganization } = usePermissions();
  return activeOrganization?.vertical === "hotel";
}

/** Пул сотрудников/услуг клиники — единственный «флейвор» перехватчика после сноса мока Viva. */
const activeEmployeePool = (): MockEmployee[] => MOCK_EMPLOYEES;
const activeServicePool = () => MOCK_SERVICES;
const activeBranchName = (): string => MOCK_BRANCH_NAME;

// ── «Шахматка броней» — верхние карточки-сводка ─────────────────────────────
//
// В нашем API нет сущности «номер» (appointments/scheduling режут по
// сотруднику, не по помещению) — это чисто витринные цифры для демонстрации
// того, какой могла бы быть сводка занятости отеля, по референсу реального
// PMS (Bnovo/Exely WebPMS: «Загрузка на сегодня», «Гости сегодня», «Заметки
// и указания», «Состояние номеров»). Рендерится компонентом
// HotelOccupancyBanner.tsx только при активной Viva.

export interface HotelOccupancySnapshot {
  date: string;
  totalRooms: number;
  occupiedRooms: number;
  occupancyPercent: number;
  guests: {
    /** Заезды сегодня / из них по «горящей» брони (без предварительного бронирования). */
    arrivals: number;
    hotBookings: number;
    departures: number;
    /** Гости, которые уже живут и сегодня не заезжают/не выезжают. */
    staying: number;
    /** Брони с заездом сегодня, которые ещё не отметились (просроченный check-in). */
    dueOut: number;
    freeRooms: number;
  };
  notes: {
    scheduledToday: number;
    overdue: number;
    scheduledTomorrow: number;
    unscheduled: number;
  };
  /** Сумма четырёх полей всегда равна totalRooms — для честных пропорций баров. */
  roomStatus: {
    dirty: number;
    cleaned: number;
    inspected: number;
    repair: number;
  };
}

/**
 * `dateStr` двигает только «Загрузку» и «Гостей» — это показатели конкретного
 * дня (кто заезжает/выезжает 15 сентября — вопрос с осмысленным ответом).
 * «Заметки и указания» и «Состояние номеров» — операционные, про физическое
 * состояние отеля прямо сейчас: «Ремонт» или «Просрочено» на пролистанную
 * дату вперёд не имеет смысла (мы не знаем будущего), назад — тоже
 * (прошлое не актуально), поэтому у них свой сид, всегда от настоящего
 * дня, независимо от того, какое число выбрано в шахматке.
 */
export function getHotelOccupancySnapshot(dateStr?: string): HotelOccupancySnapshot {
  const date = dateStr || dayjs().format("YYYY-MM-DD");
  const today = dayjs().format("YYYY-MM-DD");
  const rnd = rngFor(`occupancy:${date}`);
  const rndOps = rngFor(`ops:${today}`);
  const totalRooms = getHotelRooms().length;

  const freeRooms = 1 + Math.floor(rnd() * 4); // 1–4
  const occupiedRooms = totalRooms - freeRooms;
  const occupancyPercent = Math.round((occupiedRooms / totalRooms) * 100);

  const dirty = 3 + Math.floor(rndOps() * 7); // 3–9
  const inspected = 1 + Math.floor(rndOps() * 4); // 1–4
  const repair = rndOps() < 0.4 ? 1 : 0;
  const cleaned = Math.max(0, totalRooms - dirty - inspected - repair);

  return {
    date,
    totalRooms,
    occupiedRooms,
    occupancyPercent,
    guests: {
      arrivals: 18 + Math.floor(rnd() * 10),
      hotBookings: rnd() < 0.25 ? 1 : 0,
      departures: 15 + Math.floor(rnd() * 12),
      staying: 5 + Math.floor(rnd() * 10),
      dueOut: 10 + Math.floor(rnd() * 12),
      freeRooms,
    },
    notes: {
      scheduledToday: Math.floor(rndOps() * 3),
      overdue: rndOps() < 0.2 ? 1 : 0,
      scheduledTomorrow: Math.floor(rndOps() * 3),
      unscheduled: 1 + Math.floor(rndOps() * 3),
    },
    roomStatus: { dirty, cleaned, inspected, repair },
  };
}

// ── Презентационные хелперы отеля — единая точка правды для всех компонентов ──
//
// Статусы брони, их цвета/подписи, форматы дат, инициалы — до этого блока
// каждый компонент (RoomBookingGrid, RoomDetailsDialog, GuestDetailsDialog,
// HotelGuestsPage) заводил свою копию одного и того же. Разъехались бы
// незаметно: поменяй подпись статуса в одном месте — витрина показывает два
// разных слова для одной и той же брони. Здесь — идентичное для читаемости
// с самими данными: и то, и другое про то, как показывать бронь, просто
// одно голые числа, а другое — русский текст и цвет из темы.

/** Русские названия месяцев в именительном падеже («Сентябрь») — заголовки колонок-месяцев. */
export const MONTH_NOM_RU = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

/**
 * Русские названия месяцев в родительном падеже («12 сентября»). Общие для
 * HotelOccupancyBanner, RoomDetailsDialog и GuestDetailsDialog — одна форма,
 * не три копии.
 */
export const MONTH_GEN_RU = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

/** Дни недели, Пн первый — та же конвенция, что mondayIndex() выше. */
export const WEEKDAY_SHORT_RU = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/** Порядок статусов брони — для легенды и любого перечисления по порядку. */
export const HOTEL_BOOKING_STATUSES: HotelBookingStatus[] = ["confirmed", "arrived", "completed"];

export const HOTEL_BOOKING_STATUS_LABELS: Record<HotelBookingStatus, string> = {
  confirmed: "Подтверждена",
  arrived: "Гость заехал",
  completed: "Завершена",
};

/** Цвет статуса из активной MUI-темы — тот же на баре, в чипе и в легенде. */
export function getHotelBookingStatusColor(status: HotelBookingStatus, theme: Theme): string {
  return status === "arrived"
    ? theme.palette.success.main
    : status === "confirmed"
    ? theme.palette.info.main
    : theme.palette.text.disabled;
}

/** Инициалы для аватара — «Асанова Дана» → «АД». */
export function initialsOf(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** Число ночей между заездом и выездом (checkOut не включительно). */
export function nightsBetween(checkIn: string, checkOut: string): number {
  return dayjs(checkOut).diff(dayjs(checkIn), "day");
}

/** «12 сентября» — одна дата в родительном падеже. */
export function formatHotelDate(iso: string): string {
  const d = dayjs(iso);
  return `${d.date()} ${MONTH_GEN_RU[d.month()]}`;
}

/** «12 сентября, 14:32» — дата с временем, для меток вроде «последняя синхронизация». */
export function formatHotelDateTime(iso: string): string {
  const d = dayjs(iso);
  return `${formatHotelDate(iso)}, ${d.format("HH:mm")}`;
}

/**
 * «9 – 11 июля» / «28 июня – 2 июля» — диапазон дат брони. `checkOut` не
 * включительно (гость выезжает этим утром), поэтому для показа берётся
 * предыдущий день; в пределах одного месяца хвостовая дата не повторяет
 * месяц, при переходе через месяц/год повторяет его целиком.
 */
export function formatHotelDateRange(checkIn: string, checkOut: string): string {
  const from = dayjs(checkIn);
  const toIncl = dayjs(checkOut).subtract(1, "day");
  if (from.isSame(toIncl, "day")) return formatHotelDate(checkIn);
  if (from.month() === toIncl.month() && from.year() === toIncl.year()) {
    return `${from.date()} – ${formatHotelDate(toIncl.format("YYYY-MM-DD"))}`;
  }
  return `${formatHotelDate(checkIn)} – ${formatHotelDate(toIncl.format("YYYY-MM-DD"))}`;
}

// ── Выбранная дата шахматки — общая между HotelOccupancyBanner и RoomBookingGrid ──
//
// Клик по числу в RoomBookingGrid должен сразу сменить «Загрузку»/«Гостей» в
// карточках сверху — те же соседние-не-родитель-потомок компоненты, тот же
// приём (модульный стор + useSyncExternalStore), что и у CreateBookingButton/
// customBookings. Не персистится в localStorage: это состояние просмотра
// одной сессии страницы, как и windowStart в самом гриде — при перезагрузке
// логично вернуться к сегодня, а не к тому, что смотрели в прошлый раз.

let selectedHotelDate: string = dayjs().format("YYYY-MM-DD");
const selectedHotelDateListeners = new Set<() => void>();

export function getSelectedHotelDate(): string {
  return selectedHotelDate;
}

export function setSelectedHotelDate(date: string): void {
  if (selectedHotelDate === date) return;
  selectedHotelDate = date;
  selectedHotelDateListeners.forEach((fn) => fn());
}

export function subscribeSelectedHotelDate(onChange: () => void): () => void {
  selectedHotelDateListeners.add(onChange);
  return () => selectedHotelDateListeners.delete(onChange);
}

// ── Интеграции (каналы продаж) — для HotelIntegrationsPage.tsx ─────────────
//
// Список каналов пока зашит в каталог ниже (Booking/Островок/Expedia/
// Бронивик — как попросили) — реального API канал-менеджера нет. Статус
// подключения — тот же модульный стор + localStorage, что и customBookings
// выше: переключение «Подключить»/«Отключить» должно реально сохраняться, а
// не быть декорацией.

export interface HotelIntegrationDef {
  id: string;
  name: string;
  description: string;
}

export const HOTEL_INTEGRATIONS_CATALOG: HotelIntegrationDef[] = [
  {
    id: "booking",
    name: "Booking.com",
    description: "Синхронизация броней, цен и доступности номеров",
  },
  {
    id: "ostrovok",
    name: "Emerging Travel (Островок)",
    description: "Канал продаж для стран СНГ и Азии",
  },
  {
    id: "expedia",
    name: "Expedia",
    description: "Международный канал бронирования",
  },
  {
    id: "bronevik",
    name: "Бронивик",
    description: "Платформа бронирования отелей в России и СНГ",
  },
];

export interface HotelIntegrationState {
  connected: boolean;
  /** ISO-дата и время — только когда connected. */
  lastSyncAt?: string;
}

const INTEGRATIONS_KEY = "mamadoc:mockIntegrations";
const integrationsListeners = new Set<() => void>();

/** Booking.com обычно у отеля уже подключён — так демо-страница не пустая с первого взгляда. */
function defaultIntegrationsState(): Record<string, HotelIntegrationState> {
  return {
    booking: { connected: true, lastSyncAt: dayjs().subtract(2, "hour").toISOString() },
    ostrovok: { connected: false },
    expedia: { connected: false },
    bronevik: { connected: false },
  };
}

function readIntegrationsFromStorage(): Record<string, HotelIntegrationState> {
  try {
    const raw = window.localStorage.getItem(INTEGRATIONS_KEY);
    if (!raw) return defaultIntegrationsState();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return defaultIntegrationsState();
    return { ...defaultIntegrationsState(), ...(parsed as Record<string, HotelIntegrationState>) };
  } catch {
    return defaultIntegrationsState();
  }
}

let integrationsCache: Record<string, HotelIntegrationState> = readIntegrationsFromStorage();

function persistIntegrations(next: Record<string, HotelIntegrationState>): void {
  integrationsCache = next;
  try {
    window.localStorage.setItem(INTEGRATIONS_KEY, JSON.stringify(next));
  } catch {
    // приватный режим/запрет на localStorage — доживёт до конца вкладки в памяти
  }
  integrationsListeners.forEach((fn) => fn());
}

/** Подключает/отключает канал; при подключении фиксирует время «синхронизации». */
export function setIntegrationConnected(id: string, connected: boolean): void {
  const next: HotelIntegrationState = connected
    ? { connected: true, lastSyncAt: dayjs().toISOString() }
    : { connected: false };
  persistIntegrations({ ...integrationsCache, [id]: next });
}

export function subscribeIntegrations(onChange: () => void): () => void {
  integrationsListeners.add(onChange);
  return () => integrationsListeners.delete(onChange);
}

export function getIntegrationsSnapshot(): Record<string, HotelIntegrationState> {
  return integrationsCache;
}

// ── /appointments/home/ ─────────────────────────────────────────────────────

/** 3–8 приёмов по будням, 0 по воскресеньям — как обычное расписание клиники. */
function countForDate(dateStr: string): number {
  if (mondayIndex(dayjs(dateStr)) === 6) return 0;
  const rnd = rngFor(`count:${dateStr}`);
  return 3 + Math.floor(rnd() * 6);
}

function buildAppointmentsForDate(dateStr: string, orgId: number, branchId: number): Record<string, unknown>[] {
  const count = countForDate(dateStr);
  if (count === 0) return [];
  const rnd = rngFor(`appts:${dateStr}`);
  const branch = { id: branchId, name: activeBranchName() };
  const totalSlots = 18; // 09:00–18:00, шаг 30 минут
  const employeePool = activeEmployeePool();
  const servicePool = activeServicePool();

  const chosen = new Set<number>();
  while (chosen.size < Math.min(count, totalSlots)) {
    chosen.add(Math.floor(rnd() * totalSlots));
  }

  return Array.from(chosen)
    .sort((a, b) => a - b)
    .map((slotIdx, i) => {
      const hour = 9 + Math.floor(slotIdx / 2);
      const minute = (slotIdx % 2) * 30;
      const emp = employeePool[Math.floor(rnd() * employeePool.length)];
      const service = servicePool[Math.floor(rnd() * servicePool.length)];
      const patientName = MOCK_PATIENT_NAMES[Math.floor(rnd() * MOCK_PATIENT_NAMES.length)];
      const endTotalMinutes = hour * 60 + minute + service.durationMinutes;
      const id = 900000 + (hashString(`${dateStr}:${i}`) % 90000);
      const cycleIdx = i % STATUS_CYCLE.length;
      const status = STATUS_CYCLE[cycleIdx];
      const paymentStatus = PAYMENT_CYCLE[cycleIdx];
      const paidTotal =
        paymentStatus === "paid"
          ? service.basePrice
          : paymentStatus === "partial"
          ? (Number(service.basePrice) / 2).toFixed(2)
          : "0.00";
      const debt = (Number(service.basePrice) - Number(paidTotal)).toFixed(2);
      const employeeShort = { id: emp.id, fullName: emp.fullName, photoUrl: null, nickname: null };

      return {
        id,
        organizationId: orgId,
        branch,
        patient: {
          id: 800000 + id,
          fullName: patientName,
          phone: `+996700${String(100000 + id).slice(-6)}`,
          photoUrl: null,
        },
        employee: employeeShort,
        scheduledAt: `${dateStr}T${pad2(hour)}:${pad2(minute)}:00`,
        endsAt: `${dateStr}T${pad2(Math.floor(endTotalMinutes / 60))}:${pad2(endTotalMinutes % 60)}:00`,
        isNight: false,
        status,
        complaints: null,
        doctorComplaints: null,
        adminComment: null,
        cancelReason: null,
        services: [
          {
            id: 700000 + id,
            service: {
              id: service.id,
              name: service.name,
              basePrice: service.basePrice,
              durationMinutes: service.durationMinutes,
              imageUrl: null,
            },
            employee: employeeShort,
            price: service.basePrice,
            lineTotal: service.basePrice,
            durationMinutes: service.durationMinutes,
            quantity: 1,
            discountAmount: "0.00",
            consumptions: [],
            allowPriceOverride: true,
          },
        ],
        productLines: [],
        priceOverrideLocked: status === "completed",
        priceOverrides: [],
        durationOverrides: [],
        totalAmount: service.basePrice,
        createdAt: `${dateStr}T08:00:00`,
        updatedAt: `${dateStr}T08:00:00`,
        createdById: null,
        updatedById: null,
        paymentStatus,
        paidTotal,
        discountAmount: "0.00",
        payableAmount: service.basePrice,
        debt,
        paymentMethods: paymentStatus === "paid" ? ["cash"] : [],
        hasMedicalConclusion: status === "completed",
        consumptionWarnings: [],
      };
    });
}

function buildDayCounts(dateFrom: string, dateTo: string): Array<{ date: string; count: number }> {
  const out: Array<{ date: string; count: number }> = [];
  let d = dayjs(dateFrom);
  const end = dayjs(dateTo);
  let guard = 0;
  while (!d.isAfter(end) && guard < 400) {
    const ds = d.format("YYYY-MM-DD");
    out.push({ date: ds, count: countForDate(ds) });
    d = d.add(1, "day");
    guard++;
  }
  return out;
}

// ── /appointments/ (реестры «Все приёмы» / «Все процедуры») ────────────────

/**
 * Плоский список приёмов за диапазон дат — GET /appointments/. Реестры
 * (RegistryJournalView) считают все сводки, пульс-график и таблицу на фронте
 * из этого же ответа (см. комментарий в useRegistryFilters.ts), отдельного
 * summary-эндпоинта нет. Диапазон может быть годовым (`?period=2026`),
 * поэтому просто конкатенируем buildAppointmentsForDate по каждому дню.
 */
function buildAppointmentsForRange(
  dateFrom: string,
  dateTo: string,
  orgId: number,
  branchId: number,
  employeeIdFilter: number | null,
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  let d = dayjs(dateFrom);
  const end = dayjs(dateTo);
  let guard = 0;
  while (!d.isAfter(end) && guard < 400) {
    out.push(...buildAppointmentsForDate(d.format("YYYY-MM-DD"), orgId, branchId));
    d = d.add(1, "day");
    guard++;
  }
  if (employeeIdFilter != null) {
    return out.filter((a) => (a.employee as { id?: number } | null)?.id === employeeIdFilter);
  }
  return out;
}

// ── /scheduling/rules/ и /scheduling/exceptions/ ────────────────────────────

function buildScheduleRules(branchId: number): Record<string, unknown>[] {
  return activeEmployeePool().map((emp, idx) => ({
    id: 910000 + idx,
    employeeId: emp.id,
    employeeName: emp.fullName,
    branchId,
    branchName: activeBranchName(),
    dateFrom: "2020-01-01",
    dateTo: "2030-12-31",
    // Медсестра — только Пн–Пт, врачи ещё и по субботам.
    weekdays: emp.clinicalRole === "nurse" ? [0, 1, 2, 3, 4] : [0, 1, 2, 3, 4, 5],
    startTime: "09:00",
    endTime: "18:00",
    lunchStart: "13:00",
    lunchEnd: "14:00",
    comment: "",
    isActive: true,
  }));
}

// ── /scheduling/availability/ и /scheduling/availability/summary/ ──────────

function buildAvailability(params: URLSearchParams): Record<string, unknown> {
  const branchId = params.get("branchId") != null ? Number(params.get("branchId")) : 1;
  const dateFrom = params.get("dateFrom") || dayjs().format("YYYY-MM-DD");
  const dateTo = params.get("dateTo") || dayjs(dateFrom).add(6, "day").format("YYYY-MM-DD");
  const employeeIdFilter = params.get("employeeId") ? Number(params.get("employeeId")) : null;
  const specializationIdFilter = params.get("specializationId") ? Number(params.get("specializationId")) : null;

  const pool = activeEmployeePool()
    .filter((e) => e.clinicalRole === "doctor")
    .filter((e) => employeeIdFilter == null || e.id === employeeIdFilter)
    .filter((e) => specializationIdFilter == null || e.specializationId === specializationIdFilter);

  const dates: string[] = [];
  {
    let d = dayjs(dateFrom);
    const end = dayjs(dateTo);
    let guard = 0;
    while (!d.isAfter(end) && guard < 60) {
      dates.push(d.format("YYYY-MM-DD"));
      d = d.add(1, "day");
      guard++;
    }
  }

  const employees = pool.map((emp) => {
    let nearestFree: { date: string; start: string } | null = null;

    const days = dates.map((dateStr) => {
      if (mondayIndex(dayjs(dateStr)) === 6) {
        return { date: dateStr, scheduled: false, dayOff: true, freeCount: 0, slots: [], appointments: [] };
      }
      const rnd = rngFor(`avail:${emp.id}:${dateStr}`);
      const slots: Record<string, unknown>[] = [];
      const appointments: Record<string, unknown>[] = [];
      const isPastDay = dayjs(dateStr).isBefore(dayjs(), "day");
      const branchName = activeBranchName();

      for (let h = 9; h < 18; h++) {
        if (h === 13) continue; // обед
        for (const m of [0, 30]) {
          const start = `${pad2(h)}:${pad2(m)}`;
          const endTotal = h * 60 + m + 30;
          const end = `${pad2(Math.floor(endTotal / 60))}:${pad2(endTotal % 60)}`;
          const busy = rnd() < 0.3;
          if (busy) {
            const appointmentId = 920000 + Math.floor(rnd() * 79999);
            const patientName = MOCK_PATIENT_NAMES[Math.floor(rnd() * MOCK_PATIENT_NAMES.length)];
            appointments.push({ id: appointmentId, branchId, branchName, start, end, patientName, status: "scheduled" });
            slots.push({ start, end, free: false, appointmentId, branchId, branchName, patientName });
          } else {
            slots.push({ start, end, free: true, appointmentId: null, branchId, branchName, patientName: null });
            if (!nearestFree && !isPastDay) nearestFree = { date: dateStr, start };
          }
        }
      }

      return {
        date: dateStr,
        scheduled: true,
        dayOff: false,
        freeCount: slots.filter((s) => s.free === true).length,
        slots,
        appointments,
      };
    });

    return { employeeId: emp.id, fullName: emp.fullName, nearestFree, days };
  });

  return { dateFrom, dateTo, durationMinutes: 30, employees };
}

function buildAvailabilitySummary(params: URLSearchParams): Record<string, unknown> {
  const date = params.get("date") || dayjs().format("YYYY-MM-DD");
  const rnd = rngFor(`summary:${date}`);
  const doctors = activeEmployeePool().filter((e) => e.clinicalRole === "doctor");

  const bySpec = new Map<number, { employeeCount: number; freeEmployeeCount: number }>();
  doctors.forEach((d) => {
    const entry = bySpec.get(d.specializationId) ?? { employeeCount: 0, freeEmployeeCount: 0 };
    entry.employeeCount += 1;
    if (rnd() < 0.7) entry.freeEmployeeCount += 1;
    bySpec.set(d.specializationId, entry);
  });

  const specializations = Array.from(bySpec.entries()).map(([specializationId, v]) => ({
    specializationId,
    ...v,
  }));

  return {
    date,
    specializations,
    overallEmployeeCount: doctors.length,
    overallFreeEmployeeCount: specializations.reduce((s, x) => s + x.freeEmployeeCount, 0),
  };
}

// ── /staff/employees/ и /staff/specializations/ ─────────────────────────────

function buildEmployeesResponse(orgId: number, branchId: number): Record<string, unknown> {
  const branch = { id: branchId, name: activeBranchName() };
  const pool = activeEmployeePool();
  return {
    count: pool.length,
    nextPage: null,
    results: pool.map((e) => ({
      id: e.id,
      organizationId: orgId,
      branch,
      authUserId: null,
      fullName: e.fullName,
      phone: `+996700${String(100000 + e.id).slice(-6)}`,
      email: "",
      nickname: "",
      status: "active",
      clinicalRole: e.clinicalRole,
      onlineBookingEnabled: true,
      photoUrl: null,
      role: null,
      specializations: [{ id: e.specializationId, name: e.specializationName }],
      operationalBranches: [branch],
    })),
  };
}

function buildSpecializationsResponse(orgId: number): Record<string, unknown>[] {
  const seen = new Set<number>();
  const out: Record<string, unknown>[] = [];
  for (const e of activeEmployeePool()) {
    if (seen.has(e.specializationId)) continue;
    seen.add(e.specializationId);
    out.push({
      id: e.specializationId,
      organizationId: orgId,
      name: e.specializationName,
      isActive: true,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    });
  }
  return out;
}

// ── Перехватчик fetch ────────────────────────────────────────────────────────

function mockResponse(body: unknown, signal?: AbortSignal | null): Promise<Response> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    // Небольшая задержка — чтобы скелетоны загрузки не мигали мгновенно и
    // экран не выглядел «подозрительно быстрым» по сравнению с реальным API.
    const timer = window.setTimeout(() => {
      resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
    }, 150 + Math.random() * 150);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

let installed = false;

/**
 * Включить подмену данных приёмов/расписания. Не делает ничего, если флаг
 * `VITE_MOCK_DEMO_DATA` не выставлен в `.env.local`, или это production-сборка.
 */
export function installMockDemoData(): void {
  if (installed) return;
  if (import.meta.env.PROD) return;
  if (import.meta.env[ENV_FLAG] !== "true") return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const method = (init?.method ?? "GET").toUpperCase();
    const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    let url: URL;
    try {
      url = new URL(rawUrl, window.location.origin);
    } catch {
      return originalFetch(input, init);
    }
    const path = url.pathname;

    if (method !== "GET") {
      return originalFetch(input, init);
    }

    const params = url.searchParams;
    const orgId = Number(params.get("organizationId") ?? 1);
    const branchId = params.get("branchId") != null ? Number(params.get("branchId")) : 1;

    let body: unknown;
    if (path.endsWith("/appointments/home/")) {
      const date = params.get("date") || dayjs().format("YYYY-MM-DD");
      body = {
        appointments: buildAppointmentsForDate(date, orgId, branchId),
        dayCounts: buildDayCounts(params.get("dateFrom") || date, params.get("dateTo") || date),
        lastUpdate: MOCK_LAST_UPDATE,
      };
    } else if (path.endsWith("/appointments/notifications/")) {
      body = [];
    } else if (path.endsWith("/appointments/last-update/")) {
      body = { lastUpdate: MOCK_LAST_UPDATE, count: 42 };
    } else if (path.endsWith("/appointments/")) {
      // Реестры «Все приёмы» / «Все процедуры» (RegistryJournalView) — плоский
      // список за период, без пагинации, как отдаёт реальный бэк.
      const monthStart = dayjs().startOf("month").format("YYYY-MM-DD");
      const monthEnd = dayjs().endOf("month").format("YYYY-MM-DD");
      const employeeIdParam = params.get("employeeId");
      const employeeIdFilter =
        employeeIdParam && employeeIdParam !== "me" ? Number(employeeIdParam) : null;
      body = buildAppointmentsForRange(
        params.get("dateFrom") || monthStart,
        params.get("dateTo") || monthEnd,
        orgId,
        branchId,
        employeeIdFilter,
      );
    } else if (path.endsWith("/scheduling/availability/summary/")) {
      body = buildAvailabilitySummary(params);
    } else if (path.endsWith("/scheduling/availability/")) {
      body = buildAvailability(params);
    } else if (path.endsWith("/scheduling/rules/")) {
      body = buildScheduleRules(branchId);
    } else if (path.endsWith("/scheduling/exceptions/")) {
      body = [];
    } else if (path.endsWith("/staff/employees/")) {
      body = buildEmployeesResponse(orgId, branchId);
    } else if (path.endsWith("/staff/specializations/")) {
      body = buildSpecializationsResponse(orgId);
    } else {
      return originalFetch(input, init);
    }

    return mockResponse(body, init?.signal);
  }) as typeof window.fetch;

  // eslint-disable-next-line no-console
  console.info(
    "%c[demo] Приёмы и расписание показывают моковые данные (VITE_MOCK_DEMO_DATA=true в .env.local).",
    "color:#a35a00; font-weight:bold",
  );
}
