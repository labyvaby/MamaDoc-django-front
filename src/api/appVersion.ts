import { useEffect, useState } from "react";
import { apiRequest } from "./client";

/** Коммиты фронт-репо на момент сборки — см. `vite.config.ts` (define). */
const FRONTEND_COMMIT_COUNT = __APP_FRONTEND_COMMIT_COUNT__;

let backendCommitCountPromise: Promise<number | null> | null = null;

function fetchBackendCommitCount(): Promise<number | null> {
  if (!backendCommitCountPromise) {
    backendCommitCountPromise = apiRequest<{ commitCount: number | null }>(
      "/system/version/",
    )
      .then((res) => res.commitCount)
      .catch(() => null);
  }
  return backendCommitCountPromise;
}

/**
 * Строка версии вида `vFRONT.BACK.2`, где FRONT/BACK — число коммитов
 * фронт- и бэк-репозиториев. Оба числа считаются сами по себе: фронтовое
 * зашито при сборке, бэкенд отдаёт своё через `/api/system/version/`.
 */
export function useAppVersion(): string {
  const [backendCommitCount, setBackendCommitCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchBackendCommitCount().then((count) => {
      if (!cancelled) setBackendCommitCount(count);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const backendLabel = backendCommitCount ?? "…";
  return `v${FRONTEND_COMMIT_COUNT}.${backendLabel}.2`;
}
