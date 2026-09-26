/**
 * Витрина «Модули»: что продаём, почём и какими словами.
 * Спека: docs/specs/2026-09-26-modules-storefront-design.md (рабочая папка).
 * Цены — прайс 2026-09-08, сом в месяц на организацию; null — «по запросу».
 * Тексты — только о том, что модуль умеет по коду.
 */

import type { FeatureSignals } from "../api/tenancy";

export type StorefrontCategoryId = "clients" | "communication" | "team" | "medicine" | "trade";
export type StorefrontTone = "violet" | "teal" | "amber" | "pink" | "blue";
/** Вид бизнеса витрины. Прочие (например, зал) смотрят витрину клиники — как и словарь терминов. */
export type StorefrontVertical = "clinic" | "beauty" | "retail";
export type StorefrontIconName =
  | "chats" | "funnel" | "hourglass" | "star" | "vaccine" | "payments" | "fingerprint"
  | "checklist" | "cleaning" | "book" | "register" | "truck" | "loyalty" | "offer"
  | "target" | "store" | "hanger" | "telegram" | "puzzle"
  | "booking" | "site" | "insurance" | "bell" | "odoctor" | "lab" | "ai"
  | "insights" | "bolt" | "note" | "event" | "people" | "calendar" | "list" | "wallet"
  | "chart" | "badge" | "campaign" | "folder" | "print" | "monitor" | "trophy";

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
  /** Модули реестра, которые включает товар; пусто — возможность без модуля. */
  modules: string[];
  category: StorefrontCategoryId;
  icon: StorefrontIconName;
  /** Сом в месяц; 0 — подключение бесплатно; null — «Цена по запросу». */
  price: number | null;
  /** Строка под ценой: доплата за точку, цена сообщений. */
  priceNote?: string;
  /** Товар, с которым этот бесплатен. */
  freeWith?: string;
  tagline: string;
  features: string[];
  /** Разделы и экраны товара: видны на карточке, по ним ищет поиск. */
  parts?: string[];
  /** Товар без модуля: подключён ли, говорит признак сервера. */
  signal?: keyof FeatureSignals;
  /** В разработке: показываем с ценой, заявка — интерес до запуска. */
  soon?: boolean;
  /** Неактивен: клиникам не показываем; суперпользователь видит с пометкой и причиной. */
  inactive?: { reason: string };
  /** Только для этих видов бизнеса; нет — для всех. */
  verticals?: readonly StorefrontVertical[];
  /** Экран товара без модуля для кнопки «Настроить» / «Открыть». */
  route?: string;
}

