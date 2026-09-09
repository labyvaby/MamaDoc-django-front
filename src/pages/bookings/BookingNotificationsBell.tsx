import React from "react";
import {
  Badge,
  Box,
  Button,
  ButtonBase,
  CircularProgress,
  IconButton,
  Popover,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import NotificationsNoneOutlined from "@mui/icons-material/NotificationsNoneOutlined";
import dayjs from "dayjs";

import type { BookingListItem } from "../../api/bookings";
import { useNewBookings } from "../../hooks/useNewBookings";
import { UserAvatar } from "../../components/ui";
import { subtleBg } from "../../theme/uiHelpers";
import { formatKGS } from "../../utility/format";

/**
 * Новые заявки — вместо того чтобы регистратор сам замечал их в списке.
 *
 * Живого канала (websocket/SSE) у бэка нет и не планируется (plain WSGI, см.
 * [[appointments-realtime-2026-07-08]]), выделенной ручки уведомлений под
 * брони тоже нет — в отличие от задач (`TaskNotificationsBell`), где бэк сам
 * хранит непрочитанное. Поллинг и отметка о просмотре живут в
 * `useNewBookings`: тот же поток питает подсветку строк в списке, глобальный
 * тост и счётчик в заголовке вкладки, поэтому «Прочитать все» здесь гасит
 * «новое» сразу везде.
 */

export interface BookingNotificationsBellProps {
  onOpenBooking: (id: number) => void;
}

const BookingNotificationsBell: React.FC<BookingNotificationsBellProps> = ({
  onOpenBooking,
}) => {
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const { items, count, markSeen, isLoading, isError } = useNewBookings();

  const handleItemClick = (b: BookingListItem) => {
    markSeen([b.id]);
    setAnchor(null);
    onOpenBooking(b.id);
  };

  return (
    <>
      <Tooltip title="Новые заявки">
        <IconButton
          onClick={(e) => setAnchor(e.currentTarget)}
          aria-label="Уведомления о новых заявках"
          sx={{ border: 1, borderColor: "divider", borderRadius: "10px", bgcolor: "background.paper" }}
        >
          <Badge badgeContent={count} color="error" max={99}>
            <NotificationsNoneOutlined sx={{ fontSize: 22 }} />
          </Badge>
        </IconButton>
      </Tooltip>

      <Popover
        open={anchor != null}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { width: 360, maxWidth: "calc(100vw - 32px)", borderRadius: "12px" } } }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ px: 2, py: 1.25, borderBottom: 1, borderColor: "divider" }}
        >
          <Typography variant="subtitle2" fontWeight={600}>
            Новые заявки
          </Typography>
          {count > 0 && (
            <Button
              size="small"
              onClick={() => markSeen(items.map((b) => b.id))}
              sx={{ textTransform: "none" }}
            >
              Прочитать все
            </Button>
          )}
        </Stack>

        {isLoading ? (
          <Stack alignItems="center" py={4}>
            <CircularProgress size={22} />
          </Stack>
        ) : isError ? (
          <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 3, textAlign: "center" }}>
            Не удалось загрузить заявки
          </Typography>
        ) : count === 0 ? (
          <Stack alignItems="center" py={4} sx={{ opacity: 0.7 }}>
            <NotificationsNoneOutlined sx={{ fontSize: 36, color: "text.disabled", mb: 0.5 }} />
            <Typography variant="body2" color="text.secondary">
              Новых заявок нет
            </Typography>
          </Stack>
        ) : (
          <Stack sx={{ maxHeight: 420, overflowY: "auto", py: 0.5 }}>
            {items.map((b) => (
              <ButtonBase
                key={b.id}
                onClick={() => handleItemClick(b)}
                sx={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "flex-start",
                  textAlign: "left",
                  gap: 1.25,
                  px: 2,
                  py: 1.25,
                  width: "100%",
                  "&:hover": { bgcolor: (t) => subtleBg(t, true) },
                }}
              >
                <UserAvatar name={b.patientName} size={34} sx={{ borderRadius: "9px", flexShrink: 0 }} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2" fontWeight={600} noWrap>
                    {b.patientName}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {b.doctorName || "—"} · {dayjs(b.date).format("DD.MM")} {b.time}
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0, mt: 0.25 }}>
                  {formatKGS(b.totalPrice)}
                </Typography>
              </ButtonBase>
            ))}
          </Stack>
        )}
      </Popover>
    </>
  );
};

export default BookingNotificationsBell;
