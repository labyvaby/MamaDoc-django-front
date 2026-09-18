# E2E-тесты (Playwright)

Сквозные сценарии против **живого** бэка. По умолчанию — стенд
`https://test.crm.operator.kg`; на нём уже есть организация `E2E Clinic`
(её создаёт `seed_e2e_org` в бэке).

## Локальный запуск

Один раз: `npx playwright install chromium`.

PowerShell (не Git Bash — MSYS подменяет переменные, начинающиеся с `/`):

```powershell
$env:E2E_ADMIN_PASSWORD="<из config/.env стенда>"
$env:E2E_DOCTOR_PASSWORD="<из config/.env стенда>"
npm run e2e                       # всё
npm run e2e -- employees          # один файл
npm run e2e:ui                    # интерактивно
npm run e2e:report                # последний HTML-отчёт
```

Против другого адреса: `$env:E2E_BASE_URL="http://localhost:5177"`.

## Структура

- `playwright.config.ts` — проекты `setup` (логин → `test-results/.auth/admin.json`) и `chromium`.
- `fixtures/seed.ts` — имена/логины из бэк-сида. Единственное место, где они захардкожены.
- `pages/` — Page Objects. Селекторы через `data-testid` там, где подпись поля не `<label>`.
- `tests/*.spec.ts` — сценарии; `tests/auth.spec.ts` стартует без сессии (`test.use({ storageState: … })`).

## Правила

- Тест не зовёт API напрямую — только через UI, как пользователь.
- Всё, что тест создаёт, — с уникальным суффиксом (`Date.now()`, `uniquePhoneLocal()`); чистить не нужно, `seed_e2e_org --reset` сносит организацию целиком перед каждым серверным прогоном.
- Новому элементу формы, который нужен тесту, — `data-testid`, а не поиск по тексту.
