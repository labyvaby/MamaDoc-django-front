import React from "react";
import {
  Alert,
  Box,
  Chip,
  Divider,
  Drawer,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import PersonSearchOutlined from "@mui/icons-material/PersonSearchOutlined";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";

import { AppButton, CustomDateTimePicker, PhoneCountryCodeSelect } from "../ui";
import { useT } from "../../i18n/VerticalProvider";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { useAllActiveEmployees } from "../../hooks/useAllActiveEmployees";
import { usePhoneLocalInput } from "../../hooks/usePhoneLocalInput";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import {
  composePhone,
  DEFAULT_PHONE_COUNTRY_CODE,
  formatPhoneLocalDisplay,
  phonePlaceholder,
  type PhoneCountryCode,
} from "../../utility/phone";
import { formatKGS } from "../../utility/format";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import {
  createDeal,
  getDealDuplicates,
  type CreateDealPayload,
  type Deal,
  type DealDictionaryItem,
  type DealStage,
} from "../../api/deals";
import { dealsErrorMessage } from "../../pages/deals/meta";

/** Порог, пока бэк не сказал свой: ручка отдаёт minDigits в ответе. */
const FALLBACK_MIN_DIGITS = 5;

type CreateDealDrawerProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (deal: Deal) => void;
  onError: (message: string) => void;
  /** Этапы выбранной воронки: заводить можно только в рабочий (won/lost — 400). */
  stages: DealStage[];
  sources: DealDictionaryItem[];
  pipelineId?: number;
  /** Колонка, из которой нажали «+ Обращение». */
  defaultStageId?: number;
};

/**
 * Заведение обращения.
 *
 * Дедуп по телефону — на бэке (`duplicates/`): он ищет по девяти значащим
 * цифрам и отдаёт разом похожие сделки и карты клиентов, поэтому кнопка
 * «привязать» не требует второго запроса. Порог цифр берём из ответа, а не
 * хардкодим.
 *
 * Позиции (услуги) здесь не заводим, хотя POST их принимает: пикер прайса
 * живёт в карточке сделки, где сумма и правится. Сумму можно задать вручную —
 * как только появится первая позиция, бэк начнёт считать её сам.
 */
