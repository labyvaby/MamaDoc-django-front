/**
 * Демо-события Бишкека для «Календаря событий», пока бэк не отдаёт
 * /v2/hotel/city-events/ (контракт — HotelCityEvent в src/api/hotel.ts).
 *
 * Праздники — настоящие государственные даты КР. Концерты, фестивали и
 * форумы — вымышленные (названия с пометкой демо-источника), площадки —
 * реальные места города. Даты считаются от сегодняшнего дня, чтобы
 * календарь не «устаревал» между показами. Добавленные вручную события живут
 * в памяти вкладки до перезагрузки.
 */
import dayjs from "dayjs";

import type { HotelCityEvent, HotelCityEventCreateData } from "../api/hotel";

const DEMO_SOURCE = "Афиша (демо)";

function relative(
  id: string,
  startOffset: number,
  days: number,
  event: Omit<HotelCityEvent, "id" | "dateFrom" | "dateTo" | "city" | "isManual" | "sourceUrl" | "source">,
): HotelCityEvent {
  const from = dayjs().startOf("day").add(startOffset, "day");
  return {
    id,
    city: "Бишкек",
    dateFrom: from.format("YYYY-MM-DD"),
    dateTo: from.add(days - 1, "day").format("YYYY-MM-DD"),
    source: DEMO_SOURCE,
    sourceUrl: null,
    isManual: false,
    ...event,
  };
}

/** Ближайшая дата праздника (месяц 1–12, день) не раньше сегодняшней. */
function nextHoliday(
  id: string,
  month: number,
  day: number,
  days: number,
  event: Omit<HotelCityEvent, "id" | "dateFrom" | "dateTo" | "city" | "isManual" | "sourceUrl" | "source" | "category">,
): HotelCityEvent {
  const today = dayjs().startOf("day");
  let from = dayjs(new Date(today.year(), month - 1, day));
  if (from.add(days - 1, "day").isBefore(today)) from = from.add(1, "year");
  return {
    id: `${id}-${from.year()}`,
    city: "Бишкек",
    category: "holiday",
    dateFrom: from.format("YYYY-MM-DD"),
    dateTo: from.add(days - 1, "day").format("YYYY-MM-DD"),
    source: "Государственные праздники КР",
    sourceUrl: null,
    isManual: false,
    ...event,
  };
}