const SERVICES: readonly StorefrontVertical[] = ["clinic", "beauty"];

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
    parts: ["Лиды и сделки", "Этапы и источники", "Причины потерь"],
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
    id: "online_booking", title: "Онлайн-запись", modules: [], signal: "onlineBooking", category: "clients", icon: "booking",
    price: 3500, verticals: SERVICES, route: "/bookings",
    tagline: "Клиенты записываются сами в свободные окна — без звонков",
    features: ["Свободные окна — прямо из расписания", "Заявки ждут подтверждения в CRM", "Выше те, у кого есть окна сегодня"],
    parts: ["Публичная страница записи", "Заявки на запись"],
  },
  {
    id: "site", title: "Сайт-визитка", modules: [], signal: "site", category: "clients", icon: "site",
    price: 1000, verticals: SERVICES, route: "/settings/site",
    tagline: "Своя страница в интернете: услуги, специалисты, филиалы и запись",
    features: ["Услуги и специалисты — из CRM", "Филиалы, часы работы и соцсети", "Кнопка записи на странице"],
  },
  {
    id: "odoctor", title: "oDoctor", modules: [], signal: "odoctor", category: "clients", icon: "odoctor",
    price: null, verticals: ["clinic"], route: "/settings/odoctor",
    tagline: "Свободные окна клиники — на odoctor.kg, занятые закрываются сами",
    features: ["Окна из расписания уходят на odoctor.kg", "Запись в CRM сразу закрывает окно там", "Настройка по филиалам"],
    parts: ["odoctor.kg"],
  },
  {
    id: "ai_analyst", title: "ИИ-аналитик", modules: [], soon: true, category: "clients", icon: "ai", price: 3000,
    tagline: "Спрашиваете о выручке и записях — отвечает по данным вашей CRM",
    features: [],
  },
  {
    id: "notifications", title: "Уведомления клиентам", modules: [], signal: "notifications", category: "communication",
    icon: "bell", price: 0, priceNote: "SMS 1,8 · WhatsApp 1,2 сом", verticals: SERVICES, route: "/settings/notifications",
    inactive: { reason: "Уведомления о приёмах сейчас не уходят: сначала нужно исправить отправку." },
    tagline: "Напоминания о записи по SMS и WhatsApp — меньше неявок",
    features: ["Правила: когда и о чём напоминать", "Включается по филиалам", "Платите только за отправленные сообщения"],
    parts: ["SMS", "WhatsApp"],
  },
  {
    id: "vaccinations", title: "Прививки", modules: ["vaccinations"], category: "medicine", icon: "vaccine", price: 5000,
    tagline: "Календарь прививок, партии вакцин и записи — в карточке пациента",
    features: ["Справочник вакцин и партии", "Записи о прививках у пациента", "Календарь прививок"],
    parts: ["Вакцины", "Календарь прививок"],
  },
  {
    id: "insurers", title: "Страховые компании", modules: [], signal: "insurers", category: "medicine", icon: "insurance",
    price: 1000, verticals: ["clinic"], route: "/settings/insurers",
    tagline: "Оплата приёма страховкой — видно, какая страховая платит",
    features: ["Справочник страховых и договоров", "Оплата приёма страховкой", "Страховые оплаты видны в кассе"],
  },
  {
    id: "lab", title: "Лаборатория", modules: [], soon: true, category: "medicine", icon: "lab",
    price: 12000, priceNote: "+ 5 000 сом за каждую точку", verticals: ["clinic"],
    tagline: "Приём анализов в клинике и передача в лабораторию — из CRM",
    features: ["Регистрация анализов на приёме", "Передача заказа в ЛИС лаборатории"],
    parts: ["Анализы", "ЛИС"],
  },
  {
    id: "payroll", title: "Зарплата", modules: ["payroll"], category: "team", icon: "payments", price: 5000,
    tagline: "Расчёт зарплаты по правилам — без таблиц в Excel",
    features: ["Правила оплаты у каждого сотрудника", "Закрытие и пересчёт периода", "Отчёт по зарплате за месяц"],
    parts: ["Отчёт по ЗП", "Правила оплаты"],
  },
  {
    id: "attendance", title: "СКУД", modules: ["attendance"], category: "team", icon: "fingerprint", price: 1500, freeWith: "payroll",
    tagline: "Смены и опоздания — по отметкам сотрудников",
    features: ["Начало и конец смены", "Отметка только из офиса", "Часы и смены за период"],
    parts: ["Рабочие смены"],
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
    parts: ["Товары", "Остатки", "Инвентаризация", "Касса магазина", "История продаж", "Продажи товаров"],
  },
  {
    id: "procurement", title: "Закупки и накладные", modules: ["procurement"], category: "trade", icon: "truck", price: null,
    tagline: "Поставщики, накладные, возвраты и оплаты поставщикам", features: [],
    parts: ["Накладные", "Поставщики", "Возвраты поставщику", "Распознавание накладной по фото"],
  },
  { id: "loyalty", title: "Лояльность", modules: ["loyalty"], category: "clients", icon: "loyalty", price: null, tagline: "Программы, уровни и бонусы за покупки", features: [] },
  {
    id: "promotions", title: "Акции и промокоды", modules: ["promotions"], category: "clients", icon: "offer", price: null,
    tagline: "Скидки, промокоды, ваучеры и сертификаты", features: [], parts: ["Промокоды", "Подарочные сертификаты"],
  },
  { id: "targets", title: "Планы продаж", modules: ["targets"], category: "trade", icon: "target", price: null, tagline: "Планы по точкам и продавцам и их выполнение", features: [] },
  { id: "ecommerce", title: "Интернет-магазин", modules: ["ecommerce"], category: "trade", icon: "store", price: null, tagline: "Витрина, онлайн-заказы и выдача через кассу", features: [] },
  {
    id: "retail", title: "Коллекции и сезоны", modules: ["retail"], category: "trade", icon: "hanger", price: null,
    tagline: "Коллекции моделей, продажи по сезонам и размерная сетка", features: [], parts: ["Размерная сетка"],
  },
  { id: "telegram_bot", title: "Телеграм-бот", modules: ["telegram_bot"], category: "communication", icon: "telegram", price: null, tagline: "Клиент привязывает Telegram и получает сообщения в бот", features: [] },
];

/** Входит в пакет: не продаётся, показываем разделом «Входит в ваш пакет». */
export interface StorefrontIncluded {
  id: string;
  title: string;
  icon: StorefrontIconName;
  tone: StorefrontTone;
  tagline: string;
  parts?: string[];
  /** Модуль реестра; нет — возможность без модуля, всегда в пакете. */
  module?: string;
  verticals?: readonly StorefrontVertical[];
  /** Снято с продажи: клинике — только пока включено. */
  hiddenWhenOff?: boolean;
}

