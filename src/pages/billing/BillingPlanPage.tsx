import React from "react";
import {
  Alert, Box, Chip, CircularProgress, Divider, LinearProgress, Paper, Stack,
  Switch, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Typography,
} from "@mui/material";
import { useNotification } from "@refinedev/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import { getErrorMessage } from "../../api/client";
import { tenancyApi } from "../../api/tenancy";
import { PageHeader } from "../../components/ui";
import { useActiveScope } from "../../hooks/useActiveScope";
import { useCan } from "../../hooks/useCan";
import { usePageTitle } from "../../hooks/usePageTitle";

const money = (value: unknown) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: "KGS", maximumFractionDigits: 2 }).format(Number(value ?? 0));
const date = (value: string | null | undefined) => value ? dayjs(value).format("DD.MM.YYYY") : "—";

function Usage({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const percent = limit == null || limit <= 0 ? 0 : Math.min(100, used / limit * 100);
  const danger = limit != null && used >= limit;
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" spacing={2}><Typography color="text.secondary">{label}</Typography><Typography fontWeight={750} color={danger ? "error.main" : "text.primary"}>{used} / {limit ?? "∞"}</Typography></Stack>
      {limit != null && <LinearProgress variant="determinate" value={percent} color={danger ? "error" : percent >= 80 ? "warning" : "primary"} sx={{ height: 7, borderRadius: 4, mt: 0.75 }} />}
    </Box>
  );
}

