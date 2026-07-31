begin;

create extension if not exists pgcrypto with schema extensions;

create type public.member_role as enum (
  'owner',
  'admin',
  'operator',
  'viewer'
);

create type public.movement_type as enum (
  'initial',
  'purchase',
  'sale',
  'adjustment_in',
  'adjustment_out',
  'return_in',
  'return_out',
  'transfer_in',
  'transfer_out'
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_full_name_length check (
    full_name is null or char_length(full_name) <= 120
  )
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tax_id text,
  currency text not null default 'PEN',
  tax_rate numeric(7, 4) not null default 18,
  locale text not null default 'es-PE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_name_not_blank check (btrim(name) <> ''),
  constraint organizations_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint organizations_tax_rate_range check (
    tax_rate >= 0 and tax_rate <= 100
  )
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'viewer',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  location text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint warehouses_name_not_blank check (btrim(name) <> ''),
  unique (id, organization_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  color text not null default '#39735f',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_name_not_blank check (btrim(name) <> ''),
  constraint categories_color_format check (color ~ '^#[0-9A-Fa-f]{6}$'),
  unique (id, organization_id)
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  contact_name text,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suppliers_name_not_blank check (btrim(name) <> ''),
  unique (id, organization_id)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  category_id uuid,
  supplier_id uuid,
  sku text not null,
  barcode text,
  name text not null,
  description text,
  unit text not null default 'unidad',
  purchase_price numeric(18, 4) not null default 0,
  sale_price numeric(18, 4) not null default 0,
  min_stock numeric(18, 3) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_name_not_blank check (btrim(name) <> ''),
  constraint products_sku_not_blank check (btrim(sku) <> ''),
  constraint products_unit_not_blank check (btrim(unit) <> ''),
  constraint products_purchase_price_nonnegative check (purchase_price >= 0),
  constraint products_sale_price_nonnegative check (sale_price >= 0),
  constraint products_min_stock_nonnegative check (min_stock >= 0),
  constraint products_category_same_organization foreign key (
    category_id,
    organization_id
  ) references public.categories (id, organization_id),
  constraint products_supplier_same_organization foreign key (
    supplier_id,
    organization_id
  ) references public.suppliers (id, organization_id),
  unique (id, organization_id),
  unique (organization_id, sku)
);

create table public.inventory_balances (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  product_id uuid not null,
  warehouse_id uuid not null,
  current_stock numeric(18, 3) not null default 0,
  average_cost numeric(18, 4) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (product_id, warehouse_id),
  constraint inventory_balances_stock_nonnegative check (current_stock >= 0),
  constraint inventory_balances_cost_nonnegative check (average_cost >= 0),
  constraint inventory_balances_product_same_organization foreign key (
    product_id,
    organization_id
  ) references public.products (id, organization_id) on delete cascade,
  constraint inventory_balances_warehouse_same_organization foreign key (
    warehouse_id,
    organization_id
  ) references public.warehouses (id, organization_id) on delete cascade
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  product_id uuid not null,
  warehouse_id uuid not null,
  movement_type public.movement_type not null,
  quantity numeric(18, 3) not null,
  stock_before numeric(18, 3) not null,
  stock_after numeric(18, 3) not null,
  unit_cost numeric(18, 4) not null default 0,
  sale_unit_price numeric(18, 4),
  total_cost numeric(18, 4) not null default 0,
  revenue numeric(18, 4) not null default 0,
  gross_profit numeric(18, 4) not null default 0,
  note text,
  reference text,
  occurred_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  constraint inventory_movements_quantity_positive check (quantity > 0),
  constraint inventory_movements_stock_nonnegative check (
    stock_before >= 0 and stock_after >= 0
  ),
  constraint inventory_movements_costs_nonnegative check (
    unit_cost >= 0 and total_cost >= 0 and revenue >= 0
  ),
  constraint inventory_movements_product_same_organization foreign key (
    product_id,
    organization_id
  ) references public.products (id, organization_id),
  constraint inventory_movements_warehouse_same_organization foreign key (
    warehouse_id,
    organization_id
  ) references public.warehouses (id, organization_id)
);

create unique index one_default_warehouse_per_organization
  on public.warehouses (organization_id)
  where is_default;

create unique index categories_name_per_organization
  on public.categories (organization_id, lower(name));

create unique index suppliers_name_per_organization
  on public.suppliers (organization_id, lower(name));

create unique index products_barcode_per_organization
  on public.products (organization_id, barcode)
  where barcode is not null and btrim(barcode) <> '';

create index organization_members_user_id_idx
  on public.organization_members (user_id, created_at);

create index products_organization_active_idx
  on public.products (organization_id, active, name);

create index inventory_balances_organization_idx
  on public.inventory_balances (organization_id, product_id);

create index inventory_movements_organization_date_idx
  on public.inventory_movements (organization_id, occurred_at desc);

create index inventory_movements_product_date_idx
  on public.inventory_movements (product_id, occurred_at desc);

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function private.set_updated_at();

create trigger warehouses_set_updated_at
before update on public.warehouses
for each row execute function private.set_updated_at();

create trigger categories_set_updated_at
before update on public.categories
for each row execute function private.set_updated_at();

create trigger suppliers_set_updated_at
before update on public.suppliers
for each row execute function private.set_updated_at();

create trigger products_set_updated_at
before update on public.products
for each row execute function private.set_updated_at();

create trigger inventory_balances_set_updated_at
before update on public.inventory_balances
for each row execute function private.set_updated_at();

create or replace function private.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id = p_organization_id
      and membership.user_id = (select auth.uid())
  );
