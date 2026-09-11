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
import type { GlossaryOverrides } from "../i18n/glossaryOverrides";

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

// ── Viva (мок-организация «отель») ──────────────────────────────────────────
//
// Показывает, что та же CRM подходит и для отельного бизнеса: отдельная
// организация в переключателе (шапка → «Организация»), терминология
// подменена через штатный «конструктор терминологии» (themeConfig.glossary —
// тот же механизм, что и для настоящей организации в /settings, см.
// glossaryOverrides.ts), а сотрудники/услуги в моих же генераторах ниже
// переключаются на отельный «флейвор», когда активна Viva.
//
// ⚠ Честная граница: вертикализованы только термины (patients/appointments
// модули). Остальные ~330 файлов — хардкод медицинского текста (вакцины,
// СКУД, «Кабинет врача» и т.п.), они останутся клиникой независимо от
// вертикали — см. mamadoc-functionality.md §8.

const VIVA_ORG_ID = 990000001;
const VIVA_MEMBERSHIP_ID = 990000002;
const VIVA_BRANCH_MAIN_ID = 990000003;
const VIVA_BRANCH_AIRPORT_ID = 990000004;

/**
 * Оверрайды терминов — форма `GlossaryOverrides` из glossaryOverrides.ts.
 * Базовая вертикаль — "beauty" (ближе к отелю, чем "clinic": там уже
 * «клиент»/«визит»/«услуга» вместо «пациент»/«приём»); эти 5 терминов
 * переопределены поверх нее до отельной лексики. Формы получены движком
 * declineTerm() из src/i18n/declension.ts, с ручной правкой двух мест,
 * которые он сам помечает как не умеет: «горничная» — субстантивированное
 * прилагательное (склоняется как прилагательное, не как обычное
 * существительное на -ая), «номер» — нестандартное мн.ч. на -а
 * (номера, не «номеры» — тот же тип, что и «мастер» → «мастера» в
 * комментарии declension.ts).
 */
const HOTEL_GLOSSARY_OVERRIDES: GlossaryOverrides = {
  patient: {
    gender: "m", nom: "гость", gen: "гостя", dat: "гостю", acc: "гостя",
    ins: "гостем", pre: "госте", nomPl: "гости", genPl: "гостей",
    datPl: "гостям", accPl: "гостей", insPl: "гостями", prePl: "гостях",
  },
  specialist: {
    gender: "m", nom: "администратор", gen: "администратора", dat: "администратору",
    acc: "администратора", ins: "администратором", pre: "администраторе",
    nomPl: "администраторы", genPl: "администраторов", datPl: "администраторам",
    accPl: "администраторов", insPl: "администраторами", prePl: "администраторах",
  },
  assistant: {
    gender: "f", nom: "горничная", gen: "горничной", dat: "горничной",
    acc: "горничную", ins: "горничной", pre: "горничной", nomPl: "горничные",
    genPl: "горничных", datPl: "горничным", accPl: "горничных",
    insPl: "горничными", prePl: "горничных",
  },
  org: {
    gender: "m", nom: "отель", gen: "отеля", dat: "отелю", acc: "отель",
    ins: "отелем", pre: "отеле", nomPl: "отели", genPl: "отелей",
    datPl: "отелям", accPl: "отели", insPl: "отелями", prePl: "отелях",
  },
  room: {
    gender: "m", nom: "номер", gen: "номера", dat: "номеру", acc: "номер",
    ins: "номером", pre: "номере", nomPl: "номера", genPl: "номеров",
    datPl: "номерам", accPl: "номера", insPl: "номерами", prePl: "номерах",
  },
};

const HOTEL_MOCK_EMPLOYEES: MockEmployee[] = [
  { id: 950001, fullName: "Токтогулова Айгуль Максатовна", clinicalRole: "doctor", specializationId: 950101, specializationName: "Администратор" },
  { id: 950002, fullName: "Бекбоев Нурлан Эркинович", clinicalRole: "doctor", specializationId: 950102, specializationName: "Менеджер по бронированию" },
  { id: 950004, fullName: "Абдиев Руслан Талантович", clinicalRole: "doctor", specializationId: 950104, specializationName: "Консьерж" },
  { id: 950003, fullName: "Осмонова Гульнара Таалайбековна", clinicalRole: "nurse", specializationId: 950103, specializationName: "Горничная" },
];

