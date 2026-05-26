import React from "react";
import {
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
  CircularProgress
} from "@mui/material";
import ServiceDetailsForm from "./ServiceDetailsForm";
import { useNotification } from "@refinedev/core";

import CloseOutlined from "@mui/icons-material/CloseOutlined";
import { supabase } from "../../utility/supabaseClient";
import { fetchEmployees } from "../../services/employees";
import type { EmployeesRow } from "../../pages/expenses/types";
import type { CreatedService } from "./useAddServiceForm";
import ServicePhotoUploader from "./ServicePhotoUploader";
import { uploadFile } from "../../utility/storage";

const importMetaEnv =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};
const SERVICES_WRITE: string = importMetaEnv.VITE_SERVICES_WRITE_TABLE || "Services";

type Props = {
  open: boolean;
  onClose: () => void;
  record: {
    id: string | number;
    name: string;
    price: number;
    employee_id: string | null;
    employee_name?: string | null;
    photo_url?: string | null;
    description?: string | null;
    is_active?: boolean;
  };
  onUpdated?: (rec: CreatedService) => void;
};

const DrawerBase: React.FC<{
  open: boolean;
  title: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: () => void;
  submitDisabled?: boolean;
  children?: React.ReactNode;
}> = ({ open, title, busy, onClose, onSubmit, submitDisabled, children }) => {
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={busy ? undefined : onClose}
      PaperProps={{
        sx: { width: { xs: 320, sm: 480, md: 520 }, maxWidth: "100vw", display: "flex", flexDirection: "column" },
      }}
    >
      <Box sx={{ width: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column" }}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          px={2}
          py={1.5}
        >
          <Typography variant="h6">{title}</Typography>
          <IconButton onClick={busy ? undefined : onClose} aria-label="Закрыть">
            <CloseOutlined />
          </IconButton>
        </Stack>
        <Divider />
        <Box
          px={2}
          py={2}
          sx={{
            flex: 1,
            overflowY: 'auto',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            '&::-webkit-scrollbar': {
              display: 'none',
            },
          }}
        >
          {children}
        </Box>
        <Divider />
        <Box px={2} py={1.5} display="flex" justifyContent="flex-end" gap={1.5}>
          <Button onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button
            onClick={onSubmit}
            variant="contained"
            disabled={busy || !!submitDisabled}
          >
            {busy ? (
              <Stack direction="row" alignItems="center" spacing={1}>
                <CircularProgress size={18} />
                <span>Сохранение…</span>
              </Stack>
            ) : (
              "Сохранить"
            )}
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
};

const EditServiceDrawer: React.FC<Props> = ({ open, onClose, record, onUpdated }) => {
  const { open: notify } = useNotification();
  const [name, setName] = React.useState(record.name);
  const [price, setPrice] = React.useState<string>(String(record.price ?? ""));
  const [description, setDescription] = React.useState(record.description || "");
  const [isActive, setIsActive] = React.useState(record.is_active ?? true);

  const [selectedEmps, setSelectedEmps] = React.useState<EmployeesRow[]>([]);
  const [employees, setEmployees] = React.useState<EmployeesRow[]>([]);
  const [loadingEmps, setLoadingEmps] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [touched, setTouched] = React.useState(false);
  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(record.photo_url ?? null);

  const fileToDataUrl = React.useCallback(
    (f: File) =>
      new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result || ""));
        r.onerror = reject;
        r.readAsDataURL(f);
      }),
    []
  );

  const onPickPhoto = React.useCallback(
    async (f: File | null) => {
      setPhotoFile(f);
      if (f) {
        try {
          const url = await fileToDataUrl(f);
          setPhotoPreview(url);
        } catch {
          setPhotoPreview(null);
        }
      } else {
        setPhotoPreview(record.photo_url ?? null);
      }
    },
    [fileToDataUrl, record.photo_url]
  );

  React.useEffect(() => {
    let cancelled = false;
    if (!open) return;

    const load = async () => {
      try {
        setLoadingEmps(true);
        const [emps, { data: links }] = await Promise.all([
          fetchEmployees(),
          supabase.from("EmployeeServices").select("employee_id").eq("service_id", String(record.id))
        ]);

        if (!cancelled) {
          setEmployees(emps);

          if (links && links.length > 0) {
            const linkedIds = links.map(l => String(l.employee_id));
            const found = emps.filter(e => linkedIds.includes(String(e.id)));
            setSelectedEmps(found);
          } else {
            // Legacy fallback: try preselect by employee_id if not found in junction table
            if (record.employee_id) {
              const found = emps.filter(e => String(e.id) === String(record.employee_id));
              setSelectedEmps(found);
            } else {
              setSelectedEmps([]);
            }
          }
        }
      } finally {
        if (!cancelled) setLoadingEmps(false);
      }
    };
    load();

    return () => {
      cancelled = true;
    };
  }, [open, record.id, record.employee_id]);

  React.useEffect(() => {
    if (!open) {
      setName(record.name);
      setPrice(String(record.price ?? ""));
      setDescription(record.description || "");
      setIsActive(record.is_active ?? true);
      setSelectedEmps([]);
      setPhotoFile(null);
      setPhotoPreview(record.photo_url ?? null);
      setBusy(false);
      setTouched(false);
    }
  }, [open, record]);

  const handleSubmit = async () => {
    setTouched(true);
    const priceNum = Number(price);
    if (!name.trim() || !price || !Number.isFinite(priceNum) || priceNum <= 0) {
      notify?.({ type: "error", message: "Заполните название и положительную стоимость услуги" });
      return;
    }


    try {
      setBusy(true);

      const employeeId = selectedEmps[0]?.id ?? null;

      // 1) При необходимости загружаем новое фото и получаем publicUrl
      let photoUrl: string | null | undefined = undefined;
      if (photoFile) {
        try {
          const publicUrl = await uploadFile(photoFile, "service_photos");
          photoUrl = publicUrl || null;
        } catch {
          photoUrl = null;
        }
      }

      // 2) Формируем payload для Services (имя, фото, цена)
      // Используем правильные названия колонок: name и image_url
      const primaryPayload: Record<string, unknown> = {
        name: name.trim(),
        price_som: priceNum, // Синхронизируем цену здесь тоже
        description: description.trim() || null,
      };
      if (photoUrl !== undefined) primaryPayload["image_url"] = photoUrl;


      // 3) Обновляем Services по sellable_item_id (это PK)
      const { data: updated, error: updateError } = await supabase
        .from(SERVICES_WRITE)
        .update(primaryPayload)
        .eq("sellable_item_id", record.id)
        .select("*")
        .maybeSingle();

      if (updateError) throw updateError;

      // Обновляем статус в SellableItems
      const { error: sellableError } = await supabase
        .from("SellableItems")
        .update({ is_active: isActive })
        .eq("id", record.id);

      if (sellableError) {
        console.error("SellableItems update error:", sellableError);
      }

      const sId = String(record.id);

      // 4) Обновление Цены в Prices
      if (sId) {
        // Ищем текущую цену
        const { data: priceData } = await supabase
          .from("Prices")
          .select("id")
          .eq("sellable_item_id", sId)
          .eq("is_current", true)
          .maybeSingle();

        if (priceData && priceData.id) {
          // Обновляем
          await supabase.from("Prices").update({ price: priceNum }).eq("id", priceData.id);
        } else {
          // Вставляем новую
          await supabase.from("Prices").insert({
            sellable_item_id: sId,
            price: priceNum,
            is_current: true
          });
        }
      }

      // 5) Обновление связей с сотрудниками (M:N) - REMOVED

      const out: CreatedService = {
        id:
          (updated?.["sellable_item_id"] as string | number | undefined) ??
          record.id,
        name:
          (updated?.["name"] as string) ??
          name.trim(),
        price: priceNum,
        service_name:
          (updated?.["name"] as string) ??
          name.trim(),
        price_som: priceNum,
        employee_id: null,
        employee_name: record.employee_name ?? null,
        photo_url:
          (updated?.["image_url"] as string | null) ??
          (photoUrl !== undefined ? photoUrl : record.photo_url ?? null) ??
          null,
      };

      onUpdated?.(out);
      onClose();
    } catch (e) {
      console.error("Update service failed:", e);
      notify?.({ type: "error", message: "Не удалось обновить услугу. Проверьте схему таблицы и права RLS." });
    } finally {
      setBusy(false);
    }

  };

  return (
    <DrawerBase
      open={open}
      title="Редактирование услуги"
      busy={busy}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitDisabled={!name.trim() || !price || Number(price) <= 0}
    >
      <Stack spacing={3}>
        <ServicePhotoUploader
          photoFile={photoFile}
          photoPreview={photoPreview}
          onPickPhoto={onPickPhoto}
        />

        <ServiceDetailsForm
          name={name}
          setName={setName}
          price={price}
          setPrice={setPrice}
          description={description}
          setDescription={setDescription}
          isActive={isActive}
          setIsActive={setIsActive}
          touched={touched}
        />
      </Stack>
    </DrawerBase>
  );
};

export default EditServiceDrawer;
