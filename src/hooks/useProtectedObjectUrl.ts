import React from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchProtectedFile } from "../api/protectedFile";
import { realtyFileKeys } from "../api/realtyFiles";
import { useRealtyScope } from "./useRealtyScope";

/**
 * Картинка AIVIO по защищённой ссылке (`/files/<id>/file/`): `<img src>` без
 * сессии и `X-Organization-Id` не загрузится, поэтому берём blob API-клиентом и
 * показываем через object URL. Blob кэшируется по ссылке — галерея и миниатюры
 * одного файла не качают его дважды.
 */
export function useProtectedObjectUrl(url: string | null | undefined): { src: string | null; loading: boolean; failed: boolean } {
  const scope = useRealtyScope();
  const file = useQuery({
    queryKey: realtyFileKeys.blob(url ?? ""),
    queryFn: async () => (await fetchProtectedFile(url as string, scope)).blob,
    enabled: Boolean(url) && scope.orgReady !== false,
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    retry: false,
  });
  const blob = file.data ?? null;
  const [src, setSrc] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!blob) {
      setSrc(null);
      return;
    }
    const next = URL.createObjectURL(blob);
    setSrc(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return { src, loading: Boolean(url) && (file.isLoading || (blob != null && src == null)), failed: file.isError };
}
