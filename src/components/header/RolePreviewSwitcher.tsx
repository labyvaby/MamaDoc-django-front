import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import { Alert, Box, Button, CircularProgress, Divider, MenuItem, MenuList, Popover, Stack, Tooltip, Typography } from "@mui/material";
import { darken, type Theme } from "@mui/material/styles";
import { getRolePreviewOptions, type RbacRole } from "../../api/auth";
import { usePermissions } from "../../hooks/usePermissions";
import { djangoQueryKeys } from "../../api/queryKeys";

const previewColor = (theme: Theme) => theme.palette.mode === "dark"
  ? theme.palette.warning.light : darken(theme.palette.warning.dark, 0.22);

/** Always lives in the app header, including on a denied/empty role page. */
export default function RolePreviewSwitcher() {
  const { canPreviewRoles, rolePreview, activeOrganization, switching, switchRolePreview } = usePermissions();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [roles, setRoles] = useState<NonNullable<RbacRole>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const orgId = activeOrganization?.id;

  useEffect(() => {
    if (!anchor) return;
    let disposed = false;
    setLoading(true);
    setRoles([]);
    setError(null);
    getRolePreviewOptions().then((data) => {
      if (!disposed) setRoles(data.roles);
    }).catch((reason: unknown) => {
      if (!disposed) setError(reason instanceof Error ? reason.message : "Не удалось загрузить роли. Откройте список ещё раз.");
    }).finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, [anchor, orgId]);

  if (!canPreviewRoles && !rolePreview) return null;

  const selectRole = async (roleId: number | null) => {
    if (!switchRolePreview) return;
    setError(null);
    try {
      // Cancel pending data before switching so an old response cannot
      // repopulate the new role's cache. Context event also remounts pages.
      await queryClient.cancelQueries({ queryKey: djangoQueryKeys.all });
      await switchRolePreview(roleId);
      queryClient.removeQueries({ queryKey: djangoQueryKeys.all });
      setAnchor(null);
      navigate("/", { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось переключить роль. Попробуйте ещё раз.");
    }
  };

  return <>
    <Tooltip title={rolePreview ? `Просмотр роли: ${rolePreview.name}` : "Посмотреть доступ другой роли"}>
      <Button
        size="small" variant={rolePreview ? "outlined" : "text"}
        color={rolePreview ? "warning" : "inherit"}
        aria-label={rolePreview ? `Просмотр роли: ${rolePreview.name}` : "Посмотреть как роль"}
        aria-haspopup="menu" aria-expanded={Boolean(anchor)}
        disabled={switching || (!orgId && !rolePreview)}
        onClick={(event) => setAnchor(event.currentTarget)}
        sx={{ minWidth: 36, px: { xs: 0.75, md: 1 }, gap: 0.75, ...(rolePreview && { color: previewColor, borderColor: previewColor }) }}
      >
        <VisibilityOutlined fontSize="small" />
        <Box component="span" sx={{ display: { xs: "none", md: "block" }, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {rolePreview?.name ?? "Посмотреть как роль"}
        </Box>
      </Button>
    </Tooltip>
    <Popover
      open={Boolean(anchor)} anchorEl={anchor}
      onClose={() => { if (!switching) setAnchor(null); }}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      transformOrigin={{ vertical: "top", horizontal: "right" }}
      slotProps={{ paper: { sx: { width: 320, maxWidth: "calc(100vw - 24px)" } } }}
    >
      <Box sx={{ p: 2 }}>
        <Typography fontWeight={600}>Посмотреть как роль</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {activeOrganization?.name}. Временный доступ выбранной роли в текущем филиале.
        </Typography>
      </Box>
      {rolePreview && <Box sx={{ px: 2, pb: 1.5 }}>
        <Typography variant="body2" sx={{ mb: 1, color: previewColor }}>Сейчас: {rolePreview.name}</Typography>
        <Button fullWidth variant="outlined" disabled={switching} onClick={() => void selectRole(null)}>
          Вернуться к супер администратору
        </Button>
      </Box>}
      {error && <Alert severity="error" sx={{ mx: 2, mb: 1.5 }}>{error}</Alert>}
      <Divider />
      {loading ? <Stack direction="row" alignItems="center" spacing={1} sx={{ p: 2 }}>
        <CircularProgress size={18} /><Typography variant="body2">Загрузка ролей…</Typography>
      </Stack> : <MenuList autoFocusItem aria-label="Роли организации" sx={{ maxHeight: 300, overflowY: "auto", py: 0.5 }}>
        {roles.map((role) => <MenuItem key={role.id} selected={rolePreview?.id === role.id} disabled={switching} onClick={() => void selectRole(role.id)} sx={{ whiteSpace: "normal", py: 1.25 }}>
          {role.name}
        </MenuItem>)}
        {!roles.length && !error && <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>В организации пока нет доступных ролей.</Typography>}
      </MenuList>}
    </Popover>
  </>;
}