$$;

create or replace function private.can_operate(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id = p_organization_id
      and membership.user_id = (select auth.uid())
      and membership.role in (
        'owner'::public.member_role,
        'admin'::public.member_role,
        'operator'::public.member_role
      )
  );
$$;

create or replace function private.is_org_admin(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id = p_organization_id
      and membership.user_id = (select auth.uid())
      and membership.role in (
        'owner'::public.member_role,
        'admin'::public.member_role
      )
  );
$$;

create or replace function private.is_org_owner(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id = p_organization_id
      and membership.user_id = (select auth.uid())
      and membership.role = 'owner'::public.member_role
  );
$$;

revoke all on function private.is_org_member(uuid) from public;
revoke all on function private.can_operate(uuid) from public;
revoke all on function private.is_org_admin(uuid) from public;
revoke all on function private.is_org_owner(uuid) from public;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.can_operate(uuid) to authenticated;
grant execute on function private.is_org_admin(uuid) to authenticated;
grant execute on function private.is_org_owner(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.warehouses enable row level security;
alter table public.categories enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.inventory_balances enable row level security;
alter table public.inventory_movements enable row level security;

create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (id = (select auth.uid()));

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "organizations_select_members"
on public.organizations
for select
to authenticated
using ((select private.is_org_member(id)));

create policy "organizations_update_admins"
on public.organizations
for update
to authenticated
using ((select private.is_org_admin(id)))
with check ((select private.is_org_admin(id)));

create policy "members_select_members"
on public.organization_members
for select
to authenticated
using ((select private.is_org_member(organization_id)));

create policy "members_insert_admins"
on public.organization_members
for insert
to authenticated
with check (
  (select private.is_org_admin(organization_id))
  and (
    role <> 'owner'::public.member_role
    or (select private.is_org_owner(organization_id))
  )
);

create policy "members_update_admins"
on public.organization_members
for update
to authenticated
using ((select private.is_org_admin(organization_id)))
with check (
  (select private.is_org_admin(organization_id))
  and (
    role <> 'owner'::public.member_role
    or (select private.is_org_owner(organization_id))
  )
);

create policy "members_delete_admins"
on public.organization_members
for delete
to authenticated
using (
  (select private.is_org_admin(organization_id))
  and (
    role <> 'owner'::public.member_role
    or (select private.is_org_owner(organization_id))
  )
  and not (
    user_id = (select auth.uid())
    and role = 'owner'::public.member_role
  )
);

create policy "warehouses_select_members"
on public.warehouses
for select
to authenticated
using ((select private.is_org_member(organization_id)));

create policy "warehouses_insert_admins"
on public.warehouses
for insert
to authenticated
with check ((select private.is_org_admin(organization_id)));

create policy "warehouses_update_admins"
on public.warehouses
for update
to authenticated
using ((select private.is_org_admin(organization_id)))
with check ((select private.is_org_admin(organization_id)));

create policy "warehouses_delete_admins"
on public.warehouses
for delete
to authenticated
using ((select private.is_org_admin(organization_id)));

create policy "categories_select_members"
on public.categories
for select
to authenticated
using ((select private.is_org_member(organization_id)));

create policy "categories_insert_admins"
on public.categories
for insert
to authenticated
with check ((select private.is_org_admin(organization_id)));

create policy "categories_update_admins"
on public.categories
for update
to authenticated
using ((select private.is_org_admin(organization_id)))
with check ((select private.is_org_admin(organization_id)));

create policy "categories_delete_admins"
on public.categories
for delete
to authenticated
using ((select private.is_org_admin(organization_id)));

create policy "suppliers_select_members"
on public.suppliers
for select
to authenticated
using ((select private.is_org_member(organization_id)));

create policy "suppliers_insert_admins"
on public.suppliers
for insert
to authenticated
with check ((select private.is_org_admin(organization_id)));

create policy "suppliers_update_admins"
on public.suppliers
for update
to authenticated
using ((select private.is_org_admin(organization_id)))
with check ((select private.is_org_admin(organization_id)));

create policy "suppliers_delete_admins"
on public.suppliers
for delete
to authenticated
using ((select private.is_org_admin(organization_id)));

create policy "products_select_members"
on public.products
for select
to authenticated
using ((select private.is_org_member(organization_id)));

create policy "products_update_operators"
on public.products
for update
to authenticated
using ((select private.can_operate(organization_id)))
with check ((select private.can_operate(organization_id)));

create policy "balances_select_members"
on public.inventory_balances
for select
to authenticated
using ((select private.is_org_member(organization_id)));

create policy "movements_select_members"
on public.inventory_movements
for select
to authenticated
using ((select private.is_org_member(organization_id)));

revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;
grant select on public.organizations to authenticated;
grant update (name, tax_id, currency, tax_rate, locale)
  on public.organizations to authenticated;
grant select, insert, update, delete on public.organization_members to authenticated;
revoke update on public.organization_members from authenticated;
grant update (role) on public.organization_members to authenticated;
grant select, insert, delete on public.warehouses to authenticated;
grant update (name, location, is_default) on public.warehouses to authenticated;
grant select, insert, delete on public.categories to authenticated;
grant update (name, color) on public.categories to authenticated;
grant select, insert, delete on public.suppliers to authenticated;
grant update (name, contact_name, email, phone) on public.suppliers to authenticated;
grant select on public.products to authenticated;
grant update (
  category_id,
  supplier_id,
  sku,
  barcode,
  name,
  description,
  unit,
  purchase_price,
  sale_price,
  min_stock,
  active
) on public.products to authenticated;
grant select on public.inventory_balances to authenticated;
grant select on public.inventory_movements to authenticated;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_full_name text;
  v_organization_name text;
begin
  v_full_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Usuario'
  );

  v_organization_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'company_name'), ''),
    'Inventario de ' || split_part(v_full_name, ' ', 1)
  );

  insert into public.profiles (id, full_name)
  values (new.id, v_full_name)
  on conflict (id) do update
  set full_name = excluded.full_name;

  insert into public.organizations (name)
  values (v_organization_name)
  returning id into v_organization_id;

  insert into public.organization_members (
    organization_id,
    user_id,
    role
  ) values (
    v_organization_id,
    new.id,
    'owner'::public.member_role
  );

  insert into public.warehouses (
    organization_id,
    name,
    is_default
  ) values (
    v_organization_id,
    'Almacén principal',
    true
  );

  insert into public.categories (organization_id, name, color)
  values
    (v_organization_id, 'General', '#39735f'),
    (v_organization_id, 'Alimentos', '#a26743'),
    (v_organization_id, 'Bebidas', '#547886'),
    (v_organization_id, 'Limpieza', '#5c6d91');

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create or replace function public.create_product_with_stock(
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
  p_min_stock numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_product_id uuid;
  v_sku text;
  v_prefix text;
begin
  if (select auth.uid()) is null then
    raise exception 'Debes iniciar sesión para crear productos.';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'El nombre del producto es obligatorio.';
  end if;

  if p_unit is null or btrim(p_unit) = '' then
    raise exception 'La unidad de medida es obligatoria.';
  end if;

  if coalesce(p_purchase_price, -1) < 0
    or coalesce(p_sale_price, -1) < 0
    or coalesce(p_initial_stock, -1) < 0
    or coalesce(p_min_stock, -1) < 0 then
    raise exception 'Los precios y cantidades no pueden ser negativos.';
  end if;

  select warehouse.organization_id
  into v_organization_id
  from public.warehouses as warehouse
  where warehouse.id = p_warehouse_id;

  if v_organization_id is null then
    raise exception 'El almacén seleccionado no existe.';
  end if;

  if not private.can_operate(v_organization_id) then
    raise exception 'No tienes permisos para crear productos en esta empresa.';
  end if;

  if p_category_id is not null and not exists (
    select 1
    from public.categories as category
    where category.id = p_category_id
      and category.organization_id = v_organization_id
  ) then
    raise exception 'La categoría no pertenece a esta empresa.';
  end if;

  if p_supplier_id is not null and not exists (
    select 1
    from public.suppliers as supplier
    where supplier.id = p_supplier_id
      and supplier.organization_id = v_organization_id
  ) then
    raise exception 'El proveedor no pertenece a esta empresa.';
  end if;

  if p_sku is null or btrim(p_sku) = '' then
    v_prefix := upper(
      substr(regexp_replace(p_name, '[^A-Za-z0-9]', '', 'g'), 1, 3)
    );
    if char_length(v_prefix) < 2 then
      v_prefix := 'PRO';
    end if;

    loop
      v_sku := v_prefix || '-' || upper(
        substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)
      );
      exit when not exists (
        select 1
        from public.products as product
        where product.organization_id = v_organization_id
          and product.sku = v_sku
      );
    end loop;
  else
    v_sku := upper(btrim(p_sku));
  end if;

  if exists (
    select 1
    from public.products as product
    where product.organization_id = v_organization_id
      and product.sku = v_sku
  ) then
    raise exception 'El SKU ya está asignado a otro producto.';
  end if;

  insert into public.products (
    organization_id,
    category_id,
    supplier_id,
    sku,
    barcode,
    name,
    description,
    unit,
    purchase_price,
    sale_price,
    min_stock
  ) values (
    v_organization_id,
    p_category_id,
    p_supplier_id,
    v_sku,
    nullif(btrim(p_barcode), ''),
    btrim(p_name),
    nullif(btrim(p_description), ''),
    btrim(p_unit),
    p_purchase_price,
    p_sale_price,
    p_min_stock
  )
  returning id into v_product_id;

  insert into public.inventory_balances (
    organization_id,
    product_id,
    warehouse_id,
    current_stock,
    average_cost
  ) values (
    v_organization_id,
    v_product_id,
    p_warehouse_id,
    p_initial_stock,
    p_purchase_price
  );

  if p_initial_stock > 0 then
    insert into public.inventory_movements (
      organization_id,
      product_id,
      warehouse_id,
      movement_type,
      quantity,
      stock_before,
      stock_after,
      unit_cost,
      total_cost,
      note,
      created_by
    ) values (
      v_organization_id,
      v_product_id,
      p_warehouse_id,
      'initial'::public.movement_type,
      p_initial_stock,
      0,
      p_initial_stock,
      p_purchase_price,
      p_initial_stock * p_purchase_price,
      'Stock registrado al crear el producto',
      (select auth.uid())
    );
  end if;

  return v_product_id;
