/**
 * Витрина «Модули»: что продаём, почём и какими словами.
 * Спека: docs/specs/2026-09-26-modules-storefront-design.md (рабочая папка).
 * Цены — прайс 2026-09-08, сом в месяц на организацию; null — «по запросу».
 * Тексты — только о том, что модуль умеет по коду.
 */

export type StorefrontCategoryId = "clients" | "communication" | "team" | "medicine" | "trade";
export type StorefrontTone = "violet" | "teal" | "amber" | "pink" | "blue";
export type StorefrontIconName =
  | "chats" | "funnel" | "hourglass" | "star" | "vaccine" | "payments" | "fingerprint"
  | "checklist" | "cleaning" | "book" | "register" | "truck" | "loyalty" | "offer"
  | "target" | "store" | "hanger" | "telegram" | "puzzle";

export interface StorefrontCategory {
  id: StorefrontCategoryId;
  label: string;
  tone: StorefrontTone;
}

export const STOREFRONT_CATEGORIES: StorefrontCategory[] = [
  { id: "clients", label: "Клиенты и продажи", tone: "teal" },
  { id: "communication", label: "Общение", tone: "violet" },
  { id: "team", label: "Команда", tone: "amber" },
  { id: "medicine", label: "Медицина", tone: "pink" },
  { id: "trade", label: "Торговля", tone: "blue" },
];

export function categoryTone(id: StorefrontCategoryId): StorefrontTone {
  return STOREFRONT_CATEGORIES.find((c) => c.id === id)?.tone ?? "teal";
}

export interface StorefrontProduct {
  id: string;
  title: string;
  /** Модули реестра, которые включает товар. */
  modules: string[];
  category: StorefrontCategoryId;
  icon: StorefrontIconName;
  /** Сом в месяц; null — «Цена по запросу». */
  price: number | null;
  /** Товар, с которым этот бесплатен. */
  freeWith?: string;
  tagline: string;
  features: string[];
}

export const STOREFRONT_PRODUCTS: StorefrontProduct[] = [
  {
    id: "chats", title: "Чаты", modules: ["chatwoot"], category: "communication", icon: "chats", price: 5000,
    tagline: "Переписка с клиентами из мессенджеров — в одном окне CRM",
    features: ["Диалоги всей команды в одном месте", "Отвечаете, не выходя из CRM", "С «Воронкой продаж» новые обращения становятся лидами"],
  },
  {
    id: "deals", title: "Воронка продаж", modules: ["deals"], category: "clients", icon: "funnel", price: 3000,
    tagline: "Каждое обращение — сделка с этапом, суммой и ответственным",
    features: ["Доска этапов, как в канбане", "Конверсия и причины потерь", "Следующий шаг по каждой сделке"],
  },
  {
    id: "waitlist", title: "Лист ожидания", modules: ["waitlist"], category: "clients", icon: "hourglass", price: 500,
    tagline: "Освободилось окно — сразу видно, кого позвать",
    features: ["Очередь к специалисту и на услугу", "Срочные ожидания — наверху", "Счётчик ожидающих в меню"],
  },
  {
    id: "reviews", title: "Сбор отзывов", modules: ["reviews"], category: "clients", icon: "star", price: 1000,
    tagline: "Оценка после визита — и видно, где сервис проседает",
    features: ["Отзывы после приёма", "Статистика оценок"],
  },
  {
    id: "vaccinations", title: "Прививки", modules: ["vaccinations"], category: "medicine", icon: "vaccine", price: 5000,
    tagline: "Календарь прививок, партии вакцин и записи — в карточке пациента",
    features: ["Справочник вакцин и партии", "Записи о прививках у пациента", "Календарь прививок"],
  },
  {
    id: "payroll", title: "Зарплата", modules: ["payroll"], category: "team", icon: "payments", price: 5000,
    tagline: "Расчёт зарплаты по правилам — без таблиц в Excel",
    features: ["Правила оплаты у каждого сотрудника", "Закрытие и пересчёт периода", "Отчёт по зарплате за месяц"],
  },
  {
    id: "attendance", title: "СКУД", modules: ["attendance"], category: "team", icon: "fingerprint", price: 1500, freeWith: "payroll",
    tagline: "Смены и опоздания — по отметкам сотрудников",
    features: ["Начало и конец смены", "Отметка только из офиса", "Часы и смены за период"],
  },
  {
    id: "tasks", title: "Задачи и заявки", modules: ["tasks"], category: "team", icon: "checklist", price: 1000,
    tagline: "Внутренние заявки с исполнителем, сроком и повтором",
    features: ["Исполнитель и срок у каждой задачи", "Повторяющиеся задачи", "Счётчик новых и просроченных в меню"],
  },
  {
    id: "cleaning", title: "Уборка", modules: ["cleaning"], category: "team", icon: "cleaning", price: 1000,
    tagline: "Уборки с фотоотчётом и оплатой в зарплату",
    features: ["Фотоотчёт о каждой уборке", "Проверка и отклонение отчётов", "Оплата уборок в зарплате"],
  },
  {
    id: "knowledge", title: "База знаний", modules: ["knowledge"], category: "team", icon: "book", price: 500,
    tagline: "Статьи и видеоуроки для сотрудников",
    features: ["Статьи и видео в одном месте", "Быстрее вводить новых сотрудников"],
  },
  {
    id: "trade", title: "Торговля", modules: ["warehouse", "pos"], category: "trade", icon: "register", price: 5000,
    tagline: "Склад, остатки и касса для продажи товаров",
    features: ["Приход и остатки по складам", "Касса: чеки, оплаты и возвраты", "Резерв товара под клиента"],
  },
  { id: "procurement", title: "Закупки и накладные", modules: ["procurement"], category: "trade", icon: "truck", price: null, tagline: "Поставщики, накладные, возвраты и оплаты поставщикам", features: [] },
  { id: "loyalty", title: "Лояльность", modules: ["loyalty"], category: "clients", icon: "loyalty", price: null, tagline: "Программы, уровни и бонусы за покупки", features: [] },
  { id: "promotions", title: "Акции и промокоды", modules: ["promotions"], category: "clients", icon: "offer", price: null, tagline: "Скидки, промокоды, ваучеры и сертификаты", features: [] },
  { id: "targets", title: "Планы продаж", modules: ["targets"], category: "trade", icon: "target", price: null, tagline: "Планы по точкам и продавцам и их выполнение", features: [] },
  { id: "ecommerce", title: "Интернет-магазин", modules: ["ecommerce"], category: "trade", icon: "store", price: null, tagline: "Витрина, онлайн-заказы и выдача через кассу", features: [] },
  { id: "retail", title: "Коллекции и сезоны", modules: ["retail"], category: "trade", icon: "hanger", price: null, tagline: "Коллекции моделей, продажи по сезонам и размерная сетка", features: [] },
  { id: "telegram_bot", title: "Телеграм-бот", modules: ["telegram_bot"], category: "communication", icon: "telegram", price: null, tagline: "Клиент привязывает Telegram и получает сообщения в бот", features: [] },
];

