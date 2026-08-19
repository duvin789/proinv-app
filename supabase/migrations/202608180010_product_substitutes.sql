begin;

create unique index if not exists products_id_org_unit_idx
  on public.products (id, organization_id, unit);

create table if not exists public.product_substitutes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id) on delete cascade,
  product_id uuid not null,
  product_unit text not null,
  substitute_product_id uuid not null,
  substitute_unit text not null,
  note text,
  created_by uuid default auth.uid()
    references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_substitutes_distinct_products check (
    product_id <> substitute_product_id
  ),
  constraint product_substitutes_note_length check (
    note is null or char_length(note) <= 500
  ),
  constraint product_substitutes_matching_units check (
    lower(btrim(product_unit)) = lower(btrim(substitute_unit))
  ),
  constraint product_substitutes_product_same_organization foreign key (
    product_id,
    organization_id,
    product_unit
  ) references public.products (id, organization_id, unit)
    on update cascade on delete cascade,
  constraint product_substitutes_substitute_same_organization foreign key (
    substitute_product_id,
    organization_id,
    substitute_unit
  ) references public.products (id, organization_id, unit)
    on update cascade on delete cascade
);

create unique index if not exists product_substitutes_canonical_pair_idx
  on public.product_substitutes (
    organization_id,
    least(product_id, substitute_product_id),
    greatest(product_id, substitute_product_id)
  );

create index if not exists product_substitutes_product_idx
  on public.product_substitutes (organization_id, product_id);

create index if not exists product_substitutes_substitute_idx
  on public.product_substitutes (organization_id, substitute_product_id);

create or replace function private.validate_product_substitute_units()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_swap_product_id uuid;
  v_product_unit text;
  v_substitute_unit text;
begin
  if new.product_id > new.substitute_product_id then
    v_swap_product_id := new.product_id;
    new.product_id := new.substitute_product_id;
    new.substitute_product_id := v_swap_product_id;
  end if;

  select unit
  into v_product_unit
  from public.products
  where id = new.product_id
    and organization_id = new.organization_id
  for share;

  select unit
  into v_substitute_unit
  from public.products
  where id = new.substitute_product_id
    and organization_id = new.organization_id
  for share;

  if v_product_unit is null or v_substitute_unit is null then
    raise exception
      'Ambos productos deben existir en la misma organización.';
  end if;

  if lower(btrim(v_product_unit)) <> lower(btrim(v_substitute_unit)) then
    raise exception
      'Los productos sustitutos deben usar la misma unidad de medida.';
  end if;

  new.product_unit := v_product_unit;
  new.substitute_unit := v_substitute_unit;

  return new;
end;
$$;

revoke all on function private.validate_product_substitute_units()
from public, anon, authenticated;

drop trigger if exists product_substitutes_validate_units
on public.product_substitutes;

create trigger product_substitutes_validate_units
before insert or update of organization_id, product_id, substitute_product_id
on public.product_substitutes
for each row execute function private.validate_product_substitute_units();

create or replace function private.prevent_linked_product_unit_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(btrim(new.unit)) is distinct from lower(btrim(old.unit))
    and exists (
      select 1
      from public.product_substitutes
      where organization_id = old.organization_id
        and (product_id = old.id or substitute_product_id = old.id)
    ) then
    raise exception
      'Elimina primero las relaciones de sustitución antes de cambiar la unidad de medida.';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_linked_product_unit_change()
from public, anon, authenticated;

drop trigger if exists products_prevent_linked_unit_change
on public.products;

create trigger products_prevent_linked_unit_change
before update of unit on public.products
for each row execute function private.prevent_linked_product_unit_change();

drop trigger if exists product_substitutes_set_updated_at
on public.product_substitutes;

create trigger product_substitutes_set_updated_at
before update on public.product_substitutes
for each row execute function private.set_updated_at();

alter table public.product_substitutes enable row level security;

drop policy if exists "product_substitutes_select_members"
on public.product_substitutes;
create policy "product_substitutes_select_members"
on public.product_substitutes
for select
to authenticated
using ((select private.is_org_member(organization_id)));

drop policy if exists "product_substitutes_insert_admins"
on public.product_substitutes;
create policy "product_substitutes_insert_admins"
on public.product_substitutes
for insert
to authenticated
with check (
  (select private.is_org_admin(organization_id))
  and created_by = (select auth.uid())
);

drop policy if exists "product_substitutes_update_admins"
on public.product_substitutes;
create policy "product_substitutes_update_admins"
on public.product_substitutes
for update
to authenticated
using ((select private.is_org_admin(organization_id)))
with check ((select private.is_org_admin(organization_id)));

drop policy if exists "product_substitutes_delete_admins"
on public.product_substitutes;
create policy "product_substitutes_delete_admins"
on public.product_substitutes
for delete
to authenticated
using ((select private.is_org_admin(organization_id)));

revoke all on table public.product_substitutes
from public, anon, authenticated;

grant select on table public.product_substitutes to authenticated;
grant insert (
  organization_id,
  product_id,
  substitute_product_id,
  note
) on public.product_substitutes to authenticated;
grant update (note) on public.product_substitutes to authenticated;
grant delete on table public.product_substitutes to authenticated;

comment on table public.product_substitutes is
  'Relaciones simétricas y explícitas de sustitución entre productos de una misma organización.';

comment on column public.product_substitutes.note is
  'Nota opcional que explica cuándo o por qué ambos productos son sustitutos.';

notify pgrst, 'reload schema';

commit;
