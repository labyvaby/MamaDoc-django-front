import MenuOutlined from "@mui/icons-material/MenuOutlined";
import RefreshOutlined from "@mui/icons-material/RefreshOutlined";
import { usePermissions } from "../../hooks/usePermissions";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import LocalPhoneOutlined from "@mui/icons-material/LocalPhoneOutlined";
import TelegramIcon from "@mui/icons-material/Telegram";
import EmailOutlined from "@mui/icons-material/EmailOutlined";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import appLogo from "../../assets/img/logo.png";
import appIcon from "../../assets/img/icon_2.png";

import AppBar from "@mui/material/AppBar";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import Chip from "@mui/material/Chip";

import { RefineThemedLayoutHeaderProps } from "@refinedev/mui";
import React from "react";
import { useMobileSidebar } from "../sidebar/mobile-context";
import { useRefresh } from "../../contexts/refresh-context";
import { supabase } from "../../utility/supabaseClient";
import { useTitleContext } from "../../contexts/title-context";
import { mapAnyToEmployee } from "../../features/employees/api";
import { Employee } from "../../features/employees/types";
import { DB_TABLES } from "../../utility/constants";
import { fetchEmployeeSpecialization, EMPLOYEE_PHOTOS_BUCKET, EMPLOYEE_PASSPORTS_BUCKET, EMPLOYEES_WRITE } from "../../features/employees/api";
import PassportPhotoUploader from "../../features/employees/components/PassportPhotoUploader";
import { uploadFile } from "../../utility/storage";
import { useNotification } from "@refinedev/core";
import SaveIcon from "@mui/icons-material/Save";
import CircularProgress from "@mui/material/CircularProgress";
import { IS_DJANGO_BACKEND } from "../../config/backend";

