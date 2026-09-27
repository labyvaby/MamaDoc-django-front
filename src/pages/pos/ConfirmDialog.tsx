import React from "react";
import ButtonBase from "@mui/material/ButtonBase";
import Dialog from "@mui/material/Dialog";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";

import CloseOutlined from "@mui/icons-material/CloseOutlined";

import { POS_RADIUS, posColors } from "./layout";

export type PosConfirmRequest = {
  title: string;
  message: string;
  confirmLabel: string;
  /** Необратимое действие (отмена чека) — кнопка подтверждения красная. */
  danger?: boolean;
  onConfirm: () => void;
};

type Props = {
  request: PosConfirmRequest | null;
  onClose: () => void;
};

/** Подтверждение действия на кассе — вместо системного window.confirm. */
export const PosConfirmDialog: React.FC<Props> = ({ request, onClose }) => {
  const c = posColors(useTheme());
  // Держим последний запрос, чтобы текст не пропадал во время анимации закрытия.
  const [shown, setShown] = React.useState(request);
  React.useEffect(() => {
    if (request) setShown(request);
  }, [request]);

  const confirm = () => {
    const action = request?.onConfirm;
    onClose();
    action?.();
  };

  return (
    <Dialog
      open={Boolean(request)}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            width: 384,
            maxWidth: "100%",
            borderRadius: `${POS_RADIUS.dialog}px`,
            bgcolor: c.tile,
            border: `1px solid ${c.hairline}`,
            backgroundImage: "none",
            overflow: "hidden",
          },
        },
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: "24px", py: "16px", bgcolor: c.page, borderBottom: `1px solid ${c.outline}` }}>
        <Typography sx={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2, color: c.text }}>{shown?.title}</Typography>
        <IconButton size="small" onClick={onClose} sx={{ p: 0, color: c.textSoft }} aria-label="Закрыть">
          <CloseOutlined sx={{ fontSize: 16 }} />
        </IconButton>
      </Stack>

      <Stack gap="16px" sx={{ p: "16px", bgcolor: c.page }}>
        <Typography sx={{ fontSize: 14, lineHeight: 1.4, color: c.textSoft }}>{shown?.message}</Typography>

        <Stack direction="row" gap="10px">
          <ButtonBase
            onClick={onClose}
            sx={{
              px: "24px",
              py: "16px",
              borderRadius: `${POS_RADIUS.control}px`,
              bgcolor: c.page,
              border: `1px solid ${c.hairline}`,
              color: c.textSoft,
              fontSize: 14,
              fontWeight: 900,
              lineHeight: 1.2,
            }}
          >
            Отмена
          </ButtonBase>
          <ButtonBase
            autoFocus
            onClick={confirm}
            sx={{
              flex: 1,
              px: "16px",
              py: "16px",
              borderRadius: `${POS_RADIUS.control}px`,
              bgcolor: shown?.danger ? c.dangerBg : c.accent,
              border: `1px solid ${shown?.danger ? c.danger : c.accent}`,
              color: shown?.danger ? c.danger : c.onAccent,
              fontSize: 14,
              fontWeight: 900,
              lineHeight: 1.2,
            }}
          >
            {shown?.confirmLabel}
          </ButtonBase>
        </Stack>
      </Stack>
    </Dialog>
  );
};
