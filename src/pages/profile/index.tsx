import React from "react";
import {
  Box,
  Stack,
  Typography,
  Chip,
  alpha,
  Tooltip,
  useMediaQuery,
} from "@mui/material";
import type { Theme } from "@mui/material/styles";
import { motion } from "framer-motion";
import EditOutlined from "@mui/icons-material/EditOutlined";
import PersonOutlined from "@mui/icons-material/PersonOutlined";
import FolderOutlined from "@mui/icons-material/FolderOutlined";
import LockOutlined from "@mui/icons-material/LockOutlined";
import EmojiEventsOutlined from "@mui/icons-material/EmojiEventsOutlined";
import { AppButton } from "../../components/ui/AppButton";
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
import { useCan, useCanChecker } from "../../hooks/useCan";
import { PageHeader, AppCard, UserAvatar, InfoTile } from "../../components/ui";
import { subtleBg } from "../../theme/uiHelpers";
import { getCurrentUser } from "../../api/auth";
import { IS_DJANGO_BACKEND } from "../../config/backend";
import ChangePasswordCard from "./ChangePasswordCard";
import EditProfileDrawer, { type ProfileFormValues } from "./EditProfileDrawer";
import ProfileDocumentsBlock from "./ProfileDocumentsBlock";
import AchievementsGrid from "../../components/achievements/AchievementsGrid";

const MotionBox = motion(Box);

/** Контейнерный вариант — каскадное появление дочерних блоков при загрузке. */
const containerVariants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.06, delayChildren: 0.03 },
  },
};

/** Элемент каскада — мягкий подъём + проявление. */
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const },
  },
};

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

/** Аккаунт пользователя (/auth/me → user) — источник email на случай, когда
 *  в карточке Employee он не заполнен. */
type RawUserSource = {
  email?: string | null;
} | null | undefined;

/**
 * Нормализует activeEmployee из /auth/me (camelCase) в плоское представление.
 * email берём из карточки Employee, а при его отсутствии — из аккаунта User,
 * поэтому поле не пустует независимо от способа входа (телефон/почта).
 */
const deriveView = (src: RawEmployeeSource, user?: RawUserSource): ProfileView => ({
  fullName: src?.fullName || "",
  photoUrl: src?.photoUrl || null,
  phone: src?.phone || "",
  email: src?.email || user?.email || "",
  telegramId: src?.telegramId || "",
  bank: src?.bankAccountNumber || "",
  inn: src?.inn || "",
  birthDate: src?.birthDate || null,
  nickname: src?.nickname || "",
  status: src?.status || undefined,
});

/** Быстрое контактное действие в шапке (звонок / телеграм / почта).
 *  Квадратная иконка-кнопка в духе shadcn: контурная, приглушённая, мягкий ховер. */
const QuickContact: React.FC<{
  icon: React.ReactNode;
  label: string;
  href?: string;
}> = ({ icon, label, href }) => {
  if (!href) return null;
  return (
    <Tooltip title={label} arrow>
      <Box
        component="a"
        href={href}
        target={href.startsWith("http") ? "_blank" : undefined}
        rel="noopener noreferrer"
        aria-label={label}
        sx={(t) => ({
          width: 40,
          height: 40,
          borderRadius: "10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "text.secondary",
          textDecoration: "none",
          border: 1,
          borderColor: "divider",
          transition: "color .15s ease, background-color .15s ease, border-color .15s ease",
          "& .MuiSvgIcon-root": { fontSize: 19 },
          "&:hover": {
            color: "text.primary",
            bgcolor: subtleBg(t, true),
            borderColor: alpha(t.palette.primary.main, 0.35),
          },
        })}
      >
        {icon}
      </Box>
    </Tooltip>
  );
};

