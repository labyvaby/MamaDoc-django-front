/**
 * useInvoicePhotos
 * Состояние поля «Фото накладной» (1–2 шт) для форм прихода.
 *
 * Форма может открываться и на существующей записи (партия/движение/расход уже
 * есть — фото уходят сразу), и на новой (записи ещё нет — файлы копятся в
 * pending и отправляются вызовом flush(entityId) после создания). Оба случая
 * закрыты одним хуком, чтобы формы не переизобретали это по третьему разу.
 */
import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  deleteInvoicePhoto,
  getInvoicePhotos,
  uploadInvoicePhoto,
  INVOICE_PHOTOS_ENABLED,
  INVOICE_PHOTOS_MAX,
  type InvoicePhoto,
  type InvoicePhotoTarget,
} from "../api/invoicePhotos";
import {
  prepareImageForUpload,
  PHOTO_SOURCE_MAX_BYTES,
  PHOTO_SOURCE_MAX_MB,
} from "../utility/imageCompression";

/** Выбранный, но ещё не отправленный файл. */
export interface PendingInvoicePhoto {
  localId: string;
  file: File;
  /** object-URL для превью; освобождается при удалении/сбросе. */
  previewUrl: string;
}

export interface UseInvoicePhotosOptions {
  target: InvoicePhotoTarget;
  /** null — записи ещё нет (создание): файлы копятся в pending. */
  entityId: number | null;
  organizationId?: number | null;
  /** Форма открыта. Закрытая форма не тянет список и чистит превью. */
  open: boolean;
  /** Право на изменение (загрузка/удаление). Просмотр остаётся доступным. */
  canManage?: boolean;
}

export interface UseInvoicePhotosResult {
  /** Показывать поле вообще (флаг раскатки + открытая форма). */
  enabled: boolean;
  photos: InvoicePhoto[];
  pending: PendingInvoicePhoto[];
  /** Сколько всего фото уже есть (сервер + локальные). */
  total: number;
  canAddMore: boolean;
  loading: boolean;
  /** Список фото не загрузился — поле говорит об этом, а не молчит пустотой. */
  loadFailed: boolean;
  busy: boolean;
  error: string | null;
  clearError: () => void;
  pick: (files: FileList | File[] | null) => Promise<void>;
  removePending: (localId: string) => void;
  removePhoto: (photoId: number) => Promise<void>;
  /**
   * Отправить накопленные файлы у только что созданной записи.
   * Не бросает: возвращает число неудачных загрузок, чтобы форма могла показать
   * предупреждение, но не откатывать уже созданную запись.
   */
  flush: (entityId: number) => Promise<{ uploaded: number; failed: number }>;
  reset: () => void;
}

const errText = (e: unknown, fallback: string) =>
  e instanceof Error && e.message ? e.message : fallback;

