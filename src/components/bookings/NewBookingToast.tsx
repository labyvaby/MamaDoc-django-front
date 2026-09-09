import React from "react";
import { Box, Button, IconButton, Snackbar, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import { useNavigate } from "react-router";
import dayjs from "dayjs";

import type { BookingListItem } from "../../api/bookings";
import { useNewBookings } from "../../hooks/useNewBookings";
import { usePermissions } from "../../hooks/usePermissions";
import { UserAvatar } from "../ui";
import { formatKGS } from "../../utility/format";

/**
 * «Пришла новая заявка» — из любого экрана CRM, а не только со страницы броней.
 *
 * Бейдж в сайдбаре показывает лишь число: чтобы понять, кто записался и на
 * когда, надо было уйти со своего экрана. Тост показывает саму заявку и ведёт
 * прямо в её карточку.
 *
 * Показываем только то, что пришло **при нас**: при первом ответе поллера
 * запоминаем текущие id как уже известные и молчим — иначе на каждом входе в
 * CRM вываливался бы тост о заявках, которые давно висят (их место — бейдж,
 * колокольчик и подсветка в списке).
 *
 * На странице броней тост тоже показываем. Казалось бы, там достаточно
 * подсветки строки, но список ограничен фильтрами: заявка на дату вне
 * выбранного периода (или под другим статусом) в него не попадает вовсе, и
 * приход остался бы незаметным именно на том экране, где его ждут.
 */
export const NewBookingToast: React.FC = () => {
  const navigate = useNavigate();
  const { items, markSeen, enabled, isSuccess } = useNewBookings();

  const [toast, setToast] = React.useState<{ booking: BookingListItem; extra: number } | null>(
    null,
  );
  /** id, о которых уже знаем: показывать по ним тост второй раз не нужно. */
  const knownRef = React.useRef<Set<number> | null>(null);

  // Смена организации/филиала — это другой поток заявок: знакомимся заново,
  // иначе первая же выдача нового филиала выглядела бы как пачка новых.
  const { activeOrganization, activeBranch } = usePermissions();
  React.useEffect(() => {
    knownRef.current = null;
    setToast(null);
  }, [activeOrganization?.id, activeBranch?.id]);

  React.useEffect(() => {
    // Знакомимся только по настоящему ответу сервера: до него `items` пуст, и
    // если принять эту пустоту за «заявок нет», первая же выдача сойдёт за
    // пачку новых — тост вываливался бы о старых заявках на каждом входе.
    if (!enabled || !isSuccess) return;
    if (knownRef.current === null) {
      knownRef.current = new Set(items.map((b) => b.id));
      return;
    }
    const fresh = items.filter((b) => !knownRef.current!.has(b.id));
    items.forEach((b) => knownRef.current!.add(b.id));
    if (fresh.length === 0) return;
    setToast({ booking: fresh[0], extra: fresh.length - 1 });
  }, [items, enabled, isSuccess]);

  if (!toast) return null;

  const b = toast.booking;

  const handleOpen = () => {
    markSeen([b.id]);
    setToast(null);
    navigate(`/bookings?open=${b.id}`);
  };

  return (
    <Snackbar
      open
      autoHideDuration={12000}
      onClose={(_e, reason) => {
        if (reason === "clickaway") return;
        // Закрытие тоста не считается разбором заявки: она остаётся новой в
        // списке и в колокольчике, пока карточку не откроют.
        setToast(null);
      }}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
    >
      <Stack
        direction="row"
        spacing={1.5}
        alignItems="center"
        sx={(t) => ({
          px: 2,
          py: 1.5,
          borderRadius: "12px",
          border: 1,
          borderColor: alpha(t.palette.primary.main, 0.35),
          bgcolor: "background.paper",
          maxWidth: 440,
        })}
      >
        <UserAvatar name={b.patientName} size={40} sx={{ borderRadius: "10px", flexShrink: 0 }} />
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" alignItems="center" gap={0.75}>
            <EventAvailableOutlinedIcon sx={{ fontSize: 16, color: "primary.main" }} />
            <Typography variant="body2" fontWeight={700} noWrap>
              Новая заявка
              {toast.extra > 0 && ` · и ещё ${toast.extra}`}
            </Typography>
          </Stack>
          <Typography variant="body2" noWrap>
            {b.patientName}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap component="div">
            {b.doctorName || "—"} · {dayjs(b.date).format("DD.MM")} {b.time} ·{" "}
            {formatKGS(b.totalPrice)}
          </Typography>
        </Box>
        <Button size="small" variant="contained" onClick={handleOpen} sx={{ textTransform: "none", flexShrink: 0 }}>
          Открыть
        </Button>
        <IconButton size="small" onClick={() => setToast(null)} aria-label="Закрыть">
          <CloseOutlined fontSize="small" />
        </IconButton>
      </Stack>
    </Snackbar>
  );
};

export default NewBookingToast;
