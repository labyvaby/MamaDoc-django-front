import React from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Dialog from "@mui/material/Dialog";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";

import CloseOutlined from "@mui/icons-material/CloseOutlined";

import { POS_RADIUS, posColors } from "./layout";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (comment: string) => void;
};

/** «Отложить чек?» — комментарий, по которому кассир потом узнает покупку. */
export const PosHoldReceiptDialog: React.FC<Props> = ({ open, onClose, onConfirm }) => {
  const theme = useTheme();
  const c = posColors(theme);
  const [comment, setComment] = React.useState("");

  React.useEffect(() => {
    if (open) setComment("");
  }, [open]);

  return (
    <Dialog
      open={open}
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
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: "24px", py: "16px", borderBottom: `1px solid ${c.outline}` }}>
        <Typography sx={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2, color: c.text }}>Отложить чек?</Typography>
        <IconButton size="small" onClick={onClose} sx={{ p: 0, color: c.textSoft }} aria-label="Закрыть">
          <CloseOutlined sx={{ fontSize: 16 }} />
        </IconButton>
      </Stack>

      <Stack gap="16px" sx={{ p: "16px", bgcolor: c.page }}>
        <Stack gap="10px">
          <Typography sx={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2, textTransform: "uppercase", color: c.textDim }}>
            Добавить комментарий
          </Typography>
          <Box
            sx={{
              height: 104,
              p: "10px",
              bgcolor: c.card,
              border: `1px solid ${c.hairline}`,
              borderRadius: `${POS_RADIUS.card}px`,
            }}
          >
            <InputBase
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Например: клиент с розовыми очками"
              multiline
              minRows={3}
              maxRows={3}
              sx={{
                width: "100%",
                alignItems: "flex-start",
                fontSize: 16,
                fontWeight: 600,
                lineHeight: 1.2,
                color: c.text,
                "& textarea::placeholder": { color: c.textDim, opacity: 1, fontWeight: 400 },
              }}
            />
          </Box>
        </Stack>

        <Stack direction="row" gap="10px">
          <ButtonBase
            onClick={onClose}
            sx={{
              px: "24px",
              py: "20px",
              borderRadius: `${POS_RADIUS.control}px`,
              bgcolor: c.page,
              border: `1px solid ${c.hairline}`,
              color: c.textSoft,
              fontSize: 14,
              fontWeight: 900,
              lineHeight: 1.2,
            }}
          >
            Отменить
          </ButtonBase>
          <ButtonBase
            onClick={() => onConfirm(comment)}
            sx={{
              flex: 1,
              px: "16px",
              py: "10px",
              borderRadius: `${POS_RADIUS.control}px`,
              bgcolor: c.card,
              border: `1px solid ${c.outline}`,
              color: c.text,
              fontSize: 14,
              fontWeight: 900,
              lineHeight: 1.2,
            }}
          >
            Отложить чек
          </ButtonBase>
        </Stack>
      </Stack>
    </Dialog>
  );
};
