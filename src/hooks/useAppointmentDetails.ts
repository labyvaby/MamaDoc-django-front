import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../utility/supabaseClient';
import { Appointment, AggregatedAppointmentRow, mapAggregatedRowToAppointment } from '../pages/home/types';

export interface AppointmentNotification {
    notification_type: string;
    sent_at: string;
}

export interface AppointmentDetailsData {
    item: Appointment | null;
    patientData: {
        phone: string | null;
        birth_date: string | null;
        inn: string | null;
        photo_url: string | null;
    } | null;
    appointmentDoctors: Array<{
        id: string;
        full_name: string;
        phone: string | null;
        auth_user_id?: string | null;
        photo_url?: string | null;
    }>;
    appointmentProducts: Array<{
        sellable_item_id: string;
        name: string;
        price: number;
        quantity: number;
        photo_url?: string | null;
    }>;
    servicesPhotos: Map<string, string>;
    notifications: AppointmentNotification[];
}

export const useAppointmentDetails = (appointmentId: string | null) => {
    const queryClient = useQueryClient();

    const { data, isLoading, error, refetch } = useQuery<AppointmentDetailsData>({
        queryKey: ['appointment-details', appointmentId],
        queryFn: async () => {
            if (!appointmentId) {
                return {
                    item: null,
                    patientData: null,
                    appointmentDoctors: [],
                    appointmentProducts: [],
                    servicesPhotos: new Map(),
                    notifications: [],
                };
            }

            try {
                // 1. Ищем приём в кэше React Query (загружен get_home_appointments на главной).
                //    Если нашли — грузим только дополнительные поля из Appointments напрямую.
                //    Если нет в кэше — fallback на AppointmentsAggregated (старый путь).
                const allDailyCaches = queryClient.getQueriesData<Appointment[]>({
                    queryKey: ["appointments", "daily"],
                });
                let cachedItem: Appointment | null = null;
                for (const [, cacheData] of allDailyCaches) {
                    if (Array.isArray(cacheData)) {
                        const found = cacheData.find(a => a.id === appointmentId);
                        if (found) { cachedItem = found; break; }
                    }
                }

                let mapped: Appointment;
                let patientId: string | null | undefined;

                if (cachedItem) {
                    // Быстрый путь: данные для списка уже есть, добираем только детали
                    const { data: extra, error: extraError } = await supabase
                        .from("Appointments")
                        .select("admin_comment, complaints, doctor_complaints, conclusion, diagnosis_code, clinic_diagnosis_id, weight, height, temperature, created_at, updated_at, creator:created_by(full_name), editor:updated_by(full_name)")
                        .eq("id", appointmentId)
                        .maybeSingle();

                    if (extraError) throw extraError;

                    mapped = {
                        ...cachedItem,
                        admin_comment:       extra?.admin_comment ?? null,
                        complaints:          extra?.complaints ?? null,
                        doctor_complaints:   extra?.doctor_complaints ?? null,
                        conclusion:          extra?.conclusion ?? null,
                        diagnosis_code:      extra?.diagnosis_code ?? null,
                        clinic_diagnosis_id: extra?.clinic_diagnosis_id ?? null,
                        weight:              extra?.weight ?? null,
                        height:              extra?.height ?? null,
                        temperature:         extra?.temperature ?? null,
                        created_at:          extra?.created_at,
                        updated_at:          extra?.updated_at,
                        created_by_name:     (extra?.creator as any)?.full_name ?? null,
                        updated_by_name:     (extra?.editor as any)?.full_name ?? null,
                    };
                    patientId = cachedItem.patient_id;
                } else {
                    // Fallback: приёма нет в кэше — используем вью
                    const { data: viewData, error: viewError } = await supabase
                        .from("AppointmentsAggregated")
                        .select("*")
                        .eq("id", appointmentId)
                        .maybeSingle();

                    if (viewError) throw viewError;

                    if (!viewData) {
                        return {
                            item: null,
                            patientData: null,
                            appointmentDoctors: [],
                            appointmentProducts: [],
                            servicesPhotos: new Map(),
                            notifications: [],
                        };
                    }

                    mapped = mapAggregatedRowToAppointment(viewData as AggregatedAppointmentRow);
                    patientId = viewData.patient_id;
                }

                // 2, 3, 4. Fetch patient info, appointment services, и уведомления параллельно
                const [patientResult, apptServicesResult, notificationsResult] = await Promise.all([
                    patientId
                        ? supabase.from("Patients").select("phone, birth_date, inn, photo_url").eq("id", patientId).maybeSingle()
                        : Promise.resolve({ data: null, error: null }),
                    supabase
                        .from("AppointmentServices")
                        .select("sellable_item_id, quantity, price, performer_id")
                        .eq("appointment_id", appointmentId),
                    supabase.from("appointment_notifications").select("notification_type, sent_at").eq("appointment_id", appointmentId).order("sent_at", { ascending: true }),
                ]);

                if (patientResult.error) {
                    console.error("[useAppointmentDetails] Patient fetch error:", patientResult.error);
                }
                const patientData = patientResult.data;
                const apptServices = apptServicesResult.data;
                const notifications: AppointmentNotification[] = (notificationsResult.data as AppointmentNotification[] | null) ?? [];

                // Параллельно подтягиваем имена услуг, имена врачей и определения товаров.
                // На основе этого строим services_json (ТОЛЬКО услуги, без товаров) и
                // отдельный список appointmentProducts.
                let appointmentProducts: AppointmentDetailsData['appointmentProducts'] = [];
                if (apptServices && apptServices.length > 0) {
                    const itemIds = Array.from(new Set(apptServices.map((s: any) => s.sellable_item_id).filter(Boolean)));
                    const performerIds = Array.from(new Set(apptServices.map((s: any) => s.performer_id).filter(Boolean)));

                    const [servicesDefsResult, performersResult, productsDefsResult] = await Promise.all([
                        itemIds.length > 0
                            ? supabase.from("Services").select("sellable_item_id, name, image_url").in("sellable_item_id", itemIds)
                            : Promise.resolve({ data: [], error: null }),
                        performerIds.length > 0
                            ? supabase.from("Employees").select("id, full_name, photo_url").in("id", performerIds)
                            : Promise.resolve({ data: [], error: null }),
                        itemIds.length > 0
                            ? supabase.from("Products").select("sellable_item_id, name, image_url").in("sellable_item_id", itemIds)
                            : Promise.resolve({ data: [], error: null }),
                    ]);

                    const serviceMap = new Map<string, { name?: string; image_url?: string | null }>(
                        ((servicesDefsResult.data as any[]) || []).map((s: any) => [s.sellable_item_id, s])
                    );
                    const performerMap = new Map<string, { full_name?: string; photo_url?: string | null }>(
                        ((performersResult.data as any[]) || []).map((e: any) => [e.id, e])
                    );
                    const productMap = new Map<string, { name?: string; image_url?: string | null }>(
                        ((productsDefsResult.data as any[]) || []).map((p: any) => [p.sellable_item_id, p])
                    );

                    // services_json: только записи, sellable_item_id которых есть в Services и НЕТ в Products
                    // (товары исключаем, чтобы не дублировались в "Другие услуги" и не задваивали сумму)
                    const builtServicesJson = apptServices
                        .filter((s: any) => !productMap.has(s.sellable_item_id))
                        .map((s: any) => {
                            const def = serviceMap.get(s.sellable_item_id);
                            const perf = s.performer_id ? performerMap.get(s.performer_id) : null;
                            return {
                                id: s.sellable_item_id,
                                service_id: s.sellable_item_id,
                                name: def?.name ?? "",
                                price: Number(s.price) || 0,
                                quantity: s.quantity || 1,
                                image_url: def?.image_url ?? null,
                                performer_id: s.performer_id ?? null,
                                doctor_id: s.performer_id ?? null,
                                performer_name: perf?.full_name ?? null,
                                doctor_name: perf?.full_name ?? null,
                                performer_photo: perf?.photo_url ?? null,
                                doctor_photo: perf?.photo_url ?? null,
                            };
                        });

                    mapped = { ...mapped, services_json: builtServicesJson, parsed_services: builtServicesJson };

                    // appointmentProducts — только те, чьи sellable_item_id есть в Products
                    if (productMap.size > 0) {
                        appointmentProducts = apptServices
                            .filter((s: any) => productMap.has(s.sellable_item_id))
                            .map((s: any) => {
                                const def = productMap.get(s.sellable_item_id)!;
                                return {
                                    sellable_item_id: s.sellable_item_id,
                                    name: def.name || "",
                                    price: (s.price as number) || 0,
                                    quantity: s.quantity || 1,
                                    image_url: def.image_url || null,
                                };
                            });
                    }
                }

                return {
                    item: mapped,
                    patientData: patientData || null,
                    appointmentDoctors: [],
                    appointmentProducts,
                    servicesPhotos: new Map(),
                    notifications,
                };
            } catch (err) {
                console.error("[useAppointmentDetails] Unexpected error:", err);
                throw err;
            }
        },
        enabled: !!appointmentId,
        staleTime: 30 * 1000, // 30 seconds — повторный клик на ту же карточку не делает запрос
    });

    const refresh = () => {
        if (appointmentId) {
            queryClient.invalidateQueries({ queryKey: ['appointment-details', appointmentId] });
        }
        return refetch();
    };

    return {
        item: data?.item || null,
        patientData: data?.patientData || null,
        appointmentDoctors: data?.appointmentDoctors || [],
        appointmentProducts: data?.appointmentProducts || [],
        servicesPhotos: data?.servicesPhotos || new Map(),
        notifications: data?.notifications || [],
        loading: isLoading,
        error: error instanceof Error ? error.message : null,
        refresh
    };
};
