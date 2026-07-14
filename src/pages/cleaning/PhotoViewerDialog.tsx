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
import ChevronLeft from "@mui/icons-material/ChevronLeft";
import ChevronRight from "@mui/icons-material/ChevronRight";
import dayjs from "dayjs";

import type { CleaningRecord } from "../../api/cleaning";

interface PhotoViewerDialogProps {
  /** null — диалог закрыт. */
  record: CleaningRecord | null;
  initialIndex: number;
  canManage: boolean;
  onClose: () => void;
  onApprove: (record: CleaningRecord) => void;
  onReject: (record: CleaningRecord) => void;
}

/** Просмотр фотоотчёта с листанием; для pending-записей — кнопки решения. */
const PhotoViewerDialog: React.FC<PhotoViewerDialogProps> = ({
  record,
  initialIndex,
  canManage,
  onClose,
  onApprove,
  onReject,
}) => {
  const [index, setIndex] = React.useState(initialIndex);

  // Сброс на выбранное фото при каждом открытии.
  React.useEffect(() => {
    setIndex(initialIndex);
  }, [record, initialIndex]);

  const count = record?.photos.length ?? 0;
  const prev = () => setIndex((i) => Math.max(0, i - 1));
  const next = () => setIndex((i) => Math.min(count - 1, i + 1));

  // Свайпы на тач-экранах.
  const touchStartX = React.useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 40) return;
    if (dx < 0) next();
    else prev();
  };

  return (
    <Dialog
      open={record !== null}
      onClose={onClose}
      maxWidth="md"
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") prev();
        if (e.key === "ArrowRight") next();
      }}
    >
      {record && (
        <>
          <DialogTitle sx={{ pb: 1 }}>
            {record.zoneName} · {dayjs(record.createdAt).format("DD.MM.YYYY HH:mm")}
            <Typography variant="body2" color="text.secondary">
              {record.employeeName} · фото {Math.min(index, record.photos.length - 1) + 1} из{" "}
              {record.photos.length}
            </Typography>
          </DialogTitle>
          <DialogContent>
            <Stack
              direction="row"
              alignItems="center"
              gap={1}
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
            >
              <IconButton
                disabled={index === 0}
                onClick={prev}
                sx={{ display: { xs: "none", sm: "inline-flex" } }}
              >
                <ChevronLeft />
              </IconButton>
              <Box
                component="img"
                src={record.photos[Math.min(index, record.photos.length - 1)].url}
                alt={`Фото ${index + 1}`}
                sx={{ maxWidth: "70vw", maxHeight: "65vh", borderRadius: 1.5, objectFit: "contain" }}
              />
              <IconButton
                disabled={index >= record.photos.length - 1}
                onClick={next}
                sx={{ display: { xs: "none", sm: "inline-flex" } }}
              >
                <ChevronRight />
              </IconButton>
            </Stack>
            {/* Точки-навигация */}
            {count > 1 && (
              <Stack direction="row" justifyContent="center" gap={0.75} sx={{ mt: 1.5 }}>
                {record.photos.map((photo, i) => (
                  <Box
                    key={photo.id}
                    onClick={() => setIndex(i)}
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      cursor: "pointer",
                      bgcolor: i === Math.min(index, count - 1) ? "primary.main" : "action.disabled",
                      transition: "background-color .15s ease",
                    }}
                  />
                ))}
              </Stack>
            )}
          </DialogContent>
          {canManage && record.status === "pending" && (
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button
                color="error"
                onClick={() => {
                  onReject(record);
                  onClose();
                }}
              >
                Отклонить
              </Button>
              <Button
                variant="contained"
                color="success"
                onClick={() => {
                  onApprove(record);
                  onClose();
                }}
              >
                Подтвердить
              </Button>
            </DialogActions>
          )}
        </>
      )}
    </Dialog>
  );
};

export default PhotoViewerDialog;