function seed(): HotelCityEvent[] {
  return [
    relative("concert-stadium", 6, 1, {
      title: "Концерт звезды мировой эстрады",
      category: "concert",
      venue: "Стадион им. Долена Омурзакова",
      expectedAttendance: 25_000,
      demand: "peak",
      suggestedMarkupPercent: 45,
      description:
        "Стадионный концерт с гостями из Казахстана, Узбекистана и России. Прошлые такие концерты раскупали номера в центре за неделю: гости приезжают накануне и уезжают на следующий день.",
    }),
    relative("silk-road-forum", 13, 3, {
      title: "Международный бизнес-форум «Шёлковый путь»",
      category: "business",
      venue: "Конгресс-холл, проспект Чуй",
      expectedAttendance: 3_000,
      demand: "high",
      suggestedMarkupPercent: 20,
      description: "Делегации и участники из соседних стран. Спрос на одноместные номера и бизнес-завтраки, в основном будние ночи.",
    }),
    relative("nomad-ethno-fest", 20, 3, {
      title: "Этно-фестиваль «Кочевники»",
      category: "festival",
      venue: "Площадь Ала-Тоо",
      expectedAttendance: 15_000,
      demand: "high",
      suggestedMarkupPercent: 25,
      description: "Три дня национальной музыки, кухни и ремёсел под открытым небом. Туристические группы бронируют заранее.",
    }),
    relative("title-boxing", 34, 1, {
      title: "Титульный бой по боксу",
      category: "sport",
      venue: "Дворец спорта им. Кожомкула",
      expectedAttendance: 6_000,
      demand: "high",
      suggestedMarkupPercent: 20,
      description: "Вечер профессионального бокса с трансляцией на СНГ. Болельщики приезжают на одну-две ночи.",
    }),
    relative("tien-shan-rock", 48, 2, {
      title: "Рок-фестиваль «Тянь-Шань»",
      category: "festival",
      venue: "Парк Ата-Тюрк",
      expectedAttendance: 10_000,
      demand: "high",
      suggestedMarkupPercent: 25,
      description: "Два дня сцены под открытым небом. Молодёжная аудитория — спрос на недорогие двух- и трёхместные номера.",
    }),
    relative("philharmonic-gala", 63, 1, {
      title: "Гала-концерт симфонического оркестра",
      category: "concert",
      venue: "Филармония им. Токтогула Сатылганова",
      expectedAttendance: 1_200,
      demand: "moderate",
      suggestedMarkupPercent: 10,
      description: "Камерное событие: заметный, но не пиковый спрос в выходной вечер.",
    }),
    relative("central-asia-tech", 75, 2, {
      title: "IT-конференция Central Asia Tech",
      category: "business",
      venue: "Технопарк, ул. Ибраимова",
      expectedAttendance: 2_500,
      demand: "moderate",
      suggestedMarkupPercent: 15,
      description: "Спикеры и участники из региона, в основном одиночные гости на две ночи.",
    }),
    nextHoliday("new-year", 12, 30, 4, {
      title: "Новогодние праздники",
      venue: "Весь город",
      expectedAttendance: null,
      demand: "high",
      suggestedMarkupPercent: 30,
      description: "Приезжают гости из регионов и соседних стран, корпоративы. Ночи с 30 декабря по 2 января — самые дорогие в году.",
    }),
    nextHoliday("women-day", 3, 8, 1, {
      title: "Международный женский день",
      venue: "Весь город",
      expectedAttendance: null,
      demand: "moderate",
      suggestedMarkupPercent: 10,
      description: "Выходной день, спрос на номера с ужином и пакетные предложения для пар.",
    }),
    nextHoliday("nooruz", 3, 21, 1, {
      title: "Нооруз",
      venue: "Площадь Ала-Тоо и весь город",
      expectedAttendance: null,
      demand: "moderate",
      suggestedMarkupPercent: 15,
      description: "Народные гуляния, туристы едут посмотреть праздник. Выходные вокруг даты — повышенный спрос.",
    }),
    nextHoliday("independence", 8, 31, 1, {
      title: "День независимости",
      venue: "Площадь Ала-Тоо",
      expectedAttendance: null,
      demand: "high",
      suggestedMarkupPercent: 20,
      description: "Главный государственный праздник: концерты и салют в центре, город полон гостей.",
    }),
  ];
}

let store: HotelCityEvent[] | null = null;
const events = () => (store ??= seed());

/** Как будет отвечать GET /v2/hotel/city-events/: события, пересекающие период. */
export async function mockListCityEvents(dateFrom: string, dateTo: string): Promise<HotelCityEvent[]> {
  await new Promise((r) => setTimeout(r, 250));
  return events()
    .filter((e) => e.dateTo >= dateFrom && e.dateFrom <= dateTo)
    .sort((a, b) => a.dateFrom.localeCompare(b.dateFrom));
}

/** Как будет отвечать POST /v2/hotel/city-events/. */
export async function mockCreateCityEvent(data: HotelCityEventCreateData): Promise<HotelCityEvent> {
  await new Promise((r) => setTimeout(r, 250));
  const created: HotelCityEvent = {
    id: `manual-${Date.now()}`,
    title: data.title,
    category: data.category,
    city: "Бишкек",
    venue: data.venue ?? "",
    dateFrom: data.dateFrom,
    dateTo: data.dateTo,
    expectedAttendance: data.expectedAttendance ?? null,
    demand: data.demand,
    suggestedMarkupPercent: data.suggestedMarkupPercent,
    description: data.description ?? "",
    source: "Добавлено вручную",
    sourceUrl: null,
    isManual: true,
  };
  events().push(created);
  return created;
}
