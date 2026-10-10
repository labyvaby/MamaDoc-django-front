import React from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import BrokenImageOutlined from "@mui/icons-material/BrokenImageOutlined";
import ChevronLeftOutlined from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import OpenInNewOutlined from "@mui/icons-material/OpenInNewOutlined";

import type { HealthAttachment } from "../../api/health";
import { ATTACHMENT_KIND_LABELS, isPdfAttachment } from "./illnessData";

interface HealthFileViewerProps {
  attachments: ReadonlyArray<HealthAttachment>;
  /** Открытый документ; null — окно закрыто. */
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

/**
 * Документ записи в окне поверх страницы: снимок целиком, PDF — встроенным
 * просмотром браузера. Несколько документов листаются стрелками и клавишами
 * ← →; «Открыть в новой вкладке» — для печати и скачивания.
 */
export const HealthFileViewer: React.FC<HealthFileViewerProps> = ({ attachments, index, onIndexChange, onClose }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  const count = attachments.length;
  const current = index != null ? attachments[index] ?? null : null;
  const [broken, setBroken] = React.useState(false);

  React.useEffect(() => setBroken(false), [current?.url]);

  const step = React.useCallback(
    (delta: number) => {
      if (index == null || count < 2) return;
      onIndexChange((index + delta + count) % count);
    },
    [index, count, onIndexChange]
  );

  React.useEffect(() => {
    if (index == null || count < 2) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, count, step]);

  const pdf = current ? isPdfAttachment(current) : false;
  const kind = current ? ATTACHMENT_KIND_LABELS[current.kind] ?? "Документ" : "";
  const name = current?.name || kind;
  const navSx = {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    bgcolor: alpha(theme.palette.background.paper, 0.9),
    boxShadow: theme.shadows[2],
    "&:hover": { bgcolor: theme.palette.background.paper },
  } as const;

  return (
    <Dialog
      open={current != null}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      fullScreen={fullScreen}
      aria-labelledby="health-file-viewer-title"
      // окно — портал, но события React всплывают по дереву: нажатия внутри не должны открывать карточку под ним
      onClick={(event) => event.stopPropagation()}
    >
      {current && (
        <>
          <DialogTitle
            id="health-file-viewer-title"
            sx={{
              pr: 7,
              display: "flex",
              alignItems: "baseline",
              gap: 1,
              minWidth: 0,
            }}
          >
            <Box
              component="span"
              sx={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: 0,
              }}
            >
              {name}
            </Box>
            <Typography component="span" variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
              {[name !== kind ? kind : "", count > 1 ? `${(index ?? 0) + 1} из ${count}` : ""].filter(Boolean).join(" · ")}
            </Typography>
            <IconButton aria-label="Закрыть" onClick={onClose} sx={{ position: "absolute", right: 10, top: 10 }}>
              <CloseOutlined />
            </IconButton>
          </DialogTitle>
          <DialogContent
            sx={{
              position: "relative",
              px: { xs: 1, sm: 2 },
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 260,
            }}
          >
            {broken ? (
              <Stack alignItems="center" gap={1.25} sx={{ py: 6, color: "text.secondary", textAlign: "center" }}>
                <BrokenImageOutlined sx={{ fontSize: 44 }} />
                <Typography variant="body2">Не удалось показать документ — откройте его в новой вкладке.</Typography>
              </Stack>
            ) : pdf ? (
              <Box
                component="iframe"
                src={current.url}
                title={name}
                sx={{
                  width: "100%",
                  height: fullScreen ? "calc(100vh - 150px)" : "75vh",
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: "10px",
                  bgcolor: "background.paper",
                }}
              />
            ) : (
              <Box
                component="img"
                src={current.url}
                alt={name}
                onError={() => setBroken(true)}
                sx={{
                  display: "block",
                  maxWidth: "100%",
                  maxHeight: fullScreen ? "calc(100vh - 150px)" : "75vh",
                  objectFit: "contain",
                  borderRadius: "10px",
                  mx: "auto",
                }}
              />
            )}
            {count > 1 && (
              <>
                <IconButton aria-label="Предыдущий документ" onClick={() => step(-1)} sx={{ ...navSx, left: { xs: 12, sm: 20 } }}>
                  <ChevronLeftOutlined />
                </IconButton>
                <IconButton aria-label="Следующий документ" onClick={() => step(1)} sx={{ ...navSx, right: { xs: 12, sm: 20 } }}>
                  <ChevronRightOutlined />
                </IconButton>
              </>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button component="a" href={current.url} target="_blank" rel="noopener noreferrer" startIcon={<OpenInNewOutlined />}>
              Открыть в новой вкладке
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
};
