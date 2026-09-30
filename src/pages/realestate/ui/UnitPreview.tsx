import { Box, Popper, Typography } from "@mui/material";
import dayjs from "dayjs";
import { alpha, type Theme } from "@mui/material/styles";

import type { Unit } from "../../../api/realestate";
import { subtleBg } from "../../../theme/uiHelpers";
import { sectionLabel } from "../model/board";
import { roomKind } from "../model/unitCard";
import { formatMoney, formatRooms, outdoorLabel, unitStatusMeta } from "../model/units";
import { statusTone } from "./tones";

/** Плитки комнат на схемах: кухня — акцент, санузлы — info, прихожая — нейтральная. */
export function roomTileSx(t: Theme, name: string) {
  const kind = roomKind(name);
  const dark = t.palette.mode === "dark";
  const tint = (c: string) => ({ bgcolor: alpha(c, dark ? 0.18 : 0.1), color: t.palette.text.primary });
  if (kind === "wet") return tint(t.palette.info.main);
  if (kind === "main-room") return tint(t.palette.primary.main);
  if (kind === "hall") return { bgcolor: subtleBg(t, true), color: t.palette.text.secondary };
  return tint(t.palette.warning.main);
}

/** Всплывающий предпросмотр квартиры у ячейки шахматки: без открытия карточки. */
export function UnitPreview({ unit, anchor }: { unit: Unit; anchor: HTMLElement }) {
  const status = unitStatusMeta[unit.status];
  const tags = [
    unit.outdoor && `${outdoorLabel[unit.outdoor.type]} ${unit.outdoor.area} м²`,
    unit.hasPanoramicWindows && "Панорамные окна",
    unit.isCorner && "Угловая",
    `Потолки ${unit.ceilingHeight} м`,
  ].filter((tag): tag is string => Boolean(tag));

  return (
    <Popper
      open
      anchorEl={anchor}
      placement="right-start"
      modifiers={[{ name: "offset", options: { offset: [0, 10] } }, { name: "flip", options: { fallbackPlacements: ["left-start"] } }]}
      sx={{ zIndex: (t) => t.zIndex.tooltip, pointerEvents: "none" }}
    >
      <Box
        role="tooltip"
        sx={{
          width: 300,
          p: 1.75,
          border: 1,
          borderColor: "divider",
          borderRadius: "14px",
          bgcolor: "background.paper",
          color: "text.primary",
          boxShadow: (t) => t.shadows[2],
        }}
      >
        <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1 }}>
          <div>
            <Typography component="b" sx={{ display: "block", fontSize: "0.95rem", fontWeight: 700 }}>
              №{unit.number} · {formatRooms(unit.rooms)}
            </Typography>
            <Typography component="span" sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
              {unit.floor} этаж · {sectionLabel(unit.section)} · {unit.orientation}
            </Typography>
          </div>
          <Box
            component="span"
            sx={(t) => ({
              px: 1,
              py: 0.25,
              borderRadius: "7px",
              fontSize: "0.7rem",
              fontWeight: 600,
              whiteSpace: "nowrap",
              bgcolor: statusTone(t, unit.status).bg,
              color: statusTone(t, unit.status).text,
            })}
          >
            {status.label}
          </Box>
        </Box>

        <Box sx={{ mt: 1.25, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 1 }}>
          <Typography component="strong" sx={{ fontSize: "1.1rem", fontWeight: 700, letterSpacing: "-0.3px" }}>
            {formatMoney(unit.price)}
          </Typography>
          <Typography component="span" sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
            {formatMoney(unit.pricePerSqm)} / м²
          </Typography>
        </Box>
        <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
          Общая {unit.totalArea} м² · жилая {unit.livingArea} м²
        </Typography>
        {unit.hold?.endsAt && (
          <Typography sx={{ mt: 0.75, fontSize: "0.72rem", fontWeight: 600, color: "warning.onSurface" }}>
            Бронь до {dayjs(unit.hold.endsAt).format("DD.MM, HH:mm")}
            {unit.hold.awaitingPayment ? " · ждёт предоплату" : ""}
          </Typography>
        )}

        {/* Схема: плитки комнат пропорциональны площади. */}
        <Box sx={{ mt: 1.25, display: "flex", flexWrap: "wrap", gap: 0.5, p: 0.75, border: 1, borderColor: "divider", borderRadius: "10px" }}>
          {unit.roomsBreakdown.map((room) => (
            <Box
              key={room.name}
              component="span"
              sx={(t) => ({
                ...roomTileSx(t, room.name),
                display: "flex",
                flexDirection: "column",
                minWidth: 64,
                px: 0.75,
                py: 0.5,
                borderRadius: "6px",
                fontSize: "0.66rem",
                lineHeight: 1.25,
                flexGrow: room.area,
                flexBasis: `${room.area * 2.2}px`,
              })}
            >
              <Box component="b" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {room.name}
              </Box>
              <span>{room.area} м²</span>
            </Box>
          ))}
        </Box>

        <Box sx={{ mt: 1, display: "flex", flexWrap: "wrap", gap: 0.5 }}>
          {tags.map((tag) => (
            <Box
              key={tag}
              component="span"
              sx={(t) => ({
                px: 0.75,
                py: 0.25,
                borderRadius: "6px",
                fontSize: "0.66rem",
                fontWeight: 600,
                bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.18 : 0.1),
                color: "primary.onSurface",
              })}
            >
              {tag}
            </Box>
          ))}
        </Box>

        <Typography sx={{ mt: 1, fontSize: "0.66rem", color: "text.secondary" }}>
          Клик — карточка · Ctrl+клик или пробел — к сравнению
        </Typography>
      </Box>
    </Popper>
  );
}
