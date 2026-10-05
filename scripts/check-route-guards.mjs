// Проверка перед выкладкой на прод: страница CRM — только с правом роли.
// Подробности — scripts/routeGuards.mjs. Выход 1 — выкладка останавливается.
import { checkRepo } from "./routeGuards.mjs";

const { routes, problems, stale } = checkRepo({
  root: ".",
  backendPermissionsFile: process.env.BACKEND_PERMISSIONS_FILE || undefined,
});

for (const entry of stale) {
  console.log(`Предупреждение: исключение «${entry}» больше ни к чему не относится — уберите его из scripts/route-guards-allowlist.json.`);
}
if (!process.env.BACKEND_PERMISSIONS_FILE) {
  console.log("Каталог прав бэкенда не передан (BACKEND_PERMISSIONS_FILE) — сверка кодов пропущена.");
}
if (problems.length > 0) {
  for (const p of problems) console.error(p);
  console.error(
    `Выкладка остановлена: ${problems.length} нарушени(е/я). Модуль без ролей на прод не выкладывается (решение владельца 2026-10-06).`,
  );
  process.exit(1);
}
console.log(`check-route-guards: ${routes.length} маршрутов, нарушений нет.`);
