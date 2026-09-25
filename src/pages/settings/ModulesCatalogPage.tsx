import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import AddOutlined from "@mui/icons-material/AddOutlined";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { djangoQueryKeys } from "../../api/queryKeys";
import { type CatalogModule, setOrganizationModule } from "../../api/tenancy";
import { useModulesCatalog } from "../../hooks/useModulesCatalog";
import { usePermissions } from "../../hooks/usePermissions";
import { MODULE_SETTINGS_ROUTE, moduleIcon } from "../../config/moduleCatalogMeta";
import { CATEGORY_LABELS, groupByCategory } from "../../config/moduleCatalogGrouping";
import { catalogActions } from "../../config/moduleCatalogActions";
import { missingRequirements } from "../../config/moduleCatalogRequirements";
import { SettingsLayout } from "./SettingsLayout";

type PendingToggle = { module: CatalogModule; enable: boolean };
type Notice = { severity: "success" | "error"; text: string };

const ModulesCatalogPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useModulesCatalog();
  const { isPlatformAdmin, activeOrganization } = usePermissions();
  const [stubOpen, setStubOpen] = useState(false);
  const [pending, setPending] = useState<PendingToggle | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const catalog = useMemo(() => data ?? [], [data]);
  const groups = useMemo(() => groupByCategory(catalog), [catalog]);
  const connectedCount = catalog.filter((m) => m.isEnabled).length;
  const availableCount = catalog.length - connectedCount;
  // Переключает модули только суперпользователь платформы (не роль
  // «superadmin» клиники); без активной организации переключать нечего.
  const canToggle = Boolean(isPlatformAdmin && activeOrganization);
  const orgName = activeOrganization?.name ?? "организации";

  const toggle = useMutation({
    mutationFn: ({ code, enable }: { code: string; enable: boolean }) =>
      setOrganizationModule(activeOrganization!.id, code, enable),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: djangoQueryKeys.tenancy.all });
      setNotice({
        severity: "success",
        text: `«${row.moduleName}» ${row.isEnabled ? "подключён" : "отключён"}.`,
      });
    },
    onError: (error) => {
      setNotice({
        severity: "error",
        text: error instanceof Error ? error.message : "Не удалось переключить модуль.",
      });
    },
    onSettled: () => setPending(null),
  });

  if (isLoading) {
    return (
      <SettingsLayout>
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      </SettingsLayout>
    );
  }
  if (isError) {
    return (
      <SettingsLayout>
        <Alert severity="error">
          Не удалось загрузить каталог модулей. Обновите страницу.
        </Alert>
      </SettingsLayout>
    );
  }

  return (
    <SettingsLayout>
      <Stack spacing={2} sx={{ maxWidth: 900, mx: "auto", width: "100%" }}>
        {/* Заголовок размечен как у соседних страниц настроек (Stack + h6):
            на эту форму рассчитаны мобильные стили SettingsLayout. */}
        <Stack gap={0.5}>
          <Typography variant="h6" fontWeight={600}>
            Модули
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Всё, что можно подключить к вашей CRM. Подключено {connectedCount} · доступно ещё {availableCount}
          </Typography>
        </Stack>

        {/* Группы — Stack, а не Box: мобильный SettingsLayout растягивает
            кнопки в последнем Box-потомке (рассчитан на кнопку «Сохранить»). */}
        {groups.map(([category, modules]) => (
          <Stack key={category} spacing={1.5}>
            <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
              {CATEGORY_LABELS[category] ?? category}
            </Typography>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                gap: 1.5,
              }}
            >
              {modules.map((m) => {
                const settingsRoute = MODULE_SETTINGS_ROUTE[m.code];
                const missing = m.isEnabled ? [] : missingRequirements(m, catalog);
                const actions = catalogActions(m, {
                  isPlatformAdmin: canToggle,
                  hasSettingsRoute: Boolean(settingsRoute),
                });
                return (
                  <Card
                    key={m.code}
                    variant="outlined"
                    sx={{
                      p: 2,
                      display: "flex",
                      flexDirection: "column",
                      gap: 1.5,
                      bgcolor: m.isEnabled ? "background.paper" : "action.hover",
                    }}
                  >
                    <Stack direction="row" spacing={1.25} alignItems="flex-start">
                      <Box sx={{ color: m.isEnabled ? "primary.main" : "text.disabled", mt: 0.25 }}>
                        {moduleIcon(m.code)}
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 500 }}>
                          {m.name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {m.description}
                        </Typography>
                        {missing.length > 0 && (
                          <Typography
                            variant="caption"
                            color="warning.main"
                            sx={{ display: "block", mt: 0.5 }}
                          >
                            Требует: {missing.map((r) => r.name).join(", ")}
                          </Typography>
                        )}
                      </Box>
                    </Stack>

                    <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ mt: "auto" }}>
                      {m.isEnabled ? (
                        <Chip
                          size="small"
                          color="success"
                          variant="outlined"
                          icon={<CheckCircleOutlined />}
                          label="Подключён"
                        />
                      ) : (
                        <Typography variant="caption" color="text.disabled">
                          Не подключён
                        </Typography>
                      )}

                      <Stack direction="row" spacing={0.5}>
                        {actions.includes("configure") && settingsRoute && (
                          <Button size="small" onClick={() => navigate(settingsRoute)}>
                            Настроить
                          </Button>
                        )}
                        {actions.includes("disable") && (
                          <Button
                            size="small"
                            color="error"
                            onClick={() => setPending({ module: m, enable: false })}
                          >
                            Отключить
                          </Button>
                        )}
                        {actions.includes("enable") && (
                          <Button
                            size="small"
                            startIcon={<AddOutlined />}
                            onClick={() => setPending({ module: m, enable: true })}
                          >
                            Подключить
                          </Button>
                        )}
                        {actions.includes("request") && (
                          <Button
                            size="small"
                            startIcon={<AddOutlined />}
                            onClick={() => setStubOpen(true)}
                          >
                            Подключить
                          </Button>
                        )}
                      </Stack>
                    </Stack>
                  </Card>
                );
              })}
            </Box>
          </Stack>
        ))}

        <Snackbar
          open={stubOpen}
          autoHideDuration={4000}
          onClose={() => setStubOpen(false)}
          message="Скоро — обратитесь к вашему менеджеру, чтобы подключить модуль"
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        />
      </Stack>

      <Dialog
        open={pending !== null}
        onClose={() => {
          if (!toggle.isPending) setPending(null);
        }}
      >
        <DialogTitle>{pending?.enable ? "Подключить модуль?" : "Отключить модуль?"}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {pending?.enable
              ? `Подключить «${pending.module.name}» для «${orgName}»? Модуль появится в CRM клиники.`
              : `Отключить «${pending?.module.name ?? ""}» у «${orgName}»? Разделы модуля пропадут у сотрудников клиники. Права в ролях сохранятся и вернутся при подключении.`}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPending(null)} disabled={toggle.isPending}>
            Отмена
          </Button>
          <Button
            variant="contained"
            color={pending?.enable ? "primary" : "error"}
            disabled={toggle.isPending}
            onClick={() => {
              if (pending) toggle.mutate({ code: pending.module.code, enable: pending.enable });
            }}
          >
            {pending?.enable ? "Подключить" : "Отключить"}
          </Button>
        </DialogActions>
      </Dialog>

      {notice && (
        <Snackbar
          open
          autoHideDuration={notice.severity === "error" ? 10000 : 4000}
          onClose={() => setNotice(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert severity={notice.severity} onClose={() => setNotice(null)} sx={{ maxWidth: 560 }}>
            {notice.text}
          </Alert>
        </Snackbar>
      )}
    </SettingsLayout>
  );
};

export default ModulesCatalogPage;
