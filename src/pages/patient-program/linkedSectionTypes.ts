import type { EffectiveProgramModule, ProgramModuleKind } from "../../api/programs";

/**
 * Системные разделы книжки (ТЗ §5.4). Зеркало `programs/module_types.py`:
 * связанный раздел показывает данные пациента из медкарты, прививок и приёмов,
 * своих полей и записей у него нет.
 */
export type SystemSectionType =
  | "family"
  | "birth_history"
  | "allergies"
  | "conditions"
  | "surgeries"
  | "growth"
  | "feeding"
  | "vaccination"
  | "medications"
  | "visits"
  | "life_anamnesis"
  | "checkup_plan";

export const SYSTEM_SECTIONS: ReadonlyArray<{
  type: SystemSectionType;
  name: string;
  description: string;
  kind: ProgramModuleKind;
}> = [
  { type: "family", name: "Паспорт семьи", description: "Члены семьи, их заболевания и диспансеризация семьи", kind: "linked" },
  {
    type: "conditions",
    name: "История болезней",
    description: "Хронические и Д-учёт, перенесённые болезни из приёмов, госпитализации, детские инфекции",
    kind: "linked",
  },
  { type: "vaccination", name: "Прививки и пробы", description: "Карта прививок и календарь", kind: "linked" },
  { type: "medications", name: "Препараты", description: "Антибиотики, витамин D и другие курсы", kind: "linked" },
  { type: "birth_history", name: "Сведения о новорождённом", description: "Роддом, выписка, данные о рождении, прикорм", kind: "linked" },
  { type: "growth", name: "Рост и развитие", description: "Замеры с центилями ВОЗ", kind: "linked" },
  {
    type: "feeding",
    name: "Вскармливание и прикорм",
    description: "Периоды вскармливания, журнал прикорма, нормы и подсказки по возрасту",
    kind: "linked",
  },
  { type: "visits", name: "Приёмы", description: "Лист текущего наблюдения: приёмы и заключения", kind: "linked" },
  {
    type: "life_anamnesis",
    name: "Анамнез жизни",
    description: "Беременность и роды, новорождённость, наследственность, семья и быт, оценка анамнеза и группы риска",
    kind: "linked",
  },
  { type: "allergies", name: "Аллергии", description: "Подробный список к алерту", kind: "linked" },
  // На бумажной 112/у такого листа нет — в расширениях после «Аллергий» (ТЗ 2026-10-04 §2.6).
  { type: "surgeries", name: "Операции и травмы", description: "Операции, травмы, процедуры и переливания крови", kind: "linked" },
];

const LINKED_TYPES = new Set<string>(SYSTEM_SECTIONS.map((section) => section.type));

/** Тип системного раздела; старый «Рост» стенда — код `growth` с типом `measurements`. */
export function systemType(module: Pick<EffectiveProgramModule, "code" | "moduleType">): SystemSectionType | null {
  if (LINKED_TYPES.has(module.moduleType) || module.moduleType === "checkup_plan") {
    return module.moduleType as SystemSectionType;
  }
  if (module.moduleType === "measurements" && module.code === "growth") return "growth";
  return null;
}

/** Связанный раздел: по ответу сервера, а для старых ответов — по типу. */
export function isLinkedModule(module: Pick<EffectiveProgramModule, "code" | "moduleType" | "kind">): boolean {
  if (module.kind) return module.kind === "linked";
  const type = systemType(module);
  return type != null && type !== "checkup_plan";
}
