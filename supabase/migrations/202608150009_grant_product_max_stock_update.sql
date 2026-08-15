begin;

-- max_stock was added after the original column-level product grants.
-- Keep RLS enforcement while allowing authorized members to edit every
-- commercial field exposed by the product form.
grant update (max_stock)
on table public.products
to authenticated;

notify pgrst, 'reload schema';

commit;
