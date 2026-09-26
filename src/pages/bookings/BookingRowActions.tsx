import React from "react";
import { Button, Chip, CircularProgress, IconButton, Stack, Tooltip } from "@mui/material";
import CallOutlined from "@mui/icons-material/CallOutlined";
import CancelOutlined from "@mui/icons-material/CancelOutlined";
import ChatOutlined from "@mui/icons-material/ChatOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import EventRepeatOutlined from "@mui/icons-material/EventRepeatOutlined";
import PersonOffOutlined from "@mui/icons-material/PersonOffOutlined";
import NotificationsActiveOutlined from "@mui/icons-material/NotificationsActiveOutlined";
import MarkChatReadOutlined from "@mui/icons-material/MarkChatReadOutlined";
import PanToolAltOutlined from "@mui/icons-material/PanToolAltOutlined";

import type { BookingListItem } from "../../api/bookings";
import { ConfirmDialog } from "../../components/ui";
import { useCan } from "../../hooks/useCan";
import { usePermissions } from "../../hooks/usePermissions";
import { useT } from "../../i18n/VerticalProvider";
import { subtleBg } from "../../theme/uiHelpers";
import { visitDayPhrase, whatsappUrl } from "./bookingViews";
import type { MissedCloseStatus, useBookingActions } from "./useBookingActions";

type Actions = ReturnType<typeof useBookingActions>;

/** «Иванова Айгуль Маратовна» → «Иванова Айгуль»: чипу в строке хватит двух слов. */
const shortName = (full: string): string => full.trim().split(/\s+/).slice(0, 2).join(" ");

// ── Напоминания: что уже отправляли (удобство одного устройства) ─────────────

const REMINDED_KEY = "mamadoc:bookings:reminded";
const REMINDED_CAP = 500;

function loadReminded(): Set<number> {
  try {
    const arr = JSON.parse(window.localStorage.getItem(REMINDED_KEY) ?? "[]");
    return new Set(Array.isArray(arr) ? (arr as number[]) : []);
  } catch {
    return new Set();
  }
}

/**
 * Отметка «напоминание уже открывали». Отправку WhatsApp подтвердить нельзя —
 * мы лишь открыли чат с готовым текстом, — поэтому это подсказка «не дублируй»,
 * а не факт доставки, и живёт в браузере, а не на сервере.
 */
const REMINDED_EVENT = "mamadoc:bookings-reminded";

export function useRemindedBookings() {
  const [reminded, setReminded] = React.useState<Set<number>>(loadReminded);

  // Список и карточка держат отметку каждый у себя — синхронизируем событием,
  // иначе галочка в строке появлялась бы только после перезагрузки.
  React.useEffect(() => {
    const reload = () => setReminded(loadReminded());
    window.addEventListener(REMINDED_EVENT, reload);
    return () => window.removeEventListener(REMINDED_EVENT, reload);
  }, []);

  const markReminded = React.useCallback((id: number) => {
    const next = loadReminded();
    if (next.has(id)) return;
    next.add(id);
    try {
      window.localStorage.setItem(REMINDED_KEY, JSON.stringify(Array.from(next).slice(-REMINDED_CAP)));
    } catch {
      /* приватный режим — запомним только до перезагрузки */
    }
    setReminded(next);
    window.dispatchEvent(new Event(REMINDED_EVENT));
  }, []);

  return { reminded, markReminded };
}

/** Текст напоминания пациенту — из локали, терминология по вертикали. */
export function useReminderText() {
  const { t } = useT("bookings");
  const { activeOrganization } = usePermissions();
  return React.useCallback(
    (b: BookingListItem): string =>
      [
        t("reminder.greeting", { name: b.patientName.trim().split(/\s+/)[0] || b.patientName }),
        t("reminder.when", { day: visitDayPhrase(b.date), time: (b.time || "").slice(0, 5) }),
        b.doctorName ? t("reminder.specialist", { doctor: b.doctorName }) : null,
        b.branchName ? t("reminder.branch", { branch: b.branchName }) : null,
        t("reminder.changePlans"),
        activeOrganization?.name ?? null,
      ]
        .filter(Boolean)
        .join("\n"),
    [t, activeOrganization?.name],
  );
}

// ── Отметка «в работе» ────────────────────────────────────────────────────────

