/**
 * uploads.ts
 * Общая обвязка загрузки картинок на бэк.
 *
 * Зачем: Django обрубает multipart-запрос тяжелее DATA_UPLOAD_MAX_MEMORY_SIZE
 * (2.5 МБ) ещё до вьюхи и отдаёт HTML «Bad Request (400)» без JSON, а около
 * 4 МБ прокси возвращает 502. Снимок с телефона весит 3–5 МБ, на iPhone ещё и
 * приходит в HEIC, который бэк отклоняет по расширению. Пользователь при этом
 * видел бесполезное «Проверьте правильность заполнения полей» (воспроизведено
 * на проде 06.08.2026 на PUT /finance/expenses/<id>/photo/).
 *
 * Поэтому любую картинку перед отправкой прогоняем через prepareImageForUpload
 * (ужать + перевести в jpg), а необъяснимые ответы сервера переводим в текст,
 * по которому понятно, что делать.
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
 */
export async function preparePhotoOrThrow(
  file: File,
  options: { keepAlpha?: boolean } = {},
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
