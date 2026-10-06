import React from "react";
import { Alert, Box, Button, Drawer, IconButton, MenuItem, TextField, Typography } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { Controller, useForm, type Control, type FieldValues, type Path } from "react-hook-form";
import dayjs, { type Dayjs } from "dayjs";
import CloseOutlined from "@mui/icons-material/CloseOutlined";

import {
  PROMOTION_CODE_RE,
  PROMOTION_KINDS,
  PROMOTION_TONES,
  createPromotion,
  createSection,
  createUnitLayout,
  updateCatalogProject,
  updatePromotion,
  updateSection,
  updateUnitLayout,
  type CatalogProject,
  type CatalogSection,
  type ProjectPatch,
  type Promotion,
  type PromotionKind,
  type PromotionTone,
  type UnitLayout,
} from "../../api/realtyCatalog";
import { CustomDatePicker } from "../../components/ui";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { amountText, isoDate, parseAmount, projectForm, projectPatch, type ProjectForm } from "./catalogFormat";

/** Оболочка формы каталога: шапка, прокручиваемые поля, «Отмена / Сохранить». */
function FormDrawer({
  open,
  title,
  busy,
  error,
  submitLabel,
  onClose,
  onSubmit,
  children,
}: {
  open: boolean;
  title: string;
  busy: boolean;
  error: unknown;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  children: React.ReactNode;
}) {
  const { t } = useT("realtySales");
  const id = React.useId();
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={busy ? undefined : onClose}
      PaperProps={{ sx: { width: { xs: "100vw", sm: 480 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}
    >
      <Box sx={{ px: 2.5, py: 2, display: "flex", alignItems: "center", borderBottom: 1, borderColor: "divider" }}>
        <Typography component="h2" sx={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: "1.1rem" }}>
          {title}
        </Typography>
        <IconButton aria-label={t("common.close")} onClick={onClose} disabled={busy}>
          <CloseOutlined />
        </IconButton>
      </Box>
      <Box component="form" id={id} noValidate onSubmit={onSubmit} sx={{ flex: 1, overflowY: "auto", p: 2.5, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 2, alignContent: "start" }}>
        {children}
        {Boolean(error) && <Alert severity="error">{error instanceof Error && error.message ? error.message : t("common.failed")}</Alert>}
      </Box>
      <Box sx={{ px: 2.5, py: 1.5, display: "flex", justifyContent: "flex-end", gap: 1, borderTop: 1, borderColor: "divider" }}>
        <Button onClick={onClose} disabled={busy}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" form={id} variant="contained" disabled={busy}>
          {submitLabel}
        </Button>
      </Box>
    </Drawer>
  );
}

/** Текстовое поле формы через Controller. */
function Field<T extends FieldValues>({
  control,
  name,
  label,
  required,
  number,
  min,
  max,
  helper,
  multiline,
}: {
  control: Control<T>;
  name: Path<T>;
  label: string;
  required?: boolean;
  /** Число (целое — если задан `max`/`min` для этажей и процентов). */
  number?: boolean;
  min?: number;
  max?: number;
  helper?: string;
  multiline?: boolean;
}) {
  const { t } = useT("realtySales");
  return (
    <Controller
      control={control}
      name={name}
      rules={{
        validate: (raw: unknown) => {
          const value = String(raw ?? "").trim();
          if (!value) return required ? t("catalog.forms.required") : true;
          if (!number) return true;
          const parsed = parseAmount(value);
          if (parsed == null) return t("catalog.forms.number");
          if ((min != null && parsed < min) || (max != null && parsed > max)) return t("catalog.forms.range", { min: min ?? 0, max: max ?? "∞" });
          return true;
        },
      }}
      render={({ field, fieldState }) => (
        <TextField
          {...field}
          value={field.value ?? ""}
          label={label}
          size="small"
          required={required}
          inputMode={number ? "decimal" : undefined}
          multiline={multiline}
          minRows={multiline ? 2 : undefined}
          maxRows={multiline ? 6 : undefined}
          error={Boolean(fieldState.error)}
          helperText={fieldState.error?.message ?? helper}
        />
      )}
    />
  );
}

function DateField<T extends FieldValues>({ control, name, label }: { control: Control<T>; name: Path<T>; label: string }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => <CustomDatePicker label={label} value={(field.value as Dayjs | null) ?? null} onChange={(value) => field.onChange(value)} slotProps={{ textField: { size: "small", fullWidth: true } }} />}
    />
  );
}

const grid2 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 } as const;

// ─── ЖК ────────────────────────────────────────────────────────────────────

