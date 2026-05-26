import { supabase } from "./supabaseClient";
import { compressImage } from "./imageCompression";

/**
 * Универсальная загрузка файла в Supabase Storage.
 * - bucket: имя бакета (например, 'service_photos' или 'services')
 * - filename: опциональное имя файла (если не передать — сгенерируется UUID+расширение).
 * Возвращает публичный URL загруженного файла.
 */
export async function uploadFile(
  file: File,
  bucket: string = "service_photos",
  filename?: string
): Promise<string> {
  // Генерация имени файла при необходимости
  const safeName = file.name.replace(/\s+/g, "-").toLowerCase();
  const ext = safeName.includes(".") ? safeName.split(".").pop() || "bin" : "bin";

  const unique =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : String(Date.now());

  const finalName = filename || `${unique}.${ext}`;
  // По умолчанию складываем в каталог photos/, чтобы не загрязнять корень бакета
  const filePath = finalName.includes("/") ? finalName : `photos/${finalName}`;

  // Сжатие изображения перед загрузкой
  let fileToUpload: File | Blob = file;
  try {
    fileToUpload = await compressImage(file);
    console.log(`[STORAGE_DEBUG] Файл сжат: ${file.size} -> ${(fileToUpload as Blob).size} байт`);
  } catch (e) {
    console.warn("[STORAGE_DEBUG] Ошибка сжатия, пытаемся загрузить оригинал:", e);
  }

  // Загрузка файла
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(filePath, fileToUpload, { upsert: false, cacheControl: "3600" });
  if (uploadError) {
    console.error(`[STORAGE_DEBUG] Ошибка загрузки в bucket "${bucket}":`, uploadError);
    throw new Error(`Ошибка загрузки файла в bucket "${bucket}": ${uploadError.message}`);
  }

  // Публичная ссылка
  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  const publicUrl = data?.publicUrl;
  if (!publicUrl) {
    throw new Error("Не удалось получить публичную ссылку на файл");
  }
  return publicUrl;
}

/**
 * Удаление файла по публичному URL (если нужно).
 * Возвращает true при успехе, иначе false.
 */
export async function deleteFileByPublicUrl(publicUrl: string, bucket: string = "service_photos"): Promise<boolean> {
  try {
    // Преобразуем public URL в относительный путь внутри бакета
    const marker = `/object/public/${bucket}/`;
    const idx = publicUrl.indexOf(marker);
    if (idx === -1) return false;
    const path = publicUrl.substring(idx + marker.length);
    const { error } = await supabase.storage.from(bucket).remove([path]);
    if (error) return false;
    return true;
  } catch {
    return false;
  }
}
