/**
 * «Документы» в карточке брони: подтверждение, счёт, регистрационная карта,
 * справка о проживании и анкета гостя — карточками с кнопкой «Печать» и
 * сообщения гостю в WhatsApp. Для справки дата рождения нужна из профиля
 * гостя — его подтягиваем при печати, остальные документы печатаются сразу
 * из данных карточки.
 */
import React from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import PrintOutlined from "@mui/icons-material/PrintOutlined";
import EventAvailableOutlined from "@mui/icons-material/EventAvailableOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import AssignmentIndOutlined from "@mui/icons-material/AssignmentIndOutlined";
import VerifiedOutlined from "@mui/icons-material/VerifiedOutlined";
import BadgeOutlined from "@mui/icons-material/BadgeOutlined";
import WhatsApp from "@mui/icons-material/WhatsApp";
import { useQuery } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { useNavigate } from "react-router";

import { getGuest, listCharges, type HotelGuest, type HotelPayment, type HotelProperty, type HotelReservation } from "../api/hotel";
import { usePermissions } from "../hooks/usePermissions";
import { useCan } from "../hooks/useCan";
import { subtleBorder } from "../theme/uiHelpers";
import { HOTEL_PRINT_DOC_HINTS, HOTEL_PRINT_DOC_LABELS, printHotelDocument, requisitesGap, type HotelPrintDoc, type RequisitesGap } from "./hotelPrintDocs";
import { buildGuestMessage, GUEST_MESSAGE_LABELS, whatsappLink, type GuestMessageKind } from "./hotelGuestMessages";

const DOCS: { doc: HotelPrintDoc; icon: React.ReactNode }[] = [
  { doc: "confirmation", icon: <EventAvailableOutlined /> },
  { doc: "invoice", icon: <ReceiptLongOutlined /> },
  { doc: "registrationCard", icon: <AssignmentIndOutlined /> },
  { doc: "certificate", icon: <VerifiedOutlined /> },
  { doc: "registration", icon: <BadgeOutlined /> },
];

export const ReservationDocumentsPanel: React.FC<{
  reservation: HotelReservation;
  payments: HotelPayment[];
  property: HotelProperty | null;
  phone: string;
}> = ({ reservation, payments, property, phone }) => {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();
  const { activeOrganization, activeEmployee, user } = usePermissions();
  const [busy, setBusy] = React.useState<HotelPrintDoc | null>(null);
  // Допуслуги — тот же ключ кэша, что у блока «Услуги»: в счёт попадают они же.
  const chargesQuery = useQuery({
    queryKey: ["hotel", "reservation", reservation.id, "charges", false],
    queryFn: ({ signal }) => listCharges(reservation.id, {}, signal),
    placeholderData: undefined,
  });
  const adminName =
    activeEmployee?.fullName || [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() || user?.username || "";
  const line = `1px solid ${subtleBorder(theme)}`;
  const waAvailable = whatsappLink(phone) != null;
  // Счёт и справка — только с реквизитами с сервера: без них не печатаем,
  // а говорим, что заполнить (и где), — см. requisitesGap.
  const navigate = useNavigate();
  const canEditRequisites = useCan("hotel.manage");
  const gapText = (gap: Exclude<RequisitesGap, null>) =>
    gap.kind === "server"
      ? "Не печатается: сервер ещё не хранит реквизиты отеля. Появится после его обновления."
      : `Не печатается: в реквизитах не заполнены ${gap.labels.join(", ")}.${canEditRequisites ? "" : " Попросите управляющего заполнить их в настройках."}`;

  const print = async (doc: HotelPrintDoc) => {
    if (requisitesGap(doc, property)) return;
    setBusy(doc);
    try {
      let guestProfiles: Map<number, HotelGuest> | undefined;
      if (doc === "certificate") {
        const ids = [...new Set(reservation.items.flatMap((it) => it.guests.map((g) => g.clientId)).filter((id): id is number => id != null))];
        const profiles = await Promise.all(ids.map((id) => getGuest(id).catch(() => null)));
        guestProfiles = new Map(profiles.filter((g): g is HotelGuest => g != null).map((g) => [g.clientId, g]));
      }
      printHotelDocument(doc, {
        reservation,
        payments,
        property,
        charges: chargesQuery.data?.results ?? [],
        logoUrl: activeOrganization?.logoUrl ?? null,
        adminName,
        guestProfiles,
      });
    } catch {
      enqueueSnackbar("Не удалось подготовить документ", { variant: "error" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Stack gap={3}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1.5 }}>
        {DOCS.map(({ doc, icon }) => {
          const gap = requisitesGap(doc, property);
          return (
            <Stack
              key={doc}
              direction="row"
              alignItems="center"
              gap={1.5}
              sx={{ p: 1.75, borderRadius: "14px", border: line, bgcolor: "background.paper" }}
            >
              <Box
                sx={{
                  width: 42,
                  height: 42,
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  color: "primary.main",
                  bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.18 : 0.08),
                }}
              >
                {icon}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={700}>
                  {HOTEL_PRINT_DOC_LABELS[doc]}
                </Typography>
                <Typography variant="caption" color={gap ? "warning.main" : "text.secondary"} fontWeight={gap ? 600 : undefined} component="div">
                  {gap ? gapText(gap) : HOTEL_PRINT_DOC_HINTS[doc]}
                </Typography>
              </Box>
              {gap?.kind === "fields" && canEditRequisites ? (
                <Button
                  size="small"
                  variant="outlined"
                  color="warning"
                  onClick={() => navigate("/settings/hotel-property#requisites")}
                  sx={{ flexShrink: 0, borderRadius: "10px" }}
                >
                  Заполнить
                </Button>
              ) : (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<PrintOutlined fontSize="small" />}
                  onClick={() => void print(doc)}
                  disabled={busy != null || gap != null}
                  sx={{ flexShrink: 0, borderRadius: "10px" }}
                >
                  {busy === doc ? "…" : "Печать"}
                </Button>
              )}
            </Stack>
          );
        })}
      </Box>

      <Box>
        <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary", mb: 1.25 }}>
          Сообщение гостю в WhatsApp
        </Typography>
        {waAvailable ? (
          <Stack direction="row" gap={1} flexWrap="wrap">
            {(Object.keys(GUEST_MESSAGE_LABELS) as GuestMessageKind[])
              .filter((kind) => kind !== "balance" || Number(reservation.balanceDue) > 0)
              .map((kind) => (
                <Button
                  key={kind}
                  size="small"
                  variant="outlined"
                  startIcon={<WhatsApp sx={{ color: "#25D366" }} />}
                  onClick={() => {
                    const link = whatsappLink(phone, buildGuestMessage(kind, reservation, property));
                    if (link) window.open(link, "_blank", "noopener");
                  }}
                  sx={{ borderRadius: "10px" }}
                >
                  {GUEST_MESSAGE_LABELS[kind]}
                </Button>
              ))}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">
            У гостя не указан телефон — добавьте его в карточке гостя.
          </Typography>
        )}
      </Box>
    </Stack>
  );
};

export default ReservationDocumentsPanel;
