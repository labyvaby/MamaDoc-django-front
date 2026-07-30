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
import { useApiOrgId } from "../../../hooks/useApiOrgId";
import { parseIpList } from "../../../utility/network";
import { PageHeader, AppCard } from "../../../components/ui";
import { useT } from "../../../i18n/VerticalProvider";

/** Разбивает вставленный/введённый текст на отдельные IP и мержит с текущим списком. */
function mergeIpText(current: string[], text: string): string[] {
  const parts = parseIpList(text);
  if (parts.length === 0) return current;
  return Array.from(new Set([...current, ...parts]));
}

interface IpListFieldProps {
  label: string;
  helperText: string;
  placeholder: string;
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
  placeholder,
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
          placeholder={placeholder}
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
  const { t } = useT("settings");
  usePageTitle(t("skud.pageTitle"));
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();
  const orgId = useApiOrgId();

  const query = useQuery({
    queryKey: djangoQueryKeys.attendance.officeIp(orgId),
    queryFn: ({ signal }) => getOfficeIp(orgId, signal),
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
        await setOfficeIp(nextOrgIp, undefined, orgId);
      }
      for (const b of query.data.branches ?? []) {
        const next = (branchIps[b.branchId] ?? []).join(", ");
        if (next !== (b.officeIp ?? "")) {
          await setOfficeIp(next, b.branchId, orgId);
        }
      }
      await queryClient.invalidateQueries({
        queryKey: djangoQueryKeys.attendance.officeIp(orgId),
      });
      notify?.({ type: "success", message: t("skud.saveSuccess") });
    } catch (e) {
      notify?.({
        type: "error",
        message: e instanceof Error ? e.message : t("skud.saveError"),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box
      sx={(theme) => ({
        height: {
          xs: `calc(100dvh - ${theme.appLayout.header.height.mobile}px)`,
          md: `calc(100dvh - ${theme.appLayout.header.height.desktop}px)`,
        },
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
      })}
    >
      <PageHeader title={t("skud.pageTitle")} showTitle={false} />

      <Box
        sx={(theme) => ({
          px: theme.appLayout.page.paddingX,
          pb: theme.appLayout.page.paddingY,
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
                  bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                }}
              >
                <RouterOutlinedIcon />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {t("skud.cardTitle")}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t("skud.cardSubtitle")}
                </Typography>
              </Box>
            </Stack>

            <Box sx={{ p: 2.5 }}>
              <Box component="form" noValidate autoComplete="off">
                <IpListField
                  label={t("skud.orgIpLabel")}
                  placeholder={t("skud.ipPlaceholder")}
                  value={ips}
                  onChange={setIps}
                  disabled={loading || saving}
                  loading={loading}
                  helperText={t("skud.orgIpHelper")}
                />

                {branches.length > 0 && (
                  <>
                    <Typography
                      variant="subtitle2"
                      sx={{ mt: 3, mb: 0.5, fontWeight: 700 }}
                    >
                      {t("skud.branchIpsTitle")}
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mb: 2 }}
                    >
                      {t("skud.branchIpsDescription")}
                    </Typography>
                    <Stack spacing={2}>
                      {branches.map((b) => (
                        <IpListField
                          key={b.branchId}
                          label={b.branchName}
                          placeholder={t("skud.ipPlaceholder")}
                          value={branchIps[b.branchId] ?? []}
                          onChange={(next) =>
                            setBranchIps((prev) => ({
                              ...prev,
                              [b.branchId]: next,
                            }))
                          }
                          disabled={loading || saving}
                          helperText={t("skud.branchIpHelper")}
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
                    sx={(theme) => ({ minHeight: theme.appLayout.controls.buttonHeight })}
                  >
                    {saving ? t("common:state.saving") : t("common:actions.save")}
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
