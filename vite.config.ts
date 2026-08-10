import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { execSync } from "node:child_process";

// Для корректного alias в ESM-конфиге Vite
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Номер версии в бургер-меню — количество коммитов этого репозитория на
// момент сборки. Всегда актуально, руками не бампаем.
const getFrontendCommitCount = (): number => {
  try {
    return Number(
      execSync("git rev-list --count HEAD", { cwd: __dirname }).toString().trim(),
    );
  } catch {
    return 0;
  }
};

/**
 * Мета-теги превью ссылки в index.html. Краулеры мессенджеров не выполняют JS,
 * поэтому название клиники и адрес картинки должны попасть в HTML на сборке —
 * то, что витрина ставит в рантайме, им не видно.
 *
 * Плейсхолдеры намеренно в стиле `__NAME__`, а не `%VITE_NAME%`: Vite сам
 * подставляет только переменные с префиксом VITE_ и ругается, если такой нет,
 * а нам нужны дефолты.
 */
const bookingMeta = (env: Record<string, string>) => ({
  name: "booking-meta",
  transformIndexHtml: (html: string) =>
    html
      .replaceAll("__BOOKING_ORG_NAME__", env.VITE_BOOKING_ORG_NAME || "Мама Доктор")
      .replaceAll(
        "__BOOKING_ORIGIN__",
        (env.VITE_BOOKING_PUBLIC_ORIGIN || "https://newcrm.pediatr.kg").replace(/\/+$/, ""),
      ),
});

const rewriteDevCookie = (cookie: string): string =>
  cookie
    .replace(/;\s*Domain=[^;]*/gi, "")
    .replace(/;\s*Secure/gi, "");

// ОПТИМИЗАЦИЯ: Полная конфигурация для максимальной производительности
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiProxyTarget = env.VITE_API_PROXY_TARGET;

  return {
    plugins: [react(), bookingMeta(env)],
    define: {
      __APP_FRONTEND_COMMIT_COUNT__: JSON.stringify(getFrontendCommitCount()),
    },
    resolve: {
      alias: {
        // Жёстко указываем одну копию React/ReactDOM, чтобы избежать "Invalid hook call"
        react: resolve(__dirname, "node_modules/react"),
        "react-dom": resolve(__dirname, "node_modules/react-dom"),
      },
    },
    server: {
      host: true,
      proxy: apiProxyTarget
        ? {
            "/api": {
              target: apiProxyTarget,
              changeOrigin: true,
              secure: false,
              configure: (proxy) => {
                proxy.on("proxyRes", (proxyRes) => {
                  const setCookie = proxyRes.headers["set-cookie"];
                  if (!setCookie) return;
                  proxyRes.headers["set-cookie"] = setCookie.map(rewriteDevCookie);
                });
              },
            },
            // Бэкенд отдаёт photoUrl как относительный путь `/media/...`.
            // В деве фронт и бэк на разных origin — без проксирования
            // картинки пациентов/услуг не грузятся (404 на Vite). В проде
            // фронт и бэк на одном origin, поэтому там это не нужно.
            "/media": {
              target: apiProxyTarget,
              changeOrigin: true,
              secure: false,
            },
            // Realtime (Django Channels): по контракту клиент открывает
            // ws://<origin>/ws/changes/ — в проде Caddy роутит /ws/* на
            // daphne, в деве проксируем на локальный ws-контейнер (8001).
            // ws: true обязателен — это Upgrade-запрос, а не обычный HTTP.
            "/ws": {
              target: env.VITE_WS_PROXY_TARGET || "ws://localhost:8001",
              changeOrigin: true,
              secure: false,
              ws: true,
            },
          }
        : undefined,
    },
    build: {
      // Увеличиваем размер чанка для предупреждения
      chunkSizeWarningLimit: 1000,

      // Оптимизация минификации
      minify: 'esbuild',

      // Отключаем source maps в production для уменьшения размера
      sourcemap: false,

      // Оптимизация rollup для code splitting
      rollupOptions: {
        output: {
          // Разделяем код на оптимальные чанки
          manualChunks: {
            // Vendor чанк для библиотек
            'vendor-react': ['react', 'react-dom', 'react-router'],
            'vendor-mui': ['@mui/material', '@mui/icons-material', '@mui/x-date-pickers'],
            'vendor-refine': ['@refinedev/core', '@refinedev/mui', '@refinedev/react-router'],
            'vendor-utils': ['dayjs', 'lodash'],
          },

          // Оптимизация имен файлов для кэширования
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
        },
      },

      // CSS code splitting
      cssCodeSplit: true,

      // Оптимизация для production
      target: 'es2015',

      // Оптимизация зависимостей
      commonjsOptions: {
        transformMixedEsModules: true,
      },
    },

    // Оптимизация для dev и build
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router',
        '@mui/material',
        '@refinedev/core',
        '@refinedev/mui',
        // Транзитивная зависимость @refinedev/mui, импортируется напрямую
        // (useSnackbar в страницах настроек). Без пребандла в dev получаются
        // два экземпляра модуля: провайдер Refine из одного, хук из другого —
        // useSnackbar() возвращает undefined и страница падает.
        'notistack',
        'pdfmake/build/pdfmake',
      ],
    },

    // Настройка esbuild для максимальной производительности
    esbuild: {
      // Удаляем console.log в production
      drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],

      // Оптимизация минификации
      legalComments: 'none',
    },
  };
});
