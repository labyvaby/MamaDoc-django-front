import React from "react";
import { Alert, Box, Stack } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";

import { getCollections } from "../../api/retailAnalytics";
import { SegmentedTabs, type SegmentedTab } from "../../components/ui";
import { useActiveScope } from "../../hooks/useActiveScope";
import { usePageTitle } from "../../hooks/usePageTitle";
import { usePermissions } from "../../hooks/usePermissions";
import { CollectionsTab } from "./analytics/CollectionsTab";
import { MatrixGapsTab } from "./analytics/MatrixGapsTab";
import { OverviewTab } from "./analytics/OverviewTab";
import { SalesTab } from "./analytics/SalesTab";
import { SellThroughTab } from "./analytics/SellThroughTab";
import { SizeGridTab } from "./analytics/SizeGridTab";
import { retailKeys } from "./analytics/keys";

type TabKey = "overview" | "sales" | "sell-through" | "sizes" | "matrix" | "collections";

const TABS: SegmentedTab<TabKey>[] = [
  { key: "overview", label: "Обзор" },
  { key: "sales", label: "Продажи" },
  { key: "sell-through", label: "Sell-through" },
  { key: "sizes", label: "Размеры" },
  { key: "matrix", label: "Матрица" },
  { key: "collections", label: "Коллекции" },
];

const isTab = (value: string | null): value is TabKey => TABS.some((tab) => tab.key === value);

/**
 * «Аналитика магазина» — деньги и сезонные отчёты вертикали retail.
 * Вкладка живёт в адресе (`?tab=`), чтобы ссылкой можно было поделиться.
 */
export default function RetailAnalyticsPage() {
  usePageTitle("Аналитика магазина");
  const theme = useTheme();
  const scope = useActiveScope();
  const { activeOrganization, isSuperAdmin } = usePermissions();
  const needsOrg = isSuperAdmin() && !activeOrganization;
  const ready = !needsOrg && scope.isReady && scope.orgReady;

  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: TabKey = isTab(raw) ? raw : "overview";
  const setTab = (next: TabKey) =>
    setParams(
      (prev) => {
        const copy = new URLSearchParams(prev);
        if (next === "overview") copy.delete("tab");
        else copy.set("tab", next);
        return copy;
      },
      { replace: true },
    );

  // Коллекции нужны трём вкладкам (фильтр сезона, выбор модели, правка) —
  // один запрос на страницу, а не на вкладку.
  const collections = useQuery({
    queryKey: retailKeys.collections(scope.organizationId),
    queryFn: ({ signal }) => getCollections(signal),
    enabled: ready,
    staleTime: 60_000,
  });

  return (
    <Box sx={{ height: "100%", overflowY: "auto", px: theme.appLayout.page.paddingX, py: 2 }}>
      <Stack spacing={2}>
        <Box sx={{ overflowX: "auto" }}>
          <SegmentedTabs<TabKey> layoutId="retail-analytics-tabs" tabs={TABS} value={tab} onChange={setTab} />
        </Box>
        {needsOrg ? (
          <Alert severity="info">Выберите организацию, чтобы увидеть аналитику магазина.</Alert>
        ) : (
          <>
            {tab === "overview" && <OverviewTab enabled={ready} organizationId={scope.organizationId} />}
            {tab === "sales" && (
              <SalesTab enabled={ready} organizationId={scope.organizationId} collections={collections.data ?? []} />
            )}
            {tab === "sell-through" && (
              <SellThroughTab enabled={ready} organizationId={scope.organizationId} collections={collections.data ?? []} />
            )}
            {tab === "sizes" && (
              <SizeGridTab enabled={ready} organizationId={scope.organizationId} collections={collections.data ?? []} />
            )}
            {tab === "matrix" && (
              <MatrixGapsTab
                enabled={ready}
                organizationId={scope.organizationId}
                collections={collections.data ?? []}
                collectionsLoading={collections.isLoading}
              />
            )}
            {tab === "collections" && (
              <CollectionsTab
                organizationId={scope.organizationId}
                collections={collections.data ?? []}
                loading={collections.isLoading}
                error={collections.error}
              />
            )}
          </>
        )}
      </Stack>
    </Box>
  );
}
