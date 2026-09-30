/**
 * Блоки карточки квартиры. Порядок и состав блоков повторяют прототип
 * (crm-building/frontend, widgets/unit-card/sections.tsx), оформление — на токенах темы.
 */
import React from "react";
import { Box, Button, ButtonBase, IconButton, Typography } from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CompareArrowsOutlined from "@mui/icons-material/CompareArrowsOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import RemoveOutlined from "@mui/icons-material/RemoveOutlined";

import type { Project, Unit, UnitDetails, UnitEventType, UnitOffer } from "../../../../api/realestate";
import { AppButton } from "../../../../components/ui";
import { useT } from "../../../../i18n/VerticalProvider";
import { subtleBg } from "../../../../theme/uiHelpers";
import {
  apartmentRenders,
  balconyLabel,
  bathroomsLabel,
  floorTypeLabel,
  outdoorKind,
  paymentPlan,
  priceWithOffer,
  roomKind,
  terraceLabel,
  unitType,
} from "../../model/unitCard";
import { formatMoney as money, num, outdoorLabel, unitStatusMeta } from "../../model/units";
import { completionOf, sectionLabel } from "../../model/board";
import { eyebrowSx, offerTone, sectionSx, statusTone } from "../tones";
import { roomTileSx } from "../UnitPreview";

export function StatusPill({ status }: { status: Unit["status"] }) {
  return (
    <Box
      component="span"
      sx={(t) => ({
        display: "inline-flex",
        alignItems: "center",
        gap: 0.75,
        height: 24,
        px: 1,
        borderRadius: "7px",
        fontSize: "0.75rem",
        fontWeight: 600,
        bgcolor: statusTone(t, status).bg,
        color: statusTone(t, status).text,
        "&::before": { content: '""', width: 7, height: 7, borderRadius: "50%", bgcolor: statusTone(t, status).main },
      })}
    >
      {unitStatusMeta[status].label}
    </Box>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  text,
  children,
  size = "0.85rem",
}: {
  eyebrow?: string;
  title: string;
  text?: string;
  children?: React.ReactNode;
  size?: string;
}) {
  return (
    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2, mb: 1.6 }}>
      <Box sx={{ minWidth: 0 }}>
        {eyebrow && (
          <Typography component="span" sx={eyebrowSx}>
            {eyebrow}
          </Typography>
        )}
        <Typography component="h3" sx={{ m: 0, fontSize: size, fontWeight: 700 }}>
          {title}
        </Typography>
        {text && <Typography sx={{ mt: 0.5, fontSize: "0.72rem", color: "text.secondary" }}>{text}</Typography>}
      </Box>
      {children && <Box sx={{ ml: "auto", flexShrink: 0 }}>{children}</Box>}
    </Box>
  );
}

export function ApartmentHead({ project, unit }: { project: Project; unit: Unit }) {
  const { t } = useT("realestate");
  return (
    <Box
      component="header"
      sx={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 3, pr: 4.5, pb: 2.5, borderBottom: 1, borderColor: "divider" }}
    >
      <div>
        <Typography component="span" sx={eyebrowSx}>
          {t("card.headEyebrow", { name: project.name, section: sectionLabel(unit.section) })}
        </Typography>
        <Typography id="realestate-unit-title" component="h2" sx={{ m: 0, fontSize: { xs: "1.5rem", md: "1.8rem" }, fontWeight: 700, letterSpacing: "-0.5px" }}>
          {t("card.title", { number: unit.number })}
        </Typography>
        <Typography sx={{ mt: 0.75, fontSize: "0.8125rem", color: "text.secondary" }}>
          {unitType(unit)} · {t("cell.floor", { floor: unit.floor })} · {t("fmt.area", { value: num(unit.totalArea) })}
        </Typography>
      </div>
      <Box sx={{ display: "flex", flexDirection: "column", alignItems: { xs: "flex-start", md: "flex-end" }, gap: 0.6 }}>
        <Typography component="strong" sx={{ fontSize: "1.55rem", fontWeight: 700, letterSpacing: "-0.4px" }}>
          {money(unit.price)}
        </Typography>
        <Typography component="span" sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
          {t("preview.perSqm", { value: money(unit.pricePerSqm) })}
        </Typography>
        <StatusPill status={unit.status} />
      </Box>
    </Box>
  );
}

