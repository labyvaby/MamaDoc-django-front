import React from "react";
import {
  Alert,
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
import { useActiveScope } from "../../../hooks/useActiveScope";
import { getOfficeIp, setOfficeIp } from "../../../api/attendance";
import { djangoQueryKeys } from "../../../api/queryKeys";
import { parseIpList } from "../../../utility/network";
import { AppCard } from "../../../components/ui";
import { useT } from "../../../i18n/VerticalProvider";
import { SettingsLayout } from "../SettingsLayout";
import { mergeIpText, planOfficeIpSave } from "./officeIpSave";

interface IpListFieldProps {
  label: string;
  helperText: string;
  placeholder: string;
  value: string[];
  onChange: (next: string[]) => void;
  /**
   * Набранный, но ещё не подтверждённый Enter'ом текст. Живёт у родителя:
   * «Сохранить» обязано видеть его независимо от того, успел ли сработать
   * blur, иначе введённый IP молча теряется и PATCH не уходит вовсе.
   */
  inputValue: string;
  onInputValueChange: (next: string) => void;
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
  inputValue,
  onInputValueChange,
  disabled,
  loading,
}) => {
  /** Превращает набранный текст в чип — по потере фокуса, а не только по Enter. */
  const commitInput = () => {
    if (!inputValue.trim()) return;
    onChange(mergeIpText(value, inputValue));
    onInputValueChange("");
  };

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
          onInputValueChange("");
          return;
        }
        onInputValueChange(newInputValue);
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
          // InputBase дёргает и props.onBlur, и params.inputProps.onBlur,
          // так что собственный blur Autocomplete не перетирается.
          onBlur={commitInput}
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
  const scope = useActiveScope();

  const query = useQuery({
    queryKey: [
      ...djangoQueryKeys.attendance.officeIp,
      scope.organizationId ?? null,
    ],
    queryFn: ({ signal }) =>
      getOfficeIp({ organizationId: scope.organizationId }, signal),
    staleTime: 5 * 60 * 1000,
    enabled: scope.orgReady,
  });

  const [ips, setIps] = React.useState<string[]>([]);
  const [branchIps, setBranchIps] = React.useState<Record<number, string[]>>({});
  // Недобранный текст полей. Сбрасывается вместе со скоупом, иначе набранный
  // в одной организации адрес утёк бы в форму другой при переключении.
  const [orgIpInput, setOrgIpInput] = React.useState("");
  const [branchIpInputs, setBranchIpInputs] = React.useState<
    Record<number, string>
  >({});
  const [saving, setSaving] = React.useState(false);
  const loadedScopeRef = React.useRef<number | "session" | null>(null);
  const loading = query.isLoading || !scope.orgReady;

  const branches = query.data?.branches ?? [];

  React.useEffect(() => {
    const scopeKey = scope.organizationId ?? "session";
    if (query.data && loadedScopeRef.current !== scopeKey) {
      setIps(parseIpList(query.data.officeIp ?? ""));
      setBranchIps(
        Object.fromEntries(
          (query.data.branches ?? []).map((b) => [
            b.branchId,
            parseIpList(b.officeIp ?? ""),
          ]),
        ),
      );
      setOrgIpInput("");
      setBranchIpInputs({});
      loadedScopeRef.current = scopeKey;
    }
  }, [query.data, scope.organizationId]);

  const handleSave = async () => {
    if (!query.data) {
      notify?.({ type: "error", message: t("skud.loadError") });
      return;
    }
    // Недобранный текст полей — тоже часть значения, см. planOfficeIpSave.
    const plan = planOfficeIpSave(
      {
        ips,
        ipsInput: orgIpInput,
        branchIps,
        branchIpsInput: branchIpInputs,
      },
      {
        officeIp: query.data.officeIp ?? "",
        branches: (query.data.branches ?? []).map((b) => ({
          branchId: b.branchId,
          officeIp: b.officeIp ?? "",
        })),
      },
    );

    setSaving(true);
    try {
      // Сохраняем только изменённые значения (общий IP + IP филиалов).
      if (plan.orgIp !== null) {
        await setOfficeIp(plan.orgIp, {
          organizationId: scope.organizationId,
        });
      }
      for (const branch of plan.branches) {
        await setOfficeIp(branch.officeIp, {
          organizationId: scope.organizationId,
          branchId: branch.branchId,
        });
      }
      // Отправленное и есть новое состояние формы — чипы уже без «хвоста».
      setIps(plan.nextIps);
      setBranchIps((prev) => ({ ...prev, ...plan.nextBranchIps }));
      setOrgIpInput("");
      setBranchIpInputs({});
      await queryClient.invalidateQueries({
        queryKey: djangoQueryKeys.attendance.officeIp,
      });
      const changed = plan.orgIp !== null || plan.branches.length > 0;
      notify?.({
        type: "success",
        message: changed ? t("skud.saveSuccess") : t("skud.saveNoChanges"),
      });
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
    <SettingsLayout>
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
                {query.isError && (
                  <Alert
                    severity="error"
                    action={
                      <Button color="inherit" size="small" onClick={() => query.refetch()}>
                        {t("common:actions.retry")}
                      </Button>
                    }
                    sx={{ mb: 2 }}
                  >
                    {query.error instanceof Error
                      ? query.error.message
                      : t("skud.loadError")}
                  </Alert>
                )}
                <IpListField
                  label={t("skud.orgIpLabel")}
                  placeholder={t("skud.ipPlaceholder")}
                  value={ips}
                  onChange={setIps}
                  inputValue={orgIpInput}
                  onInputValueChange={setOrgIpInput}
                  disabled={loading || saving || query.isError}
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
                          inputValue={branchIpInputs[b.branchId] ?? ""}
                          onInputValueChange={(next) =>
                            setBranchIpInputs((prev) => ({
                              ...prev,
                              [b.branchId]: next,
                            }))
                          }
                          disabled={loading || saving || query.isError}
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
                    disabled={loading || saving || query.isError}
                    sx={(theme) => ({ minHeight: theme.appLayout.controls.buttonHeight })}
                  >
                    {saving ? t("common:state.saving") : t("common:actions.save")}
                  </Button>
                </Box>
              </Box>
            </Box>
          </AppCard>
      </Box>
    </SettingsLayout>
  );
};

export default DjangoSkudSettingsPage;
