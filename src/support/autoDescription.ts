import type { Problem } from "./diagnosticsRecorder";

/**
 * Автоописание ошибки по снимку «чёрного ящика» — без нейросети, шаблоном.
 *
 * Человек, которому стало плохо, пишет «ну не работает, я потыкал». Поэтому
 * форма приходит заполненной: где это случилось, какая кнопка была последней и
 * что ответил сервер. Текст можно править — это отправная точка, а не приговор.
 */

/** Человеческие названия страниц по началу пути. Порядок важен: длинные раньше. */
const PAGE_NAMES: [prefix: string, name: string][] = [
  ["/settings/roles", "Настройки · Роли"],
  ["/settings", "Настройки"],
  ["/appointments", "Регистратура"],
  ["/all-appointments", "Все приёмы"],
  ["/all-procedures", "Все процедуры"],
  ["/patients", "Карточки"],
  ["/patient-search", "Поиск"],
  ["/clients", "Клиенты"],
  ["/doctor", "Кабинет специалиста"],
  ["/nurse", "Процедурный кабинет"],
  ["/schedule", "Расписание"],
  ["/bookings", "Онлайн-запись"],
  ["/waitlist", "Лист ожидания"],
  ["/tasks", "Задачи"],
  ["/deals", "Воронка продаж"],
  ["/cashbox", "Касса"],
  ["/certificates", "Сертификаты"],
  ["/pos/history", "История продаж"],
  ["/pos", "Касса магазина"],
  ["/sales", "Продажи"],
  ["/expenses", "Расходы"],
  ["/reports", "Отчёты"],
  ["/dashboard", "Сводка"],
  ["/salary-reports", "Отчёт по зарплате"],
  ["/storage", "Склад"],
  ["/warehouses", "Склады"],
  ["/products", "Товары"],
  ["/invoices", "Накладные"],
  ["/inventory", "Инвентаризация"],
  ["/vaccinations", "Прививки"],
  ["/lab", "Лаборатория"],
  ["/services", "Услуги"],
  ["/employees", "Сотрудники"],
  ["/work-shifts", "Рабочие смены"],
  ["/documents", "Документы"],
  ["/knowledge", "База знаний"],
  ["/reviews", "Отзывы"],
  ["/cleaning", "Уборки"],
  ["/achievements", "Достижения"],
  ["/profile", "Профиль"],
  ["/support", "Поддержка"],
];

export function pageTitleFor(path: string): string {
  const clean = path.split("?")[0] || "/";
  const hit = PAGE_NAMES.find(([prefix]) => clean === prefix || clean.startsWith(`${prefix}/`));
  return hit ? hit[1] : "";
}

/** Статус ответа сервера → что сказать человеку. */
export function describeStatus(status: number | null): string {
  if (status === 0) return "нет связи с сервером";
  if (status === 502 || status === 503 || status === 504) return "сервер временно недоступен";
  if (status !== null && status >= 500) return "на сервере произошла ошибка";
  return "";
}

export interface RecentAction {
  type: "click" | "route";
  label: string;
}

export interface AutoDescription {
  title: string;
  description: string;
  steps: string;
}

/** Имя нажатой кнопки из подписи recorder'а; поля ввода и безымянные — null. */
function clickName(label: string): string | null {
  const match = /^(?!input|textarea|select)\w+\[(.+)\]$/.exec(label);
  return match && !match[1].startsWith("#") ? match[1] : null;
}

/** «Открыл «Регистратура» → нажал «Сохранить»» из последних действий. */
export function describeSteps(actions: RecentAction[]): string {
  const parts: string[] = [];
  for (const action of actions.slice(-5)) {
    if (action.type === "route") {
      const name = pageTitleFor(action.label);
      if (name) parts.push(`открыл «${name}»`);
      continue;
    }
    // «button[Сохранить]» → «Сохранить»; безымянные элементы пропускаем.
    const name = clickName(action.label);
    if (name) parts.push(`нажал «${name}»`);
  }
  if (!parts.length) return "";
  const joined = parts.join(" → ");
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

/**
 * Заготовка для категории «Ошибка». Без недавнего сбоя вернёт пустые поля:
 * человек сообщает о проблеме вручную, и подставлять ему нечего.
 */
export function buildAutoDescription(
  problem: Problem | null,
  route: string,
  actions: RecentAction[],
): AutoDescription {
  const page = pageTitleFor(route);
  const where = page ? `на странице «${page}»` : "в системе";
  const steps = describeSteps(actions);
  if (!problem) return { title: "", description: "", steps };

  const lastClick = [...actions].reverse().find((a) => a.type === "click" && clickName(a.label));
  const clicked = lastClick ? clickName(lastClick.label) : null;
  const after = clicked ? ` после нажатия «${clicked}»` : "";
  const trace = problem.traceId ? ` Код для разработчиков: ${problem.traceId}.` : "";

  if (problem.kind === "react") {
    return {
      title: page ? `Страница «${page}» перестала открываться` : "Страница перестала открываться",
      description: `${capitalize(where)}${after} интерфейс остановился с ошибкой и показал экран «Что-то пошло не так».`,
      steps,
    };
  }
  if (problem.kind === "network") {
    return {
      title: "Пропала связь с сервером",
      description: `${capitalize(where)}${after} запрос не дошёл до сервера: нет связи.`,
      steps,
    };
  }
  if (problem.kind === "api") {
    const reason = describeStatus(problem.status);
    const code = problem.status ? ` (ошибка ${problem.status})` : "";
    return {
      title: page ? `Ошибка на странице «${page}»` : "Ошибка при выполнении действия",
      description: `${capitalize(where)}${after} действие не выполнилось: ${reason || "сервер вернул ошибку"}${code}.${trace}`,
      steps,
    };
  }
  return {
    title: page ? `Сбой на странице «${page}»` : "Сбой в интерфейсе",
    description: `${capitalize(where)}${after} произошёл сбой в интерфейсе.${trace}`,
    steps,
  };
}

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
