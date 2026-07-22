import React from "react";
import {
  Autocomplete,
  Box,
  Button,
  Chip,
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
import { parseIpList } from "../../../utility/network";
import { PageHeader, AppCard } from "../../../components/ui";

/** Разбивает вставленный/введённый текст на отдельные IP и мержит с текущим списком. */
function mergeIpText(current: string[], text: string): string[] {
  const parts = parseIpList(text);
  if (parts.length === 0) return current;
  return Array.from(new Set([...current, ...parts]));
}

interface IpListFieldProps {
  label: string;
  helperText: string;
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  loading?: boolean;
}

/**
 * Мультизначное поле для IP/CIDR: можно вводить по одному (Enter/запятая)
 * или вставить сразу список (через запятую или с новой строки) — он
 * автоматически разложится на отдельные чипы.
 */
const IpListField: React.FC<IpListFieldProps> = ({
  label,
  helperText,
  value,
  onChange,
  disabled,
  loading,
}) => {
  const [inputValue, setInputValue] = React.useState("");

  return (
    <Autocomplete
      multiple
      freeSolo
      options={[]}
      value={value}
      inputValue={inputValue}
      disabled={disabled}
      onChange={(_, newValue) => onChange(newValue as string[])}
      onInputChange={(_, newInputValue, reason) => {
        if (reason === "input" && /[,\n]/.test(newInputValue)) {
          onChange(mergeIpText(value, newInputValue));
          setInputValue("");
          return;
        }
        setInputValue(newInputValue);
      }}
      renderTags={(tagValue, getTagProps) =>
        tagValue.map((option, index) => {
          const { key, ...tagProps } = getTagProps({ index });
          return (
            <Chip key={key} label={option} size="small" {...tagProps} />
          );
        })
      }
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder="Например: 89.123.45.6 или 10.0.0.0/24"
          helperText={helperText}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (/[,\n]/.test(text)) {
              e.preventDefault();
              onChange(mergeIpText(value, text));
            }
          }}
          InputProps={{
            ...params.InputProps,
            endAdornment: loading ? (
              <CircularProgress size={18} />
            ) : (
              params.InputProps.endAdornment
            ),
          }}
        />
      )}
    />
  );
};

const DjangoSkudSettingsPage: React.FC = () => {
  usePageTitle("Настройки СКУД");
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: djangoQueryKeys.attendance.officeIp,
    queryFn: ({ signal }) => getOfficeIp(signal),
    staleTime: 5 * 60 * 1000,
  });

  const [ips, setIps] = React.useState<string[]>([]);
  const [branchIps, setBranchIps] = React.useState<Record<number, string[]>>({});
  const [saving, setSaving] = React.useState(false);
  const loadedRef = React.useRef(false);
  const loading = query.isLoading;

  const branches = query.data?.branches ?? [];

  React.useEffect(() => {
    if (query.data && !loadedRef.current) {
      setIps(parseIpList(query.data.officeIp ?? ""));
      setBranchIps(
        Object.fromEntries(
          (query.data.branches ?? []).map((b) => [
            b.branchId,
            parseIpList(b.officeIp ?? ""),
          ]),
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
      const nextOrgIp = ips.join(", ");
      if (nextOrgIp !== (query.data.officeIp ?? "")) {
        await setOfficeIp(nextOrgIp);
      }
      for (const b of query.data.branches ?? []) {
        const next = (branchIps[b.branchId] ?? []).join(", ");
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
                <IpListField
                  label="Общий IP организации"
                  value={ips}
                  onChange={setIps}
                  disabled={loading || saving}
                  loading={loading}
                  helperText="Запасной вариант: используется вместе с IP филиалов. Можно добавить несколько адресов — вставьте список через запятую или с новой строки. Если ничего не заполнено — проверка отключена и смену можно начать откуда угодно."
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
                      совпадает с любым из IP филиала или с общим IP
                      организации. У филиала может быть несколько адресов
                      (например, разные Wi-Fi роутеры) — добавляйте их по
                      одному или вставьте списком.
                    </Typography>
                    <Stack spacing={2}>
                      {branches.map((b) => (
                        <IpListField
                          key={b.branchId}
                          label={b.branchName}
                          value={branchIps[b.branchId] ?? []}
                          onChange={(next) =>
                            setBranchIps((prev) => ({
                              ...prev,
                              [b.branchId]: next,
                            }))
                          }
                          disabled={loading || saving}
                          helperText="Например, IP основного и резервного Wi-Fi роутера филиала."
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
