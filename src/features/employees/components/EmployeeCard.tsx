import React, { useEffect, useState } from "react";
import { Button, Divider, Stack, Typography, Avatar, Chip, CircularProgress, Card, CardHeader, CardContent, Box, Link, ImageList, ImageListItem, Modal, IconButton } from "@mui/material";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import LocalPhoneOutlined from "@mui/icons-material/LocalPhoneOutlined";
import LocalOfferOutlined from "@mui/icons-material/LocalOfferOutlined";
import PhoneInTalkOutlined from "@mui/icons-material/PhoneInTalkOutlined";
import TelegramIcon from "@mui/icons-material/Telegram";
import EmailOutlined from "@mui/icons-material/EmailOutlined";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import type { EmployesRow } from "../types";
import type { ServiceRow as ServiceDto } from "../../../services/services";

// ВАЖНО: Импортируй свой клиент supabase.
// Если он у тебя в другом месте, поправь путь.
import { supabase } from "../../../utility/supabaseClient";
import { formatDateRu } from "../../../utility/format";
import { EMPLOYEE_SERVICES_TABLE, fetchEmployeeSpecialization } from "../api";
import { useOne } from "@refinedev/core";
import { DB_TABLES } from "../../../utility/constants";
import { IS_DJANGO_BACKEND } from "../../../config/backend";

export type EmployeeCardProps = {
  emp: EmployesRow | null;
  allServices: ServiceDto[];
  /** Django-only: открыть drawer управления услугами */
  onOpenServices?: (employeeId: number, employeeName: string) => void;
};

const calculateAge = (birthDate: string) => {
  if (!birthDate) return "";
  const birth = new Date(birthDate);
  const now = new Date();
  // Разница в месяцах целиком
  let monthDiff = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) {
    monthDiff--;
  }

  const y = Math.floor(monthDiff / 12);
  const m = monthDiff % 12;

  const declension = (number: number, titles: [string, string, string]) => {
    const cases = [2, 0, 1, 1, 1, 2];
    return titles[
      number % 100 > 4 && number % 100 < 20 ? 2 : cases[number % 10 < 5 ? number % 10 : 5]
    ];
  };

  const yearsStr = `${y} ${declension(y, ["год", "года", "лет"])}`;
  const monthsStr = m > 0 ? ` и ${m} ${declension(m, ["месяц", "месяца", "месяцев"])}` : "";

  return `(${yearsStr}${monthsStr})`;
};

