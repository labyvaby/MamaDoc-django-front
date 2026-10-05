/**
 * Сценарии из карточки квартиры: бронь → оплата → готово, КП в WhatsApp, встреча,
 * операции (снять бронь, возврат, обмен, запись), акция, договор. Порядок полей
 * и тексты — как в прототипе (crm-building/frontend, widgets/unit-card/flows.tsx).
 */
import React from "react";
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Radio,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import dayjs, { type Dayjs } from "dayjs";

import {
  CONTRACT_PAYMENT_LABELS,
  REALESTATE_USE_MOCKS,
  confirmUnitPrepayment,
  extendUnitReservation,
  getProjectUnits,
  getSalesManagers,
  realEstateKeys,
  reserveUnit,
  runUnitOperation,
  scheduleUnitMeeting,
  sendUnitProposal,
  signUnitContract,
  type ContractInput,
  type ContractPayment,
  type Project,
  type RealtyScope,
  type ReservationTerm,
  type ReservationType,
  type UnitDetails,
  type UnitOffer,
  type UnitOperation,
} from "../../../../api/realestate";
import { getErrorCode } from "../../../../api/client";
import { AppButton, ConfirmDialog, CustomDateTimePicker } from "../../../../components/ui";
import { useCanChecker } from "../../../../hooks/useCan";
import { useT } from "../../../../i18n/VerticalProvider";
import { tt } from "../../../../i18n/t";
import { subtleBg } from "../../../../theme/uiHelpers";
import {
  balconyLabel,
  offerDiscountLabel,
  paymentPlan,
  priceWithOffer,
  terraceLabel,
  unitType,
} from "../../model/unitCard";
import { formatMoney as money, num } from "../../model/units";
import { completionOf, sectionLabel } from "../../model/board";
import { eyebrowSx } from "../tones";
import { PhoneController } from "./PhoneController";
import { leadIdFor, useChessboardLead } from "../../model/leadContext";
import { useRealEstateToast } from "../toast";

export type Screen =
  | "unit"
  | "reserve"
  | "payment"
  | "extend"
  | "success"
  | "proposal"
  | "meeting"
  | "operation"
  | "offer"
  | "contract"
  | "signed";

export interface FlowProps {
  project: Project;
  unit: UnitDetails;
  offer: UnitOffer;
  /** Организация и филиал запросов: организация уходит заголовком, филиал — в ключи кэша. */
  scope: RealtyScope;
  /** realty.manage — команды над квартирой. */
  canManage: boolean;
  onBack: () => void;
  onClose: () => void;
  go: (screen: Screen) => void;
  onOpenUnit: (unitId: string) => void;
}

/** Предоплата брони по умолчанию — из настроек ЖК; не задана — сумму ставит бэк при создании брони. */
const prepaymentText = (project: Project) => (project.defaultPrepayment ? money(project.defaultPrepayment) : "");

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : tt("realestate:flow.opFailed"));

/** Время встречи по умолчанию: завтра в 11:00. */
const tomorrowAt11 = () => dayjs().add(1, "day").hour(11).minute(0).second(0).millisecond(0);

/**
 * Команда над квартирой: ответ — свежая карточка. Шахматка и соседние карточки
 * перезапрашиваются, потому что меняются статусы.
 */
function useUnitCommand<Input>(scope: RealtyScope, run: (input: Input) => Promise<UnitDetails>) {
  const queryClient = useQueryClient();
  const onError = useCommandError();
  return useMutation({
    mutationFn: run,
    onSuccess: (next) => {
      queryClient.setQueryData(realEstateKeys.unit(scope, next.id), next);
      void queryClient.invalidateQueries({ queryKey: realEstateKeys.all });
    },
    onError,
  });
}

/**
 * Ошибка команды: текст бэка (`error.message` уже по-русски). 409
 * `UNIT_NOT_FREE` — квартиру заняли из другого окна: перечитываем шахматку и
 * карточку, иначе менеджер продолжит работать со старым статусом.
 */
function useCommandError() {
  const queryClient = useQueryClient();
  const toast = useRealEstateToast();
  const { t } = useT("realestate");
  return React.useCallback(
    (error: unknown) => {
      if (getErrorCode(error) === "UNIT_NOT_FREE") {
        void queryClient.invalidateQueries({ queryKey: realEstateKeys.all });
        toast(errorMessage(error), t("flow.unitTakenHint"));
        return;
      }
      toast(errorMessage(error));
    },
    [queryClient, toast, t],
  );
}

// ─── Общая разметка ────────────────────────────────────────────────────────

