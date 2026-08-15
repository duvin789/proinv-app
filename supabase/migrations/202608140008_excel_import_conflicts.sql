begin;

create or replace function public.import_inventory_products_v2(
  p_rows jsonb,
  p_conflict_policy text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_default_warehouse_id uuid;
  v_policy text := lower(btrim(coalesce(p_conflict_policy, '')));
  v_row jsonb;
  v_product_id uuid;
  v_matching_product_ids uuid[];
  v_matching_product_count integer;
  v_category_id uuid;
  v_supplier_id uuid;
  v_warehouse_id uuid;
  v_name text;
  v_sku text;
  v_barcode text;
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
  v_has_sku boolean;
  v_has_barcode boolean;
  v_has_category boolean;
  v_has_supplier boolean;
  v_has_description boolean;
  v_has_unit boolean;
  v_has_warehouse boolean;
  v_has_purchase_price boolean;
  v_has_sale_price boolean;
  v_has_initial_stock boolean;
  v_has_min_stock boolean;
  v_has_max_stock boolean;
  v_created integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'Debes iniciar sesión para importar productos.';
  end if;

  if v_policy not in ('skip', 'update') then
    raise exception 'La política de coincidencias debe ser skip o update.';
  end if;

  if coalesce(jsonb_typeof(p_rows), 'null') <> 'array' then
    raise exception 'El contenido de importación no es válido.';
  end if;

  if jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 1000 then
    raise exception 'Cada importación admite entre 1 y 1000 filas.';
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
    v_has_sku := v_row ? 'sku'
      and nullif(btrim(v_row ->> 'sku'), '') is not null;
    v_has_barcode := v_row ? 'barcode'
      and nullif(btrim(v_row ->> 'barcode'), '') is not null;
    v_has_category := v_row ? 'category'
      and nullif(btrim(v_row ->> 'category'), '') is not null;
    v_has_supplier := v_row ? 'supplier'
      and nullif(btrim(v_row ->> 'supplier'), '') is not null;
    v_has_description := v_row ? 'description'
      and nullif(btrim(v_row ->> 'description'), '') is not null;
    v_has_unit := v_row ? 'unit'
      and nullif(btrim(v_row ->> 'unit'), '') is not null;
    v_has_warehouse := v_row ? 'warehouse'
      and nullif(btrim(v_row ->> 'warehouse'), '') is not null;
    v_has_purchase_price := v_row ? 'purchasePrice'
      and nullif(btrim(v_row ->> 'purchasePrice'), '') is not null;
    v_has_sale_price := v_row ? 'salePrice'
      and nullif(btrim(v_row ->> 'salePrice'), '') is not null;
    v_has_initial_stock := v_row ? 'initialStock'
      and nullif(btrim(v_row ->> 'initialStock'), '') is not null;
    v_has_min_stock := v_row ? 'minStock'
      and nullif(btrim(v_row ->> 'minStock'), '') is not null;
    v_has_max_stock := v_row ? 'maxStock'
      and nullif(btrim(v_row ->> 'maxStock'), '') is not null;

    v_name := nullif(btrim(v_row ->> 'name'), '');
    v_sku := case when v_has_sku then upper(btrim(v_row ->> 'sku')) end;
    v_barcode := case when v_has_barcode then btrim(v_row ->> 'barcode') end;
    v_category := case when v_has_category then btrim(v_row ->> 'category') end;
    v_supplier := case when v_has_supplier then btrim(v_row ->> 'supplier') end;
    v_description := case when v_has_description then btrim(v_row ->> 'description') end;
    v_unit := case
      when v_has_unit then btrim(v_row ->> 'unit')
      else 'unidad'
    end;
    v_warehouse := case when v_has_warehouse then btrim(v_row ->> 'warehouse') end;
    v_purchase_price := case
      when v_has_purchase_price then (v_row ->> 'purchasePrice')::numeric
      else 0
    end;
    v_sale_price := case
      when v_has_sale_price then (v_row ->> 'salePrice')::numeric
      else 0
    end;
    v_initial_stock := case
      when v_has_initial_stock then (v_row ->> 'initialStock')::numeric
      else 0
    end;
    v_min_stock := case
      when v_has_min_stock then (v_row ->> 'minStock')::numeric
      else 0
    end;
    v_max_stock := case
      when v_has_max_stock then (v_row ->> 'maxStock')::numeric
      else null
    end;

    if v_name is null or char_length(v_name) > 140 then
      raise exception 'Hay una fila con nombre vacío o demasiado largo.';
    end if;

    if char_length(v_unit) > 24 then
      raise exception 'Hay una unidad de medida demasiado larga.';
    end if;

    if coalesce(char_length(v_sku), 0) > 80
      or coalesce(char_length(v_barcode), 0) > 80
      or coalesce(char_length(v_category), 0) > 60
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

    select
      array_agg(matched.id order by matched.created_at, matched.id),
      count(*)::integer
    into v_matching_product_ids, v_matching_product_count
    from (
      select distinct product.id, product.created_at
      from public.products as product
      where product.organization_id = v_organization_id
        and (
          (
            lower(regexp_replace(btrim(product.name), '\s+', ' ', 'g')) =
              lower(regexp_replace(v_name, '\s+', ' ', 'g'))
            and (
              not v_has_unit
              or lower(btrim(product.unit)) = lower(v_unit)
            )
          )
          or (v_has_sku and upper(product.sku) = v_sku)
          or (v_has_barcode and product.barcode = v_barcode)
        )
    ) as matched;

    if v_matching_product_count > 1 then
      raise exception 'Conflicto ambiguo: el nombre, SKU o código de barras apuntan a productos diferentes.';
    end if;

    v_product_id := v_matching_product_ids[1];

    if v_product_id is not null and v_policy = 'skip' then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if v_has_sku and exists (
      select 1
      from public.products as product
      where product.organization_id = v_organization_id
        and product.id <> coalesce(v_product_id, '00000000-0000-0000-0000-000000000000'::uuid)
        and upper(product.sku) = v_sku
    ) then
      raise exception 'El SKU % ya está asignado a otro producto.', v_sku;
    end if;

    if v_has_barcode and exists (
      select 1
      from public.products as product
      where product.organization_id = v_organization_id
        and product.id <> coalesce(v_product_id, '00000000-0000-0000-0000-000000000000'::uuid)
        and product.barcode = v_barcode
    ) then
      raise exception 'El código de barras % ya está asignado a otro producto.', v_barcode;
    end if;

    v_category_id := null;
    if v_has_category then
      insert into public.categories (organization_id, name, color)
      values (v_organization_id, v_category, '#B00060')
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
    if v_has_supplier then
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

    if v_product_id is not null then
      if exists (
        select 1
        from public.products as product
        where product.id = v_product_id
          and product.organization_id = v_organization_id
          and (case
            when v_has_max_stock then v_max_stock
            else product.max_stock
          end) is not null
          and (case
            when v_has_max_stock then v_max_stock
            else product.max_stock
          end) < (case
            when v_has_min_stock then v_min_stock
            else product.min_stock
          end)
      ) then
        raise exception 'El stock máximo informado no puede ser menor que el mínimo actual.';
      end if;

      update public.products as product
      set
        name = v_name,
        sku = case when v_has_sku then v_sku else product.sku end,
        barcode = case when v_has_barcode then v_barcode else product.barcode end,
        description = case
          when v_has_description then v_description
          else product.description
        end,
        category_id = case
          when v_has_category then v_category_id
          else product.category_id
        end,
        supplier_id = case
          when v_has_supplier then v_supplier_id
          else product.supplier_id
        end,
        unit = case when v_has_unit then v_unit else product.unit end,
        purchase_price = case
          when v_has_purchase_price then v_purchase_price
          else product.purchase_price
        end,
        sale_price = case
          when v_has_sale_price then v_sale_price
          else product.sale_price
        end,
        min_stock = case
          when v_has_min_stock then v_min_stock
          else product.min_stock
        end,
        max_stock = case
          when v_has_max_stock then v_max_stock
          else product.max_stock
        end
      where product.id = v_product_id
        and product.organization_id = v_organization_id;

      if found then
        v_updated := v_updated + 1;
      end if;
      continue;
    end if;

    v_warehouse_id := v_default_warehouse_id;
    if v_has_warehouse then
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

    perform public.create_product_with_stock_v2(
      v_name,
      v_sku,
      v_barcode,
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
    'updated', v_updated,
    'skipped', v_skipped
  );
end;
$$;

revoke all on function public.import_inventory_products_v2(jsonb, text)
from public, anon, authenticated;

grant execute on function public.import_inventory_products_v2(jsonb, text)
to authenticated;

comment on function public.import_inventory_products_v2(jsonb, text) is
  'Importa productos con política explícita. update cambia metadatos, precios y códigos informados; nunca modifica balances, movimientos, existencias ni imagen de coincidencias.';

notify pgrst, 'reload schema';

commit;
