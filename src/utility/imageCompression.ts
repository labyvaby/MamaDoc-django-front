/**
 * imageCompression.ts
 * Утилита для сжатия изображений через Canvas API.
 */

export async function compressImage(file: File, maxWidth = 1920, quality = 0.8): Promise<File | Blob> {
  const ONE_MB = 1 * 1024 * 1024;

  // Если файл меньше 1МБ или это не изображение — не сжимаем
  if (file.size <= ONE_MB || !file.type.startsWith("image/")) {
    return file;
  }

  // Если это SVG, сжимать не нужно
  if (file.type === "image/svg+xml") {
    return file;
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        // Рассчитываем новые размеры
        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxWidth) {
            width *= maxWidth / height;
            height = maxWidth;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(file); // Если не удалось получить контекст, возвращаем оригинал
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              // Возвращаем как File, если возможно, чтобы сохранить имя
              const compressedFile = new File([blob], file.name, {
                type: "image/jpeg", // Принудительно в jpeg для лучшего сжатия
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            } else {
              resolve(file);
            }
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => resolve(file);
    };
    reader.onerror = (err) => reject(err);
  });
}
