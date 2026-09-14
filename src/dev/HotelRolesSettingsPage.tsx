/**
 * «Настройки» → «Роли и права» для Viva — подменяет реальный SettingsIndexPage
 * (см. src/pages/settings/SettingsRouter.tsx), у которого вкладки завязаны на
 * реальный RBAC (src/api/rbac.ts) и клиническую специфику (диагнозы, страховые
 * и т.п.), не применимую к отелю.
 *
 * Витрина той же формы, что реальная RolesSettingsPage: роль = название +
 * список прав, права сгруппированы по категории (getHotelRolesSnapshot,
 * HOTEL_PERMISSION_CATALOG в mockDemoData.ts). Полностью в браузерном сторе —
 * у Viva нет организации на бэкенде, назначать роли по-настоящему некому.
 */
import React from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AddOutlined from "@mui/icons-material/AddOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import LockOutlined from "@mui/icons-material/LockOutlined";
import { Navigate } from "react-router";

import { usePageTitle } from "../hooks/usePageTitle";
import {
  isVivaActive,
  saveHotelRole,
  deleteHotelRole,
  subscribeHotelRoles,
  getHotelRolesSnapshot,
  HOTEL_PERMISSION_CATALOG,
  type HotelRole,
} from "./mockDemoData";

const PERMISSION_CATEGORIES = [...new Set(HOTEL_PERMISSION_CATALOG.map((p) => p.category))];

interface RoleEditState {
  id: string | null;
  name: string;
  permissions: Set<string>;
}

export const HotelRolesSettingsPage: React.FC = () => {
  usePageTitle("Роли и права");
  const theme = useTheme();
  const roles = React.useSyncExternalStore(subscribeHotelRoles, getHotelRolesSnapshot);
  const [edit, setEdit] = React.useState<RoleEditState | null>(null);

  // После хука (Rules of Hooks) — страница доступна только Viva.
  if (!isVivaActive()) return <Navigate to="/" replace />;

  const openCreate = () => setEdit({ id: null, name: "", permissions: new Set() });
  const openEdit = (role: HotelRole) => setEdit({ id: role.id, name: role.name, permissions: new Set(role.permissions) });

  const togglePermission = (key: string) => {
    if (!edit) return;
    const next = new Set(edit.permissions);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setEdit({ ...edit, permissions: next });
  };

  const saveEdit = () => {
    if (!edit || !edit.name.trim()) return;
    saveHotelRole({
      id: edit.id ?? `role_${Date.now()}`,
      name: edit.name.trim(),
      permissions: [...edit.permissions],
      isSystem: roles.find((r) => r.id === edit.id)?.isSystem,
    });
    setEdit(null);
  };

  return (
    <Box sx={{ height: "100%", overflow: "auto", px: theme.appLayout.page.paddingX, py: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h6" fontWeight={700}>
          Роли и права
        </Typography>
        <Button size="small" variant="contained" startIcon={<AddOutlined />} onClick={openCreate}>
          Создать роль
        </Button>
      </Stack>

      <Alert severity="info" variant="outlined" sx={{ mb: 2.5, fontSize: "0.8rem" }}>
        Демо-справочник ролей Viva — у каждой роли свой набор прав по разделам отеля. Встроенные роли
        (Владелец, Администратор) можно переименовать и поменять права, но не удалить.
      </Alert>

      <Stack gap={1.5} sx={{ maxWidth: 640 }}>
        {roles.map((role) => (
          <Paper
            key={role.id}
            elevation={0}
            variant="outlined"
            sx={{ p: 1.75, display: "flex", alignItems: "center", gap: 1.5 }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" alignItems="center" gap={1}>
                <Typography variant="body2" fontWeight={600}>
                  {role.name}
                </Typography>
                {role.isSystem && (
                  <Chip
                    icon={<LockOutlined sx={{ fontSize: 14 }} />}
                    label="Встроенная"
                    size="small"
                    sx={{ height: 20, fontSize: "0.7rem" }}
                  />
                )}
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {role.permissions.length} из {HOTEL_PERMISSION_CATALOG.length} прав
              </Typography>
            </Box>
            <Button size="small" startIcon={<EditOutlined fontSize="small" />} onClick={() => openEdit(role)}>
              Изменить
            </Button>
            {!role.isSystem && (
              <Button size="small" color="error" onClick={() => deleteHotelRole(role.id)}>
                <DeleteOutlined fontSize="small" />
              </Button>
            )}
          </Paper>
        ))}
      </Stack>

      <Dialog open={edit != null} onClose={() => setEdit(null)} maxWidth="xs" fullWidth>
        {edit && (
          <>
            <DialogTitle>{edit.id ? "Изменить роль" : "Новая роль"}</DialogTitle>
            <DialogContent>
              <Stack gap={2} sx={{ mt: 0.5 }}>
                <TextField
                  label="Название роли"
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  autoFocus
                  fullWidth
                />
                {PERMISSION_CATEGORIES.map((category) => (
                  <Box key={category}>
                    <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>
                      {category}
                    </Typography>
                    <Stack gap={0.25}>
                      {HOTEL_PERMISSION_CATALOG.filter((p) => p.category === category).map((p) => (
                        <FormControlLabel
                          key={p.key}
                          control={
                            <Checkbox
                              size="small"
                              checked={edit.permissions.has(p.key)}
                              onChange={() => togglePermission(p.key)}
                            />
                          }
                          label={
                            <Typography variant="body2" color="text.secondary">
                              {p.label}
                            </Typography>
                          }
                        />
                      ))}
                    </Stack>
                  </Box>
                ))}
              </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button onClick={() => setEdit(null)}>Отмена</Button>
              <Button variant="contained" disabled={!edit.name.trim()} onClick={saveEdit}>
                Сохранить
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};

export default HotelRolesSettingsPage;
