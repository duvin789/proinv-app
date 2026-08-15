begin;

alter table public.products
add column if not exists image_path text;

alter table public.products
drop constraint if exists products_image_path_format;

alter table public.products
add constraint products_image_path_format check (
  image_path is null
  or (
    image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
    and split_part(image_path, '/', 1) = organization_id::text
  )
);

create unique index if not exists products_image_path_unique_idx
on public.products (image_path)
where image_path is not null;

grant update (image_path) on public.products to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'product-images',
  'product-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.can_read_product_image(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members as membership
    where membership.user_id = (select auth.uid())
      and membership.organization_id::text = split_part(p_name, '/', 1)
  );
$$;

create or replace function private.can_write_product_image(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members as membership
    where membership.user_id = (select auth.uid())
      and membership.organization_id::text = split_part(p_name, '/', 1)
      and membership.role in (
        'owner'::public.member_role,
        'admin'::public.member_role,
        'operator'::public.member_role
      )
  );
$$;

revoke all on function private.can_read_product_image(text) from public;
revoke all on function private.can_write_product_image(text) from public;
grant execute on function private.can_read_product_image(text) to authenticated;
grant execute on function private.can_write_product_image(text) to authenticated;

drop policy if exists "product_images_select_members" on storage.objects;
create policy "product_images_select_members"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'product-images'
  and (select private.can_read_product_image(name))
);

drop policy if exists "product_images_insert_operators" on storage.objects;
create policy "product_images_insert_operators"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'product-images'
  and (select private.can_write_product_image(name))
);

drop policy if exists "product_images_update_operators" on storage.objects;
create policy "product_images_update_operators"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'product-images'
  and (select private.can_write_product_image(name))
)
with check (
  bucket_id = 'product-images'
  and (select private.can_write_product_image(name))
);

drop policy if exists "product_images_delete_operators" on storage.objects;
create policy "product_images_delete_operators"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'product-images'
  and (select private.can_write_product_image(name))
);

create or replace function public.create_product_with_stock_v3(
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
  p_max_stock numeric,
  p_image_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product_id uuid;
  v_organization_id uuid;
begin
  v_product_id := public.create_product_with_stock_v2(
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
    p_min_stock,
    p_max_stock
  );

  select product.organization_id
  into v_organization_id
  from public.products as product
  where product.id = v_product_id;

  if p_image_path is not null and (
    p_image_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
    or split_part(p_image_path, '/', 1) <> v_organization_id::text
  ) then
    raise exception 'La ruta de la imagen no es válida para esta empresa.';
  end if;

  update public.products
  set image_path = p_image_path
  where id = v_product_id;

  return v_product_id;
end;
$$;

revoke all on function public.create_product_with_stock_v3(
  text, text, text, text, uuid, uuid, uuid, text,
  numeric, numeric, numeric, numeric, numeric, text
) from public, anon, authenticated;

grant execute on function public.create_product_with_stock_v3(
  text, text, text, text, uuid, uuid, uuid, text,
  numeric, numeric, numeric, numeric, numeric, text
) to authenticated;

drop function if exists public.clear_inventory_data(text);

create function public.clear_inventory_data(
  p_confirmation text
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_image_paths text[] := array[]::text[];
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
    and membership.role in (
      'owner'::public.member_role,
      'admin'::public.member_role
    )
  order by membership.created_at
  limit 1;

  if v_organization_id is null then
    raise exception 'Solo un propietario o administrador puede borrar todos los datos.';
  end if;

  select coalesce(array_agg(product.image_path), array[]::text[])
  into v_image_paths
  from public.products as product
  where product.organization_id = v_organization_id
    and product.image_path is not null;

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

  return v_image_paths;
end;
$$;

revoke all on function public.clear_inventory_data(text)
from public, anon, authenticated;

grant execute on function public.clear_inventory_data(text)
to authenticated;

comment on column public.products.image_path is
  'Ruta privada en el bucket product-images; el binario no se almacena en la tabla.';

comment on function public.clear_inventory_data(text) is
  'Borra datos operativos para owner/admin y devuelve las rutas privadas que la aplicación debe retirar de Storage.';

notify pgrst, 'reload schema';

commit;
