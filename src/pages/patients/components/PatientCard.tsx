/**
 * PatientCard — средняя колонка «Карточка пациента» (Django mode).
 * Презентационный компонент, адаптированный под Django-поля
 * (нет photo/ИНН в API — есть адрес, семья, примечания, статус активности).
 */
import React from "react";
import {
  Alert,
  AlertTitle,
  Box,
  IconButton,
  Link,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import PhoneInTalkOutlined from "@mui/icons-material/PhoneInTalkOutlined";
import LocalPhoneOutlined from "@mui/icons-material/LocalPhoneOutlined";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import PlaceOutlined from "@mui/icons-material/PlaceOutlined";
import GroupsOutlined from "@mui/icons-material/GroupsOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import CardGiftcardOutlined from "@mui/icons-material/CardGiftcardOutlined";
import MergeTypeIcon from "@mui/icons-material/MergeTypeOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVertOutlined";
import CameraAltOutlined from "@mui/icons-material/CameraAltOutlined";
import EventAvailableOutlined from "@mui/icons-material/EventAvailableOutlined";
import NotesOutlined from "@mui/icons-material/NotesOutlined";

import { AppCard, AppButton, InfoTile, UserAvatar, ListEmptyState } from "../../../components/ui";
import { subtleBg } from "../../../theme/uiHelpers";
import type { DjangoPatient } from "../../../api/patients";
import type { PatientBalance } from "../../../api/patientBalance";

function getDeclension(number: number, titles: [string, string, string]): string {
  const cases = [2, 0, 1, 1, 1, 2];
  return titles[
    number % 100 > 4 && number % 100 < 20
      ? 2
      : cases[number % 10 < 5 ? number % 10 : 5]
  ];
}

function formatDateRu(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ru-RU");
}

function calculateAge(birthDateStr: string): string {
  const birthDate = new Date(birthDateStr);
  const now = new Date();
  if (isNaN(birthDate.getTime())) return "";
  let y = now.getFullYear() - birthDate.getFullYear();
  let m = now.getMonth() - birthDate.getMonth();
  if (now.getDate() < birthDate.getDate()) m--;
  if (m < 0) { m += 12; y--; }
  const yearStr = getDeclension(y, ["год", "года", "лет"]);
  const monthStr = getDeclension(m, ["месяц", "месяца", "месяцев"]);
  if (y === 0 && m === 0) return "(меньше месяца)";
  if (y === 0) return `(${m} ${monthStr})`;
  if (m === 0) return `(${y} ${yearStr})`;
  return `(${y} ${yearStr} и ${m} ${monthStr})`;
}

function formatMoney(v?: string | null): string {
  const n = Number(v ?? 0);
  if (isNaN(n)) return String(v ?? "0");
  return n.toLocaleString("ru-RU");
}

/** Приглушённый бордюр-блок с подписью — единая «фактовая» плашка для секций
 *  карточки (счёт, последний приём, примечания). */
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

/** Мини-плитка суммы (счёт / бонусы) — язык InfoTile, но с тоном success/warning
 *  вместо акцента primary, чтобы отличать «живые деньги» от бонусных баллов. */
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

type Props = {
  patient: DjangoPatient | null;
  balance: PatientBalance | null;
  onEdit?: () => void;
  onTopUp?: () => void;
  onMerge?: () => void;
  onFace?: () => void;
  lastDateTime?: string;
  lastService?: string;
  lastComplaints?: string;
};

const PatientCard: React.FC<Props> = ({
  patient,
  balance,
  onEdit,
  onTopUp,
  onMerge,
  onFace,
  lastDateTime,
  lastService,
  lastComplaints,
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
            {patient && (onTopUp || onEdit || onMerge || onFace) && (
              <>
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
                  {onFace && (
                    <AppButton sx={{ flex: "0 1 auto" }} size="small" variant="outlined" color="info" onClick={onFace} startIcon={<CameraAltOutlined />}>
                      Камера
                    </AppButton>
                  )}
                  {onEdit && (
                    <AppButton sx={{ flex: "0 1 auto" }} size="small" variant="contained" onClick={onEdit} startIcon={<EditOutlined />}>
                      Редактировать
                    </AppButton>
                  )}
                </Stack>

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
                    {onFace && (
                      <MenuItem onClick={() => { setMenuAnchor(null); onFace(); }}>
                        <ListItemIcon><CameraAltOutlined fontSize="small" color="info" /></ListItemIcon>
                        <ListItemText>Камера</ListItemText>
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
              {patient.isBlacklisted && (
                <Alert severity="error" variant="outlined" sx={{ borderRadius: "10px" }}>
                  <AlertTitle sx={{ fontWeight: 600 }}>В чёрном списке</AlertTitle>
                  {patient.blacklistReason || "Причина не указана"}
                </Alert>
              )}
              {!patient.isActive && (
                <Alert severity="warning" variant="outlined" sx={{ borderRadius: "10px" }}>
                  Пациент помечен как неактивный
                </Alert>
              )}

              {/* Идентификация: аватар-плашка + имя + звонок(и) */}
              <Stack direction="row" alignItems="center" spacing={2}>
                <UserAvatar src={patient.photoUrl} name={patient.fullName} size={64} sx={{ borderRadius: "18px", flexShrink: 0 }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="h6" fontWeight={700} noWrap sx={{ letterSpacing: -0.2, lineHeight: 1.25 }}>
                    {patient.fullName}
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

                  {patient.secondaryPhone && (
                    <Stack direction="row" alignItems="center" gap={0.75} color="text.secondary" sx={{ mt: 0.5 }}>
                      <LocalPhoneOutlined fontSize="small" />
                      <Typography variant="body2">{patient.secondaryPhone}</Typography>
                    </Stack>
                  )}
                </Box>
              </Stack>

              {/* Дата рождения + адрес */}
              {(patient.birthDate || patient.address) && (
                <Box
                  sx={{
                    display: "grid",
                    gap: 1,
                    gridTemplateColumns: patient.birthDate && patient.address ? "1fr 1fr" : "1fr",
                  }}
                >
                  {patient.birthDate && (
                    <InfoTile
                      icon={<CalendarMonthOutlined />}
                      label="Дата рождения"
                      value={`${formatDateRu(patient.birthDate)} ${calculateAge(patient.birthDate)}`}
                    />
                  )}
                  {patient.address && (
                    <InfoTile icon={<PlaceOutlined />} label="Адрес" value={patient.address} />
                  )}
                </Box>
              )}

              {/* Семья */}
              {patient.family && (
                <FactBlock icon={<GroupsOutlined />} title="Семья">
                  <Typography variant="body2" fontWeight={600}>
                    {patient.family.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {patient.family.memberCount} участника
                  </Typography>
                </FactBlock>
              )}

              {/* Счёт пациента */}
              <FactBlock icon={<AccountBalanceWalletOutlined />} title="Счёт пациента">
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <AmountTile
                    icon={<AccountBalanceWalletOutlined />}
                    label="Баланс"
                    value={balance ? `${formatMoney(balance.balance)} сом` : "—"}
                    tone="success"
                  />
                  <AmountTile
                    icon={<CardGiftcardOutlined />}
                    label="Бонусы"
                    value={balance ? `${formatMoney(balance.bonuses)} сом` : "—"}
                    tone="warning"
                  />
                </Stack>
              </FactBlock>

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

              {/* Примечания */}
              {patient.notes && (
                <FactBlock icon={<NotesOutlined />} title="Примечания">
                  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{patient.notes}</Typography>
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
