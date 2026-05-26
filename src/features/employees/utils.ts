import dayjs from "dayjs";

export interface SalaryRules {
    fixed_salary?: {
        enabled?: boolean;
        night_hourly_rate?: number;
        day_hourly_rate?: number;
        appointment_rate?: number;
    };
    dynamic_rules?: {
        services: string[];
        percent: number;
        fixed_amount: number;
    }[];
}

export interface CalculationResult {
    dayHours: number;
    nightHours: number;
    hoursSum: number;
    dayHoursSum: number;
    nightHoursSum: number;
    distributedAppointments: number;
    createdByCount: number;
    appointmentsCount: number;
    percentSum: number;
    totalCount: number;
    waitingCount: number;
    cancelledCount: number;
    discountedCount: number;
    discountSum: number;
    paidCount: number;
    paidSum: number;
    expensesSum: number;
    totalSalary: number;
    hasWarning?: boolean;
}

export function calculateEmployeeSalary(
    shifts: any[],
    appointments: any[],
    rules: SalaryRules,
    employeeId: string,
    expenses: any[] = [],
    distributedCountOverride?: number
): CalculationResult {
    const fixed = (rules.fixed_salary && rules.fixed_salary.enabled) 
        ? rules.fixed_salary 
        : { night_hourly_rate: 0, day_hourly_rate: 0, appointment_rate: 0 };
    
    // 1. Calculate hours from shifts
    let dayHours = 0;
    let nightHours = 0;
    let hasWarning = false;

    shifts.forEach(s => {
        if (s.clock_in && s.clock_out) {
            const start = dayjs(s.clock_in);
            let end = dayjs(s.clock_out);
            let totalDuration = end.diff(start, 'hour', true);

            if (totalDuration > 0) {
                // Safety Cap: If shift > 36h, it's likely a forgotten clock-out
                if (totalDuration > 36) {
                    end = start.add(36, 'hour');
                    totalDuration = 36;
                    hasWarning = true;
                }

                // Optimized splitting: Calculate overlaps with day periods
                const DAY_START_H = 9;  // 09:00
                const DAY_END_H = 18;   // 18:00
                
                let shiftDayHours = 0;
                let shiftNightHours = 0;

                // Process each day involved in the shift
                let current = start;
                while (current.isBefore(end)) {
                    const nextDay = current.add(1, 'day').startOf('day');
                    const segmentEnd = nextDay.isAfter(end) ? end : nextDay;
                    
                    const dayStart = current.set('hour', DAY_START_H).set('minute', 0).set('second', 0).set('millisecond', 0);
                    const dayEnd = current.set('hour', DAY_END_H).set('minute', 0).set('second', 0).set('millisecond', 0);
                    
                    // Intersection with Day (09:00-18:00)
                    const dayOverlapStart = current.isAfter(dayStart) ? current : dayStart;
                    const dayOverlapEnd = segmentEnd.isBefore(dayEnd) ? segmentEnd : dayEnd;
                    
                    const overlapDay = Math.max(0, dayOverlapEnd.diff(dayOverlapStart, 'hour', true));
                    const totalSegment = segmentEnd.diff(current, 'hour', true);
                    
                    shiftDayHours += overlapDay;
                    shiftNightHours += (totalSegment - overlapDay);
                    
                    current = segmentEnd;
                }

                dayHours += shiftDayHours;
                nightHours += shiftNightHours;
            }
        }
    });

    // 2. Metrics calculation (using all appointments provided)
    let totalCount = 0;
    let waitingCount = 0;
    let cancelledCount = 0;
    let discountedCount = 0;
    let discountSum = 0;
    let paidCount = 0;
    let paidSum = 0;

    const empAppointments = appointments.filter(a => {
        let performerIds: string[] = [];
        if (Array.isArray(a.performer_ids)) {
            performerIds = a.performer_ids;
        } else if (typeof a.performer_ids === 'string' && a.performer_ids) {
            performerIds = a.performer_ids.replace(/^\{|\}$/g, '').split(',').map((s: string) => s.trim()).filter(Boolean);
        }
        const isPerformer = a.doctor_id === employeeId || performerIds.includes(employeeId);
        if (!isPerformer) return false;

        totalCount++;

        if (a.status === 'Ожидаем' || a.status === 'Пациент здесь') {
            waitingCount++;
        }

        if (a.status === 'Отменено' || a.status === 'Пациент не пришел') {
            cancelledCount++;
        }

        if (a.status === 'Со скидкой' || a.status === 'Бесплатно') {
            discountedCount++;
            discountSum += Number(a.discount || 0);
        }

        if (a.status === 'Оплачено' || a.status === 'Частично оплачено' || a.status === 'Со скидкой' || a.status === 'Бесплатно' || a.status === 'Завершено') {
            paidCount++;
            paidSum += Number(a.paid_cash || 0) + Number(a.paid_card || 0) + Number(a.paid_balance || 0);
        }

        return true;
    });

    // 2.1 filter only NOT cancelled for salary calculation
    const validAppointments = empAppointments.filter(a => a.status !== "Отменено");
    const paidAppointments = validAppointments.filter(a => a.status === "Оплачено" || a.status === "Частично оплачено" || a.status === "Со скидкой" || a.status === "Бесплатно" || a.status === "Завершено");

    const dayHoursPay = dayHours * (fixed.day_hourly_rate || 0);
    const nightHoursPay = nightHours * (fixed.night_hourly_rate || 0);
    const hoursPay = dayHoursPay + nightHoursPay;
    // For registrators: use distributed count instead of directly linked appointments
    const effectiveApptCount = distributedCountOverride !== undefined
        ? distributedCountOverride
        : paidAppointments.length;
    const apptsFixedPay = effectiveApptCount * (fixed.appointment_rate || 0);

    // Dynamic rules calculation
    let percentSum = 0;
    const dynamicRules = rules.dynamic_rules || [];

    paidAppointments.forEach(appt => {
        const servicesJSON = appt.services_json;
        let servicesArr: any[] = [];

        if (typeof servicesJSON === 'string') {
            try { servicesArr = JSON.parse(servicesJSON); } catch (e) { }
        } else if (Array.isArray(servicesJSON)) {
            servicesArr = servicesJSON;
        }

        // Calculate real payment factor for this appointment
        // We use paid_cash + paid_card + paid_balance as "real money"
        const realPaymentsSum = Number(appt.paid_cash || 0) + Number(appt.paid_card || 0) + Number(appt.paid_balance || 0);
        // Nominal total is what SHOULD have been paid without discounts, or total_amount if total_cost is missing
        const nominalTotalSum = Number(appt.total_cost || appt.total_amount || 0);
        
        const paymentFactor = nominalTotalSum > 0 ? (realPaymentsSum / nominalTotalSum) : 0;

        servicesArr.forEach((srv: any) => {
            // Check if this employee is the performer for this service
            const srvPerformerId = srv.performer_id || srv.doctor_id;
            
            // Normalize performer_ids to array
            let performerIds: string[] = [];
            if (Array.isArray(appt.performer_ids)) {
                performerIds = appt.performer_ids;
            } else if (typeof appt.performer_ids === 'string') {
                performerIds = appt.performer_ids.replace(/{|}/g, '').split(',').map((s: string) => s.trim());
            }

            const isPerformer = srvPerformerId === employeeId || 
                               (appt.doctor_id === employeeId && !srvPerformerId) ||
                               (performerIds.includes(employeeId) && !srvPerformerId);

            if (isPerformer) {
                const rawName = srv.service_name || srv.name || "";
                const serviceName = String(rawName).trim().toLowerCase();
                
                const rule = dynamicRules.find((r: any) =>
                    Array.isArray(r.services) && r.services.some((sn: string) => {
                        const ruleSvcName = String(sn).trim().toLowerCase();
                        return ruleSvcName === serviceName || serviceName.includes(ruleSvcName) || ruleSvcName.includes(serviceName);
                    })
                );

                if (rule) {
                    // Support multiple price field names
                    const servicePriceFromSrv = Number(srv.price ?? srv.cost ?? srv.total ?? srv.amount ?? 0);
                    
                    // Base nominal price for calculation
                    let nominalPrice = servicePriceFromSrv;
                    if (nominalPrice <= 0 && servicesArr.length === 1) {
                        nominalPrice = Number(appt.total_cost || appt.total_amount || 0);
                    }

                    // ADJUST PRICE based on real money received
                    const finalPrice = nominalPrice * paymentFactor;

                    if (Number(rule.percent || 0) > 0 && finalPrice > 0) {
                        percentSum += (finalPrice * Number(rule.percent || 0)) / 100;
                    }
                    if (Number(rule.fixed_amount || 0) > 0) {
                        // Fixed amount usually shouldn't be adjusted by factor, 
                        // but if payment is 0, we should probably not pay it either.
                        // However, if it's "fixed_amount per service", we pay it if there's any money?
                        // User said: "оплата там 0 и делить и бонусировать не из чего".
                        // So if paymentFactor is 0, we don't pay fixed amount either.
                        if (paymentFactor > 0) {
                            percentSum += Number(rule.fixed_amount || 0);
                        }
                    }
                }
            }
        });
    });

    // 3. Calculate expenses (both "Аванс" and "Заработная плата" categories)
    const myExpenses = expenses.filter(exp => exp.employee_id === employeeId);
    const expensesSum = myExpenses
        .filter(exp => {
            const joinedCat = Array.isArray(exp.ExpenseCategories)
                ? exp.ExpenseCategories[0]?.name
                : exp.ExpenseCategories?.name;
            const catName = (joinedCat || exp.category || "").toLowerCase();
            return catName.includes("аванс") || catName.includes("заработная плата") || catName.includes("зп");
        })
        .reduce((sum, exp) => sum + (Number(exp.total_amount) || 0), 0);

    const earnings = hoursPay + apptsFixedPay + percentSum;
    const netSalary = earnings - expensesSum;

    return {
        dayHours: Math.round(dayHours * 10) / 10,
        nightHours: Math.round(nightHours * 10) / 10,
        hoursSum: Math.round((hoursPay + apptsFixedPay) * 100) / 100,
        dayHoursSum: Math.round(dayHoursPay * 100) / 100,
        nightHoursSum: Math.round(nightHoursPay * 100) / 100,
        distributedAppointments: 0,
        createdByCount: 0,
        appointmentsCount: validAppointments.length,
        percentSum: Math.round(percentSum * 100) / 100,
        totalCount,
        waitingCount,
        cancelledCount,
        discountedCount,
        discountSum: Math.round(discountSum * 100) / 100,
        paidCount,
        paidSum: Math.round(paidSum * 100) / 100,
        expensesSum: Math.round(expensesSum * 100) / 100,
        totalSalary: Math.round(netSalary * 100) / 100,
        hasWarning
    };
}