const ProfilePage: React.FC = () => {
  usePageTitle("Профиль");
  const { employee: empFromPerms, role } = usePermissions();

  const canViewPrivate = useCan("staff.private.view");
  const canViewDocs = useCan("staff.documents.view");
  const canManagePrivate = useCan("staff.private.manage");
  const { can } = useCanChecker();

  const [editOpen, setEditOpen] = React.useState(false);
  const [tab, setTab] = React.useState(0);

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
          setView(deriveView(me.activeEmployee, me.user));
        } else if (me.user) {
          // Нет карточки Employee — показываем хотя бы email аккаунта.
          setView(deriveView(null, me.user));
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
  const isActive = view.status === "active";

  // Tab definitions, built conditionally so indices always line up with the
  // rendered content (no hard-coded positions that break when a tab is hidden).
  const tabs: { key: string; label: string; icon: React.ReactElement; content: React.ReactNode }[] = [
    {
      key: "main",
      label: "Основное",
      icon: <PersonOutlined fontSize="small" />,
      content: (
        <AppCard variant="outlined" title="Контактные данные">
          <Box
            sx={{
              display: "grid",
              gap: 1.25,
              gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
            }}
          >
            <InfoTile icon={<LocalPhoneOutlined />} label="Телефон" value={view.phone} active={Boolean(view.phone)} />
            <InfoTile icon={<TelegramIcon />} label="Telegram ID" value={view.telegramId} active={Boolean(view.telegramId)} />
            <InfoTile icon={<EmailOutlined />} label="Email" value={view.email} active={Boolean(view.email)} />
            {view.nickname && (
              <InfoTile icon={<AlternateEmailOutlined />} label="Псевдоним" value={view.nickname} />
            )}
            {view.birthDate && (
              <InfoTile icon={<CakeOutlined />} label="Дата рождения" value={dayjs(view.birthDate).format("DD.MM.YYYY")} />
            )}
            {canViewPrivate && (
              <>
                <InfoTile icon={<CreditCardOutlined />} label="Банковский счёт" value={formatBank(view.bank)} active={Boolean(view.bank)} monospace />
                <InfoTile icon={<BadgeOutlined />} label="ИНН" value={view.inn} active={Boolean(view.inn)} monospace />
              </>
            )}
          </Box>
        </AppCard>
      ),
    },
  ];

  if (IS_DJANGO_BACKEND && can("achievements.view")) {
    tabs.push({
      key: "achievements",
      label: "Награды",
      icon: <EmojiEventsOutlined fontSize="small" />,
      content: (
        <AppCard variant="outlined" title="Награды">
          <AchievementsGrid />
        </AppCard>
      ),
    });
  }

  if (hasDjangoEmp && canViewDocs) {
    tabs.push({
      key: "documents",
      label: "Документы",
      icon: <FolderOutlined fontSize="small" />,
      content: (
        <AppCard variant="outlined" title="Документы">
          <ProfileDocumentsBlock />
        </AppCard>
      ),
    });
  }

  if (IS_DJANGO_BACKEND) {
    tabs.push({
      key: "security",
      label: "Безопасность",
      icon: <LockOutlined fontSize="small" />,
      content: <ChangePasswordCard />,
    });
  }

  const activeTab = Math.min(tab, tabs.length - 1);

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
          pt: 0.5,
          pb: t.appLayout.page.paddingY,
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
        })}
      >
        <MotionBox
          variants={containerVariants}
          initial="hidden"
          animate="show"
          sx={{ maxWidth: 880, mx: "auto", display: "flex", flexDirection: "column", gap: 2 }}
        >
          {/* ───── Шапка профиля: плоская карточка, аватар-плашка + имя/контакты ───── */}
          <MotionBox variants={itemVariants}>
            <HeroCard
              displayName={displayName}
              roleText={roleText}
              photoUrl={view.photoUrl}
              status={view.status}
              isActive={isActive}
              email={view.email}
              phone={view.phone}
              telegramId={view.telegramId}
              onEdit={hasDjangoEmp ? () => setEditOpen(true) : undefined}
            />
          </MotionBox>

          {/* ───── Сегментированные табы (тумблер в духе дашборда) ───── */}
          <MotionBox variants={itemVariants}>
            <SegmentedTabs
              tabs={tabs.map((t) => ({ key: t.key, label: t.label, icon: t.icon }))}
              value={activeTab}
              onChange={setTab}
            />
          </MotionBox>

          {/* Содержимое выбранной секции — переключаем с лёгкой анимацией. */}
          <MotionBox
            key={tabs[activeTab]?.key}
            variants={itemVariants}
            initial="hidden"
            animate="show"
          >
            {tabs[activeTab]?.content}
          </MotionBox>
        </MotionBox>
      </Box>

      {/* Редактирование профиля */}
      {hasDjangoEmp && (
        <EditProfileDrawer
          open={editOpen}
          canEditPrivate={canManagePrivate}
          initial={{
            fullName: view.fullName,
            phone: view.phone,
            email: view.email,
            telegramId: view.telegramId,
            nickname: view.nickname,
            birthDate: view.birthDate ?? "",
            bankAccountNumber: view.bank,
            inn: view.inn,
          }}
          onClose={() => setEditOpen(false)}
          onSaved={(values: ProfileFormValues) => {
            setView((prev) => ({
              ...prev,
              fullName: values.fullName,
              phone: values.phone,
              email: values.email,
              telegramId: values.telegramId,
              nickname: values.nickname,
              birthDate: values.birthDate || null,
              bank: values.bankAccountNumber,
              inn: values.inn,
            }));
          }}
        />
      )}
    </Box>
  );
};

