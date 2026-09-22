/**
 * Форматирование состояния заказа лаборатории — одна точка расчёта для
 * ленты (`src/pages/lab/django/index.tsx`), карточки заказа (`LabOrderCard`)
 * и истории пациента (`PatientLabOrdersPanel`).
 *
 * Статусов на бэкенде два: `pending_dispatch` и `dispatched`. Неотправленный
 * заказ уже оплачен — деньги приняты, пробирки списаны, в ЛИС он не уехал.
 * Это сегодня основной случай, а не редкий (ЛИС недоступна с сервера), и три
 * экрана обязаны показывать его одинаково — иначе регистратор решит, что
 * заказ ушёл, там где на самом деле «Оплачен, не отправлен» (см.
 * lab-frontend-design.md, «Отказы»).
 */

export type LabOrderDispatchStatusColor = "success" | "warning";

export interface LabOrderDispatchStatus {
  label: string;
  color: LabOrderDispatchStatusColor;
}

/**
 * Метка и цвет статуса отправки. Берёт готовый флаг `isDispatched`
 * (`normalizeLabOrder`/`normalizeLabOrderDetail`), а не сырую строку
 * статуса — так эта функция не может разойтись с тем, что уже решило место
 * нормализации.
 */
export function labOrderDispatchStatus(isDispatched: boolean): LabOrderDispatchStatus {
  return isDispatched
    ? { label: "Отправлен", color: "success" }
    : { label: "Оплачен, не отправлен", color: "warning" };
}

/**
 * Причина, по которой печать этикеток и регистрационного листа недоступна —
 * `null`, если печатать можно.
 *
 * Обе формы идут через `getLabOrderLabels(orderId)`, а он берёт данные живьём
 * из ЛИС по номеру заказа в ней (`lisOrderId`) — пока заказ не уехал, там
 * физически нечего забирать. Печатать «вслепую» и ловить отказ бэкенда хуже,
 * чем сказать причину сразу (см. задачу — «не пытаться печатать пустоту»).
 *
 * Памятка подготовки сюда не входит и этой функцией не проверяется: она
 * собирается из своего каталога по `testId` строк заказа и ЛИС не касается
 * вовсе, поэтому доступна независимо от статуса отправки.
 */
export function labOrderLisPrintBlockReason(lisOrderId: number | null): string | null {
  return lisOrderId == null ? "Заказ не отправлен в ЛИС — печатать нечего" : null;
}
