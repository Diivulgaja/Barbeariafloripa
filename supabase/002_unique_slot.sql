-- 002_unique_slot.sql
-- Trava para impedir conflito de horário (mesmo barbeiro, mesma data/hora)
-- ATENÇÃO: depende de você salvar barber_id no details (jsonb)

-- cria coluna virtual / computed via expressão:
-- barber_id vem de details->barber->id
-- você pode optar por criar uma coluna real. Aqui usamos índice único em expressão.

create unique index if not exists appointments_unique_slot
on public.appointments (
  (details->'barber'->>'id'),
  date_iso
);

-- Observação:
-- Se você usar "Qualquer Profissional" (id 3), você pode decidir não travar por barbeiro,
-- e travar só por date_iso. Me diga como quer.
