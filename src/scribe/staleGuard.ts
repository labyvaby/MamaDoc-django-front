/**
 * Проверка «операция устарела»: запоминает поколение записи в момент
 * создания и потом отвечает true, если запись с тех пор сбросили (отмена,
 * «выйти без досылки», отказ сервера — поколение сменилось) или провайдер
 * размонтирован. Нужна старту записи: между его ожиданиями (микрофон,
 * сервер) запись могли сбросить, и продолжать старт нельзя.
 */
export function staleGuard(
  epoch: { readonly current: number },
  alive: { readonly current: boolean },
): () => boolean {
  const mine = epoch.current;
  return () => !alive.current || epoch.current !== mine;
}
