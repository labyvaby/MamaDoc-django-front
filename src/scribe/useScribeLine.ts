import { useQuery } from "@tanstack/react-query";

import {
  SCRIBE_IN_PROGRESS,
  getScribeLine,
  getScribeRecording,
  type ScribeRecording,
  type ScribeStatus,
} from "../api/scribe";
import { scribeQueryKey } from "./ScribeRecorderProvider";

/** Ключ карточки записи: статус в ключе — новый статус сам тянет свежие данные. */
export const scribeRecordingKey = (id: number, status: ScribeStatus | undefined) =>
  ["scribe", "recording", id, status] as const;

/** Контекст строки и последняя «живая» запись (опрос, пока едет). */
export function useScribeLine(lineId: number | null) {
  const line = useQuery({
    queryKey: scribeQueryKey(lineId ?? 0),
    queryFn: ({ signal }) => getScribeLine(lineId as number, signal),
    enabled: lineId != null,
    refetchInterval: (query) =>
      query.state.data?.recordings.some((r) => SCRIBE_IN_PROGRESS.includes(r.status)) ? 4000 : false,
  });
  const latest: ScribeRecording | null = (lineId != null ? line.data?.recordings[0] : null) ?? null;
  const detail = useQuery({
    queryKey: scribeRecordingKey(latest?.id ?? 0, latest?.status),
    queryFn: ({ signal }) => getScribeRecording((latest as ScribeRecording).id, signal),
    enabled: latest != null && (latest.status === "ready" || latest.status === "failed"),
  });
  return {
    line: lineId != null ? line.data ?? null : null,
    latest,
    detail: latest != null ? detail.data ?? null : null,
    refetch: line.refetch,
  };
}
