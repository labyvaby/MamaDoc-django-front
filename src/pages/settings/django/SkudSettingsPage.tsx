import React from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  CircularProgress,
  Container,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
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
      notify?.({ type: "success", message: "Настройки сохранены" });
    } catch (e) {
      notify?.({
        type: "error",
        message: e instanceof Error ? e.message : "Ошибка сохранения",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ height: "100%", overflowY: "auto" }}>
      <Container maxWidth="sm" sx={{ py: 3 }}>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>
          Настройки СКУД
        </Typography>
        <Card variant="outlined">
          <CardHeader
            title="Конфигурация интеграции"
            subheader="IP офиса для проверки начала смены"
          />
          <CardContent>
            {query.isLoading ? (
              <Stack alignItems="center" sx={{ py: 3 }}>
                <CircularProgress />
              </Stack>
            ) : (
              <Stack spacing={2}>
                <TextField
                  fullWidth
                  label="IP адрес офиса для проверки СКУД"
                  placeholder="Внешний IP офиса (например: 89.123.45.67)"
                  helperText="Сотрудники смогут начать смену только если их внешний IP совпадает с этим значением. Оставьте пустым, чтобы отключить проверку."
                  value={ip}
                  onChange={(e) => setIp(e.target.value)}
                />
                <Box>
                  <Button variant="contained" onClick={handleSave} disabled={saving}>
                    Сохранить
                  </Button>
                </Box>
              </Stack>
            )}
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
};

export default DjangoSkudSettingsPage;
