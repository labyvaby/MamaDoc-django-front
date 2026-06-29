import React, { useEffect, useState } from "react";
import {
  Divider,
  Stack,
  Typography,
  Chip,
  CircularProgress,
  Card,
  CardHeader,
  CardContent,
  Box,
  ImageList,
  ImageListItem,
  Modal,
  IconButton,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import LocalPhoneOutlined from "@mui/icons-material/LocalPhoneOutlined";
import LocalOfferOutlined from "@mui/icons-material/LocalOfferOutlined";
import TelegramIcon from "@mui/icons-material/Telegram";
import EmailOutlined from "@mui/icons-material/EmailOutlined";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import CakeOutlined from "@mui/icons-material/CakeOutlined";
import BadgeOutlined from "@mui/icons-material/BadgeOutlined";
import ContactPageOutlined from "@mui/icons-material/ContactPageOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import WorkOutlined from "@mui/icons-material/WorkOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import type { EmployesRow } from "../types";
import type { ServiceRow as ServiceDto } from "../../../services/services";

import { formatDateRu } from "../../../utility/format";
import { getEmployeeServices } from "../../../api/staff";
import { useOne } from "@refinedev/core";
import { DB_TABLES } from "../../../utility/constants";
import { IS_DJANGO_BACKEND } from "../../../config/backend";
import { AppButton, UserAvatar, InfoTile } from "../../../components/ui";
import { subtleBg } from "../../../theme/uiHelpers";

// Supabase-only helpers: loaded dynamically so supabaseClient stays out of Django bundle
async function _loadSupabaseServiceIds(empId: string): Promise<string[]> {
  const { fetchEmployeeServiceIds } = await import("../api");
  return fetchEmployeeServiceIds(empId);
}
async function _loadSupabaseSpecialization(empId: string): Promise<string> {
  const { fetchEmployeeSpecialization } = await import("../api");
  return (await fetchEmployeeSpecialization(empId)) || "";
}

export type EmployeeCardProps = {
  emp: EmployesRow | null;
  allServices: ServiceDto[];
  /** Django-only: открыть drawer управления услугами */
  onOpenServices?: (employeeId: number, employeeName: string) => void;
  /** Открыть редактирование карточки */
  onEdit?: (emp: EmployesRow) => void;
};

const calculateAge = (birthDate: string) => {
  if (!birthDate) return "";
  const birth = new Date(birthDate);
  const now = new Date();
  let monthDiff =
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) monthDiff--;

  const y = Math.floor(monthDiff / 12);
  const m = monthDiff % 12;

  const declension = (number: number, titles: [string, string, string]) => {
    const cases = [2, 0, 1, 1, 1, 2];
    return titles[
      number % 100 > 4 && number % 100 < 20 ? 2 : cases[number % 10 < 5 ? number % 10 : 5]
    ];
  };

  const yearsStr = `${y} ${declension(y, ["год", "года", "лет"])}`;
  const monthsStr =
    m > 0 ? ` и ${m} ${declension(m, ["месяц", "месяца", "месяцев"])}` : "";

  return `(${yearsStr}${monthsStr})`;
};

/** Заголовок секции в карточке: иконка-акцент + приглушённая подпись + опц. действие. */
const SectionHeader: React.FC<{
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
}> = ({ icon, title, action }) => (
  <Stack
    direction="row"
    alignItems="center"
    justifyContent="space-between"
    sx={{ mb: 1.5 }}
  >
    <Stack direction="row" alignItems="center" gap={1}>
      <Box sx={{ color: "primary.onSurface", display: "flex", "& .MuiSvgIcon-root": { fontSize: 18 } }}>
        {icon}
      </Box>
      <Typography variant="subtitle2" fontWeight={600} color="text.secondary">
        {title}
      </Typography>
    </Stack>
    {action}
  </Stack>
);

