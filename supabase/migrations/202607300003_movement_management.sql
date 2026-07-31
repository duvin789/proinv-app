begin;

create table public.movement_reasons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint movement_reasons_name_not_blank check (btrim(name) <> ''),
  constraint movement_reasons_name_length check (char_length(btrim(name)) <= 80),
  unique (id, organization_id)
);

create unique index movement_reasons_name_per_organization
  on public.movement_reasons (organization_id, lower(name));

create trigger movement_reasons_set_updated_at
before update on public.movement_reasons
for each row execute function private.set_updated_at();

alter table public.movement_reasons enable row level security;

create policy "movement_reasons_select_members"
on public.movement_reasons
for select
to authenticated
using ((select private.is_org_member(organization_id)));

create policy "movement_reasons_insert_admins"
on public.movement_reasons
for insert
to authenticated
with check ((select private.is_org_admin(organization_id)));

create policy "movement_reasons_update_admins"
on public.movement_reasons
for update
to authenticated
using ((select private.is_org_admin(organization_id)))
with check ((select private.is_org_admin(organization_id)));

create policy "movement_reasons_delete_admins"
on public.movement_reasons
for delete
to authenticated
using ((select private.is_org_admin(organization_id)));

grant select, insert, delete on public.movement_reasons to authenticated;
grant update (name) on public.movement_reasons to authenticated;

insert into public.movement_reasons (organization_id, name)
select organization.id, reason.name
from public.organizations as organization
cross join (
  values
    ('Compra de materia prima'),
    ('Uso en producción'),
    ('Venta'),
    ('Merma o desperdicio'),
    ('Devolución'),
    ('Ajuste de inventario')
) as reason(name)
on conflict do nothing;

insert into public.movement_reasons (organization_id, name)
select distinct
  movement.organization_id,
  left(btrim(movement.reference), 80)
from public.inventory_movements as movement
where nullif(btrim(movement.reference), '') is not null
on conflict do nothing;

create or replace function private.seed_default_movement_reasons()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.movement_reasons (organization_id, name)
  values
    (new.id, 'Compra de materia prima'),
    (new.id, 'Uso en producción'),
    (new.id, 'Venta'),
    (new.id, 'Merma o desperdicio'),
    (new.id, 'Devolución'),
    (new.id, 'Ajuste de inventario')
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function private.seed_default_movement_reasons()
from public, anon, authenticated;

create trigger organizations_seed_default_movement_reasons
after insert on public.organizations
for each row execute function private.seed_default_movement_reasons();

