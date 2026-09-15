import React from "react";
import {
  Alert,
  Box,
  Divider,
  Drawer,
  IconButton,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import CloseOutlined from "@mui/icons-material/CloseOutlined";
import PhoneOutlined from "@mui/icons-material/PhoneOutlined";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import EventAvailableOutlined from "@mui/icons-material/EventAvailableOutlined";
import PhoneCallbackOutlined from "@mui/icons-material/PhoneCallbackOutlined";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import MedicalServicesOutlined from "@mui/icons-material/MedicalServicesOutlined";
import DateRangeOutlined from "@mui/icons-material/DateRangeOutlined";
import ScheduleOutlined from "@mui/icons-material/ScheduleOutlined";
import CalendarViewWeekOutlined from "@mui/icons-material/CalendarViewWeekOutlined";
import HourglassBottomOutlined from "@mui/icons-material/HourglassBottomOutlined";
import ApartmentOutlined from "@mui/icons-material/ApartmentOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import ReplayOutlined from "@mui/icons-material/ReplayOutlined";
import RemoveCircleOutlineOutlined from "@mui/icons-material/RemoveCircleOutlineOutlined";

import { AppButton, InfoTile, UserAvatar } from "../ui";
import { subtleBg } from "../../theme/uiHelpers";
import { useT } from "../../i18n/VerticalProvider";
import { formatPhoneDisplay } from "../../utility/phone";
import { djangoQueryKeys, DJANGO_DETAIL_STALE_TIME_MS } from "../../api/queryKeys";
import {
  getWaitlistEntry,
  WAITLIST_ACTIVE_STATUSES,
  type WaitlistContact,
  type WaitlistEntry,
} from "../../api/waitlist";
import {
  displayName,
  isExpiringSoon,
  periodLabel,
  timeRangeLabel,
  waitingDays,
  waitingForLabel,
  weekdaysLabel,
  WAITLIST_CONTACT_RESULT_META,
} from "../../pages/waitlist/meta";
import { WaitlistPriorityChip, WaitlistSourceChip, WaitlistStatusChip } from "./WaitlistChips";

export interface WaitlistDetailDrawerProps {
  /** Строка списка: шапка рисуется сразу, история звонков догружается. */
  entry: WaitlistEntry | null;
  organizationId?: number;
  canCreate: boolean;
  canManage: boolean;
  onClose: () => void;
  onContact: (entry: WaitlistEntry) => void;
  onBook: (entry: WaitlistEntry) => void;
  onEdit: (entry: WaitlistEntry) => void;
  onCancel: (entry: WaitlistEntry) => void;
  onReopen: (entry: WaitlistEntry) => void;
}

const SECTION_SX = { fontWeight: 600, fontSize: "0.8125rem", color: "text.secondary", mb: 1 } as const;

const ContactItem: React.FC<{ contact: WaitlistContact; last: boolean }> = ({ contact, last }) => {
  const { t } = useT("waitlist");
  const meta = WAITLIST_CONTACT_RESULT_META[contact.result];
  return (
    <Stack direction="row" gap={1.5}>
      {/* Точка результата и линия-связка до следующего звонка */}
      <Stack alignItems="center" sx={{ pt: 0.6 }}>
        <Box
          sx={(th) => ({
            width: 10,
            height: 10,
            borderRadius: "50%",
            flexShrink: 0,
            bgcolor: meta?.color ? th.palette[meta.color].main : th.palette.grey[500],
          })}
        />
        {!last && <Box sx={{ width: "1px", flex: 1, bgcolor: "divider", my: 0.5 }} />}
      </Stack>
      <Box sx={{ minWidth: 0, pb: last ? 0 : 1.75 }}>
        <Typography variant="body2" fontWeight={600}>
          {meta?.label ?? contact.result}
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block">
          {[contact.actorName, dayjs(contact.createdAt).format("DD.MM.YYYY HH:mm")]
            .filter(Boolean)
            .join(" · ")}
        </Typography>
        {contact.offeredStart && (
          <Typography variant="caption" color="text.secondary" display="block">
            {t("detail.offeredSlot", { slot: dayjs(contact.offeredStart).format("DD.MM HH:mm") })}
          </Typography>
        )}
        {contact.note && (
          <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: "pre-wrap" }}>
            {contact.note}
          </Typography>
        )}
      </Box>
    </Stack>
  );
};

