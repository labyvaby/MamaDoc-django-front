/**
 * Утилиты для валидации данных
 */

/**
 * Регулярное выражение для проверки формата UUID
 * Формат: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (где x - шестнадцатеричная цифра)
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Проверяет, является ли строка корректным UUID
 * @param value - значение для проверки
 * @returns true если value - корректный UUID, иначе false
 */
export function isValidUUID(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return UUID_REGEX.test(value.trim());
}

/**
 * Валидирует UUID и выбрасывает ошибку, если формат некорректный
 * @param value - значение для проверки
 * @param fieldName - название поля (для более понятного сообщения об ошибке)
 * @throws Error если value не является корректным UUID
 */
export function validateUUID(value: unknown, fieldName = "ID"): asserts value is string {
  if (!isValidUUID(value)) {
    const valueStr = String(value ?? "");
    throw new Error(
      `Некорректный формат UUID для поля "${fieldName}": получено "${valueStr}". ` +
      `Ожидается формат: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
    );
  }
}
