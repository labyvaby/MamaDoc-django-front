import React from "react";
import {
  Avatar,
  Box,
  Typography,
  IconButton,
  Menu,
  MenuItem,
  ListItemText,
  ListSubheader,
  Tooltip,
  Snackbar,
  Alert,
  CircularProgress,
  Divider,
} from "@mui/material";
import BusinessOutlined from "@mui/icons-material/BusinessOutlined";
import StoreOutlined from "@mui/icons-material/StoreOutlined";
import UnfoldMoreOutlined from "@mui/icons-material/UnfoldMoreOutlined";
import CheckOutlined from "@mui/icons-material/CheckOutlined";

import { useThemedLayoutContext } from "@refinedev/mui";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";

import { usePermissions } from "../../hooks/usePermissions";
import { IS_DJANGO_BACKEND } from "../../config/backend";
import type { RbacBranch, RbacMembership } from "../../api/auth";

/**
 * Compact active organization / active branch switcher.
 *
 * Behavior:
 *  - Hidden entirely outside Django mode.
 *  - When user has 1 membership and no branches — renders read-only chip
 *    (nothing to switch to).
 *  - Otherwise — chip opens a popover menu with organizations grouped,
 *    each listing its accessible branches (plus the org-wide «Все филиалы»
 *    mode). Selecting a branch calls switchContext({ membershipId, branchId }).
 *    Even a single branch needs the menu: a fresh session starts org-wide,
 *    and appointment creation requires a concrete branch.
 *  - Calls `onSwitched` after a successful switch so the parent can
 *    e.g. close the mobile sidebar.
 */
