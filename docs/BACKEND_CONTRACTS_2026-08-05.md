# Backend contracts для фронтенда — 05.08.2026

Документ фиксирует изменения, которые уже выложены на окружения.

## Окружения

| Окружение | Адрес | Backend | Ревизия |
|---|---|---|---|
| Тест | https://test.crm.operator.kg | booking + новые общие контракты | `6d371b4` |
| Прод | https://newcrm.pediatr.kg | только non-booking изменения | `07227dc` |

Booking-проверки выполнять на тесте. Прод не содержит booking-кода этого релиза.

## База знаний: папки

Папки принадлежат организации и не зависят от филиала.

### Методы

```text
GET    /api/knowledge/folders/
POST   /api/knowledge/folders/
PATCH  /api/knowledge/folders/<id>/
DELETE /api/knowledge/folders/<id>/
```

Пример создания:

```json
{"name":"Педиатрия","position":10,"isActive":true}
```

Ответ папки содержит `id`, `name`, `position`, `isActive`, `articleCount` и даты.
Удаление папки не удаляет статьи: у статьи `folderId` становится `null`.

У статьи появились поля:

```json
{"folderId": 12, "folderName": "Педиатрия"}
```

Создание и изменение статьи принимают `folderId`. Для очистки папки отправлять:

```json
{"folderId": null}
```

Фильтр списка статей:

```text
GET /api/knowledge/articles/?folder=12
GET /api/knowledge/articles/?folder=none
```

`folder=none` возвращает статьи без папки.

## Детализация зарплаты по дням

```text
GET /api/payroll/employees/<employeeId>/details/?year=2026&month=8
```

В каждой строке дня поле `distributedAppointments` теперь отражает ту же месячную
распределяемую часть, разложенную по датам, а не всегда `0.00`. Сумма по дням
сходится с месячным отчётом с учётом округления.

Остальные поля прежние: `appointmentsCount`, `createdByCount`, `percentSum`,
`expensesSum`, `totalSalary`, часы и предупреждение по смене.

## Кабинет пациента и booking API (тест)

### Список броней

```text
GET /api/v1/me/bookings/
X-Patient-Token: <token>
```

Поддерживаются параметры:

```text
?patient_id=13981
?status=upcoming
?status=past
?page=1&limit=20
```

Ответ:

```json
{
  "data": [{"id": 22, "patient_id": 13981, "status": "confirmed"}],
  "pagination": {"page": 1, "limit": 20, "total": 1}
}
```

`patient_id` можно выбрать только из списка пациентов текущего токена. Неизвестный
пациент возвращает `patient_not_found`, а неизвестный `status` — `validation_error`.
Для `upcoming` отменённые, завершённые и неявившиеся записи не возвращаются.

### Создание брони выбранным пациентом

Если у токена есть выбранный пациент, фронт может отправить только его ID и данные
записи:

```json
{
  "professional_id": 17,
  "branch_id": 3,
  "date": "2026-08-10",
  "time": "10:30",
  "patient_id": 13981,
  "service_ids": []
}
```

Имя и телефон берутся из карточки пациента, поэтому их не нужно дублировать.
Токен проверяется через `X-Patient-Token` и не меняет `request.user`.

### Подтверждение с услугами

```text
PATCH /api/bookings/<id>/status/
```

```json
{
  "status": "confirmed",
  "patientId": 13981,
  "serviceIds": [65, 66]
}
```

Для брони без услуги `serviceIds` обязателен при подтверждении, если нужно создать
строки услуг. После подтверждения backend обновляет в booking-снимке `services`,
`totalPrice` и `totalDurationMin`; данные приёма остаются источником истины для
фактической оплаты.

### Отмена

```text
POST /api/v1/me/bookings/<id>/cancel/
X-Patient-Token: <token>
```

Отмена меняет статус брони и отменяет связанный приём, поэтому слот освобождается.

### Ошибка организации при OTP

Неизвестный `organization_slug` возвращает HTTP 404 с кодом
`organization_not_found`. Отсутствующие обязательные поля по-прежнему дают
`validation_error`.

## Настройки уведомлений

```text
GET /api/notifications/settings/
PUT /api/notifications/settings/
```

В `rules` появились типы:

```text
booking_created
booking_confirmed
booking_cancelled
booking_reminder
```

Новые правила по умолчанию используют канал `whatsapp`. Доступные переменные
дополнены `confirmation_code`, `booking_date`, `booking_time`, `branch_name`,
`branch_address`, `services`.

Это пока контракт настроек и шаблонов. Подключение Paylink заблокировано внешними
данными мерчанта и документацией провайдера; не добавлять оплату на фронте по
догадкам.

## Быстрая проверка

```bash
# Тестовый booking endpoint должен вернуть JSON not_found, а не 404 HTML/502.
curl -i https://test.crm.operator.kg/api/v1/bookings/UNKNOWN/

# Прод без авторизации должен вернуть 401.
curl -i https://newcrm.pediatr.kg/api/auth/me/
```