export function RenderGallery() {
  const { t } = useT("realestate");
  const label = (key: string) => t(`renders.${key}.label`);
  const [active, setActive] = React.useState(0);
  const current = apartmentRenders[active]!;
  return (
    <Box component="section" sx={{ ...sectionSx, overflow: "hidden" }}>
      <SectionTitle
        eyebrow={t("renders.eyebrow")}
        title={t("renders.title")}
        text={t("renders.text")}
        size="0.95rem"
      />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "136px minmax(0, 1fr)" }, gap: 1.5 }}>
        <Box sx={{ display: "grid", gap: 1, alignContent: "start", gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "1fr" } }}>
          {apartmentRenders.map((item, index) => (
            <ButtonBase
              key={item.src}
              aria-label={t("renders.show", { label: label(item.key) })}
              aria-pressed={index === active}
              onClick={() => setActive(index)}
              sx={(t) => ({
                display: "grid",
                gridTemplateColumns: "48px 1fr",
                alignItems: "center",
                gap: 1,
                minWidth: 0,
                p: 0.6,
                borderRadius: "10px",
                border: 1,
                textAlign: "left",
                borderColor: index === active ? alpha(t.palette.primary.main, 0.6) : "divider",
                bgcolor: index === active ? alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.16 : 0.08) : subtleBg(t),
                transition: "border-color .15s ease, background-color .15s ease",
                "&:hover": { borderColor: alpha(t.palette.primary.main, 0.35) },
              })}
            >
              <Box component="img" src={item.src} alt={label(item.key)} loading="lazy" sx={{ width: 48, height: 42, objectFit: "cover", borderRadius: "7px" }} />
              <Typography component="span" sx={{ fontSize: "0.7rem", fontWeight: 600, lineHeight: 1.25 }}>
                {label(item.key)}
              </Typography>
            </ButtonBase>
          ))}
        </Box>
        <Box component="figure" sx={{ position: "relative", minWidth: 0, height: { xs: 240, md: 390 }, m: 0, borderRadius: "12px", overflow: "hidden", bgcolor: (t) => subtleBg(t, true) }}>
          <Box component="img" decoding="async" src={current.src} alt={label(current.key)} sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          {/* Подпись поверх фото — единственное место с затемнением: белый текст на снимке. */}
          <Box
            component="figcaption"
            sx={(t) => ({
              position: "absolute",
              inset: "auto 0 0 0",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              gap: 2,
              p: 2,
              pt: 3.5,
              color: t.palette.common.white,
              bgcolor: alpha(t.palette.common.black, 0.55),
            })}
          >
            <Box component="span" sx={{ display: "flex", flexDirection: "column", gap: 0.4 }}>
              <Box component="b" sx={{ fontSize: "0.8125rem" }}>
                {label(current.key)}
              </Box>
              <Box component="small" sx={{ fontSize: "0.7rem", opacity: 0.8 }}>
                {t(`renders.${current.key}.note`)}
              </Box>
            </Box>
            <Box component="em" sx={(t) => ({ fontSize: "0.7rem", fontStyle: "normal", fontWeight: 600, border: `1px solid ${alpha(t.palette.common.white, 0.5)}`, borderRadius: "7px", px: 1, py: 0.5 })}>
              {t("renders.concept")}
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export function Promotions({
  unit,
  offers,
  active,
  onSelect,
  onDetails,
  onReserve,
}: {
  unit: Unit;
  offers: UnitOffer[];
  active: UnitOffer;
  onSelect: (offer: UnitOffer) => void;
  onDetails: () => void;
  /** Нет — бронировать нельзя (без realty.manage). */
  onReserve?: () => void;
}) {
  const { t } = useT("realestate");
  const finalPrice = priceWithOffer(unit, active);
  return (
    <Box component="section" sx={{ ...sectionSx, borderRadius: "18px", bgcolor: (t) => subtleBg(t) }}>
      <SectionTitle eyebrow={t("offers.eyebrow")} title={t("offers.title")} text={t("offers.text")} size="0.95rem">
        <Box component="span" sx={(t) => ({ px: 1.25, py: 0.75, borderRadius: "7px", bgcolor: subtleBg(t, true), color: "text.secondary", fontSize: "0.75rem", fontWeight: 600, whiteSpace: "nowrap" })}>
          {t("offers.count", { count: offers.length })}
        </Box>
      </SectionTitle>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" }, gap: 1.25 }}>
        {offers.map((offer) => {
          const selected = offer.id === active.id;
          return (
            <ButtonBase
              key={offer.id}
              aria-pressed={selected}
              onClick={() => onSelect(offer)}
              sx={(t) => {
                const tone = offerTone(t, offer.tone);
                return {
                  display: "grid",
                  gridTemplateColumns: "42px 1fr auto",
                  gridTemplateRows: "auto auto",
                  alignItems: "center",
                  columnGap: 1.25,
                  rowGap: 0.5,
                  minHeight: 105,
                  p: 1.6,
                  textAlign: "left",
                  borderRadius: "14px",
                  border: `1px solid ${selected ? t.palette.text.primary : tone.border}`,
                  boxShadow: selected ? `0 0 0 1px ${t.palette.text.primary}` : "none",
                  bgcolor: tone.bg,
                  transition: "border-color .15s ease",
                };
              }}
            >
              <Box
                component="i"
                sx={(t) => ({
                  gridRow: "1 / 3",
                  width: 40,
                  height: 40,
                  display: "grid",
                  placeItems: "center",
                  borderRadius: "10px",
                  bgcolor: offerTone(t, offer.tone).iconBg,
                  color: offerTone(t, offer.tone).iconText,
                  fontSize: "0.8125rem",
                  fontWeight: 800,
                  fontStyle: "normal",
                })}
              >
                {offer.icon}
              </Box>
              <Box component="span" sx={{ display: "flex", minWidth: 0, flexDirection: "column", gap: 0.4 }}>
                <Box component="small" sx={{ color: "text.secondary", fontSize: "0.7rem", fontWeight: 600 }}>
                  {offer.badge}
                </Box>
                <Box component="b" sx={{ fontSize: "0.8125rem", lineHeight: 1.25 }}>
                  {offer.title}
                </Box>
                <Box component="em" sx={{ fontSize: "0.75rem", color: "text.secondary", fontStyle: "normal" }}>
                  {offer.until}
                </Box>
              </Box>
              <Box component="strong" sx={{ alignSelf: "start", fontSize: "0.8125rem", whiteSpace: "nowrap" }}>
                {offer.discount ? `− ${money(offer.discount)}` : t("offer.noOverpay")}
              </Box>
              <Box
                component="span"
                sx={(t) => ({
                  gridColumn: 3,
                  alignSelf: "end",
                  justifySelf: "end",
                  px: 0.9,
                  py: 0.5,
                  borderRadius: "7px",
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  ...(selected
                    ? { bgcolor: "text.primary", color: "background.paper" }
                    : { bgcolor: subtleBg(t, true), color: "text.secondary" }),
                })}
              >
                {selected ? t("offers.picked") : t("offers.pick")}
              </Box>
            </ButtonBase>
          );
        })}
      </Box>
      <Box
        sx={(t) => ({
          display: "grid",
          gridTemplateColumns: { xs: "1fr 1fr", md: "1fr 1fr 1.35fr auto auto" },
          alignItems: "center",
          gap: 1.5,
          mt: 1.5,
          p: 1.6,
          borderRadius: "13px",
          border: 1,
          borderColor: alpha(t.palette.primary.main, 0.35),
          bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.12 : 0.06),
        })}
      >
        <TotalCell label={t("offers.unitPrice")} value={money(unit.price)} />
        <TotalCell label={t("offers.discount")} value={active.discount ? `− ${money(active.discount)}` : t("offers.noDiscount")} />
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.4, pl: { md: 1.5 }, borderLeft: { md: 1 }, borderColor: { md: "divider" } }}>
          <Typography component="span" sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
            {t("offers.finalPrice")}
          </Typography>
          <Typography component="strong" sx={{ fontSize: "1.2rem", fontWeight: 700, color: "primary.onSurface" }}>
            {money(finalPrice)}
          </Typography>
          <Typography component="small" sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
            {t("preview.perSqm", { value: money(Math.round(finalPrice / unit.totalArea)) })}
          </Typography>
        </Box>
        <Button variant="outlined" onClick={onDetails}>
          {t("offers.terms")}
        </Button>
        {unit.status === "free" && onReserve && (
          <AppButton variant="contained" onClick={onReserve}>
            {t("offers.reserveAtPrice")}
          </AppButton>
        )}
      </Box>
    </Box>
  );
}

