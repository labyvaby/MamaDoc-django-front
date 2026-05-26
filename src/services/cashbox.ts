
import { supabase } from "../utility/supabaseClient";

export type CashboxTransaction = {
    id: string;
    type: 'appointment' | 'sale' | 'expense' | 'supply';
    created_at: string;
    description: string;
    details?: string;
    cash_in: number;
    cash_out: number;
    card_in: number;
    card_out: number; // Usually 0, but maybe expenses are paid closely with card? Expenses have cashless_amount
    employee?: string;
    orig_data: any;
};

export type CashboxSummary = {
    cash_in: number;
    cash_out: number;
    card_in: number;
    card_out: number;
    total_cash: number;
    total_non_cash: number;
    total_balance: number;
};

export const getCashboxSummary = async (date?: string, monthStr?: string): Promise<CashboxSummary> => {
    const { data, error } = await supabase.rpc("get_cashbox_summary", {
        p_date: date ?? null,
        p_month: monthStr ?? null,
    });
    if (error) throw error;
    const row = data?.[0];
    return {
        cash_in: Number(row?.cash_in ?? 0),
        cash_out: Number(row?.cash_out ?? 0),
        card_in: Number(row?.card_in ?? 0),
        card_out: Number(row?.card_out ?? 0),
        total_cash: Number(row?.total_cash ?? 0),
        total_non_cash: Number(row?.total_non_cash ?? 0),
        total_balance: Number(row?.total_balance ?? 0),
    };
};