export const ActiveContextSwitcher: React.FC<{ onSwitched?: () => void }> = ({
  onSwitched,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { siderCollapsed } = useThemedLayoutContext();
  const collapsed = siderCollapsed && !isMobile;

  const {
    memberships = [],
    activeMembership,
    activeOrganization,
    activeBranch,
    switching,
    switchContext,
  } = usePermissions();

  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [error, setError] = React.useState<string | null>(null);

  if (!IS_DJANGO_BACKEND) return null;

  const totalBranches = memberships.reduce(
    (acc, m) => acc + (m.branches?.length ?? 0),
    0,
  );

  // Nothing to render at all — user has no orgs/branches assigned.
  if (memberships.length === 0) return null;

  // Меню нужно, как только есть хотя бы один филиал: даже с единственным
  // филиалом сессия после логина находится в режиме «Все филиалы»
  // (activeBranch=null), и без меню переключиться в филиал невозможно —
  // а создание приёма требует конкретный филиал.
  const isInteractive = memberships.length > 1 || totalBranches >= 1;

  const handleOpen = (e: React.MouseEvent<HTMLElement>) => {
    if (!isInteractive || switching) return;
    setAnchorEl(e.currentTarget);
  };

  const handleClose = () => setAnchorEl(null);

  const handleSelect = async (
    membership: RbacMembership,
    branch: RbacBranch | null,
  ) => {
    handleClose();
    if (!switchContext) return;

    // Don't bother the backend if nothing actually changed.
    const sameMembership = activeMembership?.id === membership.id;
    const sameBranch = (activeBranch?.id ?? null) === (branch?.id ?? null);
    if (sameMembership && sameBranch) return;

    try {
      await switchContext({
        membershipId: membership.id,
        branchId: branch ? branch.id : null,
      });
      onSwitched?.();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Не удалось переключить контекст";
      setError(message);
    }
  };

  // ── Collapsed (desktop, narrow) view ───────────────────────────────────
  if (collapsed) {
    // Название филиала главнее названия организации.
    const tooltipTitle = activeOrganization
      ? activeBranch
        ? `${activeBranch.name} — ${activeOrganization.name}`
        : activeOrganization.name
      : "Контекст не выбран";

    return (
      <>
        <Tooltip title={tooltipTitle} placement="right">
          <Box sx={{ display: "flex", justifyContent: "center", py: 0.5 }}>
            <IconButton
              size="small"
              onClick={handleOpen}
              disabled={switching || !isInteractive}
              aria-label="Активная организация и филиал"
            >
              {switching ? (
                <CircularProgress size={16} />
              ) : activeBranch?.logoUrl ?? activeOrganization?.logoUrl ? (
                <Avatar
                  variant="rounded"
                  src={activeBranch?.logoUrl ?? activeOrganization?.logoUrl ?? undefined}
                  alt={activeBranch?.name ?? activeOrganization?.name}
                  sx={{ width: 20, height: 20 }}
                />
              ) : (
                <BusinessOutlined fontSize="small" />
              )}
            </IconButton>
          </Box>
        </Tooltip>
        <ContextMenu
          anchorEl={anchorEl}
          onClose={handleClose}
          memberships={memberships}
          activeMembershipId={activeMembership?.id ?? null}
          activeBranchId={activeBranch?.id ?? null}
          onSelect={handleSelect}
        />
        <ErrorSnack
          message={error}
          onClose={() => setError(null)}
        />
      </>
    );
  }

  // ── Expanded chip view ─────────────────────────────────────────────────
  // Название филиала главнее названия организации: филиал — крупной жирной
  // строкой, организация — вторичной подписью под ним. Без филиала показываем
  // организацию как главную строку.
  const orgLabel = activeOrganization?.name ?? "Без организации";
  const branchLabel = activeBranch?.name ?? null;
  const primaryLabel = branchLabel ?? orgLabel;
  const captionLabel = branchLabel ? "Филиал" : "Организация";
  const LeadIcon = branchLabel ? StoreOutlined : BusinessOutlined;

  const chipBody = (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        px: 1.25,
        py: 0.75,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1,
        cursor: isInteractive && !switching ? "pointer" : "default",
        bgcolor: "background.default",
        transition: "border-color 150ms, background-color 150ms",
        "&:hover":
          isInteractive && !switching
            ? { borderColor: "primary.main" }
            : undefined,
        opacity: switching ? 0.7 : 1,
      }}
      onClick={handleOpen}
    >
      {/* Логотип главнее типовой иконки: в филиальном контексте лидирует
          логотип филиала (если загружен), логотип организации уходит в
          подпись ниже; без филиала лидирует логотип организации. */}
      {branchLabel && activeBranch?.logoUrl ? (
        <Avatar
          variant="rounded"
          src={activeBranch.logoUrl}
          alt={branchLabel}
          sx={{ width: 24, height: 24 }}
        />
      ) : !branchLabel && activeOrganization?.logoUrl ? (
        <Avatar
          variant="rounded"
          src={activeOrganization.logoUrl}
          alt={orgLabel}
          sx={{ width: 24, height: 24 }}
        />
      ) : (
        <LeadIcon fontSize="small" sx={{ color: "text.secondary" }} />
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="caption"
          sx={{
            display: "block",
            color: "text.secondary",
            lineHeight: 1.1,
            fontSize: "0.65rem",
          }}
        >
          {captionLabel}
        </Typography>
        <Typography
          variant="body2"
          sx={{
            fontWeight: 600,
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {primaryLabel}
        </Typography>
        {branchLabel && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              mt: 0.25,
              color: "text.secondary",
            }}
          >
            {activeOrganization?.logoUrl ? (
              <Avatar
                variant="rounded"
                src={activeOrganization.logoUrl}
                alt={orgLabel}
                sx={{ width: 12, height: 12 }}
              />
            ) : (
              <BusinessOutlined sx={{ fontSize: 12 }} />
            )}
            <Typography
              variant="caption"
              sx={{
                lineHeight: 1.1,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {orgLabel}
            </Typography>
          </Box>
        )}
      </Box>
      {isInteractive && (
        <Box sx={{ display: "flex", alignItems: "center", color: "text.secondary" }}>
          {switching ? (
            <CircularProgress size={14} />
          ) : (
            <UnfoldMoreOutlined fontSize="small" />
          )}
        </Box>
      )}
    </Box>
  );

  return (
    <Box sx={{ px: 1, pb: 1 }}>
      {chipBody}
      <ContextMenu
        anchorEl={anchorEl}
        onClose={handleClose}
        memberships={memberships}
        activeMembershipId={activeMembership?.id ?? null}
        activeBranchId={activeBranch?.id ?? null}
        onSelect={handleSelect}
      />
      <ErrorSnack message={error} onClose={() => setError(null)} />
    </Box>
  );
};

// ── Subcomponents ───────────────────────────────────────────────────────────

type ContextMenuProps = {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  memberships: RbacMembership[];
  activeMembershipId: number | null;
  activeBranchId: number | null;
  onSelect: (m: RbacMembership, b: RbacBranch | null) => void;
};

const ContextMenu: React.FC<ContextMenuProps> = ({
  anchorEl,
  onClose,
  memberships,
  activeMembershipId,
  activeBranchId,
  onSelect,
}) => {
  return (
    <Menu
      anchorEl={anchorEl}
      open={Boolean(anchorEl)}
      onClose={onClose}
      anchorOrigin={{ vertical: "top", horizontal: "right" }}
      transformOrigin={{ vertical: "bottom", horizontal: "left" }}
      slotProps={{
        paper: { sx: { minWidth: 260, maxHeight: 380 } },
      }}
    >
      {memberships.map((m, idx) => {
        // Filter to branches that the backend marked as active/accessible.
        // The backend already filters to memberships the user can use,
        // but we still hide inactive branches here so they can't be selected.
        const branches = (m.branches ?? []).filter((b) => b.isActive);

        return (
          <Box key={m.id}>
            {idx > 0 && <Divider sx={{ my: 0.5 }} />}
            <ListSubheader
              disableSticky
              sx={{
                lineHeight: "1.6em",
                color: "text.secondary",
                bgcolor: "transparent",
                fontWeight: 600,
              }}
            >
              {m.organization.name}
            </ListSubheader>

            {/* Режим всей организации: без привязки к филиалу. Нужен, чтобы
                вернуться из филиального контекста (например, для выдачи
                операционных филиалов в карточке сотрудника). */}
            <MenuItem
              onClick={() => onSelect(m, null)}
              selected={m.id === activeMembershipId && activeBranchId === null}
            >
              <BusinessOutlined
                fontSize="small"
                sx={{ mr: 1, color: "text.secondary" }}
              />
              <ListItemText
                primary={branches.length > 0 ? "Все филиалы" : "Без филиала"}
                primaryTypographyProps={{ variant: "body2" }}
              />
              {m.id === activeMembershipId && activeBranchId === null && (
                <CheckOutlined fontSize="small" color="primary" />
              )}
            </MenuItem>
            {branches.length > 0 &&
              branches.map((b) => {
                const isActive =
                  m.id === activeMembershipId && b.id === activeBranchId;
                return (
                  <MenuItem
                    key={`${m.id}-${b.id}`}
                    onClick={() => onSelect(m, b)}
                    selected={isActive}
                  >
                    {b.logoUrl ? (
                      <Avatar
                        variant="rounded"
                        src={b.logoUrl}
                        alt={b.name}
                        sx={{ width: 20, height: 20, mr: 1 }}
                      />
                    ) : (
                      <StoreOutlined
                        fontSize="small"
                        sx={{ mr: 1, color: "text.secondary" }}
                      />
                    )}
                    <ListItemText
                      primary={b.name}
                      primaryTypographyProps={{ variant: "body2" }}
                    />
                    {isActive && (
                      <CheckOutlined fontSize="small" color="primary" />
                    )}
                  </MenuItem>
                );
              })}
          </Box>
        );
      })}
    </Menu>
  );
};

const ErrorSnack: React.FC<{
  message: string | null;
  onClose: () => void;
}> = ({ message, onClose }) => (
  <Snackbar
    open={Boolean(message)}
    autoHideDuration={5000}
    onClose={onClose}
    anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
  >
    <Alert
      onClose={onClose}
      severity="error"
      variant="filled"
      sx={{ width: "100%" }}
    >
      {message}
    </Alert>
  </Snackbar>
);

export default ActiveContextSwitcher;
