import React from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";
import ErrorOutlineRounded from "@mui/icons-material/ErrorOutlineRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";

import { API_RATE_LIMIT_EVENT } from "../../api/client";

export const RateLimitDialog: React.FC = () => {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const handleRateLimit = () => setOpen(true);
    window.addEventListener(API_RATE_LIMIT_EVENT, handleRateLimit);
    return () => window.removeEventListener(API_RATE_LIMIT_EVENT, handleRateLimit);
  }, []);

  const handleReload = () => {
    window.location.reload();
  };

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      fullWidth
      maxWidth="xs"
      aria-labelledby="rate-limit-dialog-title"
    >
      <DialogTitle id="rate-limit-dialog-title">
        <Box display="flex" alignItems="center" gap={1.25}>
          <Box
            display="grid"
            sx={{
              placeItems: "center",
              width: 40,
              height: 40,
              borderRadius: "50%",
              color: "warning.dark",
              bgcolor: "warning.light",
              flexShrink: 0,
            }}
          >
            <ErrorOutlineRounded />
          </Box>
          Не удалось выполнить запрос
        </Box>
      </DialogTitle>

      <DialogContent>
        <Typography variant="body1" mb={1}>
          Приносим извинения — сервис временно отклонил запрос.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Пожалуйста, обновите страницу и продолжите работу. Все уже сохранённые
          данные останутся на месте.
        </Typography>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={() => setOpen(false)} color="inherit">
          Закрыть
        </Button>
        <Button
          onClick={handleReload}
          variant="contained"
          startIcon={<RefreshRounded />}
        >
          Обновить страницу
        </Button>
      </DialogActions>
    </Dialog>
  );
};
