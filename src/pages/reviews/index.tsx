import React from "react";
import {
  Alert,
  Box,
  IconButton,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import RefreshOutlined from "@mui/icons-material/RefreshOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink, useSearchParams } from "react-router";
import dayjs from "dayjs";

import { DateRangeField, PageHeader } from "../../components/ui";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useCan, useCanChecker } from "../../hooks/useCan";
import { usePermissions } from "../../hooks/usePermissions";
import { AccessDenied } from "../../components/rbac/AccessDenied";
import { getBranches } from "../../api/organization";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import type { ReviewPeriod } from "./tabs/filters";
import OverviewTab from "./tabs/OverviewTab";
import ReviewsTab from "./tabs/ReviewsTab";
import CasesTab from "./tabs/CasesTab";
import StaffTab from "./tabs/StaffTab";
import MapsTab from "./tabs/MapsTab";

const VIEW = ["reviews.view", "reviews.view_own"];

const TABS = [
  { key: "overview", label: "Обзор", perms: VIEW },
  { key: "reviews", label: "Отзывы", perms: VIEW },
  { key: "cases", label: "Разборы", perms: ["reviews.handle"] },
  { key: "staff", label: "Сотрудники", perms: VIEW },
  { key: "maps", label: "Карты", perms: ["reviews.handle"] },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const ReviewsPage: React.FC = () => {
  usePageTitle("Отзывы");
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { can } = useCanChecker();
  const canManage = useCan("reviews.manage");
  const {
    isSuperAdmin,
    activeOrganization,
    activeBranch,
    memberships,
    loading: permLoading,
  } = usePermissions();
  const isSuper = isSuperAdmin();
  const needsOrg = (isSuper || (memberships ?? []).length > 1) && !activeOrganization;
  const organizationId = isSuper ? activeOrganization?.id ?? undefined : undefined;

  const [from, setFrom] = React.useState(() => dayjs().startOf("month"));
  const [to, setTo] = React.useState(() => dayjs().endOf("month"));
  const [branchId, setBranchId] = React.useState<number | "">("");
  const [searchParams, setSearchParams] = useSearchParams();

  const visibleTabs = TABS.filter((t) => can([...t.perms]));
  const requested = searchParams.get("tab") as TabKey | null;
  const tab: TabKey = visibleTabs.find((t) => t.key === requested)?.key ?? visibleTabs[0]?.key ?? "overview";

  const branchesQuery = useQuery({
    queryKey: [...djangoQueryKeys.organization.branches, activeOrganization?.id ?? null],
    queryFn: () => getBranches(activeOrganization?.id),
    enabled: !permLoading && !needsOrg && !activeBranch,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const branches = branchesQuery.data ?? [];
  const multiBranch = !activeBranch && branches.length > 1;

  if (!permLoading && visibleTabs.length === 0) return <AccessDenied />;

  const period: ReviewPeriod = {
    from: from.format("YYYY-MM-DD"),
    to: to.format("YYYY-MM-DD"),
    branchId: branchId === "" ? undefined : branchId,
    organizationId,
  };
  const props = { period, multiBranch };

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader
        title="Отзывы"
        showTitle={false}
        showSearch={false}
        actions={
          <Stack direction="row" spacing={1} alignItems="center">
            <Tooltip title="Обновить">
              <IconButton
                size="small"
                onClick={() => queryClient.invalidateQueries({ queryKey: djangoQueryKeys.reviews.all })}
              >
                <RefreshOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
            {canManage && (
              <Tooltip title="Настройки модуля">
                <IconButton size="small" component={RouterLink} to="/reviews/settings">
                  <SettingsOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        }
      />

      {needsOrg ? (
        <Box sx={{ px: 3, pt: 2 }}>
          <Alert severity="info">Выберите организацию, чтобы увидеть отзывы.</Alert>
        </Box>
      ) : (
        <Box sx={{ flex: 1, overflow: "auto", px: theme.appLayout.page.paddingX, pb: 2 }}>
          <Stack direction="row" flexWrap="wrap" gap={1.5} alignItems="center" sx={{ my: 2 }}>
            <DateRangeField
              value={{ from, to }}
              onChange={(r) => {
                setFrom(r.from);
                setTo(r.to);
              }}
              minWidth={220}
            />
            {multiBranch && (
              <TextField
                select
                size="small"
                label="Филиал"
                value={branchId === "" ? "" : String(branchId)}
                onChange={(e) => setBranchId(e.target.value === "" ? "" : Number(e.target.value))}
                sx={{ minWidth: 180 }}
              >
                <MenuItem value="">Все филиалы</MenuItem>
                {branches.map((b) => (
                  <MenuItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </Stack>

          <Tabs
            value={tab}
            onChange={(_, value: TabKey) => setSearchParams({ tab: value }, { replace: true })}
            variant="scrollable"
            allowScrollButtonsMobile
            sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}
          >
            {visibleTabs.map((t) => (
              <Tab key={t.key} value={t.key} label={t.label} />
            ))}
          </Tabs>

          {tab === "overview" && <OverviewTab {...props} />}
          {tab === "reviews" && <ReviewsTab {...props} />}
          {tab === "cases" && <CasesTab {...props} />}
          {tab === "staff" && <StaffTab {...props} />}
          {tab === "maps" && <MapsTab {...props} />}
        </Box>
      )}
    </Box>
  );
};

export default ReviewsPage;
