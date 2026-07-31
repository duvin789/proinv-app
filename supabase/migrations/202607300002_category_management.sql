begin;

alter table public.categories
alter column color set default '#0ea5e9';

create or replace function private.detach_products_from_deleted_category()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.products
  set category_id = null
  where category_id = old.id
    and organization_id = old.organization_id;

  return old;
end;
$$;

revoke all on function private.detach_products_from_deleted_category()
from public, anon, authenticated;

drop trigger if exists categories_detach_products_before_delete
on public.categories;

create trigger categories_detach_products_before_delete
before delete on public.categories
for each row execute function private.detach_products_from_deleted_category();

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
  values (v_organization_id, 'General', '#0ea5e9');

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public;

commit;
