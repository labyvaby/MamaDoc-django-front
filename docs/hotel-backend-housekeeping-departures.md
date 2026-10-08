# Отель Viva: горничным — номера на выезд за день

08.10.2026. Заказчик: «у каждой горничной в приложении — список номеров, которые
сегодня выезжают в 12:00 или с поздним выездом (во сколько конкретно)».

У роли «Горничная» есть только `hotel.housekeeping.view`: брони и шахматку она не
видит, а задачи уборки нарочно без данных гостя (spec §9). Поэтому нужен отдельный
эндпоинт. Он сделан в ветке — проверить и влить.

## Ветка `seitek/hotel-housekeeping-departures`

Коммит `a6acec69` поверх `origin/test` (`12cb8e0b`), вливается fast-forward'ом.
Файлы: `server/apps/hotel/staffing.py`, `api/staffing_views.py`,
`api/staffing_payloads.py`, `api/urls.py`, новый тест
`tests/test_apps/test_hotel/test_housekeeping_departures.py`.

Проверено: `tests/test_apps/test_hotel/` — 349 passed, 1 skipped; `ruff check
--no-fix` по изменённым файлам чистый (кроме `EXE002` от Windows); `mypy` — новых
ошибок нет (в этих файлах было 4, столько и осталось).

### Эндпоинт

```http
GET /api/v2/hotel/housekeeping-departures/?propertyId=7[&date=2026-10-08][&mine=true]
```

- Право `hotel.housekeeping.view`. Чужой объект — `404`, без права — `403`.
- `date` — по умолчанию сегодня по часам объекта (`pricing.property_today`).
- `mine=true` — только этажи вошедшей горничной: по графику дня
  (`housekeepers_by_floor`, как у «Раздать по графику») и её карточке сотрудника
  (`employee_of`).

```json
{
  "propertyId": 7,
  "date": "2026-10-08",
  "checkOutTime": "12:00",
  "rooms": [
    {
      "reservationItemId": 51, "roomId": 12, "roomNumber": "101", "floor": "1",
      "departureTime": "12:00", "isLate": false, "stayStatus": "checked_in",
      "checkedOutAt": null, "housekeeperId": 17, "housekeeperName": "Мунара"
    },
    {
      "reservationItemId": 53, "roomId": 21, "roomNumber": "201", "floor": "2",
      "departureTime": "17:00", "isLate": true, "stayStatus": "checked_in",
      "checkedOutAt": null, "housekeeperId": null, "housekeeperName": ""
    }
  ]
}
```

### Какие номера входят

- Брони `confirmed`, активные позиции с назначенным номером.
- Плановый выезд в этот день, а также гости, которые выехали в этот день раньше
  своего срока: номер освободился сегодня.
- Не входят:
  - незаезды — `expected` с заездом раньше сегодняшнего дня;
  - гости, выехавшие в более ранний день.

### Время и поля

- `departureTime`:
  - поздний выезд брони (`expected_departure_time`) или правило объекта
    (`check_out_time`);
  - после выезда — фактическое время.
- `isLate` — время брони позже правила объекта.
- `housekeeperId` / `housekeeperName` — горничная этажа номера по графику дня; нет
  поста на этаж — `null`.
- Имён гостей и денег в ответе нет.
- Сортировка: по времени, затем по номеру комнаты («2» раньше «10»).

## Фронт

Уже в `test` фронта: блок «Выезды сегодня» на странице «Уборка», переключатель
«Только мои» шлёт `mine=true`. Пока сервер отвечает `404`, блока нет.

Время позднего выезда ресепшен ставит в карточке брони кнопкой «Поздний выезд».
Она сохраняет `expectedDepartureTime` и строку счёта «Поздний выезд до 16:00»
(правило Viva: до +5 ч — 50% цены ночи, позже — полная ночь).

## Как влить

```bash
git fetch origin
git checkout test && git merge --ff-only origin/seitek/hotel-housekeeping-departures
git push origin test
```

Дальше — `deploy-backend-test`.

## На заметку: завтрак как услуга и кухня

Viva продаёт завтрак допуслугой («Завтрак», 300 сом за гостя в сутки). Фронт теперь
начисляет её по дням: строка счёта на каждый день, окно «Услуга по дням».

`kitchen/day-plan/` считает порции только по питанию тарифа (`board_type`). Завтраки,
проданные услугой, кухня не видит. Если Viva хочет, чтобы кухня их учитывала, нужно
прибавлять к `mealGuests.breakfast` количество строк услуги-завтрака на эту дату.
Заодно нужно решить, как отличать такую услугу: флаг у `ExtraService`, например
`meal: "breakfast"`. Без решения не делал.
