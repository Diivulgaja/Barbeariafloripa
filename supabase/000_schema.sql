-- 000_schema.sql
-- Cria schema mínimo para appointments (ajuste se você já tem a tabela)

create table if not exists public.appointments (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  user_id uuid not null,
  date_iso timestamptz not null,
  status text not null default 'confirmado',
  details jsonb not null default '{}'::jsonb
);

-- Index para performance
create index if not exists appointments_user_id_idx on public.appointments(user_id);
create index if not exists appointments_date_iso_idx on public.appointments(date_iso);
