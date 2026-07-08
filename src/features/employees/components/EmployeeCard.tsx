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
  Tooltip,
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
import InstagramIcon from "@mui/icons-material/Instagram";
import AccountBalanceOutlined from "@mui/icons-material/AccountBalanceOutlined";
import QrCode2Outlined from "@mui/icons-material/QrCode2Outlined";
import LockOutlined from "@mui/icons-material/LockOutlined";
import HomeOutlined from "@mui/icons-material/HomeOutlined";
import NotesOutlined from "@mui/icons-material/NotesOutlined";
import AccessTimeOutlined from "@mui/icons-material/AccessTimeOutlined";
import EventAvailableOutlined from "@mui/icons-material/EventAvailableOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import LinkOutlined from "@mui/icons-material/LinkOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import ChevronLeftOutlined from "@mui/icons-material/ChevronLeftOutlined";
import EmojiEventsOutlined from "@mui/icons-material/EmojiEventsOutlined";
import dayjs from "dayjs";
import "dayjs/locale/ru";
import type { EmployesRow } from "../types";
import type { ServiceRow as ServiceDto } from "../../../services/services";

import { formatDateRu } from "../../../utility/format";
import { getEmployeeServices } from "../../../api/staff";
import { useOne } from "@refinedev/core";
import { useQuery } from "@tanstack/react-query";
import { DB_TABLES } from "../../../utility/constants";
import { IS_DJANGO_BACKEND } from "../../../config/backend";
import { AppButton, UserAvatar, InfoTile } from "../../../components/ui";
import { subtleBg } from "../../../theme/uiHelpers";
import { usePermissions } from "../../../hooks/usePermissions";
import { useApiOrgId } from "../../../hooks/useApiOrgId";
import { useCan } from "../../../hooks/useCan";
import { getServices } from "../../../api/catalog";
import {
  getAchievementDefinitions,
  getEmployeeAchievements,
  topEarnedByCode,
} from "../../../api/achievements";
import {
  djangoQueryKeys,
  DJANGO_LIST_STALE_TIME_MS,
  DJANGO_REFERENCE_STALE_TIME_MS,
} from "../../../api/queryKeys";
import { AchievementBadge } from "../../../components/achievements/AchievementBadge";
import { tierTone } from "../../../components/achievements/meta";
import EmployeeRelatedModal, { type RelatedModalType } from "./EmployeeRelatedModal";
import {
  useEmployeeShiftsMonth,
  useEmployeeExpensesMonth,
  usePayrollReportMonth,
} from "../hooks/useEmployeeRelated";

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

const declension = (number: number, titles: [string, string, string]) => {
  const cases = [2, 0, 1, 1, 1, 2];
  return titles[
    number % 100 > 4 && number % 100 < 20 ? 2 : cases[number % 10 < 5 ? number % 10 : 5]
  ];
};

/** Полных месяцев между датой и сегодня (отрицательно для будущих дат). */
const monthsSince = (dateStr: string) => {
  const from = new Date(dateStr);
  const now = new Date();
  let monthDiff =
    (now.getFullYear() - from.getFullYear()) * 12 +
    (now.getMonth() - from.getMonth());
  if (now.getDate() < from.getDate()) monthDiff--;
  return monthDiff;
};

const calculateAge = (birthDate: string) => {
  if (!birthDate) return "";
  const monthDiff = monthsSince(birthDate);
  const y = Math.floor(monthDiff / 12);
  const m = monthDiff % 12;

  const yearsStr = `${y} ${declension(y, ["год", "года", "лет"])}`;
  const monthsStr =
    m > 0 ? ` и ${m} ${declension(m, ["месяц", "месяца", "месяцев"])}` : "";

  return `(${yearsStr}${monthsStr})`;
};