function TotalCell({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.4 }}>
      <Typography component="span" sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
        {label}
      </Typography>
      <Typography component="b" sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
        {value}
      </Typography>
    </Box>
  );
}

export function Characteristics({ unit, onCompare }: { unit: Unit; onCompare: (unitId: string) => void }) {
  const { t } = useT("realestate");
  // Названия комнат — данные бэка, поэтому ищем по ним, а подписываем тем, что пришло.
  const hall = unit.roomsBreakdown.find((room) => /прихожая/i.test(room.name));
  const outdoor = unit.outdoor?.type === "terrace" ? outdoorLabel("terrace") : (outdoorKind(unit) ?? t("card.noBalcony"));
  const kitchen = unit.roomsBreakdown.find((room) => /кухня/i.test(room.name));
  // Только факты о квартире: без данных пункт не показываем, а не подставляем общие слова.
  const items = (
    [
      ["↕", t("preview.ceiling", { value: num(unit.ceilingHeight) })],
      ["⌗", `${unitType(unit)} · ${t("fmt.area", { value: num(unit.totalArea) })}`],
      ["◉", unit.view],
      ["⌂", kitchen ? t("fmt.outdoorArea", { kind: kitchen.name, area: num(kitchen.area) }) : null],
      ["▥", hall ? t("fmt.outdoorArea", { kind: hall.name, area: num(hall.area) }) : null],
      ["▯", outdoor],
      ["②", bathroomsLabel(unit)],
      ["☀", t("card.side", { value: unit.orientation.toLowerCase() })],
      ["◢", unit.isCorner ? t("card.cornerUnit") : null],
      ["▭", unit.hasPanoramicWindows ? t("filters.feature.panoramic") : null],
    ] as [string, string | null][]
  ).filter((item): item is [string, string] => Boolean(item[1]));
  return (
    <Box component="section" sx={sectionSx}>
      <SectionTitle eyebrow={t("card.featuresEyebrow")} title={t("card.featuresTitle")} text={t("card.featuresText")} size="1rem">
        <Button size="small" variant="outlined" startIcon={<CompareArrowsOutlined />} onClick={() => onCompare(unit.id)}>
          {t("compare.compare")}
        </Button>
      </SectionTitle>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }, gap: 1.1 }}>
        {items.map(([icon, label]) => (
          <Box key={icon} sx={(t) => ({ display: "flex", alignItems: "center", gap: 1.1, minHeight: 68, p: 1.4, border: 1, borderColor: "divider", borderRadius: "10px", bgcolor: subtleBg(t) })}>
            <Box
              component="i"
              sx={(t) => ({
                flex: "0 0 36px",
                width: 36,
                height: 36,
                display: "grid",
                placeItems: "center",
                borderRadius: "10px",
                bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.16 : 0.1),
                color: "primary.onSurface",
                fontSize: 20,
                fontStyle: "normal",
              })}
            >
              {icon}
            </Box>
            <Typography component="b" sx={{ fontSize: "0.7rem", fontWeight: 600, lineHeight: 1.35 }}>
              {label}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

// ─── Схема этажа ───────────────────────────────────────────────────────────

type FloorFilter = "all" | "free" | "occupied";

const schemeLine = (t: Theme) => alpha(t.palette.text.primary, t.palette.mode === "dark" ? 0.45 : 0.6);

function FloorSchemeUnit({ unit, selected, muted, onOpen }: { unit: Unit; selected: boolean; muted: boolean; onOpen: (unitId: string) => void }) {
  const { t } = useT("realestate");
  const rooms = unit.roomsBreakdown.slice(0, Math.min(5, unit.roomsBreakdown.length));
  return (
    <ButtonBase
      aria-label={t("card.schemeUnitAria", { number: unit.number, status: unitStatusMeta[unit.status].label })}
      onClick={() => onOpen(unit.id)}
      sx={(t) => {
        const tone = statusTone(t, unit.status);
        return {
          position: "relative",
          display: "block",
          minHeight: { xs: 148, md: 164 },
          textAlign: "left",
          overflow: "hidden",
          border: `2px solid ${selected ? t.palette.success.main : tone.border}`,
          bgcolor: selected ? alpha(t.palette.success.main, 0.28) : tone.bg,
          color: tone.text,
          boxShadow: selected ? `inset 0 0 0 3px ${t.palette.success.main}` : "none",
          transition: "border-color .15s ease",
          "&:hover": { zIndex: 1, borderColor: tone.main },
          ...(muted ? { opacity: 0.15, filter: "grayscale(1)", pointerEvents: "none" } : null),
        };
      }}
    >
      {selected && (
        <Box component="span" sx={{ position: "absolute", zIndex: 3, top: 6, right: 6, px: 0.75, py: 0.25, borderRadius: "6px", fontSize: "0.62rem", fontWeight: 700, bgcolor: "success.main", color: "success.contrastText" }}>
          {t("card.selected")}
        </Box>
      )}
      <Box sx={{ position: "absolute", inset: "7px 7px 38px", display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gridTemplateRows: "1fr 1fr", gap: "2px", opacity: 0.8 }}>
        {rooms.map((room, index) => (
          <Box
            key={room.name}
            component="i"
            sx={(t) => ({
              position: index >= 3 ? "absolute" : "relative",
              ...(index === 0 ? { gridRow: "span 2" } : null),
              ...(index === 3 ? { right: 0, bottom: 0, width: "36%", height: "34%" } : null),
              ...(index === 4 ? { right: "36%", bottom: 0, width: "28%", height: "34%" } : null),
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              minWidth: 0,
              overflow: "hidden",
              border: "1px solid currentColor",
              fontStyle: "normal",
              bgcolor: alpha(t.palette.background.paper, roomKind(room.name) === "wet" ? 0.3 : 0.5),
            })}
          >
            <Box component="b" sx={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 9 }}>
              {room.name.replace("Кухня-гостиная", "Кухня")}
            </Box>
            <Box component="small" sx={{ fontSize: 10, fontWeight: 800, mt: 0.25 }}>
              {num(room.area)}
            </Box>
          </Box>
        ))}
      </Box>
      <Box sx={{ position: "absolute", zIndex: 2, left: 7, right: 7, bottom: 17, display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: 0.6 }}>
        <Box component="strong" sx={{ fontSize: "0.72rem" }}>
          №{unit.number}
        </Box>
        <Box component="small" sx={{ fontSize: "0.62rem", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {unitType(unit)} · {t("fmt.area", { value: num(unit.totalArea) })}
        </Box>
        <Box component="b" sx={{ fontSize: "0.62rem", textAlign: "right" }}>
          {money(unit.price)}
        </Box>
      </Box>
      <Box component="em" sx={{ position: "absolute", left: 7, bottom: 5, fontSize: 9, fontStyle: "normal", fontWeight: 800 }}>
        {unitStatusMeta[unit.status].label}
      </Box>
    </ButtonBase>
  );
}

export function FloorScheme({
  unit,
  floorUnits,
  onOpenUnit,
  onChangeFloor,
}: {
  unit: Unit;
  /** Квартиры этажа; пока шахматка грузится — пусто. */
  floorUnits: Unit[];
  onOpenUnit: (unitId: string) => void;
  onChangeFloor: (direction: -1 | 1) => void;
}) {
  const { t } = useT("realestate");
  const [filter, setFilter] = React.useState<FloorFilter>("all");
  const units = floorUnits.slice().sort((a, b) => a.axis - b.axis);
  const split = Math.ceil(units.length / 2);
  const top = units.slice(0, split);
  const bottom = units.slice(split);
  const free = units.filter((u) => u.status === "free").length;
  const reserved = units.filter((u) => u.status === "reserved").length;
  const sold = units.filter((u) => u.status === "sold").length;
  const muted = (u: Unit) => !(filter === "all" || (filter === "occupied" ? u.status !== "free" : u.status === filter));
  const columns = Math.max(top.length, bottom.length);

  const side = (list: Unit[], reverse: boolean) => (
    <Box
      sx={(t) => ({
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, minmax(118px, 1fr))`,
        direction: reverse ? "rtl" : "ltr",
        "& > *": { direction: "ltr" },
        borderLeft: `2px solid ${schemeLine(t)}`,
        borderRight: `2px solid ${schemeLine(t)}`,
      })}
    >
      {list.map((u) => (
        <FloorSchemeUnit key={u.id} unit={u} selected={u.id === unit.id} muted={muted(u)} onOpen={onOpenUnit} />
      ))}
    </Box>
  );

  const filters: [FloorFilter, string, number][] = [
    ["all", t("card.floorFilter.all"), units.length],
    ["free", t("card.floorFilter.free"), free],
    ["occupied", t("card.floorFilter.occupied"), reserved + sold],
  ];
  // Подписи над схемой — корпуса этого этажа слева направо, а не «Секция А/Б» из прототипа.
  const sectionNames = [...new Set(units.map((u) => u.section))];

  return (
    <Box component="section" sx={{ ...sectionSx, overflow: "hidden" }}>
      <SectionTitle
        eyebrow={t("card.floorEyebrow")}
        title={t("cell.floor", { floor: unit.floor })}
        text={t("card.floorSummary", { count: units.length, free, occupied: reserved + sold })}
        size="1rem"
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, border: 1, borderColor: "divider", borderRadius: "10px", p: 0.25 }}>
          <IconButton size="small" aria-label={t("card.floorDown")} onClick={() => onChangeFloor(-1)}>
            <RemoveOutlined fontSize="small" />
          </IconButton>
          <Typography component="b" sx={{ minWidth: 24, textAlign: "center", fontWeight: 700 }}>
            {unit.floor}
          </Typography>
          <IconButton size="small" aria-label={t("card.floorUp")} onClick={() => onChangeFloor(1)}>
            <AddOutlined fontSize="small" />
          </IconButton>
        </Box>
      </SectionTitle>
      <Box sx={(t) => ({ display: "flex", alignItems: "center", gap: 0.9, mt: 0.5, mb: 1.5, p: 1, border: 1, borderColor: "divider", borderRadius: "11px", bgcolor: subtleBg(t), overflowX: "auto" })}>
        {filters.map(([value, label, count]) => (
          <ButtonBase
            key={value}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            sx={(t) => ({
              display: "flex",
              alignItems: "center",
              gap: 0.75,
              px: 1.25,
              py: 0.75,
              borderRadius: "9px",
              whiteSpace: "nowrap",
              fontSize: "0.7rem",
              fontWeight: 600,
              border: 1,
              ...(filter === value
                ? { borderColor: "text.primary", bgcolor: "text.primary", color: "background.paper" }
                : { borderColor: "divider", bgcolor: "background.paper", color: "text.primary" }),
              "& i": {
                width: 8,
                height: 8,
                borderRadius: "3px",
                bgcolor: value === "free" ? statusTone(t, "free").main : value === "occupied" ? statusTone(t, "reserved").main : t.palette.text.disabled,
              },
            })}
          >
            <i />
            {label} <b>{count}</b>
          </ButtonBase>
        ))}
        <Typography component="span" sx={{ ml: "auto", fontSize: "0.7rem", color: "text.secondary", display: { xs: "none", md: "inline" }, whiteSpace: "nowrap" }}>
          {t("card.floorClickHint")}
        </Typography>
      </Box>
      <Box sx={{ overflowX: "auto", pb: 0.5 }}>
        <Box
          sx={(t) => ({
            position: "relative",
            minWidth: { xs: 940, md: 1040 },
            pt: 3.4,
            px: 1.25,
            pb: 1.25,
            border: `3px solid ${schemeLine(t)}`,
            borderRadius: "6px",
            bgcolor: "background.paper",
          })}
        >
          <Box
            sx={{
              position: "absolute",
              left: 10,
              right: 10,
              top: 7,
              display: "flex",
              justifyContent: "space-around",
              color: "text.secondary",
              fontSize: "0.66rem",
              fontWeight: 700,
            }}
          >
            {sectionNames.map((name) => (
              <span key={name}>{sectionLabel(name)}</span>
            ))}
          </Box>
          {side(top, false)}
          <Box
            sx={(t) => ({
              display: "grid",
              gridTemplateColumns: "145px 1fr 145px",
              minHeight: 92,
              borderLeft: `2px solid ${schemeLine(t)}`,
              borderRight: `2px solid ${schemeLine(t)}`,
              fontSize: "0.66rem",
              fontWeight: 700,
            })}
          >
            <Box sx={(t) => ({ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0.6, bgcolor: subtleBg(t, true), borderRight: 1, borderColor: "divider" })}>
              <Box
                component="i"
                sx={(t) => ({
                  width: 70,
                  height: 38,
                  border: `1px solid ${t.palette.text.secondary}`,
                  backgroundImage: `repeating-linear-gradient(0deg, ${t.palette.text.secondary} 0 1px, transparent 1px 6px)`,
                })}
              />
              <span>{t("card.scheme.stairs")}</span>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.75, px: 2.25, textTransform: "none", fontSize: "0.72rem" }}>
              <span>{t("card.scheme.corridor")}</span>
              <Box component="i" sx={{ fontStyle: "normal", color: "text.secondary", fontSize: "0.62rem" }}>
                {t("card.scheme.floorEntrance")}
              </Box>
            </Box>
            <Box sx={(t) => ({ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0.6, bgcolor: subtleBg(t, true), borderLeft: 1, borderColor: "divider" })}>
              <Box component="b" sx={{ fontSize: 24, letterSpacing: 5 }}>
                ◇ ◇
              </Box>
              <span>{t("card.scheme.lifts")}</span>
            </Box>
          </Box>
          {side(bottom, true)}
        </Box>
      </Box>
      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.75, pt: 1.25, fontSize: "0.66rem", color: "text.secondary" }}>
        {(
          [
            ["free", t("card.legend.free", { count: free })],
            ["reserved", t("card.legend.reserved", { count: reserved })],
            ["sold", t("card.legend.sold", { count: sold })],
          ] as const
        ).map(([status, label]) => (
          <Box component="span" key={status} sx={{ display: "flex", alignItems: "center", gap: 0.6 }}>
            <Box component="i" sx={(t) => ({ width: 12, height: 12, borderRadius: "3px", bgcolor: statusTone(t, status).bg, border: `1px solid ${statusTone(t, status).border}` })} />
            {label}
          </Box>
        ))}
        <Box component="span" sx={{ display: "flex", alignItems: "center", gap: 0.6 }}>
          <Box component="i" sx={(t) => ({ width: 12, height: 12, borderRadius: "3px", bgcolor: alpha(t.palette.success.main, 0.28), border: `1px solid ${t.palette.success.main}` })} />
          {t("card.selectedNumber", { number: unit.number })}
        </Box>
        <Box component="small" sx={{ ml: "auto", fontSize: "0.66rem" }}>
          {t("card.legend.hint")}
        </Box>
      </Box>
    </Box>
  );
}

// ─── Планировка и параметры ────────────────────────────────────────────────

/** Раскладка первых комнат по сетке 4×N для вариантов схемы 1…5 (как в прототипе). */
const planVariants: Record<number, Record<number, { gridColumn: string; gridRow: string }>> = {
  1: { 0: { gridColumn: "1/4", gridRow: "1/3" }, 1: { gridColumn: "4/5", gridRow: "1/3" } },
  2: { 0: { gridColumn: "3/5", gridRow: "1/4" }, 1: { gridColumn: "1/3", gridRow: "1/2" }, 2: { gridColumn: "1/3", gridRow: "2/3" } },
  3: { 0: { gridColumn: "1/3", gridRow: "1/3" }, 1: { gridColumn: "3/5", gridRow: "1/2" }, 2: { gridColumn: "3/5", gridRow: "2/3" } },
  4: { 0: { gridColumn: "2/5", gridRow: "1/3" }, 1: { gridColumn: "1/2", gridRow: "1/3" } },
  5: { 0: { gridColumn: "1/5", gridRow: "1/2" }, 1: { gridColumn: "1/3", gridRow: "2/4" }, 2: { gridColumn: "3/5", gridRow: "2/4" } },
};

function planRoomSpan(unit: Unit, index: number, name: string) {
  const variant = planVariants[unit.layoutVariant]?.[index];
  if (variant) return variant;
  const kind = roomKind(name);
  if (kind === "main-room") {
    if (unit.rooms === 0) return { gridColumn: "span 3", gridRow: "span 3" };
    if (unit.rooms === 1) return { gridColumn: "span 2", gridRow: "span 3" };
    return { gridColumn: "span 2", gridRow: "span 2" };
  }
  if (kind === "bedroom") return { gridColumn: "span 2" };
  return null;
}

const planRoomSx = (t: Theme) => ({
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  minWidth: 0,
  p: 1,
  textAlign: "center",
  borderRadius: "6px",
  border: `1px solid ${alpha(t.palette.text.primary, 0.22)}`,
});

export function FloorPlan({ unit }: { unit: Unit }) {
  const { t } = useT("realestate");
  const balcony = balconyLabel(unit);
  const terrace = terraceLabel(unit);
  if (!unit.roomsBreakdown.length) {
    return (
      <Box component="section" sx={{ p: 2, border: 1, borderColor: "divider", borderRadius: "14px", bgcolor: "background.paper" }}>
        <SectionTitle title={t("card.planTitle")} text={t("card.planText")} />
        <EmptyNote>{t("card.planEmpty")}</EmptyNote>
      </Box>
    );
  }
  return (
    <Box component="section" sx={{ p: 2, border: 1, borderColor: "divider", borderRadius: "14px", bgcolor: "background.paper" }}>
      <SectionTitle title={t("card.planTitle")} text={t("card.planText")} />
      <Box
        sx={(t) => ({
          position: "relative",
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gridAutoRows: "minmax(66px, auto)",
          gap: "6px",
          minHeight: 330,
          p: { xs: 2, md: 3.25 },
          borderRadius: "10px",
          border: `2px solid ${schemeLine(t)}`,
          bgcolor: subtleBg(t, true),
        })}
      >
        {unit.roomsBreakdown.map((room, i) => (
          <Box key={room.name} sx={(t) => ({ ...planRoomSx(t), ...roomTileSx(t, room.name), ...planRoomSpan(unit, i, room.name) })}>
            <Box component="b" sx={{ fontSize: "0.72rem" }}>
              {room.name}
            </Box>
            <Box component="span" sx={{ fontSize: "0.75rem", fontWeight: 800, my: 0.5 }}>
              {t("fmt.area", { value: num(room.area) })}
            </Box>
            <Box component="small" sx={{ fontSize: "0.7rem", color: "text.secondary" }}>
              {t("card.dims", { width: num(room.width), length: num(room.length) })}
            </Box>
          </Box>
        ))}
        {(balcony || terrace) && (
          <Box
            sx={(t) => ({
              ...planRoomSx(t),
              gridColumn: "1/-1",
              borderStyle: "dashed",
              minHeight: terrace ? 74 : "auto",
              bgcolor: alpha(t.palette.success.main, t.palette.mode === "dark" ? 0.14 : 0.08),
            })}
          >
            <Box component="b" sx={{ fontSize: "0.72rem" }}>
              {terrace ?? balcony}
            </Box>
            <Box component="small" sx={{ fontSize: "0.7rem", color: "text.secondary" }}>
              {terrace ? unit.view : unit.orientation}
            </Box>
          </Box>
        )}
        <Box
          sx={{
            position: "absolute",
            right: 8,
            top: 8,
            width: 28,
            height: 28,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            bgcolor: "text.primary",
            color: "background.paper",
            fontSize: 11,
            fontWeight: 700,
          }}
          title={t("card.north")}
        >
          {t("card.northLetter")}
        </Box>
        <Box
          sx={(t) => ({
            position: "absolute",
            left: "48%",
            bottom: 4,
            px: 0.9,
            py: 0.4,
            border: `1px solid ${t.palette.text.secondary}`,
            borderBottom: 0,
            borderRadius: "5px 5px 0 0",
            bgcolor: "background.paper",
            fontSize: "0.66rem",
            fontWeight: 700,
          })}
        >
          {t("card.entrance")}
        </Box>
      </Box>
      <Typography component="small" sx={{ display: "block", mt: 1, fontSize: "0.7rem", color: "text.secondary" }}>
        {t("card.planNote")}
      </Typography>
    </Box>
  );
}

function SpecRows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <Box sx={{ display: "grid" }}>
      {rows.map(([label, value]) => (
        <Box key={label} sx={{ display: "flex", justifyContent: "space-between", gap: 1.5, py: 0.9, borderBottom: 1, borderColor: "divider", fontSize: "0.78rem" }}>
          <Box component="span" sx={{ color: "text.secondary" }}>
            {label}
          </Box>
          <Box component="b" sx={{ fontWeight: 600, textAlign: "right" }}>
            {value}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

const cardSx = { p: 2, border: 1, borderColor: "divider", borderRadius: "14px", bgcolor: "background.paper" } as const;
const cardTitleSx = { m: 0, mb: 1.25, fontSize: "0.85rem", fontWeight: 700 } as const;

export function KeyParams({ project, unit }: { project: Project; unit: Unit }) {
  const { t } = useT("realestate");
  const floorType = floorTypeLabel(project, unit.floor);
  const tags = [
    floorType,
    terraceLabel(unit),
    balconyLabel(unit),
    unit.hasPanoramicWindows ? t("filters.feature.panoramic") : null,
    unit.isCorner ? t("card.cornerUnit") : null,
    bathroomsLabel(unit),
    unit.view,
  ].filter((tag): tag is string => Boolean(tag));

  return (
    <Box component="aside" sx={cardSx}>
      <Typography component="h3" sx={cardTitleSx}>
        {t("card.keyParams")}
      </Typography>
      <SpecRows
        rows={[
          [t("compare.rows.totalArea"), t("fmt.area", { value: num(unit.totalArea) })],
          [t("card.innerArea"), t("fmt.area", { value: num(unit.livingArea) })],
          [t("compare.rows.floorSection"), `${unit.floor} / ${sectionLabel(unit.section)}`],
          [t("card.floorType"), floorType],
          [t("compare.rows.orientation"), unit.orientation],
          [t("card.viewShort"), unit.view],
          [t("compare.rows.ceiling"), t("compare.ceilingValue", { value: num(unit.ceilingHeight) })],
          [t("card.finish"), project.finish],
          [t("card.completion"), completionOf(project, unit)],
        ]}
      />
      <Box sx={{ mt: 1.5, display: "flex", flexWrap: "wrap", gap: 0.75 }}>
        {tags.map((tag, i) => (
          <Box
            key={i}
            component="span"
            sx={(t) => ({
              px: 1,
              py: 0.4,
              borderRadius: "7px",
              fontSize: "0.7rem",
              fontWeight: 500,
              bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.18 : 0.1),
              color: "primary.onSurface",
            })}
          >
            {tag}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export function RoomTable({ unit }: { unit: Unit }) {
  const { t } = useT("realestate");
  const kind = outdoorKind(unit);
  const rows: [string, string, string][] = unit.roomsBreakdown.map((r) => [
    r.name,
    t("fmt.area", { value: num(r.area) }),
    t("card.dims", { width: num(r.width), length: num(r.length) }),
  ]);
  // Размеров и остекления балкона/террасы бэк не отдаёт — только площадь.
  if (kind && unit.outdoor) rows.push([kind, t("fmt.area", { value: num(unit.outdoor.area) }), "—"]);
  if (unit.outdoor?.type === "terrace") rows.push([outdoorLabel("terrace"), t("fmt.area", { value: num(unit.outdoor.area) }), "—"]);
  return (
    <Box component="section" sx={cardSx}>
      <Typography component="h3" sx={cardTitleSx}>
        {t("card.roomsTitle")}
      </Typography>
      {rows.length === 0 ? (
        <EmptyNote>{t("card.roomsEmpty")}</EmptyNote>
      ) : (
      <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem", "& th, & td": { py: 0.9, borderBottom: 1, borderColor: "divider", textAlign: "left" } }}>
        <thead>
          <tr>
            {[t("card.roomsHead.room"), t("card.roomsHead.area"), t("card.roomsHead.size")].map((h) => (
              <Box component="th" key={h} sx={{ color: "text.secondary", fontWeight: 500, fontSize: "0.72rem" }}>
                {h}
              </Box>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, area, size]) => (
            <tr key={name}>
              <td>{name}</td>
              <td>
                <b>{area}</b>
              </td>
              <td>{size}</td>
            </tr>
          ))}
        </tbody>
      </Box>
      )}
    </Box>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <Typography sx={{ fontSize: "0.78rem", color: "text.secondary" }}>{children}</Typography>;
}

/** `mortgageFrom` — минимальная ставка активных банков; null — банков нет или список недоступен. */
export function PaymentCard({ unit, mortgageFrom }: { unit: Unit; mortgageFrom: number | null }) {
  const { t } = useT("realestate");
  const { down, monthly } = paymentPlan(unit.price);
  return (
    <Box component="section" sx={cardSx}>
      <Typography component="h3" sx={cardTitleSx}>
        {t("card.payment.title")}
      </Typography>
      <SpecRows
        rows={[
          [t("card.payment.downPayment"), money(down)],
          [t("card.payment.installment"), t("card.payment.perMonth", { value: money(monthly) })],
          ...(mortgageFrom !== null ? [[t("card.payment.mortgage"), t("card.payment.mortgageFrom", { rate: num(mortgageFrom) })] as [string, string]] : []),
        ]}
      />
      <Typography sx={{ mt: 1.25, fontSize: "0.72rem", color: "text.secondary" }}>{t("card.payment.note")}</Typography>
    </Box>
  );
}

export function TechCard({ project, unit }: { project: Project; unit: UnitDetails }) {
  const { t } = useT("realestate");
  const [open, setOpen] = React.useState(true);
  // Только данные бэка: пустые поля (код планировки, 1С) не показываем.
  const rows = (
    [
      [t("card.tech.number"), unit.number],
      [t("card.tech.section"), sectionLabel(unit.section)],
      [t("card.tech.floor"), unit.floor],
      [t("card.tech.project"), project.name],
      [t("card.tech.area"), num(unit.totalArea)],
      [t("card.tech.layoutCode"), unit.layoutCode],
      [t("card.tech.stage"), project.stage],
      [t("card.tech.windows"), unit.view],
      [t("compare.rows.orientation"), unit.orientation],
      [t("card.tech.axis"), t("card.tech.axisValue", { axis: unit.axis })],
      [t("card.tech.ceiling"), t("compare.ceilingValue", { value: num(unit.ceilingHeight) })],
      [t("card.tech.externalId"), unit.externalId],
      [t("card.finish"), project.finish],
      [t("card.completion"), completionOf(project, unit)],
      [t("compare.rows.status"), unitStatusMeta[unit.status].label],
    ] as [string, string | number][]
  ).filter(([, value]) => value !== "" && value !== null && value !== undefined);
  return (
    <Box component="section" sx={sectionSx}>
      <ButtonBase
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        sx={{ width: "100%", display: "flex", justifyContent: "space-between", textAlign: "left", borderRadius: "10px" }}
      >
        <Box component="span" sx={{ display: "flex", flexDirection: "column" }}>
          <Typography component="small" sx={{ ...eyebrowSx, mb: 0.25 }}>
            {t("card.tech.eyebrow")}
          </Typography>
          <Typography component="b" sx={{ fontSize: "0.95rem", fontWeight: 700 }}>
            {t("card.tech.title")}
          </Typography>
        </Box>
        <ExpandMoreOutlined sx={{ color: "text.secondary", transform: open ? "rotate(180deg)" : "none", transition: "transform .15s ease" }} />
      </ButtonBase>
      {open && (
        <Box sx={{ mt: 1.5, display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" }, gap: 1 }}>
          {rows.map(([label, value]) => (
            <Box key={label} sx={(t) => ({ display: "flex", flexDirection: "column", gap: 0.25, p: 1.25, borderRadius: "10px", border: 1, borderColor: "divider", bgcolor: subtleBg(t) })}>
              <Typography component="span" sx={{ fontSize: "0.7rem", color: "text.secondary" }}>
                {label}
              </Typography>
              <Typography component="b" sx={{ fontSize: "0.8rem", fontWeight: 600 }}>
                {value}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

const historyIcons: Record<UnitEventType, string> = {
  inventory: "⌂",
  reserve: "◷",
  cancel: "×",
  payment: "с",
  meeting: "⌖",
  proposal: "◉",
  sale: "✓",
  refund: "↶",
  exchange: "⇄",
  note: "＋",
};

function historyTone(t: Theme, type: UnitEventType) {
  const c =
    type === "reserve" || type === "payment"
      ? t.palette.warning
      : type === "sale"
        ? t.palette.success
        : type === "cancel" || type === "refund"
          ? t.palette.error
          : type === "exchange"
            ? t.palette.info
            : null;
  return c
    ? { bgcolor: alpha(c.main, t.palette.mode === "dark" ? 0.2 : 0.12), color: c.onSurface }
    : { bgcolor: subtleBg(t, true), color: t.palette.text.secondary };
}

/** `onOperation` нет — операции недоступны (без realty.manage). */
export function History({ unit, onOperation }: { unit: UnitDetails; onOperation?: () => void }) {
  const { t } = useT("realestate");
  const [openIds, setOpenIds] = React.useState(() => new Set(unit.history.slice(0, 1).map((e) => e.id)));
  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Box component="section" sx={sectionSx}>
      <SectionTitle eyebrow={t("card.history.eyebrow")} title={t("card.history.title")} text={t("card.history.count", { count: unit.history.length })} size="1rem">
        {onOperation && (
          <Button size="small" variant="outlined" startIcon={<AddOutlined />} onClick={onOperation}>
            {t("card.history.operation")}
          </Button>
        )}
      </SectionTitle>
      <Box sx={{ display: "grid", gap: 0.75 }}>
        {unit.history.map((event) => {
          const open = openIds.has(event.id);
          return (
            <ButtonBase
              key={event.id}
              aria-expanded={open}
              onClick={() => toggle(event.id)}
              sx={(t) => ({
                display: "grid",
                gridTemplateColumns: "34px 1fr auto 18px",
                alignItems: "start",
                gap: 1.25,
                p: 1.25,
                textAlign: "left",
                borderRadius: "10px",
                border: 1,
                borderColor: "divider",
                bgcolor: open ? subtleBg(t) : "transparent",
                "&:hover": { bgcolor: subtleBg(t, true) },
              })}
            >
              <Box component="i" sx={(t) => ({ width: 34, height: 34, display: "grid", placeItems: "center", borderRadius: "10px", fontStyle: "normal", fontWeight: 700, ...historyTone(t, event.type) })}>
                {historyIcons[event.type] ?? "•"}
              </Box>
              <Box component="span" sx={{ display: "flex", flexDirection: "column", gap: 0.25, minWidth: 0 }}>
                <Box component="b" sx={{ fontSize: "0.8125rem" }}>
                  {event.title}
                </Box>
                <Box component="small" sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
                  {event.stage}
                </Box>
                <Box component="em" sx={{ fontSize: "0.72rem", fontStyle: "normal", color: "text.secondary" }}>
                  <Box component="strong" sx={{ color: "text.primary", fontWeight: 600 }}>
                    {event.actor}
                  </Box>
                  {event.buyer && event.buyer !== "—" ? ` · ${event.buyer}` : ""}
                </Box>
                {open && <Box component="p" sx={{ m: 0, mt: 0.75, fontSize: "0.78rem", lineHeight: 1.5 }}>{event.details}</Box>}
              </Box>
              <Box component="time" sx={{ fontSize: "0.7rem", color: "text.secondary", whiteSpace: "nowrap" }}>
                {event.date}
              </Box>
              <ExpandMoreOutlined sx={{ fontSize: 18, color: "text.secondary", transform: open ? "rotate(180deg)" : "none", transition: "transform .15s ease" }} />
            </ButtonBase>
          );
        })}
      </Box>
    </Box>
  );
}