create or replace function private.recalculate_inventory_balance(
  p_product_id uuid,
  p_warehouse_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_movement public.inventory_movements%rowtype;
  v_stock numeric(18, 3) := 0;
  v_average_cost numeric(18, 4) := 0;
  v_unit_cost numeric(18, 4);
  v_total_cost numeric(18, 4);
  v_revenue numeric(18, 4);
  v_gross_profit numeric(18, 4);
  v_incoming boolean;
begin
  select product.*
  into v_product
  from public.products as product
  where product.id = p_product_id
  for update;

  if not found then
    raise exception 'El producto relacionado ya no existe.';
  end if;

  if not exists (
    select 1
    from public.warehouses as warehouse
    where warehouse.id = p_warehouse_id
      and warehouse.organization_id = v_product.organization_id
  ) then
    raise exception 'El almacén relacionado ya no existe.';
  end if;

  insert into public.inventory_balances (
    organization_id,
    product_id,
    warehouse_id,
    current_stock,
    average_cost
  ) values (
    v_product.organization_id,
    p_product_id,
    p_warehouse_id,
    0,
    v_product.purchase_price
  )
  on conflict (product_id, warehouse_id) do nothing;

  perform 1
  from public.inventory_balances as balance
  where balance.product_id = p_product_id
    and balance.warehouse_id = p_warehouse_id
  for update;

  for v_movement in
    select movement.*
    from public.inventory_movements as movement
    where movement.product_id = p_product_id
      and movement.warehouse_id = p_warehouse_id
    order by movement.occurred_at, movement.id
    for update
  loop
    v_incoming := v_movement.movement_type in (
      'initial'::public.movement_type,
      'purchase'::public.movement_type,
      'adjustment_in'::public.movement_type,
      'return_in'::public.movement_type,
      'transfer_in'::public.movement_type
    );

    if v_incoming then
      v_unit_cost := coalesce(v_movement.unit_cost, 0);

      if v_stock + v_movement.quantity > 0 then
        v_average_cost := round(
          (
            (v_stock * v_average_cost)
            + (v_movement.quantity * v_unit_cost)
          ) / (v_stock + v_movement.quantity),
          4
        );
      else
        v_average_cost := v_unit_cost;
      end if;

      update public.inventory_movements
      set stock_before = v_stock,
          stock_after = v_stock + v_movement.quantity,
          unit_cost = v_unit_cost,
          sale_unit_price = null,
          total_cost = round(v_movement.quantity * v_unit_cost, 4),
          revenue = 0,
          gross_profit = 0
      where id = v_movement.id;

      v_stock := v_stock + v_movement.quantity;
    else
      if v_stock - v_movement.quantity < 0 then
        raise exception
          'El cambio no puede aplicarse porque dejaría stock negativo en un movimiento posterior.';
      end if;

      v_unit_cost := v_average_cost;
      v_total_cost := round(v_movement.quantity * v_unit_cost, 4);
      v_revenue := case
        when v_movement.movement_type = 'sale'::public.movement_type
          then round(
            v_movement.quantity * coalesce(v_movement.sale_unit_price, 0),
            4
          )
        else 0
      end;
      v_gross_profit := case
        when v_movement.movement_type = 'sale'::public.movement_type
          then round(v_revenue - v_total_cost, 4)
        else 0
      end;

      update public.inventory_movements
      set stock_before = v_stock,
          stock_after = v_stock - v_movement.quantity,
          unit_cost = v_unit_cost,
          sale_unit_price = case
            when v_movement.movement_type = 'sale'::public.movement_type
              then coalesce(v_movement.sale_unit_price, 0)
            else null
          end,
          total_cost = v_total_cost,
          revenue = v_revenue,
          gross_profit = v_gross_profit
      where id = v_movement.id;

      v_stock := v_stock - v_movement.quantity;
    end if;
  end loop;

  update public.inventory_balances
  set current_stock = v_stock,
      average_cost = v_average_cost
  where product_id = p_product_id
    and warehouse_id = p_warehouse_id;

  update public.products
  set updated_at = now()
  where id = p_product_id;
end;
$$;

revoke all on function private.recalculate_inventory_balance(uuid, uuid)
from public, anon, authenticated;

create or replace function private.refresh_product_purchase_price(
  p_product_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase_price numeric(18, 4);
begin
  select movement.unit_cost
  into v_purchase_price
  from public.inventory_movements as movement
  where movement.product_id = p_product_id
    and movement.movement_type in (
      'purchase'::public.movement_type,
      'initial'::public.movement_type
    )
  order by
    case
      when movement.movement_type = 'purchase'::public.movement_type then 0
      else 1
    end,
    movement.occurred_at desc,
    movement.id desc
  limit 1;

  if found then
    update public.products
    set purchase_price = v_purchase_price
    where id = p_product_id;
  end if;
end;
$$;

revoke all on function private.refresh_product_purchase_price(uuid)
from public, anon, authenticated;

create or replace function public.update_inventory_movement(
  p_movement_id uuid,
  p_movement_type public.movement_type,
  p_quantity numeric,
  p_unit_cost numeric,
  p_sale_unit_price numeric,
  p_note text,
  p_reference text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_movement public.inventory_movements%rowtype;
  v_product public.products%rowtype;
  v_incoming boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'Debes iniciar sesión para editar movimientos.';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.';
  end if;

  if coalesce(p_unit_cost, 0) < 0 or coalesce(p_sale_unit_price, 0) < 0 then
    raise exception 'Los importes no pueden ser negativos.';
  end if;

  if char_length(coalesce(p_note, '')) > 300 then
    raise exception 'La observación no puede superar 300 caracteres.';
  end if;

  if char_length(coalesce(p_reference, '')) > 80 then
    raise exception 'El motivo no puede superar 80 caracteres.';
  end if;

  if p_movement_type is null or p_movement_type not in (
    'initial'::public.movement_type,
    'purchase'::public.movement_type,
    'sale'::public.movement_type,
    'adjustment_in'::public.movement_type,
    'adjustment_out'::public.movement_type,
    'return_in'::public.movement_type,
    'return_out'::public.movement_type
  ) then
    raise exception 'Este tipo de movimiento no puede editarse.';
  end if;

  select movement.*
  into v_movement
  from public.inventory_movements as movement
  where movement.id = p_movement_id;

  if not found then
    raise exception 'El movimiento seleccionado no existe.';
  end if;

  if not private.is_org_admin(v_movement.organization_id) then
    raise exception 'Solo un propietario o administrador puede editar movimientos.';
  end if;

  select product.*
  into v_product
  from public.products as product
  where product.id = v_movement.product_id
  for update;

  if not found then
    raise exception 'El producto relacionado ya no existe.';
  end if;

  select movement.*
  into v_movement
  from public.inventory_movements as movement
  where movement.id = p_movement_id
  for update;

  if v_movement.movement_type in (
    'transfer_in'::public.movement_type,
    'transfer_out'::public.movement_type
  ) then
    raise exception 'Los traslados están protegidos y no pueden editarse por separado.';
  end if;

  if exists (
    select 1
    from public.inventory_movements as movement
    where movement.product_id = v_movement.product_id
      and movement.movement_type in (
        'transfer_in'::public.movement_type,
        'transfer_out'::public.movement_type
      )
  ) then
    raise exception
      'Este producto tiene traslados entre almacenes. Sus movimientos están protegidos para conservar la trazabilidad.';
  end if;

  if (
    v_movement.movement_type = 'initial'::public.movement_type
    and p_movement_type <> 'initial'::public.movement_type
  ) or (
    v_movement.movement_type <> 'initial'::public.movement_type
    and p_movement_type = 'initial'::public.movement_type
  ) then
    raise exception 'El stock inicial solo puede conservar su mismo tipo.';
  end if;

  v_incoming := p_movement_type in (
    'initial'::public.movement_type,
    'purchase'::public.movement_type,
    'adjustment_in'::public.movement_type,
    'return_in'::public.movement_type
  );

  update public.inventory_movements
  set movement_type = p_movement_type,
      quantity = p_quantity,
      unit_cost = case
        when v_incoming
          then coalesce(p_unit_cost, v_movement.unit_cost, v_product.purchase_price, 0)
        else v_movement.unit_cost
      end,
      sale_unit_price = case
        when p_movement_type = 'sale'::public.movement_type
          then coalesce(p_sale_unit_price, v_movement.sale_unit_price, v_product.sale_price, 0)
        else null
      end,
      note = nullif(btrim(p_note), ''),
      reference = nullif(btrim(p_reference), '')
  where id = p_movement_id;

  perform private.recalculate_inventory_balance(
    v_movement.product_id,
    v_movement.warehouse_id
  );
  perform private.refresh_product_purchase_price(v_movement.product_id);
end;
$$;

revoke all on function public.update_inventory_movement(
  uuid, public.movement_type, numeric, numeric, numeric, text, text
) from public, anon, authenticated;

grant execute on function public.update_inventory_movement(
  uuid, public.movement_type, numeric, numeric, numeric, text, text
) to authenticated;

create or replace function public.delete_inventory_movement(
  p_movement_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_movement public.inventory_movements%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Debes iniciar sesión para eliminar movimientos.';
  end if;

  select movement.*
  into v_movement
  from public.inventory_movements as movement
  where movement.id = p_movement_id;

  if not found then
    raise exception 'El movimiento seleccionado no existe.';
  end if;

  if not private.is_org_admin(v_movement.organization_id) then
    raise exception 'Solo un propietario o administrador puede eliminar movimientos.';
  end if;

  perform 1
  from public.products as product
  where product.id = v_movement.product_id
  for update;

  if not found then
    raise exception 'El producto relacionado ya no existe.';
  end if;

  select movement.*
  into v_movement
  from public.inventory_movements as movement
  where movement.id = p_movement_id
  for update;

  if v_movement.movement_type in (
    'transfer_in'::public.movement_type,
    'transfer_out'::public.movement_type
  ) then
    raise exception 'Los traslados están protegidos y no pueden eliminarse por separado.';
  end if;

  if exists (
    select 1
    from public.inventory_movements as movement
    where movement.product_id = v_movement.product_id
      and movement.movement_type in (
        'transfer_in'::public.movement_type,
        'transfer_out'::public.movement_type
      )
  ) then
    raise exception
      'Este producto tiene traslados entre almacenes. Sus movimientos están protegidos para conservar la trazabilidad.';
  end if;

  delete from public.inventory_movements
  where id = p_movement_id;

  perform private.recalculate_inventory_balance(
    v_movement.product_id,
    v_movement.warehouse_id
  );
  perform private.refresh_product_purchase_price(v_movement.product_id);
end;
$$;

revoke all on function public.delete_inventory_movement(uuid)
from public, anon, authenticated;

grant execute on function public.delete_inventory_movement(uuid)
to authenticated;

create or replace function public.rename_movement_reason(
  p_reason_id uuid,
  p_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason public.movement_reasons%rowtype;
  v_name text;
begin
  if (select auth.uid()) is null then
    raise exception 'Debes iniciar sesión para modificar motivos.';
  end if;

  v_name := nullif(btrim(p_name), '');
  if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'El motivo debe tener entre 2 y 80 caracteres.';
  end if;

  select reason.*
  into v_reason
  from public.movement_reasons as reason
  where reason.id = p_reason_id
  for update;

  if not found then
    raise exception 'El motivo seleccionado no existe.';
  end if;

  if not private.is_org_admin(v_reason.organization_id) then
    raise exception 'Solo un propietario o administrador puede modificar motivos.';
  end if;

  update public.inventory_movements
  set reference = v_name
  where organization_id = v_reason.organization_id
    and lower(btrim(reference)) = lower(btrim(v_reason.name));

  update public.movement_reasons
  set name = v_name
  where id = p_reason_id;
end;
$$;

revoke all on function public.rename_movement_reason(uuid, text)
from public, anon, authenticated;

grant execute on function public.rename_movement_reason(uuid, text)
to authenticated;

comment on table public.movement_reasons is
  'Catálogo editable de motivos para los movimientos de inventario.';

comment on function public.update_inventory_movement(
  uuid, public.movement_type, numeric, numeric, numeric, text, text
) is
  'Edita un movimiento y recalcula en orden el stock, costo promedio e importes.';

comment on function public.delete_inventory_movement(uuid) is
  'Elimina un movimiento y reconstruye el saldo del producto y almacén.';

commit;
