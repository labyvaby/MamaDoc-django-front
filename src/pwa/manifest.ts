import React from "react";

/**
 * Манифест приложения под конкретную клинику.
 *
 * Витрина `/book` мультиарендная: на одном домене живут онлайн-записи разных
 * организаций (`?org=`). Статический `public/site.webmanifest` описывает CRM,
 * поэтому пациент «Клиники 21», поставив иконку на телефон, получил бы ярлык
 * «Aximo» с чужим логотипом, ведущий на витрину организации по умолчанию.
 *
 * Своего сервера у фронта нет (статика за nginx), отдать манифест по адресу с
 * query-параметром нельзя — поэтому собираем его на клиенте и подсовываем
 * браузеру как blob-URL. Все ссылки внутри делаем абсолютными: относительные
 * пути резолвились бы относительно blob-адреса, а не сайта.
 */

export interface AppManifestOptions {
  /** Полное название приложения (экран запуска, список приложений). */
  name: string;
  /** Короткое имя под иконкой — телефон обрезает примерно после 12 символов. */
  shortName?: string;
  /** Что открывается по иконке; относительный путь от корня сайта. */
  startUrl: string;
  /** Логотип клиники — из него собираем иконку приложения. */
  iconUrl?: string | null;
  themeColor?: string;
  backgroundColor?: string;
}

/** Иконки CRM из `public/` — запасной вариант, если логотипа клиники нет. */
const FALLBACK_ICONS = [
  { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
  { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
];

function absolute(path: string): string {
  return new URL(path, window.location.origin).toString();
}

const rasterCache = new Map<string, Promise<string | null>>();

/**
 * Квадратная PNG-иконка из логотипа клиники.
 *
 * Браузер требует от иконок точные размеры (192 и 512) и понятный тип, а
 * логотип с бэка — произвольная картинка. Перерисовываем её на canvas: вписываем
 * в квадрат с полями и белой подложкой (у логотипов обычно прозрачный фон,
 * иначе на светлой теме телефона они пропадают).
 *
 * ⚠ Если логотип отдаётся с другого домена без CORS-заголовков, canvas
 * «пачкается» и выгрузить картинку нельзя — тогда возвращаем null и остаются
 * иконки CRM. Отдельного тикета не заводим: сейчас медиа отдаётся с того же
 * домена, что и API, и проблема проявится только при выносе медиа на CDN.
 */
function rasterizeIcon(src: string, size: number): Promise<string | null> {
  const key = `${src}@${size}`;
  const cached = rasterCache.get(key);
  if (cached) return cached;

  const task = new Promise<string | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx || !img.naturalWidth || !img.naturalHeight) {
          resolve(null);
          return;
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, size, size);
        const box = size * 0.8; // поля по 10% с каждой стороны
        const scale = Math.min(box / img.naturalWidth, box / img.naturalHeight);
        const w = img.naturalWidth * scale;
        const h = img.naturalHeight * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        // Чужой домен без CORS — картинку из canvas не достать.
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });

  rasterCache.set(key, task);
  return task;
}

function buildManifest(
  options: AppManifestOptions,
  icons: { src: string; sizes: string; type: string; purpose?: string }[],
): string {
  const startUrl = absolute(options.startUrl);
  return JSON.stringify({
    name: options.name,
    short_name: options.shortName || options.name,
    id: startUrl,
    start_url: startUrl,
    scope: absolute("/"),
    display: "standalone",
    orientation: "portrait",
    lang: "ru",
    theme_color: options.themeColor || "#ffffff",
    background_color: options.backgroundColor || "#ffffff",
    icons: icons.map((icon) => ({
      ...icon,
      src: icon.src.startsWith("data:") ? icon.src : absolute(icon.src),
    })),
  });
}

/** Подменяет `<link rel="...">`, запоминая прежнее значение для отката. */
function replaceLink(rel: string, href: string): () => void {
  const existing = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  const previousHref = existing?.href ?? null;

  const link = existing ?? document.createElement("link");
  link.rel = rel;
  link.href = href;
  if (!existing) document.head.appendChild(link);

  return () => {
    if (!existing) {
      link.remove();
      return;
    }
    if (previousHref) link.href = previousHref;
  };
}

/** Подменяет `<meta name="...">`, запоминая прежнее значение для отката. */
function replaceMeta(name: string, content: string): () => void {
  const existing = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  const previousContent = existing?.content ?? null;

  const meta = existing ?? document.createElement("meta");
  meta.name = name;
  meta.content = content;
  if (!existing) document.head.appendChild(meta);

  return () => {
    if (!existing) {
      meta.remove();
      return;
    }
    if (previousContent !== null) meta.content = previousContent;
  };
}

/**
 * Ставит на страницу манифест приложения и иконку для iOS.
 *
 * Манифест обновляется дважды: сразу — с иконками CRM (чтобы название и адрес
 * запуска были правильными как можно раньше, браузер проверяет установку почти
 * сразу после загрузки), затем — с иконкой клиники, когда она отрисована.
 * Прежние значения возвращаются при уходе со страницы: сотрудник, вернувшийся
 * из витрины в CRM, должен ставить на телефон CRM, а не онлайн-запись.
 */
export function useAppManifest(options: AppManifestOptions | null): void {
  const { name, shortName, startUrl, iconUrl, themeColor, backgroundColor } = options ?? {};

  React.useEffect(() => {
    if (!name || !startUrl) return;

    const opts: AppManifestOptions = {
      name,
      shortName,
      startUrl,
      iconUrl,
      themeColor,
      backgroundColor,
    };
    let alive = true;
    const restores: (() => void)[] = [];
    // Отзываем blob-адреса только при размонтировании: браузер читает манифест
    // не мгновенно, и отзыв сразу после подстановки оставил бы его без файла.
    const blobUrls: string[] = [];

    const apply = (icons: typeof FALLBACK_ICONS) => {
      const blobUrl = URL.createObjectURL(
        new Blob([buildManifest(opts, icons)], { type: "application/manifest+json" }),
      );
      blobUrls.push(blobUrl);
      restores.push(replaceLink("manifest", blobUrl));
    };

    apply(FALLBACK_ICONS);

    // Подпись под иконкой на iPhone. Без этого тега iOS берёт `document.title`,
    // а там стоит длинное «Онлайн-запись — Мама Доктор», от которого на экране
    // останется огрызок: под иконку влезает примерно 12 символов.
    restores.push(replaceMeta("apple-mobile-web-app-title", shortName || name));

    if (iconUrl) {
      Promise.all([rasterizeIcon(iconUrl, 192), rasterizeIcon(iconUrl, 512)]).then(
        ([icon192, icon512]) => {
          if (!alive || !icon192 || !icon512) return;
          apply([
            { src: icon192, sizes: "192x192", type: "image/png" },
            { src: icon512, sizes: "512x512", type: "image/png" },
          ]);
          // iOS манифест до конца не поддерживает и берёт иконку отсюда.
          restores.push(replaceLink("apple-touch-icon", icon512));
        },
      );
    }

    return () => {
      alive = false;
      // Откатываем в обратном порядке: последний вызов вернёт исходное значение.
      restores.reverse().forEach((restore) => restore());
      blobUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [name, shortName, startUrl, iconUrl, themeColor, backgroundColor]);
}
