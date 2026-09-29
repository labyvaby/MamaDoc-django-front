import React from "react";
import { Box, Button, Dialog, DialogContent, IconButton, Skeleton, Typography, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import EventOutlined from "@mui/icons-material/EventOutlined";
import SendOutlined from "@mui/icons-material/SendOutlined";
import { useQuery } from "@tanstack/react-query";

import { REALESTATE_USE_MOCKS, getMortgageRateFrom, getProjectUnits, getUnit, realEstateKeys, type Project, type Unit, type UnitDetails } from "../../../../api/realestate";
import { AppButton } from "../../../../components/ui";
import { useApiOrgId } from "../../../../hooks/useApiOrgId";
import { useCanChecker } from "../../../../hooks/useCan";
import { DEFAULT_OFFER, pickFloorUnit, pickOffer, priceWithOffer } from "../../model/unitCard";
import { formatMoney } from "../../model/units";
import { useRealEstateToast } from "../toast";
import {
  ContractScreen,
  MeetingScreen,
  OfferScreen,
  OperationScreen,
  PaymentScreen,
  ProposalScreen,
  ReserveScreen,
  SignedScreen,
  SuccessScreen,
  type FlowProps,
  type Screen,
} from "./flows";
import {
  ApartmentHead,
  Characteristics,
  FloorPlan,
  FloorScheme,
  History,
  KeyParams,
  PaymentCard,
  Promotions,
  RenderGallery,
  RoomTable,
  TechCard,
} from "./sections";

interface UnitCardDialogProps {
  project: Project;
  /** null — карточка закрыта. */
  unitId: string | null;
  onClose: () => void;
  onOpenUnit: (unitId: string) => void;
  /** «Сравнить» в карточке — добавить квартиру к выбору на шахматке. */
  onCompare: (unitId: string) => void;
}

/**
 * Карточка квартиры со всеми сценариями. Открытая квартира живёт в URL (?unit=),
 * а экран внутри карточки (бронь, КП, договор…) — локальное состояние.
 */
export function UnitCardDialog({ project, unitId, onClose, onOpenUnit, onCompare }: UnitCardDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  return (
    <Dialog
      open={unitId !== null}
      onClose={onClose}
      fullScreen={fullScreen}
      fullWidth
      scroll="paper"
      aria-labelledby="realestate-unit-title"
      // Dialog maxWidth="lg" завязан на брейкпоинты темы — ширину задаём явно.
      PaperProps={{ sx: { maxWidth: fullScreen ? undefined : 1180, borderRadius: fullScreen ? 0 : "14px" } }}
    >
      <IconButton aria-label="Закрыть" onClick={onClose} sx={{ position: "absolute", right: 14, top: 14, zIndex: 2, bgcolor: "background.paper" }}>
        <CloseOutlined />
      </IconButton>
      {unitId && <UnitCard key={unitId} project={project} unitId={unitId} onClose={onClose} onOpenUnit={onOpenUnit} onCompare={onCompare} />}
    </Dialog>
  );
}

function UnitCard({ project, unitId, onClose, onOpenUnit, onCompare }: Omit<UnitCardDialogProps, "unitId"> & { unitId: string }) {
  const organizationId = useApiOrgId();
  const { can } = useCanChecker();
  // Команды над квартирой — realty.manage; без него карточка только для чтения.
  const canManage = REALESTATE_USE_MOCKS || can("realty.manage");
  const query = useQuery({ queryKey: realEstateKeys.unit(organizationId, unitId), queryFn: () => getUnit(unitId, organizationId) });
  const projectUnits = useQuery({
    queryKey: realEstateKeys.units(organizationId, project.id),
    queryFn: () => getProjectUnits(project.id, organizationId),
  }).data;
  const mortgageFrom =
    useQuery({ queryKey: realEstateKeys.mortgageRate(organizationId), queryFn: () => getMortgageRateFrom(organizationId), staleTime: 30 * 60_000 })
      .data ?? null;
  const [screen, setScreen] = React.useState<Screen>("unit");
  const [offerId, setOfferId] = React.useState(DEFAULT_OFFER);
  const contentRef = React.useRef<HTMLDivElement>(null);

  // Новый экран — с начала, как новая страница.
  React.useLayoutEffect(() => {
    contentRef.current?.scrollTo?.({ top: 0 });
  }, [screen]);

  const unit = query.data;
  if (!unit) {
    return (
      <DialogContent sx={{ p: { xs: 2, md: 3.5 } }}>
        {query.isError ? (
          <Box role="alert">
            <Typography variant="h6">Не удалось загрузить квартиру</Typography>
            <Typography sx={{ mt: 0.5, color: "text.secondary" }}>{(query.error as Error).message}</Typography>
            <Button sx={{ mt: 2 }} variant="outlined" onClick={() => void query.refetch()}>
              Повторить
            </Button>
          </Box>
        ) : (
          <Box aria-busy>
            <Skeleton variant="text" width={260} height={44} />
            <Skeleton variant="rounded" height={390} sx={{ mt: 2, borderRadius: "14px" }} />
          </Box>
        )}
      </DialogContent>
    );
  }

  const offer = pickOffer(unit.offers, offerId);
  const flow: FlowProps = { project, unit, offer, organizationId, canManage, onBack: () => setScreen("unit"), onClose, go: setScreen, onOpenUnit };
  const flows: Record<Exclude<Screen, "unit">, () => React.ReactElement> = {
    reserve: () => <ReserveScreen {...flow} />,
    payment: () => <PaymentScreen {...flow} />,
    success: () => <SuccessScreen {...flow} />,
    proposal: () => <ProposalScreen {...flow} />,
    meeting: () => <MeetingScreen {...flow} />,
    operation: () => <OperationScreen {...flow} />,
    offer: () => <OfferScreen {...flow} />,
    contract: () => <ContractScreen {...flow} />,
    signed: () => <SignedScreen {...flow} />,
  };

  return (
    <DialogContent ref={contentRef} sx={{ p: { xs: 2, md: 3.5 } }}>
      {screen === "unit" ? (
        <ApartmentDetail
          project={project}
          unit={unit}
          floorUnits={projectUnits?.filter((u) => u.floor === unit.floor) ?? []}
          offerId={offer.id}
          onSelectOffer={setOfferId}
          go={setScreen}
          onOpenUnit={onOpenUnit}
          onChangeFloor={(direction) => {
            const target = Math.max(project.firstResidentialFloor, Math.min(project.floorsCount, unit.floor + direction));
            const next = pickFloorUnit(projectUnits ?? [], target);
            if (next && next.id !== unit.id) onOpenUnit(next.id);
          }}
          onCompare={onCompare}
          canManage={canManage}
          mortgageFrom={mortgageFrom}
        />
      ) : (
        flows[screen]()
      )}
    </DialogContent>
  );
}

function ApartmentDetail({
  project,
  unit,
  floorUnits,
  offerId,
  onSelectOffer,
  go,
  onOpenUnit,
  onChangeFloor,
  onCompare,
  canManage,
  mortgageFrom,
}: {
  project: Project;
  unit: UnitDetails;
  floorUnits: Unit[];
  offerId: string;
  onSelectOffer: (offerId: string) => void;
  go: (screen: Screen) => void;
  onOpenUnit: (unitId: string) => void;
  onChangeFloor: (direction: -1 | 1) => void;
  onCompare: (unitId: string) => void;
  canManage: boolean;
  mortgageFrom: number | null;
}) {
  const toast = useRealEstateToast();
  const offer = pickOffer(unit.offers, offerId);
  const reservation = unit.reservation;

  return (
    <Box>
      <ApartmentHead project={project} unit={unit} />
      <RenderGallery />
      <Promotions
        unit={unit}
        offers={unit.offers}
        active={offer}
        onSelect={(next) => {
          onSelectOffer(next.id);
          toast("Акция выбрана", `${next.title} · итог ${formatMoney(priceWithOffer(unit, next))}`);
        }}
        onDetails={() => go("offer")}
        onReserve={canManage ? () => go("reserve") : undefined}
      />
      <Characteristics unit={unit} onCompare={onCompare} />
      <FloorScheme unit={unit} floorUnits={floorUnits} onOpenUnit={onOpenUnit} onChangeFloor={onChangeFloor} />
      <Box sx={{ mt: 2, display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.4fr 0.6fr" }, gap: 2 }}>
        <FloorPlan unit={unit} />
        <KeyParams project={project} unit={unit} />
      </Box>
      <Box sx={{ mt: 2, display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.2fr 0.8fr" }, gap: 2 }}>
        <RoomTable unit={unit} />
        <PaymentCard unit={unit} mortgageFrom={mortgageFrom} />
      </Box>
      <TechCard project={project} unit={unit} />
      <History key={unit.history.length} unit={unit} onOperation={canManage ? () => go("operation") : undefined} />
      {/* Без realty.manage остаётся только просмотр договора. */}
      {(canManage || unit.status === "sold") && (
        <Box
          component="footer"
          sx={{
            position: "sticky",
            bottom: 0,
            zIndex: 1,
            mt: 2,
            mx: { xs: -2, md: -3.5 },
            mb: { xs: -2, md: -3.5 },
            px: { xs: 2, md: 3.5 },
            py: 1.75,
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "flex-end",
            gap: 1.25,
            borderTop: 1,
            borderColor: "divider",
            bgcolor: "background.paper",
          }}
        >
          {canManage && (
            <>
              <Button variant="outlined" startIcon={<SendOutlined />} onClick={() => go("proposal")}>
                Отправить КП
              </Button>
              <Button variant="outlined" startIcon={<EventOutlined />} onClick={() => go("meeting")}>
                Поставить встречу
              </Button>
            </>
          )}
          {unit.status === "free" ? (
            <AppButton variant="contained" onClick={() => go("reserve")}>
              Забронировать квартиру
            </AppButton>
          ) : unit.status === "reserved" && reservation?.paymentStatus === "pending" ? (
            <AppButton variant="contained" onClick={() => go("payment")}>
              Отметить оплату
            </AppButton>
          ) : unit.status === "reserved" ? (
            <AppButton variant="contained" onClick={() => go("contract")}>
              Оформить договор
            </AppButton>
          ) : (
            <AppButton variant="contained" onClick={() => go("signed")}>
              Открыть договор
            </AppButton>
          )}
        </Box>
      )}
    </Box>
  );
}