/** Базовый пакет: не продаётся, подключённое — в «Уже в вашем пакете». */
export const STOREFRONT_BASE_MODULES: readonly string[] = [
  "organization", "rbac", "staff", "clients", "patients", "appointments", "schedule",
  "catalog", "finance", "announcements", "reports", "documents", "printforms", "profigram",
];

/** Сняты с продажи: на витрине не предлагаем. */
export const STOREFRONT_HIDDEN_MODULES: readonly string[] = ["achievements"];

export interface StorefrontBundle {
  id: string;
  title: string;
  pitch: string;
  products: string[];
}

const MORE_BOOKINGS: StorefrontBundle = {
  id: "more-bookings",
  title: "Больше записей, меньше потерь",
  pitch: "Каждое обращение — в воронку, освободившееся окно — тому, кто ждёт",
  products: ["chats", "deals", "waitlist"],
};
const TEAM: StorefrontBundle = {
  id: "team",
  title: "Команда под контролем",
  pitch: "Смены, зарплата и задачи — в одной системе, без таблиц в Excel",
  products: ["payroll", "attendance", "tasks"],
};
const RETURNING_BUYERS: StorefrontBundle = {
  id: "returning-buyers",
  title: "Покупатели возвращаются",
  pitch: "Бонусы, акции и бот для постоянных покупателей",
  products: ["loyalty", "promotions", "telegram_bot"],
};

/** Подборки по вертикали организации; неизвестная вертикаль — как клиника. */
export const STOREFRONT_BUNDLES: Record<string, StorefrontBundle[]> = {
  clinic: [MORE_BOOKINGS, TEAM],
  beauty: [MORE_BOOKINGS, TEAM],
  retail: [RETURNING_BUYERS, TEAM],
};

export const RECOMMEND_TITLE: Record<string, string> = {
  clinic: "Рекомендуем для клиники",
  beauty: "Рекомендуем для салона",
  retail: "Рекомендуем для магазина",
};