/** Шапка профиля: плоская карточка с тонкой гранью. Аватар-плашка (скруглённый
 *  квадрат) с индикатором статуса, имя + контактная подстрока + чипы роли/статуса,
 *  справа — быстрые контакты и primary-кнопка «Редактировать». Всё на токенах
 *  темы, поэтому корректно в светлой/тёмной и под выбранный primaryColor. */
const HeroCard: React.FC<{
  displayName: string;
  roleText: React.ReactNode;
  photoUrl: string | null;
  status?: string;
  isActive: boolean;
  email: string;
  phone: string;
  telegramId: string;
  onEdit?: () => void;
}> = ({ displayName, roleText, photoUrl, status, isActive, email, phone, telegramId, onEdit }) => {
  // ВНИМАНИЕ: в теме кастомные брейкпоинты (sm: 360), поэтому раскладку
  // «телефон ↔ десктоп» переключаем по md (768), иначе все телефоны попадают в sm.
  const isMobile = useMediaQuery((t: Theme) => t.breakpoints.down("md"));
  const subline = email || phone || "";

  return (
    <AppCard variant="outlined">
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={{ xs: 2, md: 2.5 }}
        alignItems="center"
      >
        {/* Аватар-плашка + имя: на телефоне колонкой по центру, на md+ — в ряд слева */}
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          alignItems="center"
          sx={{ minWidth: 0, flex: 1, width: "100%", textAlign: { xs: "center", md: "left" } }}
        >
          <Box sx={{ position: "relative", flexShrink: 0 }}>
            <UserAvatar
              src={photoUrl}
              name={displayName}
              size={isMobile ? 64 : 76}
              sx={{ borderRadius: "18px" }}
            />
            {status && (
              <Tooltip title={isActive ? "Работает" : "Неактивен"} arrow>
                <Box
                  sx={(t) => ({
                    position: "absolute",
                    right: -3,
                    bottom: -3,
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    border: `3px solid ${t.palette.background.paper}`,
                    bgcolor: isActive ? t.palette.success.main : t.palette.grey[500],
                  })}
                />
              </Tooltip>
            )}
          </Box>

          {/* Имя, контактная подстрока, чипы */}
          <Box sx={{ minWidth: 0, width: "100%" }}>
            <Typography variant="h6" fontWeight={700} noWrap sx={{ letterSpacing: -0.2 }}>
              {displayName}
            </Typography>
            {subline && (
              <Typography variant="body2" color="text.secondary" noWrap sx={{ mt: 0.25 }}>
                {subline}
              </Typography>
            )}
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ mt: 1, flexWrap: "wrap", rowGap: 0.75, justifyContent: { xs: "center", md: "flex-start" } }}
            >
              <Chip
                label={roleText}
                size="small"
                sx={(t) => ({
                  fontWeight: 500,
                  height: 24,
                  borderRadius: "7px",
                  color: "primary.onSurface",
                  bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.18 : 0.1),
                })}
              />
              {status && (
                <Chip
                  size="small"
                  label={isActive ? "На службе" : "Неактивен"}
                  icon={
                    <Box
                      component="span"
                      sx={(t) => ({
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        bgcolor: isActive ? t.palette.success.main : t.palette.grey[500],
                        ml: 0.75,
                      })}
                    />
                  }
                  sx={(t) => ({
                    fontWeight: 500,
                    height: 24,
                    borderRadius: "7px",
                    "& .MuiChip-icon": { ml: 0.75, mr: -0.25 },
                    color: isActive
                      ? t.palette.mode === "dark" ? t.palette.success.light : t.palette.success.dark
                      : "text.secondary",
                    bgcolor: isActive
                      ? alpha(t.palette.success.main, t.palette.mode === "dark" ? 0.2 : 0.14)
                      : subtleBg(t, true),
                  })}
                />
              )}
            </Stack>
          </Box>
        </Stack>

        {/* Быстрые контакты + основное действие: на телефоне отдельный ряд по центру */}
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{
            flexShrink: 0,
            justifyContent: "center",
            flexWrap: "wrap",
            rowGap: 1,
          }}
        >
          {/* Быстрые контакты — группой */}
          <Stack direction="row" spacing={1} alignItems="center">
            <QuickContact
              icon={<LocalPhoneOutlined />}
              label="Позвонить"
              href={phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : undefined}
            />
            <QuickContact
              icon={<TelegramIcon />}
              label="Telegram"
              href={telegramId ? `https://t.me/${telegramId.replace(/^@/, "")}` : undefined}
            />
            <QuickContact
              icon={<EmailOutlined />}
              label="Написать на почту"
              href={email ? `mailto:${email}` : undefined}
            />
          </Stack>
          {onEdit && (
            <AppButton
              variant="contained"
              startIcon={<EditOutlined fontSize="small" />}
              onClick={onEdit}
              sx={{ flexShrink: 0 }}
            >
              {isMobile ? "Изменить" : "Редактировать"}
            </AppButton>
          )}
        </Stack>
      </Stack>
    </AppCard>
  );
};

