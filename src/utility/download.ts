/** Отдаёт готовый файл браузеру (скачивание без обращения к серверу). */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Отзываем не сразу: Safari успевает начать скачивание только после тика.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
