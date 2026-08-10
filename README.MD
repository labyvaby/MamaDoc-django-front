# MamaDoc Django Front

React-фронтенд медицинской CRM MamaDoc, подключённый к Django REST API.

## Запуск

```bash
npm install
npm run dev
```

По умолчанию dev-сервер доступен на `http://localhost:5177`, а `/api` проксируется на `http://localhost:8000`.

Проверки:

```bash
npx tsc --noEmit
npm run build
```

Основной слой запросов находится в `src/api/`, страницы — в `src/pages/`, доменная логика — в `src/features/`.