const EmployeeCard: React.FC<EmployeeCardProps> = ({
  emp,
  allServices,
  onOpenServices,
  onEdit,
}) => {
  const [fetchedServiceIds, setFetchedServiceIds] = useState<string[]>([]);
  // Django-режим: полные объекты услуг загружаются сразу (не нужен allServices для маппинга)
  const [djangoServices, setDjangoServices] = useState<{ id: string; name: string }[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!emp?.id) {
      setFetchedServiceIds([]);
      setDjangoServices([]);
      return;
    }

    const loadServices = async () => {
      setIsLoadingServices(true);
      try {
        if (IS_DJANGO_BACKEND) {
          const empNumId = Number(emp.id);
          if (!isNaN(empNumId) && empNumId > 0) {
            const assignments = await getEmployeeServices(empNumId);
            setDjangoServices(
              assignments.map((a) => ({
                id: String(a.service.id),
                name: a.service.name,
              })),
            );
            setFetchedServiceIds(assignments.map((a) => String(a.service.id)));
          } else {
            setDjangoServices([]);
            setFetchedServiceIds([]);
          }
        } else {
          const ids = await _loadSupabaseServiceIds(emp.id);
          setFetchedServiceIds(ids);
        }
      } catch (err) {
        console.error("Ошибка загрузки услуг сотрудника:", err);
        setFetchedServiceIds([]);
        setDjangoServices([]);
      } finally {
        setIsLoadingServices(false);
      }
    };

    loadServices();
    // Зависим и от updated_at: после сохранения карточки id не меняется, но
    // updated_at — да, поэтому услуги перечитываются без перезагрузки страницы.
  }, [emp?.id, emp?.updated_at]);

  // Supabase-only: роль через useOne (в Django-режиме хук вызывается, но disabled)
  const { result: roleData } = useOne<{ id: string; name: string; display_name: string }>({
    resource: DB_TABLES.ROLES,
    id: emp?.role_id || "",
    queryOptions: {
      enabled: !IS_DJANGO_BACKEND && !!emp?.role_id,
    },
  });

  // Supabase-only: специализация через useOne (в Django-режиме хук вызывается, но disabled)
  const [localSpecId, setLocalSpecId] = useState<string>("");
  useEffect(() => {
    if (!IS_DJANGO_BACKEND && emp?.id && roleData?.name === "doctor") {
      _loadSupabaseSpecialization(emp.id).then((id) => setLocalSpecId(id));
    } else {
      setLocalSpecId("");
    }
  }, [emp?.id, roleData?.name, emp]);

  const { result: specData } = useOne<{ id: string; name: string }>({
    resource: DB_TABLES.SPECIALIZATIONS,
    id: localSpecId,
    queryOptions: {
      enabled: !IS_DJANGO_BACKEND && !!localSpecId,
    },
  });

  // ── Вычисляем отображаемую роль ───────────────────────────────────────────
  let roleDisplayName = "";
  let isDoctor = false;

  if (IS_DJANGO_BACKEND) {
    const dr = emp?._djangoRole;
    if (dr) {
      // Используем name как display — бэкенд возвращает display_name в поле name (или code для внутреннего кода)
      roleDisplayName = dr.name;
      isDoctor = dr.code === "doctor";
    }
  } else {
    const getRoleDisplayName = (r?: { name: string; display_name: string }) => {
      if (!r) return "";
      if (r.display_name) return r.display_name;
      switch (r.name) {
        case "doctor": return "Врач";
        case "nurse": return "Медсестра";
        case "admin": return "Управляющий";
        case "receptionist": return "Регистратор";
        case "accountant": return "Бухгалтер";
        default: return "Сотрудник";
      }
    };
    roleDisplayName = getRoleDisplayName(roleData);
    isDoctor = roleData?.name === "doctor";
  }

  // Специализации для Django-режима
  const djangoSpecs = IS_DJANGO_BACKEND ? (emp?._djangoSpecializations ?? []) : [];
  const supabaseSpecName = !IS_DJANGO_BACKEND ? specData?.name : undefined;

  const fio = emp?.full_name || emp?.id || "";
  const phone = emp?.phone || "";
  const birth = emp?.birth_date || "";
  const photo = emp?.photo_url || undefined;
  const roleText =
    roleDisplayName || (emp?.status === "active" ? "Сотрудник" : "—");
  const status = emp?.status;
  const isActive = status === "active";
  const isFired = status === "fired";
  const statusText = isActive
    ? "Работает"
    : status === "inactive"
    ? "Не работает"
    : isFired
    ? "Уволен"
    : status || "—";

  type UnknownRecord = Record<string, unknown>;
  const isRecord = (v: unknown): v is UnknownRecord =>
    typeof v === "object" && v !== null;

  const getSafeId = (service: ServiceDto | UnknownRecord): string => {
    if (isRecord(service)) {
      const raw =
        (service as UnknownRecord)["ID"] ?? (service as UnknownRecord)["id"];
      if (typeof raw === "string" || typeof raw === "number") return String(raw);
    }
    return "";
  };

  const getSafeName = (service: ServiceDto | UnknownRecord): string => {
    if (isRecord(service)) {
      const rawName =
        (service as UnknownRecord)["name"] ??
        (service as UnknownRecord)["service_name"];
      if (typeof rawName === "string" && rawName.trim().length > 0)
        return rawName;
    }
    const id = getSafeId(service);
    return id || "Без названия";
  };

  const servicesForEmployee = React.useMemo(() => {
    if (IS_DJANGO_BACKEND) {
      return djangoServices;
    }
    if (fetchedServiceIds.length === 0 || allServices.length === 0)
      return [] as { id: string; name: string }[];

    return fetchedServiceIds.map((linkId): { id: string; name: string } => {
      const link = String(linkId);
      const svc = allServices.find((s) => getSafeId(s) === link);
      if (svc) return { id: link, name: getSafeName(svc) };
      return { id: link, name: `ID: ${link}` };
    });
  }, [djangoServices, fetchedServiceIds, allServices]);

  const formatBank = (v: string) => v.replace(/(.{4})/g, "$1 ").trim();

  return (
    <Card
      variant="outlined"
      sx={{ height: "100%", display: "flex", flexDirection: "column" }}
    >
      <CardHeader
        title={
          <Stack direction="row" alignItems="center" gap={1.25}>
            <Box
              sx={{
                width: 3,
                height: 16,
                borderRadius: 3,
                bgcolor: "primary.main",
              }}
            />
            <Typography variant="subtitle1" fontWeight={600}>
              Карточка сотрудника
            </Typography>
          </Stack>
        }
        action={
          emp && onEdit ? (
            <AppButton
              size="small"
              startIcon={<EditOutlined fontSize="small" />}
              onClick={() => onEdit(emp)}
            >
              Редактировать
            </AppButton>
          ) : undefined
        }
      />
      <Divider />
      <CardContent sx={{ flex: 1, overflowY: "auto" }}>
        {emp ? (
          <Stack spacing={3}>
            {/* Hero: аватар-плашка + имя + ник + чипы */}
            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
              <Box sx={{ position: "relative", flexShrink: 0 }}>
                <UserAvatar src={photo} name={fio} size={76} sx={{ borderRadius: "18px" }} />
                {status && (
                  <Box
                    sx={(t) => ({
                      position: "absolute",
                      right: -2,
                      bottom: -2,
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      border: `3px solid ${t.palette.background.paper}`,
                      bgcolor: isActive
                        ? t.palette.success.main
                        : isFired
                        ? t.palette.error.main
                        : t.palette.grey[500],
                    })}
                  />
                )}
              </Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="h6" fontWeight={700} sx={{ letterSpacing: -0.2, lineHeight: 1.2 }}>
                  {fio || emp.id}
                </Typography>
                {emp.nickname && (
                  <Typography variant="body2" color="primary.onSurface" fontWeight={600} sx={{ mt: 0.25 }}>
                    {emp.nickname}
                  </Typography>
                )}
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1, flexWrap: "wrap", rowGap: 0.75 }}>
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
                      label={statusText}
                      icon={
                        <Box
                          component="span"
                          sx={(t) => ({
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            bgcolor: isActive
                              ? t.palette.success.main
                              : isFired
                              ? t.palette.error.main
                              : t.palette.grey[500],
                            ml: 0.75,
                          })}
                        />
                      }
                      sx={(t) => {
                        const tone = isActive
                          ? t.palette.success
                          : isFired
                          ? t.palette.error
                          : null;
                        return {
                          fontWeight: 500,
                          height: 24,
                          borderRadius: "7px",
                          "& .MuiChip-icon": { ml: 0.75, mr: -0.25 },
                          color: tone
                            ? t.palette.mode === "dark" ? tone.light : tone.dark
                            : "text.secondary",
                          bgcolor: tone
                            ? alpha(tone.main, t.palette.mode === "dark" ? 0.2 : 0.14)
                            : subtleBg(t, true),
                        };
                      }}
                    />
                  )}
                </Stack>
              </Box>
            </Stack>

            {/* Контактные данные */}
            <Box>
              <SectionHeader icon={<ContactPageOutlined />} title="Контактные данные" />
              <Box sx={{ display: "grid", gap: 1.25, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
                <InfoTile icon={<LocalPhoneOutlined />} label="Телефон" value={phone} active={Boolean(phone)} />
                <InfoTile
                  icon={<CakeOutlined />}
                  label="Дата рождения"
                  active={Boolean(birth)}
                  value={
                    birth ? (
                      <>
                        {formatDateRu(birth)}{" "}
                        <Box component="span" sx={{ color: "text.secondary", fontWeight: 400 }}>
                          {calculateAge(birth)}
                        </Box>
                      </>
                    ) : undefined
                  }
                />
                <InfoTile icon={<TelegramIcon />} label="Telegram ID" value={emp.telegram_id} active={Boolean(emp.telegram_id)} />
                <InfoTile icon={<EmailOutlined />} label="Email" value={emp.email} active={Boolean(emp.email)} />
                <InfoTile
                  icon={<CreditCardOutlined />}
                  label="Номер счёта"
                  value={emp.bank_account_number ? formatBank(emp.bank_account_number) : undefined}
                  active={Boolean(emp.bank_account_number)}
                  monospace
                />
                <InfoTile icon={<BadgeOutlined />} label="ИНН" value={emp.inn} active={Boolean(emp.inn)} monospace />
                {IS_DJANGO_BACKEND && (
                  <InfoTile
                    icon={<ContactPageOutlined />}
                    label="Заметки"
                    value={emp.notes}
                    active={Boolean(emp.notes)}
                  />
                )}
              </Box>
            </Box>

            {/* Специализации */}
            {((IS_DJANGO_BACKEND && djangoSpecs.length > 0) ||
              (!IS_DJANGO_BACKEND && isDoctor && supabaseSpecName)) && (
              <Box>
                <SectionHeader icon={<WorkOutlined />} title="Специализации" />
                <Stack direction="row" flexWrap="wrap" gap={1}>
                  {IS_DJANGO_BACKEND
                    ? djangoSpecs.map((sp) => (
                        <Chip
                          key={sp.id}
                          label={sp.name}
                          size="small"
                          icon={<WorkOutlined />}
                          variant="outlined"
                          sx={{ borderRadius: "7px", height: 30 }}
                        />
                      ))
                    : supabaseSpecName && (
                        <Chip
                          label={supabaseSpecName}
                          size="small"
                          icon={<WorkOutlined />}
                          variant="outlined"
                          sx={{ borderRadius: "7px", height: 30 }}
                        />
                      )}
                </Stack>
              </Box>
            )}

            {/* Паспортные фото */}
            {emp.passport_photos && emp.passport_photos.length > 0 && (
              <Box>
                <SectionHeader icon={<ContactPageOutlined />} title="Паспортные данные (фото)" />
                <ImageList cols={3} gap={10} sx={{ m: 0 }}>
                  {emp.passport_photos.map((url, i) => (
                    <ImageListItem
                      key={i}
                      sx={{
                        border: "1px solid",
                        borderColor: "divider",
                        borderRadius: "10px",
                        overflow: "hidden",
                      }}
                    >
                      <Box
                        component="img"
                        src={url}
                        alt={`Паспорт ${i + 1}`}
                        onClick={() => setPreviewUrl(url)}
                        sx={{
                          width: "100%",
                          height: 100,
                          objectFit: "cover",
                          display: "block",
                          cursor: "pointer",
                          "&:hover": { opacity: 0.8 },
                        }}
                      />
                    </ImageListItem>
                  ))}
                </ImageList>
              </Box>
            )}

            {/* Превью фото */}
            <Modal open={!!previewUrl} onClose={() => setPreviewUrl(null)}>
              <Box
                onClick={() => setPreviewUrl(null)}
                sx={{
                  position: "fixed",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  bgcolor: "rgba(0,0,0,0.85)",
                  zIndex: 1300,
                }}
              >
                <IconButton
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreviewUrl(null);
                  }}
                  sx={{
                    position: "absolute",
                    top: 20,
                    right: 20,
                    color: "white",
                    bgcolor: "rgba(255,255,255,0.1)",
                    "&:hover": { bgcolor: "rgba(255,255,255,0.2)" },
                  }}
                >
                  <CloseOutlined />
                </IconButton>
                {previewUrl && (
                  <Box
                    component="img"
                    src={previewUrl}
                    alt="Паспорт"
                    onClick={(e) => e.stopPropagation()}
                    sx={{
                      width: "70vw",
                      height: "70vh",
                      objectFit: "contain",
                      borderRadius: 2,
                      boxShadow: 24,
                    }}
                  />
                )}
              </Box>
            </Modal>

            {/* Услуги сотрудника */}
            <Box>
              <SectionHeader
                icon={<LocalOfferOutlined />}
                title="Услуги сотрудника"
                action={
                  <Stack direction="row" alignItems="center" gap={1}>
                    {isLoadingServices && <CircularProgress size={16} />}
                    {onOpenServices && emp && (
                      <AppButton
                        size="small"
                        variant="outlined"
                        startIcon={<SettingsOutlined fontSize="small" />}
                        onClick={() => {
                          const id =
                            typeof emp.id === "number" ? emp.id : Number(emp.id);
                          if (!isNaN(id)) onOpenServices(id, emp.full_name);
                        }}
                        sx={{ minWidth: 0 }}
                      >
                        Управление
                      </AppButton>
                    )}
                  </Stack>
                }
              />

              {servicesForEmployee.length > 0 ? (
                <Stack spacing={1}>
                  {servicesForEmployee.map((s) => (
                    <Stack
                      key={s.id}
                      direction="row"
                      alignItems="center"
                      gap={1.25}
                      sx={(t) => ({
                        p: 1.5,
                        border: 1,
                        borderColor: "divider",
                        borderRadius: "10px",
                        bgcolor: subtleBg(t),
                      })}
                    >
                      <LocalOfferOutlined sx={{ fontSize: 18, color: "primary.onSurface" }} />
                      <Typography variant="body2" fontWeight={500}>
                        {s.name}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  {isLoadingServices ? "Загрузка..." : "Нет привязанных услуг"}
                </Typography>
              )}
            </Box>
          </Stack>
        ) : (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              py: 8,
              opacity: 0.6,
            }}
          >
            <PersonOutlineOutlined
              sx={{ fontSize: 64, mb: 2, color: "text.secondary" }}
            />
            <Typography variant="body1" color="text.secondary">
              Выберите сотрудника из списка
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default EmployeeCard;
