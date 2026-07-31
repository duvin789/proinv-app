begin;

create or replace function public.delete_inventory_product(
  p_product_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_current_stock numeric(18, 3);
begin
  if (select auth.uid()) is null then
    raise exception 'Debes iniciar sesión para eliminar productos.';
  end if;

  select product.*
  into v_product
  from public.products as product
  where product.id = p_product_id
  for update;

  if not found then
    raise exception 'El producto seleccionado no existe.';
  end if;

  if not private.is_org_admin(v_product.organization_id) then
    raise exception
      'Solo un propietario o administrador puede eliminar productos.';
  end if;

  if v_product.active then
    raise exception
      'Archiva el producto antes de eliminarlo definitivamente.';
  end if;

  perform 1
  from public.inventory_balances as balance
  where balance.product_id = p_product_id
  for update;

  select coalesce(sum(balance.current_stock), 0)
  into v_current_stock
  from public.inventory_balances as balance
  where balance.product_id = p_product_id;

  if v_current_stock <> 0 then
    raise exception
      'El producto todavía tiene stock. Registra la salida correspondiente antes de eliminarlo.';
  end if;

  if exists (
    select 1
    from public.inventory_movements as movement
    where movement.product_id = p_product_id
  ) then
    raise exception
      'El producto tiene historial de movimientos y no puede borrarse. Déjalo archivado para conservar la trazabilidad.';
  end if;

  delete from public.inventory_balances
  where product_id = p_product_id;

  delete from public.products
  where id = p_product_id;
end;
$$;

revoke all on function public.delete_inventory_product(uuid)
from public, anon, authenticated;

grant execute on function public.delete_inventory_product(uuid)
to authenticated;

comment on function public.delete_inventory_product(uuid) is
  'Elimina definitivamente un producto archivado, sin stock y sin historial.';

commit;
