import MenuOutlined from "@mui/icons-material/MenuOutlined";
import RefreshOutlined from "@mui/icons-material/RefreshOutlined";
import LocalPhoneOutlined from "@mui/icons-material/LocalPhoneOutlined";
import TelegramIcon from "@mui/icons-material/Telegram";
import EmailOutlined from "@mui/icons-material/EmailOutlined";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import OpenInNewOutlined from "@mui/icons-material/OpenInNewOutlined";
import { usePermissions } from "../../hooks/usePermissions";
import appIcon from "../../assets/img/icon_2.png";

import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import Chip from "@mui/material/Chip";
import { alpha } from "@mui/material/styles";

import { RefineThemedLayoutHeaderProps } from "@refinedev/mui";
import React from "react";
import { useNavigate } from "react-router";
import { useMobileSidebar } from "../sidebar/mobile-context";
import { useRefresh } from "../../contexts/refresh-context";
import { supabase } from "../../utility/supabaseClient";
import { useTitleContext } from "../../contexts/title-context";
import { mapAnyToEmployee, fetchEmployeeSpecialization } from "../../features/employees/api";
import { Employee } from "../../features/employees/types";
import { DB_TABLES } from "../../utility/constants";
import { IS_DJANGO_BACKEND } from "../../config/backend";
import { UserAvatar } from "../ui";