export const STOREFRONT_INCLUDED: StorefrontIncluded[] = [
  {
    id: "dashboard", title: "Сводка", icon: "insights", tone: "blue", module: "reports",
    tagline: "Главное на одном экране: выручка, записи, загрузка и что требует внимания",
    parts: ["Требует внимания", "Средний чек", "Загрузка специалистов", "План на месяц"],
  },
  {
    id: "automations", title: "Автоматизации", icon: "bolt", tone: "violet",
    tagline: "Сообщения по событиям — запись, визит, оплата — без ручной рассылки",
    parts: ["Правила «событие → сообщение»", "Сообщения по расписанию", "История отправок"],
  },
  {
    id: "conclusions", title: "Заключения с ИИ-помощником", icon: "note", tone: "pink", verticals: ["clinic"],
    tagline: "Заключение по шаблону: ИИ предлагает текст и диагноз по МКБ-10, врач решает, что оставить",
    parts: ["Шаблоны заключений", "Бланки для печати", "Диагнозы МКБ-10", "Помощь AI"],
  },
  {
    id: "appointments", title: "Приёмы", icon: "event", tone: "teal", module: "appointments", verticals: ["clinic"],
    tagline: "Запись, приём и оплата — от регистратуры до кабинета врача",
    parts: ["Регистратура", "Кабинет врача", "Процедурный кабинет", "Все приёмы", "Все процедуры"],
  },
  {
    id: "visits", title: "Визиты", icon: "event", tone: "teal", module: "appointments", verticals: ["beauty"],
    tagline: "Запись, визит и оплата — от регистратуры до кабинета мастера",
    parts: ["Регистратура", "Кабинет мастера", "Все визиты"],
  },
  {
    id: "patients", title: "Пациенты", icon: "people", tone: "teal", module: "patients", verticals: ["clinic"],
    tagline: "Карточка пациента: история приёмов, оплаты и баланс",
    parts: ["Все пациенты", "Баланс пациента", "Объединение дублей"],
  },
  {
    id: "clients", title: "Клиенты", icon: "people", tone: "teal", module: "clients", verticals: ["beauty", "retail"],
    tagline: "Карточки клиентов, статусы и история покупок",
  },
  {
    id: "schedule", title: "Расписание", icon: "calendar", tone: "teal", module: "schedule", verticals: SERVICES,
    tagline: "Графики специалистов, выходные и свободные окна",
  },
  {
    id: "catalog", title: "Каталог услуг", icon: "list", tone: "teal", module: "catalog", verticals: SERVICES,
    tagline: "Услуги с ценой и длительностью, доступность по филиалам",
  },
  {
    id: "finance", title: "Касса и расходы", icon: "wallet", tone: "amber", module: "finance",
    tagline: "Касса, кассовые смены и расходы — по каждому филиалу",
    parts: ["Касса / финансы", "Кассовые смены", "Расходы", "Категории расходов"],
  },
  {
    id: "reports", title: "Отчёты", icon: "chart", tone: "blue", module: "reports",
    tagline: "Аналитические отчёты и статистика за любой период",
    parts: ["Нагрузка"],
  },
  {
    id: "staff", title: "Сотрудники, роли и филиалы", icon: "badge", tone: "amber",
    tagline: "Сотрудники, права по ролям и сеть филиалов",
    parts: ["Сотрудники", "Роли и права", "Филиалы", "Специализации"],
  },
  {
    id: "announcements", title: "Оповещения сотрудникам", icon: "campaign", tone: "violet", module: "announcements",
    tagline: "Объявления команде — по ролям или лично, с пометкой «Важное»",
  },
  {
    id: "documents", title: "Документы", icon: "folder", tone: "amber", module: "documents",
    tagline: "Лицензии, договоры и инструкции организации в одном месте",
  },
  {
    id: "printforms", title: "Печатные формы", icon: "print", tone: "blue", module: "printforms",
    tagline: "Ценники, чеки, накладные и бланки",
  },
  {
    id: "profigram", title: "Profigram", icon: "monitor", tone: "pink", module: "profigram", verticals: ["clinic"],
    tagline: "Дистанционный мониторинг здоровья пациентов",
  },
  {
    id: "achievements", title: "Мои достижения", icon: "trophy", tone: "amber", module: "achievements", hiddenWhenOff: true,
    tagline: "Бейджи сотрудников и клиники",
  },
];

/** Ядро платформы: в каталог не попадает, но и на продажу не выставляется. */
export const STOREFRONT_CORE_MODULES: readonly string[] = ["organization", "rbac", "staff"];

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

/** Подборки по виду бизнеса. */
export const STOREFRONT_BUNDLES: Record<StorefrontVertical, StorefrontBundle[]> = {
  clinic: [MORE_BOOKINGS, TEAM],
  beauty: [MORE_BOOKINGS, TEAM],
  retail: [RETURNING_BUYERS, TEAM],
};

export const RECOMMEND_TITLE: Record<StorefrontVertical, string> = {
  clinic: "Рекомендуем для клиники",
  beauty: "Рекомендуем для салона",
  retail: "Рекомендуем для магазина",
};
