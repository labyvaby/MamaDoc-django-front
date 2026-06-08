import React from "react";
import {
  Alert,
  Avatar,
  Box,
  Card,
  CardContent,
  Skeleton,
  Stack,
  Typography,
  alpha,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "../../../components/ui";
import { usePageTitle } from "../../../hooks/usePageTitle";
import { usePermissions } from "../../../hooks/usePermissions";
import { useCan } from "../../../hooks/useCan";
import { AccessDenied } from "../../../components/rbac/AccessDenied";
import { getCashboxSummary } from "../../../api/cashbox";
import { djangoQueryKeys, DJANGO_DETAIL_STALE_TIME_MS } from "../../../api/queryKeys";

function formatKGS(value: number): string {
  return value.toLocaleString("ru-KG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " с";
}

const DjangoCashboxPage: React.FC = () => {
  usePageTitle("Касса");
  const theme = useTheme();
  const canView = useCan("finance.view");
  const { isSuperAdmin, activeOrganization, activeBranch, memberships, loading: permLoading } = usePermissions();
  const isSuper = isSuperAdmin();
  const isMultiOrg = (memberships ?? []).length > 1;
  const orgRequired = isSuper || isMultiOrg;
  const needsOrg = orgRequired && !activeOrganization;

  const filters = React.useMemo(() => {
    const f: Record<string, unknown> = {};
    if (isSuper && activeOrganization?.id) f.organizationId = activeOrganization.id;
    if (activeBranch?.id) f.branchId = activeBranch.id;
    return f;
  }, [isSuper, activeOrganization?.id, activeBranch?.id]);

  const summaryQuery = useQuery({
    queryKey: djangoQueryKeys.cashbox.summary(filters),
    queryFn: ({ signal }) => getCashboxSummary(
      {
        organizationId: isSuper ? (activeOrganization?.id ?? undefined) : undefined,
        branchId: activeBranch?.id ?? undefined,
      },
      signal,
    ),
    enabled: !permLoading && canView && !needsOrg,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    refetchInterval: !permLoading && canView && !needsOrg ? 60_000 : false,
  });

  if (!permLoading && !canView) return <AccessDenied />;

  const s = summaryQuery.data;
  const cashBalance = s
    ? parseFloat(s.cashIncome) - parseFloat(s.cashRefunds) - parseFloat(s.cashExpenses)
    : null;

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader title="Касса" showTitle={false} showSearch={false} />

      {needsOrg && (
        <Box sx={{ px: 3, pt: 2 }}>
          <Alert severity="info">Выберите организацию, чтобы просмотреть данные кассы.</Alert>
        </Box>
      )}

      {!needsOrg && (
        <Box
          sx={{
            px: theme.appLayout.page.paddingX,
            flex: 1,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            overflow: "hidden",
          }}
        >
          <Card
            elevation={0}
            sx={{
              width: "100%",
              maxWidth: 400,
              background: `linear-gradient(145deg, ${theme.palette.success.main} 0%, ${theme.palette.success.dark} 100%)`,
              borderRadius: 6,
              boxShadow: `0 24px 80px ${alpha(theme.palette.success.main, 0.35)}`,
              color: "white",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Декоративные круги */}
            <Box sx={{ position: "absolute", top: -80, right: -80, width: 220, height: 220, borderRadius: "50%", background: alpha("#fff", 0.08) }} />
            <Box sx={{ position: "absolute", bottom: -60, left: -60, width: 180, height: 180, borderRadius: "50%", background: alpha("#fff", 0.05) }} />
            <Box sx={{ position: "absolute", top: "50%", right: -40, width: 100, height: 100, borderRadius: "50%", background: alpha("#fff", 0.03) }} />

            <CardContent sx={{ p: 4, position: "relative", zIndex: 1 }}>
              <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 4 }}>
                <Avatar sx={{ width: 60, height: 60, bgcolor: alpha("#fff", 0.2), backdropFilter: "blur(10px)" }}>
                  <AccountBalanceWalletIcon sx={{ fontSize: 30, color: "white" }} />
                </Avatar>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: 0.5 }}>
                    Касса
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.7 }}>
                    Баланс наличных
                  </Typography>
                </Box>
              </Stack>

              <Box sx={{ textAlign: "center", mb: 4 }}>
                {summaryQuery.isLoading ? (
                  <Skeleton
                    variant="text"
                    width="60%"
                    height={70}
                    sx={{ bgcolor: alpha("#fff", 0.2), mx: "auto" }}
                  />
                ) : (
                  <Typography
                    variant="h2"
                    fontWeight={900}
                    sx={{ textShadow: "0 4px 20px rgba(0,0,0,0.15)", letterSpacing: -1 }}
                  >
                    {formatKGS(cashBalance ?? 0)}
                  </Typography>
                )}
              </Box>
            </CardContent>
          </Card>
        </Box>
      )}
    </Box>
  );
};

export default DjangoCashboxPage;
