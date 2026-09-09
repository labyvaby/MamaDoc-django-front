import React from "react";
import { Alert, Box, Button, Card, Chip, CircularProgress, Divider, List, ListItem, ListItemText, Stack, Typography } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import type { DjangoClientContact } from "../../api/clients";
import type { ClientPurchase } from "../../api/retail";

type Props = {
  tab: "purchases" | "contacts";
  purchases: ClientPurchase[] | undefined;
  contacts: DjangoClientContact[] | undefined;
  loading: boolean;
  error: string | null;
  canManage: boolean;
  canViewPurchases: boolean;
  onAddContact: () => void;
  onEditContact: (contact: DjangoClientContact) => void;
};

export default function ClientTabs({ tab, purchases, contacts, loading, error, canManage, canViewPurchases, onAddContact, onEditContact }: Props) {
  if (loading) return <BoxCenter><CircularProgress size={28} /></BoxCenter>;
  if (error) return <Alert severity="error">{error}</Alert>;
  if (tab === "contacts") {
    return <Card sx={{ height: "100%", overflowY: "auto" }}><Stack direction="row" justifyContent="space-between" alignItems="center" p={2}><Typography variant="h6">Контактные лица</Typography>{canManage && <Button startIcon={<AddOutlined />} onClick={onAddContact}>Добавить</Button>}</Stack><Divider /><List>{(contacts ?? []).map((contact) => <ListItem key={contact.id ?? `self-${contact.fullName}`} secondaryAction={canManage && contact.id ? <Button size="small" onClick={() => onEditContact(contact)}>Изменить</Button> : undefined}><ListItemText primary={contact.fullName} secondary={[contact.position, contact.phone, contact.email].filter(Boolean).join(" · ") || "Контакты не указаны"} /><Chip size="small" label={contact.isPrimary ? "Основной" : "Контакт"} sx={{ mr: canManage && contact.id ? 10 : 0 }} /></ListItem>)}{!contacts?.length && <Typography color="text.secondary" sx={{ p: 2 }}>Контактных лиц пока нет.</Typography>}</List></Card>;
  }
  if (!canViewPurchases) return <Alert severity="info">История покупок доступна сотрудникам с правом просмотра кассы магазина.</Alert>;
  return <Card sx={{ height: "100%", overflowY: "auto", p: 2 }}><Typography variant="h6" mb={1.5}>История покупок</Typography>{purchases?.length ? purchases.map((purchase) => <Box key={purchase.id} py={1.25} borderBottom={1} borderColor="divider"><Stack direction="row" justifyContent="space-between" gap={1}><Box><Typography fontWeight={600}>Чек №{purchase.number}</Typography><Typography variant="caption" color="text.secondary">{new Date(purchase.createdAt).toLocaleString("ru-RU")} · {purchase.status}</Typography></Box><Typography fontWeight={700}>{Number(purchase.totalAmount).toLocaleString("ru-RU")} сом</Typography></Stack>{purchase.lines.length > 0 && <Typography variant="body2" color="text.secondary" mt={0.5}>{purchase.lines.map((line) => `${line.productName} × ${line.quantity}`).join(", ")}</Typography>}</Box>) : <Typography color="text.secondary">Покупок пока нет.</Typography>}</Card>;
}
function BoxCenter({ children }: { children: React.ReactNode }) { return <Card sx={{ height: "100%", display: "grid", placeItems: "center" }}>{children}</Card>; }
