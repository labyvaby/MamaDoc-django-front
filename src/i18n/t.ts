import i18n from "./index";
import { getCurrentGlossary } from "./glossary";

/**
 * Перевод для кода вне React: конфиги, утилиты, api/*.
 *
 * В компонентах используйте хук useT() — он реактивен к смене организации.
 * Здесь глоссарий берётся из модульного синглтона, который держит в
 * актуальном состоянии VerticalProvider. Функции, вызываемые во время
 * рендера (например getStatusConfig), получат актуальные термины, потому
 * что смена вертикали перерисовывает дерево.
 *
 *   tt("appointments:status.arrived")   // «Пациент здесь» / «Клиент здесь»
 */
export const tt = (key: string, options?: Record<string, unknown>): string =>
  i18n.t(key, { ...getCurrentGlossary(), ...options }) as unknown as string;
