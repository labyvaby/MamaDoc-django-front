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
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import dayjs, { type Dayjs } from "dayjs";

import {
  CONTRACT_PAYMENT_LABELS,
  REALESTATE_USE_MOCKS,
  confirmUnitPrepayment,
  getProjectUnits,
  getSalesManagers,
  realEstateKeys,
  reserveUnit,
  runUnitOperation,
  scheduleUnitMeeting,
  sendUnitProposal,
  signUnitContract,
  type ContractPayment,
  type Project,
  type ReservationTerm,
  type ReservationType,
  type UnitDetails,
  type UnitOffer,
  type UnitOperation,
} from "../../../../api/realestate";
import { AppButton, CustomDateTimePicker } from "../../../../components/ui";
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
import { eyebrowSx } from "../tones";
import { useRealEstateToast } from "../toast";

export type Screen =
  | "unit"
  | "reserve"
  | "payment"
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
  /** Суперпользователю бэк без него отвечает 400. */
  organizationId: number | undefined;
  /** realty.manage — команды над квартирой. */
  canManage: boolean;
  onBack: () => void;
  onClose: () => void;
  go: (screen: Screen) => void;
  onOpenUnit: (unitId: string) => void;
}

const PREPAYMENT = 50_000;

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "Не удалось выполнить операцию");

/** Демо-время встречи: завтра в 11:00. */
const tomorrowAt11 = () => dayjs().add(1, "day").hour(11).minute(0).second(0).millisecond(0);

/**
 * Команда над квартирой: ответ — свежая карточка. Шахматка и соседние карточки
 * перезапрашиваются, потому что меняются статусы.
 */