/** Строка-инфо в стандартном стиле: плиточная иконка + подпись/значение. */
const ProfileInfoRow: React.FC<{
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

export const Header: React.FC<RefineThemedLayoutHeaderProps> = ({
  sticky = true,
}) => {
  const [employee, setEmployee] = React.useState<Employee | null>(null);
  const [profileOpen, setProfileOpen] = React.useState(false);
  const [roleInfo, setRoleInfo] = React.useState<{ name: string; display_name: string } | null>(null);
  const [specializationName, setSpecializationName] = React.useState<string | null>(null);
  const navigate = useNavigate();
  const { toggle } = useMobileSidebar();
  const { triggerRefresh, onRefresh } = useRefresh();
  const { title } = useTitleContext();

  const { employee: empFromPerms, role } = usePermissions();

  React.useEffect(() => {
    if (empFromPerms) {
      setEmployee(mapAnyToEmployee(empFromPerms));
      const r = empFromPerms.roles || role;
      if (r) {
        setRoleInfo(r);
        if (!IS_DJANGO_BACKEND && r.name === "doctor" && empFromPerms.id) {
          fetchEmployeeSpecialization(String(empFromPerms.id)).then(async (specId) => {
            if (specId) {
              const { data: sData } = await supabase
                .from(DB_TABLES.SPECIALIZATIONS)
                .select("name")
                .eq("id", specId)
                .single();
              if (sData) setSpecializationName(sData.name);
            }
          });
        }
      }
    } else {
      setEmployee(null);
      setRoleInfo(null);
      setSpecializationName(null);
    }
  }, [empFromPerms, role]);

  const displayAvatar = employee?.photo_url || undefined;
  const displayName = employee?.full_name || "Пользователь";
  const displayEmail = employee?.email;
  const roleText =
    roleInfo?.display_name ||
    (roleInfo?.name === "doctor" ? "Врач" : roleInfo?.name) ||
    (employee?.status === "active" ? "Сотрудник" : "Пользователь");

  const openProfilePage = () => {
    setProfileOpen(false);
    navigate("/profile");
  };


  return (
    <AppBar
      position={sticky ? "sticky" : "relative"}
      color="default"
      sx={{
        bgcolor: (theme) => theme.palette.background.paper,
        color: (theme) => theme.palette.text.primary,
        borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
        zIndex: (theme) => theme.zIndex.appBar,
      }}
      elevation={0}
    >
      <Toolbar
        sx={{
          minHeight: { xs: 56, sm: 64 },
          px: { xs: 1, sm: 2 },
          gap: { xs: 0.5, sm: 1 },
        }}
      >
        {/* Левая часть: Бургер-меню + Компактный логотип */}
        <Stack direction="row" alignItems="center" spacing={{ xs: 0.5, sm: 1 }}>
          <IconButton
            color="inherit"
            onClick={toggle}
            aria-label="Открыть меню"
            size="small"
            sx={{
              display: { xs: "inline-flex", md: "none" },
              p: { xs: 0.5, sm: 1 },
              ml: { xs: 1, sm: 1.5 }, // Сдвиг бургера вправо
            }}
          >
            <MenuOutlined fontSize="small" />
          </IconButton>

          {/* Компактный логотип (320px - 750px) */}
          <Box
            component="img"
            src={appIcon}
            alt="Мама Доктор"
            sx={{
              height: { xs: 24, sm: 28 },
              width: "auto",
              display: { xs: "block", md: "none" },
              '@media (min-width: 750px)': {
                display: "none",
              },
            }}
          />
        </Stack>

        {/* Центр: Заголовок страницы */}
        <Box sx={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          pointerEvents: "none", // Чтобы не мешать кликам если что
          maxWidth: { xs: "50%", md: "60%" },
        }}>
          <Typography
            variant="subtitle1"
            sx={{
              fontWeight: 700,
              fontSize: "1.5rem",
              color: "text.primary",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              opacity: title ? 1 : 0,
              transition: "opacity 0.3s ease",
            }}
          >
            {title}
          </Typography>
        </Box>

        {/* Spacer to push right content if needed, but absolute positioning handles center */}
        <Box sx={{ flex: 1 }} />

        {/* Правая часть: Refresh + Avatar */}
        <Stack
          direction="row"
          alignItems="center"
          spacing={{ xs: 0.5, sm: 1 }}
          sx={{ ml: "auto" }}
        >
          <IconButton
            color="inherit"
            onClick={() => {
              if (onRefresh) {
                triggerRefresh();
              } else {
                window.location.reload();
              }
            }}
            aria-label="Обновить"
            size="small"
            sx={{
              p: { xs: 0.5, sm: 1 },
              bgcolor: (theme) => theme.palette.mode === 'dark'
                ? 'rgba(255, 255, 255, 0.08)'
                : 'rgba(0, 0, 0, 0.04)',
              borderRadius: '50%',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              '&:hover': {
                bgcolor: (theme) => theme.palette.primary.main,
                color: (theme) => theme.palette.primary.contrastText,
                transform: 'rotate(180deg)',
                boxShadow: (theme) => `0 4px 12px ${theme.palette.primary.main}40`,
              },
              '&:active': {
                transform: 'rotate(180deg) scale(0.9)',
              },
            }}
          >
            <RefreshOutlined sx={{ fontSize: { xs: 18, sm: 20 } }} />
          </IconButton>

          {(displayAvatar || displayName) && (
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              onClick={() => setProfileOpen(true)}
              sx={{
                cursor: "pointer",
                ml: 0.5,
                borderRadius: 24,
                pr: { xs: 0, md: 1.5 },
                py: 0.5,
                transition: 'background-color 0.2s',
                '&:hover': {
                  bgcolor: (theme) => theme.palette.mode === 'dark'
                    ? 'rgba(255, 255, 255, 0.08)'
                    : 'rgba(0, 0, 0, 0.04)',
                }
              }}
            >
              <UserAvatar src={displayAvatar} name={displayName} size={36} sx={{ width: { xs: 28, sm: 32, md: 36 }, height: { xs: 28, sm: 32, md: 36 } }} />
              <Typography
                variant="subtitle2"
                noWrap
                sx={{
                  display: { xs: "none", md: "block" },
                  maxWidth: 200,
                  fontWeight: 600,
                  color: 'text.primary'
                }}
              >
                {displayName}
              </Typography>
            </Stack>
          )}

          {/* Модалка профиля — быстрый просмотр + переход на полную страницу */}
          <Dialog
            open={profileOpen}
            onClose={() => setProfileOpen(false)}
            maxWidth="xs"
            fullWidth
            PaperProps={{ sx: { borderRadius: 1.5, overflow: "hidden" } }}
          >
            <DialogContent sx={{ p: 0 }}>
              {/* Шапка: тонированная плашка + кнопка закрытия */}
              <Box sx={{ position: "relative" }}>
                <Box
                  sx={{
                    height: 88,
                    bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                  }}
                />
                <IconButton
                  size="small"
                  onClick={() => setProfileOpen(false)}
                  sx={{ position: "absolute", top: 8, right: 8, color: "text.secondary" }}
                  aria-label="Закрыть"
                >
                  <CloseOutlined fontSize="small" />
                </IconButton>
              </Box>

              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", px: 3, pb: 3 }}>
                <UserAvatar
                  src={displayAvatar}
                  name={displayName}
                  size={96}
                  sx={{
                    mt: "-48px",
                    border: (theme) => `4px solid ${theme.palette.background.paper}`,
                    zIndex: 1,
                  }}
                />

                <Box sx={{ textAlign: "center", mt: 1.5, mb: 2.5 }}>
                  <Typography variant="h6" component="h2" fontWeight={700}>
                    {displayName}
                  </Typography>
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, alignItems: "center", mt: 0.75 }}>
                    <Typography variant="body2" color="text.secondary" fontWeight={500}>
                      {roleText}
                    </Typography>
                    {specializationName && (
                      <Typography variant="body2" color="primary" fontWeight={600}>
                        {specializationName}
                      </Typography>
                    )}
                    {employee?.status && (
                      <Chip
                        label={employee.status === "active" ? "Работает" : "Неактивен"}
                        size="small"
                        color={employee.status === "active" ? "success" : "default"}
                        variant="filled"
                        sx={{ mt: 0.5, fontWeight: 600, fontSize: "0.75rem", height: 20 }}
                      />
                    )}
                  </Box>
                </Box>

                <Stack spacing={1} sx={{ width: "100%" }}>
                  <ProfileInfoRow
                    icon={<LocalPhoneOutlined />}
                    label="Телефон"
                    value={employee?.phone}
                    active={Boolean(employee?.phone)}
                  />
                  <ProfileInfoRow
                    icon={<TelegramIcon />}
                    label="Telegram ID"
                    value={employee?.telegram_id}
                    active={Boolean(employee?.telegram_id)}
                  />
                  <ProfileInfoRow
                    icon={<EmailOutlined />}
                    label="Email"
                    value={displayEmail}
                    active={Boolean(displayEmail)}
                  />
                  <ProfileInfoRow
                    icon={<CreditCardOutlined />}
                    label="Банковский счет"
                    value={
                      employee?.bank_account_number
                        ? employee.bank_account_number.replace(/(.{4})/g, "$1 ").trim()
                        : undefined
                    }
                    active={Boolean(employee?.bank_account_number)}
                    monospace
                  />
                </Stack>

                <Button
                  variant="contained"
                  fullWidth
                  startIcon={<OpenInNewOutlined />}
                  onClick={openProfilePage}
                  sx={{ mt: 2.5 }}
                >
                  Открыть профиль
                </Button>
                <Button
                  variant="text"
                  fullWidth
                  onClick={() => setProfileOpen(false)}
                  sx={{ mt: 1 }}
                >
                  Закрыть
                </Button>
              </Box>
            </DialogContent>
          </Dialog>

        </Stack>
      </Toolbar>
    </AppBar>
  );
};

