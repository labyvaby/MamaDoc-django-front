/**
 * Правила чтения изменения метрики. Отдельный модуль, а не часть плитки:
 * файл с компонентами, экспортирующий ещё и функции, ломает fast refresh
 * (та же причина, что у cashbox/money.ts), а правила тут неочевидные и
 * покрыты тестами.
 */

export interface MetricDelta {
  current: number;
  previous: number;
  /** true — рост это плохо (возвраты, негативные отзывы, просрочка). */
  invert?: boolean;
  /** Подпись базы сравнения: «вчера», «тот же отрезок прошлого месяца». */
  baselineLabel?: string;
}

export type DeltaDirection = "up" | "down" | "flat";

export interface DeltaView {
  text: string;
  tone: "success" | "error" | "muted";
  direction: DeltaDirection;
  title: string;
}

/**
 * Во что превращается пара «стало / было».
 *
 * Два правила, ради которых это и вынесено:
 * 1. Рост с нуля НЕ показываем процентом — «+∞%» и «+100%» одинаково врут.
 *    Вместо этого честное «было 0».
 * 2. Хорошо/плохо определяется не знаком, а смыслом метрики: рост возвратов
 *    и просрочек — красный, поэтому у таких метрик `invert`.
 */
export function describeDelta(delta: MetricDelta): DeltaView | null {
  const { current, previous, invert = false } = delta;
  const base = delta.baselineLabel ?? "прошлый период";

  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;

  if (current === previous) {
    return {
      text: "без изменений",
      tone: "muted",
      direction: "flat",
      title: `Столько же, сколько за ${base}`,
    };
  }

  if (previous === 0) {
    return {
      text: "было 0",
      tone: invert ? "error" : "success",
      direction: "up",
      title: `За ${base} не было ни одного значения — процент не считаем`,
    };
  }

  const diff = current - previous;
  const percent = Math.round((diff / Math.abs(previous)) * 100);
  const grew = diff > 0;
  const good = invert ? !grew : grew;

  return {
    // Минус — типографский, как в остальном интерфейсе.
    text: `${grew ? "+" : "−"}${Math.abs(percent)}%`,
    tone: good ? "success" : "error",
    direction: grew ? "up" : "down",
    title: `За ${base} — ${previous.toLocaleString("ru-RU")}`,
  };
}
