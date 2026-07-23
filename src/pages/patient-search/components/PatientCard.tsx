/**
 * PatientCard.tsx
 * Карточка выбранного пациента (правая колонка).
 * Отображает основную информацию о пациенте и краткое резюме последнего приема.
 * Презентационный компонент: не содержит API-логики, принимает данные через пропсы.
 */
import React from "react";
import {
  Stack,
  Typography,
  Box,
  Link,
  Chip,
  Alert,
  AlertTitle,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import BadgeOutlined from "@mui/icons-material/BadgeOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import CardGiftcardOutlined from "@mui/icons-material/CardGiftcardOutlined";
import MergeTypeIcon from "@mui/icons-material/MergeTypeOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVertOutlined";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import PhoneInTalkOutlined from "@mui/icons-material/PhoneInTalkOutlined";
import EventAvailableOutlined from "@mui/icons-material/EventAvailableOutlined";
import MonitorWeightOutlined from "@mui/icons-material/MonitorWeightOutlined";
import HeightOutlined from "@mui/icons-material/HeightOutlined";
import ThermostatOutlined from "@mui/icons-material/ThermostatOutlined";
import { formatDateRu } from "../../../utility/format";
import { AppCard, AppButton, InfoTile, UserAvatar, ListEmptyState } from "../../../components/ui";
import { subtleBg } from "../../../theme/uiHelpers";
import type { PatientBalance } from "../usePatientBalance";

export type PatientLite = {
  fio: string;
  phone?: string;
  photo?: string | null;
  birth_date?: string | null;
  inn?: string | null;
  is_blacklisted?: boolean | null;
  blacklist_reason?: string | null;
} | null;

type Props = {
  patient: PatientLite;
  onEdit?: () => void;
  onTopUp?: () => void;
  onMerge?: () => void;
  balance?: PatientBalance | null;
  /** Дата и время последнего приема (строка, уже отформатированная для отображения) */
  lastDateTime?: string;
  /** Наименование услуги на последнем приеме */
  lastService?: string;
  /** Жалобы при последнем обращении */
  lastComplaints?: string;
  lastWeight?: number | null;
  lastHeight?: number | null;
  lastTemperature?: number | null;
};

// Функция для вычисления возраста с месяцами
function calculateAge(birthDateStr: string): string {
  const birthDate = new Date(birthDateStr);
  const now = new Date();

  if (isNaN(birthDate.getTime())) return "";
  let y = now.getFullYear() - birthDate.getFullYear();
  let m = now.getMonth() - birthDate.getMonth();
  if (now.getDate() < birthDate.getDate()) {
    m--;
  }
  if (m < 0) {
    m += 12;
    y--;
  }

  const yearStr = getDeclension(y, ["год", "года", "лет"]);
  const monthStr = getDeclension(m, ["месяц", "месяца", "месяцев"]);

  if (y === 0 && m === 0) return "(меньше месяца)";
  if (y === 0) return `(${m} ${monthStr})`;
  if (m === 0) return `(${y} ${yearStr})`;

  return `(${y} ${yearStr} и ${m} ${monthStr})`;
}

function getDeclension(number: number, titles: [string, string, string]): string {
  const cases = [2, 0, 1, 1, 1, 2];
  return titles[
    number % 100 > 4 && number % 100 < 20
      ? 2
      : cases[number % 10 < 5 ? number % 10 : 5]
  ];
}

/** Приглушённый бордюр-блок с подписью — единая «фактовая» плашка для секций
 *  карточки (витальные показатели, счёт, последний приём). Держит один и тот
 *  же плоский визуальный ритм, что и InfoTile, но с собственным заголовком. */
const FactBlock: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({
  icon,
  title,
  children,
}) => (
  <Box
    sx={(t) => ({
      borderRadius: "10px",
      border: 1,
      borderColor: "divider",
      bgcolor: subtleBg(t),
      p: 1.5,
    })}
  >
    <Stack direction="row" alignItems="center" gap={0.75} sx={{ mb: 1 }}>
      <Box sx={{ color: "text.secondary", display: "flex", "& .MuiSvgIcon-root": { fontSize: 16 } }}>{icon}</Box>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
        {title}
      </Typography>
    </Stack>
    {children}
  </Box>
);

/** Мини-плитка суммы (счёт / бонусы) — тот же язык, что InfoTile, но с
 *  тоном success/warning вместо акцента primary, чтобы отличать «живые деньги»
 *  от бонусных баллов на первый взгляд. */
const AmountTile: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "success" | "warning";
}> = ({ icon, label, value, tone }) => (
  <Box
    sx={{
      flex: 1,
      minWidth: 110,
      display: "flex",
      alignItems: "center",
      gap: 1,
      p: 1,
      borderRadius: "10px",
      border: 1,
      borderColor: "divider",
      bgcolor: "background.paper",
    }}
  >
    <Box
      sx={(t) => {
        const toneColor = tone === "success" ? t.palette.success : t.palette.warning;
        return {
          width: 32,
          height: 32,
          borderRadius: "8px",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: t.palette.mode === "dark" ? toneColor.light : toneColor.dark,
          bgcolor: alpha(toneColor.main, t.palette.mode === "dark" ? 0.2 : 0.14),
          "& .MuiSvgIcon-root": { fontSize: 17 },
        };
      }}
    >
      {icon}
    </Box>
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: "0.7rem", lineHeight: 1.2 }}>
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={700} noWrap>
        {value}
      </Typography>
    </Box>
  </Box>
);

