import React from "react";
import {
  Box,
  Stack,
  Typography,
  Chip,
  alpha,
} from "@mui/material";
import LocalPhoneOutlined from "@mui/icons-material/LocalPhoneOutlined";
import TelegramIcon from "@mui/icons-material/Telegram";
import EmailOutlined from "@mui/icons-material/EmailOutlined";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import CakeOutlined from "@mui/icons-material/CakeOutlined";
import BadgeOutlined from "@mui/icons-material/BadgeOutlined";
import AlternateEmailOutlined from "@mui/icons-material/AlternateEmailOutlined";
import dayjs from "dayjs";

import { usePageTitle } from "../../hooks/usePageTitle";
import { usePermissions } from "../../hooks/usePermissions";
import { useCan } from "../../hooks/useCan";
import { PageHeader, AppCard, UserAvatar } from "../../components/ui";
import DocumentsBlock from "../../features/employees/components/DocumentsBlock";
import { getCurrentUser } from "../../api/auth";
import { IS_DJANGO_BACKEND } from "../../config/backend";

/** Строка-инфо: плиточная иконка + подпись/значение. */
const InfoRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  value?: React.ReactNode;
  active?: boolean;
  monospace?: boolean;
}> = ({ icon, label, value, active = true, monospace = false }) => (
  <Box
    sx={{
      display: "flex",
      alignItems: "center",
      gap: 1.5,
      p: 1.25,
      borderRadius: 1,
      border: 1,
      borderColor: "divider",
      bgcolor: "background.paper",
    }}
  >
    <Box
      sx={{
        width: 40,
        height: 40,
        borderRadius: 1,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: active ? "primary.onSurface" : "text.disabled",
        bgcolor: (theme) =>
          active ? alpha(theme.palette.primary.main, 0.1) : "action.hover",
        "& .MuiSvgIcon-root": { fontSize: 20 },
      }}
    >
      {icon}
    </Box>
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
      <Typography
        variant="body2"
        fontWeight={600}
        noWrap
        sx={monospace ? { fontFamily: "monospace" } : undefined}
      >
        {value || "—"}
      </Typography>
    </Box>
  </Box>
);

const formatBank = (v?: string | null) =>
  v ? v.replace(/(.{4})/g, "$1 ").trim() : undefined;

type ProfileView = {
  fullName: string;
  photoUrl: string | null;
  phone: string;
  email: string;
  telegramId: string;
  bank: string;
  inn: string;
  birthDate: string | null;
  nickname: string;
  status?: string;
};

/** Сырой источник профиля (activeEmployee из /auth/me либо employee из прав). */
type RawEmployeeSource = {
  fullName?: string | null;
  photoUrl?: string | null;
  phone?: string | null;
  email?: string | null;
  telegramId?: string | null;
  bankAccountNumber?: string | null;
  inn?: string | null;
  birthDate?: string | null;
  nickname?: string | null;
  status?: string | null;
} | null | undefined;

/** Нормализует activeEmployee из /auth/me (camelCase) в плоское представление. */
const deriveView = (src: RawEmployeeSource): ProfileView => ({
  fullName: src?.fullName || "",
  photoUrl: src?.photoUrl || null,
  phone: src?.phone || "",
  email: src?.email || "",
  telegramId: src?.telegramId || "",
  bank: src?.bankAccountNumber || "",
  inn: src?.inn || "",
  birthDate: src?.birthDate || null,
  nickname: src?.nickname || "",
  status: src?.status || undefined,
});

const ProfilePage: React.FC = () => {
  usePageTitle("Профиль");
  const { employee: empFromPerms, role } = usePermissions();

  const canViewPrivate = useCan("staff.private.view");
  const canViewDocs = useCan("staff.documents.view");

  // Настоящий employee id берём из /auth/me (activeEmployee.id).
  const [empId, setEmpId] = React.useState<number | null>(null);
  const hasDjangoEmp = IS_DJANGO_BACKEND && empId != null;

  const [view, setView] = React.useState<ProfileView>(() => deriveView(empFromPerms));

  // Первичная загрузка: мгновенно показываем данные из прав, затем
  // подтягиваем авторитетные данные и настоящий employee id из /auth/me.
  const bootRef = React.useRef(false);
  React.useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;

    setView(deriveView(empFromPerms));

    if (!IS_DJANGO_BACKEND) return;
    getCurrentUser()
      .then((me) => {
        if (me.activeEmployee) {
          setEmpId(Number(me.activeEmployee.id));
          setView(deriveView(me.activeEmployee));
        }
      })
      .catch(() => {
        /* оставляем данные из прав */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayName = view.fullName || "Пользователь";
  const roleText =
    role?.display_name ||
    (role?.name === "doctor" ? "Врач" : role?.name) ||
    (view.status === "active" ? "Сотрудник" : "Пользователь");

  return (
    <Box
      sx={(t) => ({
        height: {
          xs: `calc(100dvh - ${t.appLayout.header.height.mobile}px)`,
          md: `calc(100dvh - ${t.appLayout.header.height.desktop}px)`,
        },
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
      })}
    >
      <PageHeader title="Профиль" showTitle={false} />

      <Box
        sx={(t) => ({
          px: t.appLayout.page.paddingX,
          pt: 1.5,
          pb: t.appLayout.page.paddingY,
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
        })}
      >
        <Stack spacing={2} sx={{ maxWidth: 820, mx: "auto" }}>
          {/* Карточка пользователя */}
          <AppCard variant="outlined">
            <Stack direction="row" spacing={3} alignItems="center">
              <UserAvatar
                src={view.photoUrl}
                name={displayName}
                size={112}
                sx={{ flexShrink: 0 }}
              />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2 }}>
                  {displayName}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                  {roleText}
                </Typography>
                {view.status && (
                  <Chip
                    label={view.status === "active" ? "Работает" : "Неактивен"}
                    size="small"
                    color={view.status === "active" ? "success" : "default"}
                    variant="filled"
                    sx={{ mt: 1, fontWeight: 600, fontSize: "0.75rem", height: 20 }}
                  />
                )}
              </Box>
            </Stack>
          </AppCard>

          {/* Контактные данные */}
          <AppCard variant="outlined" title="Контактные данные">
            <Stack spacing={1}>
              <InfoRow icon={<LocalPhoneOutlined />} label="Телефон" value={view.phone} active={Boolean(view.phone)} />
              <InfoRow icon={<TelegramIcon />} label="Telegram ID" value={view.telegramId} active={Boolean(view.telegramId)} />
              <InfoRow icon={<EmailOutlined />} label="Email" value={view.email} active={Boolean(view.email)} />
              {view.nickname && (
                <InfoRow icon={<AlternateEmailOutlined />} label="Псевдоним" value={view.nickname} />
              )}
              {view.birthDate && (
                <InfoRow icon={<CakeOutlined />} label="Дата рождения" value={dayjs(view.birthDate).format("DD.MM.YYYY")} />
              )}
              {canViewPrivate && (
                <>
                  <InfoRow icon={<CreditCardOutlined />} label="Банковский счёт" value={formatBank(view.bank)} active={Boolean(view.bank)} monospace />
                  <InfoRow icon={<BadgeOutlined />} label="ИНН" value={view.inn} active={Boolean(view.inn)} monospace />
                </>
              )}
            </Stack>
          </AppCard>

          {/* Документы / паспорт */}
          {hasDjangoEmp && canViewDocs && (
            <AppCard variant="outlined" title="Документы">
              <DocumentsBlock employeeId={empId} canView canManage={false} />
            </AppCard>
          )}
        </Stack>
      </Box>
    </Box>
  );
};

export default ProfilePage;