/** Сегментированный переключатель секций — компактный «тумблер» (как 7д/30д/90д
 *  на дашборде): группа в тонкой грани, у активного — заливка primary с подвижным
 *  фоном (framer-motion layoutId). */
const SegmentedTabs: React.FC<{
  tabs: { key: string; label: string; icon: React.ReactElement }[];
  value: number;
  onChange: (v: number) => void;
}> = ({ tabs, value, onChange }) => (
  <Box
    role="tablist"
    sx={{
      display: "flex",
      gap: 0.5,
      p: 0.5,
      borderRadius: "10px",
      border: 1,
      borderColor: "divider",
      bgcolor: "background.paper",
      width: "fit-content",
      maxWidth: "100%",
      overflowX: "auto",
    }}
  >
    {tabs.map((tabItem, i) => {
      const selected = i === value;
      return (
        <Box
          key={tabItem.key}
          role="tab"
          aria-selected={selected}
          onClick={() => onChange(i)}
          sx={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            px: { xs: 1.5, sm: 2 },
            py: 0.85,
            borderRadius: "7px",
            cursor: "pointer",
            whiteSpace: "nowrap",
            fontSize: "0.85rem",
            fontWeight: 500,
            userSelect: "none",
            color: selected ? "primary.contrastText" : "text.secondary",
            transition: "color .2s ease",
            "& .MuiSvgIcon-root": { fontSize: 17 },
            "&:hover": { color: selected ? "primary.contrastText" : "text.primary" },
            zIndex: 1,
          }}
        >
          {selected && (
            <MotionBox
              layoutId="profile-tab-pill"
              transition={{ type: "spring", stiffness: 480, damping: 38 }}
              sx={{
                position: "absolute",
                inset: 0,
                borderRadius: "7px",
                bgcolor: "primary.main",
                zIndex: -1,
              }}
            />
          )}
          {tabItem.icon}
          {tabItem.label}
        </Box>
      );
    })}
  </Box>
);

export default ProfilePage;