const PatientCard: React.FC<Props> = ({
  patient,
  onEdit,
  onTopUp,
  onMerge,
  balance,
  lastDateTime,
  lastService,
  lastComplaints,
  lastWeight,
  lastHeight,
  lastTemperature,
}) => {
  const [menuAnchor, setMenuAnchor] = React.useState<null | HTMLElement>(null);

  return (
    <Box sx={{ height: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <AppCard
        variant="outlined"
        header={
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} flexWrap="wrap" sx={{ px: 2, pt: 2, pb: 1.5 }}>
            <Stack direction="row" alignItems="center" gap={1.25}>
              <PersonOutlineOutlined color="primary" />
              <Typography variant="h6">Карточка пациента</Typography>
            </Stack>
            {patient && (onTopUp || onEdit || onMerge) && (
            <>
              {/* Кнопки — на md+ */}
              <Stack
                direction="row"
                spacing={1}
                useFlexGap
                flexWrap="wrap"
                sx={{
                  display: { xs: "none", md: "flex" },
                  width: { md: "100%" },
                  justifyContent: "flex-end",
                  minWidth: 0,
                }}
              >
                {onTopUp && (
                  <AppButton sx={{ flex: "0 1 auto" }} size="small" variant="outlined" color="success" onClick={onTopUp} startIcon={<AccountBalanceWalletOutlined />}>
                    Пополнить
                  </AppButton>
                )}
                {onMerge && (
                  <AppButton sx={{ flex: "0 1 auto" }} size="small" variant="outlined" color="warning" onClick={onMerge} startIcon={<MergeTypeIcon />}>
                    Объединить
                  </AppButton>
                )}
                {onEdit && (
                  <AppButton sx={{ flex: "0 1 auto" }} size="small" variant="contained" onClick={onEdit} startIcon={<EditOutlined />}>
                    Редактировать
                  </AppButton>
                )}
              </Stack>

              {/* Меню — на xs/sm */}
              <Box sx={{ display: { xs: "flex", md: "none" } }}>
                <IconButton size="small" onClick={(e) => setMenuAnchor(e.currentTarget)}>
                  <MoreVertIcon />
                </IconButton>
                <Menu
                  anchorEl={menuAnchor}
                  open={Boolean(menuAnchor)}
                  onClose={() => setMenuAnchor(null)}
                  anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                  transformOrigin={{ vertical: "top", horizontal: "right" }}
                >
                  {onEdit && (
                    <MenuItem onClick={() => { setMenuAnchor(null); onEdit(); }}>
                      <ListItemIcon><EditOutlined fontSize="small" /></ListItemIcon>
                      <ListItemText>Редактировать</ListItemText>
                    </MenuItem>
                  )}
                  {onTopUp && (
                    <MenuItem onClick={() => { setMenuAnchor(null); onTopUp(); }}>
                      <ListItemIcon><AccountBalanceWalletOutlined fontSize="small" color="success" /></ListItemIcon>
                      <ListItemText>Пополнить счёт</ListItemText>
                    </MenuItem>
                  )}
                  {onMerge && (
                    <MenuItem onClick={() => { setMenuAnchor(null); onMerge(); }}>
                      <ListItemIcon><MergeTypeIcon fontSize="small" color="warning" /></ListItemIcon>
                      <ListItemText>Объединить с дублем</ListItemText>
                    </MenuItem>
                  )}
                </Menu>
              </Box>
            </>
            )}
          </Stack>
        }
        disableContentPadding
        sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
      >
        <Box sx={{ flex: 1, overflowY: "auto", minHeight: 0, borderTop: 1, borderColor: "divider" }}>
          {patient ? (
            <Stack spacing={1.5} sx={{ p: 2 }}>
              {patient.is_blacklisted && (
                <Alert severity="error" variant="outlined" sx={{ borderRadius: "10px" }}>
                  <AlertTitle sx={{ fontWeight: 600 }}>В чёрном списке</AlertTitle>
                  {patient.blacklist_reason || "Причина не указана"}
                </Alert>
              )}

              {/* Идентификация: аватар-плашка + имя + звонок */}
              <Stack direction="row" alignItems="center" spacing={2}>
                <UserAvatar src={patient.photo} name={patient.fio} size={64} sx={{ borderRadius: "18px", flexShrink: 0 }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="h6" fontWeight={700} noWrap sx={{ letterSpacing: -0.2, lineHeight: 1.25 }}>
                    {patient.fio}
                  </Typography>

                  {patient.phone ? (
                    <Link
                      href={`tel:${patient.phone}`}
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 0.75,
                        color: "text.secondary",
                        textDecoration: "none",
                        mt: 0.5,
                        "&:hover": { color: "primary.onSurface" },
                        "&:active": { color: "primary.dark" },
                      }}
                    >
                      <PhoneInTalkOutlined fontSize="small" sx={{ color: "primary.onSurface" }} />
                      <Typography variant="body2">{patient.phone}</Typography>
                    </Link>
                  ) : (
                    <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>
                      Телефон не указан
                    </Typography>
                  )}
                </Box>
              </Stack>

              {/* Документы: ИНН + дата рождения */}
              <Box
                sx={{
                  display: "grid",
                  gap: 1,
                  gridTemplateColumns: patient.birth_date ? "1fr 1fr" : "1fr",
                }}
              >
                <InfoTile icon={<BadgeOutlined />} label="ИНН" value={patient.inn ?? undefined} active={Boolean(patient.inn)} monospace />
                {patient.birth_date && (
                  <InfoTile
                    icon={<CalendarMonthOutlined />}
                    label="Дата рождения"
                    value={`${formatDateRu(patient.birth_date)} ${calculateAge(patient.birth_date)}`}
                  />
                )}
              </Box>

              {/* Витальные показатели последнего приема */}
              {(lastWeight || lastHeight || lastTemperature) && (
                <FactBlock icon={<MonitorWeightOutlined />} title="Последние измерения">
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {lastHeight && (
                      <Chip size="small" variant="outlined" icon={<HeightOutlined sx={{ fontSize: "16px !important" }} />} label={`${lastHeight} см`} />
                    )}
                    {lastWeight && (
                      <Chip size="small" variant="outlined" icon={<MonitorWeightOutlined sx={{ fontSize: "16px !important" }} />} label={`${lastWeight} кг`} />
                    )}
                    {lastTemperature && (
                      <Chip
                        size="small"
                        variant="outlined"
                        color={lastTemperature > 37 ? "warning" : "default"}
                        icon={<ThermostatOutlined sx={{ fontSize: "16px !important" }} />}
                        label={`${lastTemperature} °C`}
                      />
                    )}
                  </Stack>
                </FactBlock>
              )}

              {/* Счёт пациента */}
              {balance !== undefined && balance !== null && (
                <FactBlock icon={<AccountBalanceWalletOutlined />} title="Счёт пациента">
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <AmountTile
                      icon={<AccountBalanceWalletOutlined />}
                      label="Баланс"
                      value={`${balance.balance.toLocaleString("ru-RU")} сом`}
                      tone="success"
                    />
                    <AmountTile
                      icon={<CardGiftcardOutlined />}
                      label="Бонусы"
                      value={`${balance.bonuses.toLocaleString("ru-RU")} сом`}
                      tone="warning"
                    />
                  </Stack>
                </FactBlock>
              )}

              {/* Последний прием */}
              {(lastDateTime || lastService || lastComplaints) && (
                <FactBlock icon={<EventAvailableOutlined />} title="Последний приём">
                  <Stack spacing={0.5}>
                    {lastDateTime && (
                      <Typography variant="body2" fontWeight={600}>
                        {lastDateTime}
                      </Typography>
                    )}
                    {lastService && (
                      <Typography variant="body2">
                        <Typography component="span" variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>
                          Услуга:
                        </Typography>
                        {lastService}
                      </Typography>
                    )}
                    {lastComplaints && (
                      <Typography variant="body2">
                        <Typography component="span" variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>
                          Жалобы:
                        </Typography>
                        {lastComplaints}
                      </Typography>
                    )}
                  </Stack>
                </FactBlock>
              )}
            </Stack>
          ) : (
            <ListEmptyState
              icon={<PersonOutlineOutlined />}
              title="Пациент не выбран"
              description="Выберите пациента из списка слева, чтобы увидеть карточку"
            />
          )}
        </Box>
      </AppCard>
    </Box>
  );
};

export default PatientCard;
