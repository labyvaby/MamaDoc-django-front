# API номера: терраса, экспликация и фото

Для frontend-ветки `seitek`. Backend-контракт реализован в коммите
`6e739de6` ветки `test` репозитория MamaDoc-backend.

## Room

`GET /api/v2/hotel/rooms/?propertyId=<id>` возвращает новые поля у каждого
номера:

```ts
type RoomZone = {
  name: string;
  area: string;          // десятичная строка в м²; "" — ещё не измерено
  width: string | null;  // метры
  length: string | null; // метры
};

type RoomPhoto = {
  id: number;
  url: string;
  sortOrder: number;
};

type RoomDetails = {
  hasTerrace: boolean;
  terraceArea: string | null;
  roomZones: RoomZone[];
  photos: RoomPhoto[];
};
```

`photos` всегда массив, даже если фото нет. Backend возвращает его в порядке
`sortOrder`, затем `id`. Поля террасы и зоны доступны также в ответе
`POST /rooms/` и `PATCH /rooms/{roomId}/`.

### PATCH

- `hasTerrace: false` сохраняет отсутствие террасы.
- `terraceArea: null` означает «не менять», как и пропущенное поле.
- `clearTerraceArea: true` очищает площадь террасы.
- `roomZones` заменяет список целиком. Передайте `[]`, чтобы удалить все
  зоны; пропущенное поле или `null` оставляет список без изменений.
- `name` зоны обязателен (1–120 символов). `area` может быть пустой строкой;
  `width` и `length` могут быть `null`. Числовые значения передавайте
  десятичными строками с точностью до двух знаков.

Пример:

```json
{
  "hasTerrace": true,
  "terraceArea": "4.50",
  "roomZones": [
    { "name": "Спальня", "area": "18.20", "width": "3.50", "length": "5.20" },
    { "name": "Гостиная", "area": "", "width": null, "length": null }
  ]
}
```

## Фото номера

Список читается из `RoomPayload.photos`; отдельный GET не нужен. Endpoint для
подключения будущей загрузки:

```text
POST   /api/v2/hotel/rooms/{roomId}/photos/             multipart, поле file → RoomPhoto
DELETE /api/v2/hotel/rooms/{roomId}/photos/{photoId}/   → 204
```

Загрузка принимает JPG, JPEG, PNG, WebP и HEIC до 10 МБ. Загрузка и удаление
требуют `hotel.manage`; идентификаторы проверяются внутри доступного объекта
и tenant. Новый снимок получает следующий `sortOrder`. Удаление номера
удаляет и его файлы. Текущая форма не загружает фото — upload control можно
добавить отдельно.

## Состояние тестового контура

Коммит `6e739de6` запушен в backend `test`; миграция `hotel.0012` применилась
на тестовой базе. Два штатных blue-green прохода остановились, потому что
green web не ответил на `/health/` в пределах 300 секунд. Активным остался
предыдущий blue. До восстановления green новые API-поля в публичном тестовом
контуре недоступны. Паролей и токенов в этом файле нет.
