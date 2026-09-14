import React from "react";
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, Switch, TextField, Typography, useMediaQuery, useTheme } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";

import { PageHeader, SegmentedTabs } from "../../components/ui";
import { AccessDenied } from "../../components/rbac/AccessDenied";
import { usePermissions } from "../../hooks/usePermissions";
import { usePageTitle } from "../../hooks/usePageTitle";
import { createClientContact, getClientContacts, getClients, getClientStatuses, updateClientContact, type DjangoClient, type DjangoClientContact } from "../../api/clients";
import { getClientPurchases } from "../../api/retail";
import ClientCard from "./ClientCard";
import ClientEditorDrawer from "./ClientEditorDrawer";
import ClientListPanel from "./ClientListPanel";
import ClientTabs from "./ClientTabs";
import { defaultClientLayoutSettings, getClientLayoutSettings, type ClientLayoutSettings, type ClientTabKey } from "./clientLayout";

const tabLabels: Record<ClientTabKey, string> = { purchases: "История покупок", contacts: "Контактные лица" };
type ContactDraft = { fullName: string; position: string; phone: string; email: string; isPrimary: boolean; note: string };
const emptyContact: ContactDraft = { fullName: "", position: "", phone: "", email: "", isPrimary: false, note: "" };

export default function ClientsPage() {
  const auth = usePermissions();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const isTablet = useMediaQuery(theme.breakpoints.between("md", "lg"));
  const organizationId = auth.activeOrganization?.id ?? null;
  const canView = auth.isSuperAdmin() || auth.hasPermission("clients.view");
  const canManage = auth.isSuperAdmin() || auth.hasPermission("clients.manage");
  const canViewPurchases = auth.isSuperAdmin() || auth.hasPermission("pos.view") || auth.hasPermission("pos.sell");

  usePageTitle("Все клиенты");
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [selected, setSelected] = React.useState<DjangoClient | null>(null);
  const [editorClient, setEditorClient] = React.useState<DjangoClient | null>(null);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [layout, setLayout] = React.useState<ClientLayoutSettings>(defaultClientLayoutSettings);
  const [activeTab, setActiveTab] = React.useState<ClientTabKey>("purchases");
  const [contactOpen, setContactOpen] = React.useState(false);
  const [contact, setContact] = React.useState<DjangoClientContact | null>(null);
  const [contactDraft, setContactDraft] = React.useState<ContactDraft>(emptyContact);
  const [contactBusy, setContactBusy] = React.useState(false);
  const [contactError, setContactError] = React.useState("");
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
    setActiveTab((current) => next.tabs.includes(current) ? current : next.tabs[0] ?? "purchases");
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

  const purchases = useQuery({ queryKey: ["client-purchases", organizationId, selected?.id], queryFn: ({ signal }) => getClientPurchases(selected!.id, signal), enabled: Boolean(selected && canViewPurchases && layout.tabs.includes("purchases")) });
  const contacts = useQuery({ queryKey: ["client-contacts", organizationId, selected?.id], queryFn: ({ signal }) => getClientContacts(selected!.id, organizationId!, signal), enabled: Boolean(organizationId && selected && canView && layout.tabs.includes("contacts")) });

  const openCreate = () => { setEditorClient(null); setEditorOpen(true); };
  const openEdit = () => { if (selected) { setEditorClient(selected); setEditorOpen(true); } };
  const onClientSaved = (saved: DjangoClient) => { setSelected(saved); void queryClient.invalidateQueries({ queryKey: ["clients", organizationId] }); };

  const openContact = (value: DjangoClientContact | null) => {
    setContact(value); setContactDraft(value ? { fullName: value.fullName, position: value.position, phone: value.phone, email: value.email, isPrimary: value.isPrimary, note: value.note } : { ...emptyContact }); setContactError(""); setContactOpen(true);
  };
  const saveContact = async () => {
    if (!organizationId || !selected || !contactDraft.fullName.trim()) { setContactError("Укажите имя контактного лица."); return; }
    setContactBusy(true); setContactError("");
    try {
      const payload = { ...contactDraft, fullName: contactDraft.fullName.trim() };
      if (contact?.id) await updateClientContact(selected.id, contact.id, organizationId, payload); else await createClientContact(selected.id, organizationId, payload);
      await queryClient.invalidateQueries({ queryKey: ["client-contacts", organizationId, selected.id] }); setContactOpen(false);
    } catch (e) { setContactError(e instanceof Error ? e.message : "Не удалось сохранить контакт."); } finally { setContactBusy(false); }
  };

  if (auth.loading) return <Box sx={{ display: "grid", placeItems: "center", minHeight: "60vh" }}><CircularProgress /></Box>;
  if (!canView) return <AccessDenied />;

  const selectedTab: ClientTabKey = layout.tabs.includes(activeTab) ? activeTab : layout.tabs[0] ?? "purchases";
  const detailLoading = purchases.isLoading || contacts.isLoading;
  const detailError = [purchases.error, contacts.error].find(Boolean);
  const cardSettings = { ...layout, sections: { ...layout.sections, finance: layout.sections.finance && canViewPurchases } };

  return <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
    <PageHeader title="Клиенты" showTitle={false} onAdd={canManage ? openCreate : undefined} addButtonText="Добавить клиента" addButtonIcon={<AddOutlined />} showSearch searchVal={search} onSearchChange={setSearch} searchPlaceholder="Поиск..." loading={clients.isFetching} />
    <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: isMobile ? "column" : "row", gap: 1.5, px: { xs: 1, md: 2 }, pb: 1.5, overflow: "hidden" }}>
      <Box sx={{ flex: isMobile ? "0 0 42%" : isTablet ? "5 1 0" : "3 1 0", minWidth: 0, minHeight: 0 }}><ClientListPanel clients={clients.data ?? []} selectedId={selected?.id ?? null} loading={clients.isLoading} error={clients.error instanceof Error ? clients.error.message : null} onSelect={setSelected} /></Box>
      {!isMobile && !isTablet && selected && <Box sx={{ flex: "3.5 1 0", minWidth: 0, minHeight: 0 }}><ClientCard client={selected} settings={cardSettings} canManage={canManage} onEdit={openEdit} /></Box>}
      <Box sx={{ flex: isMobile ? "1 1 auto" : isTablet ? "5 1 0" : selected ? "5.5 1 0" : "7 1 0", minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: 1 }}>
        {(isMobile || isTablet) && selected && <Box sx={{ flex: isTablet ? "0 0 46%" : "0 0 auto", minHeight: 0 }}><ClientCard client={selected} settings={cardSettings} canManage={canManage} onEdit={openEdit} /></Box>}
        {selected && layout.tabs.length > 0 && <SegmentedTabs tabs={layout.tabs.map((tab) => ({ key: tab, label: tabLabels[tab] }))} value={selectedTab} onChange={setActiveTab} layoutId="clients-tabs" />}
        {selected && layout.tabs.length > 0 && <Box sx={{ flex: 1, minHeight: 0 }}><ClientTabs tab={selectedTab} purchases={purchases.data} contacts={contacts.data} loading={detailLoading} error={detailError instanceof Error ? detailError.message : null} canManage={canManage} canViewPurchases={canViewPurchases} onAddContact={() => openContact(null)} onEditContact={openContact} /></Box>}
        {!selected && <Box sx={{ flex: 1, display: "grid", placeItems: "center", border: 1, borderStyle: "dashed", borderColor: "divider", borderRadius: 1 }}><Typography color="text.secondary">Карточка клиента</Typography></Box>}
      </Box>
    </Box>
    <ClientEditorDrawer open={editorOpen} organizationId={organizationId} client={editorClient} statuses={statuses.data ?? []} onClose={() => setEditorOpen(false)} onSaved={onClientSaved} />
    <Dialog open={contactOpen} onClose={() => !contactBusy && setContactOpen(false)} fullWidth maxWidth="sm"><DialogTitle>{contact ? "Изменить контактное лицо" : "Добавить контактное лицо"}</DialogTitle><DialogContent><Stack gap={2} pt={1}>{contactError && <Alert severity="error">{contactError}</Alert>}<TextField label="ФИО" value={contactDraft.fullName} onChange={(e) => setContactDraft((v) => ({ ...v, fullName: e.target.value }))} required fullWidth /><TextField label="Должность" value={contactDraft.position} onChange={(e) => setContactDraft((v) => ({ ...v, position: e.target.value }))} fullWidth /><TextField label="Телефон" value={contactDraft.phone} onChange={(e) => setContactDraft((v) => ({ ...v, phone: e.target.value }))} fullWidth /><TextField label="Email" value={contactDraft.email} onChange={(e) => setContactDraft((v) => ({ ...v, email: e.target.value }))} fullWidth /><FormControlLabel control={<Switch checked={contactDraft.isPrimary} onChange={(_, checked) => setContactDraft((v) => ({ ...v, isPrimary: checked }))} />} label="Основной контакт" /><TextField label="Комментарий" value={contactDraft.note} onChange={(e) => setContactDraft((v) => ({ ...v, note: e.target.value }))} multiline minRows={2} fullWidth /></Stack></DialogContent><DialogActions><Button onClick={() => setContactOpen(false)} disabled={contactBusy}>Отмена</Button><Button variant="contained" onClick={() => void saveContact()} disabled={contactBusy}>{contactBusy ? <CircularProgress size={20} /> : "Сохранить"}</Button></DialogActions></Dialog>
  </Box>;
}
