import { useCanChecker } from "./useCan";
import { DOCUMENTS_USE_MOCKS } from "../api/documents";
import { CLEANING_USE_MOCKS } from "../api/cleaning";
import { KNOWLEDGE_USE_MOCKS } from "../api/knowledge";

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
} as const;

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
  return {
    loading,
    moduleGate: (module: MockedModule, permissions?: readonly string[]): boolean => {
      const gate = MOCKED_MODULE_GATES[module];
      return gate.mocksEnabled || can([...(permissions ?? gate.permissions)]);
    },
  };
}
