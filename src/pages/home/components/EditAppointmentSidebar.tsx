import React from "react";
import { useCloseGuard } from "../../../hooks/useCloseGuard";
import { CloseGuardDialog } from "../../../components/common/CloseGuardDialog";
import {
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  Stack,
  TextField,
  Typography,
  CircularProgress,
  Tooltip,
} from "@mui/material";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Grid from "@mui/material/Grid";
import { CardContent } from "@mui/material";
import { AppCard } from "../../../components/ui";
import WbSunnyOutlined from "@mui/icons-material/WbSunnyOutlined";
import NightlightOutlined from "@mui/icons-material/NightlightOutlined";

import { supabase } from "../../../utility/supabaseClient";
import { sendAppointmentNotification } from "../../../utility/appointmentNotifications";
import type { Appointment, PatientOption, ServiceRowEntry } from "../types";
import type { EmployeesRow } from "../../../pages/expenses/types";
import { type ServiceRow } from "../../../services/services";
import {
  type Product,
  getPrimaryWarehouseId,
} from "../../../services/products";
import { createStockMovement } from "../../../services/warehouse";
import AddPatientDrawer from "../../../components/patients/AddPatientDrawer";
import AddServiceDrawer from "../../../components/services/AddServiceDrawer";
import { roundDateTimeLocalToStep } from "../../../utility/time";
import dayjs from "dayjs";
import "dayjs/locale/ru";
import { CustomDateTimePicker } from "../../../components/ui";
import { useNotification } from "@refinedev/core";
import { useDictionaries } from "../../../hooks/useDictionaries";
import { usePermissions } from "../../../hooks/usePermissions";

const patientFilter = createFilterOptions<PatientOption>({
  matchFrom: "start",
  stringify: (o) => {
    const fio = o?.["ФИО пациента"] ?? o?.fio ?? "";
    const phone = o?.["Телефон"] ?? o?.phone ?? "";
    return [fio, phone].filter(Boolean).join(" ");
  },
  ignoreAccents: true,
  ignoreCase: true,
  trim: true,
});

export type EditAppointmentSidebarProps = {
  isOpen: boolean;
  onClose: () => void;
  item: Appointment;
  onSaved?: (updated: Appointment) => void;
  onDeleted?: (id: string) => void;
  initialProductRows?: Array<{ productId: string; quantity: number }>;
};