const WaitlistDetailDrawer: React.FC<WaitlistDetailDrawerProps> = ({
  entry: listEntry,
  organizationId,
  canCreate,
  canManage,
  onClose,
  onContact,
  onBook,
  onEdit,
  onCancel,
  onReopen,
}) => {
  const { t } = useT("waitlist");
  const open = listEntry != null;
  const [copied, setCopied] = React.useState(false);

  const detailQuery = useQuery({
    queryKey: djangoQueryKeys.waitlist.detail(listEntry?.id ?? 0),
    queryFn: ({ signal }) => getWaitlistEntry(listEntry!.id, organizationId, signal),
    enabled: open,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  });

  // Пока карточка догружается, показываем строку списка — она свежее кэша
  // карточки сразу после действия (список инвалидируется вместе с деталью).
  const entry: WaitlistEntry | null = detailQuery.data ?? listEntry;
  const contacts = detailQuery.data?.contacts ?? null;

  React.useEffect(() => setCopied(false), [listEntry?.id]);

  const handleCopy = async () => {
    if (!entry) return;
    try {
      await navigator.clipboard.writeText(entry.phone);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* буфер недоступен — номер виден на экране */
    }
  };

  const isActive = entry != null && WAITLIST_ACTIVE_STATUSES.includes(entry.status);
  const expiring = entry != null && isExpiringSoon(entry);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: { width: { xs: "100%", sm: 480 }, maxWidth: "100vw", display: "flex", flexDirection: "column" },
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" px={2} py={1.5}>
        <Typography variant="h6">{t("detail.title")}</Typography>
        <IconButton size="small" onClick={onClose}>
          <CloseOutlined fontSize="small" />
        </IconButton>
      </Stack>
      <Divider />

      {entry && (
        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 2, py: 2 }}>
          {/* ── Кто ждёт ── */}
          <Stack direction="row" gap={1.75} alignItems="center">
            <UserAvatar name={displayName(entry)} size={56} sx={{ borderRadius: "14px", flexShrink: 0 }} />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: -0.2, lineHeight: 1.25 }}>
                {displayName(entry)}
              </Typography>
              <Stack direction="row" alignItems="center" gap={0.25}>
                <Typography variant="body2" color="text.secondary">
                  {formatPhoneDisplay(entry.phone)}
                </Typography>
                <Tooltip title={copied ? t("detail.copied") : t("detail.copyPhone")}>
                  <IconButton size="small" onClick={handleCopy} sx={{ p: 0.5 }}>
                    {copied ? (
                      <CheckOutlined sx={{ fontSize: 15 }} color="success" />
                    ) : (
                      <ContentCopyOutlined sx={{ fontSize: 15 }} />
                    )}
                  </IconButton>
                </Tooltip>
              </Stack>
            </Box>
          </Stack>

          <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ mt: 1.5 }}>
            <WaitlistStatusChip status={entry.status} />
            <WaitlistPriorityChip priority={entry.priority} />
            <WaitlistSourceChip source={entry.source} />
          </Stack>

          {/* ── Действия ── */}
          {isActive && (
            <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 2, "& .MuiButton-root": { whiteSpace: "nowrap" } }}>
              <AppButton
                variant="outlined"
                href={`tel:${entry.phone}`}
                startIcon={<PhoneOutlined fontSize="small" />}
                sx={{ flex: 1, minWidth: 120 }}
              >
                {t("actions.call")}
              </AppButton>
              <AppButton
                variant="outlined"
                onClick={() => onContact(entry)}
                startIcon={<PhoneCallbackOutlined fontSize="small" />}
                sx={{ flex: 1, minWidth: 150 }}
              >
                {t("actions.contact")}
              </AppButton>
              {canCreate && (
                <AppButton
                  variant="contained"
                  onClick={() => onBook(entry)}
                  startIcon={<EventAvailableOutlined fontSize="small" />}
                  sx={{ flex: 1, minWidth: 120 }}
                >
                  {t("actions.book")}
                </AppButton>
              )}
            </Stack>
          )}
          {!isActive && canManage && (
            <AppButton
              variant="outlined"
              onClick={() => onReopen(entry)}
              startIcon={<ReplayOutlined fontSize="small" />}
              sx={{ mt: 2 }}
            >
              {t("actions.reopen")}
            </AppButton>
          )}

          {/* ── Чего и когда ждёт ── */}
          <Typography sx={{ ...SECTION_SX, mt: 3 }}>{t("detail.wish")}</Typography>
          {/* minWidth: 0 у плиток — иначе длинное значение с noWrap распирает сетку за край дровера */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" },
              gap: 1.25,
              "& > *": { minWidth: 0 },
            }}
          >
            {/* ФИО и список услуг длинные — им вся ширина */}
            <Box sx={{ gridColumn: "1 / -1" }}>
              <InfoTile icon={<PersonOutlineOutlined />} label={t("detail.specialist")} value={waitingForLabel(entry)} />
            </Box>
            <Box sx={{ gridColumn: "1 / -1" }}>
              <InfoTile
                icon={<MedicalServicesOutlined />}
                label={t("detail.services")}
                value={entry.services.map((s) => s.name).join(", ")}
                active={entry.services.length > 0}
              />
            </Box>
            <InfoTile icon={<DateRangeOutlined />} label={t("detail.period")} value={periodLabel(entry)} />
            <InfoTile
              icon={<ScheduleOutlined />}
              label={t("detail.time")}
              value={timeRangeLabel(entry) || t("detail.anyTime")}
              active={Boolean(timeRangeLabel(entry))}
            />
            <InfoTile
              icon={<CalendarViewWeekOutlined />}
              label={t("detail.weekdays")}
              value={weekdaysLabel(entry) || t("form.anyWeekday")}
              active={Boolean(weekdaysLabel(entry))}
            />
            <InfoTile
              icon={<HourglassBottomOutlined />}
              label={t("detail.activeUntil")}
              value={entry.activeUntil ? dayjs(entry.activeUntil).format("DD.MM.YYYY") : ""}
              active={entry.activeUntil != null}
            />
            {entry.branchName && (
              <InfoTile icon={<ApartmentOutlined />} label={t("detail.branch")} value={entry.branchName} />
            )}
          </Box>

          {expiring && (
            <Alert severity="warning" sx={{ mt: 1.25 }}>
              {t("kpi.expiringHint")}
            </Alert>
          )}

          {entry.comment && (
            <>
              <Typography sx={{ ...SECTION_SX, mt: 3 }}>{t("detail.comment")}</Typography>
              <Box
                sx={(th) => ({
                  p: 1.5,
                  borderRadius: "10px",
                  border: 1,
                  borderColor: "divider",
                  bgcolor: subtleBg(th),
                })}
              >
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                  {entry.comment}
                </Typography>
              </Box>
            </>
          )}

          {/* ── История звонков ── */}
          <Stack direction="row" alignItems="baseline" justifyContent="space-between" sx={{ mt: 3 }}>
            <Typography sx={SECTION_SX}>{t("detail.history")}</Typography>
            <Typography variant="caption" color="text.secondary">
              {t("waitingDays", { count: waitingDays(entry) })}
            </Typography>
          </Stack>
          {detailQuery.isLoading ? (
            <Stack spacing={1}>
              <Skeleton variant="rounded" height={44} />
              <Skeleton variant="rounded" height={44} />
            </Stack>
          ) : detailQuery.isError ? (
            <Alert severity="error">{t("loadError")}</Alert>
          ) : contacts && contacts.length > 0 ? (
            <Box>
              {[...contacts]
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map((c, i, arr) => (
                  <ContactItem key={c.id} contact={c} last={i === arr.length - 1} />
                ))}
            </Box>
          ) : (
            <Box
              sx={(th) => ({
                p: 1.5,
                borderRadius: "10px",
                border: 1,
                borderStyle: "dashed",
                borderColor: alpha(th.palette.text.primary, 0.16),
              })}
            >
              <Typography variant="body2" color="text.secondary">
                {t("detail.historyEmpty")}
              </Typography>
            </Box>
          )}

          {/* ── Служебное ── */}
          <Stack gap={0.25} sx={{ mt: 3 }}>
            <Typography variant="caption" color="text.secondary">
              {entry.source === "public"
                ? t("detail.createdFromSite", { date: dayjs(entry.createdAt).format("DD.MM.YYYY HH:mm") })
                : t("detail.createdBy", {
                    name: entry.createdByName || "—",
                    date: dayjs(entry.createdAt).format("DD.MM.YYYY HH:mm"),
                  })}
            </Typography>
            {entry.closedAt && (
              <Typography variant="caption" color="text.secondary">
                {t("detail.closedAt", { date: dayjs(entry.closedAt).format("DD.MM.YYYY HH:mm") })}
              </Typography>
            )}
            {entry.closeReason && (
              <Typography variant="caption" color="text.secondary">
                {t("detail.closeReason", { reason: entry.closeReason })}
              </Typography>
            )}
          </Stack>
        </Box>
      )}

      {entry && (canCreate || isActive) && (
        <>
          <Divider />
          <Stack direction="row" gap={1} justifyContent="space-between" px={2} py={1.25}>
            {canCreate ? (
              <AppButton color="inherit" startIcon={<EditOutlined fontSize="small" />} onClick={() => onEdit(entry)}>
                {t("actions.edit")}
              </AppButton>
            ) : (
              <span />
            )}
            {isActive && (
              <AppButton
                color="error"
                startIcon={<RemoveCircleOutlineOutlined fontSize="small" />}
                onClick={() => onCancel(entry)}
              >
                {t("actions.cancel")}
              </AppButton>
            )}
          </Stack>
        </>
      )}
    </Drawer>
  );
};

export default WaitlistDetailDrawer;