/** Стаж от даты приёма: «2 года и 3 месяца», «5 месяцев», «меньше месяца». */
const formatTenure = (hiredDate: string) => {
  const monthDiff = monthsSince(hiredDate);
  if (monthDiff < 0) return "";
  if (monthDiff === 0) return "меньше месяца";
  const y = Math.floor(monthDiff / 12);
  const m = monthDiff % 12;
  const parts: string[] = [];
  if (y > 0) parts.push(`${y} ${declension(y, ["год", "года", "лет"])}`);
  if (m > 0) parts.push(`${m} ${declension(m, ["месяц", "месяца", "месяцев"])}`);
  return parts.join(" и ");
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

/** Плитка «связанных данных» (СКУД/Расходы/ЗП) — живой показатель + модалка. */
const RelatedTile: React.FC<{
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  stat?: React.ReactNode;
  onClick: () => void;
}> = ({ icon, title, subtitle, stat, onClick }) => (
  <Box
    component="button"
    type="button"
    onClick={onClick}
    sx={(t) => ({
      textAlign: "left",
      cursor: "pointer",
      fontFamily: "inherit",
      color: "inherit",
      display: "flex",
      flexDirection: "column",
      gap: 1,
      p: 1.5,
      borderRadius: "12px",
      border: 1,
      borderColor: "divider",
      bgcolor: subtleBg(t),
      transition: "background-color .15s ease, border-color .15s ease, transform .15s ease",
      "&:hover": {
        bgcolor: subtleBg(t, true),
        borderColor: alpha(t.palette.primary.main, 0.3),
        transform: "translateY(-2px)",
      },
    })}
  >
    <Box
      sx={(t) => ({
        width: 40,
        height: 40,
        borderRadius: "11px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "primary.onSurface",
        bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.16 : 0.1),
        "& .MuiSvgIcon-root": { fontSize: 21 },
      })}
    >
      {icon}
    </Box>
    <Box>
      <Typography variant="body2" fontWeight={600}>{title}</Typography>
      <Typography variant="caption" color="text.secondary">{subtitle}</Typography>
    </Box>
    {stat !== undefined && (
      <Typography
        variant="h6"
        fontWeight={700}
        sx={{ lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}
      >
        {stat}
      </Typography>
    )}
    <Stack direction="row" alignItems="center" gap={0.25} sx={{ color: "primary.onSurface" }}>
      <Typography variant="caption" fontWeight={500}>Открыть</Typography>
      <ChevronRightOutlined sx={{ fontSize: 15 }} />
    </Stack>
  </Box>
);

/** Значение показателя на плитке: число + приглушённая единица. */
const TileStat: React.FC<{ loading: boolean; error: boolean; value: string; unit: string }> = ({
  loading,
  error,
  value,
  unit,
}) => {
  if (loading) return <CircularProgress size={16} />;
  if (error) return <>—</>;
  return (
    <>
      {value}{" "}
      <Box component="span" sx={{ fontSize: 12, fontWeight: 400, color: "text.secondary" }}>
        {unit}
      </Box>
    </>
  );
};

const EmployeeCard: React.FC<EmployeeCardProps> = ({
  emp,
  allServices,
  onOpenServices,
  onEdit,
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [related, setRelated] = useState<RelatedModalType>(null);
  // Выбранный месяц для «связанных данных» — якорь "YYYY-MM-DD" (1-е число месяца).
  const [relatedMonth, setRelatedMonth] = useState<string>(() =>
    dayjs().startOf("month").format("YYYY-MM-DD"),
  );
  const isCurrentMonth =
    dayjs(relatedMonth).format("YYYY-MM") === dayjs().format("YYYY-MM");
  const shiftRelatedMonth = (delta: number) =>
    setRelatedMonth((m) => dayjs(m).add(delta, "month").startOf("month").format("YYYY-MM-DD"));

  const { activeEmployee, activeOrganization } = usePermissions();
  const canViewAttendance = useCan("attendance.view");
  const canViewExpenses = useCan(["finance.view", "finance.expense.view"]);
  const canViewPayroll = useCan("payroll.view");
  const canViewAchievements = useCan("achievements.view");
  const apiOrgId = useApiOrgId();

  // For Django mode: Cache services via react-query
  const empIdNum = emp?.id ? Number(emp.id) : 0;

  // Своя карточка: сотрудник всегда видит свои связанные данные (own-bypass).
  const isOwnCard = activeEmployee?.id != null && empIdNum === activeEmployee.id;

  // ── Живые показатели «связанных данных» за текущий месяц ────────────────────
  // Общие хуки с модалками (одинаковые queryKey → один запрос на кеш).
  const relatedBase = IS_DJANGO_BACKEND && empIdNum > 0;
  const shiftsQ = useEmployeeShiftsMonth(
    empIdNum,
    relatedBase && (canViewAttendance || isOwnCard),
    relatedMonth,
  );
  const expensesQ = useEmployeeExpensesMonth(
    empIdNum,
    activeOrganization?.id ?? undefined,
    relatedBase && (canViewExpenses || isOwnCard),
    relatedMonth,
  );
  const payrollQ = usePayrollReportMonth(
    activeOrganization?.id ?? undefined,
    relatedBase && (canViewPayroll || isOwnCard),
    relatedMonth,
  );

  const toNum = (v: string | number | null | undefined) => Number(v || 0);
  const monthHours = (shiftsQ.data ?? []).reduce(
    (s, r) => s + toNum(r.dayHours) + toNum(r.nightHours),
    0,
  );
  const monthExpenses = (expensesQ.data?.results ?? []).reduce(
    (s, r) => s + toNum(r.amount),
    0,
  );
  const payrollRow = payrollQ.data?.rows.find((r) => r.employeeId === empIdNum);
  const monthNetSalary = toNum(payrollRow?.netSalary);

  // Бейджи достижений коллеги — только полученные, без прогресса (ТЗ достижений).
  const achievementsEnabled = IS_DJANGO_BACKEND && empIdNum > 0 && canViewAchievements;
  const employeeAchievementsQuery = useQuery({
    queryKey: djangoQueryKeys.achievements.employee(empIdNum),
    queryFn: ({ signal }) => getEmployeeAchievements(empIdNum, apiOrgId, signal),
    enabled: achievementsEnabled,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });
  const achievementDefinitionsQuery = useQuery({
    queryKey: djangoQueryKeys.achievements.definitions,
    queryFn: ({ signal }) => getAchievementDefinitions(signal),
    enabled: achievementsEnabled && (employeeAchievementsQuery.data?.length ?? 0) > 0,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const employeeBadges = React.useMemo(() => {
    const earned = employeeAchievementsQuery.data ?? [];
    if (earned.length === 0) return [];
    const defByCode = new Map(
      (achievementDefinitionsQuery.data ?? []).map((d) => [d.code, d]),
    );
    return [...topEarnedByCode(earned).values()]
      .sort((a, b) => b.achievedAt.localeCompare(a.achievedAt))
      .map((e) => {
        const def = defByCode.get(e.code);
        return {
          ...e,
          title: def?.title ?? e.code,
          tone: tierTone(e.level, def?.tiers.length ?? 3),
        };
      });
  }, [employeeAchievementsQuery.data, achievementDefinitionsQuery.data]);

  // Каталог услуг — для картинок/цен в списке услуг сотрудника (Django).
  const catalogQuery = useQuery({
    queryKey: ["django", "catalog", "services", "card-images"],
    queryFn: ({ signal }) => getServices(null, signal),
    enabled: IS_DJANGO_BACKEND,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const serviceMeta = React.useMemo(() => {
    const m = new Map<string, { imageUrl: string | null; price: number }>();
    (catalogQuery.data ?? []).forEach((s) =>
      m.set(String(s.id), { imageUrl: s.imageUrl ?? null, price: Number(s.basePrice || 0) }),
    );
    return m;
  }, [catalogQuery.data]);
  const djangoServicesQuery = useQuery({
    queryKey: ["django", "staff", "employee-services", empIdNum, emp?.updated_at],
    queryFn: async ({ signal }) => {
      if (empIdNum > 0) {
        const assignments = await getEmployeeServices(empIdNum, signal);
        return assignments.map((a) => ({
          id: String(a.service.id),
          name: a.service.name,
        }));
      }
      return [];
    },
    enabled: IS_DJANGO_BACKEND && empIdNum > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  // Legacy Supabase services loading
  const [legacyFetchedServiceIds, setLegacyFetchedServiceIds] = useState<string[]>([]);
  const [isLoadingLegacyServices, setIsLoadingLegacyServices] = useState(false);

  useEffect(() => {
    if (IS_DJANGO_BACKEND) return;
    if (!emp?.id) {
      setLegacyFetchedServiceIds([]);
      return;
    }

    const loadServices = async () => {
      setIsLoadingLegacyServices(true);
      try {
        const ids = await _loadSupabaseServiceIds(emp.id);
        setLegacyFetchedServiceIds(ids);
      } catch (err) {
        console.error("Ошибка загрузки услуг сотрудника:", err);
        setLegacyFetchedServiceIds([]);
      } finally {
        setIsLoadingLegacyServices(false);
      }
    };

    loadServices();
  }, [emp?.id, emp?.updated_at]);

  const isLoadingServices = IS_DJANGO_BACKEND ? djangoServicesQuery.isFetching : isLoadingLegacyServices;

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
  const hired = emp?.hired_at || "";
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
      return djangoServicesQuery.data ?? [];
    }
    if (legacyFetchedServiceIds.length === 0 || allServices.length === 0)
      return [] as { id: string; name: string }[];

    return legacyFetchedServiceIds.map((linkId): { id: string; name: string } => {
      const link = String(linkId);
      const svc = allServices.find((s) => getSafeId(s) === link);
      if (svc) return { id: link, name: getSafeName(svc) };
      return { id: link, name: `ID: ${link}` };
    });
  }, [djangoServicesQuery.data, legacyFetchedServiceIds, allServices]);

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

            {/* Контакты — видны всем сотрудникам */}
            <Box>
              <SectionHeader icon={<ContactPageOutlined />} title="Контакты" />
              <Box sx={{ display: "grid", gap: 1.25, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
                <InfoTile icon={<LocalPhoneOutlined />} label="Телефон" value={phone} active={Boolean(phone)} />
                <InfoTile icon={<EmailOutlined />} label="Email" value={emp.email} active={Boolean(emp.email)} />
                <InfoTile icon={<TelegramIcon />} label="Telegram ID" value={emp.telegram_id} active={Boolean(emp.telegram_id)} />
                <InfoTile
                  icon={<InstagramIcon />}
                  label="Instagram"
                  value={emp.instagram ? `@${emp.instagram}` : undefined}
                  active={Boolean(emp.instagram)}
                />
              </Box>
            </Box>

            {/* Личное — дата рождения и адрес приходят только с правом (или своя карточка) */}
            {(birth || hired || emp.address || emp.notes) && (
              <Box>
                <SectionHeader icon={<CakeOutlined />} title="Личное" />
                <Box sx={{ display: "grid", gap: 1.25, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
                  {birth && (
                    <InfoTile
                      icon={<CakeOutlined />}
                      label="Дата рождения"
                      value={
                        <>
                          {formatDateRu(birth)}{" "}
                          <Box component="span" sx={{ color: "text.secondary", fontWeight: 400 }}>
                            {calculateAge(birth)}
                          </Box>
                        </>
                      }
                    />
                  )}
                  {hired && (
                    <InfoTile
                      icon={<EventAvailableOutlined />}
                      label="Дата приёма на работу"
                      value={
                        <>
                          {formatDateRu(hired)}{" "}
                          {formatTenure(hired) && (
                            <Box component="span" sx={{ color: "text.secondary", fontWeight: 400 }}>
                              (стаж {formatTenure(hired)})
                            </Box>
                          )}
                        </>
                      }
                    />
                  )}
                  {emp.address && (
                    <InfoTile icon={<HomeOutlined />} label="Адрес проживания" value={emp.address} />
                  )}
                  {emp.notes && (
                    <Box sx={{ gridColumn: { md: "1 / -1" } }}>
                      <InfoTile icon={<NotesOutlined />} label="Описание" value={emp.notes} />
                    </Box>
                  )}
                </Box>
              </Box>
            )}

            {/* Реквизиты — приходят только с правом staff.private.view (или своя карточка) */}
            {(emp.bank || emp.bik || emp.bank_account_number || emp.inn || emp.elqr_url) && (
              <Box>
                <SectionHeader
                  icon={<AccountBalanceOutlined />}
                  title="Реквизиты"
                  action={
                    <Stack direction="row" alignItems="center" gap={0.5} sx={{ color: "text.disabled" }}>
                      <LockOutlined sx={{ fontSize: 14 }} />
                      <Typography variant="caption">приватно</Typography>
                    </Stack>
                  }
                />
                <Box sx={{ display: "grid", gap: 1.25, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
                  {emp.bank && (
                    <InfoTile icon={<AccountBalanceOutlined />} label="Банк" value={emp.bank} />
                  )}
                  {emp.bik && (
                    <InfoTile icon={<AccountBalanceOutlined />} label="БИК" value={emp.bik} monospace />
                  )}
                  <InfoTile
                    icon={<CreditCardOutlined />}
                    label="Номер счёта"
                    value={emp.bank_account_number ? formatBank(emp.bank_account_number) : undefined}
                    active={Boolean(emp.bank_account_number)}
                    monospace
                  />
                  <InfoTile icon={<BadgeOutlined />} label="ИНН" value={emp.inn} active={Boolean(emp.inn)} monospace />
                </Box>
                {emp.elqr_url && (
                  <Box
                    component="a"
                    href={emp.elqr_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={(t) => ({
                      mt: 1.25,
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      p: 1.5,
                      borderRadius: "10px",
                      border: 1,
                      borderColor: "divider",
                      bgcolor: subtleBg(t),
                      textDecoration: "none",
                      color: "inherit",
                      transition: "background-color .15s ease, border-color .15s ease",
                      "&:hover": { bgcolor: subtleBg(t, true), borderColor: alpha(t.palette.primary.main, 0.28) },
                    })}
                  >
                    <Box
                      sx={(t) => ({
                        width: 44,
                        height: 44,
                        borderRadius: "10px",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                        color: "primary.onSurface",
                        bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.16 : 0.1),
                        "& .MuiSvgIcon-root": { fontSize: 22 },
                      })}
                    >
                      {/\.pdf($|\?)/i.test(emp.elqr_url) ? (
                        <QrCode2Outlined />
                      ) : (
                        <Box component="img" src={emp.elqr_url} alt="elQR" sx={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      )}
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600}>elQR (реквизиты)</Typography>
                      <Typography variant="caption" color="primary.onSurface">Открыть</Typography>
                    </Box>
                  </Box>
                )}
              </Box>
            )}

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

            {/* Достижения — только полученные бейджи, без прогресса и счётчиков */}
            {achievementsEnabled && employeeBadges.length > 0 && (
              <Box>
                <SectionHeader icon={<EmojiEventsOutlined />} title="Достижения" />
                <Stack direction="row" flexWrap="wrap" gap={1}>
                  {employeeBadges.map((b) => (
                    <Tooltip
                      key={b.code}
                      title={`${b.title} — ${b.tierName} · ${formatDateRu(b.achievedAt)}`}
                    >
                      <Box sx={{ display: "inline-flex" }}>
                        <AchievementBadge code={b.code} tone={b.tone} size={44} />
                      </Box>
                    </Tooltip>
                  ))}
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
                  bgcolor: (t) => alpha(t.palette.common.black, 0.85),
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
                    color: "common.white",
                    bgcolor: (t) => alpha(t.palette.common.white, 0.1),
                    "&:hover": { bgcolor: (t) => alpha(t.palette.common.white, 0.2) },
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
                      borderRadius: "10px",
                    }}
                  />
                )}
              </Box>
            </Modal>

            {/* Связанные данные — своё видит всегда, чужое по правам */}
            {IS_DJANGO_BACKEND && empIdNum > 0 &&
              (canViewAttendance || canViewExpenses || canViewPayroll || isOwnCard) && (
              <Box>
                <SectionHeader
                  icon={<LinkOutlined />}
                  title="Связанные данные"
                  action={
                    <Stack
                      direction="row"
                      alignItems="center"
                      gap={0.25}
                      sx={(t) => ({
                        borderRadius: "9px",
                        border: 1,
                        borderColor: "divider",
                        bgcolor: subtleBg(t),
                        px: 0.25,
                      })}
                    >
                      <IconButton
                        size="small"
                        onClick={() => shiftRelatedMonth(-1)}
                        aria-label="Предыдущий месяц"
                        sx={{ p: 0.5 }}
                      >
                        <ChevronLeftOutlined sx={{ fontSize: 18 }} />
                      </IconButton>
                      <Typography
                        variant="caption"
                        fontWeight={600}
                        sx={{ minWidth: 92, textAlign: "center", textTransform: "capitalize" }}
                      >
                        {dayjs(relatedMonth).format("MMMM YYYY")}
                      </Typography>
                      <IconButton
                        size="small"
                        onClick={() => shiftRelatedMonth(1)}
                        disabled={isCurrentMonth}
                        aria-label="Следующий месяц"
                        sx={{ p: 0.5 }}
                      >
                        <ChevronRightOutlined sx={{ fontSize: 18 }} />
                      </IconButton>
                    </Stack>
                  }
                />
                <Box sx={{ display: "grid", gap: 1.25, gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" } }}>
                  {(canViewAttendance || isOwnCard) && (
                    <RelatedTile
                      icon={<AccessTimeOutlined />}
                      title="СКУД"
                      subtitle={shiftsQ.isFetching ? "Смен: —" : `Смен: ${shiftsQ.data?.length ?? "—"}`}
                      stat={
                        <TileStat
                          loading={shiftsQ.isFetching}
                          error={Boolean(shiftsQ.error)}
                          value={monthHours.toFixed(1)}
                          unit="ч/мес"
                        />
                      }
                      onClick={() => setRelated("skud")}
                    />
                  )}
                  {(canViewExpenses || isOwnCard) && (
                    <RelatedTile
                      icon={<ReceiptLongOutlined />}
                      title="Расходы"
                      subtitle={
                        expensesQ.isFetching
                          ? "Записей: —"
                          : `Записей: ${expensesQ.data?.results?.length ?? "—"}`
                      }
                      stat={
                        <TileStat
                          loading={expensesQ.isFetching}
                          error={Boolean(expensesQ.error)}
                          value={monthExpenses.toLocaleString("ru-RU")}
                          unit="с"
                        />
                      }
                      onClick={() => setRelated("exp")}
                    />
                  )}
                  {(canViewPayroll || isOwnCard) && (
                    <RelatedTile
                      icon={<PaymentsOutlined />}
                      title="Зарплата"
                      subtitle="К выплате за месяц"
                      stat={
                        <TileStat
                          loading={payrollQ.isFetching}
                          error={Boolean(payrollQ.error)}
                          value={monthNetSalary.toLocaleString("ru-RU")}
                          unit="с"
                        />
                      }
                      onClick={() => setRelated("sal")}
                    />
                  )}
                </Box>
              </Box>
            )}

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
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.875 }}>
                  {servicesForEmployee.map((s) => {
                    const meta = serviceMeta.get(String(s.id));
                    return (
                      <Stack
                        key={s.id}
                        direction="row"
                        alignItems="center"
                        gap={0.875}
                        sx={(t) => ({
                          height: 32,
                          maxWidth: "100%",
                          pl: 0.5,
                          pr: 1.375,
                          border: 1,
                          borderColor: "divider",
                          borderRadius: 999,
                          bgcolor: subtleBg(t),
                        })}
                      >
                        <Box
                          sx={(t) => ({
                            width: 24,
                            height: 24,
                            borderRadius: "50%",
                            flexShrink: 0,
                            overflow: "hidden",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "primary.onSurface",
                            bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.16 : 0.1),
                          })}
                        >
                          {meta?.imageUrl ? (
                            <Box component="img" src={meta.imageUrl} alt={s.name} sx={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            <LocalOfferOutlined sx={{ fontSize: 13 }} />
                          )}
                        </Box>
                        <Typography
                          variant="body2"
                          fontWeight={500}
                          noWrap
                          sx={{ fontSize: "0.8rem", minWidth: 0 }}
                        >
                          {s.name}
                        </Typography>
                        {meta && meta.price > 0 && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{
                              fontVariantNumeric: "tabular-nums",
                              whiteSpace: "nowrap",
                              pl: 0.875,
                              borderLeft: 1,
                              borderColor: "divider",
                            }}
                          >
                            {meta.price.toLocaleString("ru-RU")} с
                          </Typography>
                        )}
                      </Stack>
                    );
                  })}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  {isLoadingServices ? "Загрузка..." : "Нет привязанных услуг"}
                </Typography>
              )}
            </Box>

            {emp && empIdNum > 0 && (
              <EmployeeRelatedModal
                open={related !== null}
                type={related}
                employeeId={empIdNum}
                employeeName={emp.full_name || String(emp.id)}
                organizationId={activeOrganization?.id ?? undefined}
                monthAnchor={relatedMonth}
                onClose={() => setRelated(null)}
              />
            )}
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