function useUnitCommand<Input>(run: (input: Input) => Promise<UnitDetails>) {
  const queryClient = useQueryClient();
  const toast = useRealEstateToast();
  return useMutation({
    mutationFn: run,
    onSuccess: (next) => {
      queryClient.setQueryData(realEstateKeys.unit(next.id), next);
      void queryClient.invalidateQueries({ queryKey: realEstateKeys.all });
    },
    onError: (error) => toast(errorMessage(error)),
  });
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

const formGridSx = { display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 } as const;
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

export function ReserveScreen({ project, unit, offer, organizationId, onBack, go }: FlowProps) {
  const toast = useRealEstateToast();
  const reserve = useUnitCommand((input: Parameters<typeof reserveUnit>[1]) => reserveUnit(unit.id, input, organizationId));
  const finalPrice = priceWithOffer(unit, offer);
  const { register, control, handleSubmit, watch, formState } = useForm<ReserveForm>({
    defaultValues: { buyer: "", phone: "", term: "48", type: "free", withMeeting: true, meetingAt: tomorrowAt11() },
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
      },
      {
        onSuccess: (next) => {
          go(next.reservation?.paymentStatus === "pending" ? "payment" : "success");
          toast("Бронь создана", form.withMeeting ? "задача «Встреча» добавлена" : `до ${next.reservation?.expiresAt ?? ""}`);
        },
      },
    );
  });

  return (
    <Box>
      <FlowHead eyebrow="Бронирование квартиры" title={`Квартира №${unit.number}`} intro={`ЖК «${project.name}» · ${unitType(unit)} · ${num(unit.totalArea)} м²`} />
      <Box
        sx={(t) => ({
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1.5fr 0.8fr 1fr" },
          gap: 1.25,
          mb: 2,
          p: 1.6,
          borderRadius: "12px",
          border: `1px solid ${alpha(t.palette.primary.main, 0.35)}`,
          bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.12 : 0.06),
        })}
      >
        <OfferCell label="Выбранная акция" value={offer.title} hint={offer.until} />
        <OfferCell label="Скидка" value={offerDiscountLabel(offer)} />
        <OfferCell label="Цена по акции" value={money(finalPrice)} strong />
      </Box>
      <form onSubmit={submit} noValidate>
        <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
          {["Покупатель", "Тип брони", "Встреча"].map((step, i) => (
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
            label="ФИО покупателя"
            placeholder="Например, Айжан Исакова"
            sx={wide}
            {...register("buyer", { required: "Укажите ФИО покупателя", validate: (v) => v.trim() !== "" || "Укажите ФИО покупателя" })}
            error={Boolean(formState.errors.buyer)}
            helperText={formState.errors.buyer?.message}
          />
          <TextField
            label="Номер телефона"
            type="tel"
            placeholder="+996 555 000 000"
            {...register("phone", { required: "Укажите телефон" })}
            error={Boolean(formState.errors.phone)}
            helperText={formState.errors.phone?.message}
          />
          <Controller
            control={control}
            name="term"
            render={({ field }) => (
              <TextField select label="Срок брони" {...field}>
                <MenuItem value="24">24 часа</MenuItem>
                <MenuItem value="48">48 часов</MenuItem>
                <MenuItem value="72">72 часа</MenuItem>
              </TextField>
            )}
          />
        </Box>
        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <Box role="radiogroup" aria-label="Тип брони" sx={{ mt: 1.5, display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.25 }}>
              {(
                [
                  ["free", "○", "Бесплатная бронь", "Без оплаты · квартира закрепляется на 48 часов"],
                  ["prepaid", "₽", "Бронь с предоплатой", `${money(PREPAYMENT)} · оплата по QR после сохранения`],
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
              Предоплата {money(PREPAYMENT)}
            </Typography>
            <Typography component="span" sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
              Сумма учитывается в стоимости квартиры. После сохранения появится QR-код.
            </Typography>
          </Box>
        )}
        <Controller
          control={control}
          name="withMeeting"
          render={({ field }) => (
            <OptionCheckbox checked={field.value} onChange={field.onChange} title="Поставить задачу «Встреча»" hint="Менеджеру будет добавлена задача в план дня" />
          )}
        />
        {withMeeting && (
          <Box sx={{ mt: 1.5 }}>
            <Controller
              control={control}
              name="meetingAt"
              render={({ field }) => (
                <CustomDateTimePicker label="Дата и время встречи" value={field.value} onChange={(v) => field.onChange(v as Dayjs | null)} slotProps={{ textField: { fullWidth: true } }} />
              )}
            />
          </Box>
        )}
        <Actions>
          <Button variant="outlined" onClick={onBack}>
            Отмена
          </Button>
          <AppButton variant="contained" type="submit" loading={reserve.isPending}>
            Забронировать за {money(finalPrice)}
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

/** Демонстрационный QR 13×13 из прототипа. */
function DemoQr() {
  return (
    <Box
      aria-label="Демонстрационный QR-код"
      sx={{ display: "grid", gridTemplateColumns: "repeat(13, 1fr)", gap: "2px", width: 196, height: 196, p: 1.5, borderRadius: "12px", border: 1, borderColor: "divider", bgcolor: "common.white" }}
    >
      {Array.from({ length: 169 }, (_, index) => {
        const row = Math.floor(index / 13);
        const col = index % 13;
        const finder = (row < 4 && col < 4) || (row < 4 && col > 8) || (row > 8 && col < 4);
        const filled = finder || (row * 7 + col * 5 + row * col) % 11 < 5;
        return <Box key={index} component="i" sx={{ borderRadius: "1px", bgcolor: filled ? "common.black" : "transparent" }} />;
      })}
    </Box>
  );
}

export function PaymentScreen({ project, unit, organizationId, onBack, go }: FlowProps) {
  const toast = useRealEstateToast();
  const confirm = useUnitCommand(() => confirmUnitPrepayment(unit, organizationId));
  const amount = unit.reservation?.amount || PREPAYMENT;
  return (
    <Box>
      <FlowHead eyebrow="Предоплата за бронирование" title={`Оплатите ${money(amount)}`} intro={`ЖК «${project.name}» · квартира №${unit.number}`} />
      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 3 }}>
        <DemoQr />
        <Box sx={{ display: "grid", gap: 0.5, "& span": { fontSize: "0.72rem", color: "text.secondary" }, "& b": { fontSize: "0.875rem", fontWeight: 600, mb: 0.75 } }}>
          <span>Назначение платежа</span>
          <b>Бронь квартиры №{unit.number}</b>
          <span>Покупатель</span>
          <b>{unit.reservation?.buyer || "—"}</b>
          <span>Срок QR-кода</span>
          <b>15 минут</b>
          <Typography component="small" sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
            Демонстрационный QR: реального списания не происходит.
          </Typography>
        </Box>
      </Box>
      <Actions>
        <Button variant="outlined" onClick={onBack}>
          Оплатить позже
        </Button>
        <AppButton
          variant="contained"
          startIcon={<CheckOutlined />}
          loading={confirm.isPending}
          onClick={() =>
            confirm.mutate(undefined, {
              onSuccess: () => {
                go("success");
                toast("Предоплата принята", money(amount));
              },
            })
          }
        >
          Я оплатил
        </AppButton>
      </Actions>
    </Box>
  );
}

export function SuccessScreen({ unit, onBack, go }: FlowProps) {
  const r = unit.reservation;
  const hasMeeting = unit.history.some((e) => e.type === "meeting");
  return (
    <Box>
      <Box sx={successMarkSx}>
        <CheckOutlined />
      </Box>
      <FlowHead eyebrow="Квартира забронирована" title={`№${unit.number} закреплена за покупателем`} intro={`${r?.buyer || "Покупатель"} · ${r?.phone ?? ""}`} />
      <Summary
        items={[
          ["Тип брони", r?.type === "prepaid" ? "С предоплатой" : "Бесплатная"],
          ["Срок", `${r?.termHours ?? 48} часов`],
          ["Оплата", r?.type === "prepaid" ? (r.paymentStatus === "paid" ? "Оплачено" : "Ожидается") : "Не требуется"],
          ["Задача", hasMeeting ? "Встреча создана" : "Не создавалась"],
        ]}
      />
      <Actions>
        <Button variant="outlined" onClick={onBack}>
          Карточка квартиры
        </Button>
        <AppButton variant="contained" onClick={() => go("proposal")}>
          Отправить КП в WhatsApp
        </AppButton>
      </Actions>
    </Box>
  );
}

// ─── КП, встреча ───────────────────────────────────────────────────────────

export function ProposalScreen({ project, unit, offer, organizationId, onBack, onClose }: FlowProps) {
  const toast = useRealEstateToast();
  const send = useUnitCommand((input: Parameters<typeof sendUnitProposal>[1]) => sendUnitProposal(unit.id, input, organizationId));
  const finalPrice = priceWithOffer(unit, offer);
  const perMeter = money(Math.round(finalPrice / unit.totalArea));
  const { register, control, handleSubmit, formState } = useForm<{ phone: string; includePlan: boolean }>({
    defaultValues: { phone: unit.reservation?.phone ?? "", includePlan: true },
  });

  const submit = handleSubmit(({ phone, includePlan }) => {
    const message = [
      "Коммерческое предложение",
      "",
      `ЖК «${project.name}»`,
      `Квартира №${unit.number}: ${unitType(unit)}, ${num(unit.totalArea)} м²`,
      `${unit.floor} этаж, секция ${unit.section}`,
      `${unit.orientation}, ${unit.view}`,
      `Потолки ${num(unit.ceilingHeight)} м, отделка ${project.finish}`,
      `Базовая цена: ${money(unit.price)}`,
      `Акция: ${offer.title}`,
      `Скидка: ${offer.discount ? money(offer.discount) : "0% переплаты"}`,
      `Цена по акции: ${money(finalPrice)} (${perMeter} / м²)`,
      ...(includePlan ? ["", "Планировка и схема этажа включены в предложение."] : []),
    ].join("\n");

    send.mutate(
      { phone: phone.trim(), includePlan, offerId: offer.id },
      {
        onSuccess: () => {
          window.open(`https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
          onClose();
          toast("КП подготовлено в WhatsApp", `квартира №${unit.number} · ${phone}`);
        },
      },
    );
  });

  return (
    <Box>
      <FlowHead eyebrow="Персональное коммерческое предложение" title={`Квартира №${unit.number}`} intro="Готовое КП для отправки покупателю в WhatsApp" />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "240px 1fr" }, gap: 2, p: 1.5, mb: 2, borderRadius: "14px", border: 1, borderColor: "divider" }}>
        <Box component="img" decoding="async" src="/realestate/renders/living-room.jpg" alt="Интерьер квартиры" sx={{ width: "100%", height: 200, objectFit: "cover", borderRadius: "10px" }} />
        <Box>
          <Typography component="span" sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
            ЖК «{project.name}»
          </Typography>
          <Typography component="h3" sx={{ m: 0, mt: 0.5, fontSize: "1.05rem", fontWeight: 700 }}>
            {unitType(unit)} · {num(unit.totalArea)} м²
          </Typography>
          <Typography component="strong" sx={{ display: "block", mt: 1, fontSize: "1.2rem", fontWeight: 700, color: "primary.onSurface" }}>
            {money(finalPrice)}
          </Typography>
          <Typography component="small" sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
            {offer.discount ? `Скидка ${money(offer.discount)} · ` : ""}
            {perMeter} / м²
          </Typography>
          <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.25, fontSize: "0.78rem", display: "grid", gap: 0.25 }}>
            <li>
              {unit.floor} этаж, секция {unit.section}
            </li>
            <li>
              {unit.orientation} · {unit.view}
            </li>
            <li>
              Потолки {num(unit.ceilingHeight)} м · {project.finish}
            </li>
            <li>{terraceLabel(unit) || balconyLabel(unit) || "Рациональная планировка"}</li>
          </Box>
          <Typography component="em" sx={{ display: "block", mt: 1, fontSize: "0.75rem", fontStyle: "normal", fontWeight: 600, color: "primary.onSurface" }}>
            ★ {offer.title}
          </Typography>
        </Box>
      </Box>
      <form onSubmit={submit} noValidate>
        <TextField
          fullWidth
          label="WhatsApp покупателя"
          type="tel"
          placeholder="+996 555 000 000"
          {...register("phone", { required: "Укажите номер WhatsApp" })}
          error={Boolean(formState.errors.phone)}
          helperText={formState.errors.phone?.message}
        />
        <Controller
          control={control}
          name="includePlan"
          render={({ field }) => (
            <OptionCheckbox checked={field.value} onChange={field.onChange} title="Приложить планировку и схему этажа" hint="Покупатель получит карточку именно этой квартиры" />
          )}
        />
        <Actions>
          <Button variant="outlined" onClick={onBack}>
            Назад
          </Button>
          <AppButton variant="contained" type="submit" loading={send.isPending}>
            Отправить в WhatsApp
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

export function MeetingScreen({ project, unit, organizationId, onBack, onClose }: FlowProps) {
  const toast = useRealEstateToast();
  const schedule = useUnitCommand((input: Parameters<typeof scheduleUnitMeeting>[1]) => scheduleUnitMeeting(unit.id, input, organizationId));
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
          toast("Задача «Встреча» создана", `${meetingAt.format("HH:mm")} · квартира №${unit.number}`);
        },
      },
    );
  });

  return (
    <Box>
      <FlowHead eyebrow="Новая задача" title={`Встреча по квартире №${unit.number}`} intro={`ЖК «${project.name}» · ${unitType(unit)} · ${num(unit.totalArea)} м²`} />
      <form onSubmit={submit} noValidate>
        <Box sx={formGridSx}>
          <TextField
            label="ФИО покупателя"
            placeholder="Имя покупателя"
            sx={wide}
            {...register("buyer", { required: "Укажите ФИО покупателя" })}
            error={Boolean(formState.errors.buyer)}
            helperText={formState.errors.buyer?.message}
          />
          <TextField
            label="Телефон"
            type="tel"
            placeholder="+996 555 000 000"
            {...register("phone", { required: "Укажите телефон" })}
            error={Boolean(formState.errors.phone)}
            helperText={formState.errors.phone?.message}
          />
          <Controller
            control={control}
            name="meetingAt"
            rules={{ required: "Укажите дату и время" }}
            render={({ field, fieldState }) => (
              <CustomDateTimePicker
                label="Дата и время"
                value={field.value}
                onChange={(v) => field.onChange(v as Dayjs | null)}
                slotProps={{ textField: { fullWidth: true, error: Boolean(fieldState.error), helperText: fieldState.error?.message } }}
              />
            )}
          />
          <TextField label="Комментарий" placeholder="Показ квартиры, обсуждение рассрочки" multiline rows={3} sx={wide} {...register("note")} />
        </Box>
        <Actions>
          <Button variant="outlined" onClick={onBack}>
            Отмена
          </Button>
          <AppButton variant="contained" type="submit" loading={schedule.isPending}>
            Поставить задачу
          </AppButton>
        </Actions>
      </form>
    </Box>
  );
}

// ─── Операции ──────────────────────────────────────────────────────────────

const operationToast: Record<UnitOperation, (from: string, to: string) => [string, string?]> = {
  cancel: (from) => ["Бронь снята", `квартира №${from} снова доступна`],
  refund: (from) => ["Возврат оформлен", `квартира №${from} возвращена в продажу`],
  exchange: (from, to) => ["Обмен оформлен", `№${from} → №${to}`],
  note: () => ["Запись добавлена в историю"],
};

interface OperationForm {
  operation: UnitOperation;
  actor: string;
  buyer: string;
  target: string;
  comment: string;
}

export function OperationScreen({ unit, organizationId, go, onBack, onOpenUnit }: FlowProps) {
  const toast = useRealEstateToast();
  const run = useUnitCommand((input: Parameters<typeof runUnitOperation>[1]) => runUnitOperation(unit.id, input, organizationId));
  const managersData = useQuery({
    queryKey: realEstateKeys.managers(),
    queryFn: () => getSalesManagers(organizationId),
    staleTime: Infinity,
  }).data;
  const managers = React.useMemo(() => managersData ?? [], [managersData]);
  const projectUnits =
    useQuery({ queryKey: realEstateKeys.units(unit.projectId), queryFn: () => getProjectUnits(unit.projectId, organizationId) }).data ?? [];
  const freeUnits = projectUnits.filter((u) => u.status === "free" && u.id !== unit.id).slice(0, 20);

  const options: [UnitOperation, string][] = [
    ...(unit.status === "reserved" ? [["cancel", "Снять бронь"] as [UnitOperation, string]] : []),
    ...(unit.status === "sold" ? [["refund", "Оформить возврат"] as [UnitOperation, string]] : []),
    ...(unit.status !== "free" ? [["exchange", "Обменять квартиру"] as [UnitOperation, string]] : []),
    ["note", "Добавить служебную запись"],
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
      <FlowHead eyebrow="Операция по квартире" title={`Квартира №${unit.number}`} intro="Все изменения попадут в историю с именем ответственного." />
      <form onSubmit={submit} noValidate>
        <Box sx={formGridSx}>
          <Controller
            control={control}
            name="operation"
            render={({ field }) => (
              <TextField select label="Операция" {...field}>
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
                <TextField select label="Ответственный" {...field}>
                  {managers.map((manager) => (
                    <MenuItem key={manager.id || manager.name} value={manager.name}>
                      {manager.name}
                    </MenuItem>
                  ))}
                </TextField>
              ) : (
                <TextField label="Ответственный" placeholder="ФИО менеджера" {...field} />
              )
            }
          />
          <TextField label="Покупатель" placeholder="ФИО покупателя" sx={wide} {...register("buyer")} />
          <Controller
            control={control}
            name="target"
            render={({ field }) => (
              <TextField select label="Квартира для обмена" sx={wide} {...field}>
                <MenuItem value="">Не выбрана</MenuItem>
                {freeUnits.map((u) => (
                  <MenuItem key={u.id} value={u.id}>
                    №{u.number} · {unitType(u)} · {num(u.totalArea)} м² · {money(u.price)}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          <TextField
            label="Причина / комментарий"
            placeholder="Укажите причину операции"
            multiline
            rows={3}
            sx={wide}
            {...register("comment", { required: "Укажите причину операции" })}
            error={Boolean(formState.errors.comment)}
            helperText={formState.errors.comment?.message}
          />
        </Box>
        <Actions>
          <Button variant="outlined" onClick={onBack}>
            Отмена
          </Button>
          <AppButton variant="contained" type="submit" loading={run.isPending}>
            Провести операцию
          </AppButton>
        </Actions>
      </form>
    </Box>
  );
}

// ─── Акция ─────────────────────────────────────────────────────────────────

export function OfferScreen({ project, unit, offer, onBack, go }: FlowProps) {
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
      <FlowHead eyebrow={`Акция ЖК «${project.name}»`} title={offer.title} intro={offer.text} />
      <Box sx={(t) => ({ p: 2, borderRadius: "12px", border: `1px solid ${alpha(t.palette.primary.main, 0.35)}`, bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.12 : 0.06), display: "flex", flexDirection: "column", gap: 0.5 })}>
        <Typography component="span" sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
          Ваша выгода
        </Typography>
        <Typography component="strong" sx={{ fontSize: "1.4rem", fontWeight: 700, color: "primary.onSurface" }}>
          {offer.discount ? money(offer.discount) : "0% переплаты"}
        </Typography>
        <Typography component="small" sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
          Итоговая цена квартиры №{unit.number}: {money(finalPrice)}
        </Typography>
      </Box>
      <Summary
        items={[
          ["Срок действия", offer.until],
          ["Кому доступно", "Покупателям свободных квартир"],
          ["Фиксация условий", "После бронирования"],
        ]}
      />
      <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
        Предложение демонстрационное. Точные условия менеджер подтвердит перед бронированием.
      </Typography>
      <Actions>
        <Button variant="outlined" onClick={onBack}>
          Назад к квартире
        </Button>
        {unit.status === "free" && (
          <AppButton variant="contained" onClick={() => go("reserve")}>
            Забронировать за {money(finalPrice)}
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

export function ContractScreen({ project, unit, organizationId, onBack, go }: FlowProps) {
  const toast = useRealEstateToast();
  const sign = useMutation({
    mutationFn: (input: Parameters<typeof signUnitContract>[1]) => signUnitContract(unit.id, input, organizationId),
  });
  const queryClient = useQueryClient();
  const contractNo = `ДКП-${new Date().getFullYear()}-${unit.number}`;
  const { down } = paymentPlan(unit.price);
  const { register, control, handleSubmit, formState } = useForm<ContractForm>({
    defaultValues: {
      buyer: unit.reservation?.buyer ?? "",
      passport: "",
      phone: unit.reservation?.phone ?? "",
      email: "",
      payment: "installment",
      signCode: "",
      accept: false,
    },
  });

  const submit = handleSubmit((form) => {
    const { buyer, passport, phone, email, payment, signCode } = form;
    sign.mutate({ buyer, passport, phone, email, payment, signCode }, {
      onSuccess: (next) => {
        queryClient.setQueryData(realEstateKeys.unit(next.id), next);
        void queryClient.invalidateQueries({ queryKey: realEstateKeys.all });
        go("signed");
        toast("Договор подписан", next.contract?.number);
      },
      onError: (error) =>
        error instanceof Error && /код/i.test(error.message) ? toast("Неверный код", "для демо используйте 4826") : toast(errorMessage(error)),
    });
  });

  const required = (message: string) => ({ required: message });

  return (
    <Box>
      <FlowHead eyebrow="Электронное подписание · демо" title="Договор купли-продажи" intro={`${contractNo} · ЖК «${project.name}», квартира №${unit.number}`} />
      <Summary
        items={[
          ["Объект", `${unitType(unit)}, ${num(unit.totalArea)} м²`],
          ["Стоимость", money(unit.price)],
          ["Первый взнос", money(down)],
          ["Срок сдачи", project.completionLabel],
        ]}
      />
      <form onSubmit={submit} noValidate>
        <Box sx={formGridSx}>
          <TextField
            label="ФИО покупателя"
            placeholder="Например, Айжан Исакова"
            sx={wide}
            {...register("buyer", required("Укажите ФИО покупателя"))}
            error={Boolean(formState.errors.buyer)}
            helperText={formState.errors.buyer?.message}
          />
          <TextField
            label="ПИН / паспорт"
            placeholder="ID 1234567"
            {...register("passport", required("Укажите ПИН или паспорт"))}
            error={Boolean(formState.errors.passport)}
            helperText={formState.errors.passport?.message}
          />
          <TextField
            label="Телефон"
            type="tel"
            placeholder="+996 555 000 000"
            {...register("phone", required("Укажите телефон"))}
            error={Boolean(formState.errors.phone)}
            helperText={formState.errors.phone?.message}
          />
          <TextField
            label="Email"
            type="email"
            placeholder="client@example.com"
            {...register("email", { required: "Укажите email", pattern: { value: /^\S+@\S+\.\S+$/, message: "Проверьте email" } })}
            error={Boolean(formState.errors.email)}
            helperText={formState.errors.email?.message}
          />
          <Controller
            control={control}
            name="payment"
            render={({ field }) => (
              <TextField select label="Способ оплаты" {...field}>
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
              label="Код электронной подписи"
              placeholder="Демо-код: 4826"
              sx={wide}
              inputProps={{ inputMode: "numeric", maxLength: 4 }}
              {...register("signCode", { required: "Введите код подписи", pattern: { value: /^\d{4}$/, message: "Код — 4 цифры" } })}
              error={Boolean(formState.errors.signCode)}
              helperText={formState.errors.signCode?.message}
            />
          )}
        </Box>
        <Controller
          control={control}
          name="accept"
          rules={{ validate: (v) => v || "Подтвердите согласие" }}
          render={({ field, fieldState }) => (
            <FormControlLabel
              sx={{ mt: 1.5, alignItems: "flex-start", color: fieldState.error ? "error.main" : "text.primary" }}
              control={<Checkbox checked={field.value} onChange={(e) => field.onChange(e.target.checked)} sx={{ p: 0.25, mr: 1 }} />}
              label={<Typography sx={{ fontSize: "0.8125rem" }}>Подтверждаю ознакомление с условиями договора и согласие на электронное подписание.</Typography>}
            />
          )}
        />
        <Box sx={(t) => ({ mt: 1.5, p: 1.5, borderRadius: "10px", border: 1, borderColor: "divider", bgcolor: subtleBg(t), display: "flex", flexDirection: "column", gap: 0.25 })}>
          <Typography component="b" sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
            К подписанию подготовлен документ {contractNo}
          </Typography>
          <Typography component="span" sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
            Продавец: ОсОО «AIVIO Development» · Покупатель будет указан после подписания
          </Typography>
        </Box>
        <Actions>
          <Button variant="outlined" onClick={onBack}>
            Назад к квартире
          </Button>
          <AppButton variant="contained" type="submit" loading={sign.isPending}>
            Подписать договор
          </AppButton>
        </Actions>
      </form>
    </Box>
  );
}

export function SignedScreen({ project, unit, onBack }: FlowProps) {
  const toast = useRealEstateToast();
  const c = unit.contract;
  return (
    <Box>
      <Box sx={successMarkSx}>
        <CheckOutlined />
      </Box>
      <FlowHead eyebrow="Подписано электронной подписью" title={c?.number ?? `ДКП-${new Date().getFullYear()}-${unit.number}`} intro={`ЖК «${project.name}» · квартира №${unit.number}`} />
      <Summary
        items={[
          ["Покупатель", c?.buyer ?? "Покупатель"],
          ["Стоимость", money(unit.price)],
          ["Способ оплаты", c?.payment ?? "По договору"],
          ["Дата подписания", c?.signedAt ?? "Сегодня"],
        ]}
      />
      <Box sx={(t) => ({ p: 1.5, borderRadius: "10px", border: `1px dashed ${alpha(t.palette.success.main, 0.6)}`, bgcolor: alpha(t.palette.success.main, t.palette.mode === "dark" ? 0.12 : 0.06), display: "flex", flexDirection: "column", gap: 0.25 })}>
        <Typography component="b" sx={{ fontSize: "0.8125rem", fontWeight: 600, color: "success.onSurface" }}>
          Электронная подпись подтверждена
        </Typography>
        <Typography component="span" sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
          Идентификатор: AIVIO-{unit.id.toUpperCase()}-{unit.number.slice(-3)}
        </Typography>
      </Box>
      <Actions>
        <Button variant="outlined" onClick={onBack}>
          Карточка квартиры
        </Button>
        <AppButton variant="contained" startIcon={<FileDownloadOutlined />} onClick={() => toast("Договор подготовлен", "демо PDF с электронной подписью")}>
          Скачать договор
        </AppButton>
      </Actions>
    </Box>
  );
}
