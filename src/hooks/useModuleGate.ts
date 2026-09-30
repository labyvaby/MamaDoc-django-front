import { useCanChecker } from "./useCan";
import { usePermissions } from "./usePermissions";
import { DOCUMENTS_USE_MOCKS } from "../api/documents";
import { CLEANING_USE_MOCKS } from "../api/cleaning";
import { KNOWLEDGE_USE_MOCKS } from "../api/knowledge";
import { REALESTATE_USE_MOCKS } from "../api/realestate";

/**
 * Единая точка доступа к модулям, работающим на моках до готовности бэка.
 *
 * Пока флаг *_USE_MOCKS в api/<module>.ts включён, модуль открыт всем
 * аутентифицированным (демо-режим). После интеграции достаточно выключить
 * флаг — все гейты (роут в App.tsx через RequireModule, пункт сайдбара,
 * вкладка настроек) автоматически начнут требовать права, править их
 * по отдельности не нужно.
 */
export const MOCKED_MODULE_GATES = {
  documents: {
    mocksEnabled: DOCUMENTS_USE_MOCKS,
    permissions: ["documents.view"],
  },
  cleaning: {
    mocksEnabled: CLEANING_USE_MOCKS,
    // Уборщице достаточно cleaning.report, админу — view/manage.
    permissions: ["cleaning.report", "cleaning.view", "cleaning.manage"],
  },
  knowledge: {
    mocksEnabled: KNOWLEDGE_USE_MOCKS,
    permissions: ["knowledge.view"],
  },
  // Квартиры и шахматка застройщика (вертикаль realestate). Ключ модуля и
  // право на бэке — realty / realty.view (test2, 28.09.2026; см. api/realestate.ts).
  realty: {
    mocksEnabled: REALESTATE_USE_MOCKS,
    permissions: ["realty.view"],
  },
} as const;

/**
 * Переключатель модулей, которых бэк ещё не выдаёт ни одной организации:
 *   localStorage.setItem("mamadoc:modules", "realty"); location.reload();
 * Работает только для модулей на моках, в dev-сборке и на тестовом стенде —
 * чтобы показать модуль до бэка. Сборки теста и прода собираются из одного кода,
 * поэтому стенд различаем по хосту во время работы: на проде переключатель мёртв.
 */
const DEV_MODULES_KEY = "mamadoc:modules";
const TEST_STAND_HOSTS = ["test.crm.operator.kg"];

function devEnabledModules(): string[] {
  const onTestStand = typeof window !== "undefined" && TEST_STAND_HOSTS.includes(window.location.hostname);
  if (!import.meta.env.DEV && !onTestStand) return [];
  try {
    return (localStorage.getItem(DEV_MODULES_KEY) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export type MockedModule = keyof typeof MOCKED_MODULE_GATES;

/**
 * Возвращает проверку доступа к mock-модулю.
 *
 * @example
 * const { moduleGate } = useModuleGate();
 * if (moduleGate("cleaning")) { ... }                      // права по умолчанию
 * if (moduleGate("cleaning", ["cleaning.manage"])) { ... } // переопределение (настройки)
 */
export function useModuleGate() {
  const { can, loading } = useCanChecker();
  const { hasModule } = usePermissions();
  return {
    loading,
    moduleGate: (module: MockedModule, permissions?: readonly string[]): boolean => {
      const gate = MOCKED_MODULE_GATES[module];
      if (gate.mocksEnabled && devEnabledModules().includes(module)) return true;
      return hasModule(module) && (gate.mocksEnabled || can([...(permissions ?? gate.permissions)]));
    },
  };
}
