import React from "react";
import {
  Alert,
  Avatar,
  Box,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from "@mui/material";
import StoreOutlined from "@mui/icons-material/StoreOutlined";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import BusinessOutlined from "@mui/icons-material/BusinessOutlined";

import { usePermissions } from "../../hooks/usePermissions";
import { IS_DJANGO_BACKEND } from "../../config/backend";
import type { RbacBranch } from "../../api/auth";

/**
 * Модалка выбора филиала при входе.
 *
 * Показывается один раз после каждого логина (не при перезагрузке страницы):
 * login.tsx ставит флаг в sessionStorage через markBranchPickerPending(),
 * а этот компонент — смонтированный в общем layout — открывает диалог, когда
 * у активного membership больше одного активного филиала. Выбор обязателен:
 * диалог не закрывается по Escape/клику мимо, только выбором пункта.
 */

const PENDING_KEY = "mamadoc:branch-picker-pending";

/** Пометить, что после логина нужно предложить выбор филиала. */
export function markBranchPickerPending(): void {
  try {
    window.sessionStorage.setItem(PENDING_KEY, "1");
  } catch {
    // sessionStorage недоступен (приватный режим) — просто не покажем модалку
  }
}

function clearPending(): void {
  try {
    window.sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // ignore
  }
}

function isPending(): boolean {
  try {
    return window.sessionStorage.getItem(PENDING_KEY) === "1";
  } catch {
    return false;
  }
}

export const BranchPickerDialog: React.FC = () => {
  const {
    authStatus,
    activeMembership,
    activeOrganization,
    activeBranch,
    switching,
    switchContext,
  } = usePermissions();

  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // id филиала, на который сейчас переключаемся (для спиннера у пункта)
  const [pendingBranchId, setPendingBranchId] = React.useState<number | null>(null);

  const branches: RbacBranch[] = React.useMemo(
    () => (activeMembership?.branches ?? []).filter((b) => b.isActive),
    [activeMembership],
  );

  // Решаем судьбу флага, как только контекст загружен: >1 филиала — открываем
  // диалог, иначе молча снимаем флаг (выбирать не из чего).
  React.useEffect(() => {
    if (!IS_DJANGO_BACKEND) return;
    if (authStatus !== "authenticated") return;
    if (!activeMembership) return;
    if (!isPending()) return;

    if (branches.length > 1) {
      setOpen(true);
    } else {
      clearPending();
    }
  }, [authStatus, activeMembership, branches]);

  if (!IS_DJANGO_BACKEND) return null;

  const finish = () => {
    clearPending();
    setOpen(false);
    setError(null);
    setPendingBranchId(null);
  };

  const handleSelect = async (branch: RbacBranch) => {
    if (!activeMembership || !switchContext || switching) return;

    // Уже активный филиал — подтверждение без запроса к бэку.
    if (activeBranch?.id === branch.id) {
      finish();
      return;
    }

    setError(null);
    setPendingBranchId(branch.id);
    try {
      await switchContext({
        membershipId: activeMembership.id,
        branchId: branch.id,
      });
      finish();
    } catch (err) {
      setPendingBranchId(null);
      setError(
        err instanceof Error ? err.message : "Не удалось переключить филиал",
      );
    }
  };

  return (
    <Dialog
      open={open}
      // Выбор обязателен: закрытие только через выбор пункта.
      onClose={() => undefined}
      disableEscapeKeyDown
      maxWidth="xs"
      fullWidth
      aria-labelledby="branch-picker-title"
    >
      <DialogTitle id="branch-picker-title" sx={{ pb: 0.5 }}>
        Выберите филиал
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            mt: 0.5,
            color: "text.secondary",
          }}
        >
          {activeOrganization?.logoUrl ? (
            <Avatar
              variant="rounded"
              src={activeOrganization.logoUrl}
              alt={activeOrganization.name}
              sx={{ width: 18, height: 18 }}
            />
          ) : (
            <BusinessOutlined sx={{ fontSize: 18 }} />
          )}
          <Typography variant="body2">
            {activeOrganization?.name ?? "Организация"}
          </Typography>
        </Box>
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 1 }}>
            {error}
          </Alert>
        )}
        <List disablePadding>
          {branches.map((branch) => {
            const isActive = activeBranch?.id === branch.id;
            const isSwitchingThis = pendingBranchId === branch.id;
            return (
              <ListItemButton
                key={branch.id}
                onClick={() => void handleSelect(branch)}
                disabled={switching}
                selected={isActive}
                sx={{
                  borderRadius: 1,
                  border: "1px solid",
                  borderColor: "divider",
                  mb: 1,
                  "&:last-of-type": { mb: 0 },
                }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  {branch.logoUrl ? (
                    <Avatar
                      variant="rounded"
                      src={branch.logoUrl}
                      alt={branch.name}
                      sx={{ width: 24, height: 24 }}
                    />
                  ) : (
                    <StoreOutlined fontSize="small" />
                  )}
                </ListItemIcon>
                <ListItemText
                  primary={branch.name}
                  secondary={isActive ? "Текущий филиал" : undefined}
                  primaryTypographyProps={{ fontWeight: 600 }}
                />
                {isSwitchingThis ? (
                  <CircularProgress size={18} />
                ) : isActive ? (
                  <CheckOutlined fontSize="small" color="primary" />
                ) : null}
              </ListItemButton>
            );
          })}
        </List>
      </DialogContent>
    </Dialog>
  );
};

export default BranchPickerDialog;
