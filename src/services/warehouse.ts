
import { supabase } from "../utility/supabaseClient";

export type Warehouse = {
    id: string;
    name: string;
    address?: string;
    is_primary: boolean;
    created_at: string;
};

export type StockItem = {
    warehouse_id: string;
    product_id: string;
    quantity: number;
    last_updated: string;
    // Joined fields
    product_name?: string;
    product_image?: string;
    product_barcode?: string;
    product_unit?: string;
    product_category?: string;
};

export type StockMovement = {
    id: string;
    warehouse_id: string;
    product_id: string;
    quantity: number;
    move_type: 'receipt' | 'consumption' | 'adjustment' | 'transfer_in' | 'transfer_out';
    payment_method?: 'cash' | 'cashless';
    created_at: string;
    created_by?: string; // uuid
    reference_id?: string;
    reference_table?: string; // 'Sales', 'Appointments' etc
    unit_cost?: number; // Cost price at the moment
    comment?: string;
    // Joined fields
    product_name?: string;
    user_name?: string; // created_by name
};

export const getWarehouses = async () => {
    const { data, error } = await supabase
        .from("Warehouses")
        .select("*")
        .order("is_primary", { ascending: false })
        .order("name");
    
    if (error) throw error;
    return data as Warehouse[];
};

export const getInventory = async (warehouseId?: string) => {
    let query = supabase
        .from("Inventory")
        .select(`
            *,
            Products:product_id (name, image_url, barcode, unit, category)
        `);
    
    if (warehouseId) {
        query = query.eq("warehouse_id", warehouseId);
    }

    const { data, error } = await query;

    if (error) throw error;

    return data.map((item: any) => ({
        ...item,
        product_name: item.Products?.name,
        product_image: item.Products?.image_url,
        product_barcode: item.Products?.barcode,
        product_unit: item.Products?.unit,
        product_category: item.Products?.category,
    })) as StockItem[];
};

export const getStockMovements = async (productId?: string, warehouseId?: string, limit = 50) => {
    let query = supabase
        .from("StockMovements")
        .select(`
            *,
            Products:product_id (name)
        `)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (productId) {
        query = query.eq("product_id", productId);
    }
    if (warehouseId) {
        query = query.eq("warehouse_id", warehouseId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return data.map((item: any) => ({
        ...item,
        product_name: item.Products?.name,
        user_name: item.Employees?.full_name || "Система", // Fallback
    })) as StockMovement[];
};

type CreateMovementParams = {
    warehouse_id: string;
    product_id: string;
    quantity: number;
    move_type: StockMovement['move_type'];
    payment_method?: StockMovement['payment_method'];
    created_by?: string;
    reference_id?: string;
    reference_table?: string;
    unit_cost?: number;
    comment?: string;
};

export const createStockMovement = async (params: CreateMovementParams) => {
    if (params.quantity === 0) return;

    const { error } = await supabase
        .from("StockMovements")
        .insert([{ 
            ...params,
            comment: params.comment || null 
        }]);

    if (error) throw error;
};

type UpdateMovementParams = {
    quantity?: number;
    payment_method?: StockMovement['payment_method'] | null;
    unit_cost?: number | null;
    comment?: string | null;
};

export const updateStockMovement = async (id: string, params: UpdateMovementParams) => {
    if (params.quantity === 0) {
        throw new Error("Количество не может быть равно нулю");
    }

    const payload: Record<string, unknown> = {};

    if (params.quantity !== undefined) payload.quantity = params.quantity;
    if (params.payment_method !== undefined) payload.payment_method = params.payment_method;
    if (params.unit_cost !== undefined) payload.unit_cost = params.unit_cost;
    if (params.comment !== undefined) payload.comment = params.comment || null;

    const { error } = await supabase
        .from("StockMovements")
        .update(payload)
        .eq("id", id);

    if (error) throw error;
};

export const createWarehouse = async (name: string, address: string = "", is_primary: boolean = false) => {
    const { data, error } = await supabase
        .from("Warehouses")
        .insert([{ name, address, is_primary }])
        .select()
        .single();
    if (error) throw error;
    return data;
};

export const updateWarehouse = async (id: string, data: { name?: string; address?: string; is_primary?: boolean }) => {
    const { error } = await supabase
        .from("Warehouses")
        .update(data)
        .eq("id", id);
    if (error) throw error;
};