export function ProjectEditDrawer({ project, onClose, onSaved }: { project: CatalogProject | null; onClose: () => void; onSaved: (fresh: CatalogProject, patch: ProjectPatch) => void }) {
  const { t } = useT("realtySales");
  const scope = useRealtyScope();
  const initial = React.useMemo(() => (project ? projectForm(project) : null), [project]);
  const { control, handleSubmit, reset } = useForm<ProjectForm>({ defaultValues: initial ?? undefined });
  React.useEffect(() => {
    if (initial) reset(initial);
  }, [initial, reset]);
  const save = useMutation({
    mutationFn: (patch: ProjectPatch) => updateCatalogProject(project?.id as number, patch, scope),
    onSuccess: (fresh, patch) => onSaved(fresh, patch),
  });
  React.useEffect(() => save.reset(), [project]); // eslint-disable-line react-hooks/exhaustive-deps -- сбросить ошибку при новом ЖК
  return (
    <FormDrawer
      open={project != null}
      title={t("catalog.forms.projectTitle", { name: project?.name ?? "" })}
      busy={save.isPending}
      error={save.error}
      submitLabel={t("catalog.forms.save")}
      onClose={onClose}
      onSubmit={handleSubmit((form) => {
        if (!initial) return;
        const patch = projectPatch(initial, form);
        if (Object.keys(patch).length === 0) onClose();
        else save.mutate(patch);
      })}
    >
      <Field control={control} name="name" label={t("catalog.forms.name")} required />
      <Box sx={grid2}>
        <Field control={control} name="queue" label={t("catalog.forms.queue")} />
        <Field control={control} name="className" label={t("catalog.forms.className")} />
      </Box>
      <Field control={control} name="address" label={t("catalog.forms.address")} />
      <Field control={control} name="district" label={t("catalog.forms.district")} />
      <Field control={control} name="stage" label={t("catalog.forms.stage")} />
      <Box sx={grid2}>
        <Field control={control} name="progress" label={t("catalog.forms.progress")} number min={0} max={100} />
        <DateField control={control} name="deadline" label={t("catalog.forms.deadline")} />
      </Box>
      <Box sx={grid2}>
        <Field control={control} name="finish" label={t("catalog.forms.finish")} />
        <Field control={control} name="pricePerSqm" label={t("catalog.forms.pricePerSqm")} number min={0} />
      </Box>
      <Field control={control} name="promo" label={t("catalog.forms.promo")} helper={t("catalog.forms.promoHint")} />
      <Field control={control} name="badge" label={t("catalog.forms.badge")} />
      <Field control={control} name="reservationAmount" label={t("catalog.forms.reservationAmount")} number min={0} />
      <Field control={control} name="sellerInfo" label={t("catalog.forms.sellerInfo")} multiline />
    </FormDrawer>
  );
}

// ─── Секция ────────────────────────────────────────────────────────────────

interface SectionForm {
  name: string;
  floors: string;
  startFloor: string;
  progress: string;
  deadline: Dayjs | null;
}

