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
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DownloadOutlined from "@mui/icons-material/DownloadOutlined";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";

import type { OrganizationDocument } from "../../api/documents";

/** Типы, которые умеем показывать без скачивания. */
const PREVIEW_IMAGE_EXT = new Set(["jpg", "jpeg", "png"]);

const fileExt = (name: string): string => name.split(".").pop()?.toLowerCase() ?? "";

/** true — документ можно открыть в предпросмотре (PDF или изображение). */
export const isPreviewable = (name: string): boolean => {
  const ext = fileExt(name);
  return ext === "pdf" || PREVIEW_IMAGE_EXT.has(ext);
};

interface DocumentPreviewDialogProps {
  /** null — диалог закрыт. */
  doc: OrganizationDocument | null;
  onClose: () => void;
}

/**
 * Предпросмотр документа: PDF — во встроенном вьювере браузера, изображения —
 * как картинка. Прочие типы (doc/xls) браузер не рендерит — предлагаем скачать.
 */
const DocumentPreviewDialog: React.FC<DocumentPreviewDialogProps> = ({ doc, onClose }) => {
  const ext = doc ? fileExt(doc.name) : "";

  return (
    <Dialog open={doc !== null} onClose={onClose} maxWidth="md" fullWidth>
      {doc && (
        <>
          <DialogTitle sx={{ pr: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {doc.name}
            <IconButton onClick={onClose} sx={{ position: "absolute", right: 8, top: 8 }}>
              <CloseOutlined />
            </IconButton>
          </DialogTitle>
          <DialogContent sx={{ pb: 1 }}>
            {ext === "pdf" && (
              <Box
                component="iframe"
                src={doc.fileUrl}
                title={doc.name}
                sx={{
                  width: "100%",
                  height: "70vh",
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: "10px",
                  bgcolor: "background.paper",
                }}
              />
            )}
            {PREVIEW_IMAGE_EXT.has(ext) && (
              <Box
                component="img"
                src={doc.fileUrl}
                alt={doc.name}
                sx={{
                  display: "block",
                  maxWidth: "100%",
                  maxHeight: "70vh",
                  mx: "auto",
                  borderRadius: "10px",
                }}
              />
            )}
            {!isPreviewable(doc.name) && (
              <Stack alignItems="center" gap={1.5} sx={{ py: 6, color: "text.secondary" }}>
                <DescriptionOutlined sx={{ fontSize: 44 }} />
                <Typography variant="body2">
                  Предпросмотр для этого типа файла недоступен — скачайте документ.
                </Typography>
              </Stack>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button
              startIcon={<DownloadOutlined />}
              component="a"
              href={doc.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              download={doc.name}
            >
              Скачать
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
};

export default DocumentPreviewDialog;