function FlowHead({ eyebrow, title, intro }: { eyebrow: string; title: React.ReactNode; intro?: React.ReactNode }) {
  return (
    <>
      <Typography component="span" sx={eyebrowSx}>
        {eyebrow}
      </Typography>
      <Typography id="realestate-unit-title" component="h2" sx={{ m: 0, fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.4px" }}>
        {title}
      </Typography>
      {intro && <Typography sx={{ mt: 0.75, mb: 2, fontSize: "0.8125rem", color: "text.secondary" }}>{intro}</Typography>}
    </>
  );
}

function Actions({ children }: { children: React.ReactNode }) {
  return <Box sx={{ mt: 3, display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 1.25 }}>{children}</Box>;
}

function Summary({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <Box sx={{ my: 2, display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: `repeat(${items.length}, 1fr)` }, gap: 1 }}>
      {items.map(([label, value]) => (
        <Box key={label} sx={(t) => ({ display: "flex", flexDirection: "column", gap: 0.4, p: 1.4, borderRadius: "10px", border: 1, borderColor: "divider", bgcolor: subtleBg(t) })}>
          <Typography component="span" sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
            {label}
          </Typography>
          <Typography component="b" sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
            {value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

const formGridSx = { display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1.5 } as const;
const wide = { gridColumn: "1 / -1" } as const;

/** Галочка с заголовком и пояснением — «Поставить задачу „Встреча“». */
function OptionCheckbox({ checked, onChange, title, hint }: { checked: boolean; onChange: (v: boolean) => void; title: string; hint: string }) {
  return (
    <FormControlLabel
      sx={(t) => ({ m: 0, mt: 1.5, width: "100%", alignItems: "flex-start", gap: 0.5, p: 1.25, borderRadius: "10px", border: 1, borderColor: "divider", bgcolor: subtleBg(t) })}
      control={<Checkbox checked={checked} onChange={(e) => onChange(e.target.checked)} sx={{ p: 0.25 }} />}
      label={
        <Box sx={{ display: "flex", flexDirection: "column" }}>
          <Typography component="b" sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
            {title}
          </Typography>
          <Typography component="small" sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
            {hint}
          </Typography>
        </Box>
      }
    />
  );
}

const successMarkSx = (t: Theme) => ({
  width: 52,
  height: 52,
  mb: 2,
  display: "grid",
  placeItems: "center",
  borderRadius: "14px",
  bgcolor: alpha(t.palette.success.main, t.palette.mode === "dark" ? 0.2 : 0.12),
  color: t.palette.success.onSurface,
});

// ─── Бронирование ──────────────────────────────────────────────────────────

interface ReserveForm {
  buyer: string;
  phone: string;
  term: string;
  type: ReservationType;
  withMeeting: boolean;
  meetingAt: Dayjs | null;
}

export function ReserveScreen({ project, unit, offer, scope, onBack, go }: FlowProps) {
  const toast = useRealEstateToast();
  const { t } = useT("realestate");
  const reserve = useUnitCommand(scope, (input: Parameters<typeof reserveUnit>[1]) => reserveUnit(unit.id, input, scope));
  const finalPrice = priceWithOffer(unit, offer);
  // Подбор для заявки CRM (`?lead=`): клиент заявки — сразу в форме.
  const lead = useChessboardLead();
  const { register, control, handleSubmit, watch, formState } = useForm<ReserveForm>({
    defaultValues: { buyer: lead?.client ?? "", phone: lead?.phone ?? "", term: "48", type: "free", withMeeting: true, meetingAt: tomorrowAt11() },
  });
  const type = watch("type");
  const withMeeting = watch("withMeeting");

  const submit = handleSubmit((form) => {
    reserve.mutate(
      {
        buyer: form.buyer.trim(),
        phone: form.phone.trim(),
        termHours: Number(form.term) as ReservationTerm,
        type: form.type,
        offerId: offer.id,
        meetingAt: form.withMeeting && form.meetingAt ? form.meetingAt.format("YYYY-MM-DDTHH:mm") : null,
        leadId: leadIdFor(lead, form.buyer, form.phone),
      },
      {
        onSuccess: (next) => {
          go(next.reservation?.paymentStatus === "pending" ? "payment" : "success");
          toast(t("flow.reserve.created"), form.withMeeting ? t("flow.reserve.meetingSet") : t("flow.reserve.until", { date: next.reservation?.expiresAt ?? "" }));
        },
      },
    );
  });

  return (
    <Box>
      <FlowHead eyebrow={t("flow.reserve.eyebrow")} title={t("card.title", { number: unit.number })} intro={t("flow.unitIntro", { name: project.name, type: unitType(unit), area: t("fmt.area", { value: num(unit.totalArea) }) })} />
      <Box
        sx={(t) => ({
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1.5fr 0.8fr 1fr" },
          gap: 1.25,
          mb: 2,
          p: 1.6,
          borderRadius: "12px",
          border: `1px solid ${alpha(t.palette.primary.main, 0.35)}`,
          bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.12 : 0.06),
        })}
      >
        <OfferCell label={t("flow.reserve.pickedOffer")} value={offer.title} hint={offer.until} />
        <OfferCell label={t("offers.discount")} value={offerDiscountLabel(offer)} />
        <OfferCell label={t("flow.reserve.offerPrice")} value={money(finalPrice)} strong />
      </Box>
      <form onSubmit={submit} noValidate>
        <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
          {[t("flow.reserve.stepBuyer"), t("flow.reserve.stepType"), t("flow.reserve.stepMeeting")].map((step, i) => (
            <Box key={step} component="span" sx={{ display: "flex", alignItems: "center", gap: 0.75, fontSize: "0.75rem", color: i === 0 ? "text.primary" : "text.secondary", fontWeight: i === 0 ? 600 : 500 }}>
              <Box
                component="b"
                sx={(t) => ({
                  width: 20,
                  height: 20,
                  display: "grid",
                  placeItems: "center",
                  borderRadius: "50%",
                  fontSize: 11,
                  ...(i === 0 ? { bgcolor: "primary.main", color: "primary.contrastText" } : { bgcolor: subtleBg(t, true) }),
                })}
              >
                {i + 1}
              </Box>
              {step}
            </Box>
          ))}
        </Box>
        <Box sx={formGridSx}>
          <TextField
            label={t("flow.buyerName")}
            placeholder={t("flow.buyerPlaceholder")}
            sx={wide}
            {...register("buyer", { required: t("flow.buyerRequired"), validate: (v) => v.trim() !== "" || t("flow.buyerRequired") })}
            error={Boolean(formState.errors.buyer)}
            helperText={formState.errors.buyer?.message}
          />
          <PhoneController control={control} name="phone" label={t("flow.phoneNumber")} requiredMessage={t("flow.phoneRequired")} />
          <Controller
            control={control}
            name="term"
            render={({ field }) => (
              <TextField select label={t("flow.reserve.term")} {...field}>
                {[24, 48, 72].map((hours) => (
                  <MenuItem key={hours} value={String(hours)}>
                    {t("flow.hours", { count: hours })}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
        </Box>
        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <Box role="radiogroup" aria-label={t("flow.reserve.stepType")} sx={{ mt: 1.5, display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1.25 }}>
              {(
                [
                  ["free", "○", t("flow.reserve.freeTitle"), t("flow.reserve.freeHint")],
                  ["prepaid", "с", t("flow.reserve.prepaidTitle"), t("flow.reserve.prepaidHint", { amount: prepaymentText(project) || t("flow.reserve.amountByProject") })],
                ] as const
              ).map(([value, icon, title, hint]) => {
                const checked = field.value === value;
                return (
                  <Box
                    key={value}
                    component="label"
                    sx={(t) => ({
                      display: "flex",
                      alignItems: "center",
                      gap: 1.25,
                      p: 1.5,
                      cursor: "pointer",
                      borderRadius: "12px",
                      border: 1,
                      borderColor: checked ? alpha(t.palette.primary.main, 0.6) : "divider",
                      bgcolor: checked ? alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.14 : 0.07) : "transparent",
                    })}
                  >
                    <Radio checked={checked} onChange={() => field.onChange(value)} value={value} sx={{ p: 0.25 }} />
                    <Box component="i" sx={(t) => ({ width: 32, height: 32, display: "grid", placeItems: "center", borderRadius: "10px", fontStyle: "normal", bgcolor: subtleBg(t, true) })}>
                      {icon}
                    </Box>
                    <Box sx={{ display: "flex", flexDirection: "column" }}>
                      <Typography component="b" sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                        {title}
                      </Typography>
                      <Typography component="small" sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
                        {hint}
                      </Typography>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          )}
        />
        {type === "prepaid" && (
          <Box sx={(t) => ({ mt: 1.5, p: 1.5, borderRadius: "10px", bgcolor: alpha(t.palette.warning.main, t.palette.mode === "dark" ? 0.16 : 0.1), display: "flex", flexDirection: "column", gap: 0.25 })}>
            <Typography component="b" sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
              {t("flow.reserve.prepayment", { amount: prepaymentText(project) })}
            </Typography>
            <Typography component="span" sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
              {t("flow.reserve.prepaymentHint")}
            </Typography>
          </Box>
        )}
        <Controller
          control={control}
          name="withMeeting"
          render={({ field }) => (
            <OptionCheckbox checked={field.value} onChange={field.onChange} title={t("flow.reserve.withMeeting")} hint={t("flow.reserve.withMeetingHint")} />
          )}
        />
        {withMeeting && (
          <Box sx={{ mt: 1.5 }}>
            <Controller
              control={control}
              name="meetingAt"
              render={({ field }) => (
                <CustomDateTimePicker label={t("flow.reserve.meetingAt")} value={field.value} onChange={(v) => field.onChange(v as Dayjs | null)} slotProps={{ textField: { fullWidth: true } }} />
              )}
            />
          </Box>
        )}
        <Actions>
          <Button variant="outlined" onClick={onBack}>
            {t("flow.cancel")}
          </Button>
          <AppButton variant="contained" type="submit" loading={reserve.isPending}>
            {t("flow.reserveFor", { price: money(finalPrice) })}
          </AppButton>
        </Actions>
      </form>
    </Box>
  );
}

function OfferCell({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
      <Typography component="span" sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
        {label}
      </Typography>
      <Typography component="b" sx={{ fontSize: strong ? "1rem" : "0.8125rem", fontWeight: strong ? 700 : 600, color: strong ? "primary.onSurface" : "text.primary" }}>
        {value}
      </Typography>
      {hint && (
        <Typography component="small" sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
          {hint}
        </Typography>
      )}
    </Box>
  );
}

export function PaymentScreen({ project, unit, scope, onBack, go }: FlowProps) {
  const toast = useRealEstateToast();
  const { t } = useT("realestate");
  const confirm = useUnitCommand(scope, () => confirmUnitPrepayment(unit, scope));
  const amount = unit.reservation?.amount || project.defaultPrepayment || 0;
  return (
    <Box>
      <FlowHead
        eyebrow={t("flow.payment.eyebrow")}
        title={t("flow.reserve.prepayment", { amount: money(amount) })}
        intro={t("flow.payment.intro")}
      />
      <Summary
        items={[
          [t("flow.payment.purpose"), t("flow.payment.purposeValue", { number: unit.number, name: project.name })],
          [t("flow.buyer"), unit.reservation?.buyer || "—"],
          [t("flow.payment.validUntil"), unit.reservation?.expiresAt || "—"],
        ]}
      />
      <Actions>
        <Button variant="outlined" onClick={onBack}>
          {t("flow.payment.later")}
        </Button>
        <AppButton
          variant="contained"
          startIcon={<CheckOutlined />}
          loading={confirm.isPending}
          onClick={() =>
            confirm.mutate(undefined, {
              onSuccess: () => {
                go("success");
                toast(t("flow.payment.accepted"), money(amount));
              },
            })
          }
        >
          {t("flow.payment.received")}
        </AppButton>
      </Actions>
    </Box>
  );
}

/** Продление брони: срок выбирается теми же шагами, что при создании (24/48/72 ч). */
export function ExtendScreen({ project, unit, scope, onBack }: FlowProps) {
  const toast = useRealEstateToast();
  const { t } = useT("realestate");
  const extend = useUnitCommand(scope, (hours: ReservationTerm) => extendUnitReservation(unit, hours, scope));
  const [hours, setHours] = React.useState<ReservationTerm>(24);
  return (
    <Box>
      <FlowHead
        eyebrow={t("flow.extend.eyebrow")}
        title={t("card.title", { number: unit.number })}
        intro={t("flow.extend.intro", { buyer: unit.reservation?.buyer || "—" })}
      />
      <Summary
        items={[
          [t("flow.payment.purpose"), t("flow.payment.purposeValue", { number: unit.number, name: project.name })],
          [t("flow.extend.currentUntil"), unit.reservation?.expiresAt || "—"],
        ]}
      />
      <TextField
        select
        fullWidth
        label={t("flow.extend.hours")}
        value={String(hours)}
        onChange={(event) => setHours(Number(event.target.value) as ReservationTerm)}
      >
        {[24, 48, 72].map((value) => (
          <MenuItem key={value} value={String(value)}>
            {t("flow.hours", { count: value })}
          </MenuItem>
        ))}
      </TextField>
      <Actions>
        <Button variant="outlined" onClick={onBack}>
          {t("flow.backToUnit")}
        </Button>
        <AppButton
          variant="contained"
          loading={extend.isPending}
          onClick={() =>
            extend.mutate(hours, {
              onSuccess: (next) => {
                onBack();
                toast(t("flow.extend.done"), next.reservation?.expiresAt ? t("flow.extend.doneUntil", { date: next.reservation.expiresAt }) : undefined);
              },
            })
          }
        >
          {t("flow.extend.submit")}
        </AppButton>
      </Actions>
    </Box>
  );
}

export function SuccessScreen({ unit, onBack, go }: FlowProps) {
  const { t } = useT("realestate");
  const r = unit.reservation;
  const hasMeeting = unit.history.some((e) => e.type === "meeting");
  return (
    <Box>
      <Box sx={successMarkSx}>
        <CheckOutlined />
      </Box>
      <FlowHead eyebrow={t("flow.success.eyebrow")} title={t("flow.success.title", { number: unit.number })} intro={`${r?.buyer || t("flow.buyer")} · ${r?.phone ?? ""}`} />
      <Summary
        items={[
          [t("flow.reserve.stepType"), r?.type === "prepaid" ? t("flow.success.prepaid") : t("flow.success.free")],
          [t("flow.success.term"), t("flow.hours", { count: r?.termHours ?? 48 })],
          [
            t("flow.success.payment"),
            r?.type === "prepaid" ? (r.paymentStatus === "paid" ? t("flow.success.paid") : t("flow.success.pending")) : t("flow.success.notRequired"),
          ],
          [t("flow.success.task"), hasMeeting ? t("flow.success.meetingCreated") : t("flow.success.noTask")],
        ]}
      />
      <Actions>
        <Button variant="outlined" onClick={onBack}>
          {t("flow.unitCard")}
        </Button>
        <AppButton variant="contained" onClick={() => go("proposal")}>
          {t("flow.success.sendProposal")}
        </AppButton>
      </Actions>
    </Box>
  );
}

// ─── КП, встреча ───────────────────────────────────────────────────────────

export function ProposalScreen({ project, unit, offer, scope, onBack, onClose }: FlowProps) {
  const toast = useRealEstateToast();
  const { t } = useT("realestate");
  const queryClient = useQueryClient();
  const send = useMutation({
    mutationFn: (input: Parameters<typeof sendUnitProposal>[1]) => sendUnitProposal(unit.id, input, scope),
    onSuccess: ({ unit: next }) => {
      queryClient.setQueryData(realEstateKeys.unit(scope, next.id), next);
      void queryClient.invalidateQueries({ queryKey: realEstateKeys.all });
    },
    onError: useCommandError(),
  });
  const finalPrice = priceWithOffer(unit, offer);
  const perMeter = money(Math.round(finalPrice / unit.totalArea));
  const { control, handleSubmit } = useForm<{ phone: string }>({
    defaultValues: { phone: unit.reservation?.phone ?? "" },
  });

  const submit = handleSubmit(({ phone }) => {
    // Вложений WhatsApp-ссылка не передаёт, поэтому includePlan: false — иначе бэк
    // пишет в текст «планировка включена», а её у покупателя не будет.
    const includePlan = false;
    // Текст для моков; на живом API текст и ссылку собирает бэк — тот же, что он сохранил в истории.
    const message = [
      t("flow.proposal.msg.title"),
      "",
      t("project.name", { name: project.name }),
      t("flow.proposal.msg.unit", { number: unit.number, type: unitType(unit), area: t("fmt.area", { value: num(unit.totalArea) }) }),
      `${t("cell.floor", { floor: unit.floor })}, ${sectionLabel(unit.section)}`,
      `${unit.orientation}, ${unit.view}`,
      t("flow.proposal.msg.ceiling", { ceiling: num(unit.ceilingHeight), finish: project.finish }),
      t("flow.proposal.msg.basePrice", { price: money(unit.price) }),
      t("flow.proposal.msg.offer", { title: offer.title }),
      t("flow.proposal.msg.discount", { value: offer.discount ? money(offer.discount) : t("offer.noOverpay") }),
      t("flow.proposal.msg.offerPrice", { price: money(finalPrice), perMeter }),
      ...(includePlan ? ["", t("flow.proposal.msg.planIncluded")] : []),
    ].join("\n");

    send.mutate(
      { phone: phone.trim(), includePlan, offerId: offer.id },
      {
        onSuccess: ({ whatsappUrl }) => {
          const url = whatsappUrl ?? `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
          window.open(url, "_blank", "noopener");
          onClose();
          toast(t("flow.proposal.ready"), t("flow.proposal.readyHint", { number: unit.number, phone }));
        },
      },
    );
  });

  return (
    <Box>
      <FlowHead eyebrow={t("flow.proposal.eyebrow")} title={t("card.title", { number: unit.number })} intro={t("flow.proposal.intro")} />
      <Box sx={{ display: "grid", gap: 2, p: 1.5, mb: 2, borderRadius: "14px", border: 1, borderColor: "divider" }}>
        <Box>
          <Typography component="span" sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
            {t("project.name", { name: project.name })}
          </Typography>
          <Typography component="h3" sx={{ m: 0, mt: 0.5, fontSize: "1.05rem", fontWeight: 700 }}>
            {unitType(unit)} · {t("fmt.area", { value: num(unit.totalArea) })}
          </Typography>
          <Typography component="strong" sx={{ display: "block", mt: 1, fontSize: "1.2rem", fontWeight: 700, color: "primary.onSurface" }}>
            {money(finalPrice)}
          </Typography>
          <Typography component="small" sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
            {offer.discount ? `${t("flow.proposal.discount", { value: money(offer.discount) })} · ` : ""}
            {t("preview.perSqm", { value: perMeter })}
          </Typography>
          <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.25, fontSize: "0.78rem", display: "grid", gap: 0.25 }}>
            <li>
              {t("cell.floor", { floor: unit.floor })}, {sectionLabel(unit.section)}
            </li>
            <li>
              {unit.orientation} · {unit.view}
            </li>
            <li>
              {t("flow.proposal.ceilingFinish", { ceiling: num(unit.ceilingHeight), finish: project.finish })}
            </li>
            {(terraceLabel(unit) || balconyLabel(unit)) && <li>{terraceLabel(unit) || balconyLabel(unit)}</li>}
          </Box>
          <Typography component="em" sx={{ display: "block", mt: 1, fontSize: "0.75rem", fontStyle: "normal", fontWeight: 600, color: "primary.onSurface" }}>
            ★ {offer.title}
          </Typography>
        </Box>
      </Box>
      <form onSubmit={submit} noValidate>
        <PhoneController control={control} name="phone" label={t("flow.proposal.whatsapp")} requiredMessage={t("flow.proposal.whatsappRequired")} />
        <Actions>
          <Button variant="outlined" onClick={onBack}>
            {t("flow.back")}
          </Button>
          <AppButton variant="contained" type="submit" loading={send.isPending}>
            {t("flow.proposal.send")}
          </AppButton>
        </Actions>
      </form>
    </Box>
  );
}

interface MeetingForm {
  buyer: string;
  phone: string;
  meetingAt: Dayjs | null;
  note: string;
}

export function MeetingScreen({ project, unit, scope, onBack, onClose }: FlowProps) {
  const toast = useRealEstateToast();
  const { t } = useT("realestate");
  const schedule = useUnitCommand(scope, (input: Parameters<typeof scheduleUnitMeeting>[1]) => scheduleUnitMeeting(unit.id, input, scope));
  const { register, control, handleSubmit, formState } = useForm<MeetingForm>({
    defaultValues: { buyer: unit.reservation?.buyer ?? "", phone: unit.reservation?.phone ?? "", meetingAt: tomorrowAt11(), note: "" },
  });

  const submit = handleSubmit((form) => {
    const meetingAt = form.meetingAt!;
    schedule.mutate(
      { buyer: form.buyer.trim(), phone: form.phone.trim(), meetingAt: meetingAt.format("YYYY-MM-DDTHH:mm"), note: form.note.trim() },
      {
        onSuccess: () => {
          onClose();
          toast(t("flow.meeting.created"), t("flow.meeting.createdHint", { time: meetingAt.format("HH:mm"), number: unit.number }));
        },
      },
    );
  });

  return (
    <Box>
      <FlowHead eyebrow={t("flow.meeting.eyebrow")} title={t("flow.meeting.title", { number: unit.number })} intro={t("flow.unitIntro", { name: project.name, type: unitType(unit), area: t("fmt.area", { value: num(unit.totalArea) }) })} />
      <form onSubmit={submit} noValidate>
        <Box sx={formGridSx}>
          <TextField
            label={t("flow.buyerName")}
            placeholder={t("flow.meeting.buyerPlaceholder")}
            sx={wide}
            {...register("buyer", { required: t("flow.buyerRequired") })}
            error={Boolean(formState.errors.buyer)}
            helperText={formState.errors.buyer?.message}
          />
          <PhoneController control={control} name="phone" label={t("flow.phone")} requiredMessage={t("flow.phoneRequired")} />
          <Controller
            control={control}
            name="meetingAt"
            rules={{ required: t("flow.meeting.dateRequired") }}
            render={({ field, fieldState }) => (
              <CustomDateTimePicker
                label={t("flow.meeting.date")}
                value={field.value}
                onChange={(v) => field.onChange(v as Dayjs | null)}
                slotProps={{ textField: { fullWidth: true, error: Boolean(fieldState.error), helperText: fieldState.error?.message } }}
              />
            )}
          />
          <TextField label={t("flow.meeting.note")} placeholder={t("flow.meeting.notePlaceholder")} multiline rows={3} sx={wide} {...register("note")} />
        </Box>
        <Actions>
          <Button variant="outlined" onClick={onBack}>
            {t("flow.cancel")}
          </Button>
          <AppButton variant="contained" type="submit" loading={schedule.isPending}>
            {t("flow.meeting.submit")}
          </AppButton>
        </Actions>
      </form>
    </Box>
  );
}

// ─── Операции ──────────────────────────────────────────────────────────────

const operationToast: Record<UnitOperation, (from: string, to: string) => [string, string?]> = {
  cancel: (from) => [tt("realestate:flow.operation.toast.cancel"), tt("realestate:flow.operation.toast.cancelHint", { number: from })],
  refund: (from) => [tt("realestate:flow.operation.toast.refund"), tt("realestate:flow.operation.toast.refundHint", { number: from })],
  exchange: (from, to) => [tt("realestate:flow.operation.toast.exchange"), `№${from} → №${to}`],
  note: () => [tt("realestate:flow.operation.toast.note")],
};

interface OperationForm {
  operation: UnitOperation;
  actor: string;
  buyer: string;
  target: string;
  comment: string;
}

export function OperationScreen({ unit, scope, go, onBack, onOpenUnit }: FlowProps) {
  const toast = useRealEstateToast();
  const { t } = useT("realestate");
  const run = useUnitCommand(scope, (input: Parameters<typeof runUnitOperation>[1]) => runUnitOperation(unit.id, input, scope));
  const { can } = useCanChecker();
  // Справочник сотрудников — только с staff.view: без права бэк ответит 403, ответственный вводится текстом.
  const canListStaff = REALESTATE_USE_MOCKS || can("staff.view");
  const managersData = useQuery({
    queryKey: realEstateKeys.managers(scope),
    queryFn: () => getSalesManagers(scope),
    staleTime: Infinity,
    enabled: canListStaff,
  }).data;
  const managers = React.useMemo(() => managersData ?? [], [managersData]);
  const projectUnits =
    useQuery({ queryKey: realEstateKeys.units(scope, unit.projectId), queryFn: () => getProjectUnits(unit.projectId, scope) }).data ?? [];
  const freeUnits = projectUnits.filter((u) => u.status === "free" && u.id !== unit.id).slice(0, 20);

  const options: [UnitOperation, string][] = [
    ...(unit.status === "reserved" ? [["cancel", t("flow.operation.cancel")] as [UnitOperation, string]] : []),
    ...(unit.status === "sold" ? [["refund", t("flow.operation.refund")] as [UnitOperation, string]] : []),
    ...(unit.status !== "free" ? [["exchange", t("flow.operation.exchange")] as [UnitOperation, string]] : []),
    ["note", t("flow.operation.note")],
  ];

  const { register, control, handleSubmit, formState, setValue, watch } = useForm<OperationForm>({
    defaultValues: {
      operation: options[0]![0],
      actor: "",
      buyer: unit.reservation?.buyer ?? unit.contract?.buyer ?? "",
      target: "",
      comment: "",
    },
  });
  // Список менеджеров приходит позже формы — первого подставляем, как селект прототипа.
  const actor = watch("actor");
  React.useEffect(() => {
    if (!actor && managers[0]) setValue("actor", managers[0].name);
  }, [actor, managers, setValue]);

  const submit = handleSubmit((form) => {
    run.mutate(
      {
        operation: form.operation,
        // Выбран из справочника — шлём и id сотрудника (у бэка он приоритетнее ФИО).
        actorId: managers.find((m) => m.name === form.actor)?.id || null,
        actor: form.actor.trim(),
        buyer: form.buyer.trim(),
        targetUnitId: form.target || null,
        comment: form.comment.trim(),
      },
      {
        onSuccess: (next) => {
          if (next.id !== unit.id) onOpenUnit(next.id);
          go("unit");
          toast(...operationToast[form.operation](unit.number, next.number));
        },
      },
    );
  });

  return (
    <Box>
      <FlowHead eyebrow={t("flow.operation.eyebrow")} title={t("card.title", { number: unit.number })} intro={t("flow.operation.intro")} />
      <form onSubmit={submit} noValidate>
        <Box sx={formGridSx}>
          <Controller
            control={control}
            name="operation"
            render={({ field }) => (
              <TextField select label={t("flow.operation.label")} {...field}>
                {options.map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          <Controller
            control={control}
            name="actor"
            render={({ field }) =>
              // Справочник сотрудников недоступен (нет права) — ответственный вводится текстом.
              managers.length ? (
                <TextField select label={t("flow.operation.actor")} {...field}>
                  {managers.map((manager) => (
                    <MenuItem key={manager.id || manager.name} value={manager.name}>
                      {manager.name}
                    </MenuItem>
                  ))}
                </TextField>
              ) : (
                <TextField label={t("flow.operation.actor")} placeholder={t("flow.operation.actorPlaceholder")} {...field} />
              )
            }
          />
          <TextField label={t("flow.buyer")} placeholder={t("flow.buyerName")} sx={wide} {...register("buyer")} />
          <Controller
            control={control}
            name="target"
            render={({ field }) => (
              <TextField select label={t("flow.operation.target")} sx={wide} {...field}>
                <MenuItem value="">{t("flow.operation.targetNone")}</MenuItem>
                {freeUnits.map((u) => (
                  <MenuItem key={u.id} value={u.id}>
                    №{u.number} · {unitType(u)} · {t("fmt.area", { value: num(u.totalArea) })} · {money(u.price)}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          <TextField
            label={t("flow.operation.comment")}
            placeholder={t("flow.operation.commentRequired")}
            multiline
            rows={3}
            sx={wide}
            {...register("comment", { required: t("flow.operation.commentRequired") })}
            error={Boolean(formState.errors.comment)}
            helperText={formState.errors.comment?.message}
          />
        </Box>
        <Actions>
          <Button variant="outlined" onClick={onBack}>
            {t("flow.cancel")}
          </Button>
          <AppButton variant="contained" type="submit" loading={run.isPending}>
            {t("flow.operation.submit")}
          </AppButton>
        </Actions>
      </form>
    </Box>
  );
}

// ─── Акция ─────────────────────────────────────────────────────────────────

export function OfferScreen({ project, unit, offer, onBack, go }: FlowProps) {
  const { t } = useT("realestate");
  const finalPrice = priceWithOffer(unit, offer);
  return (
    <Box>
      <Box
        sx={(t) => ({
          width: 52,
          height: 52,
          mb: 2,
          display: "grid",
          placeItems: "center",
          borderRadius: "14px",
          fontWeight: 800,
          bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.18 : 0.1),
          color: "primary.onSurface",
        })}
      >
        {offer.icon}
      </Box>
      <FlowHead eyebrow={t("flow.offer.eyebrow", { name: project.name })} title={offer.title} intro={offer.text} />
      <Box sx={(t) => ({ p: 2, borderRadius: "12px", border: `1px solid ${alpha(t.palette.primary.main, 0.35)}`, bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.12 : 0.06), display: "flex", flexDirection: "column", gap: 0.5 })}>
        <Typography component="span" sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
          {t("flow.offer.benefit")}
        </Typography>
        <Typography component="strong" sx={{ fontSize: "1.4rem", fontWeight: 700, color: "primary.onSurface" }}>
          {offer.discount ? money(offer.discount) : t("offer.noOverpay")}
        </Typography>
        <Typography component="small" sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
          {t("flow.offer.finalPrice", { number: unit.number, price: money(finalPrice) })}
        </Typography>
      </Box>
      <Summary
        items={[
          [t("flow.offer.validity"), offer.until],
          [t("flow.offer.audience"), t("flow.offer.audienceValue")],
          [t("flow.offer.lock"), t("flow.offer.lockValue")],
        ]}
      />
      <Actions>
        <Button variant="outlined" onClick={onBack}>
          {t("flow.backToUnit")}
        </Button>
        {unit.status === "free" && (
          <AppButton variant="contained" onClick={() => go("reserve")}>
            {t("flow.reserveFor", { price: money(finalPrice) })}
          </AppButton>
        )}
      </Actions>
    </Box>
  );
}

// ─── Договор ───────────────────────────────────────────────────────────────

interface ContractForm {
  buyer: string;
  passport: string;
  phone: string;
  email: string;
  payment: ContractPayment;
  signCode: string;
  accept: boolean;
}

export function ContractScreen({ project, unit, scope, onBack, go }: FlowProps) {
  const toast = useRealEstateToast();
  const { t } = useT("realestate");
  const sign = useMutation({
    mutationFn: (input: Parameters<typeof signUnitContract>[1]) => signUnitContract(unit.id, input, scope),
  });
  const queryClient = useQueryClient();
  // Договор заключается по цене брони (с акцией), без брони — по цене квартиры, как на бэке.
  const price = unit.reservation?.finalPrice || unit.price;
  const { down } = paymentPlan(price);
  const lead = useChessboardLead();
  const { register, control, handleSubmit, formState } = useForm<ContractForm>({
    defaultValues: {
      // Бронь важнее подбора: договор по брони — на её покупателя.
      buyer: unit.reservation?.buyer ?? lead?.client ?? "",
      passport: "",
      phone: unit.reservation?.phone ?? lead?.phone ?? "",
      email: "",
      payment: "installment",
      signCode: "",
      accept: false,
    },
  });

  const commandError = useCommandError();
  // 409 INVALID_STATE на брони — квартира забронирована на другого покупателя:
  // бэк продаёт только после явного подтверждения (`allowOtherBuyer: true`).
  const [otherBuyer, setOtherBuyer] = React.useState<{ input: ContractInput; message: string } | null>(null);

  const runSign = (input: ContractInput) =>
    sign.mutate(input, {
      onSuccess: (next) => {
        setOtherBuyer(null);
        queryClient.setQueryData(realEstateKeys.unit(scope, next.id), next);
        void queryClient.invalidateQueries({ queryKey: realEstateKeys.all });
        go("signed");
        toast(t("flow.contract.signedToast"), next.contract?.number);
      },
      onError: (error) => {
        setOtherBuyer(null);
        if (REALESTATE_USE_MOCKS && error instanceof Error && /код/i.test(error.message)) {
          toast(t("flow.contract.wrongCode"), t("flow.contract.wrongCodeHint"));
        } else if (getErrorCode(error) === "INVALID_STATE" && unit.status === "reserved" && !input.allowOtherBuyer) {
          setOtherBuyer({ input, message: errorMessage(error) });
        } else {
          commandError(error);
        }
      },
    });

  const submit = handleSubmit((form) => {
    const { buyer, passport, phone, email, payment, signCode } = form;
    const leadId = leadIdFor(lead, buyer, phone);
    runSign({ buyer, passport, phone, email, payment, signCode, ...(leadId != null ? { leadId } : {}) });
  });

  const required = (message: string) => ({ required: message });

  return (
    <Box>
      <FlowHead eyebrow={t("flow.contract.eyebrow")} title={t("flow.contract.title")} intro={t("flow.contract.intro", { name: project.name, number: unit.number })} />
      <Summary
        items={[
          [t("flow.contract.object"), `${unitType(unit)}, ${t("fmt.area", { value: num(unit.totalArea) })}`],
          [t("flow.contract.price"), money(price)],
          [t("flow.contract.downPayment"), money(down)],
          [t("card.completion"), completionOf(project, unit)],
          [t("flow.contract.seller"), project.sellerInfo || t("flow.contract.sellerMissing")],
        ]}
      />
      <form onSubmit={submit} noValidate>
        <Box sx={formGridSx}>
          <TextField
            label={t("flow.buyerName")}
            placeholder={t("flow.buyerPlaceholder")}
            sx={wide}
            {...register("buyer", required(t("flow.buyerRequired")))}
            error={Boolean(formState.errors.buyer)}
            helperText={formState.errors.buyer?.message}
          />
          <TextField
            label={t("flow.contract.passport")}
            placeholder="ID 1234567"
            {...register("passport", required(t("flow.contract.passportRequired")))}
            error={Boolean(formState.errors.passport)}
            helperText={formState.errors.passport?.message}
          />
          <PhoneController control={control} name="phone" label={t("flow.phone")} requiredMessage={t("flow.phoneRequired")} />
          <TextField
            label="Email"
            type="email"
            placeholder="client@example.com"
            {...register("email", { required: t("flow.contract.emailRequired"), pattern: { value: /^\S+@\S+\.\S+$/, message: t("flow.contract.emailInvalid") } })}
            error={Boolean(formState.errors.email)}
            helperText={formState.errors.email?.message}
          />
          <Controller
            control={control}
            name="payment"
            render={({ field }) => (
              <TextField select label={t("flow.contract.payment")} {...field}>
                {(Object.entries(CONTRACT_PAYMENT_LABELS) as [ContractPayment, string][]).map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          {/* SMS-подписания на бэке пока нет, код он не проверяет — поле только в демо на моках. */}
          {REALESTATE_USE_MOCKS && (
            <TextField
              label={t("flow.contract.signCode")}
              placeholder={t("flow.contract.signCodePlaceholder")}
              sx={wide}
              inputProps={{ inputMode: "numeric", maxLength: 4 }}
              {...register("signCode", { required: t("flow.contract.signCodeRequired"), pattern: { value: /^\d{4}$/, message: t("flow.contract.signCodeFormat") } })}
              error={Boolean(formState.errors.signCode)}
              helperText={formState.errors.signCode?.message}
            />
          )}
        </Box>
        <Controller
          control={control}
          name="accept"
          rules={{ validate: (v) => v || t("flow.contract.acceptRequired") }}
          render={({ field, fieldState }) => (
            <FormControlLabel
              sx={{ mt: 1.5, alignItems: "flex-start", color: fieldState.error ? "error.main" : "text.primary" }}
              control={<Checkbox checked={field.value} onChange={(e) => field.onChange(e.target.checked)} sx={{ p: 0.25, mr: 1 }} />}
              label={<Typography sx={{ fontSize: "0.8125rem" }}>{t("flow.contract.accept")}</Typography>}
            />
          )}
        />
        <Typography sx={{ mt: 1.5, fontSize: "0.75rem", color: "text.secondary" }}>
          {t("flow.contract.note")}
        </Typography>
        <Actions>
          <Button variant="outlined" onClick={onBack}>
            {t("flow.backToUnit")}
          </Button>
          <AppButton variant="contained" type="submit" loading={sign.isPending}>
            {t("actions.contract")}
          </AppButton>
        </Actions>
      </form>
      <ConfirmDialog
        open={otherBuyer !== null}
        variant="warning"
        title={t("flow.contract.otherBuyerTitle")}
        message={otherBuyer ? t("flow.contract.otherBuyerText", { message: otherBuyer.message, buyer: otherBuyer.input.buyer }) : ""}
        confirmText={t("flow.contract.otherBuyerConfirm")}
        cancelText={t("flow.cancel")}
        loading={sign.isPending}
        onClose={() => setOtherBuyer(null)}
        onConfirm={() => otherBuyer && runSign({ ...otherBuyer.input, allowOtherBuyer: true })}
      />
    </Box>
  );
}

export function SignedScreen({ project, unit, onBack }: FlowProps) {
  const { t } = useT("realestate");
  const c = unit.contract;
  return (
    <Box>
      <Box sx={successMarkSx}>
        <CheckOutlined />
      </Box>
      <FlowHead eyebrow={t("flow.contract.signedToast")} title={c?.number || t("flow.contract.title")} intro={t("flow.contract.signedIntro", { name: project.name, number: unit.number })} />
      <Summary
        items={[
          [t("flow.buyer"), c?.buyer || "—"],
          [t("flow.contract.price"), money(c?.price || unit.price)],
          [t("flow.contract.payment"), c?.payment || "—"],
          [t("flow.contract.signedAt"), c?.signedAt || "—"],
        ]}
      />
      <Actions>
        <Button variant="outlined" onClick={onBack}>
          {t("flow.unitCard")}
        </Button>
      </Actions>
    </Box>
  );
}