export default function BillingPlanPage() {
  usePageTitle("Тариф и модули");
  const { organizationId, isReady, orgReady } = useActiveScope();
  const canManage = useCan("tenancy.modules.manage");
  const queryClient = useQueryClient();
  const { open: notify } = useNotification();
  const enabled = isReady && orgReady && organizationId != null;
  const baseKey = ["django", "tenancy", organizationId ?? null] as const;

  const planQuery = useQuery({ queryKey: [...baseKey, "plan"], queryFn: () => tenancyApi.plan(organizationId), enabled });
  const historyQuery = useQuery({ queryKey: [...baseKey, "history"], queryFn: () => tenancyApi.planHistory(organizationId), enabled });
  const catalogQuery = useQuery({ queryKey: [...baseKey, "catalog"], queryFn: tenancyApi.modules, enabled });
  const modulesQuery = useQuery({ queryKey: [...baseKey, "modules"], queryFn: () => tenancyApi.organizationModules(organizationId!), enabled });

  const updateMutation = useMutation({
    mutationFn: (enabledModules: string[]) => tenancyApi.updateOrganizationModules(organizationId!, enabledModules),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: baseKey });
      notify?.({ type: "success", message: "Набор модулей обновлён" });
    },
    onError: (error) => notify?.({ type: "error", message: "Модули не обновлены", description: getErrorMessage(error) }),
  });

  const rows = React.useMemo(() => {
    const orgByCode = new Map((modulesQuery.data ?? []).map((item) => [item.moduleCode, item]));
    const catalog = catalogQuery.data ?? [];
    const merged = catalog.map((item) => ({ code: item.code, name: item.name, description: item.description, category: item.category, enabled: orgByCode.get(item.code)?.isEnabled ?? false }));
    for (const item of modulesQuery.data ?? []) if (!merged.some((row) => row.code === item.moduleCode)) merged.push({ code: item.moduleCode, name: item.moduleName, description: item.notes, category: item.moduleCategory, enabled: item.isEnabled });
    return merged;
  }, [catalogQuery.data, modulesQuery.data]);

  const toggle = (code: string, checked: boolean) => {
    const current = rows.filter((item) => item.enabled).map((item) => item.code);
    updateMutation.mutate(checked ? Array.from(new Set([...current, code])) : current.filter((item) => item !== code));
  };
  const loading = planQuery.isLoading || historyQuery.isLoading || catalogQuery.isLoading || modulesQuery.isLoading;

  return (
    <Box sx={{ pb: 4 }}>
      <PageHeader title="Тариф и модули" showTitle={false} loading={loading} />
      <Box sx={(theme) => ({ px: theme.appLayout.page.paddingX })}>
        {loading && <LinearProgress sx={{ mb: 2, borderRadius: 2 }} />}
        {planQuery.isError && <Alert severity="warning" sx={{ mb: 2 }}>{getErrorMessage(planQuery.error, "Тариф для организации ещё не настроен")}</Alert>}
        {planQuery.data && <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={2}>
            <Box><Stack direction="row" spacing={1} alignItems="center"><Typography variant="h5" fontWeight={820}>{planQuery.data.planName}</Typography><Chip size="small" color={planQuery.data.status === "active" ? "success" : "warning"} label={planQuery.data.status === "active" ? "Активен" : planQuery.data.status} /></Stack><Typography color="text.secondary">Период: {date(planQuery.data.currentPeriodStart)} — {date(planQuery.data.currentPeriodEnd)}</Typography></Box>
            <Typography variant="overline" color="text.secondary">{planQuery.data.planCode}</Typography>
          </Stack>
          <Divider sx={{ my: 2.5 }} />
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 3 }}>
            <Usage label="Клиенты" used={planQuery.data.clientsUsed} limit={planQuery.data.maxClients} />
            <Usage label="Сотрудники" used={planQuery.data.staffUsed} limit={planQuery.data.maxStaff} />
            <Usage label="SMS в этом месяце" used={planQuery.data.smsUsedThisMonth} limit={planQuery.data.maxSmsPerMonth} />
          </Box>
        </Paper>}

        <Typography variant="h6" fontWeight={800} sx={{ mt: 3, mb: 1.5 }}>Модули организации</Typography>
        {(catalogQuery.isError || modulesQuery.isError) && <Alert severity="error">Не удалось загрузить доступные модули.</Alert>}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" }, gap: 1.5 }}>
          {rows.map((item) => <Paper key={item.code} variant="outlined" sx={{ p: 2, borderRadius: 2.5 }}><Stack direction="row" spacing={2} alignItems="center"><Box sx={{ flex: 1 }}><Typography fontWeight={750}>{item.name}</Typography><Typography variant="body2" color="text.secondary">{item.description || item.category}</Typography></Box><Switch checked={item.enabled} disabled={!canManage || updateMutation.isPending} onChange={(_, checked) => toggle(item.code, checked)} inputProps={{ "aria-label": `${item.name}: ${item.enabled ? "включён" : "выключен"}` }} /></Stack></Paper>)}
          {!loading && !rows.length && <Alert severity="info">Для этой организации модули не назначены.</Alert>}
        </Box>

        <Typography variant="h6" fontWeight={800} sx={{ mt: 3, mb: 1.5 }}>История списаний за тариф</Typography>
        {historyQuery.isError && <Alert severity="error">История списаний не загрузилась.</Alert>}
        <TableContainer component={Paper} variant="outlined"><Table size="small"><TableHead><TableRow><TableCell>Тариф</TableCell><TableCell>Период</TableCell><TableCell>Дата списания</TableCell><TableCell align="right">Сумма</TableCell></TableRow></TableHead><TableBody>{(historyQuery.data ?? []).map((item) => <TableRow key={item.id} hover><TableCell>{item.planCode}</TableCell><TableCell>{date(item.periodStart)} — {date(item.periodEnd)}</TableCell><TableCell>{date(item.chargedAt)}</TableCell><TableCell align="right" sx={{ fontWeight: 750 }}>{money(item.amount)}</TableCell></TableRow>)}{!historyQuery.isLoading && !(historyQuery.data?.length) && <TableRow><TableCell colSpan={4} align="center" sx={{ py: 5, color: "text.secondary" }}>Списаний по тарифу пока нет.</TableCell></TableRow>}</TableBody></Table></TableContainer>
        {updateMutation.isPending && <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2 }}><CircularProgress size={18} /><Typography color="text.secondary">Обновляем доступы…</Typography></Stack>}
      </Box>
    </Box>
  );
}

