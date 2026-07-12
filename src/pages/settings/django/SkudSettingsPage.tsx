import React from "react";
import {
  Box,
  Button,
  CircularProgress,
  Stack,
  TextField,
  Typography,
  alpha,
} from "@mui/material";
import SaveOutlined from "@mui/icons-material/SaveOutlined";
import RouterOutlinedIcon from "@mui/icons-material/RouterOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";

import { usePageTitle } from "../../../hooks/usePageTitle";
import { getOfficeIp, setOfficeIp } from "../../../api/attendance";
import { djangoQueryKeys } from "../../../api/queryKeys";
import { PageHeader, AppCard } from "../../../components/ui";

const DjangoSkudSettingsPage: React.FC = () => {
  usePageTitle("Настройки СКУД");
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: djangoQueryKeys.attendance.officeIp,
    queryFn: ({ signal }) => getOfficeIp(signal),
    staleTime: 5 * 60 * 1000,
  });

  const [ip, setIp] = React.useState("");
  const [branchIps, setBranchIps] = React.useState<Record<number, string>>({});
  const [saving, setSaving] = React.useState(false);
  const loadedRef = React.useRef(false);
  const loading = query.isLoading;

  const branches = query.data?.branches ?? [];

  React.useEffect(() => {
    if (query.data && !loadedRef.current) {
      setIp(query.data.officeIp ?? "");
      setBranchIps(
        Object.fromEntries(
          (query.data.branches ?? []).map((b) => [b.branchId, b.officeIp ?? ""]),
        ),
      );
      loadedRef.current = true;
    }
  }, [query.data]);

  const handleSave = async () => {
    if (!query.data) return;
    setSaving(true);
    try {
      // Сохраняем только изменённые значения (общий IP + IP филиалов).
      if (ip.trim() !== (query.data.officeIp ?? "")) {
        await setOfficeIp(ip.trim());
      }
      for (const b of query.data.branches ?? []) {
        const next = (branchIps[b.branchId] ?? "").trim();
        if (next !== (b.officeIp ?? "")) {
          await setOfficeIp(next, b.branchId);
        }
      }
      await queryClient.invalidateQueries({
        queryKey: djangoQueryKeys.attendance.officeIp,
      });
      notify?.({ type: "success", message: "Настройки успешно сохранены" });
    } catch (e) {
      notify?.({
        type: "error",
        message: e instanceof Error ? e.message : "Ошибка при сохранении настроек",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box
      sx={(t) => ({
        height: {
          xs: `calc(100dvh - ${t.appLayout.header.height.mobile}px)`,
          md: `calc(100dvh - ${t.appLayout.header.height.desktop}px)`,
        },
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
      })}
    >
      <PageHeader title="Настройки СКУД" showTitle={false} />

      <Box
        sx={(t) => ({
          px: t.appLayout.page.paddingX,
          pb: t.appLayout.page.paddingY,
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
        })}
      >
        <Box sx={{ maxWidth: 720, mx: "auto" }}>
          <AppCard
            variant="outlined"
            sx={{ borderRadius: "14px", "&:hover": { boxShadow: "none" } }}
            disableContentPadding
          >
            {/* Шапка карточки с иконкой-героем */}
            <Stack
              direction="row"
              spacing={2}
              alignItems="center"
              sx={{ p: 2.5, borderBottom: 1, borderColor: "divider" }}
            >
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 1,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "primary.onSurface",
                  bgcolor: (t) => alpha(t.palette.primary.main, 0.1),
                }}
              >
                <RouterOutlinedIcon />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Конфигурация интеграции
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Параметры подключения к системе контроля доступа
                </Typography>
              </Box>
            </Stack>

            <Box sx={{ p: 2.5 }}>
              <Box component="form" noValidate autoComplete="off">
                <TextField
                  fullWidth
                  label="Общий IP организации"
                  placeholder="Например: 89.123.456.78"
                  value={ip}
                  onChange={(e) => setIp(e.target.value)}
                  disabled={loading || saving}
                  helperText="Запасной вариант: используется вместе с IP филиалов. Если ни один IP не заполнен — проверка отключена и смену можно начать откуда угодно."
                  InputProps={{
                    endAdornment: loading ? <CircularProgress size={18} /> : null,
                  }}
                />

                {branches.length > 0 && (
                  <>
                    <Typography
                      variant="subtitle2"
                      sx={{ mt: 3, mb: 0.5, fontWeight: 700 }}
                    >
                      Wi-Fi IP по филиалам
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mb: 2 }}
                    >
                      Сотрудник сможет начать смену, если его внешний IP
                      совпадает с IP любого филиала или с общим IP организации.
                    </Typography>
                    <Stack spacing={2}>
                      {branches.map((b) => (
                        <TextField
                          key={b.branchId}
                          fullWidth
                          label={b.branchName}
                          placeholder="Например: 89.123.456.78"
                          value={branchIps[b.branchId] ?? ""}
                          onChange={(e) =>
                            setBranchIps((prev) => ({
                              ...prev,
                              [b.branchId]: e.target.value,
                            }))
                          }
                          disabled={loading || saving}
                        />
                      ))}
                    </Stack>
                  </>
                )}

                <Box sx={{ mt: 3, display: "flex", justifyContent: "flex-end" }}>
                  <Button
                    variant="contained"
                    startIcon={
                      saving ? (
                        <CircularProgress size={18} color="inherit" />
                      ) : (
                        <SaveOutlined />
                      )
                    }
                    onClick={handleSave}
                    disabled={loading || saving}
                    sx={(t) => ({ minHeight: t.appLayout.controls.buttonHeight })}
                  >
                    {saving ? "Сохранение..." : "Сохранить"}
                  </Button>
                </Box>
              </Box>
            </Box>
          </AppCard>
        </Box>
      </Box>
    </Box>
  );
};

export default DjangoSkudSettingsPage;
