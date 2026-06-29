/**
 * PatientCard.tsx
 * Карточка выбранного пациента (правая колонка).
 * Отображает основную информацию о пациенте и краткое резюме последнего приема.
 * Презентационный компонент: не содержит API-логики, принимает данные через пропсы.
 */
import React from "react";
import {
  Card,
  CardHeader,
  CardContent,
  Divider,
  Stack,
  Typography,
  Avatar,
  Box,
  Button,
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
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import LocalPhoneOutlined from "@mui/icons-material/LocalPhoneOutlined";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import BadgeOutlined from "@mui/icons-material/BadgeOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import MergeTypeIcon from "@mui/icons-material/MergeTypeOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVertOutlined";
import { formatDateRu } from "../../../utility/format";
import PhoneInTalkOutlined from "@mui/icons-material/PhoneInTalkOutlined";
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
      <Card
        variant="outlined"
        sx={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          // Unified design
        }}
      >
        <CardHeader
          title={
            <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} flexWrap="wrap">
              <Stack direction="row" alignItems="center" gap={1.25}>
                <PersonOutlineOutlined color="primary" />
                <Typography variant="h6">Карточка пациента</Typography>
              </Stack>
              {patient && (onTopUp || onEdit || onMerge) && (
                <>
                  {/* Кнопки — на md+ */}
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
          sx={{ pb: 1 }}
        />
        <Divider />
        <CardContent sx={{ p: 0, flex: 1, overflowY: "auto", minHeight: 0 }}>
          {patient ? (
            <Stack spacing={2} sx={{ p: 2 }}>
              {patient.is_blacklisted && (
                <Alert severity="error" variant="filled">
                  <AlertTitle>В черном списке</AlertTitle>
                  {patient.blacklist_reason || "Причина не указана"}
                </Alert>
              )}
              <Stack direction="row" alignItems="center" spacing={2}>
                <Avatar
                  src={patient.photo || undefined}
                  sx={{ width: 64, height: 64 }}
                />
                <Box>
                  <Typography variant="h6" sx={{ lineHeight: 1.2 }}>{patient.fio}</Typography>

                  {patient.phone ? (
                    <Link
                      href={`tel:${patient.phone}`}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        color: 'text.secondary',
                        textDecoration: 'none',
                        mt: 0.5,
                        '&:hover': {
                          color: 'primary.onSurface',
                        },
                        '&:active': {
                          color: 'primary.dark',
                        },
                      }}
                    >
                      <PhoneInTalkOutlined
                        fontSize="small"
                        sx={{
                          color: 'primary.onSurface',
                        }}
                      />
                      <Typography variant="body2">{patient.phone}</Typography>
                    </Link>
                  ) : (
                    <Stack direction="row" alignItems="center" gap={1} color="text.secondary" sx={{ mt: 0.5 }}>
                      <LocalPhoneOutlined fontSize="small" />
                      <Typography variant="body2">—</Typography>
                    </Stack>
                  )}

                  <Stack direction="row" alignItems="center" gap={1} color="text.secondary" sx={{ mt: 0.5 }}>
                    <BadgeOutlined fontSize="small" />
                    <Typography variant="body2">ИНН: {patient.inn || "отсутствует"}</Typography>
                  </Stack>

                  {patient.birth_date && (
                    <Stack direction="row" alignItems="center" gap={1} color="text.secondary" sx={{ mt: 0.5 }}>
                      <CalendarMonthOutlined fontSize="small" />
                      <Typography variant="body2">
                        {formatDateRu(patient.birth_date)} {calculateAge(patient.birth_date)}
                      </Typography>
                    </Stack>
                  )}

                </Box>
              </Stack>

              {/* Vitals Section */}
              {(lastWeight || lastHeight || lastTemperature) && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Stack spacing={1}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Последние измерения
                    </Typography>
                    <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
                      {lastHeight && (
                        <Chip label={`Рост: ${lastHeight} см`} size="small" variant="outlined" />
                      )}
                      {lastWeight && (
                        <Chip label={`Вес: ${lastWeight} кг`} size="small" variant="outlined" />
                      )}
                      {lastTemperature && (
                        <Chip label={`Темп: ${lastTemperature} °C`} size="small" variant="outlined" color={lastTemperature > 37 ? "warning" : "default"} />
                      )}
                    </Stack>
                  </Stack>
                </>
              )}

              {/* Balance Section */}
              {balance !== undefined && balance !== null && (
                <>
                  <Divider sx={{ my: 1 }} />
                  <Stack spacing={1}>
                    <Stack direction="row" alignItems="center" gap={1}>
                      <AccountBalanceWalletOutlined fontSize="small" color="action" />
                      <Typography variant="subtitle2" color="text.secondary">
                        Счёт пациента
                      </Typography>
                    </Stack>
                    <Stack direction="row" spacing={1.5} flexWrap="wrap">
                      <Box
                        sx={{
                          flex: 1,
                          minWidth: 80,
                          borderRadius: 1,
                          border: "1px solid",
                          borderColor: "divider",
                          px: 1.5,
                          py: 1,
                          textAlign: "center",
                        }}
                      >
                        <Typography variant="caption" color="text.secondary" display="block">
                          Баланс
                        </Typography>
                        <Typography
                          variant="body2"
                          fontWeight={600}
                          color={balance.balance > 0 ? "success.main" : "text.primary"}
                        >
                          {balance.balance.toLocaleString("ru-RU")} сом
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          flex: 1,
                          minWidth: 80,
                          borderRadius: 1,
                          border: "1px solid",
                          borderColor: "divider",
                          px: 1.5,
                          py: 1,
                          textAlign: "center",
                        }}
                      >
                        <Typography variant="caption" color="text.secondary" display="block">
                          Бонусы
                        </Typography>
                        <Typography
                          variant="body2"
                          fontWeight={600}
                          color={balance.bonuses > 0 ? "warning.main" : "text.primary"}
                        >
                          {balance.bonuses.toLocaleString("ru-RU")} сом
                        </Typography>
                      </Box>
                    </Stack>
                  </Stack>
                </>
              )}

              {(lastDateTime || lastService || lastComplaints) && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Stack spacing={1}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Последний прием
                    </Typography>

                    {lastDateTime && (
                      <Stack direction="row" alignItems="center" gap={1} color="text.secondary">
                        <CalendarMonthOutlined fontSize="small" />
                        <Typography variant="body2">{lastDateTime}</Typography>
                      </Stack>
                    )}

                    {lastService && (
                      <Typography variant="body2">
                        <Typography
                          component="span"
                          variant="body2"
                          color="text.secondary"
                          sx={{ mr: 0.5 }}
                        >
                          Услуга:
                        </Typography>
                        {lastService}
                      </Typography>
                    )}

                    {lastComplaints && (
                      <Typography variant="body2">
                        <Typography
                          component="span"
                          variant="body2"
                          color="text.secondary"
                          sx={{ mr: 0.5 }}
                        >
                          Жалобы:
                        </Typography>
                        {lastComplaints}
                      </Typography>
                    )}
                  </Stack>
                </>
              )}
            </Stack>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4, opacity: 0.6 }}>
              <PersonOutlineOutlined sx={{ fontSize: 48, mb: 1, color: 'text.secondary' }} />
              <Typography variant="body1" color="text.secondary">
                Выберите пациента из списка
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default PatientCard;
