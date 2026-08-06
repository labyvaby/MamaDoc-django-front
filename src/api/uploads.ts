/**
 * uploads.ts
 * Общая обвязка загрузки картинок на бэк.
 *
 * Бэк (main 4f8f4d4, 06.08.2026) принимает jpg/jpeg/png/webp/heic/heif до
 * 25 МБ, на превышение отвечает 413 с JSON `detail[0].msg`, а у jpg/png/webp
 * проверяет реальное содержимое — переименовать файл не поможет. Такие ответы
 * клиент показывает как есть (extractErrorMessage разбирает detail).
 *
 * Картинку всё равно прогоняем через prepareImageForUpload: тяжёлый снимок
 * долго уходит по мобильному интернету, а HEIC не показать в превью нигде,
 * кроме Safari. Ответ без JSON-тела (обрыв на прокси) переводим в текст про
 * размер — до фикса бэка это выглядело как «Проверьте правильность заполнения
 * полей», см. MamaDoc/backend_ticket_upload_limits.md.
 */
import { ApiError } from "./client";
import { prepareImageForUpload } from "../utility/imageCompression";

const PREPARE_FAILED_MESSAGE =
  "Не удалось обработать это изображение — попробуйте другое или сделайте снимок заново.";

const TOO_LARGE_MESSAGE =
  "Сервер не принял файл — изображение слишком большое. Попробуйте снимок меньшего размера.";

/**
 * Готовит картинку к отправке. Бросает ApiError с понятным текстом, если файл
 * не удалось прочитать или ужать — вызывающий код уже умеет показывать ошибки
 * API, отдельная ветка обработки ему не нужна.
 *
 * `keepAlpha` — для логотипов и прочей графики с прозрачностью.
 * `maxBytes` — когда в одном запросе уходит пачка файлов и в 25 МБ на запрос
 * нужно уложиться всем вместе (фотоотчёт уборки).
 */
export async function preparePhotoOrThrow(
  file: File,
  options: { keepAlpha?: boolean; maxBytes?: number } = {},
): Promise<File> {
  const prepared = await prepareImageForUpload(file, options);
  if (!prepared) throw new ApiError(PREPARE_FAILED_MESSAGE, 0, null);
  return prepared;
}

/**
 * То же для эндпоинтов, куда кладут любые файлы (вложения задач, документы):
 * картинку готовим, всё остальное — pdf, docx — отдаём как есть.
 */
export async function preparePhotoIfImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  return preparePhotoOrThrow(file);
}

/**
 * Оборачивает вызов загрузки: ответ без JSON-тела на 400/413/502 — это почти
 * всегда обрубленный по размеру запрос, а не ошибка полей формы.
 */
export async function withUploadErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof ApiError && err.payload === null && [400, 413, 502].includes(err.status)) {
      throw new ApiError(TOO_LARGE_MESSAGE, err.status, err.payload);
    }
    throw err;
  }
}