end;
$$;

revoke all on function public.create_product_with_stock(
  text, text, text, text, uuid, uuid, uuid, text, numeric, numeric, numeric, numeric
) from public;

grant execute on function public.create_product_with_stock(
  text, text, text, text, uuid, uuid, uuid, text, numeric, numeric, numeric, numeric
) to authenticated;

create or replace function public.record_inventory_movement(
  p_product_id uuid,
  p_warehouse_id uuid,
  p_movement_type public.movement_type,
  p_quantity numeric,
  p_unit_cost numeric,
  p_sale_unit_price numeric,
  p_note text,
  p_reference text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_balance public.inventory_balances%rowtype;
  v_movement_id uuid;
  v_incoming boolean;
  v_stock_after numeric(18, 3);
  v_unit_cost numeric(18, 4);
  v_average_cost numeric(18, 4);
  v_sale_price numeric(18, 4);
  v_total_cost numeric(18, 4);
  v_revenue numeric(18, 4);
  v_gross_profit numeric(18, 4);
begin
  if (select auth.uid()) is null then
    raise exception 'Debes iniciar sesión para registrar movimientos.';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.';
  end if;

  if coalesce(p_unit_cost, 0) < 0 or coalesce(p_sale_unit_price, 0) < 0 then
    raise exception 'Los importes no pueden ser negativos.';
  end if;

  if p_movement_type is null or p_movement_type not in (
    'purchase'::public.movement_type,
    'sale'::public.movement_type,
    'adjustment_in'::public.movement_type,
    'adjustment_out'::public.movement_type,
    'return_in'::public.movement_type,
    'return_out'::public.movement_type
  ) then
    raise exception 'El tipo de movimiento no está permitido en esta operación.';
  end if;

  select product.*
  into v_product
  from public.products as product
  where product.id = p_product_id
  for update;

  if not found then
    raise exception 'El producto seleccionado no existe.';
  end if;

  if not v_product.active then
    raise exception 'No se pueden mover existencias de un producto archivado.';
  end if;

  if not private.can_operate(v_product.organization_id) then
    raise exception 'No tienes permisos para registrar este movimiento.';
  end if;

  if not exists (
    select 1
    from public.warehouses as warehouse
    where warehouse.id = p_warehouse_id
      and warehouse.organization_id = v_product.organization_id
  ) then
    raise exception 'El almacén no pertenece a esta empresa.';
  end if;

  insert into public.inventory_balances (
    organization_id,
    product_id,
    warehouse_id,
    current_stock,
    average_cost
  ) values (
    v_product.organization_id,
    v_product.id,
    p_warehouse_id,
    0,
    v_product.purchase_price
  )
  on conflict (product_id, warehouse_id) do nothing;

  select balance.*
  into v_balance
  from public.inventory_balances as balance
  where balance.product_id = p_product_id
    and balance.warehouse_id = p_warehouse_id
  for update;

  v_incoming := p_movement_type in (
    'purchase'::public.movement_type,
    'adjustment_in'::public.movement_type,
    'return_in'::public.movement_type
  );

  if v_incoming then
    v_stock_after := v_balance.current_stock + p_quantity;
    v_unit_cost := coalesce(
      p_unit_cost,
      nullif(v_product.purchase_price, 0),
      v_balance.average_cost,
      0
    );

    if v_stock_after > 0 then
      v_average_cost := round(
        (
          (v_balance.current_stock * v_balance.average_cost)
          + (p_quantity * v_unit_cost)
        ) / v_stock_after,
        4
      );
    else
      v_average_cost := v_unit_cost;
    end if;
  else
    v_stock_after := v_balance.current_stock - p_quantity;
    if v_stock_after < 0 then
      raise exception 'Stock insuficiente. Hay % unidades disponibles en este almacén.',
        v_balance.current_stock;
    end if;
    v_unit_cost := v_balance.average_cost;
    v_average_cost := v_balance.average_cost;
  end if;

  v_sale_price := case
    when p_movement_type = 'sale'::public.movement_type
      then coalesce(p_sale_unit_price, v_product.sale_price, 0)
    else null
  end;
  v_total_cost := round(p_quantity * v_unit_cost, 4);
  v_revenue := case
    when p_movement_type = 'sale'::public.movement_type
      then round(p_quantity * v_sale_price, 4)
    else 0
  end;
  v_gross_profit := case
    when p_movement_type = 'sale'::public.movement_type
      then round(v_revenue - v_total_cost, 4)
    else 0
  end;

  update public.inventory_balances
  set current_stock = v_stock_after,
      average_cost = v_average_cost
  where product_id = p_product_id
    and warehouse_id = p_warehouse_id;

  if p_movement_type = 'purchase'::public.movement_type then
    update public.products
    set purchase_price = v_unit_cost
    where id = p_product_id;
  else
    update public.products
    set updated_at = now()
    where id = p_product_id;
  end if;

  insert into public.inventory_movements (
    organization_id,
    product_id,
    warehouse_id,
    movement_type,
    quantity,
    stock_before,
    stock_after,
    unit_cost,
    sale_unit_price,
    total_cost,
    revenue,
    gross_profit,
    note,
    reference,
    created_by
  ) values (
    v_product.organization_id,
    p_product_id,
    p_warehouse_id,
    p_movement_type,
    p_quantity,
    v_balance.current_stock,
    v_stock_after,
    v_unit_cost,
    v_sale_price,
    v_total_cost,
    v_revenue,
    v_gross_profit,
    nullif(btrim(p_note), ''),
    nullif(btrim(p_reference), ''),
    (select auth.uid())
  )
  returning id into v_movement_id;

  return v_movement_id;
end;
$$;

revoke all on function public.record_inventory_movement(
  uuid, uuid, public.movement_type, numeric, numeric, numeric, text, text
) from public;

grant execute on function public.record_inventory_movement(
  uuid, uuid, public.movement_type, numeric, numeric, numeric, text, text
) to authenticated;

create or replace function public.transfer_inventory_stock(
  p_product_id uuid,
  p_from_warehouse_id uuid,
  p_to_warehouse_id uuid,
  p_quantity numeric,
  p_note text,
  p_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_source public.inventory_balances%rowtype;
  v_destination public.inventory_balances%rowtype;
  v_source_after numeric(18, 3);
  v_destination_after numeric(18, 3);
  v_destination_average numeric(18, 4);
  v_total_cost numeric(18, 4);
  v_out_id uuid;
  v_in_id uuid;
  v_occurred_at timestamptz := now();
begin
  if (select auth.uid()) is null then
    raise exception 'Debes iniciar sesión para trasladar existencias.';
  end if;

  if p_from_warehouse_id = p_to_warehouse_id then
    raise exception 'El almacén de origen y destino deben ser diferentes.';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.';
  end if;

  select product.*
  into v_product
  from public.products as product
  where product.id = p_product_id
  for update;

  if not found then
    raise exception 'El producto seleccionado no existe.';
  end if;

  if not v_product.active then
    raise exception 'No se pueden trasladar existencias de un producto archivado.';
  end if;

  if not private.can_operate(v_product.organization_id) then
    raise exception 'No tienes permisos para trasladar existencias.';
  end if;

  if (
    select count(*)
    from public.warehouses as warehouse
    where warehouse.id in (p_from_warehouse_id, p_to_warehouse_id)
      and warehouse.organization_id = v_product.organization_id
  ) <> 2 then
    raise exception 'Uno de los almacenes no pertenece a esta empresa.';
  end if;

  insert into public.inventory_balances (
    organization_id,
    product_id,
    warehouse_id,
    current_stock,
    average_cost
  ) values
    (
      v_product.organization_id,
      p_product_id,
      p_from_warehouse_id,
      0,
      v_product.purchase_price
    ),
    (
      v_product.organization_id,
      p_product_id,
      p_to_warehouse_id,
      0,
      v_product.purchase_price
    )
  on conflict (product_id, warehouse_id) do nothing;

  select balance.*
  into v_source
  from public.inventory_balances as balance
  where balance.product_id = p_product_id
    and balance.warehouse_id = p_from_warehouse_id
  for update;

  select balance.*
  into v_destination
  from public.inventory_balances as balance
  where balance.product_id = p_product_id
    and balance.warehouse_id = p_to_warehouse_id
  for update;

  if v_source.current_stock < p_quantity then
    raise exception 'Stock insuficiente. Hay % unidades disponibles en el origen.',
      v_source.current_stock;
  end if;

  v_source_after := v_source.current_stock - p_quantity;
  v_destination_after := v_destination.current_stock + p_quantity;
  v_destination_average := round(
    (
      (v_destination.current_stock * v_destination.average_cost)
      + (p_quantity * v_source.average_cost)
    ) / v_destination_after,
    4
  );
  v_total_cost := round(p_quantity * v_source.average_cost, 4);

  update public.inventory_balances
  set current_stock = v_source_after
  where product_id = p_product_id
    and warehouse_id = p_from_warehouse_id;

  update public.inventory_balances
  set current_stock = v_destination_after,
      average_cost = v_destination_average
  where product_id = p_product_id
    and warehouse_id = p_to_warehouse_id;

  update public.products
  set updated_at = now()
  where id = p_product_id;

  insert into public.inventory_movements (
    organization_id,
    product_id,
    warehouse_id,
    movement_type,
    quantity,
    stock_before,
    stock_after,
    unit_cost,
    total_cost,
    note,
    reference,
    occurred_at,
    created_by
  ) values (
    v_product.organization_id,
    p_product_id,
    p_from_warehouse_id,
    'transfer_out'::public.movement_type,
    p_quantity,
    v_source.current_stock,
    v_source_after,
    v_source.average_cost,
    v_total_cost,
    nullif(btrim(p_note), ''),
    nullif(btrim(p_reference), ''),
    v_occurred_at,
    (select auth.uid())
  )
  returning id into v_out_id;

  insert into public.inventory_movements (
    organization_id,
    product_id,
    warehouse_id,
    movement_type,
    quantity,
    stock_before,
    stock_after,
    unit_cost,
    total_cost,
    note,
    reference,
    occurred_at,
    created_by
  ) values (
    v_product.organization_id,
    p_product_id,
    p_to_warehouse_id,
    'transfer_in'::public.movement_type,
    p_quantity,
    v_destination.current_stock,
    v_destination_after,
    v_source.average_cost,
    v_total_cost,
    nullif(btrim(p_note), ''),
    nullif(btrim(p_reference), ''),
    v_occurred_at,
    (select auth.uid())
  )
  returning id into v_in_id;

  return jsonb_build_object(
    'out_movement_id', v_out_id,
    'in_movement_id', v_in_id
  );
end;
$$;

revoke all on function public.transfer_inventory_stock(
  uuid, uuid, uuid, numeric, text, text
) from public;

grant execute on function public.transfer_inventory_stock(
  uuid, uuid, uuid, numeric, text, text
) to authenticated;

revoke all on type public.member_role from anon;
revoke all on type public.movement_type from anon;
grant usage on type public.member_role to authenticated;
grant usage on type public.movement_type to authenticated;

comment on function public.create_product_with_stock(
  text, text, text, text, uuid, uuid, uuid, text, numeric, numeric, numeric, numeric
) is 'Crea un producto, genera su SKU cuando falta e inicializa stock y trazabilidad en una transacción.';

comment on function public.record_inventory_movement(
  uuid, uuid, public.movement_type, numeric, numeric, numeric, text, text
) is 'Registra una entrada o salida con bloqueo, costo promedio ponderado y prevención de stock negativo.';

comment on function public.transfer_inventory_stock(
  uuid, uuid, uuid, numeric, text, text
) is 'Traslada stock entre almacenes de una empresa y registra ambos movimientos de forma atómica.';

commit;
