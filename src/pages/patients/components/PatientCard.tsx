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
  Chip,
  Stack,
  Tooltip,
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
import MenuBookOutlined from "@mui/icons-material/MenuBookOutlined";
import WorkspacePremiumOutlined from "@mui/icons-material/WorkspacePremiumOutlined";

import { AppCard, InfoTile, UserAvatar, ListEmptyState } from "../../../components/ui";
import { subtleBg } from "../../../theme/uiHelpers";
import type { DjangoPatient } from "../../../api/patients";
import type { PatientBalance } from "../../../api/patientBalance";
import { useT } from "../../../i18n/VerticalProvider";

/** Тип функции перевода — карточка прокидывает её в хелперы вне компонента. */
type TFunc = (key: string, options?: Record<string, unknown>) => string;

function formatDateRu(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ru-RU");
}

function calculateAge(birthDateStr: string, t: TFunc): string {
  const birthDate = new Date(birthDateStr);
  const now = new Date();
  if (isNaN(birthDate.getTime())) return "";
  let y = now.getFullYear() - birthDate.getFullYear();
  let m = now.getMonth() - birthDate.getMonth();
  if (now.getDate() < birthDate.getDate()) m--;
  if (m < 0) { m += 12; y--; }
  // Склонение «год/года/лет» отдано плюрализации i18next вместо ручной таблицы.
  const yearStr = t("card.age.years", { count: y });
  const monthStr = t("card.age.months", { count: m });
  if (y === 0 && m === 0) return t("card.age.lessThanMonth");
  if (y === 0) return `(${m} ${monthStr})`;
  if (m === 0) return `(${y} ${yearStr})`;
  return t("card.ageYearsMonths", { years: y, yearWord: yearStr, months: m, monthWord: monthStr });
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
  onOpenProgram?: () => void;
  showProgramStatus?: boolean;
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
  onOpenProgram,
  showProgramStatus = true,
  lastDateTime,
  lastService,
  lastComplaints,
}) => {
  const { t } = useT("patients");
  const [menuAnchor, setMenuAnchor] = React.useState<null | HTMLElement>(null);

  return (
    <Box sx={{ height: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <AppCard
        variant="outlined"
        header={
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} flexWrap="wrap" sx={{ px: 2, pt: 2, pb: 1.5 }}>
            <Stack direction="row" alignItems="center" gap={1.25}>
              <PersonOutlineOutlined color="primary" />
              <Typography variant="h6">{t("card.title")}</Typography>
            </Stack>
            {patient && (onTopUp || onEdit || onMerge || onFace || onOpenProgram) && (
              <>
                {/* Колонка карточки узкая (≈260–460px) — текстовые кнопки в неё не влезали
                    и рвали шапку на две строки. Действия — компактными иконками с подсказками. */}
                <Stack
                  direction="row"
                  spacing={0.25}
                  sx={{ display: { xs: "none", md: "flex" }, flexShrink: 0 }}
                >
                  {onOpenProgram && (
                    <Tooltip title={t("card.actions.openProgram")}>
                      <IconButton size="small" color="primary" onClick={onOpenProgram}>
                        <MenuBookOutlined fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  {onTopUp && (
                    <Tooltip title={t("card.actions.topUpAccount")}>
                      <IconButton size="small" color="success" onClick={onTopUp}>
                        <AccountBalanceWalletOutlined fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  {onMerge && (
                    <Tooltip title={t("card.actions.mergeWithDuplicate")}>
                      <IconButton size="small" color="warning" onClick={onMerge}>
                        <MergeTypeIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  {onFace && (
                    <Tooltip title={t("card.actions.camera")}>
                      <IconButton size="small" color="info" onClick={onFace}>
                        <CameraAltOutlined fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  {onEdit && (
                    <Tooltip title={t("card.actions.edit")}>
                      {/* Основное действие карточки — приглушённая подложка вместо
                          contained-кнопки, чтобы не выбиваться из плоского стиля. */}
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={onEdit}
                        sx={(th) => ({ bgcolor: alpha(th.palette.primary.main, th.palette.mode === "dark" ? 0.2 : 0.12) })}
                      >
                        <EditOutlined fontSize="small" />
                      </IconButton>
                    </Tooltip>
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
                    {onOpenProgram && (
                      <MenuItem onClick={() => { setMenuAnchor(null); onOpenProgram(); }}>
                        <ListItemIcon><MenuBookOutlined fontSize="small" color="primary" /></ListItemIcon>
                        <ListItemText>{t("card.actions.openProgram")}</ListItemText>
                      </MenuItem>
                    )}
                    {onEdit && (
                      <MenuItem onClick={() => { setMenuAnchor(null); onEdit(); }}>
                        <ListItemIcon><EditOutlined fontSize="small" /></ListItemIcon>
                        <ListItemText>{t("card.actions.edit")}</ListItemText>
                      </MenuItem>
                    )}
                    {onTopUp && (
                      <MenuItem onClick={() => { setMenuAnchor(null); onTopUp(); }}>
                        <ListItemIcon><AccountBalanceWalletOutlined fontSize="small" color="success" /></ListItemIcon>
                        <ListItemText>{t("card.actions.topUpAccount")}</ListItemText>
                      </MenuItem>
                    )}
                    {onMerge && (
                      <MenuItem onClick={() => { setMenuAnchor(null); onMerge(); }}>
                        <ListItemIcon><MergeTypeIcon fontSize="small" color="warning" /></ListItemIcon>
                        <ListItemText>{t("card.actions.mergeWithDuplicate")}</ListItemText>
                      </MenuItem>
                    )}
                    {onFace && (
                      <MenuItem onClick={() => { setMenuAnchor(null); onFace(); }}>
                        <ListItemIcon><CameraAltOutlined fontSize="small" color="info" /></ListItemIcon>
                        <ListItemText>{t("card.actions.camera")}</ListItemText>
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
                  <AlertTitle sx={{ fontWeight: 600 }}>{t("card.blacklistTitle")}</AlertTitle>
                  {patient.blacklistReason || t("card.blacklistNoReason")}
                </Alert>
              )}
              {!patient.isActive && (
                <Alert severity="warning" variant="outlined" sx={{ borderRadius: "10px" }}>
                  {t("card.inactive")}
                </Alert>
              )}

              {/* Идентификация: аватар-плашка + имя + звонок(и) */}
              <Stack direction="row" alignItems="center" spacing={2}>
                <UserAvatar src={patient.photoUrl} name={patient.fullName} size={64} sx={{ borderRadius: "18px", flexShrink: 0 }} />
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" alignItems="center" gap={0.75} flexWrap="wrap">
                    <Typography variant="h6" fontWeight={700} noWrap sx={{ letterSpacing: -0.2, lineHeight: 1.25 }}>
                      {patient.fullName}
                    </Typography>
                    {showProgramStatus && patient.programStatus?.isVip && (
                      <Chip
                        size="small"
                        color="warning"
                        icon={<WorkspacePremiumOutlined />}
                        label={t("card.vip")}
                        sx={{ height: 24, fontWeight: 700 }}
                      />
                    )}
                  </Stack>

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
                      {t("card.noPhone")}
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
                      label={t("card.birthDate")}
                      value={`${formatDateRu(patient.birthDate)} ${calculateAge(patient.birthDate, t)}`}
                    />
                  )}
                  {patient.address && (
                    <InfoTile icon={<PlaceOutlined />} label={t("card.address")} value={patient.address} />
                  )}
                </Box>
              )}

              {/* Семья */}
              {patient.family && (
                <FactBlock icon={<GroupsOutlined />} title={t("card.family")}>
                  <Typography variant="body2" fontWeight={600}>
                    {patient.family.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t("card.familyMembers", { count: patient.family.memberCount })}
                  </Typography>
                </FactBlock>
              )}

              {/* Счёт пациента */}
              <FactBlock icon={<AccountBalanceWalletOutlined />} title={t("card.account")}>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <AmountTile
                    icon={<AccountBalanceWalletOutlined />}
                    label={t("card.balance")}
                    value={balance ? t("card.amountWithCurrency", { amount: formatMoney(balance.balance) }) : "—"}
                    tone="success"
                  />
                  <AmountTile
                    icon={<CardGiftcardOutlined />}
                    label={t("card.bonuses")}
                    value={balance ? t("card.amountWithCurrency", { amount: formatMoney(balance.bonuses) }) : "—"}
                    tone="warning"
                  />
                </Stack>
              </FactBlock>

              {/* Последний прием */}
              {(lastDateTime || lastService || lastComplaints) && (
                <FactBlock icon={<EventAvailableOutlined />} title={t("card.lastVisit")}>
                  <Stack spacing={0.5}>
                    {lastDateTime && (
                      <Typography variant="body2" fontWeight={600}>
                        {lastDateTime}
                      </Typography>
                    )}
                    {lastService && (
                      <Typography variant="body2">
                        <Typography component="span" variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>
                          {t("card.serviceLabel")}
                        </Typography>
                        {lastService}
                      </Typography>
                    )}
                    {lastComplaints && (
                      <Typography variant="body2">
                        <Typography component="span" variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>
                          {t("card.complaintsLabel")}
                        </Typography>
                        {lastComplaints}
                      </Typography>
                    )}
                  </Stack>
                </FactBlock>
              )}

              {/* Примечания */}
              {patient.notes && (
                <FactBlock icon={<NotesOutlined />} title={t("card.notes")}>
                  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{patient.notes}</Typography>
                </FactBlock>
              )}
            </Stack>
          ) : (
            <ListEmptyState
              icon={<PersonOutlineOutlined />}
              title={t("card.notSelectedTitle")}
              description={t("card.notSelectedDescription")}
            />
          )}
        </Box>
      </AppCard>
    </Box>
  );
};

export default PatientCard;
