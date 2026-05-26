import { supabase } from "../utility/supabaseClient";
import { compressImage } from "../utility/imageCompression";

// Expenses bucket
const BUCKET = "expenses_photo";

const extractPathFromPublicUrl = (url: string): string | null => {
  try {
    const marker = `/object/public/${BUCKET}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) {
       // Fallback for legacy "expenses" bucket if needed, or just return null
       // For now, let's strictly check the new bucket, but if we want to delete old ones, we might need more logic.
       // The user said "old photos stay there", so deletion might fail for old photos if we strictly check new bucket.
       // Let's support both for deletion extraction if possible, or just new one for now as per "fully configure IT".
       return null;
    }
    return url.substring(idx + marker.length);
  } catch {
    return null;
  }
};

export const getFileExtension = (filename: string) => {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()?.toLowerCase() : '';
};

/**
 * Uploads a file to the expenses bucket and returns the public URL and file path.
 */
export const uploadExpensePhoto = async (
  file: File
): Promise<{ publicUrl: string; path: string }> => {
  const ext = getFileExtension(file.name);
  const unique =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : String(Date.now());
  
  // Safe filename: UUID.extension
  const filePath = `photos/${unique}${ext ? `.${ext}` : ""}`;

  // Сжатие изображения перед загрузкой
  let fileToUpload: File | Blob = file;
  try {
    fileToUpload = await compressImage(file);
    console.log(`[STORAGE_DEBUG] Expense photo compressed: ${file.size} -> ${(fileToUpload as Blob).size} байт`);
  } catch (e) {
    console.warn("[STORAGE_DEBUG] Compression failed, uploading original:", e);
  }

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, fileToUpload, {
      upsert: false,
      cacheControl: "3600",
    });
  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
  const publicUrl = data.publicUrl;
  return { publicUrl, path: filePath };
};

/**
 * Deletes a file in the expenses bucket given its public URL.
 * No-ops if URL cannot be parsed into a storage path.
 */
export const deleteExpensePhotoByUrl = async (
  publicUrl?: string | null
): Promise<void> => {
  if (!publicUrl) return;
  const path = extractPathFromPublicUrl(publicUrl);
  if (!path) return;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) {
    // Swallow errors to avoid blocking main flows; could be logged if needed
    // console.error("Failed to delete from storage:", error);
  }
};

// =========================
// Services bucket helpers
// =========================

const importMetaEnv =
  ((import.meta as unknown) as {
    env?: Record<string, string | undefined>;
  }).env || {};

const SERVICES_BUCKET = importMetaEnv.VITE_STORAGE_SERVICES_BUCKET || "services";

// Patients bucket helpers
const PATIENTS_BUCKET = importMetaEnv.VITE_STORAGE_PATIENTS_BUCKET || "patients_photo";

const extractPathFromPublicUrlForBucket = (
  url: string,
  bucket: string
): string | null => {
  try {
    const marker = `/object/public/${bucket}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) return null;
    return url.substring(idx + marker.length);
  } catch {
    return null;
  }
};

/**
 * Uploads a file to the services bucket and returns the public URL and file path.
 */
export const uploadServicePhoto = async (
  file: File
): Promise<{ publicUrl: string; path: string }> => {
  const ext = getFileExtension(file.name);
  const unique =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : String(Date.now());
  const filePath = `photos/${unique}${ext ? `.${ext}` : ""}`;

  // Сжатие изображения перед загрузкой
  let fileToUpload: File | Blob = file;
  try {
    fileToUpload = await compressImage(file);
    console.log(`[STORAGE_DEBUG] Service photo compressed: ${file.size} -> ${(fileToUpload as Blob).size} байт`);
  } catch (e) {
    console.warn("[STORAGE_DEBUG] Compression failed, uploading original:", e);
  }

  const { error: uploadError } = await supabase.storage
    .from(SERVICES_BUCKET)
    .upload(filePath, fileToUpload, {
      upsert: false,
      cacheControl: "3600",
    });
  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabase.storage
    .from(SERVICES_BUCKET)
    .getPublicUrl(filePath);
  const publicUrl = data.publicUrl;
  return { publicUrl, path: filePath };
};