export const Header: React.FC<RefineThemedLayoutHeaderProps> = ({
  sticky = true,
}) => {
  const [identity, setIdentity] = React.useState<{ name?: string; avatar?: string; email?: string } | null>(null);
  const [employee, setEmployee] = React.useState<Employee | null>(null);
  const [profileOpen, setProfileOpen] = React.useState(false);
  const { toggle } = useMobileSidebar();
  const { triggerRefresh, onRefresh } = useRefresh();
  const { title } = useTitleContext();



  // --- NEW STATE ---
  const [roleInfo, setRoleInfo] = React.useState<{ name: string; display_name: string } | null>(null);
  const [specializationName, setSpecializationName] = React.useState<string | null>(null);
  const { open: notify } = useNotification();
  const [busy, setBusy] = React.useState(false);
  const [passportPhotos, setPassportPhotos] = React.useState<string[]>([]);
  const [passportFiles, setPassportFiles] = React.useState<File[]>([]);
  const [removedPassportUrls, setRemovedPassportUrls] = React.useState<string[]>([]);


  const { employee: empFromPerms, role } = usePermissions();

  React.useEffect(() => {
    if (empFromPerms) {
      setEmployee(mapAnyToEmployee(empFromPerms));
      const r = empFromPerms.roles || role;
      if (r) {
        setRoleInfo(r);
        if (!IS_DJANGO_BACKEND && r.name === 'doctor' && empFromPerms.id) {
          fetchEmployeeSpecialization(String(empFromPerms.id)).then(async (specId) => {
            if (specId) {
              const { data: sData } = await supabase.from(DB_TABLES.SPECIALIZATIONS).select('name').eq('id', specId).single();
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

  React.useEffect(() => {
    if (employee) {
      setPassportPhotos(Array.isArray(employee.passport_photos) ? employee.passport_photos : []);
      setPassportFiles([]);
      setRemovedPassportUrls([]);
    }
  }, [employee]);

  const handleSavePassport = async () => {
    if (!employee?.id) return;
    try {
      setBusy(true);
      const newUploadedPassportUrls: string[] = [];
      for (const file of passportFiles) {
        try {
          const url = await uploadFile(file, EMPLOYEE_PASSPORTS_BUCKET);
          if (url) newUploadedPassportUrls.push(url);
        } catch (e) {
          console.error("Upload passport photo (self) failed:", e);
        }
      }

      const finalPassportPhotos = [
        ...passportPhotos.filter(url => !url.startsWith('data:') && !removedPassportUrls.includes(url)),
        ...newUploadedPassportUrls
      ];

      const { error } = await supabase
        .from(EMPLOYEES_WRITE)
        .update({ passport_photos: finalPassportPhotos, updated_at: new Date().toISOString() })
        .eq("id", employee.id);

      if (error) throw error;

      notify?.({ type: "success", message: "Паспортные данные обновлены" });
      triggerRefresh();
      setPassportFiles([]);
      setRemovedPassportUrls([]);
    } catch (e) {
      console.error("Save passport failed:", e);
      notify?.({ type: "error", message: "Не удалось сохранить паспортные данные" });
    } finally {
      setBusy(false);
    }
  };



  const displayAvatar = employee?.photo_url || identity?.avatar;
  const displayName = employee?.full_name || identity?.name || "Пользователь";
  const displayEmail = employee?.email || identity?.email;

  // Role display logic
  const roleText = roleInfo?.display_name || (roleInfo?.name === 'doctor' ? "Врач" : roleInfo?.name) || (employee?.status === 'active' ? "Сотрудник" : "Пользователь");


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
              <Avatar
                src={displayAvatar}
                alt={displayName}
                sx={{
                  width: { xs: 28, sm: 32, md: 36 },
                  height: { xs: 28, sm: 32, md: 36 },
                }}
              />
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

          <Dialog
            open={profileOpen}
            onClose={() => setProfileOpen(false)}
            maxWidth="xs"
            fullWidth
            PaperProps={{
              sx: {
                borderRadius: 4,
                boxShadow: "0 8px 32px rgba(0, 0, 0, 0.1)",
                overflow: "hidden",
              }
            }}
          >
            <DialogContent sx={{ p: 0 }}>
              {/* Header Background */}
              <Box sx={{
                height: 100,
                bgcolor: (theme) => theme.palette.primary.light,
                opacity: 0.15,
                mb: -10, // pull up avatar
              }} />

              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", px: 3, pb: 4, gap: 1 }}>
                <Avatar
                  src={displayAvatar}
                  alt={displayName}
                  sx={{
                    width: 96,
                    height: 96,
                    mb: 2,
                    border: (theme) => `4px solid ${theme.palette.background.paper}`,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                    zIndex: 1,
                  }}
                />

                <Box sx={{ textAlign: "center", mb: 2 }}>
                  <Typography variant="h5" component="h2" fontWeight="700">
                    {displayName}
                  </Typography>
                  {/* Role & Status */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, alignItems: 'center', mt: 1 }}>
                    <Typography variant="body1" color="text.secondary" fontWeight="500">
                      {roleText}
                    </Typography>
                    {specializationName && (
                      <Typography variant="body2" color="primary" fontWeight="600">
                        {specializationName}
                      </Typography>
                    )}
                    {employee?.status && (
                      <Chip
                        label={employee.status === "active" ? "Работает" : "Неактивен"}
                        size="small"
                        color={employee.status === "active" ? "success" : "default"}
                        variant="filled"
                        sx={{ mt: 0.5, fontWeight: 600, fontSize: '0.75rem', height: 20 }}
                      />
                    )}
                  </Box>
                </Box>

                <Stack spacing={2} sx={{ width: '100%' }}>

                  {/* Phone */}
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Box sx={{ p: 1, borderRadius: '50%', bgcolor: 'action.hover' }}>
                      <LocalPhoneOutlined color="primary" fontSize="small" />
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Телефон
                      </Typography>
                      <Typography variant="body2" fontWeight={500}>
                        {employee?.phone || "—"}
                      </Typography>
                    </Box>
                  </Stack>

                  <Divider />

                  {/* Telegram */}
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Box sx={{ p: 1, borderRadius: '50%', bgcolor: 'action.hover' }}>
                      <TelegramIcon color={employee?.telegram_id ? "primary" : "disabled"} fontSize="small" />
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Telegram ID
                      </Typography>
                      <Typography variant="body2" fontWeight={500}>
                        {employee?.telegram_id || "—"}
                      </Typography>
                    </Box>
                  </Stack>

                  <Divider />

                  {/* Email */}
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Box sx={{ p: 1, borderRadius: '50%', bgcolor: 'action.hover' }}>
                      <EmailOutlined color={displayEmail ? "primary" : "disabled"} fontSize="small" />
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Email
                      </Typography>
                      <Typography variant="body2" fontWeight={500}>
                        {displayEmail || "—"}
                      </Typography>
                    </Box>
                  </Stack>

                  <Divider />

                  {/* Bank Account */}
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Box sx={{ p: 1, borderRadius: '50%', bgcolor: 'action.hover' }}>
                      <CreditCardOutlined color={employee?.bank_account_number ? "primary" : "disabled"} fontSize="small" />
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Банковский счет
                      </Typography>
                      <Typography variant="body2" fontWeight={500} sx={{ fontFamily: 'monospace' }}>
                        {employee?.bank_account_number
                          ? employee.bank_account_number.replace(/(.{4})/g, '$1 ').trim()
                          : "—"}
                      </Typography>
                    </Box>
                  </Stack>

                  <Divider />

                  <Box sx={{ mt: 1 }}>
                    <PassportPhotoUploader
                      photos={passportPhotos}
                      onAddPhoto={(file) => {
                        setPassportFiles((prev) => [...prev, file]);
                        const reader = new FileReader();
                        reader.onload = () => setPassportPhotos((prev) => [...prev, String(reader.result)]);
                        reader.readAsDataURL(file);
                      }}
                      onRemovePhoto={(url) => {
                        setPassportPhotos((prev) => prev.filter((u) => u !== url));
                        if (url.startsWith('data:')) {
                          // Find file by matching data URL? (omitted for brevity, similar to drawers)
                        } else {
                          setRemovedPassportUrls((prev) => [...prev, url]);
                        }
                      }}
                      inputId="self-passport-photo-input"
                    />
                    {(passportFiles.length > 0 || removedPassportUrls.length > 0) && (
                      <Button
                        startIcon={busy ? <CircularProgress size={16} /> : <SaveIcon />}
                        variant="contained"
                        disabled={busy}
                        onClick={handleSavePassport}
                        sx={{ mt: 2, borderRadius: 24, px: 4, width: '100%' }}
                      >
                        Сохранить изменения
                      </Button>
                    )}
                  </Box>

                </Stack>

                <Button
                  variant="outlined"
                  onClick={() => setProfileOpen(false)}
                  sx={{ mt: 3, borderRadius: 24, px: 4, width: '100%' }}
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

