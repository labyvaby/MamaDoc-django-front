import React from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  CircularProgress,
  TextField,
  Typography,
} from "@mui/material";
import SaveOutlined from "@mui/icons-material/SaveOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";

import { usePageTitle } from "../../../hooks/usePageTitle";
import { getOfficeIp, setOfficeIp } from "../../../api/attendance";
import { djangoQueryKeys } from "../../../api/queryKeys";

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
  const [saving, setSaving] = React.useState(false);
  const loadedRef = React.useRef(false);
  const loading = query.isLoading;

  React.useEffect(() => {
    if (query.data && !loadedRef.current) {
      setIp(query.data.officeIp ?? "");
      loadedRef.current = true;
    }
  }, [query.data]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setOfficeIp(ip.trim());
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
    <Box sx={{ p: 3, maxWidth: 800, mx: "auto", height: "100%", overflowY: "auto" }}>
      <Typography variant="h4" gutterBottom fontWeight={700}>
        Настройки СКУД
      </Typography>

      <Card>
        <CardHeader
          title="Конфигурация интеграции"
          subheader="Настройте параметры подключения к системе контроля доступа"
        />
        <CardContent>
          <Box component="form" noValidate autoComplete="off">
            <TextField
              fullWidth
              label="IP адрес офиса для проверки СКУД"
              placeholder="Введите внешний IP адрес офиса (например: 89.123.456.78)"
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              disabled={loading || saving}
              helperText="Сотрудники смогут начать смену только если их внешний IP совпадает с этим значением. Оставьте пустым, чтобы отключить проверку."
              margin="normal"
            />

            <Box sx={{ mt: 3, display: "flex", justifyContent: "flex-end" }}>
              <Button
                variant="contained"
                startIcon={
                  saving ? (
                    <CircularProgress size={20} color="inherit" />
                  ) : (
                    <SaveOutlined />
                  )
                }
                onClick={handleSave}
                disabled={loading || saving}
              >
                {saving ? "Сохранение..." : "Сохранить"}
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default DjangoSkudSettingsPage;