export function useInvoicePhotos({
  target,
  entityId,
  organizationId = null,
  open,
  canManage = true,
}: UseInvoicePhotosOptions): UseInvoicePhotosResult {
  const queryClient = useQueryClient();
  const [pending, setPending] = React.useState<PendingInvoicePhoto[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const queryKey = React.useMemo(
    () => ["invoice-photos", target, entityId, organizationId] as const,
    [target, entityId, organizationId],
  );

  const photosQuery = useQuery({
    queryKey,
    queryFn: ({ signal }) => getInvoicePhotos(target, entityId!, organizationId, signal),
    enabled: INVOICE_PHOTOS_ENABLED && open && entityId != null,
  });

  const photos = photosQuery.data ?? [];
  const loadFailed = photosQuery.isError;

  // Превью — object-URL: без revoke они живут до перезагрузки вкладки.
  const releasePending = React.useCallback((items: PendingInvoicePhoto[]) => {
    items.forEach((p) => URL.revokeObjectURL(p.previewUrl));
  }, []);

  const reset = React.useCallback(() => {
    setPending((prev) => {
      releasePending(prev);
      return [];
    });
    setError(null);
    setBusy(false);
  }, [releasePending]);

  // Закрыли форму — чистим локальные файлы (сохранённые остаются на сервере).
  React.useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  React.useEffect(() => () => setPending((prev) => {
    releasePending(prev);
    return [];
  }), [releasePending]);

  const total = photos.length + pending.length;
  const canAddMore = canManage && total < INVOICE_PHOTOS_MAX;

  const pick = React.useCallback(
    async (files: FileList | File[] | null) => {
      if (!files) return;
      const list = Array.from(files);
      if (list.length === 0) return;
      setError(null);

      const free = INVOICE_PHOTOS_MAX - total;
      if (free <= 0) {
        setError(`Можно приложить не больше ${INVOICE_PHOTOS_MAX} фото`);
        return;
      }
      const accepted = list.slice(0, free);
      if (list.length > free) {
        setError(`Можно приложить не больше ${INVOICE_PHOTOS_MAX} фото — лишние пропущены`);
      }

      setBusy(true);
      try {
        for (const file of accepted) {
          if (file.size > PHOTO_SOURCE_MAX_BYTES) {
            setError(`Фото не должно превышать ${PHOTO_SOURCE_MAX_MB} МБ`);
            continue;
          }
          // Жмём сразу при выборе: превью легче, отправка быстрее, HEIC с
          // айфона иначе не показать (см. prepareImageForUpload).
          const prepared = await prepareImageForUpload(file);
          if (!prepared) {
            setError("Не удалось обработать это фото — попробуйте другое или снимите заново");
            continue;
          }

          if (entityId != null) {
            try {
              const uploaded = await uploadInvoicePhoto(target, entityId, prepared, organizationId);
              queryClient.setQueryData<InvoicePhoto[]>(queryKey, (prev) => [...(prev ?? []), uploaded]);
            } catch (e) {
              setError(errText(e, "Не удалось загрузить фото"));
            }
          } else {
            setPending((prev) => [
              ...prev,
              {
                localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                file: prepared,
                previewUrl: URL.createObjectURL(prepared),
              },
            ]);
          }
        }
      } finally {
        setBusy(false);
      }
    },
    [entityId, organizationId, queryClient, queryKey, target, total],
  );

  const removePending = React.useCallback(
    (localId: string) => {
      setPending((prev) => {
        const gone = prev.filter((p) => p.localId === localId);
        releasePending(gone);
        return prev.filter((p) => p.localId !== localId);
      });
    },
    [releasePending],
  );

  const removePhoto = React.useCallback(
    async (photoId: number) => {
      if (entityId == null) return;
      setBusy(true);
      setError(null);
      try {
        await deleteInvoicePhoto(target, entityId, photoId, organizationId);
        queryClient.setQueryData<InvoicePhoto[]>(queryKey, (prev) =>
          (prev ?? []).filter((p) => p.id !== photoId),
        );
      } catch (e) {
        setError(errText(e, "Не удалось удалить фото"));
      } finally {
        setBusy(false);
      }
    },
    [entityId, organizationId, queryClient, queryKey, target],
  );

  const flush = React.useCallback(
    async (createdId: number) => {
      if (pending.length === 0) return { uploaded: 0, failed: 0 };
      let uploaded = 0;
      let failed = 0;
      for (const item of pending) {
        try {
          await uploadInvoicePhoto(target, createdId, item.file, organizationId);
          uploaded += 1;
        } catch {
          failed += 1;
        }
      }
      setPending((prev) => {
        releasePending(prev);
        return [];
      });
      return { uploaded, failed };
    },
    [organizationId, pending, releasePending, target],
  );

  return {
    enabled: INVOICE_PHOTOS_ENABLED && open,
    photos,
    pending,
    total,
    canAddMore,
    loading: photosQuery.isLoading,
    loadFailed,
    busy,
    error,
    clearError: () => setError(null),
    pick,
    removePending,
    removePhoto,
    flush,
    reset,
  };
}
