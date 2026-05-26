// Вспомогательные функции для работы со временем

/**
 * Округляет минуты времени к ближайшему кратному step (по умолчанию 5 минут).
 * При переполнении 60 минут увеличивает час и мод 24.
 * Ожидаемый формат ввода: "HH:MM" или "HH:MM:SS" (вторые секунды игнорируются).
 * Возвращает строку в формате "HH:MM".
 */
export function roundMinutesToStep(time: string, step = 15): string {
  if (!time) return time;
  const parts = time.split(":");
  if (parts.length < 2) return time;
  let h = parseInt(parts[0], 10);
  let m = parseInt(parts[1], 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return time;

  const rounded = Math.round(m / step) * step;
  if (rounded >= 60) {
    h = (h + 1) % 24;
    m = 0;
  } else {
    m = rounded;
  }
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Округляет строку формата input[type="datetime-local"] к ближайшим step минутам.
 * Поддерживает вида: "YYYY-MM-DDTHH:MM" или с секундами "YYYY-MM-DDTHH:MM:SS".
 * Возвращает без секунд: "YYYY-MM-DDTHH:MM".
 */
import dayjs from "dayjs";

/**
 * Округляет строку формата input[type="datetime-local"] к ближайшим step минутам.
 * Поддерживает вида: "YYYY-MM-DDTHH:MM" или с секундами "YYYY-MM-DDTHH:MM:SS".
 * Возвращает без секунд: "YYYY-MM-DDTHH:MM".
 * Использует dayjs для корректной обработки часовых поясов.
 */
export function roundDateTimeLocalToStep(dt: string, step = 15): string {
  if (!dt) return dt;
  
  // Парсим дату. dayjs(dt) корректно обрабатывает ISO строки с часовым поясом (например, "2026-02-01T05:00:00+00:00")
  // и конвертирует их в локальное время браузера.
  let d = dayjs(dt);
  if (!d.isValid()) return dt;

  const m = d.minute();
  const roundedM = Math.round(m / step) * step;

  // Устанавливаем округленные минуты. dayjs сам обработает переполнение часа/дня/года.
  // Например, если сейчас 10:55 и округляем до 15 мин -> 60 мин -> 11:00.
  d = d.minute(roundedM).second(0).millisecond(0);

  // Форматируем в строку, совместимую с <input type="datetime-local" />
  // dayjs().format("YYYY-MM-DDTHH:mm") возвращает локальное время.
  return d.format("YYYY-MM-DDTHH:mm");
}
