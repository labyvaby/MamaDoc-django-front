import React from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import EditOutlined from "@mui/icons-material/EditOutlined";
import PhoneOutlined from "@mui/icons-material/PhoneOutlined";
import EmailOutlined from "@mui/icons-material/EmailOutlined";
import BusinessOutlined from "@mui/icons-material/BusinessOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import NotesOutlined from "@mui/icons-material/NotesOutlined";
import type { DjangoClient, ClientStatus } from "../../api/clients";
import type { ClientLayoutSettings } from "./clientLayout";
import { UserAvatar } from "../../components/ui";

const statusLabels: Record<ClientStatus, string> = {
  new: "Новый",
  active: "Активен",
  inactive: "Неактивен",
  no_offering: "Без покупок",
};

function money(value: string) {
  return `${Number(value || 0).toLocaleString("ru-RU")} сом`;
}

type Props = {
  client: DjangoClient | null;
  settings: ClientLayoutSettings;
  canManage: boolean;
  onEdit: () => void;
};

export default function ClientCard({ client, settings, canManage, onEdit }: Props) {
  if (!client) {
    return <Card sx={{ height: "100%", display: "grid", placeItems: "center", p: 3 }}><Typography color="text.secondary">Карточка клиента</Typography></Card>;
  }
  const isCompany = client.clientType === "company";
  return (
    <Card sx={{ height: "100%", overflowY: "auto" }}>
      <CardContent>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1}>
          <Stack direction="row" gap={1.5} alignItems="center" minWidth={0}>
            <UserAvatar src={client.photoUrl} name={client.fullName} size={48} sx={{ borderRadius: "14px", flexShrink: 0 }} />
            <Box minWidth={0}>
              <Typography variant="h6" noWrap>{client.fullName}</Typography>
              <Stack direction="row" gap={0.5} flexWrap="wrap">
                <Chip size="small" label={isCompany ? "Компания" : "Физическое лицо"} />
                <Chip size="small" label={statusLabels[client.status] ?? client.status} color={client.status === "active" ? "success" : "default"} />
                {client.customerStatus && <Chip size="small" label={client.customerStatus.name} sx={{ bgcolor: client.customerStatus.color, color: "common.white" }} />}
                {client.isBlacklisted && <Chip size="small" label="Чёрный список" color="error" />}
              </Stack>
            </Box>
          </Stack>
          {canManage && <Button size="small" startIcon={<EditOutlined />} onClick={onEdit}>Изменить</Button>}
        </Stack>

        {settings.sections.identity && (
          <InfoSection title="Контакты">
            <InfoRow icon={<PhoneOutlined />} label="Телефон" value={client.phone || "—"} />
            <InfoRow icon={<EmailOutlined />} label="Email" value={client.email || "—"} />
          </InfoSection>
        )}

        {settings.sections.company && isCompany && (
          <InfoSection title="Реквизиты компании">
            <InfoRow icon={<BusinessOutlined />} label="Юридическое название" value={client.legalName || "—"} />
            <InfoRow label="ИНН / ОКПО" value={[client.inn, client.okpo].filter(Boolean).join(" / ") || "—"} />
            <InfoRow label="Юридический адрес" value={client.legalAddress || "—"} />
            <InfoRow label="Банк" value={[client.bankName, client.bankAccount, client.bankBik].filter(Boolean).join(" · ") || "—"} />
          </InfoSection>
        )}

        {settings.sections.finance && (
          <InfoSection title="Баланс">
            <Stack direction="row" gap={1}>
              <BalanceBox icon={<AccountBalanceWalletOutlined />} label="Баланс" value={money(client.balance)} />
              <BalanceBox label="Долг" value={money(client.debt)} warning={Number(client.debt) > 0} />
            </Stack>
          </InfoSection>
        )}

        {settings.sections.note && client.note && (
          <InfoSection title="Комментарий" icon={<NotesOutlined />}>
            <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{client.note}</Typography>
          </InfoSection>
        )}
      </CardContent>
    </Card>
  );
}

function InfoSection({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: "divider" }}><Stack direction="row" gap={0.75} alignItems="center" mb={1}><Box sx={{ color: "text.secondary", display: "flex" }}>{icon}</Box><Typography variant="subtitle2">{title}</Typography></Stack>{children}</Box>;
}

function InfoRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return <Stack direction="row" gap={1} alignItems="flex-start" sx={{ mb: 0.75 }}><Box sx={{ color: "text.secondary", display: "flex", mt: 0.25 }}>{icon}</Box><Box minWidth={0}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>{value}</Typography></Box></Stack>;
}

function BalanceBox({ icon, label, value, warning = false }: { icon?: React.ReactNode; label: string; value: string; warning?: boolean }) {
  return <Box sx={{ flex: 1, minWidth: 0, p: 1.25, borderRadius: 1.5, bgcolor: warning ? "error.50" : "action.hover" }}><Stack direction="row" gap={0.5} alignItems="center" color={warning ? "error.main" : "text.secondary"}>{icon}<Typography variant="caption">{label}</Typography></Stack><Typography fontWeight={700} color={warning ? "error.main" : "text.primary"} noWrap>{value}</Typography></Box>;
}
