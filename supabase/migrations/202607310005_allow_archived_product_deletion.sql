begin;

drop function if exists public.delete_inventory_product(uuid);

create function public.delete_inventory_product(
  p_product_id uuid,
  p_confirmation text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Debes iniciar sesión para eliminar productos.';
  end if;

  if upper(btrim(coalesce(p_confirmation, ''))) <> 'ELIMINAR' then
    raise exception 'Escribe ELIMINAR para confirmar la operación.';
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

  perform 1
  from public.inventory_movements as movement
  where movement.product_id = p_product_id
  for update;

  delete from public.inventory_movements
  where product_id = p_product_id;

  delete from public.inventory_balances
  where product_id = p_product_id;

  delete from public.products
  where id = p_product_id;
end;
$$;

revoke all on function public.delete_inventory_product(uuid, text)
from public, anon, authenticated;

grant execute on function public.delete_inventory_product(uuid, text)
to authenticated;

comment on function public.delete_inventory_product(uuid, text) is
  'Elimina definitivamente un producto archivado junto con su stock e historial.';

commit;
