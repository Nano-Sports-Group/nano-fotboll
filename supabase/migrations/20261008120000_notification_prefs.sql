-- Notistyper per användare och sport. Lagras på profilen i stället för i en egen tabell: raden
-- finns redan per konto, låses av samma RLS och försvinner med kontoraderingen (delete_user_account).
-- Form: { "<sport>": { "<typ>": true|false } }. Saknat värde = typens förval (lib/notification-types.ts).
alter table public.profiles
  add column if not exists notification_prefs jsonb not null default '{}'::jsonb;

comment on column public.profiles.notification_prefs is
  'Notisval per sport och typ: {"hockey":{"rumours":true}}. Saknat värde = förvalet i nano-fotboll/lib/notification-types.ts. Läses av nano-os push.ts.';
