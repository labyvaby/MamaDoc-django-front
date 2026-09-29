import React from "react";
import { Alert, Snackbar, Typography } from "@mui/material";

type Toast = { id: number; title: string; sub?: string };

const ToastContext = React.createContext<(title: string, sub?: string) => void>(() => {});

/** Короткие уведомления модуля: «Бронь создана · до 29.09», как тосты прототипа. */
export function RealEstateToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = React.useState<Toast | null>(null);
  const show = React.useCallback((title: string, sub?: string) => {
    setToast({ id: Date.now(), title, sub });
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <Snackbar
        key={toast?.id}
        open={toast !== null}
        autoHideDuration={3500}
        onClose={(_, reason) => reason !== "clickaway" && setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert severity="success" variant="outlined" onClose={() => setToast(null)} sx={{ bgcolor: "background.paper" }}>
          <Typography variant="body2" fontWeight={600}>
            {toast?.title}
          </Typography>
          {toast?.sub && (
            <Typography variant="caption" color="text.secondary">
              {toast.sub}
            </Typography>
          )}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  );
}

export const useRealEstateToast = () => React.useContext(ToastContext);