const CreateDealDrawer: React.FC<CreateDealDrawerProps> = ({
  open,
  onClose,
  onCreated,
  onError,
  stages,
  sources,
  pipelineId,
  defaultStageId,
}) => {
  const { t } = useT("deals");
  const orgId = useApiOrgId();
  const { employees } = useAllActiveEmployees(open);
  const queryClient = useQueryClient();

  const [contactName, setContactName] = React.useState("");
  const [countryCode, setCountryCode] = React.useState<PhoneCountryCode>(DEFAULT_PHONE_COUNTRY_CODE);
  const [phoneLocal, setPhoneLocal] = React.useState("");
  const [sourceId, setSourceId] = React.useState<number | "">("");
  const [assigneeId, setAssigneeId] = React.useState<number | "">("");
  const [stageId, setStageId] = React.useState<number | "">("");
  const [amount, setAmount] = React.useState("");
  const [comment, setComment] = React.useState("");
  const [nextActionAt, setNextActionAt] = React.useState<Dayjs | null>(null);
  const [patient, setPatient] = React.useState<{ id: number; name: string } | null>(null);
  const [nameTouched, setNameTouched] = React.useState(false);

  const phoneInput = usePhoneLocalInput(countryCode, phoneLocal, setPhoneLocal, setCountryCode);

  const openStages = React.useMemo(() => stages.filter((s) => s.kind === "open" && s.isActive), [stages]);

  React.useEffect(() => {
    if (!open) return;
    setContactName("");
    setPhoneLocal("");
    setCountryCode(DEFAULT_PHONE_COUNTRY_CODE);
    setSourceId("");
    setAssigneeId("");
    setAmount("");
    setComment("");
    setNextActionAt(null);
    setPatient(null);
    setNameTouched(false);
    setStageId(defaultStageId ?? "");
  }, [open, defaultStageId]);

  const phone = composePhone(countryCode, phoneLocal);
  const debouncedPhone = useDebouncedValue(phone ?? "", 400);
  const digits = debouncedPhone.replace(/\D/g, "");

  const duplicatesQuery = useQuery({
    queryKey: djangoQueryKeys.deals.duplicates(debouncedPhone, orgId),
    queryFn: ({ signal }) => getDealDuplicates(debouncedPhone, orgId, signal),
    // Меньше порога бэк всё равно вернёт пустые списки — не дёргаем сеть зря.
    enabled: open && digits.length >= FALLBACK_MIN_DIGITS,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const duplicates = duplicatesQuery.data;
  const hasDuplicates =
    (duplicates?.deals.length ?? 0) > 0 || (duplicates?.patients.length ?? 0) > 0;

  const createMutation = useMutation({
    mutationFn: (payload: CreateDealPayload) => createDeal(payload, orgId),
    onSuccess: (deal) => {
      // Без сброса кэша карточка не появится в колонке до перезагрузки: доска
      // живёт в агрегате board/, а не в списке, куда её можно было бы дописать.
      void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.deals.all });
      onCreated(deal);
      onClose();
    },
    onError: (error) => onError(dealsErrorMessage(error, t("create.error"))),
  });

  const submit = () => {
    const name = contactName.trim();
    if (!name) {
      setNameTouched(true);
      return;
    }
    const payload: CreateDealPayload = { contactName: name };
    if (phone) payload.phone = phone;
    if (pipelineId != null) payload.pipelineId = pipelineId;
    if (stageId !== "") payload.stageId = stageId;
    if (sourceId !== "") payload.sourceId = sourceId;
    if (assigneeId !== "") payload.assigneeId = assigneeId;
    if (patient) payload.patientId = patient.id;
    if (comment.trim()) payload.comment = comment.trim();
    if (nextActionAt?.isValid()) payload.nextActionAt = nextActionAt.toISOString();
    // Сумма — строка-decimal: бэк не примет number, и запятую он тоже не поймёт.
    const normalizedAmount = amount.trim().replace(",", ".");
    if (normalizedAmount) payload.amount = normalizedAmount;
    createMutation.mutate(payload);
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={createMutation.isPending ? undefined : onClose}
      PaperProps={{ sx: { width: { xs: "100%", sm: 460 }, maxWidth: "100%" } }}
    >
      <Stack sx={{ height: "100%" }}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ px: 2, py: 1.5 }}
        >
          <Typography variant="subtitle1" fontWeight={600}>
            {t("create.title")}
          </Typography>
          <IconButton size="small" onClick={onClose} disabled={createMutation.isPending}>
            <CloseOutlined fontSize="small" />
          </IconButton>
        </Stack>
        <Divider />

        <Box sx={{ flex: 1, overflowY: "auto", px: 2, py: 2 }}>
          <Stack gap={2}>
            <TextField
              size="small"
              label={t("create.name")}
              placeholder={t("create.namePlaceholder")}
              value={contactName}
              onChange={(e) => {
                setContactName(e.target.value);
                setNameTouched(false);
              }}
              error={nameTouched && !contactName.trim()}
              helperText={nameTouched && !contactName.trim() ? t("create.nameRequired") : " "}
              autoFocus
              fullWidth
            />

            <Stack direction="row" spacing={1}>
              <PhoneCountryCodeSelect value={countryCode} onChange={setCountryCode} />
              <TextField
                size="small"
                label={t("create.phone")}
                value={formatPhoneLocalDisplay(countryCode, phoneLocal)}
                onChange={phoneInput.onChange}
                onKeyDown={phoneInput.onKeyDown}
                inputRef={phoneInput.inputRef}
                placeholder={phonePlaceholder(countryCode)}
                fullWidth
              />
            </Stack>

            {patient ? (
              <Alert
                severity="success"
                variant="outlined"
                icon={<PersonSearchOutlined fontSize="small" />}
                action={
                  <AppButton size="small" variant="text" onClick={() => setPatient(null)}>
                    {t("create.unlinkPatient")}
                  </AppButton>
                }
              >
                {t("create.linkedPatient", { name: patient.name })}
              </Alert>
            ) : hasDuplicates ? (
              <Alert severity="info" variant="outlined" sx={{ "& .MuiAlert-message": { width: "100%" } }}>
                <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                  {t("create.duplicatesTitle")}
                </Typography>

                {(duplicates?.patients.length ?? 0) > 0 ? (
                  <Stack gap={0.5} sx={{ mb: (duplicates?.deals.length ?? 0) > 0 ? 1 : 0 }}>
                    <Typography variant="caption" color="text.secondary">
                      {t("create.duplicatePatients")}
                    </Typography>
                    {duplicates?.patients.map((p) => (
                      <Stack key={p.id} direction="row" alignItems="center" gap={1}>
                        <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                          {p.fullName}
                        </Typography>
                        <AppButton
                          size="small"
                          variant="text"
                          onClick={() => {
                            setPatient({ id: p.id, name: p.fullName });
                            if (!contactName.trim()) setContactName(p.fullName);
                          }}
                        >
                          {t("create.linkPatient")}
                        </AppButton>
                      </Stack>
                    ))}
                  </Stack>
                ) : null}

                {(duplicates?.deals.length ?? 0) > 0 ? (
                  <Stack gap={0.5}>
                    <Typography variant="caption" color="text.secondary">
                      {t("create.duplicateDeals")}
                    </Typography>
                    {duplicates?.deals.map((d) => (
                      <Stack key={d.id} direction="row" alignItems="center" gap={1}>
                        <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                          {d.contactName}
                        </Typography>
                        <Chip size="small" label={d.stageName} variant="outlined" />
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {formatKGS(d.amount)}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                ) : null}
              </Alert>
            ) : null}

            <TextField
              select
              size="small"
              label={t("create.source")}
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value === "" ? "" : Number(e.target.value))}
              fullWidth
            >
              <MenuItem value="">—</MenuItem>
              {sources
                .filter((s) => s.isActive)
                .map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.name}
                  </MenuItem>
                ))}
            </TextField>

            <TextField
              select
              size="small"
              label={t("create.stage")}
              value={stageId}
              onChange={(e) => setStageId(e.target.value === "" ? "" : Number(e.target.value))}
              fullWidth
              helperText=" "
            >
              <MenuItem value="">—</MenuItem>
              {openStages.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.name}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              size="small"
              label={t("create.assignee")}
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value === "" ? "" : Number(e.target.value))}
              fullWidth
            >
              <MenuItem value="">—</MenuItem>
              {employees.map((e) => (
                <MenuItem key={e.id} value={e.id}>
                  {e.fullName}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              size="small"
              label={t("detail.amount")}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputProps={{ inputMode: "decimal" }}
              fullWidth
            />

            <CustomDateTimePicker
              label={t("create.nextAction")}
              value={nextActionAt}
              onChange={setNextActionAt}
              minDateTime={dayjs().startOf("day")}
            />

            <TextField
              size="small"
              label={t("create.comment")}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              multiline
              minRows={2}
              fullWidth
            />
          </Stack>
        </Box>

        <Divider />
        <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ px: 2, py: 1.5 }}>
          <AppButton variant="text" onClick={onClose} disabled={createMutation.isPending}>
            Отмена
          </AppButton>
          <AppButton onClick={submit} loading={createMutation.isPending}>
            {t("create.submit")}
          </AppButton>
        </Stack>
      </Stack>
    </Drawer>
  );
};

export default CreateDealDrawer;