export const ClaimControl: React.FC<{
  booking: BookingListItem;
  canManage: boolean;
  actions: Actions;
  size?: "small" | "medium";
}> = ({ booking: b, canManage, actions, size = "small" }) => {
  const { claim, unclaim } = actions;
  const busy =
    (claim.isPending && claim.variables === b.id) ||
    (unclaim.isPending && unclaim.variables === b.id);

  if (b.claimedBy) {
    return (
      <Tooltip title={canManage ? "Снять отметку — например, не дозвонились" : "Заявку разбирает"}>
        <Chip
          size="small"
          icon={<PanToolAltOutlined sx={{ fontSize: 16 }} />}
          label={shortName(b.claimedBy.fullName)}
          onDelete={canManage && !busy ? () => unclaim.mutate(b.id) : undefined}
          sx={(t) => ({
            height: size === "medium" ? 28 : 24,
            borderRadius: "7px",
            fontWeight: 500,
            // Не шире контейнера: в таблице ячейка «В работе» узкая, и при
            // фиксированном maxWidth правый край чипа с крестиком «снять»
            // обрезался. Имя усечётся, но крестик останется в клетке.
            maxWidth: "100%",
            color: "text.primary",
            bgcolor: subtleBg(t, true),
          })}
        />
      </Tooltip>
    );
  }
  if (!canManage || b.status !== "pending") return null;
  return (
    <Tooltip title="Отметить, что вы связываетесь по этой заявке, — коллеги увидят">
      <Button
        size="small"
        variant="outlined"
        disabled={busy}
        startIcon={busy ? <CircularProgress size={12} /> : <PanToolAltOutlined sx={{ fontSize: 16 }} />}
        onClick={(e) => {
          e.stopPropagation();
          claim.mutate(b.id);
        }}
        sx={{ textTransform: "none", height: size === "medium" ? 28 : 26, px: 1, whiteSpace: "nowrap" }}
      >
        Взять
      </Button>
    </Tooltip>
  );
};

// ── Пропущенная заявка ────────────────────────────────────────────────────────

/**
 * Исходы пропущенной заявки (`isBookingMissed`): перезаписать, неявка, отмена.
 * «Подтвердить» здесь нет намеренно — приём создался бы задним числом на
 * время, когда пациента не принимали. Один компонент на строку списка
 * (`variant="icons"`) и футер карточки (`variant="buttons"`), чтобы набор
 * исходов и тексты подтверждений не расходились.
 */
export const MissedBookingActions: React.FC<{
  booking: BookingListItem;
  actions: Actions;
  variant: "icons" | "buttons";
}> = ({ booking: b, actions, variant }) => {
  const { t } = useT("bookings");
  const canCreateAppointment = useCan("appointments.create");
  const [ask, setAsk] = React.useState<MissedCloseStatus | null>(null);
  const closing = actions.closeMissed.isPending && actions.closeMissed.variables?.id === b.id;
  const rebooking = actions.rebook.isPending && actions.rebook.variables === b.id;
  const busy = closing || rebooking;

  const items: {
    key: string;
    label: string;
    tooltip: string;
    icon: React.ReactNode;
    color: "primary" | "inherit" | "error";
    onClick: () => void;
    hidden?: boolean;
  }[] = [
    {
      key: "rebook",
      label: t("missed.rebook"),
      tooltip: t("missed.rebookTooltip"),
      icon: rebooking ? <CircularProgress size={16} color="inherit" /> : <EventRepeatOutlined sx={{ fontSize: 18 }} />,
      color: "primary",
      onClick: () => actions.rebook.mutate(b.id),
      hidden: !canCreateAppointment,
    },
    {
      key: "no_show",
      label: t("missed.noShow"),
      tooltip: t("missed.noShowTooltip"),
      icon: <PersonOffOutlined sx={{ fontSize: 18 }} />,
      color: "inherit",
      onClick: () => setAsk("no_show"),
    },
    {
      key: "cancelled",
      label: t("missed.cancel"),
      tooltip: t("missed.cancelTooltip"),
      icon: <CancelOutlined sx={{ fontSize: 18 }} />,
      color: "error",
      onClick: () => setAsk("cancelled"),
    },
  ];

  const dialog = (
    <ConfirmDialog
      open={ask != null}
      onClose={() => setAsk(null)}
      onConfirm={() => {
        if (ask) actions.closeMissed.mutate({ id: b.id, status: ask }, { onSettled: () => setAsk(null) });
      }}
      title={ask === "cancelled" ? t("cancelConfirm.title") : t("missed.noShowConfirm.title")}
      message={ask === "cancelled" ? t("cancelConfirm.message") : t("missed.noShowConfirm.message")}
      confirmText={ask === "cancelled" ? t("cancelConfirm.confirm") : t("missed.noShowConfirm.confirm")}
      cancelText={ask === "cancelled" ? t("cancelConfirm.cancel") : t("missed.noShowConfirm.cancel")}
      variant={ask === "cancelled" ? "error" : "warning"}
      loading={closing}
    />
  );

  if (variant === "icons") {
    return (
      <>
        {items
          .filter((i) => !i.hidden)
          .map((i) => (
            <Tooltip key={i.key} title={i.tooltip}>
              <span>
                <IconButton
                  size="small"
                  color={i.color === "inherit" ? "default" : i.color}
                  disabled={busy}
                  onClick={i.onClick}
                >
                  {i.icon}
                </IconButton>
              </span>
            </Tooltip>
          ))}
        {dialog}
      </>
    );
  }

  return (
    <>
      {items
        .filter((i) => !i.hidden)
        .map((i) => (
          <Button
            key={i.key}
            size="small"
            variant={i.color === "primary" ? "contained" : "outlined"}
            color={i.color}
            startIcon={i.icon}
            disabled={busy}
            onClick={i.onClick}
            sx={{ textTransform: "none" }}
          >
            {i.label}
          </Button>
        ))}
      {dialog}
    </>
  );
};

