import React from "react";
import { Box, Button, CircularProgress, Typography, useMediaQuery, useTheme } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";

import { PageHeader } from "../../components/ui";
import { AccessDenied } from "../../components/rbac/AccessDenied";
import { usePermissions } from "../../hooks/usePermissions";
import { usePageTitle } from "../../hooks/usePageTitle";
import { getClients, getClientStatuses, type DjangoClient } from "../../api/clients";
import { getClientPurchases } from "../../api/retail";
import ClientCard from "./ClientCard";
import ClientEditorDrawer from "./ClientEditorDrawer";
import ClientListPanel from "./ClientListPanel";
import ClientPurchaseHistoryCard from "./ClientPurchaseHistoryCard";
import { defaultClientLayoutSettings, getClientLayoutSettings, type ClientLayoutSettings } from "./clientLayout";

export default function ClientsPage() {
  const auth = usePermissions();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const isTablet = useMediaQuery(theme.breakpoints.between("md", "lg"));
  const organizationId = auth.activeOrganization?.id ?? null;
  const canView = auth.isSuperAdmin() || auth.hasPermission("clients.view");
  // Права гранулярные, как у пациентов: заводить и править — разные галочки.
  const canCreate = auth.isSuperAdmin() || auth.hasPermission("clients.create");
  const canUpdate = auth.isSuperAdmin() || auth.hasPermission("clients.update");
  const canViewFinance = auth.isSuperAdmin() || auth.hasPermission("pos.view") || auth.hasPermission("pos.sell");
  const canViewPurchaseHistory = auth.isSuperAdmin() || auth.hasPermission("pos.history");

  usePageTitle("Все клиенты");
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [selected, setSelected] = React.useState<DjangoClient | null>(null);
  const [editorClient, setEditorClient] = React.useState<DjangoClient | null>(null);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [layout, setLayout] = React.useState<ClientLayoutSettings>(defaultClientLayoutSettings);
  const [searchParams, setSearchParams] = useSearchParams();

  const layoutQuery = useQuery({
    queryKey: ["client-layout-settings", organizationId],
    queryFn: ({ signal }) => getClientLayoutSettings(organizationId as number, signal),
    enabled: Boolean(organizationId && canView),
  });

  React.useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search), 250); return () => window.clearTimeout(timer); }, [search]);
  React.useEffect(() => {
    const next = layoutQuery.data ?? defaultClientLayoutSettings;
    setLayout(next);
  }, [layoutQuery.data]);

  const clients = useQuery({
    queryKey: ["clients", organizationId, debouncedSearch],
    queryFn: ({ signal }) => getClients(organizationId as number, { query: debouncedSearch }, signal),
    enabled: Boolean(organizationId && canView),
  });
  const statuses = useQuery({
    queryKey: ["client-statuses", organizationId],
    queryFn: ({ signal }) => getClientStatuses(organizationId as number, signal),
    enabled: Boolean(organizationId && canView),
    staleTime: 5 * 60 * 1000,
  });

  React.useEffect(() => { if (!selected) return; const fresh = clients.data?.find((row) => row.id === selected.id); if (fresh) setSelected(fresh); }, [clients.data, selected?.id]);
  React.useEffect(() => {
    const raw = Number(searchParams.get("client"));
    if (!raw || !clients.data) return;
    const found = clients.data.find((row) => row.id === raw);
    if (found) setSelected(found);
    setSearchParams((previous) => { const next = new URLSearchParams(previous); next.delete("client"); return next; }, { replace: true });
  }, [clients.data, searchParams, setSearchParams]);

  const purchases = useQuery({ queryKey: ["client-purchases", organizationId, selected?.id], queryFn: ({ signal }) => getClientPurchases(selected!.id, signal), enabled: Boolean(selected && canViewPurchaseHistory) });

  const openCreate = () => { setEditorClient(null); setEditorOpen(true); };
  const openEdit = () => { if (selected) { setEditorClient(selected); setEditorOpen(true); } };
  const onClientSaved = (saved: DjangoClient) => { setSelected(saved); void queryClient.invalidateQueries({ queryKey: ["clients", organizationId] }); };

  if (auth.loading) return <Box sx={{ display: "grid", placeItems: "center", minHeight: "60vh" }}><CircularProgress /></Box>;
  if (!canView) return <AccessDenied />;

  const cardSettings = { ...layout, sections: { ...layout.sections, finance: layout.sections.finance && canViewFinance } };

  return <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
    <PageHeader title="Клиенты" showTitle={false} onAdd={canCreate ? openCreate : undefined} addButtonText="Добавить клиента" addButtonIcon={<AddOutlined />} showSearch searchVal={search} onSearchChange={setSearch} searchPlaceholder="Поиск..." loading={clients.isFetching} />
    <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: isMobile ? "column" : "row", gap: 1.5, px: { xs: 1, md: 2 }, pb: 1.5, overflow: isMobile ? "auto" : "hidden" }}>
      <Box sx={{ flex: isMobile ? "0 0 42%" : isTablet ? "5 1 0" : "3 1 0", minWidth: 0, minHeight: 0 }}><ClientListPanel clients={clients.data ?? []} selectedId={selected?.id ?? null} loading={clients.isLoading} error={clients.error instanceof Error ? clients.error.message : null} onSelect={setSelected} /></Box>
      {!isMobile && !isTablet && selected && <Box sx={{ flex: "3.5 1 0", minWidth: 0, minHeight: 0 }}><ClientCard client={selected} settings={cardSettings} canUpdate={canUpdate} onEdit={openEdit} /></Box>}
      <Box sx={{ flex: isMobile ? "1 1 auto" : isTablet ? "5 1 0" : selected ? "5.5 1 0" : "7 1 0", minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: 1 }}>
        {(isMobile || isTablet) && selected && <Box sx={{ flex: isTablet ? "0 0 46%" : "0 0 auto", minHeight: 0 }}><ClientCard client={selected} settings={cardSettings} canUpdate={canUpdate} onEdit={openEdit} /></Box>}
        {selected && <Box sx={{ flex: 1, minHeight: 0 }}><ClientPurchaseHistoryCard purchases={purchases.data} loading={purchases.isLoading} error={purchases.error instanceof Error ? purchases.error.message : null} canViewPurchases={canViewPurchaseHistory} /></Box>}
        {!selected && <Box sx={{ flex: 1, display: "grid", placeItems: "center", border: 1, borderStyle: "dashed", borderColor: "divider", borderRadius: 1 }}><Typography color="text.secondary">Карточка клиента</Typography></Box>}
      </Box>
    </Box>
    <ClientEditorDrawer open={editorOpen} organizationId={organizationId} client={editorClient} statuses={statuses.data ?? []} onClose={() => setEditorOpen(false)} onSaved={onClientSaved} />
  </Box>;
}
