import React from "react";
import {
  Alert,
  Box,
  Button,
  LinearProgress,
  Paper,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import { Link as RouterLink } from "react-router";
import { motion, useReducedMotion } from "framer-motion";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import EditNoteOutlined from "@mui/icons-material/EditNoteOutlined";
import EventAvailableOutlined from "@mui/icons-material/EventAvailableOutlined";
import AutoAwesomeOutlined from "@mui/icons-material/AutoAwesomeOutlined";
import AdminPanelSettingsOutlined from "@mui/icons-material/AdminPanelSettingsOutlined";

import { getErrorMessage } from "../../api/client";
import {
  getAppointmentPaymentSettings,
  updateAppointmentPaymentSettings,
  type AppointmentPaymentSettings,
} from "../../api/payments";
import { djangoQueryKeys } from "../../api/queryKeys";
import { cascadeContainer, cascadeItem } from "../../components/ui/motionPresets";
import { useCan } from "../../hooks/useCan";
import { usePermissions } from "../../hooks/usePermissions";
import { useT } from "../../i18n/VerticalProvider";
import { SettingsLayout } from "./SettingsLayout";

type SettingKey = keyof AppointmentPaymentSettings;

const MotionBox = motion.create(Box);

/**
 * «Оплаты приёмов»: три переключателя модуля истории оплат организации.
 * Права сотрудников (правка, «за прошлые дни») выдаются в ролях.
 */
export default function AppointmentPaymentsSettingsPage() {
  const { t } = useT("appointments");
  const theme = useTheme();
  const reduceMotion = useReducedMotion() ?? false;
  const queryClient = useQueryClient();
  const { open: notify } = useNotification();
  const auth = usePermissions();
  const orgId = auth.activeOrganization?.id ?? null;
  const canManage = useCan("organization.update");
  const [pendingKey, setPendingKey] = React.useState<SettingKey | null>(null);
  const [error, setError] = React.useState("");

  const settings = useQuery({
    queryKey: djangoQueryKeys.appointments.paymentSettings(orgId),
    queryFn: ({ signal }) => getAppointmentPaymentSettings(signal),
    enabled: orgId != null,
  });

  const toggle = async (key: SettingKey, value: boolean) => {
    if (pendingKey) return;
    setPendingKey(key);
    setError("");
    const previous = settings.data;
    // Оптимистично: переключатель отзывается сразу, при ошибке откатываем.
    if (previous) {
      queryClient.setQueryData(djangoQueryKeys.appointments.paymentSettings(orgId), {
        ...previous,
        [key]: value,
      });
    }
    try {
      const next = await updateAppointmentPaymentSettings({ [key]: value });
      queryClient.setQueryData(djangoQueryKeys.appointments.paymentSettings(orgId), next);
      // Карточки приёмов читают настройки из сводки оплат — пусть перечитают.
      void queryClient.invalidateQueries({ queryKey: ["django", "appointments"] });
      notify?.({ type: "success", message: t("paymentHistory.settingsPage.saved") });
    } catch (e) {
      if (previous) {
        queryClient.setQueryData(djangoQueryKeys.appointments.paymentSettings(orgId), previous);
      }
      setError(getErrorMessage(e, t("paymentHistory.settingsPage.saveError")));
    } finally {
      setPendingKey(null);
    }
  };

  const rows: {
    key: SettingKey;
    icon: React.ReactNode;
    title: string;
    hint: string;
    dependsOnHistory: boolean;
  }[] = [
    {
      key: "historyEnabled",
      icon: <ReceiptLongOutlined />,
      title: t("paymentHistory.settingsPage.history.title"),
      hint: t("paymentHistory.settingsPage.history.hint"),
      dependsOnHistory: false,
    },
    {
      key: "editingEnabled",
      icon: <EditNoteOutlined />,
      title: t("paymentHistory.settingsPage.editing.title"),
      hint: t("paymentHistory.settingsPage.editing.hint"),
      dependsOnHistory: true,
    },
    {
      key: "sameDayOnly",
      icon: <EventAvailableOutlined />,
      title: t("paymentHistory.settingsPage.sameDay.title"),
      hint: t("paymentHistory.settingsPage.sameDay.hint"),
      dependsOnHistory: false,
    },
  ];

  const data = settings.data;

  return (
    <SettingsLayout>
      <MotionBox
        variants={cascadeContainer}
        initial={reduceMotion ? false : "hidden"}
        animate="show"
        sx={{ display: "flex", flexDirection: "column", gap: 2.5, p: { xs: 0, md: 1 }, maxWidth: 860 }}
      >
        <MotionBox variants={cascadeItem}>
          <Typography variant="h5" fontWeight={700}>
            {t("paymentHistory.settingsPage.title")}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            {t("paymentHistory.settingsPage.intro")}
          </Typography>
        </MotionBox>

        {settings.isFetching && <LinearProgress />}
        {error && <Alert severity="error">{error}</Alert>}
        {!canManage && <Alert severity="info">{t("paymentHistory.settingsPage.readOnly")}</Alert>}

        <MotionBox variants={cascadeItem}>
          <Paper variant="outlined" sx={{ borderRadius: "16px", overflow: "hidden" }}>
            {rows.map((row, index) => {
              const checked = data ? data[row.key] : false;
              const disabledByHistory = row.dependsOnHistory && data != null && !data.historyEnabled;
              return (
                <Box
                  key={row.key}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "40px minmax(0, 1fr) auto",
                    columnGap: 1.75,
                    alignItems: "center",
                    px: { xs: 1.75, md: 2.25 },
                    py: 1.75,
                    borderTop: index === 0 ? "none" : "1px solid",
                    borderColor: "divider",
                    opacity: disabledByHistory ? 0.6 : 1,
                    transition: "opacity .2s ease, background-color .2s ease",
                    bgcolor: checked && !disabledByHistory ? alpha(theme.palette.primary.main, 0.035) : "transparent",
                  }}
                >
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: "12px",
                      display: "grid",
                      placeItems: "center",
                      color: checked ? "primary.main" : "text.secondary",
                      bgcolor: alpha(checked ? theme.palette.primary.main : theme.palette.text.primary, checked ? 0.12 : 0.05),
                      transition: "all .25s ease",
                    }}
                  >
                    {row.icon}
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle2" fontWeight={700}>
                      {row.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                      {row.hint}
                    </Typography>
                  </Box>
                  <Switch
                    checked={checked}
                    disabled={!data || !canManage || pendingKey != null || disabledByHistory}
                    onChange={(_, value) => void toggle(row.key, value)}
                    inputProps={{ "aria-label": row.title }}
                  />
                </Box>
              );
            })}
          </Paper>
        </MotionBox>

        <MotionBox
          variants={cascadeItem}
          sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}
        >
          <Paper variant="outlined" sx={{ borderRadius: "16px", p: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <AutoAwesomeOutlined fontSize="small" color="secondary" />
              <Typography variant="subtitle2" fontWeight={700}>
                {t("paymentHistory.settingsPage.rules.title")}
              </Typography>
            </Stack>
            <Stack spacing={0.75} component="ul" sx={{ m: 0, pl: 2.25 }}>
              {(["prepaid", "debt", "repay"] as const).map((key) => (
                <Typography key={key} component="li" variant="body2" color="text.secondary">
                  {t(`paymentHistory.settingsPage.rules.${key}`)}
                </Typography>
              ))}
            </Stack>
          </Paper>
          <Paper variant="outlined" sx={{ borderRadius: "16px", p: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <AdminPanelSettingsOutlined fontSize="small" color="primary" />
              <Typography variant="subtitle2" fontWeight={700}>
                {t("paymentHistory.settingsPage.permissions.title")}
              </Typography>
            </Stack>
            <Stack spacing={0.75} component="ul" sx={{ m: 0, pl: 2.25 }}>
              <Typography component="li" variant="body2" color="text.secondary">
                {t("paymentHistory.settingsPage.permissions.edit")}
              </Typography>
              <Typography component="li" variant="body2" color="text.secondary">
                {t("paymentHistory.settingsPage.permissions.anyDay")}
              </Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
              {t("paymentHistory.settingsPage.permissions.hint")}
            </Typography>
            <Button component={RouterLink} to="/settings/roles" size="small" sx={{ mt: 1, textTransform: "none", px: 1 }}>
              {t("paymentHistory.settingsPage.permissions.rolesLink")}
            </Button>
          </Paper>
        </MotionBox>
      </MotionBox>
    </SettingsLayout>
  );
}
