-- Let the publishable (anon) key read the Koti demo tables, so the app server
-- can use it instead of the secret key. The data is synthetic and its source is
-- public on GitHub. The key can only read: there are no insert, update or
-- delete policies, and the grants below allow select only.
--
-- The app still reads these tables on the server and chooses the customer
-- there. Do not query them from browser code.

do $$
declare t text;
begin
  foreach t in array array['demo_clocks', 'personas', 'transactions', 'csv_datasets', 'csv_rows'] loop
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('drop policy if exists "Demo data is readable" on public.%I', t);
    execute format('create policy "Demo data is readable" on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;