const HOTEL_MOCK_SERVICES = [
  { id: 950201, name: "Заселение (check-in)", basePrice: "2500.00", durationMinutes: 30 },
  { id: 950202, name: "Выселение (check-out)", basePrice: "0.00", durationMinutes: 20 },
  { id: 950203, name: "Уборка номера", basePrice: "300.00", durationMinutes: 40 },
  { id: 950204, name: "Трансфер из аэропорта", basePrice: "800.00", durationMinutes: 15 },
  { id: 950205, name: "Поздний выезд", basePrice: "500.00", durationMinutes: 20 },
];

const HOTEL_BRANCH_NAME = "Viva — центр";

// ── Номера и брони — для RoomBookingGrid.tsx ────────────────────────────────
//
// Отдельная сущность от MOCK_EMPLOYEES/appointments: «шахматка броней» —
// номера по строкам, даты по столбцам, бары — брони на несколько ночей.
// Единый список используется и в форме создания брони (CreateBookingButton),
// и в счётчике «всего номеров» карточки загрузки (getHotelOccupancySnapshot).

export interface HotelRoomCategory {
  name: string;
  rooms: string[];
  /** Цена за ночь, сом. */
  pricePerNight: number;
  /** Вместимость, гостей. */
  capacity: number;
  amenities: string[];
  /** Люкс-уровень — бейдж и акцентный цвет в гриде/модалке деталей. */
  luxury?: boolean;
}

export const HOTEL_ROOM_CATEGORIES: HotelRoomCategory[] = [
  {
    name: "Twin без окна",
    rooms: ["111", "112", "113"],
    pricePerNight: 1800,
    capacity: 2,
    amenities: ["Две кровати", "Душ"],
  },
  {
    name: "Standard",
    rooms: ["201", "202", "203", "204"],
    pricePerNight: 2500,
    capacity: 2,
    amenities: ["Окно во двор", "Кондиционер", "Wi-Fi"],
  },
  {
    name: "Делюкс",
    rooms: ["301", "302", "303"],
    pricePerNight: 4200,
    capacity: 3,
    amenities: ["Окно на улицу", "Мини-бар", "Wi-Fi", "Халат"],
  },
  {
    name: "Люкс",
    rooms: ["401", "402"],
    pricePerNight: 7500,
    capacity: 4,
    amenities: ["Джакузи", "Вид на горы", "Мини-бар", "Отдельная гостиная", "Халат и тапочки"],
    luxury: true,
  },
];

export const HOTEL_ROOMS: string[] = HOTEL_ROOM_CATEGORIES.flatMap((c) => c.rooms);

/** Категория (тариф/удобства) по номеру комнаты. */
export function getRoomCategory(room: string): HotelRoomCategory | undefined {
  return HOTEL_ROOM_CATEGORIES.find((c) => c.rooms.includes(room));
}

export type HotelBookingStatus = "confirmed" | "arrived" | "completed";

/** Гражданин КР — паспорт/ИНН; иностранец — загранпаспорт/миграционный учёт. */
export type GuestType = "resident" | "foreign";
export type BookingGuaranteeMethod = "card" | "prepayment" | "cash" | "corporate";
export type BookingSource = "direct" | "phone" | "ota" | "agent" | "walkin";
export type VisitPurpose = "tourism" | "business" | "other";

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

