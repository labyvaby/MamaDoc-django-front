import { supabase } from "../utility/supabaseClient";

export type Product = {
  sellable_item_id: string;
  name: string;
  description?: string;
  category?: string;
  barcode?: string;
  unit?: string;
  is_for_sale?: boolean;
  is_infusion?: boolean;
  image_url?: string;
  comment?: string;
  created_at: string;
  updated_at: string;
  // Augmented fields from joins
  price?: number;
  stock?: number;
};

export type CreateProductData = {
  name: string;
  description?: string;
  category?: string;
  barcode?: string;
  unit?: string;
  is_for_sale?: boolean;
  is_infusion?: boolean;
  image_url?: string;
  comment?: string;
  price?: number;
  stock?: number;
};

export type UpdateProductData = Partial<CreateProductData>;



export const getPrimaryWarehouseId = async () => {
    const { data, error } = await supabase
        .from("Warehouses")
        .select("id")
        .order("is_primary", { ascending: false })
        .limit(1)
        .maybeSingle();
    
    if (error) console.error("Error fetching warehouse:", error);
    return data?.id;
}

export const getProducts = async () => {
  // 1. Fetch Products
  const { data: products, error } = await supabase
    .from("Products")
    .select(`
      sellable_item_id,
      name,
      description,
      category,
      barcode,
      unit,
      is_for_sale,
      is_infusion,
      image_url,
      comment,
      created_at,
      updated_at
    `)
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!products || products.length === 0) return [];

  const ids = products.map((p) => p.sellable_item_id).filter(id => id);

  // 2. Fetch Prices
  let pricesMap = new Map<string, number>();
  if (ids.length > 0) {
    const { data: prices } = await supabase
      .from("Prices")
      .select("sellable_item_id, price")
      .eq("is_current", true)
      .in("sellable_item_id", ids);

    if (prices) {
      prices.forEach((p) => {
        pricesMap.set(p.sellable_item_id, p.price);
      });
    }
  }

  // 3. Fetch Stock (Inventory)
  // Note: Inventory view usually aggregates by product_id
  let stockMap = new Map<string, number>();
  if (ids.length > 0) {
      const { data: inventory } = await supabase
        .from("Inventory")
        .select("product_id, quantity")
        .in("product_id", ids);
      
      if (inventory) {
          inventory.forEach((i: any) => {
              // Inventory view might have multiple rows per product if warehouses are involved, 
              // but here we just sum them up or assume unique product_id if aggregated.
              // Let's assume the View returns aggregated or we sum it.
              const prev = stockMap.get(i.product_id) || 0;
              stockMap.set(i.product_id, prev + (i.quantity || 0));
          });
      }
  }


  // 4. Merge
  const merged = products.map((p: Record<string, unknown>) => {
      const id = p.sellable_item_id as string;
      return {
          sellable_item_id: id,
          name: p.name as string,
          description: p.description as string | undefined,
          category: p.category as string | undefined,
          barcode: p.barcode as string | undefined,
          unit: p.unit as string | undefined,
          is_for_sale: p.is_for_sale as boolean | undefined,
          is_infusion: p.is_infusion as boolean | undefined,
          image_url: p.image_url as string | undefined,
          comment: p.comment as string | undefined,
          created_at: p.created_at as string,
          updated_at: p.updated_at as string,
          price: pricesMap.get(id),
          stock: stockMap.get(id) || 0
      };
  });

  return merged as Product[];
};

export const createProduct = async (productData: CreateProductData) => {
  // 1. Create SellableItem
  const { data: sellableItem, error: sellableError } = await supabase
    .from("SellableItems")
    .insert([{ 
        type: "product",
        is_active: productData.is_for_sale ?? true 
    }])
    .select()
    .single();

  if (sellableError) throw sellableError;
  const sellableId = sellableItem.id;

  try {
      // 2. Create Product
      const { data: product, error: productError } = await supabase
        .from("Products")
        .insert([{
            sellable_item_id: sellableId,
            name: productData.name,
            description: productData.description,
            category: productData.category,
            barcode: productData.barcode,
            unit: productData.unit,
            is_for_sale: productData.is_for_sale,
            is_infusion: productData.is_infusion,
            image_url: productData.image_url,
            comment: productData.comment,
        }])
        .select()
        .single();

      if (productError) throw productError;

      // 3. Create Price (if provided)
      if (productData.price !== undefined) {
          await supabase.from("Prices").insert([{
              sellable_item_id: sellableId,
              price: productData.price,
              is_current: true
          }]);
      }

      // 4. Create Inventory (if stock provided)
      const warehouseId = await getPrimaryWarehouseId();
      if (warehouseId && productData.stock !== undefined) {
          const { error: stockError } = await supabase.from("StockMovements").insert([{
              product_id: sellableId,
              warehouse_id: warehouseId,
              quantity: productData.stock,
              move_type: "receipt",
              // We use Selling Price as proxy for Cost Price for initial stock
              unit_cost: (productData.price || 0) * productData.stock,
              created_at: new Date().toISOString()
          }]);
          if (stockError) throw stockError;
      }

       return product as Product;
  } catch (err) {
      console.error("Error in createProduct flow, attempting cleanup...", err);
      // Cleanup sellable item if product creation failed
      await supabase.from("SellableItems").delete().eq("id", sellableId);
      throw err;
  }
};

