import React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";

import { INVOICE_PHOTOS_MAX } from "../../api/invoicePhotos";
import { PHOTO_ACCEPT } from "../../utility/imageCompression";
import type { UseInvoicePhotosResult } from "../../hooks/useInvoicePhotos";

export type InvoicePhotosFieldProps = {
  /** Состояние из useInvoicePhotos. */
  state: UseInvoicePhotosResult;
  /** Подпись над полем. */
  label?: string;
  /** Форма занята сохранением — блокирует выбор и удаление. */
  disabled?: boolean;
  /** Только просмотр (нет права на изменение). */
  readOnly?: boolean;
};

const TILE = 88;

/**
 * Поле «Фото накладной» (до INVOICE_PHOTOS_MAX штук) — общее для прихода партии
 * вакцины, прихода товара на склад и расхода. Уже сохранённые фото и ещё не
 * отправленные показываются одинаковыми плитками; клик по плитке открывает
 * снимок целиком (накладную иначе не прочитать).
 *
 * Компонент ничего не знает про сущность: вся работа с API — в useInvoicePhotos.
 */
export const InvoicePhotosField: React.FC<InvoicePhotosFieldProps> = ({
  state,
  label = "Фото накладной",
  disabled = false,
  readOnly = false,
}) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [preview, setPreview] = React.useState<string | null>(null);

  if (!state.enabled) return null;

  const locked = disabled || state.busy;

  const tiles: { key: string; url: string; onRemove?: () => void }[] = [
    ...state.photos.map((p) => ({
      key: `remote-${p.id}`,
      url: p.url,
      onRemove: readOnly ? undefined : () => void state.removePhoto(p.id),
    })),
    ...state.pending.map((p) => ({
      key: `local-${p.localId}`,
      url: p.previewUrl,
      onRemove: readOnly ? undefined : () => state.removePending(p.localId),
    })),
  ];

  return (
    <Stack spacing={1}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="caption" color="text.disabled">
          до {INVOICE_PHOTOS_MAX} шт
        </Typography>
        {state.loading && <CircularProgress size={12} />}
      </Stack>

      {state.error && (
        <Alert severity="warning" onClose={state.clearError} sx={{ py: 0.25 }}>
          {state.error}
        </Alert>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={PHOTO_ACCEPT}
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          const files = e.target.files;
          // Сбрасываем value, иначе повторный выбор того же файла не даст onChange.
          e.target.value = "";
          void state.pick(files);
        }}
      />

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {tiles.map((tile) => (
          <Box
            key={tile.key}
            sx={{
              position: "relative",
              width: TILE,
              height: TILE,
              borderRadius: 1,
              overflow: "hidden",
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <Box
              component="img"
              src={tile.url}
              alt={label}
              onClick={() => setPreview(tile.url)}
              sx={{ width: "100%", height: "100%", objectFit: "cover", cursor: "zoom-in" }}
            />
            {tile.onRemove && (
              <IconButton
                size="small"
                aria-label="Удалить фото"
                disabled={locked}
                onClick={tile.onRemove}
                sx={{
                  position: "absolute",
                  top: 2,
                  right: 2,
                  p: 0.25,
                  bgcolor: "background.paper",
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <CloseOutlined sx={{ fontSize: 14 }} />
              </IconButton>
            )}
          </Box>
        ))}

        {!readOnly && state.canAddMore && (
          <Button
            variant="outlined"
            onClick={() => inputRef.current?.click()}
            disabled={locked}
            sx={{
              width: TILE,
              height: TILE,
              minWidth: TILE,
              borderStyle: "dashed",
              flexDirection: "column",
              gap: 0.5,
              px: 0,
            }}
          >
            {state.busy ? (
              <CircularProgress size={18} />
            ) : (
              <>
                <ReceiptLongOutlined fontSize="small" />
                <Typography variant="caption" sx={{ lineHeight: 1.1 }}>
                  Добавить
                </Typography>
              </>
            )}
          </Button>
        )}
      </Stack>

      {tiles.length === 0 && readOnly && (
        <Typography variant="caption" color="text.disabled">
          Накладная не приложена
        </Typography>
      )}

      {/* Просмотр целиком: мелкий текст накладной в плитке не прочитать. */}
      <Dialog open={preview != null} onClose={() => setPreview(null)} maxWidth="lg">
        <Box sx={{ position: "relative", bgcolor: "background.paper" }}>
          <IconButton
            onClick={() => setPreview(null)}
            aria-label="Закрыть"
            sx={{
              position: "absolute",
              top: 8,
              right: 8,
              bgcolor: "background.paper",
              "&:hover": { bgcolor: "action.hover" },
            }}
          >
            <CloseOutlined />
          </IconButton>
          {preview && (
            <Box
              component="img"
              src={preview}
              alt={label}
              sx={{ display: "block", maxWidth: "90vw", maxHeight: "85vh" }}
            />
          )}
        </Box>
      </Dialog>
    </Stack>
  );
};

export default InvoicePhotosField;
