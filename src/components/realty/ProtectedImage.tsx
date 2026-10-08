import type { ReactNode } from "react";
import { Box, Skeleton, type SxProps, type Theme } from "@mui/material";
import ImageOutlined from "@mui/icons-material/ImageOutlined";

import { useProtectedObjectUrl } from "../../hooks/useProtectedObjectUrl";

/**
 * `<img>` по защищённой ссылке. Нет ссылки или файл не отдался — заглушка
 * `fallback` (по макету — цветной фон), не ошибка.
 */
export function ProtectedImage({ url, alt, fit = "cover", fallback, sx }: { url: string | null | undefined; alt: string; fit?: "cover" | "contain"; fallback?: ReactNode; sx?: SxProps<Theme> }) {
  const { src, loading, failed } = useProtectedObjectUrl(url);
  if (loading) return <Skeleton variant="rectangular" sx={[{ width: "100%", height: "100%" }, ...(Array.isArray(sx) ? sx : [sx])]} />;
  if (!src || failed) {
    return (
      <Box aria-hidden={!alt} sx={[{ width: "100%", height: "100%", display: "grid", placeItems: "center", color: "text.disabled" }, ...(Array.isArray(sx) ? sx : [sx])]}>
        {fallback ?? <ImageOutlined />}
      </Box>
    );
  }
  return <Box component="img" src={src} alt={alt} decoding="async" sx={[{ width: "100%", height: "100%", objectFit: fit, display: "block" }, ...(Array.isArray(sx) ? sx : [sx])]} />;
}
