begin;

alter table public.products
add column if not exists max_stock numeric(18, 3);

alter table public.products
drop constraint if exists products_max_stock_nonnegative;

alter table public.products
add constraint products_max_stock_nonnegative
check (max_stock is null or max_stock >= 0);

create or replace function public.create_product_with_stock_v2(
  p_name text,
  p_sku text,
  p_barcode text,
  p_description text,
  p_category_id uuid,
  p_supplier_id uuid,
  p_warehouse_id uuid,
  p_unit text,
  p_purchase_price numeric,
  p_sale_price numeric,
  p_initial_stock numeric,
  p_min_stock numeric,
  p_max_stock numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product_id uuid;
begin
  if p_max_stock is not null and p_max_stock < 0 then
    raise exception 'El stock máximo no puede ser negativo.';
  end if;

  if p_max_stock is not null and p_max_stock < coalesce(p_min_stock, 0) then
    raise exception 'El stock máximo no puede ser menor que el stock mínimo.';
  end if;

  v_product_id := public.create_product_with_stock(
    p_name,
    p_sku,
    p_barcode,
    p_description,
    p_category_id,
    p_supplier_id,
    p_warehouse_id,
    p_unit,
    p_purchase_price,
    p_sale_price,
    p_initial_stock,
    p_min_stock
  );

  update public.products
  set max_stock = p_max_stock
  where id = v_product_id;

  return v_product_id;
end;
$$;

revoke all on function public.create_product_with_stock_v2(
  text, text, text, text, uuid, uuid, uuid, text,
  numeric, numeric, numeric, numeric, numeric
) from public, anon, authenticated;

grant execute on function public.create_product_with_stock_v2(
  text, text, text, text, uuid, uuid, uuid, text,
  numeric, numeric, numeric, numeric, numeric
) to authenticated;

create or replace function public.import_inventory_products(
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_default_warehouse_id uuid;
  v_row jsonb;
  v_category_id uuid;
  v_supplier_id uuid;
  v_warehouse_id uuid;
  v_product_id uuid;
  v_name text;
  v_category text;
  v_supplier text;
  v_description text;
  v_unit text;
  v_warehouse text;
  v_purchase_price numeric;
  v_sale_price numeric;
  v_initial_stock numeric;
  v_min_stock numeric;
  v_max_stock numeric;
  v_created integer := 0;
  v_skipped integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'Debes iniciar sesión para importar productos.';
  end if;

  select membership.organization_id
  into v_organization_id
  from public.organization_members as membership
  where membership.user_id = (select auth.uid())
    and membership.role in (
      'owner'::public.member_role,
      'admin'::public.member_role
    )
  order by membership.created_at
  limit 1;

  if v_organization_id is null then
    raise exception 'Solo un propietario o administrador puede importar datos.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_organization_id::text, 0)
  );

  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'El contenido de importación no es válido.';
  end if;

  if jsonb_array_length(p_rows) > 1000 then
    raise exception 'Cada importación admite hasta 1000 filas.';
  end if;

  select warehouse.id
  into v_default_warehouse_id
  from public.warehouses as warehouse
  where warehouse.organization_id = v_organization_id
  order by warehouse.is_default desc, warehouse.created_at
  limit 1;

  if v_default_warehouse_id is null then
    insert into public.warehouses (organization_id, name, is_default)
    values (v_organization_id, 'Almacén principal', true)
    returning id into v_default_warehouse_id;
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_name := nullif(btrim(v_row ->> 'name'), '');
    v_category := nullif(btrim(v_row ->> 'category'), '');
    v_supplier := nullif(btrim(v_row ->> 'supplier'), '');
    v_description := nullif(btrim(v_row ->> 'description'), '');
    v_unit := coalesce(nullif(btrim(v_row ->> 'unit'), ''), 'unidad');
    v_warehouse := nullif(btrim(v_row ->> 'warehouse'), '');
    v_purchase_price := coalesce((v_row ->> 'purchasePrice')::numeric, 0);
    v_sale_price := coalesce((v_row ->> 'salePrice')::numeric, 0);
    v_initial_stock := coalesce((v_row ->> 'initialStock')::numeric, 0);
    v_min_stock := coalesce((v_row ->> 'minStock')::numeric, 0);
    v_max_stock := case
      when v_row ->> 'maxStock' is null or btrim(v_row ->> 'maxStock') = ''
        then null
      else (v_row ->> 'maxStock')::numeric
    end;

    if v_name is null or char_length(v_name) > 140 then
      raise exception 'Hay una fila con nombre vacío o demasiado largo.';
    end if;

    if char_length(v_unit) > 24 then
      raise exception 'Hay una unidad de medida demasiado larga.';
    end if;

    if coalesce(char_length(v_category), 0) > 60
      or coalesce(char_length(v_supplier), 0) > 120
      or coalesce(char_length(v_description), 0) > 500
      or coalesce(char_length(v_warehouse), 0) > 120 then
      raise exception 'La importación contiene texto demasiado largo.';
    end if;

    if v_purchase_price < 0 or v_sale_price < 0 or v_initial_stock < 0
      or v_min_stock < 0 or coalesce(v_max_stock, 0) < 0 then
      raise exception 'La importación contiene precios o cantidades negativas.';
    end if;

    if v_max_stock is not null and v_max_stock < v_min_stock then
      raise exception 'La importación contiene un stock máximo menor al mínimo.';
    end if;

    v_category_id := null;
    if v_category is not null then
      insert into public.categories (organization_id, name, color)
      values (v_organization_id, v_category, '#0ea5e9')
      on conflict do nothing;

      select category.id
      into v_category_id
      from public.categories as category
      where category.organization_id = v_organization_id
        and lower(btrim(category.name)) = lower(v_category)
      order by category.created_at
      limit 1;
    end if;

    v_supplier_id := null;
    if v_supplier is not null then
      insert into public.suppliers (organization_id, name)
      values (v_organization_id, v_supplier)
      on conflict do nothing;

      select supplier.id
      into v_supplier_id
      from public.suppliers as supplier
      where supplier.organization_id = v_organization_id
        and lower(btrim(supplier.name)) = lower(v_supplier)
      order by supplier.created_at
      limit 1;
    end if;

    v_warehouse_id := v_default_warehouse_id;
    if v_warehouse is not null then
      select warehouse.id
      into v_warehouse_id
      from public.warehouses as warehouse
      where warehouse.organization_id = v_organization_id
        and lower(btrim(warehouse.name)) = lower(v_warehouse)
      order by warehouse.created_at
      limit 1;

      if v_warehouse_id is null then
        insert into public.warehouses (organization_id, name, is_default)
        values (v_organization_id, v_warehouse, false)
        returning id into v_warehouse_id;
      end if;
    end if;

    select product.id
    into v_product_id
    from public.products as product
    where product.organization_id = v_organization_id
      and lower(regexp_replace(btrim(product.name), '\s+', ' ', 'g')) =
        lower(regexp_replace(v_name, '\s+', ' ', 'g'))
      and lower(btrim(product.unit)) = lower(v_unit)
    order by product.created_at
    limit 1;

    if v_product_id is not null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    perform public.create_product_with_stock_v2(
      v_name,
      null,
      null,
      v_description,
      v_category_id,
      v_supplier_id,
      v_warehouse_id,
      v_unit,
      v_purchase_price,
      v_sale_price,
      v_initial_stock,
      v_min_stock,
      v_max_stock
    );
    v_created := v_created + 1;
  end loop;

  return jsonb_build_object(
    'created', v_created,
    'skipped', v_skipped
  );
end;
$$;

revoke all on function public.import_inventory_products(jsonb)
from public, anon, authenticated;

grant execute on function public.import_inventory_products(jsonb)
to authenticated;

create or replace function public.clear_inventory_data(
  p_confirmation text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Debes iniciar sesión para borrar los datos.';
  end if;

  if upper(btrim(coalesce(p_confirmation, ''))) <> 'BORRAR TODO' then
    raise exception 'Escribe BORRAR TODO para confirmar la operación.';
  end if;

  select membership.organization_id
  into v_organization_id
  from public.organization_members as membership
  where membership.user_id = (select auth.uid())
    and membership.role = 'owner'::public.member_role
  order by membership.created_at
  limit 1;

  if v_organization_id is null then
    raise exception 'Solo el propietario puede borrar todos los datos.';
  end if;

  delete from public.inventory_movements
  where organization_id = v_organization_id;

  delete from public.inventory_balances
  where organization_id = v_organization_id;

  delete from public.products
  where organization_id = v_organization_id;

  delete from public.categories
  where organization_id = v_organization_id;

  delete from public.suppliers
  where organization_id = v_organization_id;

  delete from public.movement_reasons
  where organization_id = v_organization_id;

  delete from public.warehouses
  where organization_id = v_organization_id
    and is_default = false;
end;
$$;

revoke all on function public.clear_inventory_data(text)
from public, anon, authenticated;

grant execute on function public.clear_inventory_data(text)
to authenticated;

comment on column public.products.max_stock is
  'Nivel objetivo opcional para reposición e importación desde Excel.';

comment on function public.import_inventory_products(jsonb) is
  'Importa hasta 1000 productos, crea catálogos faltantes y omite coincidencias.';

comment on function public.clear_inventory_data(text) is
  'Borra los datos operativos de la organización conservando cuenta, empresa y almacén principal.';

commit;
