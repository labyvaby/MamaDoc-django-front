/**
 * PatientCard — средняя колонка «Карточка пациента» (Django mode).
 * Презентационный компонент. Повторяет оригинальный PatientCard,
 * адаптированный под Django-поля (нет photo/ИНН в backend).
 */
import React from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  IconButton,
  Link,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from "@mui/material";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import LocalPhoneOutlined from "@mui/icons-material/LocalPhoneOutlined";
import PhoneInTalkOutlined from "@mui/icons-material/PhoneInTalkOutlined";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import BadgeOutlined from "@mui/icons-material/BadgeOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import MergeTypeIcon from "@mui/icons-material/MergeTypeOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVertOutlined";

import type { DjangoPatient } from "../../../api/patients";
import type { PatientBalance } from "../../../api/patientBalance";

function getInitials(fullName?: string): string {
  if (!fullName) return "—";
  const parts = String(fullName).trim().split(/\s+/);
  const a = (parts[0] || "").charAt(0);
  const b = (parts[1] || "").charAt(0);
  return ((a + b) || a || "—").toUpperCase();
}

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

type Props = {
  patient: DjangoPatient | null;
  balance: PatientBalance | null;
  onEdit?: () => void;
  onTopUp?: () => void;
  onMerge?: () => void;
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
  lastDateTime,
  lastService,
  lastComplaints,
}) => {
  const [menuAnchor, setMenuAnchor] = React.useState<null | HTMLElement>(null);

  return (
    <Box sx={{ height: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <Card variant="outlined" sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <CardHeader
          title={
            <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} flexWrap="wrap">
              <Stack direction="row" alignItems="center" gap={1.25}>
                <PersonOutlineOutlined color="primary" />
                <Typography variant="h6">Карточка пациента</Typography>
              </Stack>
              {patient && (onTopUp || onEdit || onMerge) && (
                <>
                  <Stack direction="row" spacing={1} flexShrink={0} sx={{ display: { xs: "none", md: "flex" } }}>
                    {onTopUp && (
                      <Button size="small" variant="outlined" color="success" onClick={onTopUp} startIcon={<AccountBalanceWalletOutlined />}>
                        Пополнить
                      </Button>
                    )}
                    {onMerge && (
                      <Button size="small" variant="outlined" color="warning" onClick={onMerge} startIcon={<MergeTypeIcon />}>
                        Объединить
                      </Button>
                    )}
                    {onEdit && (
                      <Button size="small" variant="contained" onClick={onEdit} startIcon={<EditOutlined />}>
                        Редактировать
                      </Button>
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
                    </Menu>
                  </Box>
                </>
              )}
            </Stack>
          }
          sx={{ pb: 1 }}
        />
        <Divider />
        <CardContent sx={{ p: 0, flex: 1, overflowY: "auto", minHeight: 0 }}>
          {patient ? (
            <Stack spacing={2} sx={{ p: 2 }}>
              <Stack direction="row" alignItems="center" spacing={2}>
                <Avatar
                  src={patient.photoUrl ?? undefined}
                  sx={{ width: 64, height: 64, bgcolor: "primary.main", fontSize: "1.4rem", fontWeight: 700 }}
                >
                  {getInitials(patient.fullName)}
                </Avatar>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="h6" sx={{ lineHeight: 1.2 }}>{patient.fullName}</Typography>

                  {patient.phone ? (
                    <Link
                      href={`tel:${patient.phone}`}
                      sx={{
                        display: "flex", alignItems: "center", gap: 1,
                        color: "text.secondary", textDecoration: "none", mt: 0.5,
                        "&:hover": { color: "primary.onSurface" },
                      }}
                    >
                      <PhoneInTalkOutlined fontSize="small" sx={{ color: "primary.onSurface" }} />
                      <Typography variant="body2">{patient.phone}</Typography>
                    </Link>
                  ) : (
                    <Stack direction="row" alignItems="center" gap={1} color="text.secondary" sx={{ mt: 0.5 }}>
                      <LocalPhoneOutlined fontSize="small" />
                      <Typography variant="body2">—</Typography>
                    </Stack>
                  )}

                  {patient.secondaryPhone && (
                    <Stack direction="row" alignItems="center" gap={1} color="text.secondary" sx={{ mt: 0.5 }}>
                      <LocalPhoneOutlined fontSize="small" />
                      <Typography variant="body2">{patient.secondaryPhone}</Typography>
                    </Stack>
                  )}

                  <Stack direction="row" alignItems="center" gap={1} color="text.secondary" sx={{ mt: 0.5 }}>
                    <BadgeOutlined fontSize="small" />
                    <Typography variant="body2">ИНН: отсутствует</Typography>
                  </Stack>

                  {patient.birthDate && (
                    <Stack direction="row" alignItems="center" gap={1} color="text.secondary" sx={{ mt: 0.5 }}>
                      <CalendarMonthOutlined fontSize="small" />
                      <Typography variant="body2">
                        {formatDateRu(patient.birthDate)} {calculateAge(patient.birthDate)}
                      </Typography>
                    </Stack>
                  )}
                </Box>
              </Stack>

              {/* Счёт пациента */}
              <Divider />
              <Stack spacing={1}>
                <Stack direction="row" alignItems="center" gap={1}>
                  <AccountBalanceWalletOutlined fontSize="small" color="action" />
                  <Typography variant="subtitle2" color="text.secondary">Счёт пациента</Typography>
                </Stack>
                <Stack direction="row" spacing={1.5} flexWrap="wrap">
                  <Box sx={{ flex: 1, minWidth: 80, borderRadius: 1, border: "1px solid", borderColor: "divider", px: 1.5, py: 1, textAlign: "center" }}>
                    <Typography variant="caption" color="text.secondary" display="block">Баланс</Typography>
                    <Typography variant="body2" fontWeight={600} color={Number(balance?.balance ?? 0) > 0 ? "success.main" : "text.primary"}>
                      {balance ? `${formatMoney(balance.balance)} сом` : "—"}
                    </Typography>
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 80, borderRadius: 1, border: "1px solid", borderColor: "divider", px: 1.5, py: 1, textAlign: "center" }}>
                    <Typography variant="caption" color="text.secondary" display="block">Бонусы</Typography>
                    <Typography variant="body2" fontWeight={600} color={Number(balance?.bonuses ?? 0) > 0 ? "warning.main" : "text.primary"}>
                      {balance ? `${formatMoney(balance.bonuses)} сом` : "—"}
                    </Typography>
                  </Box>
                </Stack>
              </Stack>

              {/* Последний приём */}
              {(lastDateTime || lastService || lastComplaints) && (
                <>
                  <Divider />
                  <Stack spacing={1}>
                    <Typography variant="subtitle2" color="text.secondary">Последний приём</Typography>
                    {lastDateTime && (
                      <Stack direction="row" alignItems="center" gap={1} color="text.secondary">
                        <CalendarMonthOutlined fontSize="small" />
                        <Typography variant="body2">{lastDateTime}</Typography>
                      </Stack>
                    )}
                    {lastService && (
                      <Typography variant="body2">
                        <Typography component="span" variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>Услуга:</Typography>
                        {lastService}
                      </Typography>
                    )}
                    {lastComplaints && (
                      <Typography variant="body2">
                        <Typography component="span" variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>Жалобы:</Typography>
                        {lastComplaints}
                      </Typography>
                    )}
                  </Stack>
                </>
              )}

              {patient.notes && (
                <>
                  <Divider />
                  <Stack spacing={0.5}>
                    <Typography variant="subtitle2" color="text.secondary">Примечания</Typography>
                    <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{patient.notes}</Typography>
                  </Stack>
                </>
              )}

              {!patient.isActive && (
                <Alert severity="warning" variant="outlined">Пациент помечен как неактивный</Alert>
              )}
            </Stack>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", py: 4, opacity: 0.6 }}>
              <PersonOutlineOutlined sx={{ fontSize: 48, mb: 1, color: "text.secondary" }} />
              <Typography variant="body1" color="text.secondary">Выберите пациента из списка</Typography>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default PatientCard;
