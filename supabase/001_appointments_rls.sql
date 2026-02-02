-- 001_appointments_rls.sql
-- Segurança real no Supabase: RLS + policies

alter table public.appointments enable row level security;

-- SELECT: usuário enxerga só os próprios agendamentos
drop policy if exists "appointments_select_own" on public.appointments;
create policy "appointments_select_own"
on public.appointments
for select
to authenticated
using (user_id = auth.uid());

-- INSERT: usuário só pode criar para si mesmo
drop policy if exists "appointments_insert_own" on public.appointments;
create policy "appointments_insert_own"
on public.appointments
for insert
to authenticated
with check (user_id = auth.uid());

-- UPDATE: por padrão BLOQUEADO (mais seguro).
-- Se você quiser permitir cancelamento pelo site, me peça e eu ajusto.
drop policy if exists "appointments_update_none" on public.appointments;
create policy "appointments_update_none"
on public.appointments
for update
to authenticated
using (false);

-- DELETE: bloqueado
drop policy if exists "appointments_delete_none" on public.appointments;
create policy "appointments_delete_none"
on public.appointments
for delete
to authenticated
using (false);