const EmployeeCard: React.FC<EmployeeCardProps> = ({ emp, allServices, onOpenServices }) => {
  console.log("DEBUG EmployeeCard passport_photos:", emp?.id, emp?.passport_photos);
  // Состояние для хранения загруженных ID услуг
  const [fetchedServiceIds, setFetchedServiceIds] = useState<string[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // --- 1. ЛОГИКА ЗАГРУЗКИ (НОВАЯ ЧАСТЬ) ---
  useEffect(() => {
    // Если сотрудника нет, очищаем список и выходим
    if (!emp?.id) {
      setFetchedServiceIds([]);
      return;
    }

    const fetchServices = async () => {
      setIsLoadingServices(true);
      try {
        // Делаем запрос в таблицу-связку
        const { data, error } = await supabase
          .from(EMPLOYEE_SERVICES_TABLE)
          .select('service_id')
          .eq('employee_id', String(emp.id)); // Приводим ID сотрудника к строке

        if (error) {
          console.error('Ошибка загрузки услуг:', error);
          return;
        }

        if (data) {
          // Извлекаем массив ID (например: ["c01e...", "16d5..."])
          const ids = data.map(row => String(row.service_id));
          setFetchedServiceIds(ids);
        }
      } catch (err) {
        console.error('Неизвестная ошибка:', err);
      } finally {
        setIsLoadingServices(false);
      }
    };

    fetchServices();
    fetchServices();
  }, [emp?.id, emp]); // Перезапускаем, когда меняется ID сотрудника или сам объект (обновление)


  // --- 1.2 ЛОГИКА ЗАГРУЗКИ РОЛИ (ПЕРЕНЕСЕНО ВВЕРХ) ---
  const { result: roleData } = useOne<{ id: string, name: string, display_name: string }>({
    resource: DB_TABLES.ROLES,
    id: emp?.role_id || "",
    queryOptions: {
      enabled: !IS_DJANGO_BACKEND && !!emp?.role_id,
    },
  });

  // --- 1.1 ЛОГИКА ЗАГРУЗКИ СПЕЦИАЛИЗАЦИИ ---
  const [localSpecId, setLocalSpecId] = useState<string>("");

  useEffect(() => {
    // Исправлено: проверяем имя роли из загруженного roleData, а не role_id (который UUID)
    if (emp?.id && roleData?.name === 'doctor') {
      fetchEmployeeSpecialization(emp.id).then(id => {
        setLocalSpecId(id || "");
      });
    } else {
      setLocalSpecId("");
    }
  }, [emp?.id, roleData?.name, emp]); // Добавили `emp` чтобы при обновлении записи (например, после редактирования) эффект мог перезапуститься

  const { result: specData } = useOne<{ id: string, name: string }>({
    resource: DB_TABLES.SPECIALIZATIONS,
    id: localSpecId,
    queryOptions: {
      enabled: !IS_DJANGO_BACKEND && !!localSpecId,
    },
  });
  const specializationName = specData?.name;

  // Определяем название роли:
  // 1. Из базы (display_name): Врач
  // 2. Фолбэк на маппинг по системному имени
  // 3. Фолбэк на "Сотрудник" (не active!)
  const getRoleDisplayName = (r?: { name: string, display_name: string }) => {
    if (!r) return "";
    if (r.display_name) return r.display_name;

    // Fallback mapper if display_name is missing for some reason
    switch (r.name) {
      case "doctor": return "Врач";
      case "nurse": return "Медсестра";
      case "admin": return "Управляющий";
      case "receptionist": return "Регистратор";
      case "accountant": return "Бухгалтер";
      default: return "Сотрудник";
    }
  };

  const roleDisplayName = getRoleDisplayName(roleData);
  const isDoctor = roleData?.name === "doctor";
  // --- Стандартные поля сотрудника ---
  const fio = emp?.full_name || emp?.id || "";
  const phone = emp?.phone || "";
  const birth = emp?.birth_date || "";
  const photo = emp?.photo_url || undefined;

  const roleText = roleDisplayName || (emp?.status === 'active' ? "Сотрудник" : "Неизвестно");

  // --- Хелперы: строгие функции без any для извлечения ID и имени услуги ---
  type UnknownRecord = Record<string, unknown>;
  const isRecord = (v: unknown): v is UnknownRecord => typeof v === "object" && v !== null;

  // Безопасно получить ID услуги: поддерживает ключи ID и id, а также число -> строка
  const getSafeId = (service: ServiceDto | UnknownRecord): string => {
    if (isRecord(service)) {
      const raw = (service as UnknownRecord)["ID"] ?? (service as UnknownRecord)["id"];
      if (typeof raw === "string" || typeof raw === "number") return String(raw);
    }
    return "";
  };

  // Безопасно получить имя услуги: поддерживает name и service_name, иначе вернём сам ID
  const getSafeName = (service: ServiceDto | UnknownRecord): string => {
    if (isRecord(service)) {
      const rawName = (service as UnknownRecord)["name"] ?? (service as UnknownRecord)["service_name"];
      if (typeof rawName === "string" && rawName.trim().length > 0) return rawName;
    }
    const id = getSafeId(service);
    return id || "Без названия";
  };


  // --- 2. ЛОГИКА СОПОСТАВЛЕНИЯ (MAPPING) ---
  // Берём ID из state (fetchedServiceIds), а не из emp
  const servicesForEmployee = React.useMemo(() => {
    if (fetchedServiceIds.length === 0 || allServices.length === 0) return [] as { id: string; name: string }[];

    return fetchedServiceIds.map((linkId): { id: string; name: string } => {
      const link = String(linkId);
      // Ищем услугу в общем списке (allServices) по безопасному ID
      const svc = allServices.find((s) => getSafeId(s) === link);

      if (svc) {
        return { id: link, name: getSafeName(svc) };
      }
      // Фолбэк: если услугу не нашли, показываем её ID, чтобы видеть связь
      return { id: link, name: `ID: ${link}` };
    });
  }, [fetchedServiceIds, allServices]);

  return (
    <Card
      variant="outlined"
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        // Unified design: white background, standard border
      }}
    >
      <CardHeader
        title={
          <Stack direction="row" alignItems="center" gap={1.25}>
            <PersonOutlineOutlined color="primary" />
            <Typography variant="h6">Карточка сотрудника</Typography>
          </Stack>
        }
      />
      <Divider />
      <CardContent sx={{ flex: 1, overflowY: "auto" }}>
        {emp ? (
          <Stack spacing={2.5}>
            {/* Аватар и Имя */}
            <Stack direction="row" spacing={2} alignItems="center">
              <Avatar
                variant="rounded"
                src={photo}
                alt={fio || undefined}
                sx={{ width: 80, height: 80 }}
              >
                {!photo && <PersonOutlineOutlined sx={{ fontSize: 40 }} />}
              </Avatar>
              <Box>
                <Typography variant="h6" sx={{ lineHeight: 1.2, mb: 0.5 }}>
                  {fio || emp.id}
                </Typography>
                {emp.nickname && (
                  <Typography variant="subtitle2" color="primary" sx={{ mb: 0.5, fontWeight: 600 }}>
                    {emp.nickname}
                  </Typography>
                )}
                <Chip
                  label={emp.status === "active" ? "Работает" : emp.status === "inactive" ? "Не работает" : (emp.status || "—")}
                  size="small"
                  color={emp.status === "active" ? "success" : "default"}
                  variant={emp.status === "active" ? "filled" : "outlined"}
                  sx={{ fontWeight: 600 }}
                />
              </Box>
            </Stack>

            <Divider />

            {/* Основная информация */}
            <Stack spacing={2}>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  Должность
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 500 }}>
                  {roleText}
                  {/* Если специализация есть, но не врач - показываем тут (или отдельно - как хочет юзер. Юзер просил отдельно для врача) */}
                </Typography>
              </Box>

              {isDoctor && specializationName && (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    Специализация
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 500 }}>
                    {specializationName}
                  </Typography>
                </Box>
              )}

              <Stack direction="row" spacing={3}>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    Телефон
                  </Typography>
                  {phone ? (
                    <Link
                      href={`tel:${phone}`}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        color: 'text.secondary',
                        textDecoration: 'none',
                        '&:hover': {
                          color: 'primary.main',
                        },
                        '&:active': {
                          color: 'primary.dark',
                        },
                      }}
                    >
                      <PhoneInTalkOutlined
                        fontSize="small"
                        sx={{
                          color: 'primary.main',
                        }}
                      />
                      <Typography variant="body2">{phone}</Typography>
                    </Link>
                  ) : (
                    <Stack direction="row" alignItems="center" gap={1} color="text.secondary">
                      <LocalPhoneOutlined fontSize="small" />
                      <Typography variant="body2">—</Typography>
                    </Stack>
                  )}
                </Box>

                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    Дата рождения
                  </Typography>
                  <Typography variant="body2">
                    {birth ? `${formatDateRu(birth)} ${calculateAge(birth)}` : "—"}
                  </Typography>
                </Box>
              </Stack>
            </Stack>

            <Divider />

            {/* Дополнительные контакты */}
            <Stack spacing={2}>
              <Stack direction="row" spacing={2} alignItems="center">
                <TelegramIcon color={emp.telegram_id ? "primary" : "disabled"} />
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    Telegram ID
                  </Typography>
                  <Typography variant="body2" fontWeight={emp.telegram_id ? 500 : 400} color={emp.telegram_id ? "text.primary" : "text.secondary"}>
                    {emp.telegram_id || "(не заполнено)"}
                  </Typography>
                </Box>
              </Stack>

              <Stack direction="row" spacing={2} alignItems="center">
                <EmailOutlined color={emp.email ? "primary" : "disabled"} />
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    Email
                  </Typography>
                  <Typography variant="body2" fontWeight={emp.email ? 500 : 400} color={emp.email ? "text.primary" : "text.secondary"}>
                    {emp.email || "(не заполнено)"}
                  </Typography>
                </Box>
              </Stack>

              <Stack direction="row" spacing={2} alignItems="center">
                <CreditCardOutlined color={emp.bank_account_number ? "primary" : "disabled"} />
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    Номер счета
                  </Typography>
                  <Typography variant="body2" fontWeight={emp.bank_account_number ? 500 : 400} sx={{ fontFamily: emp.bank_account_number ? 'monospace' : 'inherit', letterSpacing: emp.bank_account_number ? 1 : 0 }} color={emp.bank_account_number ? "text.primary" : "text.secondary"}>
                    {emp.bank_account_number ? emp.bank_account_number.replace(/(.{4})/g, '$1 ').trim() : "(не заполнено)"}
                  </Typography>
                </Box>
              </Stack>

              <Stack direction="row" spacing={2} alignItems="center">
                <CreditCardOutlined color={emp.inn ? "primary" : "disabled"} />
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    ИНН
                  </Typography>
                  <Typography variant="body2" fontWeight={emp.inn ? 500 : 400} sx={{ fontFamily: emp.inn ? 'monospace' : 'inherit', letterSpacing: emp.inn ? 1 : 0 }} color={emp.inn ? "text.primary" : "text.secondary"}>
                    {emp.inn || "(не заполнено)"}
                  </Typography>
                </Box>
              </Stack>
            </Stack>

            {/* Фото паспорта */}
            {emp.passport_photos && emp.passport_photos.length > 0 && (
              <>
                <Divider />
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5, fontWeight: 600 }}>
                    Паспортные данные (фото)
                  </Typography>
                  <ImageList cols={3} gap={10} sx={{ m: 0 }}>
                    {emp.passport_photos.map((url, i) => (
                      <ImageListItem key={i} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
                        <Box
                          component="img"
                          src={url}
                          alt={`Паспорт ${i + 1}`}
                          onClick={() => setPreviewUrl(url)}
                          sx={{ 
                            width: '100%', 
                            height: 100, 
                            objectFit: 'cover', 
                            display: 'block', 
                            cursor: 'pointer',
                            '&:hover': { opacity: 0.8 }
                          }}
                        />
                      </ImageListItem>
                    ))}
                  </ImageList>
                </Box>
              </>
            )}

            {/* Превью фото паспорта (70% от окна) */}
            <Modal open={!!previewUrl} onClose={() => setPreviewUrl(null)}>
              <Box 
                onClick={() => setPreviewUrl(null)}
                sx={{ 
                  position: 'fixed', 
                  inset: 0, 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  bgcolor: 'rgba(0,0,0,0.85)',
                  zIndex: 1300
                }}
              >
                <IconButton 
                  onClick={(e) => { e.stopPropagation(); setPreviewUrl(null); }} 
                  sx={{ position: 'absolute', top: 20, right: 20, color: 'white', bgcolor: 'rgba(255,255,255,0.1)', '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' } }}
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
                      width: '70vw', 
                      height: '70vh', 
                      objectFit: 'contain', 
                      borderRadius: 2,
                      boxShadow: 24
                    }} 
                  />
                )}
              </Box>
            </Modal>

            <Divider />

            {/* Блок Услуги Сотрудника */}
            <Box>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
                <Stack direction="row" alignItems="center" gap={1}>
                  <LocalOfferOutlined color="primary" />
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    Услуги сотрудника
                  </Typography>
                  {isLoadingServices && <CircularProgress size={16} />}
                </Stack>
                {onOpenServices && emp && (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<SettingsOutlined fontSize="small" />}
                    onClick={() => {
                      const id = typeof emp.id === "number" ? emp.id : Number(emp.id);
                      if (!isNaN(id)) onOpenServices(id, emp.full_name);
                    }}
                    sx={{ minWidth: 0 }}
                  >
                    Управление
                  </Button>
                )}
              </Stack>

              {servicesForEmployee.length > 0 ? (
                <Stack spacing={1}>
                  {servicesForEmployee.map((s) => (
                    <Box
                      key={s.id}
                      sx={{
                        p: 1.5,
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 1,
                        backgroundColor: 'background.paper',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <Typography variant="body2" fontWeight={500}>
                        {s.name}
                      </Typography>
                    </Box>
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
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 8, opacity: 0.6 }}>
            <PersonOutlineOutlined sx={{ fontSize: 64, mb: 2, color: 'text.secondary' }} />
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