export const updateProduct = async (id: string, productData: UpdateProductData) => {
  // Update Product Table
  const { data, error } = await supabase
    .from("Products")
    .update({
        name: productData.name,
        description: productData.description,
        category: productData.category,
        barcode: productData.barcode,
        unit: productData.unit,
        is_for_sale: productData.is_for_sale,
        is_infusion: productData.is_infusion,
        image_url: productData.image_url,
        comment: productData.comment,
    })
    .eq("sellable_item_id", id)
    .select()
    .single();

  if (error) throw error;
  
  // Update SellableItems (is_active)
  if (productData.is_for_sale !== undefined) {
      await supabase.from("SellableItems").update({ is_active: productData.is_for_sale }).eq("id", id);
  }

  // Update Price
  if (productData.price !== undefined) {
      const { data: currentPrice } = await supabase.from("Prices").select("id").eq("sellable_item_id", id).eq("is_current", true).limit(1).maybeSingle();
      
      if (currentPrice) {
          await supabase.from("Prices").update({ price: productData.price }).eq("id", currentPrice.id);
      } else {
          await supabase.from("Prices").insert([{ sellable_item_id: id, price: productData.price, is_current: true }]);
      }
  }

   // Update Stock
   const warehouseId = await getPrimaryWarehouseId();
   if (warehouseId && productData.stock !== undefined) {
        // Calculate current stock to find diff uses Inventory view which is faster
        const { data: inv } = await supabase
            .from("Inventory")
            .select("quantity")
            .eq("product_id", id)
            .eq("warehouse_id", warehouseId)
            .maybeSingle();
        
        const currentStock = inv?.quantity || 0;
        const diff = productData.stock - currentStock;

        if (diff !== 0) {
            // Fetch current price if not provided in update
            let currentPriceVal = productData.price;
            if (currentPriceVal === undefined) {
                 const { data: pPrice } = await supabase.from("Prices").select("price").eq("sellable_item_id", id).eq("is_current", true).limit(1).maybeSingle();
                 currentPriceVal = pPrice?.price || 0;
            }

            const { error: stockError } = await supabase.from("StockMovements").insert([{ 
                product_id: id, 
                warehouse_id: warehouseId, 
                quantity: diff,
                move_type: "adjustment",
                // Use Price as proxy for Cost
                unit_cost: (currentPriceVal || 0) * diff,
                created_at: new Date().toISOString()
            }]);
            if (stockError) throw stockError;
        }
   }

  return data as Product;
};

export const deleteProduct = async (id: string) => {
    // 0. Check for sales history
    const { count } = await supabase
        .from("SaleLines")
        .select("*", { count: 'exact', head: true })
        .eq("sellable_item_id", id);

    if (count !== null && count > 0) {
        // Archive instead of delete
        const { data: current } = await supabase
            .from("Products")
            .select("name")
            .eq("sellable_item_id", id)
            .single();
            
        const newName = current?.name?.includes('(Архив)') 
            ? current.name 
            : `${current?.name} (Архив)`;

        // Update Product
        await supabase.from("Products").update({
            name: newName,
            is_for_sale: false
        }).eq("sellable_item_id", id);

        // Update SellableItem
        await supabase.from("SellableItems").update({ 
            is_active: false 
        }).eq("id", id);

        throw new Error("ARCHIVED");
    }

    // Correct deletion order: Dependents first
    // 1. Delete StockMovements
    await supabase.from("StockMovements").delete().eq("product_id", id);
    // 2. Delete Prices
    await supabase.from("Prices").delete().eq("sellable_item_id", id);
    // 3. Delete Products
    const { error: prodError } = await supabase.from("Products").delete().eq("sellable_item_id", id);
    if (prodError) throw prodError;
    // 4. Delete SellableItem
    const { error: sellableError } = await supabase.from("SellableItems").delete().eq("id", id);
    if (sellableError) throw sellableError;
};