export const getCashboxData = async (date?: string, monthStr?: string) => {
    // Dates filter
    // If date provided: specific day
    // If month provided: specific month
    // If neither: All time or maybe limit to recently? Let's default to "today" if nothing, or handle in UI.
    // Actually typically we want a range. Let's start with flexible params.
    
    // We need to query 4 tables: Appointments, Sales, Expenses, StockMovements (Supply)
    
    // FETCH 1: Appointments (only columns needed for cashbox)
    let appointmentQuery = supabase
        .from("Appointments")
        .select("id, patient_id, paid_cash, paid_card, appointment_at, created_at")
        .neq("status", "Отменено");

    // FETCH 2: Sales
    let saleQuery = supabase.from("Sales").select("*, Patients(full_name)");

    // FETCH 3: Expenses
    let expenseQuery = supabase.from("Expenses").select("*, Employees(full_name)");

    // FETCH 4: StockMovements (Supply/Receipts)
    // We need product name (Products:product_id(name)) and maybe user who created it (created_by -> Employees?)
    // Note: StockMovements usually have created_by. Let's try to map it manually or if view exists.
    // We'll fetch raw and map created_by to Employees manually to be safe.
    let stockQuery = supabase.from("StockMovements")
        .select("*, Products(name)")
        .eq("move_type", "receipt");

    // Apply filters
    if (date) {
        const start = `${date}T00:00:00`;
        const end = `${date}T23:59:59`;
        appointmentQuery = appointmentQuery.gte("appointment_at", start).lte("appointment_at", end);
        saleQuery = saleQuery.gte("created_at", start).lte("created_at", end);
        expenseQuery = expenseQuery.gte("created_at", start).lte("created_at", end);
        stockQuery = stockQuery.gte("created_at", start).lte("created_at", end);
    } else if (monthStr) {
        const [y, m] = monthStr.split('-').map(Number);
        const start = `${monthStr}-01T00:00:00`;
        const nextMonthDate = new Date(y, m, 1); 
        const nextMonthIso = nextMonthDate.toISOString().split('T')[0];
        
        appointmentQuery = appointmentQuery.gte("appointment_at", start).lt("appointment_at", nextMonthIso);
        saleQuery = saleQuery.gte("created_at", start).lt("created_at", nextMonthIso);
        expenseQuery = expenseQuery.gte("created_at", start).lt("created_at", nextMonthIso);
        stockQuery = stockQuery.gte("created_at", start).lt("created_at", nextMonthIso);
    }

    const [appointmentsRes, salesRes, expensesRes, stockRes] = await Promise.all([
        appointmentQuery,
        saleQuery,
        expenseQuery,
        stockQuery
    ]);

    if (appointmentsRes.error) throw appointmentsRes.error;
    if (salesRes.error) throw salesRes.error;
    if (expensesRes.error) throw expensesRes.error;
    if (stockRes.error) throw stockRes.error;

    const appointments = appointmentsRes.data || [];
    const sales = salesRes.data || [];
    const expenses = expensesRes.data || [];

    const supplies = stockRes.data || [];

    // --- MANUAL FETCH FOR RELATIONS ---
    // Extract IDs for Employees (Doctors, Sale creators, Stock creators) and Patients
    const employeeIds = new Set<string>();
    const patientIds = new Set<string>();
    
    // Appointments
    appointments.forEach((a: any) => {
        if (a.doctor_id) employeeIds.add(a.doctor_id);
        if (a.patient_id) patientIds.add(a.patient_id);
    });

    // Sales (created_by for employee?) 
    // Sales usually have created_by column from supabase auth. 
    // We assume created_by maps to an Employee ID (or we query auth.users/Employees). 
    // In this system, Employees table ID usually matches auth.uid OR they are linked.
    // Let's assume created_by is the key.
    sales.forEach((s: any) => {
        if (s.created_by) employeeIds.add(s.created_by);
        // Patient already joined but let's be safe if join failed? 
        // We kept existing join "Patients(full_name)" for sales.
    });

    // Stock
    supplies.forEach((s: any) => {
        if (s.created_by) employeeIds.add(s.created_by);
    });

    const empIdsArr = Array.from(employeeIds);
    const patIdsArr = Array.from(patientIds);

    let employeesMap: Record<string, string> = {};
    let patientsMap: Record<string, string> = {};

    if (empIdsArr.length > 0) {
        // We need to find Employees where id matches.
        const { data: emps } = await supabase
            .from("Employees")
            .select("id, full_name")
            .in("id", empIdsArr);
        emps?.forEach((d: any) => {
            employeesMap[d.id] = d.full_name;
        });
    }

    if (patIdsArr.length > 0) {
        const { data: pats } = await supabase
            .from("Patients")
            .select("id, full_name")
            .in("id", patIdsArr);
        pats?.forEach((p: any) => {
            patientsMap[p.id] = p.full_name;
        });
    }
    // -----------------------------------------------

    // Normalize
    const transactions: CashboxTransaction[] = [];

    // 1. Appointments (Income)
    appointments.forEach((a: any) => {
        const cash = Number(a.paid_cash || 0);
        const card = Number(a.paid_card || 0);
        // if (cash === 0 && card === 0) return; // Allow zero-sum appointments to appear in cashbox history 

        // Resolve names manually
        const docName = a.doctor_id ? employeesMap[a.doctor_id] : undefined;
        const patName = a.patient_id ? patientsMap[a.patient_id] : 'Без имени';

        transactions.push({
            id: a.id,
            type: 'appointment',
            created_at: a.created_at || a.appointment_at, 
            description: `Прием: ${patName}`,
            details: docName ? `Врач: ${docName}` : undefined,
            cash_in: cash,
            cash_out: 0,
            card_in: card,
            card_out: 0,
            orig_data: a
        });
    });

    // 2. Sales (Income)
    sales.forEach((s: any) => {
        let cash = Number(s.paid_cash || 0);
        let card = Number(s.paid_card || 0);
        
        // Even if 0, show it but maybe imply it's unpaid or just 0 flow?
        // User said "sales not showing". If they strictly want flow, 0 is no flow.
        // But if they want to see the EVENT, we should show it.
        // Let's show it.
        
        const empName = s.created_by ? employeesMap[s.created_by] : undefined;

        let cleanComment = s.comment;
        // Filter out auto-generated payment logs like "Оплата: Наличные..."
        if (cleanComment && cleanComment.startsWith("Оплата: ")) {
            cleanComment = undefined;
        }

        transactions.push({
            id: s.id,
            type: 'sale',
            created_at: s.created_at,
            description: `Продажа: ${s.Patients?.full_name || 'Покупатель'}`,
            details: empName ? `Сотрудник: ${empName}` : (cleanComment || undefined),
            cash_in: cash,
            cash_out: 0,
            card_in: card,
            card_out: 0,
            orig_data: s
        });
    });

    // 3. Expenses (Outcome)
    expenses.forEach((e: any) => {
        const cash = Number(e.cash_amount || 0);
        const card = Number(e.cashless_amount || 0);

        if (cash === 0 && card === 0) return;

        transactions.push({
            id: e.id,
            type: 'expense',
            created_at: e.created_at,
            description: `Расход: ${e.name}`,
            details: e.Employees?.full_name ? `Сотрудник: ${e.Employees.full_name}` : undefined,
            cash_in: 0,
            cash_out: cash,
            card_in: 0,
            card_out: card,
            orig_data: e
        });
    });

    // 4. Supplies (Stock Receipts) - Treated as Outcome (Purchase of goods)
    supplies.forEach((sup: any) => {
        const quantity = Number(sup.quantity || 0);
        const unitCost = Number(sup.unit_cost || 0);
        const totalCost = quantity * unitCost;

        if (totalCost <= 0) return; // Ignore zero cost arrivals?

        const empName = sup.created_by ? employeesMap[sup.created_by] : undefined;

        transactions.push({
            id: sup.id,
            type: 'supply',
            created_at: sup.created_at,
            description: `Приход товара: ${sup.Products?.name || 'Товар'}`,
            details: empName ? `Сотрудник: ${empName}` : undefined,
            cash_in: 0,
            cash_out: totalCost, // Assume paid in cash/mixed? 
            // We don't know if it was cash or card. 
            // Usually small supplies are cash, big ones transfer.
            // For now, let's treat as CASH OUT by default or maybe we need a column in Stock for payment type?
            // "Arrival of goods is also minus on cashbox" -> typically implies cash.
            // Let's put it in CASH OUT for now.
            // Or split if we knew. We don't.
            card_in: 0,
            card_out: 0, 
            orig_data: sup
        });
    });

    // Sort by date desc
    transactions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Calc Summary
    const summary: CashboxSummary = {
        cash_in: 0,
        cash_out: 0,
        card_in: 0,
        card_out: 0,
        total_cash: 0,
        total_non_cash: 0,
        total_balance: 0
    };

    transactions.forEach(t => {
        summary.cash_in += t.cash_in;
        summary.cash_out += t.cash_out;
        summary.card_in += t.card_in;
        summary.card_out += t.card_out;
    });

    summary.total_cash = summary.cash_in - summary.cash_out;
    summary.total_non_cash = summary.card_in - summary.card_out;
    summary.total_balance = summary.total_cash + summary.total_non_cash;

    return { transactions, summary };
};