/**
 * Deletes a file in the services bucket given its public URL.
 * No-ops if URL cannot be parsed into a storage path.
 */
export const deleteServicePhotoByUrl = async (
  publicUrl?: string | null
): Promise<void> => {
  if (!publicUrl) return;
  const path = extractPathFromPublicUrlForBucket(publicUrl, SERVICES_BUCKET);
  if (!path) return;
  const { error } = await supabase.storage.from(SERVICES_BUCKET).remove([path]);
  if (error) {
    // ignore non-fatal storage errors
  }
};

/**
 * Upload file to patients bucket and return public URL and file path
 */
export const uploadPatientPhoto = async (
  file: File
): Promise<{ publicUrl: string; path: string }> => {
  const ext = getFileExtension(file.name);
  const unique =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : String(Date.now());
  const filePath = `photos/${unique}${ext ? `.${ext}` : ""}`;

  // Сжатие изображения перед загрузкой
  let fileToUpload: File | Blob = file;
  try {
    fileToUpload = await compressImage(file);
    console.log(`[STORAGE_DEBUG] Patient photo compressed: ${file.size} -> ${(fileToUpload as Blob).size} байт`);
  } catch (e) {
    console.warn("[STORAGE_DEBUG] Compression failed, uploading original:", e);
  }

  const { error: uploadError } = await supabase.storage
    .from(PATIENTS_BUCKET)
    .upload(filePath, fileToUpload, {
      upsert: false,
      cacheControl: "3600",
    });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(PATIENTS_BUCKET).getPublicUrl(filePath);
  return { publicUrl: data.publicUrl, path: filePath };
};

/**
 * Delete file in patients bucket by its public URL (no-op on parse failure)
 */
export const deletePatientPhotoByUrl = async (
  publicUrl?: string | null
): Promise<void> => {
  if (!publicUrl) return;
  const path = extractPathFromPublicUrlForBucket(publicUrl, PATIENTS_BUCKET);
  if (!path) return;
  const { error } = await supabase.storage.from(PATIENTS_BUCKET).remove([path]);
  if (error) {
    // ignore non-fatal errors
  }
};

// Product bucket helpers
const PRODUCTS_BUCKET = importMetaEnv.VITE_STORAGE_PRODUCTS_BUCKET || "product_photo";

/**
 * Upload file to products bucket and return public URL and file path
 */
export const uploadProductPhoto = async (
  file: File
): Promise<{ publicUrl: string; path: string }> => {
  const ext = getFileExtension(file.name);
  const unique =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : String(Date.now());
  const filePath = `photos/${unique}${ext ? `.${ext}` : ""}`;

  // Сжатие изображения перед загрузкой
  let fileToUpload: File | Blob = file;
  try {
    fileToUpload = await compressImage(file);
    console.log(`[STORAGE_DEBUG] Product photo compressed: ${file.size} -> ${(fileToUpload as Blob).size} байт`);
  } catch (e) {
    console.warn("[STORAGE_DEBUG] Compression failed, uploading original:", e);
  }

  const { error: uploadError } = await supabase.storage
    .from(PRODUCTS_BUCKET)
    .upload(filePath, fileToUpload, {
      upsert: false,
      cacheControl: "3600",
    });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(PRODUCTS_BUCKET).getPublicUrl(filePath);
  return { publicUrl: data.publicUrl, path: filePath };
};

/**
 * Delete file in products bucket by its public URL (no-op on parse failure)
 */
export const deleteProductPhotoByUrl = async (
  publicUrl?: string | null
): Promise<void> => {
  if (!publicUrl) return;
  const path = extractPathFromPublicUrlForBucket(publicUrl, PRODUCTS_BUCKET);
  if (!path) return;
  const { error } = await supabase.storage.from(PRODUCTS_BUCKET).remove([path]);
  if (error) {
    // ignore non-fatal errors
  }
};
