/**
 * «Пришла заявка с сайта» — из любого экрана CRM отеля: всплывающее
 * уведомление со звуком и кнопкой «Открыть» (карточка брони на ресепшене).
 * Висит, пока его не закроют или не откроют: заявка горит 30 минут, и
 * пропустить её за 15 секунд автозакрытия — ровно та проблема, которую
 * решаем. Счётчик на пункте «Ресепшен» и блок на самом ресепшене — те же
 * данные (useSiteRequests).
 *
 * В отличие от онлайн-записи клиники, уже висящие заявки при входе тоже
 * показываем: старше получаса заявка не бывает, значит, никто её ещё не
 * подтвердил. Повторно об одной заявке в этой вкладке не напоминаем.
 */
import React from "react";
import { Button, IconButton } from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import { useNavigate } from "react-router";
import { useSnackbar, type SnackbarKey } from "notistack";
import dayjs from "dayjs";

import type { HotelReservation } from "../api/hotel";
import { usePermissions } from "../hooks/usePermissions";
import { fmtMoney } from "./hotelReportFormat";
import { formatHotelDateRange } from "./mockDemoData";
import { useSiteRequests } from "./useSiteRequests";
import { useHotelRealtime } from "./hotelRealtime";

/** Короткий двойной сигнал. Браузер даёт звук только после первого клика по странице — иначе молча без него. */
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, 0.18].forEach((at, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = i === 0 ? 880 : 1175;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.32);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.35);
    });
    window.setTimeout(() => void ctx.close(), 1000);
  } catch {
    // без звука
  }
}

export const siteRequestLine = (r: HotelReservation): string => {
  const item = r.items[0];
  return [
    r.customerName || "Гость",
    r.checkIn && r.checkOut ? formatHotelDateRange(r.checkIn, r.checkOut) : "",
    item?.roomTypeName ?? "",
    fmtMoney(r.totalAmount, r.currency),
  ]
    .filter(Boolean)
    .join(" · ");
};

export const HotelSiteRequestsNotifier: React.FC = () => {
  const { activeOrganization, loading } = usePermissions();
  const isHotel = !loading && activeOrganization?.vertical === "hotel";
  // Одна подписка отеля на сокет на всё приложение — заявки, отмены, уведомления.
  useHotelRealtime(isHotel);
  const { requests } = useSiteRequests(isHotel);
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();
  const navigate = useNavigate();
  const shown = React.useRef(new Map<number, SnackbarKey>());

  React.useEffect(() => {
    if (!isHotel) return;
    const fresh = requests.filter((r) => !shown.current.has(r.id));
    // Подтвердили, отменили или сгорела — её уведомление больше не нужно.
    const alive = new Set(requests.map((r) => r.id));
    for (const [id, key] of shown.current) if (!alive.has(id)) closeSnackbar(key);
    if (fresh.length === 0) return;
    chime();
    for (const r of fresh) {
      const until = r.expiresAt ? ` Номер держим до ${dayjs(r.expiresAt).format("HH:mm")} — подтвердите бронь.` : "";
      const key = enqueueSnackbar(`Заявка с сайта №${r.number}: ${siteRequestLine(r)}.${until}`, {
        variant: "info",
        persist: true,
        preventDuplicate: true,
        anchorOrigin: { vertical: "bottom", horizontal: "right" },
        action: (k) => (
          <>
            <Button
              color="inherit"
              size="small"
              sx={{ fontWeight: 700 }}
              onClick={() => {
                closeSnackbar(k);
                navigate(`/reception?open=${r.id}`);
              }}
            >
              Открыть
            </Button>
            <IconButton color="inherit" size="small" aria-label="Закрыть" onClick={() => closeSnackbar(k)}>
              <CloseOutlined fontSize="small" />
            </IconButton>
          </>
        ),
      });
      shown.current.set(r.id, key);
    }
  }, [requests, isHotel, enqueueSnackbar, closeSnackbar, navigate]);

  return null;
};

export default HotelSiteRequestsNotifier;
