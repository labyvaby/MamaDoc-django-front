import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import AddOutlined from "@mui/icons-material/AddOutlined";

import { useModulesCatalog } from "../../hooks/useModulesCatalog";
import { MODULE_SETTINGS_ROUTE, moduleIcon } from "../../config/moduleCatalogMeta";
import { CATEGORY_LABELS, groupByCategory } from "../../config/moduleCatalogGrouping";

const ModulesCatalogPage: React.FC = () => {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useModulesCatalog();
  const [stubOpen, setStubOpen] = useState(false);

  const groups = useMemo(() => groupByCategory(data ?? []), [data]);
  const connectedCount = (data ?? []).filter((m) => m.isEnabled).length;
  const availableCount = (data ?? []).length - connectedCount;

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (isError) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        Не удалось загрузить каталог модулей. Обновите страницу.
      </Alert>
    );
  }

  return (
    <Box sx={{ height: "100%", overflowY: "auto", minHeight: 0 }}>
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 900, mx: "auto" }}>
      <Typography variant="h5" sx={{ fontWeight: 500 }}>
        Модули
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 3 }}>
        Всё, что можно подключить к вашей CRM. Подключено {connectedCount} · доступно ещё {availableCount}
      </Typography>

      {groups.map(([category, modules]) => (
        <Box key={category} sx={{ mb: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 500, mb: 1.5 }}>
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

                    {m.isEnabled ? (
                      settingsRoute ? (
                        <Button size="small" onClick={() => navigate(settingsRoute)}>
                          Настроить
                        </Button>
                      ) : null
                    ) : (
                      <Button
                        size="small"
                        startIcon={<AddOutlined />}
                        onClick={() => setStubOpen(true)}
                      >
                        Подключить
                      </Button>
                    )}
                  </Stack>
                </Card>
              );
            })}
          </Box>
        </Box>
      ))}

      <Snackbar
        open={stubOpen}
        autoHideDuration={4000}
        onClose={() => setStubOpen(false)}
        message="Скоро — обратитесь к вашему менеджеру, чтобы подключить модуль"
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Box>
    </Box>
  );
};

export default ModulesCatalogPage;
