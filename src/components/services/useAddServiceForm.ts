/**
 * useAddServiceForm.ts
 * Хук инкапсулирует ВСЮ логику формы добавления услуги:
 * - состояния (name, price, photoFile, photoPreview, busy)
 * - эффекты (сброс состояния при закрытии)
 * - обработчики (handleSubmit, onPickPhoto, fileToDataUrl)
 * Компоненты-«презентеры» получают только данные и колбэки через пропсы.
 */

import React from "react";
import { supabase } from "../../utility/supabaseClient";
import { uploadFile } from "../../utility/storage";
import { useNotification } from "@refinedev/core";

const importMetaEnv =
  ((import.meta as unknown) as { env?: Record<string, string | undefined> })
    .env || {};
const SERVICES_WRITE: string =
  importMetaEnv.VITE_SERVICES_WRITE_TABLE || "Services";


export type CreatedService = {
  id?: string | number;
  name: string; // UI поле
  price: number; // UI поле
  // Поля из БД
  service_name: string;
  price_som: number;
  employee_id: string | null;
  employee_name?: string | null;
  photo_url?: string | null;
};

export type UseAddServiceFormArgs = {
  open: boolean;
  onClose: () => void;
  onCreated?: (rec: CreatedService) => void;
};

export function useAddServiceForm({ open, onClose, onCreated }: UseAddServiceFormArgs) {
  const { open: notify } = useNotification();
  // Состояния формы
  const [name, setName] = React.useState("");
  const [price, setPrice] = React.useState<string>("");
  const [description, setDescription] = React.useState("");
  const [isActive, setIsActive] = React.useState(true);
  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null);

  // Флаг сабмита
  const [busy, setBusy] = React.useState(false);
  const [touched, setTouched] = React.useState(false);

  // Эффект: сброс при закрытии
  React.useEffect(() => {
    if (!open) {
      setName("");
      setPrice("");
      setDescription("");
      setIsActive(true);
      setPhotoFile(null);
      setPhotoPreview(null);
      setBusy(false);
      setTouched(false);
    }
  }, [open]);

  // Вспомогательное: файл -> data URL (для превью)
  const fileToDataUrl = React.useCallback(
    (f: File) =>
      new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result || ""));
        r.onerror = reject;
        r.readAsDataURL(f);
      }),
    []
  );

  // Обработчик выбора файла
  const onPickPhoto = React.useCallback(
    async (f: File | null) => {
      setPhotoFile(f);
      if (f) {
        try {
          const url = await fileToDataUrl(f);
          setPhotoPreview(url);
        } catch {
          setPhotoPreview(null);
        }
      } else {
        setPhotoPreview(null);
      }
    },
    [fileToDataUrl]
  );

  // Сабмит формы
  const handleSubmit = React.useCallback(async () => {
    setTouched(true);
    const priceNum = Number(price);
    if (!name.trim() || !price || !Number.isFinite(priceNum) || priceNum <= 0) {
      notify?.({ type: "error", message: "Заполните название и положительную стоимость услуги" });
      return;
    }

    try {
      setBusy(true);

      // 1) Загрузка фото (если есть)
      let photoUrl: string | null = null;
      if (photoFile) {
        try {
          const publicUrl = await uploadFile(photoFile, "service_photos");
          photoUrl = publicUrl || null;
        } catch (e) {
          const msg =
            typeof e === "object" && e !== null && "message" in e
              ? String((e as { message?: unknown }).message)
              : String(e);
          notify?.({ type: "error", message: `Не удалось загрузить фотографию: ${msg}` });
          throw e;
        }
      }

      // 2) Вставка в SellableItems
      const { data: sellableItem, error: sellableError } = await supabase
        .from("SellableItems")
        .insert([{ 
            type: "service",
            is_active: isActive 
        }])
        .select()
        .single();

      if (sellableError) throw sellableError;
      const sellableId = sellableItem.id;

      let insertedService;
      try {
        // 3) Вставка услуги в Services
        const primaryPayload: Record<string, unknown> = {
          sellable_item_id: sellableId,
          name: name.trim(),
          price_som: priceNum, // Сохраняем для быстрой выборки
          image_url: photoUrl,
          description: description.trim() || null,
        };



        const { data: inserted, error: insertError } = await supabase
          .from(SERVICES_WRITE)
          .insert(primaryPayload)
          .select("*")
          .single();

        if (insertError) throw insertError;
        insertedService = inserted;
      } catch (err) {
        // Очистка SellableItem, если вставка в Services не удалась
        await supabase.from("SellableItems").delete().eq("id", sellableId);
        throw err;
      }

      // 4) Вставка Цены в Prices
      const { error: priceError } = await supabase.from("Prices").insert({
          sellable_item_id: sellableId,
          price: Number(price),
          is_current: true
      });
      if (priceError) {
          console.error("Price insert error:", priceError);
          notify?.({ type: "error", message: "Услуга создана, но цену сохранить не удалось" });
      }

      const out: CreatedService = {
        id: sellableId, // Важно: используем sellableId как основной ID
        name: name.trim(),
        price: Number(price),
        service_name: name.trim(),
        price_som: Number(price),
        employee_id: null,
        employee_name: null,
        photo_url: photoUrl,
      };

      onCreated?.(out);
      notify?.({ type: "success", message: "Услуга создана" });
      onClose();
    } catch (e) {
      console.error("Create service failed:", e);
      notify?.({ type: "error", message: "Не удалось создать услугу" });
    } finally {
      setBusy(false);
    }
  }, [name, price, photoFile, onClose, onCreated, notify]);

  const submitDisabled = !name.trim() || !price || Number(price) <= 0;

  return {
    state: {
      name,
      price,
      description,
      isActive,
      photoFile,
      photoPreview,
      busy,
      touched,
    },
    handlers: {
      setName,
      setPrice,
      setDescription,
      setIsActive,
      onPickPhoto,
      handleSubmit,
    },
    submitDisabled,
  };
}
