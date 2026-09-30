import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";
import { boardPaints, boardViews, type BoardPaint, type BoardView } from "./board";
import {
  defaultUnitFilters,
  featureOptions,
  holdOptions,
  roomsOptions,
  statusOptions,
  type NumberRange,
  type UnitFilters,
} from "./units";

export interface ChessboardParams extends UnitFilters {
  projectId: string | null;
  /** 'auto' — вид выбирается по ширине корпуса. */
  view: BoardView | "auto";
  paint: BoardPaint;
  unitId: string | null;
}

export type ChessboardPatch = Partial<
  Record<
    "project" | "status" | "rooms" | "feature" | "hold" | "view" | "paint" | "unit" | "price" | "area" | "floor",
    string | null
  >
>;

const oneOf = <T extends string>(value: string | null, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

/** «5.2-9.4» → [5.2, 9.4]; `scale` переводит единицы URL в единицы данных (млн → сом). */
export function parseRange(value: string | null, scale = 1): NumberRange | null {
  const match = value?.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const from = Number(match[1]) * scale;
  const to = Number(match[2]) * scale;
  return from <= to ? [from, to] : null;
}

/** Обратное преобразование для URL: [5_200_000, 9_400_000] → «5.2-9.4». */
export const formatRange = (range: NumberRange, scale = 1) =>
  `${+(range[0] / scale).toFixed(2)}-${+(range[1] / scale).toFixed(2)}`;

export const PRICE_SCALE = 1_000_000;

const defaults: Record<string, string> = {
  status: defaultUnitFilters.status,
  rooms: defaultUnitFilters.rooms,
  feature: defaultUnitFilters.feature,
  hold: defaultUnitFilters.hold,
  view: "auto",
  paint: "status",
};

/**
 * Состояние шахматки живёт в URL: ссылку с фильтрами и открытой квартирой
 * можно отправить коллеге, работает кнопка «назад». Поиск по номеру в URL
 * не пишется — он меняется на каждый символ (см. память про setSearchParams).
 */
export function useChessboardParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const params = useMemo<ChessboardParams>(
    () => ({
      projectId: searchParams.get("project"),
      status: oneOf(searchParams.get("status"), statusOptions, "all"),
      rooms: oneOf(
        searchParams.get("rooms"),
        roomsOptions.map(([v]) => v),
        "all",
      ),
      feature: oneOf(
        searchParams.get("feature"),
        featureOptions.map(([v]) => v),
        "all",
      ),
      hold: oneOf(searchParams.get("hold"), holdOptions, "all"),
      price: parseRange(searchParams.get("price"), PRICE_SCALE),
      area: parseRange(searchParams.get("area")),
      floor: parseRange(searchParams.get("floor")),
      view: oneOf<BoardView | "auto">(searchParams.get("view"), [...boardViews, "auto"], "auto"),
      paint: oneOf(searchParams.get("paint"), boardPaints, "status"),
      unitId: searchParams.get("unit"),
    }),
    [searchParams],
  );

  const update = useCallback(
    (patch: ChessboardPatch) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            if (value === null || value === undefined || value === defaults[key]) next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        // Открытие карточки — отдельный шаг истории, фильтры — нет.
        { replace: !("unit" in patch) },
      );
    },
    [setSearchParams],
  );

  return [params, update] as const;
}