/** `section: null` — новая секция ЖК `projectId`; `open: false` — закрыта. */
export function SectionDrawer({
  open,
  projectId,
  section,
  onClose,
  onSaved,
}: {
  open: boolean;
  projectId: number;
  section: CatalogSection | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useT("realtySales");
  const scope = useRealtyScope();
  const { control, handleSubmit, reset } = useForm<SectionForm>();
  React.useEffect(() => {
    if (!open) return;
    reset(
      section
        ? { name: section.name, floors: String(section.floors), startFloor: String(section.startFloor), progress: String(section.progress), deadline: section.deadline ? dayjs(section.deadline) : null }
        : { name: "", floors: "", startFloor: "2", progress: "0", deadline: null },
    );
  }, [open, section, reset]);
  const save = useMutation({
    mutationFn: (form: SectionForm) => {
      const body = {
        name: form.name.trim(),
        floors: Math.round(parseAmount(form.floors) ?? 0),
        startFloor: Math.round(parseAmount(form.startFloor) ?? 1),
        progress: Math.round(parseAmount(form.progress) ?? 0),
        deadline: isoDate(form.deadline),
      };
      return section ? updateSection(projectId, section.id, body, scope) : createSection(projectId, body, scope);
    },
    onSuccess: onSaved,
  });
  React.useEffect(() => save.reset(), [open]); // eslint-disable-line react-hooks/exhaustive-deps -- сбросить ошибку при открытии
  return (
    <FormDrawer
      open={open}
      title={section ? t("catalog.forms.sectionEdit", { name: section.name }) : t("catalog.forms.sectionNew")}
      busy={save.isPending}
      error={save.error}
      submitLabel={section ? t("catalog.forms.save") : t("catalog.forms.create")}
      onClose={onClose}
      onSubmit={handleSubmit((form) => save.mutate(form))}
    >
      <Field control={control} name="name" label={t("catalog.forms.sectionName")} required />
      <Box sx={grid2}>
        <Field control={control} name="floors" label={t("catalog.forms.floors")} required number min={1} max={200} />
        <Field control={control} name="startFloor" label={t("catalog.forms.startFloor")} number min={-5} max={200} />
      </Box>
      <Box sx={grid2}>
        <Field control={control} name="progress" label={t("catalog.forms.progress")} number min={0} max={100} />
        <DateField control={control} name="deadline" label={t("catalog.forms.deadline")} />
      </Box>
    </FormDrawer>
  );
}

// ─── Планировка ЖК ─────────────────────────────────────────────────────────

interface UnitLayoutForm {
  code: string;
  rooms: string;
  area: string;
  image: string;
  description: string;
}

export function UnitLayoutDrawer({
  open,
  projectId,
  layout,
  onClose,
  onSaved,
}: {
  open: boolean;
  projectId: number;
  layout: UnitLayout | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useT("realtySales");
  const scope = useRealtyScope();
  const { control, handleSubmit, reset } = useForm<UnitLayoutForm>();
  React.useEffect(() => {
    if (!open) return;
    reset(
      layout
        ? { code: layout.code, rooms: String(layout.rooms), area: layout.area != null ? String(layout.area) : "", image: layout.image, description: layout.description }
        : { code: "", rooms: "1", area: "", image: "", description: "" },
    );
  }, [open, layout, reset]);
  const save = useMutation({
    mutationFn: (form: UnitLayoutForm) => {
      const body = { code: form.code.trim(), rooms: Number(form.rooms), area: parseAmount(form.area), image: form.image.trim(), description: form.description.trim() };
      return layout ? updateUnitLayout(projectId, layout.id, body, scope) : createUnitLayout(projectId, body, scope);
    },
    onSuccess: onSaved,
  });
  React.useEffect(() => save.reset(), [open]); // eslint-disable-line react-hooks/exhaustive-deps -- сбросить ошибку при открытии
  return (
    <FormDrawer
      open={open}
      title={layout ? t("catalog.forms.layoutEdit", { code: layout.code }) : t("catalog.forms.layoutNew")}
      busy={save.isPending}
      error={save.error}
      submitLabel={layout ? t("catalog.forms.save") : t("catalog.forms.create")}
      onClose={onClose}
      onSubmit={handleSubmit((form) => save.mutate(form))}
    >
      <Field control={control} name="code" label={t("catalog.forms.code")} required />
      <Box sx={grid2}>
        <Controller
          control={control}
          name="rooms"
          render={({ field }) => (
            <TextField {...field} value={field.value ?? "1"} select size="small" label={t("catalog.forms.rooms")}>
              {[0, 1, 2, 3, 4, 5].map((rooms) => (
                <MenuItem key={rooms} value={String(rooms)}>
                  {rooms === 0 ? t("catalog.forms.roomsStudio") : rooms}
                </MenuItem>
              ))}
            </TextField>
          )}
        />
        <Field control={control} name="area" label={t("catalog.forms.area")} number min={1} max={1000} />
      </Box>
      <Field control={control} name="image" label={t("catalog.forms.image")} />
      <Field control={control} name="description" label={t("catalog.forms.description")} multiline />
    </FormDrawer>
  );
}

// ─── Акция ─────────────────────────────────────────────────────────────────

interface PromotionForm {
  code: string;
  title: string;
  projectId: string;
  kind: PromotionKind;
  value: string;
  maxDiscount: string;
  validUntil: Dayjs | null;
  badge: string;
  tone: PromotionTone;
  text: string;
}

export function PromotionDrawer({
  open,
  promotion,
  projects,
  defaultProjectId,
  onClose,
  onSaved,
}: {
  open: boolean;
  promotion: Promotion | null;
  projects: { id: number; name: string }[];
  defaultProjectId: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useT("realtySales");
  const scope = useRealtyScope();
  const { control, handleSubmit, reset, watch } = useForm<PromotionForm>();
  React.useEffect(() => {
    if (!open) return;
    reset(
      promotion
        ? {
            code: promotion.code,
            title: promotion.title,
            projectId: promotion.projectId != null ? String(promotion.projectId) : "",
            kind: (PROMOTION_KINDS as readonly string[]).includes(promotion.kind) ? (promotion.kind as PromotionKind) : "none",
            value: promotion.value ? String(promotion.value) : "",
            maxDiscount: promotion.maxDiscount != null ? String(promotion.maxDiscount) : "",
            validUntil: promotion.validUntil ? dayjs(promotion.validUntil) : null,
            badge: promotion.badge,
            tone: (PROMOTION_TONES as readonly string[]).includes(promotion.tone) ? (promotion.tone as PromotionTone) : "green",
            text: promotion.text,
          }
        : { code: "", title: "", projectId: defaultProjectId != null ? String(defaultProjectId) : "", kind: "percent", value: "", maxDiscount: "", validUntil: null, badge: "", tone: "green", text: "" },
    );
  }, [open, promotion, defaultProjectId, reset]);
  const kind = watch("kind");
  const save = useMutation({
    mutationFn: (form: PromotionForm) => {
      const body = {
        code: form.code.trim(),
        title: form.title.trim(),
        projectId: form.projectId ? Number(form.projectId) : null,
        kind: form.kind,
        value: form.kind === "none" ? "0" : (amountText(form.value) ?? "0"),
        maxDiscount: form.kind === "none" ? null : amountText(form.maxDiscount),
        validUntil: isoDate(form.validUntil),
        badge: form.badge.trim(),
        tone: form.tone,
        text: form.text.trim(),
      };
      return promotion ? updatePromotion(promotion.id, body, scope) : createPromotion(body, scope);
    },
    onSuccess: onSaved,
  });
  React.useEffect(() => save.reset(), [open]); // eslint-disable-line react-hooks/exhaustive-deps -- сбросить ошибку при открытии
  return (
    <FormDrawer
      open={open}
      title={promotion ? t("catalog.forms.promotionEdit", { title: promotion.title }) : t("catalog.forms.promotionNew")}
      busy={save.isPending}
      error={save.error}
      submitLabel={promotion ? t("catalog.forms.save") : t("catalog.forms.create")}
      onClose={onClose}
      onSubmit={handleSubmit((form) => save.mutate(form))}
    >
      <Field control={control} name="title" label={t("catalog.forms.title")} required />
      <Controller
        control={control}
        name="code"
        rules={{
          validate: (value: string) => {
            const code = (value ?? "").trim();
            if (!code) return t("catalog.forms.required");
            return PROMOTION_CODE_RE.test(code) || t("catalog.forms.promoCodeInvalid");
          },
        }}
        render={({ field, fieldState }) => (
          <TextField
            {...field}
            value={field.value ?? ""}
            size="small"
            required
            label={t("catalog.forms.promoCode")}
            error={Boolean(fieldState.error)}
            helperText={fieldState.error?.message ?? t("catalog.forms.promoCodeHint")}
          />
        )}
      />
      <Controller
        control={control}
        name="projectId"
        render={({ field }) => (
          <TextField {...field} value={field.value ?? ""} select size="small" label={t("catalog.forms.project")} slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}>
            <MenuItem value="">{t("catalog.forms.projectAll")}</MenuItem>
            {projects.map((p) => (
              <MenuItem key={p.id} value={String(p.id)}>
                {p.name}
              </MenuItem>
            ))}
          </TextField>
        )}
      />
      <Controller
        control={control}
        name="kind"
        render={({ field }) => (
          <TextField {...field} value={field.value ?? "none"} select size="small" label={t("catalog.forms.kind")}>
            {PROMOTION_KINDS.map((value) => (
              <MenuItem key={value} value={value}>
                {t(`catalog.forms.kinds.${value}`)}
              </MenuItem>
            ))}
          </TextField>
        )}
      />
      {kind !== "none" && (
        <Box sx={grid2}>
          <Field control={control} name="value" label={t("catalog.forms.value")} required number min={0} max={kind === "percent" ? 100 : undefined} />
          <Field control={control} name="maxDiscount" label={t("catalog.forms.maxDiscount")} number min={0} />
        </Box>
      )}
      <Box sx={grid2}>
        <DateField control={control} name="validUntil" label={t("catalog.forms.validUntil")} />
        <Controller
          control={control}
          name="tone"
          render={({ field }) => (
            <TextField {...field} value={field.value ?? "green"} select size="small" label={t("catalog.forms.tone")}>
              {PROMOTION_TONES.map((tone) => (
                <MenuItem key={tone} value={tone}>
                  {t(`catalog.forms.tones.${tone}`)}
                </MenuItem>
              ))}
            </TextField>
          )}
        />
      </Box>
      <Field control={control} name="badge" label={t("catalog.forms.badge")} />
      <Field control={control} name="text" label={t("catalog.forms.text")} multiline />
    </FormDrawer>
  );
}