// ── Кнопки строки ─────────────────────────────────────────────────────────────

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

export const BookingRowActions: React.FC<{
  booking: BookingListItem;
  /** `missed` — пропущенная заявка из «Разобрать»: другой набор исходов. */
  mode: "triage" | "missed" | "upcoming";
  canManage: boolean;
  actions: Actions;
  reminded?: boolean;
  onRemind?: (b: BookingListItem) => void;
  reminderText?: (b: BookingListItem) => string;
}> = ({ booking: b, mode, canManage, actions, reminded, onRemind, reminderText }) => {
  const { t } = useT("bookings");
  const confirming = actions.quickConfirm.isPending && actions.quickConfirm.variables === b.id;

  return (
    <Stack direction="row" alignItems="center" gap={0.25} onClick={stop}>
      {b.patientPhone && (
        <Tooltip title={t("detail.call")}>
          <IconButton size="small" component="a" href={`tel:${b.patientPhone}`}>
            <CallOutlined sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      )}

      {b.patientPhone && (mode === "triage" || mode === "missed") && (
        <Tooltip title={t("detail.whatsapp")}>
          <IconButton
            size="small"
            component="a"
            href={whatsappUrl(b.patientPhone)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ChatOutlined sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      )}

      {b.patientPhone && mode === "upcoming" && reminderText && (
        <Tooltip title={reminded ? t("reminder.sent") : t("reminder.button")}>
          <IconButton
            size="small"
            component="a"
            href={whatsappUrl(b.patientPhone, reminderText(b))}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onRemind?.(b)}
            color={reminded ? "success" : "default"}
          >
            {reminded ? (
              <MarkChatReadOutlined sx={{ fontSize: 18 }} />
            ) : (
              <NotificationsActiveOutlined sx={{ fontSize: 18 }} />
            )}
          </IconButton>
        </Tooltip>
      )}

      {mode === "missed" && canManage && b.status === "pending" && (
        <MissedBookingActions booking={b} actions={actions} variant="icons" />
      )}

      {mode === "triage" && canManage && b.status === "pending" && (
        <Tooltip title="Подтвердить: карта по телефону и услуги из заявки. Если карт несколько — откроется карточка">
          <span>
            <IconButton
              size="small"
              color="success"
              disabled={actions.quickConfirm.isPending}
              onClick={() => actions.quickConfirm.mutate(b.id)}
            >
              {confirming ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <CheckCircleOutlined sx={{ fontSize: 18 }} />
              )}
            </IconButton>
          </span>
        </Tooltip>
      )}
    </Stack>
  );
};
