/**
 * imageCompression.ts
 * Утилита для сжатия изображений через Canvas API.
 */

/**
 * Потолок веса файла, который переживает загрузку на бэк.
 *
 * Django режет multipart-запрос тяжелее DATA_UPLOAD_MAX_MEMORY_SIZE (2.5 МБ
 * по умолчанию) ещё до вьюхи: ответ — HTML «Bad Request (400)» без JSON, а с
 * ~4 МБ прокси отдаёт 502. Пользователь при этом видел бесполезное
 * «Проверьте правильность заполнения полей» (проверено на проде 06.08.2026,
 * тикет backend_ticket_upload_limits.md). Берём 2 МБ — запас на границы
 * multipart и остальные поля формы.
 */
export const UPLOAD_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Потолок для файла, который пользователь только выбрал: всё, что ниже, мы
 * ужимаем сами до UPLOAD_MAX_BYTES. Отсекает разве что RAW и «фото» на 50 МБ.
 */
export const PHOTO_SOURCE_MAX_MB = 25;
export const PHOTO_SOURCE_MAX_BYTES = PHOTO_SOURCE_MAX_MB * 1024 * 1024;

/**
 * accept для <input type="file"> под фото.
 *
 * Именно `image/*`, а не список jpeg/png/webp: iPhone отдаёт HEIC, и при
 * узком accept снимок из медиатеки либо недоступен, либо приходит как есть.
 * Формат приводим сами в prepareImageForUpload.
 */
export const PHOTO_ACCEPT = "image/*";

/** Расширения, которые принимает бэк (проверяет именно имя файла, не MIME). */
const BACKEND_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];

/** «IMG_0001.HEIC» → «IMG_0001.jpg»: бэк валидирует расширение имени. */
function withExtension(name: string, ext: string): string {
  const base = name.replace(/\.[^./\\]+$/, "") || "photo";
  return `${base}.${ext}`;
}

function hasSupportedExtension(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return BACKEND_IMAGE_EXTENSIONS.includes(ext);
}

/**
 * Готовит выбранное фото к отправке на бэк: ужимает под UPLOAD_MAX_BYTES и
 * приводит к jpg. Решает две реальные проблемы телефонов:
 *   • снимок с камеры весит 3–5 МБ → запрос не доходит до вьюхи;
 *   • iPhone отдаёт HEIC/HEIF → бэк отвечает «Допустимые форматы: jpg, jpeg,
 *     png, webp» (canvas декодирует HEIC в Safari и отдаёт нам jpeg).
 *
 * Возвращает null, если изображение не удалось прочитать или ужать до лимита —
 * вызывающий код показывает пользователю понятную ошибку вместо 400 с сервера.
 */
export async function prepareImageForUpload(
  file: File,
  options: { keepAlpha?: boolean } = {},
): Promise<File | null> {
  // Уже лёгкий файл в поддерживаемом формате трогать незачем.
  if (file.size <= UPLOAD_MAX_BYTES && hasSupportedExtension(file.name)) {
    return file;
  }

  // SVG (логотипы) — вектор, растрировать нечего: отдаём как есть, пусть бэк
  // решает. Он у логотипов svg принимает, а вес такого файла всегда мал.
  if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
    return file;
  }

  // Ступени качества/размера: от «почти оригинал» до заведомо лёгкого.
  const steps: { maxWidth: number; quality: number }[] = [
    { maxWidth: 1920, quality: 0.8 },
    { maxWidth: 1600, quality: 0.7 },
    { maxWidth: 1280, quality: 0.6 },
    { maxWidth: 1024, quality: 0.5 },
  ];

  let bitmap: HTMLImageElement;
  try {
    bitmap = await loadImage(file);
  } catch {
    return null;
  }

  // Логотипы и прочая графика с прозрачностью: сначала пробуем ужать в png
  // (jpeg залил бы прозрачный фон белым). Не влезло — падаем в jpeg.
  if (options.keepAlpha) {
    const png = await encodeImage(bitmap, steps[0].maxWidth, "image/png");
    if (png && png.size <= UPLOAD_MAX_BYTES) {
      return new File([png], withExtension(file.name, "png"), { type: "image/png" });
    }
  }

  for (const step of steps) {
    const blob = await encodeImage(bitmap, step.maxWidth, "image/jpeg", step.quality);
    if (!blob) return null;
    if (blob.size <= UPLOAD_MAX_BYTES) {
      return new File([blob], withExtension(file.name, "jpg"), { type: "image/jpeg" });
    }
  }
  return null;
}

/** Файл → готовый к отрисовке <img> (data-URL переживает HEIC в Safari). */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("decode failed"));
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/** Отрисовка с ограничением длинной стороны и кодирование в указанный формат. */
function encodeImage(
  img: HTMLImageElement,
  maxSide: number,
  mime: "image/jpeg" | "image/png",
  quality?: number,
): Promise<Blob | null> {
  let width = img.width;
  let height = img.height;
  const longest = Math.max(width, height);
  if (longest > maxSide) {
    const ratio = maxSide / longest;
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  if (mime === "image/jpeg") {
    // Прозрачные пиксели в jpeg стали бы чёрными — подкладываем белый фон.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(img, 0, 0, width, height);

  return new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
}

export async function compressImage(file: File, maxWidth = 1920, quality = 0.8): Promise<File | Blob> {
  const ONE_MB = 1 * 1024 * 1024;

  // Если файл меньше 1МБ или это не изображение — не сжимаем
  if (file.size <= ONE_MB || !file.type.startsWith("image/")) {
    return file;
  }

  // Если это SVG, сжимать не нужно
  if (file.type === "image/svg+xml") {
    return file;
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        // Рассчитываем новые размеры
        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxWidth) {
            width *= maxWidth / height;
            height = maxWidth;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(file); // Если не удалось получить контекст, возвращаем оригинал
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              // Возвращаем как File, если возможно, чтобы сохранить имя
              const compressedFile = new File([blob], file.name, {
                type: "image/jpeg", // Принудительно в jpeg для лучшего сжатия
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            } else {
              resolve(file);
            }
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => resolve(file);
    };
    reader.onerror = (err) => reject(err);
  });
}