const EditAppointmentSidebar: React.FC<EditAppointmentSidebarProps> = ({
  isOpen,
  onClose,
  item,
  onSaved,
  initialProductRows = []
}) => {
  const { open: notify } = useNotification();
  const { isNurse, employeeId } = usePermissions();
  const isWorkplaceNurse = isNurse();
  const [busy, setBusy] = React.useState(false);
  const busyRef = React.useRef(false);
  const [touched, setTouched] = React.useState(false);

  // локальные поля формы
  // item.appointment_at is ISO string, so we can use it directly or format it
  const [dateTime, setDateTime] = React.useState<string>(
    item.appointment_at ? roundDateTimeLocalToStep(item.appointment_at, 15) : ""
  );
  const [workMode, setWorkMode] = React.useState<"day" | "night">(
    item.is_night ? "night" : "day"
  );

  // Пациент
  const [patients, setPatients] = React.useState<PatientOption[]>([]);
  const [patientsLoading, setPatientsLoading] = React.useState(false);
  const [selectedPatient, setSelectedPatient] =
    React.useState<PatientOption | null>(
      item.patient_id
        ? {
          id: item.patient_id,
          label: item.patient_name || "Без имени",
          fio: item.patient_name,
          "ФИО пациента": item.patient_name,
        }
        : item.patient_name
          ? {
            id: "",
            label: item.patient_name,
            fio: item.patient_name,
            "ФИО пациента": item.patient_name,
          }
          : null
    );
  const [isBooking, setIsBooking] = React.useState<boolean>(!item.patient_id);

  // Доктора и Услуги
  const [employees, setEmployees] = React.useState<EmployeesRow[]>([]);
  const [loadingEmps, setLoadingEmps] = React.useState(false);
  const [services, setServices] = React.useState<ServiceRow[]>([]);
  const [servicesLoading, setServicesLoading] = React.useState(false);

  // Товары
  const [products, setProducts] = React.useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = React.useState(false);
  const [productRows, setProductRows] = React.useState<
    Array<{ productId: string; quantity: number }>
  >(initialProductRows);

  const [serviceRows, setServiceRows] = React.useState<ServiceRowEntry[]>(
    () => {
      // Инициализируем из существующих данных приема
      let services: any[] = [];
      try {
        if (typeof item.services_json === 'string') {
          services = JSON.parse(item.services_json);
        } else if (Array.isArray(item.services_json)) {
          services = item.services_json;
        }
      } catch (e) {
        console.error("Error parsing services_json in Sidebar initialization", e);
      }

      if (Array.isArray(services) && services.length > 0) {
        // Если есть services_json, создаем строки для каждой услуги
        // Используем индивидуальные doctor_id/performer_id из каждой услуги
        const rows = services
          .map((svc) => ({
            serviceId: svc.service_id || svc.id || "",
            doctorId: svc.performer_id || svc.doctor_id || item.doctor_id || "",
            quantity: svc.quantity || 1,
          }))
          .filter((r) => r.serviceId); // фильтруем пустые строки из БД
        if (rows.length > 0) return rows;
      }
      // Фолбэк: одна пустая строка
      return [{ serviceId: "", doctorId: "", quantity: 1 }];
    }
  );

  // Автоподсчет суммы услуг из serviceRows
  const [price, setPrice] = React.useState<number | "">(
    item.total_amount ?? item.total_cost ?? ""
  );

  React.useEffect(() => {
    const servicesTotal = serviceRows.reduce((sum, row) => {
      const service = services.find((s) => s.id === row.serviceId);
      const rowPrice = service?.price || 0;
      const rowQty = row.quantity || 1;
      return sum + (rowPrice * rowQty);
    }, 0);
    const productsTotal = productRows.reduce((sum, row) => {
      const product = products.find(
        (p) => p.sellable_item_id === row.productId
      );
      return sum + (product?.price || 0) * row.quantity;
    }, 0);
    setPrice(servicesTotal + productsTotal || "");
  }, [serviceRows, services, productRows, products]);

  const [complaints, setComplaints] = React.useState<string>(
    item.complaints || ""
  );
  const [doctorComplaints, setDoctorComplaints] = React.useState<string>(
    item.doctor_complaints || ""
  );
  const [adminComment, setAdminComment] = React.useState<string>(
    item.admin_comment || ""
  );

  // Флаг того, что данные были изменены пользователем вручную
  const isDirty = React.useMemo(() => {
    // Если мы уже сохраняем, не мешаем закрытию
    if (busy) return false;

    // Сравнение даты/времени (округляем для корректного сравнения)
    const initialDt = item.appointment_at ? roundDateTimeLocalToStep(item.appointment_at, 15) : "";
    if (dateTime !== initialDt) return true;

    // Режим работы
    const initialMode = item.is_night ? "night" : "day";
    if (workMode !== initialMode) return true;

    // Пациент
    const initialPatientId = item.patient_id || null;
    const currentPatientId = selectedPatient?.id || null;
    if (currentPatientId !== initialPatientId) return true;

    // Бронирование
    const initialIsBooking = !item.patient_id;
    if (isBooking !== initialIsBooking) return true;

    // Комментарии и жалобы
    if (complaints !== (item.complaints || "")) return true;
    if (doctorComplaints !== (item.doctor_complaints || "")) return true;
    if (adminComment !== (item.admin_comment || "")) return true;

    // Услуги (упрощенное сравнение по ID и количеству)
    // Это сложнее, поэтому оставим как "если touched" или просто сравним длину и ID
    return touched; 
  }, [dateTime, workMode, selectedPatient, isBooking, complaints, doctorComplaints, adminComment, touched, item, busy]);

  // Sidebar редактирования приема
  const { guardedClose, confirmOpen, confirmClose, cancelClose } = useCloseGuard({ isDirty, isOpen, onClose });

  // Быстрое добавление
  const [isPatientDrawerOpen, setIsPatientDrawerOpen] = React.useState(false);
  const [isServiceDrawerOpen, setIsServiceDrawerOpen] = React.useState(false);

  // СЕРВЕРНЫЙ ПОИСК ПАЦИЕНТОВ
  const [patientSearchInput, setPatientSearchInput] = React.useState("");
  const [patientsSearchResults, setPatientsSearchResults] = React.useState<PatientOption[]>([]);
  const [isSearchingPatients, setIsSearchingPatients] = React.useState(false);

  const loadRecentPatients = React.useCallback(async () => {
    const { data } = await supabase
      .from("Patients")
      .select("id, full_name, phone, is_blacklisted, blacklist_reason")
      .order("created_at", { ascending: false })
      .limit(10);
    if (data) {
      const mapped = data.map((r: any) => ({
        id: r.id,
        fio: r.full_name || "",
        phone: r.phone || "",
        is_blacklisted: r.is_blacklisted,
        blacklist_reason: r.blacklist_reason,
        "ФИО пациента": r.full_name || "",
        "Телефон": r.phone || "",
        label: [r.full_name, r.phone].filter(Boolean).join(" — "),
      }));
      setPatientsSearchResults(mapped as PatientOption[]);
    }
  }, []);

  // 10 последних пациентов при открытии
  React.useEffect(() => {
    if (!isOpen) return;
    loadRecentPatients();
  }, [isOpen, loadRecentPatients]);

  const fetchPatientsServerSide = React.useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      loadRecentPatients();
      return;
    }

    setIsSearchingPatients(true);
    try {
      const cleanQ = query.trim();
      const hasDigits = /\d/.test(cleanQ);

      let queryBuilder = supabase.from("Patients").select("id, full_name, phone");

      if (hasDigits) {
        queryBuilder = queryBuilder.ilike("phone", `%${cleanQ}%`);
      } else {
        queryBuilder = queryBuilder.ilike("full_name", `%${cleanQ}%`);
      }

      const { data, error } = await queryBuilder;

      if (error) throw error;

      if (data) {
        const mapped = data.map((r: any) => {
          const fio = r.full_name || r.fio || r["ФИО пациента"] || "";
          const phone = r.phone || r["Телефон"] || "";
          return {
            id: r.id || r.ID,
            fio,
            phone,
            "ФИО пациента": fio,
            "Телефон": phone,
            label: `${fio} — ${phone}`
          };
        });
        setPatientsSearchResults(mapped as PatientOption[]);
      }
    } catch (err) {
      console.error("Error searching patients:", err);
    } finally {
      setIsSearchingPatients(false);
    }
  }, []);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (patientSearchInput) {
        fetchPatientsServerSide(patientSearchInput);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [patientSearchInput, fetchPatientsServerSide]);

  // Use cached dictionaries
  const {
    patients: dictPatients,
    employees: dictEmployees,
    services: dictServices,
    products: dictProducts,
    loading: dictLoading,
  } = useDictionaries(isOpen);

  // Sync cached data to local state for compatibility
  React.useEffect(() => {
    if (dictPatients.length > 0) setPatients(dictPatients);
    if (dictEmployees.length > 0) setEmployees(dictEmployees);
    if (dictServices.length > 0) {
      const servicesArray = Array.isArray(item.services_json)
        ? item.services_json
        : typeof item.services_json === "string"
          ? JSON.parse(item.services_json)
          : [];
      const currentServiceIds = servicesArray.map((s: any) => s.id) || [];
      const filtered = dictServices.filter(
        (s) => s.is_active !== false || currentServiceIds.includes(s.id)
      );
      setServices(filtered);
    }
    if (dictProducts.length > 0) setProducts(dictProducts);

    // Update loading states
    setPatientsLoading(dictLoading);
    setLoadingEmps(dictLoading);
    setServicesLoading(dictLoading);
    setProductsLoading(dictLoading);
  }, [dictPatients, dictEmployees, dictServices, dictProducts, dictLoading]);

  // Сброс при закрытии
  React.useEffect(() => {
    if (!isOpen) {
      setBusy(false);
      busyRef.current = false;
      setTouched(false);
      setPatientSearchInput("");
      setPatientsSearchResults([]);
    }
  }, [isOpen]);

  // Синхронизация полей формы при смене выбранного приёма или открытии
  React.useEffect(() => {
    if (!isOpen) return;

    // Сброс даты и времени
    setDateTime(item.appointment_at ? roundDateTimeLocalToStep(item.appointment_at, 15) : "");
    setWorkMode(item.is_night ? "night" : "day");

    // Сброс пациента
    setSelectedPatient(
      item.patient_id
        ? {
          id: item.patient_id,
          label: item.patient_name || "Без имени",
          fio: item.patient_name,
          "ФИО пациента": item.patient_name,
        }
        : item.patient_name
          ? {
            id: "",
            label: item.patient_name,
            fio: item.patient_name,
            "ФИО пациента": item.patient_name,
          }
          : null
    );
    setIsBooking(!item.patient_id);

    // Сброс жалоб и комментариев
    setComplaints(item.complaints || "");
    setDoctorComplaints(item.doctor_complaints || "");
    setAdminComment(item.admin_comment || "");

    // Сброс услуг
    let parsed: any[] = [];
    try {
      if (typeof item.services_json === "string") {
        parsed = JSON.parse(item.services_json);
      } else if (Array.isArray(item.services_json)) {
        parsed = item.services_json;
      }
    } catch {
      parsed = [];
    }

    if (Array.isArray(parsed) && parsed.length > 0) {
      const rows = parsed
        .map((svc) => ({
          serviceId: svc.service_id || svc.id || "",
          doctorId: svc.performer_id || svc.doctor_id || item.doctor_id || "",
          quantity: svc.quantity || 1,
        }))
        .filter((r) => r.serviceId); // фильтруем пустые строки из БД
      setServiceRows(rows.length > 0 ? rows : [{ serviceId: "", doctorId: "", quantity: 1 }]);
    } else {
      setServiceRows([{ serviceId: "", doctorId: "", quantity: 1 }]);
    }

    // Сброс товаров
    if (initialProductRows.length > 0) {
      setProductRows(initialProductRows);
    } else {
      setProductRows([]);
    }

    // Сброс флага изменений
    setTouched(false);
  }, [item.id, isOpen, initialProductRows]);

  // Когда открывается форма и products загружены — убираем товары из serviceRows, добавляем в productRows
  React.useEffect(() => {
    if (!isOpen || products.length === 0) return;
    const productIds = new Set(products.map((p) => p.sellable_item_id));

    setServiceRows((prev) => {
      const serviceOnly = prev.filter((r) => !productIds.has(r.serviceId));
      const foundProducts = prev.filter((r) => productIds.has(r.serviceId));
      if (foundProducts.length > 0) {
        setProductRows((prevP) => {
          const existingIds = new Set(prevP.map((p) => p.productId));
          const newProds = foundProducts
            .filter((r) => !existingIds.has(r.serviceId))
            .map((r) => ({ productId: r.serviceId, quantity: r.quantity || 1 }));
          return newProds.length > 0 ? [...prevP, ...newProds] : prevP;
        });
      }
      if (serviceOnly.length === prev.length) return prev;
      return serviceOnly.length > 0 ? serviceOnly : [{ serviceId: "", doctorId: "", quantity: 1 }];
    });
  }, [isOpen, item.id, products]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    if (busy || busyRef.current) return;

    setTouched(true);

    // Гарантируем ISO строку с часовым поясом, чтобы DB не интерпретировала как UTC
    const dt = dateTime ? dayjs(dateTime).format() : "";
    if (!dt || (!isBooking && !selectedPatient?.id)) {
      return;
    }

    if (isBooking && (!adminComment || !adminComment.trim())) {
      return;
    }

    // Валидация строк услуг (игнорируем полностью пустые строки, если есть хотя бы одна заполненная)
    const validServiceRows = serviceRows.filter((r) => r.serviceId && r.doctorId);
    if (validServiceRows.length === 0) {
      return;
    }

    // Блокируем только после прохождения всех валидаций
    busyRef.current = true;
    try {
      setBusy(true);

      // Формируем payload для услуг
      const servicesPayload = [] as {
        service_id: string;
        doctor_id: string;
        price: number;
      }[];
      for (const row of validServiceRows) {
        const service = services.find((s) => s.id === row.serviceId);
        servicesPayload.push({
          service_id: row.serviceId || "",
          doctor_id: row.doctorId || "",
          price: service?.price || 0,
        });
      }

      // Базовые поля приема
      const payload: Record<string, unknown> = {
        appointment_at: dt,
        is_night: workMode === "night",
        complaints: complaints || null,
        doctor_complaints: doctorComplaints || null,
        admin_comment: adminComment || null,
        patient_id: selectedPatient?.id || null,
        // Preserve existing medical data to avoid losing doctor's work
        conclusion: item.conclusion,
        diagnosis_code: item.diagnosis_code,
        weight: item.weight,
        height: item.height,
        temperature: item.temperature,
      };

      // Calculate Total Amount
      let calculatedTotal = 0;
      // 1. Services Total
      calculatedTotal += serviceRows.reduce((sum, row) => {
        const service = services.find((s) => s.id === row.serviceId);
        const price = service?.price || 0;
        const qty = row.quantity || 1;
        return sum + (price * qty);
      }, 0);

      // 2. Products Total
      // We need prices for products. We have `products` state but let's be sure.
      // If products state is loaded, we can look up prices.
      if (productRows.length > 0) {
        productRows.forEach((row) => {
          const productDef = products.find(
            (p) => p.sellable_item_id === row.productId
          );
          const price = productDef?.price || 0;
          const qty = row.quantity || 1;
          calculatedTotal += price * qty;
        });
      }

      // Robust fallback for total_amount
      if (calculatedTotal <= 0 && (item.total_amount || item.total_cost || item.estimated_total)) {
        calculatedTotal = Number(item.total_amount || item.total_cost || item.estimated_total || 0);
      }

      payload.total_amount = calculatedTotal;
      payload.total = calculatedTotal;

      // Calculate new debt based on updated total and existing payments
      const totalPaid = (item.paid_cash || 0) + (item.paid_card || 0) + (item.paid_balance || 0) + (item.paid_bonuses || 0);
      const newDebt = Math.max(0, calculatedTotal - totalPaid);
      payload.debt = newDebt;

      // Update status based on payment state
      if (newDebt <= 0 && totalPaid > 0) {
        payload.status = "Оплачено";
      } else if (newDebt <= 0 && totalPaid === 0 && calculatedTotal === 0) {
        // Бесплатный приём (скидка 100%)
        payload.status = "Оплачено";
      } else if (totalPaid > 0 && newDebt > 0) {
        payload.status = "Частично оплачено";
      } else if (totalPaid === 0) {
        // Ничего не оплачено — сохраняем текущий статус если он финальный
        const preservedStatuses = ["Пациент здесь", "Пациент не пришел", "Отменено", "Завершено", "Оплачено", "Со скидкой", "Частично оплачено"];
        if (!preservedStatuses.includes(item.status)) {
          payload.status = "Ожидаем";
        }
      }

      // Обновляем базовую таблицу Appointments
      let errorFinal: unknown = null;
      try {
        const { error } = await supabase
          .from("Appointments")
          .update(payload)
          .eq("id", item.id);
        if (error) throw error;
        errorFinal = null;
      } catch (e1) {
        errorFinal = e1;
        try {
          const { error } = await supabase
            .from("Appointments")
            .update(payload)
            .eq("id", item.id);
          if (error) throw error;
          errorFinal = null;
        } catch (e2) {
          errorFinal = e2;
        }
      }

      if (errorFinal) throw errorFinal;

      // --- Stock Management Preparation ---
      const oldProductsMap = new Map<string, number>();
      const warehouseId = await getPrimaryWarehouseId();

      if (warehouseId) {
        // Fetch existing products before deletion to calculate delta
        const { data: existingLinks } = await supabase
          .from("AppointmentServices")
          .select("sellable_item_id, quantity")
          .eq("appointment_id", item.id);

        if (existingLinks) {
          const existingIds = existingLinks.map((l) => l.sellable_item_id);
          if (existingIds.length > 0) {
            const { data: realProducts } = await supabase
              .from("Products")
              .select("sellable_item_id")
              .in("sellable_item_id", existingIds);

            const realProductIds = new Set(
              realProducts?.map((p) => p.sellable_item_id)
            );
            existingLinks.forEach((l) => {
              if (realProductIds.has(l.sellable_item_id)) {
                // Assume quantity 1 for old entries as per current schema limitation
                oldProductsMap.set(
                  l.sellable_item_id,
                  (oldProductsMap.get(l.sellable_item_id) || 0) +
                  (l.quantity || 1)
                );
              }
            });
          }
        }
      }
      // ------------------------------------

      // Формируем новые услуги
      const serviceServicesRows = servicesPayload
        .filter((svc) => svc.service_id && svc.doctor_id)
        .map((svc) => ({
          sellable_item_id: svc.service_id,
          performer_id: svc.doctor_id,
          price: svc.price,
          cost: svc.price,
          status: "Выполнено",
          performed_at: dt,
          quantity: 1,
        }));

      // Товары
      const productServicesRows = productRows
        .filter((prod) => prod.productId)
        .map((prod) => {
          const productDef = products.find(
            (p) => p.sellable_item_id === prod.productId
          );
          const price = productDef?.price || 0;
          return {
            sellable_item_id: prod.productId,
            performer_id: null,
            price: price,
            cost: price,
            status: "Выполнено",
            performed_at: dt,
            quantity: prod.quantity || 1,
          };
        });

      const appointmentServicesRows = [
        ...serviceServicesRows,
        ...productServicesRows,
      ];

      // Атомарно: DELETE все старые + INSERT новые через SECURITY DEFINER функцию
      // Это гарантирует что старые записи (например старый врач) всегда удаляются
      const { error: rpcError } = await supabase.rpc("update_appointment_services", {
        p_appointment_id: item.id,
        p_services: appointmentServicesRows,
      });
      if (rpcError) throw rpcError;

      // --- Execute Stock Movements ---
      if (warehouseId) {
        const newProductsMap = new Map<string, number>();
        productRows.forEach((row) => {
          if (row.productId) {
            newProductsMap.set(
              row.productId,
              (newProductsMap.get(row.productId) || 0) + (row.quantity || 1)
            );
          }
        });

        // Calculate Delta
        const allIds = new Set([
          ...oldProductsMap.keys(),
          ...newProductsMap.keys(),
        ]);
        for (const pid of allIds) {
          const oldQty = oldProductsMap.get(pid) || 0;
          const newQty = newProductsMap.get(pid) || 0;
          const diff = newQty - oldQty;

          if (diff !== 0) {
            // Use Current Product Price
            const productDef = products.find((p) => p.sellable_item_id === pid);
            const price = productDef?.price || 0;

            // Calculate proportional total cost for this specific quantity
            const diffAbs = Math.abs(diff);
            const totalCostForMovement = price * diffAbs;

            // diff > 0 => Added => Consume (negative)
            // diff < 0 => Removed => Return (positive)
            await createStockMovement({
              warehouse_id: warehouseId,
              product_id: pid,
              quantity: -diff,
              move_type: "consumption",
              reference_id: item.id,
              reference_table: "Appointments",
              unit_cost: totalCostForMovement,
            });
          }
        }
      }
      // -----------------------------

      // Обновляем UI
      const firstDoctor = employees.find(
        (e) => e.id === serviceRows[0]?.doctorId
      );
      const updatedItem: Appointment = {
        ...item,
        appointment_at: dt,
        formatted_date: dayjs(dt).format("DD.MM.YYYY HH:mm"),
        doctor_name: firstDoctor?.full_name || item.doctor_name,
        doctor_id: serviceRows[0]?.doctorId || undefined,
        patient_name: selectedPatient?.fio || item.patient_name,
        patient_id: selectedPatient?.id || undefined,
        service_names: serviceRows
          .map((row) => {
            const svc = services.find((s) => s.id === row.serviceId);
            return svc?.name || "";
          })
          .filter(Boolean)
          .join(", "),
        services_json: [
          ...serviceRows.map((row) => {
            const svc = services.find((s) => s.id === row.serviceId);
            return {
              id: row.serviceId,
              service_id: row.serviceId,
              name: svc?.name || "",
              price: svc?.price || 0,
              performer_id: row.doctorId || null,
              image_url: svc?.photoUrl || null,
            };
          }),
          ...productRows.map((row) => {
            const prod = products.find(
              (p) => p.sellable_item_id === row.productId
            );
            return {
              id: row.productId,
              service_id: row.productId,
              name: prod?.name || "",
              price: (prod?.price || 0) * row.quantity,
              image_url: prod?.image_url || null,
            };
          }),
        ],
        total_amount: typeof price === "number" ? price : 0,
        total_cost: typeof price === "number" ? price : 0,
        is_night: workMode === "night",
        complaints: complaints || null,
        doctor_complaints: doctorComplaints || null,
        admin_comment: adminComment || null,
        status: item.status,
        paid_cash: item.paid_cash,
        paid_card: item.paid_card,
        debt: item.debt,
      };

      onSaved?.(updatedItem);
      onClose();
      notify?.({ type: "success", message: "Прием сохранен" });

      // Уведомление об изменении приёма — только если изменилось время или врач
      const patientPhone = selectedPatient?.phone || selectedPatient?.["Телефон"] || "";
      const dateChanged = dt !== item.appointment_at;
      const doctorChanged = (firstDoctor?.full_name || "") !== (item.doctor_name || "");
      if (patientPhone && (dateChanged || doctorChanged)) {
        sendAppointmentNotification({
          appointment_id: item.id,
          notification_type: "appointment_change",
          patient_phone: patientPhone,
          patient_name: selectedPatient?.fio || item.patient_name || "",
          appointment_at: dt,
          doctor_name: firstDoctor?.full_name || item.doctor_name || "",
        });
      }
    } catch (e) {
      console.error("Update appointment failed:", e);
      notify?.({
        type: "error",
        message: "Не удалось сохранить изменения приема",
      });
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  };

  return (
    <>
    <Drawer
      anchor="right"
      open={isOpen}
      onClose={busy ? undefined : guardedClose}
      PaperProps={{
        sx: {
          width: { xs: 320, sm: 480, md: 520 },
          maxWidth: "100vw",
          overscrollBehavior: "contain",
        },
      }}
    >
      <Box
        sx={{
          width: 1,
          minWidth: 0,
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          px={2}
          py={1.5}
        >
          <Typography variant="h6">Редактирование приема</Typography>
        </Stack>
        <Divider />

        <Box px={2} py={2} sx={{ flex: 1, overflowY: "auto" }}>
          <Stack spacing={2}>
            <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>
              Дата и время приема
            </Typography>
            <Grid container spacing={1.5} alignItems="stretch">
              <Grid item xs={12} sm={7.5}>
                <CustomDateTimePicker
                  label="Дата и время *"
                  value={dateTime ? dayjs(dateTime) : null}
                  onChange={(val) =>
                    setDateTime(val ? val.format() : "")
                  }
                  ampm={false}
                  minutesStep={15}
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      InputLabelProps: { shrink: true },
                      sx: {
                        '& .MuiInputBase-root': {
                          fontSize: '1.1rem',
                          fontWeight: 500,
                        }
                      }
                    },
                  }}
                />
              </Grid>
              <Grid
                item
                xs={12}
                sm={4.5}
                sx={{ display: "flex", alignItems: "center" }}
              >
                <Box sx={{ width: 1 }}>
                  <ToggleButtonGroup
                    exclusive
                    value={workMode}
                    onChange={(_, v) => {
                      if (v) setWorkMode(v);
                    }}
                    size="small"
                    sx={{
                      width: 1,
                      bgcolor: "action.hover",
                      borderRadius: 1.5,
                      p: "3px",
                      border: "none",
                      "& .MuiToggleButton-root": {
                        flex: 1,
                        border: "none",
                        borderRadius: 1,
                        py: 0.75,
                        transition: "all 0.2s ease-in-out",
                        // INACTIVE STATE (приглушён)
                        bgcolor: "transparent",
                        color: "text.disabled",
                        boxShadow: "none",
                        "&:hover": {
                          bgcolor: "action.selected",
                        },
                        // ACTIVE STATE (нажат, тёмный, доминирует)
                        "&.Mui-selected": {
                          bgcolor: "primary.main",
                          color: "primary.contrastText",
                          boxShadow:
                            "inset 0 1px 3px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.05)",
                          fontWeight: 600,
                          "&:hover": {
                            bgcolor: "primary.dark",
                          },
                        },
                      },
                    }}
                  >
                    <ToggleButton value="day" aria-label="Дневной">
                      <WbSunnyOutlined
                        sx={{
                          fontSize: 20,
                          color:
                            workMode === "day"
                              ? "primary.contrastText"
                              : "text.disabled",
                        }}
                      />
                    </ToggleButton>
                    <ToggleButton value="night" aria-label="Ночной">
                      <NightlightOutlined
                        sx={{
                          fontSize: 20,
                          color:
                            workMode === "night"
                              ? "primary.contrastText"
                              : "text.disabled",
                        }}
                      />
                    </ToggleButton>
                  </ToggleButtonGroup>
                </Box>
              </Grid>
            </Grid>

            {/* Пациент */}
            <Stack spacing={0.5}>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
              >
                <Typography variant="body2" color="text.secondary">
                  Пациент *
                </Typography>
                <Button
                  size="small"
                  onClick={() => setIsPatientDrawerOpen(true)}
                >
                  + Добавить пациента
                </Button>
              </Stack>
              <Autocomplete
                disabled={isBooking}
                options={patientsSearchResults}
                loading={patientsLoading || isSearchingPatients}
                value={selectedPatient}
                onInputChange={(_, val) => setPatientSearchInput(val)}
                onChange={(_, v) => setSelectedPatient(v)}
                getOptionLabel={(o: PatientOption) => {
                  const fio = o["ФИО пациента"] ?? o.fio ?? "";
                  const phone = o["Телефон"] ?? o.phone ?? "";
                  return `${fio || "Нет ФИО"} — ${phone || "Нет телефона"}`;
                }}
                filterOptions={(x) => x}
                isOptionEqualToValue={(o, v) => o.id === (v?.id || "")}
                renderOption={(props, option) => {
                  const fio = option["ФИО пациента"] ?? option.fio ?? "";
                  const phone = option["Телефон"] ?? option.phone ?? "";
                  return (
                    <li {...props} key={option.id}>{`${fio || "Нет ФИО"} — ${phone || "Нет телефона"
                      }`}</li>
                  );
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder="Поиск по ФИО или телефону"
                    fullWidth
                    error={touched && !isBooking && !selectedPatient}
                    helperText={touched && !isBooking && !selectedPatient ? "Выберите пациента" : ""}
                  />
                )}
              />
            </Stack>

            {/* Опция бронирования */}
            <Box
              sx={{
                p: 1.5,
                borderRadius: 1,
                bgcolor: isBooking ? "warning.lighter" : "action.hover",
                border: "1px solid",
                borderColor: isBooking ? "warning.light" : "divider",
                cursor: "pointer",
                transition: "all 0.2s",
                "&:hover": {
                  bgcolor: isBooking ? "warning.lighter" : "action.selected",
                },
              }}
              onClick={() => {
                if (!isBooking) {
                  setSelectedPatient(null);
                }
                setIsBooking(!isBooking);
                setTouched(true);
              }}
            >
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
              >
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    Бронирование (без пациента)
                  </Typography>
                </Stack>
                <Box
                  sx={{
                    width: 36,
                    height: 20,
                    borderRadius: 10,
                    bgcolor: isBooking ? "primary.main" : "text.disabled",
                    position: "relative",
                    transition: "bgcolor 0.2s",
                  }}
                >
                  <Box
                    sx={{
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      bgcolor: "white",
                      position: "absolute",
                      top: 3,
                      left: isBooking ? 19 : 3,
                      transition: "left 0.2s",
                    }}
                  />
                </Box>
              </Stack>
            </Box>

            {/* Контент ниже отображается если выбран пациент ИЛИ включено бронирование */}
            {(selectedPatient || isBooking) && (
              <>
                {/* Новая карточка со строками услуга + врач */}
                <AppCard
                  variant="outlined"
                  sx={{ bgcolor: "background.paper" }}
                  disableContentPadding
                >
                  <CardContent sx={{ p: 2 }}>
                    <Stack spacing={2}>
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                      >
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ fontWeight: 600 }}
                        >
                          Услуги
                        </Typography>
                      </Stack>

                      <Divider />

                      {serviceRows.map((row, index) => (
                        <React.Fragment key={index}>
                          {index > 0 && <Divider />}
                          <Stack spacing={1.5}>
                            <Stack spacing={1.5}>
                              {index === 0 && (
                                <Typography variant="caption" color="text.secondary">
                                  Врач / Исполнитель
                                </Typography>
                              )}
                              {/* Врач */}
                              <Autocomplete
                                fullWidth
                                disabled={isWorkplaceNurse}
                                options={
                                  row.serviceId
                                    ? (() => {
                                      const service = services.find(
                                        (s) => s.id === row.serviceId
                                      );
                                      if (!service) return employees;
                                      if (service.employee_ids?.length) {
                                        return employees.filter((d) =>
                                          service.employee_ids?.includes(d.id)
                                        );
                                      }
                                      return employees.filter(
                                        (d) => d.id === service.employee_id
                                      );
                                    })()
                                    : employees
                                }
                                loading={loadingEmps}
                                value={
                                  employees.find((d) => d.id === row.doctorId) ||
                                  null
                                }
                                onChange={(_, v) => {
                                  const updated = [...serviceRows];
                                  updated[index].doctorId = v?.id || "";
                                  if (updated[index].serviceId && v) {
                                    const currentService = services.find(
                                      (s) => s.id === updated[index].serviceId
                                    );
                                    if (currentService) {
                                      const hasService =
                                        currentService.employee_ids?.includes(
                                          v.id
                                        ) || currentService.employee_id === v.id;
                                      if (!hasService) {
                                        updated[index].serviceId = "";
                                      }
                                    }
                                  }
                                  setServiceRows(updated);
                                }}
                                getOptionLabel={(o) =>
                                  `${o.full_name || o.id} — ${o.specialization || "Нет специализации"
                                  }`
                                }
                                filterOptions={createFilterOptions<EmployeesRow>({
                                  matchFrom: "start",
                                  stringify: (o) =>
                                    `${o.full_name ?? ""} ${o.specialization ?? ""
                                      }`.trim(),
                                })}
                                isOptionEqualToValue={(o, v) => o.id === v.id}
                                renderInput={(params) => (
                                  <TextField
                                    {...params}
                                    placeholder="Исполнитель"
                                    size="small"
                                    fullWidth
                                    error={touched && !row.doctorId}
                                    helperText={touched && !row.doctorId ? "Выберите исполнителя" : ""}
                                  />
                                )}
                              />

                              {index === 0 && (
                                <Typography variant="caption" color="text.secondary">
                                  Наименование услуги
                                </Typography>
                              )}
                              {/* Услуга */}
                              <Stack direction="row" spacing={1} alignItems="flex-start">
                                <Autocomplete
                                  sx={{ flex: 1 }}
                                  options={
                                    row.doctorId
                                      ? services.filter(
                                        (s) =>
                                          s.employee_ids?.includes(
                                            row.doctorId
                                          ) || s.employee_id === row.doctorId
                                      )
                                      : services
                                  }
                                  loading={servicesLoading}
                                  value={
                                    services.find((s) => s.id === row.serviceId) ||
                                    null
                                  }
                                  onChange={(_, v) => {
                                    const updated = [...serviceRows];
                                    updated[index].serviceId = v?.id || "";
                                    if (updated[index].doctorId && v) {
                                      const hasDoctor =
                                        v.employee_ids?.includes(
                                          updated[index].doctorId
                                        ) ||
                                        v.employee_id === updated[index].doctorId;
                                      if (!hasDoctor) {
                                        updated[index].doctorId = "";
                                      }
                                    }
                                    setServiceRows(updated);
                                  }}
                                  getOptionLabel={(o) =>
                                    `${o.name} — ${o.price || 0} сом`
                                  }
                                  filterOptions={createFilterOptions<ServiceRow>({
                                    matchFrom: "start",
                                    stringify: (o) =>
                                      `${o.name ?? ""} ${String(
                                        o.price ?? ""
                                      )}`.trim(),
                                  })}
                                  isOptionEqualToValue={(o, v) => o.id === v.id}
                                  renderInput={(params) => (
                                    <TextField
                                      {...params}
                                      placeholder="Услуга"
                                      size="small"
                                      fullWidth
                                      error={touched && !row.serviceId}
                                      helperText={touched && !row.serviceId ? "Выберите услугу" : ""}
                                    />
                                  )}
                                />
                                {serviceRows.length > 1 && (
                                  <Tooltip title="Удалить услугу">
                                    <IconButton
                                      size="small"
                                      color="error"
                                      onClick={() => {
                                        setServiceRows(
                                          serviceRows.filter((_, i) => i !== index)
                                        );
                                      }}
                                      sx={{
                                        mt: 0.5,
                                        border: '1px solid',
                                        borderColor: 'error.main',
                                        '&:hover': {
                                          backgroundColor: 'rgba(211, 47, 47, 0.08)',
                                        }
                                      }}
                                    >
                                      <DeleteOutlined fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                )}
                              </Stack>
                            </Stack>
                          </Stack>
                        </React.Fragment>
                      ))}

                      {/* Кнопка добавить услугу */}
                      <Button
                        size="small"
                        onClick={() => {
                          // Копируем врача из последней строки для удобства
                          const lastRow = serviceRows[serviceRows.length - 1];
                          const previousDoctorId = lastRow?.doctorId || "";
                          setServiceRows([
                            ...serviceRows,
                            {
                              serviceId: "",
                              doctorId:
                                isWorkplaceNurse && employeeId
                                  ? employeeId
                                  : previousDoctorId,
                              quantity: 1,
                            },
                          ]);
                        }}
                        sx={{ alignSelf: "flex-start", mt: "4px !important" }}
                      >
                        + Добавить услугу
                      </Button>

                      <Divider />

                      {/* Товары */}
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                      >
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ fontWeight: 600 }}
                        >
                          Товары
                        </Typography>
                      </Stack>
                      <Stack spacing={2}>
                        {productRows.map((row, index) => (
                          <Stack key={index} spacing={1.5}>
                            <Stack spacing={0.5}>
                              {index === 0 && (
                                <Stack direction="row" spacing={1.5} sx={{ px: 0.5 }}>
                                  <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                                    Название товара
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary" sx={{ width: 100 }}>
                                    Количество
                                  </Typography>
                                  <Box sx={{ width: 34 }} />
                                </Stack>
                              )}
                              <Stack direction="row" spacing={1} alignItems="flex-start">
                                <Autocomplete
                                  sx={{ flex: 1 }}
                                  options={products}
                                  loading={productsLoading}
                                  value={
                                    products.find(
                                      (p) =>
                                        p.sellable_item_id === row.productId
                                    ) || null
                                  }
                                  onChange={(_, product) => {
                                    setProductRows((prev) => {
                                      const updated = [...prev];
                                      updated[index] = {
                                        ...updated[index],
                                        productId:
                                          product?.sellable_item_id || "",
                                        quantity: product
                                          ? updated[index].quantity || 1
                                          : 1,
                                      };
                                      return updated;
                                    });
                                  }}
                                  getOptionLabel={(p) =>
                                    `${p.name} — ${p.price || 0} сом${p.stock ? ` (${p.stock} шт)` : ""
                                    }`
                                  }
                                  filterOptions={createFilterOptions<Product>(
                                    {
                                      matchFrom: "start",
                                      stringify: (p) =>
                                        `${p.name ?? ""} ${p.barcode ?? ""
                                          }`.trim(),
                                    }
                                  )}
                                  isOptionEqualToValue={(o, v) =>
                                    o.sellable_item_id === v.sellable_item_id
                                  }
                                  renderInput={(params) => (
                                    <TextField
                                      {...params}
                                      placeholder="Выберите товар"
                                      size="small"
                                      fullWidth
                                    />
                                  )}
                                />
                                <Box
                                  sx={{
                                    border: 1,
                                    borderColor: "divider",
                                    borderRadius: 1,
                                    bgcolor: "background.paper",
                                    height: 40,
                                    width: 100,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    flexShrink: 0
                                  }}
                                >
                                  <Button
                                    size="small"
                                    onClick={() => {
                                      if (row.quantity <= 1) {
                                        setProductRows((prev) =>
                                          prev.filter((_, i) => i !== index)
                                        );
                                      } else {
                                        setProductRows((prev) =>
                                          prev.map((r, i) =>
                                            i === index
                                              ? { ...r, quantity: r.quantity - 1 }
                                              : r
                                          )
                                        );
                                      }
                                    }}
                                    sx={{
                                      minWidth: 32,
                                      px: 0.5,
                                      minHeight: 34,
                                    }}
                                    disabled={!row.productId}
                                  >
                                    −
                                  </Button>
                                  <TextField
                                    size="small"
                                    value={row.quantity}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      const newVal =
                                        val === "" ? 1 : Number(val);
                                      setProductRows((prev) =>
                                        prev.map((r, i) =>
                                          i === index
                                            ? {
                                              ...r,
                                              quantity: Math.max(1, newVal),
                                            }
                                            : r
                                        )
                                      );
                                    }}
                                    disabled={!row.productId}
                                    inputProps={{
                                      style: {
                                        textAlign: "center",
                                        padding: "8px 4px",
                                      },
                                      min: 1,
                                    }}
                                    sx={{
                                      width: 30,
                                      "& .MuiOutlinedInput-root": {
                                        "& fieldset": { border: "none" },
                                      },
                                      "& input[type=number]": {
                                        MozAppearance: "textfield",
                                      },
                                      "& input[type=number]::-webkit-outer-spin-button":
                                      {
                                        WebkitAppearance: "none",
                                        margin: 0,
                                      },
                                      "& input[type=number]::-webkit-inner-spin-button":
                                      {
                                        WebkitAppearance: "none",
                                        margin: 0,
                                      },
                                    }}
                                  />
                                  <Button
                                    size="small"
                                    onClick={() => {
                                      setProductRows((prev) =>
                                        prev.map((r, i) =>
                                          i === index
                                            ? {
                                              ...r,
                                              quantity: r.quantity + 1,
                                            }
                                            : r
                                        )
                                      );
                                    }}
                                    sx={{
                                      minWidth: 32,
                                      px: 0.5,
                                      minHeight: 34,
                                    }}
                                    disabled={!row.productId}
                                  >
                                    +
                                  </Button>
                                </Box>
                                <Tooltip title="Удалить товар">
                                  <IconButton
                                    size="small"
                                    color="error"
                                    onClick={() => {
                                      setProductRows((prev) =>
                                        prev.filter((_, i) => i !== index)
                                      );
                                    }}
                                    sx={{
                                      border: '1px solid',
                                      borderColor: 'error.main',
                                      '&:hover': {
                                        backgroundColor: 'rgba(211, 47, 47, 0.08)',
                                      }
                                    }}
                                  >
                                    <DeleteOutlined fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </Stack>
                            </Stack>

                            {row.productId && (
                              <Stack
                                direction="row"
                                justifyContent="space-between"
                                alignItems="center"
                                sx={{ px: 0.5 }}
                              >
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                >
                                  Итого:
                                </Typography>
                                <Typography variant="body2" fontWeight={600}>
                                  {(products.find(
                                    (p) => p.sellable_item_id === row.productId
                                  )?.price || 0) * row.quantity}{" "}
                                  сом
                                </Typography>
                              </Stack>
                            )}
                          </Stack>
                        ))}
                      </Stack>

                      {/* Кнопка добавить товар */}
                      <Button
                        size="small"
                        onClick={() => {
                          setProductRows((prev) => [
                            ...prev,
                            { productId: "", quantity: 1 },
                          ]);
                        }}
                        sx={{ alignSelf: "flex-start", mt: "-13px !important" }}
                      >
                        + Добавить товар
                      </Button>

                      <Divider />

                      {/* Общая стоимость */}
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                      >
                        <Typography variant="body2" color="text.secondary">
                          Общая стоимость
                        </Typography>
                        <Typography variant="h6">
                          {serviceRows.reduce((sum, row) => {
                            const service = services.find(
                              (s) => s.id === row.serviceId
                            );
                            return sum + (service?.price || 0);
                          }, 0) +
                            productRows.reduce((sum, row) => {
                              const product = products.find(
                                (p) => p.sellable_item_id === row.productId
                              );
                              return sum + (product?.price || 0) * row.quantity;
                            }, 0)}{" "}
                          сом
                        </Typography>
                      </Stack>
                    </Stack>
                  </CardContent>
                </AppCard>

                {/* Жалобы / Комментарий */}
                <TextField
                  placeholder="Жалобы при обращении"
                  value={complaints}
                  onChange={(e) => setComplaints(e.target.value)}
                  fullWidth
                  multiline
                  minRows={2}
                />
                <TextField
                  placeholder="Жалобы (врач)"
                  value={doctorComplaints}
                  onChange={(e) => setDoctorComplaints(e.target.value)}
                  fullWidth
                  multiline
                  minRows={2}
                />
                <TextField
                  placeholder={isBooking ? "Комментарий администратора (обязательно)" : "Комментарий администратора"}
                  value={adminComment}
                  onChange={(e) => setAdminComment(e.target.value)}
                  fullWidth
                  multiline
                  minRows={2}
                  error={touched && isBooking && !adminComment.trim()}
                  helperText={touched && isBooking && !adminComment.trim() ? "Обязательное поле для бронирования" : ""}
                />
              </>
            )}
          </Stack>
        </Box>

        <Divider />
        <Box
          px={2}
          py={1.5}
          display="flex"
          justifyContent="flex-end"
          alignItems="center"
          gap={1.5}
        >
          <Button
            variant="outlined"
            onClick={guardedClose}
            disabled={busy}
          >
            Отмена
          </Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={
              busy ||
              !dateTime ||
              (!isBooking && !selectedPatient) ||
              (isBooking && !adminComment.trim()) ||
              !serviceRows.some((r) => r.serviceId && r.doctorId)
            }
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

      {/* Быстрое добавление пациента */}
      <AddPatientDrawer
        open={isPatientDrawerOpen}
        onClose={() => setIsPatientDrawerOpen(false)}
        onCreated={(p) => {
          const entry: PatientOption = {
            id: p.id,
            fio: p.fio,
            phone: p.phone || undefined,
            "ФИО пациента": p.fio,
            Телефон: p.phone || undefined,
            label: [p.fio, p.phone || ""].filter(Boolean).join(" — ") || p.id,
          };
          setPatients((prev) => [
            entry,
            ...prev.filter((x) => x.id !== entry.id),
          ]);
          setSelectedPatient(entry);
          setIsPatientDrawerOpen(false);
        }}
      />

      {/* Быстрое добавление услуги */}
      <AddServiceDrawer
        open={isServiceDrawerOpen}
        onClose={() => setIsServiceDrawerOpen(false)}
        onCreated={(rec) => {
          const entry: ServiceRow = {
            id: String(rec.id ?? ""),
            name: rec.name || rec.service_name,
            price: rec.price ?? rec.price_som,
            employee_id: null,
            employee_ids: [],
          };
          setServices((prev) => [
            entry,
            ...prev.filter((x) => x.id !== entry.id),
          ]);
          // Добавляем новую строку с созданной услугой
          setServiceRows((prev) => [
            ...prev,
            { serviceId: entry.id, doctorId: "", quantity: 1 },
          ]);
          setIsServiceDrawerOpen(false);
        }}
      />
    </Drawer>
    <CloseGuardDialog open={confirmOpen} title="редактирование приёма" onConfirm={confirmClose} onCancel={cancelClose} />
    </>
  );
};

export default EditAppointmentSidebar;
