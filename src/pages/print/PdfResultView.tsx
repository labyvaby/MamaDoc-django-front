import React from "react";
import { Box, Button, Stack, Typography, useMediaQuery, useTheme } from "@mui/material";
import DownloadOutlined from "@mui/icons-material/DownloadOutlined";
import PrintOutlined from "@mui/icons-material/PrintOutlined";

export interface PdfResultViewProps {
  /** blob: URL готового документа — для скачивания и печати. */
  url: string;
  /** Имя файла с расширением .pdf — попадёт в «Загрузки». */
  fileName: string;
  /** Адаптивный экранный вид документа (см. DocumentViews.tsx). */
  preview: React.ReactNode;
  /** Подпись в шапке (обычно ФИО пациента). */
  caption?: string;
}

/**
 * Просмотр готового документа с адаптацией под устройство.
 *
 * 🔴 Почему на мобильных НЕ `<iframe src={blobUrl}>`: мобильные браузеры не
 * рендерят PDF во фрейме — вместо просмотра они СКАЧИВАЮТ файл, причём имя
 * берут из blob-URL, и пользователь получал `6583c625-1baf-…` без расширения.
 *
 * На узких экранах показываем адаптивную вёрстку документа (`preview`): те же
 * данные, но блоки колонкой и читаемый кегль. Масштабировать лист A4 под
 * ширину телефона нельзя — текст становится нечитаемо мелким.
 */
export const PdfResultView: React.FC<PdfResultViewProps> = ({
  url,
  fileName,
  preview,
  caption,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const download = () => {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{
          px: { xs: 1, sm: 2 },
          py: 1,
          borderBottom: "1px solid",
          borderColor: "divider",
          flexShrink: 0,
        }}
      >
        <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
          {caption ?? fileName}
        </Typography>
        <Button size="small" startIcon={<DownloadOutlined />} onClick={download}>
          Скачать
        </Button>
        <Button
          size="small"
          startIcon={<PrintOutlined />}
          onClick={() => window.open(url, "_blank", "noopener")}
        >
          Печать
        </Button>
      </Stack>

      {isMobile ? (
        <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: { xs: 1, sm: 2 } }}>
          {preview}
        </Box>
      ) : (
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <iframe
            src={url}
            style={{ width: "100%", height: "100%", border: "none" }}
            title={fileName}
          />
        </Box>
      )}
    </Box>
  );
};

export default PdfResultView;
