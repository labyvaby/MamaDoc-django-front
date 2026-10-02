/**
 * Снимок экрана для обращения — без диалога «выберите окно».
 *
 * Страница рисуется самим браузером через html-to-image (DOM → SVG → canvas),
 * поэтому работает на телефоне и снимает именно CRM, а не весь монитор. Цена —
 * неточности там, где DOM не отражает картинку (canvas, iframe, чужие
 * картинки без CORS): в таких местах будет пусто. Для этого в форме есть
 * «приложить свой файл».
 *
 * Снимок обязан уложиться в лимит бэкенда: сжимается в JPEG и ужимается,
 * пока не станет меньше ~450 КБ. Любой сбой (таймаут, нехватка памяти)
 * возвращает null — форма обращения от снимка не зависит.
 */

const TARGET_BYTES = 450 * 1024;
const CAPTURE_TIMEOUT_MS = 7_000;

/** Элементы с этим атрибутом на снимок не попадают (жук, диалог обращения). */
export const SUPPORT_IGNORE_ATTR = "data-support-ignore";

export interface Screenshot {
  /** data URL в формате JPEG. */
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
}

const dataUrlBytes = (dataUrl: string): number => Math.floor(((dataUrl.length - dataUrl.indexOf(",") - 1) * 3) / 4);

type Outcome<T> = { value: T } | { failed: "timeout" | "error" };

/** Дождаться результата, отличив «долго» (таймаут) от «упало» (ошибка). */
function settle<T>(promise: Promise<T>, ms: number): Promise<Outcome<T>> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve({ failed: "timeout" }), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve({ value });
      },
      () => {
        window.clearTimeout(timer);
        resolve({ failed: "error" });
      },
    );
  });
}

/** Перерисовать готовый снимок меньшего размера и качества. */
async function shrink(dataUrl: string, scale: number, quality: number): Promise<string> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * Сфотографировать видимую часть страницы. Вызывать ДО открытия панели
 * обращения: после открытия на снимке была бы сама панель.
 */
export async function captureScreenshot(): Promise<Screenshot | null> {
  try {
    const { toJpeg } = await import("html-to-image");
    const root = document.documentElement;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const background = getComputedStyle(document.body).backgroundColor || "#ffffff";

    let raw: string | null = null;
    // Быстрая ошибка (страница ещё перерисовывалась) лечится второй попыткой;
    // таймаут — нет: значит, страница слишком тяжёлая, и ждать вдвое дольше
    // человеку незачем.
    for (let attempt = 0; attempt < 2 && !raw; attempt += 1) {
      const outcome = await settle(
        toJpeg(root, {
          quality: 0.82,
          pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
          width,
          height,
          backgroundColor: background,
          cacheBust: false,
          // Шрифты не встраиваем: это самая медленная часть и главная причина
          // зависаний на больших страницах. Текст остаётся читаемым.
          skipFonts: true,
          filter: (node) => !(node instanceof HTMLElement && node.hasAttribute(SUPPORT_IGNORE_ATTR)),
          style: { transform: `translate(${-window.scrollX}px, ${-window.scrollY}px)` },
        }),
        CAPTURE_TIMEOUT_MS,
      );
      if ("value" in outcome) raw = outcome.value;
      else if (outcome.failed === "timeout") break;
      else await new Promise((resolve) => window.setTimeout(resolve, 200));
    }
    if (!raw) return null;

    let dataUrl = raw;
    let scale = 1;
    let quality = 0.78;
    for (let step = 0; step < 4 && dataUrlBytes(dataUrl) > TARGET_BYTES; step += 1) {
      scale *= 0.8;
      quality = Math.max(0.5, quality - 0.08);
      dataUrl = await shrink(raw, scale, quality);
    }
    const bytes = dataUrlBytes(dataUrl);
    if (bytes > TARGET_BYTES * 2.5) return null; // не влезет в лимит бэкенда
    return { dataUrl, width, height, bytes };
  } catch {
    return null;
  }
}

/** Файл-картинка, выбранный пользователем, → data URL (с тем же ужатием). */
export async function fileToScreenshot(file: File): Promise<Screenshot | null> {
  if (!file.type.startsWith("image/")) return null;
  try {
    const original = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    let dataUrl = await shrink(original, 1, 0.8);
    let scale = 1;
    for (let step = 0; step < 4 && dataUrlBytes(dataUrl) > TARGET_BYTES; step += 1) {
      scale *= 0.8;
      dataUrl = await shrink(original, scale, 0.7);
    }
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    return { dataUrl, width: image.width, height: image.height, bytes: dataUrlBytes(dataUrl) };
  } catch {
    return null;
  }
}