export const VISIT_PURPOSE_LABELS: Record<VisitPurpose, string> = {
  tourism: "Туризм",
  business: "Бизнес",
  other: "Другое",
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

  for (const room of HOTEL_ROOMS) {
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
      out.push({
        id: bookingId++,
        roomNumber: room,
        guestName: MOCK_PATIENT_NAMES[Math.floor(rnd() * MOCK_PATIENT_NAMES.length)],
        checkIn: checkIn.format("YYYY-MM-DD"),
        checkOut: checkOut.format("YYYY-MM-DD"),
        status,
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
// перезагрузку страницы (тот же приём, что MOCK_CONTEXT_KEY выше); это всё
// ещё демо-хранилище браузерной вкладки, не бэкенд.

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

// ── Гости — для HotelGuestsPage.tsx и GuestDetailsDialog.tsx ────────────────
//
// Отдельной картотеки гостей в API нет — гость существует только как строка
// внутри брони (guestName). Тот же приём, что и «Загрузка на сегодня»:
// честная витрина того, что мог бы показывать такой экран, собранная из
// уже сгенерированных + ручных броней, а не подключённый бэкенд.

export interface HotelGuestSummary {
  name: string;
  phone: string;
  /** Все брони этого гостя за окно агрегации (см. getHotelGuests), по возрастанию заезда. */
  bookings: HotelBooking[];
}

/** Телефон, детерминированный по имени — тот же гость всегда получает тот же номер. */
function phoneForGuestName(name: string): string {
  const digits = String(hashString(`phone:${name}`) % 1_000_000).padStart(6, "0");
  return `+996 700 ${digits.slice(0, 3)} ${digits.slice(3, 6)}`;
}

/**
 * Все гости за широкое окно (−60…+120 дней от сегодня) — сгенерированные
 * брони на такой диапазон дают достаточно разнообразия для списка, плюс
 * все ручные брони целиком (они не привязаны к окну дат по построению).
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

  const guests: HotelGuestSummary[] = [];
  for (const [name, bookings] of byName) {
    bookings.sort((a, b) => (a.checkIn < b.checkIn ? -1 : a.checkIn > b.checkIn ? 1 : 0));
    // Реально введённый в форме телефон важнее сгенерированного — берём
    // с самой свежей брони, где он есть.
    const enteredPhone = [...bookings].reverse().find((b) => b.guestPhone)?.guestPhone;
    guests.push({ name, phone: enteredPhone ?? phoneForGuestName(name), bookings });
  }
  guests.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  return guests;
}

/** Ключ localStorage: держит выбор Viva между перезагрузками страницы. */
const MOCK_CONTEXT_KEY = "mamadoc:mockActiveContext";

type MockContext = { org: "viva"; branchId: number | null } | null;

function readMockContext(): MockContext {
  try {
    const raw = window.localStorage.getItem(MOCK_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { org?: string; branchId?: unknown };
    if (parsed?.org === "viva") {
      return { org: "viva", branchId: typeof parsed.branchId === "number" ? parsed.branchId : null };
    }
  } catch {
    // повреждённое значение — считаем, что контекста нет
  }
  return null;
}

function writeMockContext(ctx: MockContext): void {
  try {
    if (ctx) window.localStorage.setItem(MOCK_CONTEXT_KEY, JSON.stringify(ctx));
    else window.localStorage.removeItem(MOCK_CONTEXT_KEY);
  } catch {
    // приватный режим/запрет на localStorage — просто не переживёт reload
  }
}

export const isVivaActive = (): boolean => readMockContext()?.org === "viva";

/** Пул сотрудников текущего «флейвора» — клиника по умолчанию, отель на Viva. */
const activeEmployeePool = (): MockEmployee[] => (isVivaActive() ? HOTEL_MOCK_EMPLOYEES : MOCK_EMPLOYEES);
const activeServicePool = () => (isVivaActive() ? HOTEL_MOCK_SERVICES : MOCK_SERVICES);
const activeBranchName = (): string => (isVivaActive() ? HOTEL_BRANCH_NAME : MOCK_BRANCH_NAME);

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
  const totalRooms = HOTEL_ROOMS.length;

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

/** Membership Viva для /auth/me/ и /auth/context/ — форма RbacMembership. */
function buildVivaMembership(): Record<string, unknown> {
  return {
    id: VIVA_MEMBERSHIP_ID,
    organization: {
      id: VIVA_ORG_ID,
      name: "Viva",
      slug: "viva-hotel",
      status: "active",
      logoUrl: null,
      vertical: "beauty",
      themeConfig: { glossary: HOTEL_GLOSSARY_OVERRIDES },
    },
    role: { id: 990000005, name: "Владелец", code: "owner" },
    isOwner: true,
    isActive: true,
    branches: [
      { id: VIVA_BRANCH_MAIN_ID, name: "Viva — центр", timezone: "Asia/Bishkek", isActive: true, logoUrl: null },
      { id: VIVA_BRANCH_AIRPORT_ID, name: "Viva — аэропорт", timezone: "Asia/Bishkek", isActive: true, logoUrl: null },
    ],
    // Права ролью Viva не читаются: usePermissions берёт плоский список прав
    // из верхнего meData.permissions (реальный, суперюзерский), а не отсюда.
    permissions: [],
  };
}

/**
 * Последний настоящий ответ /auth/me/ (без Viva) — источник user/permissions/
 * enabledModules для фабрикации ответа POST /auth/context/, когда бэкенд о
 * membershipId Viva ничего не знает и не может его вернуть сам.
 */
let lastRealMe: Record<string, unknown> | null = null;

/** Полный MeResponse с активной Viva — на основе последнего настоящего ответа. */
function buildVivaMeResponse(branchId: number | null): Record<string, unknown> {
  const base = lastRealMe ?? {};
  const memberships = Array.isArray(base.memberships) ? [...(base.memberships as Record<string, unknown>[])] : [];
  if (!memberships.some((m) => m?.id === VIVA_MEMBERSHIP_ID)) memberships.push(buildVivaMembership());
  const viva = buildVivaMembership();
  const branches = viva.branches as Array<{ id: number }>;
  const branch = branchId != null ? branches.find((b) => b.id === branchId) ?? null : null;
  return {
    ...base,
    memberships,
    activeMembership: viva,
    activeOrganization: viva.organization,
    activeBranch: branch,
    activeEmployee: null,
    enabledModules: Array.isArray(base.enabledModules) ? base.enabledModules : [],
  };
}

/**
 * GET /auth/me/ и /auth/context/ (а также ответ /auth/login/) — дописывает
 * Viva в список memberships настоящего ответа. Если пользователь уже выбрал
 * Viva активной (localStorage), подменяет и активный контекст — иначе после
 * F5 сессия молча откатится на настоящую организацию.
 */
function augmentMeResponse(real: Record<string, unknown>): Record<string, unknown> {
  lastRealMe = real;
  const ctx = readMockContext();
  if (ctx) return buildVivaMeResponse(ctx.branchId);
  const memberships = Array.isArray(real.memberships) ? [...(real.memberships as Record<string, unknown>[])] : [];
  if (!memberships.some((m) => m?.id === VIVA_MEMBERSHIP_ID)) memberships.push(buildVivaMembership());
  return { ...real, memberships };
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

/**
 * Пропускает запрос на настоящий бэкенд и дописывает Viva в тело ответа
 * (форма MeResponse). Ошибочные ответы (401 протухшая сессия и т.п.) не
 * трогаем — возвращаем как есть, augmentMeResponse ждёт валидный JSON.
 */
async function passthroughAndAugmentMe(
  originalFetch: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): Promise<Response> {
  const res = await originalFetch(input, init);
  if (!res.ok) return res;
  let data: Record<string, unknown>;
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    return res;
  }
  const augmented = augmentMeResponse(data);
  return new Response(JSON.stringify(augmented), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * POST /auth/context/ — переключение организации/филиала. Viva обрабатываем
 * целиком сами (бэкенд про её membershipId ничего не знает и ответил бы 404);
 * переключение на настоящую организацию — сбрасывает мок-контекст и уходит
 * на бэкенд как обычно.
 */
async function handleSwitchContext(
  originalFetch: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): Promise<Response> {
  let payload: { membershipId?: number; branchId?: number | null } = {};
  try {
    if (typeof init?.body === "string") payload = JSON.parse(init.body);
  } catch {
    // не наш формат — пусть решает бэкенд
  }

  if (payload.membershipId === VIVA_MEMBERSHIP_ID) {
    writeMockContext({ org: "viva", branchId: payload.branchId ?? null });
    return mockResponse(buildVivaMeResponse(payload.branchId ?? null), init?.signal);
  }

  writeMockContext(null);
  return originalFetch(input, init);
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

    // Переключение организации/филиала — обрабатываем до общего GET-фильтра
    // ниже, это единственный POST, который мы трогаем.
    if (method === "POST" && path.endsWith("/auth/context/")) {
      return handleSwitchContext(originalFetch, input, init);
    }
    // Ответ логина — та же форма MeResponse, дописываем Viva сразу, чтобы она
    // была в переключателе с первого экрана, а не только после следующего
    // /auth/me/.
    if (method === "POST" && path.endsWith("/auth/login/")) {
      return passthroughAndAugmentMe(originalFetch, input, init);
    }

    if (method !== "GET") {
      return originalFetch(input, init);
    }

    // GET /auth/me/ и /auth/context/ (getAuthContext) — та же форма ответа.
    if (path.endsWith("/auth/me/") || path.endsWith("/auth/context/")) {
      return passthroughAndAugmentMe(originalFetch, input, init);
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
