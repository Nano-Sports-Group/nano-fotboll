-- Billing core: prenumerationer, rättigheter, moms, huvudbok (2026-10-07)
-- Kontrakt: docs/billing/ARCHITECTURE.md §4–5. Bara tillägg, idempotent.
--
-- Principen: leverantörerna (Stripe/Apple/Google) slutar vid normaliseringen.
-- Allt som rör pengar skrivs av EN funktion, billing_apply_event(), i EN
-- transaktion — en halv betalning ska aldrig gå att hitta i databasen.
--
-- Säkerhet (SAKERHETSDOKTRIN): RLS på alla tabeller, inga policys, inga grants
-- till anon/authenticated. Supabase ger default privileges till anon/authenticated
-- på nya objekt, därför revokas de uttryckligen — `from public` räcker inte.
-- Funktionerna är SECURITY INVOKER: service_role är enda anroparen.
--
-- Inte skatterådgivning. Alla satser och scheman som beror på en skattebedömning
-- ligger som data märkt TAX_ADVISER_VERIFICATION_REQUIRED, aldrig som slutsats i koden.

-- ── Användare ───────────────────────────────────────────────────────────────
-- E-post är aldrig nyckel; clerk_user_id är den finansiella identiteten.
create table if not exists public.billing_users (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null unique,
  email text,
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  country_source text check (country_source is null or country_source in
    ('manual_verified','stripe_tax','billing_address','payment_method_country',
     'apple_storefront','google_play_country','ip')),
  -- Sätts när rättighetsmängden ändrats; cron projicerar till Clerk och nollar den.
  projection_dirty_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists billing_users_dirty_idx
  on public.billing_users (projection_dirty_at) where projection_dirty_at is not null;

-- Leverantörens kund-id. Ett per användare, leverantör och miljö (annars får
-- kassan en ny Stripe-kund per köp, som idag).
create table if not exists public.billing_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.billing_users(id),
  provider text not null check (provider in ('stripe','apple','google','manual','promotional')),
  provider_customer_id text not null,
  environment text not null default 'live' check (environment in ('live','test')),
  created_at timestamptz not null default now(),
  unique (provider, provider_customer_id),
  unique (user_id, provider, environment)
);

-- Produkt → vilka rättigheter den ger. Data, så en ny produkt inte kräver kod.
create table if not exists public.billing_products (
  id text primary key,
  name text not null,
  vertical text not null check (vertical in ('football','hockey','golf','sport','maps','tv')),
  plan text not null check (plan in ('pro','elite','plus')),
  entitlements text[] not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.billing_users(id),
  provider text not null check (provider in ('stripe','apple','google','manual','promotional')),
  provider_customer_id text,
  provider_subscription_id text not null,
  provider_transaction_id text,
  product_id text not null references public.billing_products(id),
  plan_id text,
  status text not null check (status in
    ('trialing','active','past_due','grace','paused','canceled','expired','revoked')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  grace_until timestamptz,
  price_amount bigint check (price_amount is null or price_amount >= 0),
  price_currency text check (price_currency is null or price_currency ~ '^[A-Z]{3}$'),
  price_interval text check (price_interval is null or price_interval in ('week','month','year')),
  -- Leverantörens egen händelsetid: händelser kommer i oordning och den äldre får inte vinna.
  provider_event_time timestamptz,
  last_verified_at timestamptz,
  environment text not null default 'live' check (environment in ('live','test')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);
create index if not exists billing_subscriptions_user_idx on public.billing_subscriptions (user_id);
create index if not exists billing_subscriptions_status_idx on public.billing_subscriptions (status);
create index if not exists billing_subscriptions_product_idx on public.billing_subscriptions (product_id);
create index if not exists billing_subscriptions_alive_idx
  on public.billing_subscriptions (current_period_end, grace_until)
  where status in ('trialing','active','past_due','grace');

-- Manuella och kampanjrättigheter är också prenumerationer (provider manual/promotional),
-- så subscription_id är alltid satt och källan alltid spårbar.
create table if not exists public.user_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.billing_users(id),
  entitlement text not null,
  status text not null check (status in ('active','expired','revoked')),
  source text not null check (source in ('stripe','apple','google','manual','promotional')),
  subscription_id uuid not null references public.billing_subscriptions(id),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, entitlement, subscription_id)
);
create index if not exists user_entitlements_subscription_idx on public.user_entitlements (subscription_id);
create index if not exists user_entitlements_status_idx on public.user_entitlements (user_id, status);

-- Webhook-idempotens: samma event_id behandlas aldrig två gånger.
create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('stripe','apple','google','manual','promotional')),
  event_id text not null,
  event_type text,
  received_at timestamptz not null default now(),
  last_attempt_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'processing'
    check (status in ('processing','processed','failed','ignored')),
  payload_hash text,
  error_message text,
  attempts int not null default 1,
  unique (provider, event_id)
);
create index if not exists webhook_events_status_idx on public.webhook_events (status, last_attempt_at);

-- ── Finansiella poster (oföränderliga) ──────────────────────────────────────
-- Rättelser är nya rader (refund/reversal/credit_note/adjustment), aldrig UPDATE.
-- Spec-fälten transaction_currency/transaction_amount motsvaras av currency/gross_amount.
create table if not exists public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.billing_users(id),
  subscription_id uuid references public.billing_subscriptions(id),
  product_id text references public.billing_products(id),
  billing_provider text not null check (billing_provider in ('stripe','apple','google','manual','promotional')),
  provider_transaction_id text not null,
  type text not null check (type in ('sale','refund','dispute','fee','adjustment','reversal','credit_note')),
  transaction_date timestamptz not null default now(),
  -- currency = transaction_currency, gross_amount = transaction_amount (uppdragets §18).
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  gross_amount bigint not null,
  net_amount bigint not null,
  tax_amount bigint not null,
  tax_rate numeric(8,6) check (tax_rate is null or (tax_rate >= 0 and tax_rate <= 1)),
  tax_country text check (tax_country is null or tax_country ~ '^[A-Z]{2}$'),
  tax_type text not null check (tax_type in ('vat','platform_collected','none','unknown')),
  tax_calculation_method text not null check (tax_calculation_method in
    ('provider_calculated','inclusive_from_gross','proportional_to_original','platform_collected','none')),
  tax_exemption_reason text,
  customer_country text check (customer_country is null or customer_country ~ '^[A-Z]{2}$'),
  customer_country_source text check (customer_country_source is null or customer_country_source in
    ('manual_verified','stripe_tax','billing_address','payment_method_country',
     'apple_storefront','google_play_country','ip')),
  country_evidence jsonb not null default '[]'::jsonb,
  -- På en återbetalning: det återbetalade beloppet (absolut). Annars 0.
  refund_amount bigint not null default 0 check (refund_amount >= 0),
  original_transaction_id uuid references public.financial_transactions(id),
  invoice_id text,
  invoice_number text,
  invoice_url text,
  -- Valuta för bokföringen. Aldrig tyst omräkning: belopp kräver kurs, källa och tid.
  accounting_currency text check (accounting_currency is null or accounting_currency ~ '^[A-Z]{3}$'),
  accounting_amount bigint,
  fx_rate numeric(18,8),
  fx_rate_source text,
  fx_timestamp timestamptz,
  needs_review boolean not null default false,
  review_reason text,
  environment text not null default 'live' check (environment in ('live','test')),
  created_at timestamptz not null default now(),
  constraint financial_transactions_gross_eq check (gross_amount = net_amount + tax_amount),
  constraint financial_transactions_sign check (
    (type = 'sale' and gross_amount > 0)
    or (type in ('refund','reversal','credit_note','dispute','fee') and gross_amount < 0)
    or type = 'adjustment'),
  constraint financial_transactions_fx check (
    accounting_amount is null
    or (accounting_currency is not null and fx_rate is not null
        and fx_rate_source is not null and fx_timestamp is not null)),
  constraint financial_transactions_review_reason check (not needs_review or review_reason is not null),
  unique (billing_provider, provider_transaction_id, type)
);
create index if not exists financial_transactions_user_idx on public.financial_transactions (user_id);
create index if not exists financial_transactions_date_idx on public.financial_transactions (environment, transaction_date);
create index if not exists financial_transactions_original_idx on public.financial_transactions (original_transaction_id);
create index if not exists financial_transactions_subscription_idx on public.financial_transactions (subscription_id);
create index if not exists financial_transactions_product_idx on public.financial_transactions (product_id);
create index if not exists financial_transactions_review_idx
  on public.financial_transactions (transaction_date) where needs_review;

-- Momsboken. type/tax_type/environment är kopierade hit så rapporterna slipper join.
create table if not exists public.vat_transactions (
  id uuid primary key default gen_random_uuid(),
  financial_transaction_id uuid not null unique references public.financial_transactions(id),
  customer_id uuid not null references public.billing_users(id),
  transaction_date timestamptz not null,
  type text not null,
  tax_type text not null,
  environment text not null check (environment in ('live','test')),
  customer_country text check (customer_country is null or customer_country ~ '^[A-Z]{2}$'),
  tax_jurisdiction text check (tax_jurisdiction is null or tax_jurisdiction ~ '^[A-Z]{2}$'),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  gross_amount bigint not null,
  net_amount bigint not null,
  vat_amount bigint not null,
  vat_rate numeric(8,6),
  vat_code text,
  provider text not null,
  provider_transaction_id text not null,
  invoice_id text,
  refund_status text not null default 'none'
    check (refund_status in ('none','refunded','partially_refunded','reversal','credit_note')),
  created_at timestamptz not null default now(),
  constraint vat_transactions_gross_eq check (gross_amount = net_amount + vat_amount)
);
create index if not exists vat_transactions_customer_idx on public.vat_transactions (customer_id);
create index if not exists vat_transactions_date_idx on public.vat_transactions (environment, transaction_date);
create index if not exists vat_transactions_jurisdiction_idx on public.vat_transactions (tax_jurisdiction, transaction_date);

-- ── Kontoplan och huvudbok ──────────────────────────────────────────────────
-- Kontoplanen är data per bolag; kodsiffrorna är EXEMPEL, inte en svensk BAS-slutsats.
create table if not exists public.ledger_accounts (
  id uuid primary key default gen_random_uuid(),
  legal_entity text not null,
  code text not null,
  name text not null,
  type text not null check (type in ('asset','liability','revenue','contra_revenue','expense','equity')),
  role text not null check (role in
    ('revenue','vat_payable','clearing_stripe','clearing_apple','clearing_google','refunds','payment_fees','fx')),
  jurisdiction text,
  created_at timestamptz not null default now(),
  unique (legal_entity, role),
  unique (legal_entity, code)
);

create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  financial_transaction_id uuid not null references public.financial_transactions(id),
  legal_entity text not null,
  account_code text not null,
  debit bigint not null default 0 check (debit >= 0),
  credit bigint not null default 0 check (credit >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  constraint ledger_entries_one_side check (debit = 0 or credit = 0),
  foreign key (legal_entity, account_code) references public.ledger_accounts (legal_entity, code)
);
create index if not exists ledger_entries_tx_idx on public.ledger_entries (financial_transaction_id);
create index if not exists ledger_entries_account_idx on public.ledger_entries (legal_entity, account_code);

-- Vem granskade en flaggad post. Posten själv är låst, så granskningen är en egen rad.
create table if not exists public.financial_transaction_reviews (
  id uuid primary key default gen_random_uuid(),
  financial_transaction_id uuid not null references public.financial_transactions(id),
  reviewer text not null,
  outcome text not null check (outcome in ('approved','corrected','rejected')),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists financial_transaction_reviews_tx_idx
  on public.financial_transaction_reviews (financial_transaction_id);

-- ── Skattekonfiguration (rådgivaren ändrar data, inte kod) ──────────────────
create table if not exists public.vat_rates (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text not null check (jurisdiction ~ '^[A-Z]{2}$'),
  rate numeric(8,6) not null check (rate >= 0 and rate <= 1),
  vat_code text not null,
  effective_from date not null,
  effective_until date,
  verification_status text not null default 'TAX_ADVISER_VERIFICATION_REQUIRED'
    check (verification_status in ('TAX_ADVISER_VERIFICATION_REQUIRED','VERIFIED')),
  notes text,
  created_at timestamptz not null default now(),
  unique (jurisdiction, effective_from)
);

create table if not exists public.tax_configuration (
  id uuid primary key default gen_random_uuid(),
  legal_entity text not null,
  country text not null check (country ~ '^[A-Z]{2}$'),
  tax_scheme text not null,
  tax_registration_number text,
  tax_regime text,
  effective_from date not null,
  effective_until date,
  filing_frequency text check (filing_frequency is null or filing_frequency in ('monthly','quarterly','annual')),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  accounting_currency text check (accounting_currency is null or accounting_currency ~ '^[A-Z]{3}$'),
  verification_status text not null default 'TAX_ADVISER_VERIFICATION_REQUIRED'
    check (verification_status in ('TAX_ADVISER_VERIFICATION_REQUIRED','VERIFIED')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (legal_entity, country, tax_scheme, effective_from)
);

create table if not exists public.vat_periods (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text not null check (jurisdiction ~ '^[A-Z]{2}$'),
  period_type text not null check (period_type in ('monthly','quarterly','annual')),
  period_start date not null,
  period_end date not null,
  status text not null default 'open' check (status in ('open','report_generated','submitted','paid')),
  gross_sales bigint not null default 0,
  net_sales bigint not null default 0,
  vat_collected bigint not null default 0,
  vat_refunded bigint not null default 0,
  vat_payable bigint not null default 0,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  report_generated_at timestamptz,
  submitted_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (jurisdiction, period_type, period_start, currency)
);

-- Tomt från start: datumen skapas av revisorn/admin, aldrig av oss.
create table if not exists public.tax_filing_deadlines (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text not null,
  scheme text not null,
  period text not null,
  filing_deadline date,
  payment_deadline date,
  status text not null default 'upcoming' check (status in ('upcoming','submitted','paid','missed')),
  confirmed boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (jurisdiction, scheme, period)
);

-- Vad får användaren köpa var? Styr UI via servern, hårdkoda aldrig "alltid webb".
create table if not exists public.payment_routing_rules (
  id uuid primary key default gen_random_uuid(),
  priority int not null default 100,
  platform text check (platform is null or platform in ('web','ios','android')),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  storefront text,
  min_app_version text,
  product_type text,
  program text,
  flow text not null check (flow in ('stripe_web','apple_iap','google_play','external_web_checkout','not_available')),
  enabled boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Extern webbkassa i en app kräver ett uttryckligt program (Apple/Google-villkor).
  constraint payment_routing_external_needs_program check (flow <> 'external_web_checkout' or program is not null)
);
create index if not exists payment_routing_rules_lookup_idx
  on public.payment_routing_rules (platform, priority) where enabled;

-- Granskningslogg. Oföränderlig.
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  action text not null,
  subject_type text not null,
  subject_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_subject_idx on public.audit_logs (subject_type, subject_id);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at);
create index if not exists audit_logs_actor_idx on public.audit_logs (actor);

-- ── Oföränderlighet ─────────────────────────────────────────────────────────
-- Gäller alla roller, även service_role: en felaktig post rättas med en ny rad.
create or replace function public.billing_forbid_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'billing: % on % is forbidden (immutable); post a correcting row instead',
    tg_op, tg_table_name
    using errcode = 'restrict_violation';
end;
$$;

create or replace trigger financial_transactions_immutable
  before update or delete on public.financial_transactions
  for each row execute function public.billing_forbid_mutation();
create or replace trigger financial_transactions_no_truncate
  before truncate on public.financial_transactions
  for each statement execute function public.billing_forbid_mutation();

create or replace trigger vat_transactions_immutable
  before update or delete on public.vat_transactions
  for each row execute function public.billing_forbid_mutation();
create or replace trigger vat_transactions_no_truncate
  before truncate on public.vat_transactions
  for each statement execute function public.billing_forbid_mutation();

create or replace trigger ledger_entries_immutable
  before update or delete on public.ledger_entries
  for each row execute function public.billing_forbid_mutation();
create or replace trigger ledger_entries_no_truncate
  before truncate on public.ledger_entries
  for each statement execute function public.billing_forbid_mutation();

create or replace trigger audit_logs_immutable
  before update or delete on public.audit_logs
  for each row execute function public.billing_forbid_mutation();
create or replace trigger audit_logs_no_truncate
  before truncate on public.audit_logs
  for each statement execute function public.billing_forbid_mutation();

-- ── Frön ────────────────────────────────────────────────────────────────────
insert into public.system_config (key, value, description)
values (
  'billing',
  '{"stripe_past_due_grace_days":3,"provider_outage_grace_hours":72,"stripe_tax_enabled":false,"legal_entity":"HMJ98","accounting_currency":"AED"}'::jsonb,
  'Billing: dröjsmålsfrist, leverantörsavbrott, Stripe Tax, bolag, bokföringsvaluta'
)
on conflict (key) do nothing;

insert into public.billing_products (id, name, vertical, plan, entitlements) values
  ('nano_fotboll_pro',   'Nano Fotboll PRO',   'football', 'pro',   array['football_pro','maps_pro','ad_free']),
  ('nano_fotboll_elite', 'Nano Fotboll Elite', 'football', 'elite', array['football_pro','football_elite','maps_pro','ad_free']),
  ('nano_hockey_pro',    'Nano Hockey PRO',    'hockey',   'pro',   array['hockey_pro','maps_pro','ad_free']),
  ('nano_golf_pro',      'Nano Golf PRO',      'golf',     'pro',   array['golf_pro','maps_pro','ad_free']),
  ('nano_sport_pro',     'Nano Sport PRO',     'sport',    'pro',   array['football_pro','hockey_pro','golf_pro','maps_pro','ad_free']),
  ('nano_sport_elite',   'Nano Sport Elite',   'sport',    'elite', array['football_pro','football_elite','hockey_pro','golf_pro','maps_pro','ad_free']),
  ('nano_maps_pro',      'Nano Maps PRO',      'maps',     'pro',   array['maps_pro']),
  ('nano_tv_plus',       'Nano TV+',           'tv',       'plus',  array['tv_plus'])
on conflict (id) do nothing;

-- Bara SE och DE. Ett land utan sats får moms 0 + needs_review, aldrig en gissad sats.
insert into public.vat_rates (jurisdiction, rate, vat_code, effective_from, verification_status, notes) values
  ('SE', 0.25, 'SE-STD', date '2024-01-01', 'TAX_ADVISER_VERIFICATION_REQUIRED', 'Standardsats. Rådgivaren bekräftar att den gäller tjänsten.'),
  ('DE', 0.19, 'DE-STD', date '2024-01-01', 'TAX_ADVISER_VERIFICATION_REQUIRED', 'Standardsats. Rådgivaren bekräftar att den gäller tjänsten.')
on conflict (jurisdiction, effective_from) do nothing;

-- Inga registreringsnummer: de fylls i av founder/revisor när de finns.
insert into public.tax_configuration
  (legal_entity, country, tax_scheme, tax_regime, effective_from, filing_frequency, currency, accounting_currency, verification_status, notes)
values
  ('HMJ98', 'AE', 'uae_vat', 'unverified', date '2024-01-01', null, null, 'AED',
   'TAX_ADVISER_VERIFICATION_REQUIRED', 'UAE-moms och bolagsskatt: rådgivaren avgör registrering och frekvens.'),
  ('HMJ98', 'EU', 'eu_oss_non_union', 'unverified', date '2024-01-01', 'quarterly', null, 'AED',
   'TAX_ADVISER_VERIFICATION_REQUIRED', 'Kvartal är standard i OSS men ska bekräftas; deklarationsvaluta är en öppen fråga.')
on conflict (legal_entity, country, tax_scheme, effective_from) do nothing;

-- Kodsiffrorna är exempel, inte en universell kontoplan.
insert into public.ledger_accounts (legal_entity, code, name, type, role) values
  ('HMJ98', '4000', 'Revenue',          'revenue',        'revenue'),
  ('HMJ98', '2610', 'VAT Payable',      'liability',      'vat_payable'),
  ('HMJ98', '1931', 'Stripe Clearing',  'asset',          'clearing_stripe'),
  ('HMJ98', '1932', 'Apple Clearing',   'asset',          'clearing_apple'),
  ('HMJ98', '1933', 'Google Clearing',  'asset',          'clearing_google'),
  ('HMJ98', '4090', 'Refunds',          'contra_revenue', 'refunds'),
  ('HMJ98', '6570', 'Payment Fees',     'expense',        'payment_fees'),
  ('HMJ98', '7960', 'FX Gains/Losses',  'expense',        'fx')
on conflict (legal_entity, role) do nothing;

-- Ingen regel för external_web_checkout: den kräver ett uttryckligt Apple/Google-program.
insert into public.payment_routing_rules (priority, platform, flow, enabled, note)
select 100, 'web', 'stripe_web', true, 'Webben köper via Stripe'
where not exists (select 1 from public.payment_routing_rules where platform = 'web' and flow = 'stripe_web');
insert into public.payment_routing_rules (priority, platform, flow, enabled, note)
select 100, 'ios', 'apple_iap', true, 'iOS köper via Apple IAP'
where not exists (select 1 from public.payment_routing_rules where platform = 'ios' and flow = 'apple_iap');
insert into public.payment_routing_rules (priority, platform, flow, enabled, note)
select 100, 'android', 'google_play', false, 'Avstängd tills Play-produkter finns'
where not exists (select 1 from public.payment_routing_rules where platform = 'android' and flow = 'google_play');

-- ── Hjälpfunktioner ─────────────────────────────────────────────────────────

-- Inställningar ur system_config.billing ovanpå defaults, så funktionerna inte kraschar om raden saknas.
create or replace function public.billing_config()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
           'stripe_past_due_grace_days', 3,
           'provider_outage_grace_hours', 72,
           'stripe_tax_enabled', false,
           'legal_entity', 'HMJ98',
           'accounting_currency', 'AED')
         || coalesce((select value from public.system_config where key = 'billing'), '{}'::jsonb);
$$;

-- Styrka på landbevis: ett svagare får aldrig skriva över ett starkare.
create or replace function public.billing_country_rank(p_source text)
returns int
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_source
    when 'manual_verified'        then 7
    when 'stripe_tax'             then 6
    when 'billing_address'        then 5
    when 'payment_method_country' then 4
    when 'apple_storefront'       then 3
    when 'google_play_country'    then 2
    when 'ip'                     then 1
    else 0
  end;
$$;

-- Moms ur ett MOMSINKLUSIVT pris: gross × rate / (1 + rate). 5900 öre, 25 % → 1180 (inte 1475).
create or replace function public.billing_vat_from_gross(p_gross bigint, p_rate numeric)
returns bigint
language sql
immutable
set search_path = public, pg_temp
as $$
  select round(p_gross::numeric * p_rate / (1 + p_rate))::bigint;
$$;

-- Vilka rättigheter varje prenumeration SKA ge just nu. En enda definition av "aktiv" (arkitekturen §5):
--   trialing/active  och  (periodslut saknas eller now < periodslut + leverantörsavbrottsfrist)
--   past_due/grace   och  now < grace_until
-- Frist i stället för obegränsat: faller leverantören ur gäller senast verifierade läge en bestämd tid (§27).
create or replace function public.billing_entitlement_rows(p_user_id uuid)
returns table (
  entitlement text,
  subscription_id uuid,
  source text,
  is_active boolean,
  new_status text,
  valid_from timestamptz,
  valid_until timestamptz
)
language sql
stable
set search_path = public, pg_temp
as $$
  select
    e.ent,
    s.id,
    s.provider,
    a.act,
    case when a.act then 'active'
         when s.status in ('canceled','revoked') then 'revoked'
         else 'expired' end,
    coalesce(s.current_period_start, s.created_at),
    case when s.status in ('trialing','active') then s.current_period_end + cfg.outage
         when s.status in ('past_due','grace') then s.grace_until
         else s.current_period_end end
  from public.billing_subscriptions s
  join public.billing_products p on p.id = s.product_id
  -- Fristen finns för att en leverantör kan falla ur. manual/promotional har ingen leverantör:
  -- en kampanj som slutar ett datum slutar det datumet.
  cross join lateral (
    select case when s.provider in ('stripe','apple','google')
                then (public.billing_config() ->> 'provider_outage_grace_hours')::int * interval '1 hour'
                else interval '0' end as outage) cfg
  cross join lateral (select distinct unnest(p.entitlements) as ent) e
  cross join lateral (
    select coalesce(
      (s.status in ('trialing','active')
        and (s.current_period_end is null or now() < s.current_period_end + cfg.outage))
      or (s.status in ('past_due','grace') and now() < s.grace_until),
      false) as act
  ) a
  where s.user_id = p_user_id;
$$;

-- Räknar om en användares rättigheter ur prenumerationerna. Rader markeras expired/revoked, raderas aldrig.
-- Returnerar true om MÄNGDEN aktiva rättigheter ändrades (då sätts projection_dirty_at och audit skrivs).
create or replace function public.billing_recompute_entitlements(p_user_id uuid)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_before text[];
  v_after text[];
  v_actor text := coalesce(nullif(current_setting('billing.actor', true), ''), 'system:recompute');
begin
  perform 1 from public.billing_users where id = p_user_id for update;
  if not found then
    raise exception 'billing_recompute_entitlements: unknown user %', p_user_id;
  end if;

  select coalesce(array_agg(distinct ue.entitlement order by ue.entitlement), '{}'::text[])
    into v_before
    from public.user_entitlements ue
   where ue.user_id = p_user_id and ue.status = 'active';

  insert into public.user_entitlements as ue
    (user_id, entitlement, status, source, subscription_id, valid_from, valid_until)
  select p_user_id, r.entitlement, r.new_status, r.source, r.subscription_id, r.valid_from, r.valid_until
    from public.billing_entitlement_rows(p_user_id) r
  on conflict (user_id, entitlement, subscription_id) do update
    set status = excluded.status,
        source = excluded.source,
        valid_from = excluded.valid_from,
        valid_until = excluded.valid_until,
        updated_at = now()
    where (ue.status, ue.source, ue.valid_from, ue.valid_until)
          is distinct from (excluded.status, excluded.source, excluded.valid_from, excluded.valid_until);

  -- Produkten på en prenumeration kan ha bytts: rättigheter den inte längre ger löper ut.
  update public.user_entitlements ue
     set status = 'expired', updated_at = now()
   where ue.user_id = p_user_id
     and ue.status = 'active'
     and not exists (
       select 1 from public.billing_entitlement_rows(p_user_id) r
        where r.entitlement = ue.entitlement and r.subscription_id = ue.subscription_id);

  select coalesce(array_agg(distinct ue.entitlement order by ue.entitlement), '{}'::text[])
    into v_after
    from public.user_entitlements ue
   where ue.user_id = p_user_id and ue.status = 'active';

  if v_before is distinct from v_after then
    update public.billing_users set projection_dirty_at = now(), updated_at = now() where id = p_user_id;
    insert into public.audit_logs (actor, action, subject_type, subject_id, before, after)
    values (v_actor, 'entitlements.changed', 'user', p_user_id::text,
            jsonb_build_object('entitlements', to_jsonb(v_before)),
            jsonb_build_object('entitlements', to_jsonb(v_after)));
    return true;
  end if;
  return false;
end;
$$;

-- ── Webhook-idempotens ──────────────────────────────────────────────────────
-- process: första gången, ett misslyckat försök eller ett "processing" äldre än 5 min (kraschad worker).
-- done: redan klart. busy: någon annan jobbar just nu — svara 409 så leverantören försöker igen.
create or replace function public.billing_claim_webhook(p_provider text, p_event_id text, p_type text, p_hash text)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_row public.webhook_events%rowtype;
begin
  insert into public.webhook_events (provider, event_id, event_type, payload_hash, status, attempts, last_attempt_at)
  values (p_provider, p_event_id, p_type, p_hash, 'processing', 1, now())
  on conflict (provider, event_id) do nothing
  returning id into v_id;

  if v_id is not null then
    return 'process';
  end if;

  select * into v_row
    from public.webhook_events
   where provider = p_provider and event_id = p_event_id
   for update;

  if v_row.status in ('processed','ignored') then
    return 'done';
  end if;

  if v_row.status = 'failed'
     or (v_row.status = 'processing' and v_row.last_attempt_at < now() - interval '5 minutes') then
    update public.webhook_events
       set status = 'processing',
           attempts = attempts + 1,
           last_attempt_at = now(),
           error_message = null,
           event_type = coalesce(p_type, event_type),
           payload_hash = coalesce(p_hash, payload_hash)
     where id = v_row.id;
    return 'process';
  end if;

  return 'busy';
end;
$$;

create or replace function public.billing_finish_webhook(p_provider text, p_event_id text, p_status text, p_error text default null)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if p_status not in ('processed','failed','ignored') then
    raise exception 'billing_finish_webhook: invalid status %', p_status;
  end if;

  update public.webhook_events
     set status = p_status,
         processed_at = case when p_status in ('processed','ignored') then now() else null end,
         error_message = case when p_status = 'failed' then left(coalesce(p_error, 'unknown error'), 2000) else null end
   where provider = p_provider and event_id = p_event_id;

  if not found then
    raise exception 'billing_finish_webhook: unknown event % / %', p_provider, p_event_id;
  end if;
end;
$$;

-- ── Huvudbok: alltid balanserad ─────────────────────────────────────────────
-- Intern: anropas bara av billing_apply_event.
-- Försäljning:   Dr clearing (brutto) · Cr intäkt (netto) · Cr moms
-- Återbetalning: Dr Refunds (netto) · Dr moms · Cr clearing (spegelvänt)
-- Avgift:        Dr Payment Fees · Cr clearing
-- manual/promotional har ingen pengaväg och därmed inget clearingkonto: de får inga rader
-- (funktionen flaggar posten för granskning i stället).
create or replace function public.billing_post_ledger(p_tx_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  f public.financial_transactions%rowtype;
  v_entity text := public.billing_config() ->> 'legal_entity';
  v_clearing_role text;
  v_clearing text;
  v_debit bigint;
  v_credit bigint;
begin
  select * into f from public.financial_transactions where id = p_tx_id;
  if not found then
    raise exception 'billing_post_ledger: unknown transaction %', p_tx_id;
  end if;

  v_clearing_role := case f.billing_provider
    when 'stripe' then 'clearing_stripe'
    when 'apple'  then 'clearing_apple'
    when 'google' then 'clearing_google'
    else null end;
  if v_clearing_role is null then
    return;
  end if;

  select code into v_clearing from public.ledger_accounts where legal_entity = v_entity and role = v_clearing_role;
  if v_clearing is null then
    raise exception 'billing_post_ledger: no % account for legal entity %', v_clearing_role, v_entity;
  end if;

  if f.gross_amount > 0 then
    insert into public.ledger_entries (financial_transaction_id, legal_entity, account_code, debit, credit, currency)
    values (f.id, v_entity, v_clearing, f.gross_amount, 0, f.currency);
    if f.net_amount <> 0 then
      insert into public.ledger_entries (financial_transaction_id, legal_entity, account_code, debit, credit, currency)
      select f.id, v_entity, code, 0, f.net_amount, f.currency
        from public.ledger_accounts where legal_entity = v_entity and role = 'revenue';
      if not found then raise exception 'billing_post_ledger: no revenue account for %', v_entity; end if;
    end if;
    if f.tax_amount <> 0 then
      insert into public.ledger_entries (financial_transaction_id, legal_entity, account_code, debit, credit, currency)
      select f.id, v_entity, code, 0, f.tax_amount, f.currency
        from public.ledger_accounts where legal_entity = v_entity and role = 'vat_payable';
      if not found then raise exception 'billing_post_ledger: no vat_payable account for %', v_entity; end if;
    end if;
  else
    insert into public.ledger_entries (financial_transaction_id, legal_entity, account_code, debit, credit, currency)
    values (f.id, v_entity, v_clearing, 0, -f.gross_amount, f.currency);
    if f.type = 'fee' then
      insert into public.ledger_entries (financial_transaction_id, legal_entity, account_code, debit, credit, currency)
      select f.id, v_entity, code, -f.gross_amount, 0, f.currency
        from public.ledger_accounts where legal_entity = v_entity and role = 'payment_fees';
      if not found then raise exception 'billing_post_ledger: no payment_fees account for %', v_entity; end if;
    else
      if f.net_amount <> 0 then
        insert into public.ledger_entries (financial_transaction_id, legal_entity, account_code, debit, credit, currency)
        select f.id, v_entity, code, -f.net_amount, 0, f.currency
          from public.ledger_accounts where legal_entity = v_entity and role = 'refunds';
        if not found then raise exception 'billing_post_ledger: no refunds account for %', v_entity; end if;
      end if;
      if f.tax_amount <> 0 then
        insert into public.ledger_entries (financial_transaction_id, legal_entity, account_code, debit, credit, currency)
        select f.id, v_entity, code, -f.tax_amount, 0, f.currency
          from public.ledger_accounts where legal_entity = v_entity and role = 'vat_payable';
        if not found then raise exception 'billing_post_ledger: no vat_payable account for %', v_entity; end if;
      end if;
    end if;
  end if;

  select coalesce(sum(debit), 0), coalesce(sum(credit), 0) into v_debit, v_credit
    from public.ledger_entries where financial_transaction_id = f.id;
  if v_debit <> v_credit then
    raise exception 'billing_post_ledger: unbalanced entries for % (debit %, credit %)', f.id, v_debit, v_credit;
  end if;
end;
$$;

-- ── Hela köpet i en transaktion ─────────────────────────────────────────────
-- Kontrakt: ARCHITECTURE.md §5. Belopp på refund/reversal/credit_note/dispute/fee får komma som
-- storlek (positivt) eller negativt — de lagras alltid negativa. adjustment behåller tecknet.
-- Samma användare serialiseras av radlåset på billing_users; dubbletter fångas dessutom av
-- unika index (on conflict) så två samtidiga anrop aldrig kan dubbelskriva.
create or replace function public.billing_apply_event(p_event jsonb)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  c_providers constant text[] := array['stripe','apple','google','manual','promotional'];
  c_sub_status constant text[] := array['trialing','active','past_due','grace','paused','canceled','expired','revoked'];
  c_tx_types constant text[] := array['sale','refund','dispute','fee','adjustment','reversal','credit_note'];
  c_country_src constant text[] := array['manual_verified','stripe_tax','billing_address','payment_method_country','apple_storefront','google_play_country','ip'];
  c_tax_types constant text[] := array['vat','platform_collected','none','unknown'];

  v_cfg jsonb := public.billing_config();
  v_env text;
  v_actor text;
  j_user jsonb;
  j_sub jsonb;
  j_tx jsonb;

  v_clerk text;
  v_ucountry text;
  v_usrc text;
  v_user public.billing_users%rowtype;
  v_other_user uuid;

  -- prenumeration
  v_sprov text;
  v_spid text;
  v_scust text;
  v_stxid text;
  v_prod text;
  v_plan text;
  v_status text;
  v_cps timestamptz;
  v_cpe timestamptz;
  v_cape boolean;
  v_grace timestamptz;
  v_grace_days int;
  v_pamount bigint;
  v_pcur text;
  v_pint text;
  v_meta jsonb;
  v_event_time timestamptz;
  v_old public.billing_subscriptions%rowtype;
  v_found boolean;
  v_sub_id uuid;

  -- transaktion
  v_ttype text;
  v_tprov text;
  v_tid text;
  v_tdate timestamptz;
  v_tday date;
  v_cur text;
  v_gin bigint;
  v_gross bigint;
  v_net bigint;
  v_tax bigint;
  v_rate numeric;
  v_taxtype text;
  v_method text;
  v_exempt text;
  v_country text;
  v_csrc text;
  v_evidence jsonb;
  v_ndistinct int;
  v_reasons text[] := '{}';
  v_orig public.financial_transactions%rowtype;
  v_orig_found boolean := false;
  v_prev_g bigint;
  v_prev_t bigint;
  v_cum bigint;
  v_vatcode text;
  v_refund_status text := 'none';
  v_tx_prod text;
  v_acc_cur text;
  v_acc_amt bigint;
  v_fx_rate numeric;
  v_fx_src text;
  v_fx_ts timestamptz;
  v_tx_id uuid;
  v_dup boolean := false;
  v_changed boolean := false;
  v_ents jsonb;
begin
  -- ── Validera ──
  if p_event is null or coalesce(jsonb_typeof(p_event), '') <> 'object' then
    raise exception 'billing_apply_event: payload must be a json object';
  end if;

  v_env := p_event ->> 'environment';
  if v_env is null or v_env not in ('live','test') then
    raise exception 'billing_apply_event: environment must be live or test';
  end if;
  v_actor := nullif(btrim(p_event ->> 'actor'), '');
  if v_actor is null then
    raise exception 'billing_apply_event: actor is required';
  end if;

  j_user := p_event -> 'user';
  if coalesce(jsonb_typeof(j_user), '') <> 'object' then
    raise exception 'billing_apply_event: user object is required';
  end if;
  v_clerk := nullif(btrim(j_user ->> 'clerk_user_id'), '');
  if v_clerk is null then
    raise exception 'billing_apply_event: user.clerk_user_id is required';
  end if;
  v_ucountry := nullif(j_user ->> 'country', '');
  v_usrc := nullif(j_user ->> 'country_source', '');
  if v_ucountry is not null then
    if v_ucountry !~ '^[A-Z]{2}$' then
      raise exception 'billing_apply_event: user.country must be upper-case ISO-2, got %', v_ucountry;
    end if;
    if v_usrc is null or not (v_usrc = any (c_country_src)) then
      raise exception 'billing_apply_event: user.country_source missing or unknown (%)', v_usrc;
    end if;
  end if;

  j_sub := p_event -> 'subscription';
  if j_sub is not null and jsonb_typeof(j_sub) = 'null' then j_sub := null; end if;
  if j_sub is not null and jsonb_typeof(j_sub) <> 'object' then
    raise exception 'billing_apply_event: subscription must be an object';
  end if;
  j_tx := p_event -> 'transaction';
  if j_tx is not null and jsonb_typeof(j_tx) = 'null' then j_tx := null; end if;
  if j_tx is not null and jsonb_typeof(j_tx) <> 'object' then
    raise exception 'billing_apply_event: transaction must be an object';
  end if;

  if j_sub is not null then
    v_sprov := j_sub ->> 'provider';
    if v_sprov is null or not (v_sprov = any (c_providers)) then
      raise exception 'billing_apply_event: unknown subscription.provider %', v_sprov;
    end if;
    v_spid := nullif(j_sub ->> 'provider_subscription_id', '');
    if v_spid is null then
      raise exception 'billing_apply_event: subscription.provider_subscription_id is required';
    end if;
    v_prod := nullif(j_sub ->> 'product_id', '');
    if v_prod is null then
      raise exception 'billing_apply_event: subscription.product_id is required';
    end if;
    perform 1 from public.billing_products where id = v_prod;
    if not found then
      raise exception 'billing_apply_event: unknown product_id %', v_prod;
    end if;
    v_status := j_sub ->> 'status';
    if v_status is null or not (v_status = any (c_sub_status)) then
      raise exception 'billing_apply_event: unknown subscription.status %', v_status;
    end if;
    v_scust := nullif(j_sub ->> 'provider_customer_id', '');
    v_stxid := nullif(j_sub ->> 'provider_transaction_id', '');
    v_plan := nullif(j_sub ->> 'plan_id', '');
    v_cps := (j_sub ->> 'current_period_start')::timestamptz;
    v_cpe := (j_sub ->> 'current_period_end')::timestamptz;
    v_cape := (j_sub ->> 'cancel_at_period_end')::boolean;
    v_grace := (j_sub ->> 'grace_until')::timestamptz;
    v_pamount := (j_sub ->> 'price_amount')::bigint;
    v_pcur := nullif(j_sub ->> 'price_currency', '');
    v_pint := nullif(j_sub ->> 'price_interval', '');
    if v_pcur is not null and v_pcur !~ '^[A-Z]{3}$' then
      raise exception 'billing_apply_event: bad subscription.price_currency %', v_pcur;
    end if;
    if v_pint is not null and v_pint not in ('week','month','year') then
      raise exception 'billing_apply_event: bad subscription.price_interval %', v_pint;
    end if;
    v_meta := coalesce(j_sub -> 'metadata', '{}'::jsonb);
    if jsonb_typeof(v_meta) <> 'object' then
      raise exception 'billing_apply_event: subscription.metadata must be an object';
    end if;
    v_event_time := coalesce((j_sub ->> 'event_time')::timestamptz, now());
    v_grace_days := (v_cfg ->> 'stripe_past_due_grace_days')::int;
  end if;

  if j_tx is not null then
    v_ttype := j_tx ->> 'type';
    if v_ttype is null or not (v_ttype = any (c_tx_types)) then
      raise exception 'billing_apply_event: unknown transaction.type %', v_ttype;
    end if;
    v_tprov := j_tx ->> 'provider';
    if v_tprov is null or not (v_tprov = any (c_providers)) then
      raise exception 'billing_apply_event: unknown transaction.provider %', v_tprov;
    end if;
    if v_tprov in ('manual','promotional') and v_ttype <> 'adjustment' then
      raise exception 'billing_apply_event: provider % has no money flow; only adjustment transactions are allowed', v_tprov;
    end if;
    v_tid := nullif(j_tx ->> 'provider_transaction_id', '');
    if v_tid is null then
      raise exception 'billing_apply_event: transaction.provider_transaction_id is required';
    end if;
    v_cur := j_tx ->> 'currency';
    if v_cur is null or v_cur !~ '^[A-Z]{3}$' then
      raise exception 'billing_apply_event: transaction.currency must be upper-case ISO-3, got %', v_cur;
    end if;
    if j_tx ->> 'gross_amount' is null then
      raise exception 'billing_apply_event: transaction.gross_amount is required';
    end if;
    v_gin := (j_tx ->> 'gross_amount')::bigint;
    if v_gin = 0 then
      raise exception 'billing_apply_event: transaction.gross_amount must be non-zero';
    end if;
    if v_ttype = 'sale' and v_gin < 0 then
      raise exception 'billing_apply_event: a sale cannot have a negative gross_amount';
    end if;
    v_tdate := coalesce((j_tx ->> 'transaction_date')::timestamptz, now());
    v_tday := (v_tdate at time zone 'Europe/Stockholm')::date;
    v_taxtype := nullif(j_tx ->> 'tax_type', '');
    if v_taxtype is not null and not (v_taxtype = any (c_tax_types)) then
      raise exception 'billing_apply_event: unknown transaction.tax_type %', v_taxtype;
    end if;
    v_country := nullif(j_tx ->> 'customer_country', '');
    if v_country is not null and v_country !~ '^[A-Z]{2}$' then
      raise exception 'billing_apply_event: transaction.customer_country must be upper-case ISO-2, got %', v_country;
    end if;
    v_csrc := nullif(j_tx ->> 'customer_country_source', '');
    if v_csrc is not null and not (v_csrc = any (c_country_src)) then
      raise exception 'billing_apply_event: unknown customer_country_source %', v_csrc;
    end if;
    v_evidence := coalesce(j_tx -> 'country_evidence', '[]'::jsonb);
    if jsonb_typeof(v_evidence) <> 'array' then
      raise exception 'billing_apply_event: country_evidence must be an array';
    end if;
    v_exempt := nullif(j_tx ->> 'tax_exemption_reason', '');
    v_tx_prod := nullif(j_tx ->> 'product_id', '');
    if v_tx_prod is not null then
      perform 1 from public.billing_products where id = v_tx_prod;
      if not found then
        raise exception 'billing_apply_event: unknown transaction.product_id %', v_tx_prod;
      end if;
    end if;
    if v_ttype in ('refund','reversal','credit_note','dispute')
       and nullif(j_tx ->> 'original_provider_transaction_id', '') is null then
      raise exception 'billing_apply_event: % requires original_provider_transaction_id', v_ttype;
    end if;
  end if;

  -- ── 1. Användare ──
  perform set_config('billing.actor', v_actor, true);

  insert into public.billing_users (clerk_user_id, email)
  values (v_clerk, nullif(j_user ->> 'email', ''))
  on conflict (clerk_user_id) do nothing;

  select * into v_user from public.billing_users where clerk_user_id = v_clerk for update;

  if nullif(j_user ->> 'email', '') is not null and v_user.email is distinct from (j_user ->> 'email') then
    update public.billing_users set email = j_user ->> 'email', updated_at = now() where id = v_user.id;
  end if;
  -- Land skrivs bara över av en STARKARE källa.
  if v_ucountry is not null
     and public.billing_country_rank(v_usrc) > public.billing_country_rank(v_user.country_source) then
    update public.billing_users
       set country = v_ucountry, country_source = v_usrc, updated_at = now()
     where id = v_user.id;
  end if;

  -- ── 2. Prenumeration ──
  if j_sub is not null then
    if v_scust is not null then
      select user_id into v_other_user from public.billing_customers
       where provider = v_sprov and provider_customer_id = v_scust;
      if found and v_other_user <> v_user.id then
        raise exception 'billing_apply_event: % customer % belongs to another user', v_sprov, v_scust;
      end if;
      insert into public.billing_customers (user_id, provider, provider_customer_id, environment)
      values (v_user.id, v_sprov, v_scust, v_env)
      on conflict do nothing;
    end if;

    select * into v_old from public.billing_subscriptions
     where provider = v_sprov and provider_subscription_id = v_spid for update;
    v_found := found;

    if not v_found then
      if v_status = 'past_due' and v_grace is null then
        v_grace := v_event_time + (v_grace_days * interval '1 day');
      end if;
      if v_status in ('active','trialing') then
        v_grace := null;
      end if;

      insert into public.billing_subscriptions (
        user_id, provider, provider_customer_id, provider_subscription_id, provider_transaction_id,
        product_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end,
        grace_until, price_amount, price_currency, price_interval, provider_event_time,
        last_verified_at, environment, metadata)
      values (
        v_user.id, v_sprov, v_scust, v_spid, v_stxid,
        v_prod, v_plan, v_status, v_cps, v_cpe, coalesce(v_cape, false),
        v_grace, v_pamount, v_pcur, v_pint, v_event_time,
        now(), v_env, v_meta)
      on conflict (provider, provider_subscription_id) do nothing
      returning id into v_sub_id;

      if v_sub_id is not null then
        insert into public.audit_logs (actor, action, subject_type, subject_id, before, after)
        values (v_actor, 'subscription.created', 'subscription', v_sub_id::text, null,
                jsonb_build_object('status', v_status, 'provider', v_sprov, 'product_id', v_prod));
      else
        -- Ett samtidigt anrop hann först: fortsätt som uppdatering.
        select * into v_old from public.billing_subscriptions
         where provider = v_sprov and provider_subscription_id = v_spid for update;
        v_found := true;
      end if;
    end if;

    if v_found then
      v_sub_id := v_old.id;
      if v_old.user_id <> v_user.id then
        raise exception 'billing_apply_event: % subscription % belongs to another user', v_sprov, v_spid;
      end if;

      -- Äldre händelse än den sparade ändrar ingenting (leverantörer levererar i oordning).
      if v_old.provider_event_time is not null and v_event_time < v_old.provider_event_time then
        null;
      else
        if v_status in ('active','trialing') then
          v_grace := null;
        elsif v_status = 'past_due' and v_grace is null then
          -- Omförsök förlänger inte fristen: behåll den första.
          if v_old.status = 'past_due' and v_old.grace_until is not null then
            v_grace := v_old.grace_until;
          else
            v_grace := v_event_time + (v_grace_days * interval '1 day');
          end if;
        end if;

        update public.billing_subscriptions set
          provider_customer_id = coalesce(v_scust, provider_customer_id),
          provider_transaction_id = coalesce(v_stxid, provider_transaction_id),
          product_id = v_prod,
          plan_id = coalesce(v_plan, plan_id),
          status = v_status,
          current_period_start = coalesce(v_cps, current_period_start),
          current_period_end = coalesce(v_cpe, current_period_end),
          cancel_at_period_end = coalesce(v_cape, cancel_at_period_end),
          grace_until = v_grace,
          price_amount = coalesce(v_pamount, price_amount),
          price_currency = coalesce(v_pcur, price_currency),
          price_interval = coalesce(v_pint, price_interval),
          provider_event_time = v_event_time,
          last_verified_at = now(),
          metadata = metadata || v_meta,
          updated_at = now()
        where id = v_old.id;

        if v_old.status is distinct from v_status then
          insert into public.audit_logs (actor, action, subject_type, subject_id, before, after)
          values (v_actor, 'subscription.status_changed', 'subscription', v_old.id::text,
                  jsonb_build_object('status', v_old.status),
                  jsonb_build_object('status', v_status));
        end if;
      end if;
    end if;
  end if;

  -- ── 3. Finansiell post ──
  if j_tx is not null then
    -- Original för återbetalning m.m. Radlåset gör att två samtidiga återbetalningar köas.
    if v_ttype in ('refund','reversal','credit_note','dispute') then
      select * into v_orig from public.financial_transactions
       where billing_provider = v_tprov
         and provider_transaction_id = (j_tx ->> 'original_provider_transaction_id')
         and type = 'sale'
       for share;
      v_orig_found := found;
    end if;

    v_gross := case when v_ttype in ('refund','reversal','credit_note','dispute','fee') then -abs(v_gin) else v_gin end;

    if v_orig_found then
      v_country := coalesce(v_country, v_orig.customer_country);
      v_csrc := case when nullif(j_tx ->> 'customer_country', '') is null then coalesce(v_csrc, v_orig.customer_country_source) else v_csrc end;
    end if;

    -- Två bevis som säger olika land → granskning. Vi väljer aldrig själva.
    select count(distinct val) into v_ndistinct
      from (select upper(ev ->> 'value') as val from jsonb_array_elements(v_evidence) as ev
            union all select v_country) x
     where val is not null;
    if v_ndistinct > 1 then
      v_reasons := v_reasons || 'conflicting country evidence'::text;
    end if;

    v_tax := 0;
    v_rate := null;
    v_vatcode := null;

    if v_ttype = 'fee' then
      v_tax := 0; v_taxtype := 'none'; v_method := 'none';
    elsif v_ttype = 'dispute' then
      -- Momsbehandlingen av en tvist är en rådgivarfråga: ingen momsrad, alltid granskning.
      v_tax := 0; v_taxtype := 'unknown'; v_method := 'none';
      v_reasons := v_reasons || 'dispute: VAT treatment requires adviser decision'::text;
      if not v_orig_found then
        v_reasons := v_reasons || 'original transaction not found'::text;
      end if;
    elsif v_ttype in ('refund','reversal','credit_note') then
      if v_orig_found then
        select coalesce(sum(-gross_amount), 0), coalesce(sum(-tax_amount), 0) into v_prev_g, v_prev_t
          from public.financial_transactions
         where original_transaction_id = v_orig.id and type in ('refund','reversal','credit_note');
        v_cum := v_prev_g + abs(v_gross);

        if v_orig.tax_type = 'vat' then
          -- Moms i samma proportion som originalet. Slutrestitutionen tar resten så summan
          -- av alla återbetalningar aldrig avviker från originalmomsen på grund av avrundning.
          if v_cum = v_orig.gross_amount then
            v_tax := -(v_orig.tax_amount - v_prev_t);
          else
            v_tax := -round(abs(v_gross)::numeric * v_orig.tax_amount / v_orig.gross_amount)::bigint;
          end if;
          v_taxtype := 'vat';
          v_method := 'proportional_to_original';
          v_rate := v_orig.tax_rate;
          v_country := coalesce(v_country, v_orig.tax_country);
          select vat_code into v_vatcode from public.vat_transactions where financial_transaction_id = v_orig.id;
        elsif v_orig.tax_type = 'platform_collected' then
          v_tax := 0; v_taxtype := 'platform_collected'; v_method := 'platform_collected';
          v_exempt := coalesce(v_exempt, v_orig.tax_exemption_reason);
          v_vatcode := 'PLATFORM_COLLECTED';
        else
          v_tax := 0; v_taxtype := 'unknown'; v_method := 'none';
          v_reasons := v_reasons || 'original transaction has unknown tax treatment'::text;
        end if;

        if v_cum > v_orig.gross_amount then
          v_reasons := v_reasons || format('cumulative refunds %s exceed original gross %s', v_cum, v_orig.gross_amount);
        end if;
      else
        v_reasons := v_reasons || 'original transaction not found'::text;
        if j_tx ->> 'tax_amount' is not null then
          v_tax := -abs((j_tx ->> 'tax_amount')::bigint);
          v_rate := (j_tx ->> 'tax_rate')::numeric;
          v_taxtype := 'vat'; v_method := 'provider_calculated'; v_vatcode := 'PROVIDER';
        else
          v_tax := 0; v_taxtype := 'unknown'; v_method := 'none';
        end if;
      end if;
    else
      -- sale / adjustment
      if v_taxtype = 'platform_collected' then
        v_tax := 0; v_method := 'platform_collected';
        v_exempt := coalesce(v_exempt, 'Tax collected and remitted by the platform (Apple/Google)');
        v_vatcode := 'PLATFORM_COLLECTED';
      elsif j_tx ->> 'tax_amount' is not null then
        v_tax := (j_tx ->> 'tax_amount')::bigint;
        v_rate := (j_tx ->> 'tax_rate')::numeric;
        v_taxtype := 'vat'; v_method := 'provider_calculated'; v_vatcode := 'PROVIDER';
        if v_ttype = 'sale' and (v_tax < 0 or v_tax > v_gross) then
          raise exception 'billing_apply_event: provider tax_amount % outside 0..gross %', v_tax, v_gross;
        end if;
      else
        select r.rate, r.vat_code into v_rate, v_vatcode
          from public.vat_rates r
         where r.jurisdiction = v_country
           and r.effective_from <= v_tday
           and (r.effective_until is null or r.effective_until >= v_tday)
         order by r.effective_from desc
         limit 1;
        if v_rate is null then
          v_tax := 0; v_taxtype := 'unknown'; v_method := 'none'; v_vatcode := 'UNKNOWN';
          if v_country is not null then
            v_reasons := v_reasons || format('no VAT rate configured for %s', v_country);
          end if;
        else
          v_tax := public.billing_vat_from_gross(v_gross, v_rate);
          v_taxtype := 'vat'; v_method := 'inclusive_from_gross';
        end if;
      end if;
    end if;

    if v_country is null and v_ttype <> 'fee' then
      v_reasons := v_reasons || 'customer country missing'::text;
    end if;
    if v_ttype in ('refund','reversal','credit_note') and v_taxtype = 'vat' and v_vatcode is null then
      v_vatcode := 'VAT';
    end if;
    if v_tprov in ('manual','promotional') then
      v_reasons := v_reasons || 'manual adjustment has no clearing account; post it manually'::text;
    end if;

    v_net := v_gross - v_tax;

    -- Bokföringsvaluta: allt eller inget. Tecknet följer posten.
    v_acc_amt := (j_tx ->> 'accounting_amount')::bigint;
    if v_acc_amt is not null and v_ttype in ('refund','reversal','credit_note','dispute','fee') then
      v_acc_amt := -abs(v_acc_amt);
    end if;
    v_acc_cur := nullif(j_tx ->> 'accounting_currency', '');
    v_fx_rate := (j_tx ->> 'fx_rate')::numeric;
    v_fx_src := nullif(j_tx ->> 'fx_rate_source', '');
    v_fx_ts := (j_tx ->> 'fx_timestamp')::timestamptz;

    insert into public.financial_transactions (
      user_id, subscription_id, product_id, billing_provider, provider_transaction_id, type,
      transaction_date, currency, gross_amount, net_amount, tax_amount, tax_rate, tax_country,
      tax_type, tax_calculation_method, tax_exemption_reason, customer_country, customer_country_source,
      country_evidence, refund_amount, original_transaction_id, invoice_id, invoice_number, invoice_url,
      accounting_currency, accounting_amount, fx_rate, fx_rate_source, fx_timestamp,
      needs_review, review_reason, environment)
    values (
      v_user.id,
      coalesce(v_sub_id, case when v_orig_found then v_orig.subscription_id end),
      coalesce(v_tx_prod, v_prod, case when v_orig_found then v_orig.product_id end),
      v_tprov, v_tid, v_ttype,
      v_tdate, v_cur, v_gross, v_net, v_tax, v_rate, v_country,
      v_taxtype, v_method, v_exempt, v_country, v_csrc,
      v_evidence,
      case when v_ttype in ('refund','reversal','credit_note') then abs(v_gross) else 0 end,
      case when v_orig_found then v_orig.id end,
      nullif(j_tx ->> 'invoice_id', ''), nullif(j_tx ->> 'invoice_number', ''), nullif(j_tx ->> 'invoice_url', ''),
      v_acc_cur, v_acc_amt, v_fx_rate, v_fx_src, v_fx_ts,
      coalesce(array_length(v_reasons, 1), 0) > 0,
      nullif(array_to_string(v_reasons, '; '), ''),
      v_env)
    on conflict (billing_provider, provider_transaction_id, type) do nothing
    returning id into v_tx_id;

    if v_tx_id is null then
      -- Redan bokförd: ingenting skrivs om.
      v_dup := true;
      select id into v_tx_id from public.financial_transactions
       where billing_provider = v_tprov and provider_transaction_id = v_tid and type = v_ttype;
    else
      if v_ttype in ('sale','refund','reversal','credit_note','adjustment') then
        if v_ttype in ('refund','reversal','credit_note') then
          v_refund_status := case
            when v_ttype = 'reversal' then 'reversal'
            when v_ttype = 'credit_note' then 'credit_note'
            when v_orig_found and v_cum >= v_orig.gross_amount then 'refunded'
            when v_orig_found then 'partially_refunded'
            else 'refunded' end;
        end if;
        insert into public.vat_transactions (
          financial_transaction_id, customer_id, transaction_date, type, tax_type, environment,
          customer_country, tax_jurisdiction, currency, gross_amount, net_amount, vat_amount,
          vat_rate, vat_code, provider, provider_transaction_id, invoice_id, refund_status)
        values (
          v_tx_id, v_user.id, v_tdate, v_ttype, v_taxtype, v_env,
          v_country, v_country, v_cur, v_gross, v_net, v_tax,
          v_rate, v_vatcode, v_tprov, v_tid, nullif(j_tx ->> 'invoice_id', ''), v_refund_status);
      end if;

      perform public.billing_post_ledger(v_tx_id);

      insert into public.audit_logs (actor, action, subject_type, subject_id, before, after)
      values (v_actor, 'financial_transaction.recorded', 'financial_transaction', v_tx_id::text, null,
              jsonb_build_object('type', v_ttype, 'provider', v_tprov, 'provider_transaction_id', v_tid,
                                 'currency', v_cur, 'gross', v_gross, 'tax', v_tax,
                                 'needs_review', coalesce(array_length(v_reasons, 1), 0) > 0));
    end if;
  end if;

  -- ── 6. Rättigheter ──
  v_changed := public.billing_recompute_entitlements(v_user.id);

  select coalesce(jsonb_object_agg(k.ent, exists (
           select 1 from public.user_entitlements ue
            where ue.user_id = v_user.id and ue.entitlement = k.ent and ue.status = 'active')), '{}'::jsonb)
    into v_ents
    from (select distinct unnest(entitlements) as ent from public.billing_products) k;

  return jsonb_build_object(
    'user_id', v_user.id,
    'subscription_id', v_sub_id,
    'transaction_id', v_tx_id,
    'duplicate_transaction', v_dup,
    'entitlements_changed', v_changed,
    'entitlements', v_ents);
end;
$$;

-- ── Utgång ──────────────────────────────────────────────────────────────────
-- Prenumerationer som är "vid liv" enligt status men förbi sitt effektiva slut → expired.
-- Returnerar clerk_user_id vars rättigheter ändrades, så cron kan projicera dem till Clerk.
create or replace function public.billing_sweep()
returns setof text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_outage interval := ((public.billing_config() ->> 'provider_outage_grace_hours')::int * interval '1 hour');
  v_user uuid;
  v_clerk text;
  r record;
begin
  perform set_config('billing.actor', 'cron:sweep', true);

  for r in
    select s.id, s.user_id, s.status
      from public.billing_subscriptions s
     where (s.status in ('trialing','active')
            and s.current_period_end is not null
            and now() >= s.current_period_end
                         + case when s.provider in ('stripe','apple','google') then v_outage else interval '0' end)
        or (s.status in ('past_due','grace')
            and (s.grace_until is null or now() >= s.grace_until))
     for update
  loop
    update public.billing_subscriptions set status = 'expired', updated_at = now() where id = r.id;
    insert into public.audit_logs (actor, action, subject_type, subject_id, before, after)
    values ('cron:sweep', 'subscription.status_changed', 'subscription', r.id::text,
            jsonb_build_object('status', r.status), jsonb_build_object('status', 'expired'));
  end loop;

  -- Räkna om alla användare med en rad som kan ha blivit inaktiv (inkl. de vi just löpt ut).
  -- ponytail: går igenom alla användare med aktiv rättighet varje körning. Räcker till tiotusentals;
  -- växer det, filtrera på valid_until < now().
  for v_user, v_clerk in
    select distinct u.id, u.clerk_user_id
      from public.billing_users u
      join public.user_entitlements ue on ue.user_id = u.id and ue.status = 'active'
  loop
    if public.billing_recompute_entitlements(v_user) then
      return next v_clerk;
    end if;
  end loop;
  return;
end;
$$;

-- ── Rapporter ───────────────────────────────────────────────────────────────

-- Underlag till revisorn, INTE en deklaration. Bara live + tax_type vat. Återbetalningar och
-- justeringar är signerade (negativa minskar), så total = summan. Aldrig summerat över valutor.
-- needs_review_count räknar poster som ännu inte har en granskningsrad.
create or replace function public.billing_oss_report(p_from timestamptz, p_to timestamptz)
returns table (
  country text,
  vat_rate numeric,
  currency text,
  sales_net bigint,
  sales_vat bigint,
  refunds_net bigint,
  refunds_vat bigint,
  adjustments_net bigint,
  adjustments_vat bigint,
  total_net bigint,
  total_vat_payable bigint,
  transaction_count bigint,
  needs_review_count bigint
)
language sql
stable
set search_path = public, pg_temp
as $$
  select
    v.customer_country,
    v.vat_rate,
    v.currency,
    coalesce(sum(v.net_amount) filter (where v.type = 'sale'), 0)::bigint,
    coalesce(sum(v.vat_amount) filter (where v.type = 'sale'), 0)::bigint,
    coalesce(sum(v.net_amount) filter (where v.type in ('refund','reversal','credit_note')), 0)::bigint,
    coalesce(sum(v.vat_amount) filter (where v.type in ('refund','reversal','credit_note')), 0)::bigint,
    coalesce(sum(v.net_amount) filter (where v.type = 'adjustment'), 0)::bigint,
    coalesce(sum(v.vat_amount) filter (where v.type = 'adjustment'), 0)::bigint,
    coalesce(sum(v.net_amount), 0)::bigint,
    coalesce(sum(v.vat_amount), 0)::bigint,
    count(*)::bigint,
    count(*) filter (where f.needs_review
                     and not exists (select 1 from public.financial_transaction_reviews rv
                                      where rv.financial_transaction_id = f.id))::bigint
  from public.vat_transactions v
  join public.financial_transactions f on f.id = v.financial_transaction_id
  where v.environment = 'live'
    and v.tax_type = 'vat'
    and v.transaction_date >= p_from
    and v.transaction_date < p_to
  group by v.customer_country, v.vat_rate, v.currency
  order by v.customer_country, v.vat_rate, v.currency;
$$;

-- Ögonblicksbild av en momsperiod per valuta. En period som är submitted/paid rörs aldrig:
-- en inlämnad deklaration får inte ändras av att vi kör rapporten igen.
create or replace function public.billing_refresh_vat_period(p_jurisdiction text, p_period_type text, p_start date)
returns setof public.vat_periods
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_end date;
  v_from timestamptz;
  v_to timestamptz;
begin
  if p_period_type not in ('monthly','quarterly','annual') then
    raise exception 'billing_refresh_vat_period: unknown period_type %', p_period_type;
  end if;
  if p_jurisdiction is null or p_jurisdiction !~ '^[A-Z]{2}$' then
    raise exception 'billing_refresh_vat_period: jurisdiction must be upper-case ISO-2';
  end if;

  v_end := (p_start + case p_period_type
                        when 'monthly' then interval '1 month'
                        when 'quarterly' then interval '3 months'
                        else interval '1 year' end)::date - 1;
  v_from := p_start::timestamp at time zone 'Europe/Stockholm';
  v_to := (v_end + 1)::timestamp at time zone 'Europe/Stockholm';

  insert into public.vat_periods as vp
    (jurisdiction, period_type, period_start, period_end, status, gross_sales, net_sales,
     vat_collected, vat_refunded, vat_payable, currency, report_generated_at)
  select p_jurisdiction, p_period_type, p_start, v_end, 'report_generated',
         coalesce(sum(v.gross_amount) filter (where v.type = 'sale'), 0),
         coalesce(sum(v.net_amount) filter (where v.type = 'sale'), 0),
         coalesce(sum(v.vat_amount) filter (where v.type = 'sale'), 0),
         coalesce(-sum(v.vat_amount) filter (where v.type in ('refund','reversal','credit_note')), 0),
         coalesce(sum(v.vat_amount), 0),
         v.currency, now()
    from public.vat_transactions v
   where v.environment = 'live'
     and v.tax_type = 'vat'
     and v.tax_jurisdiction = p_jurisdiction
     and v.transaction_date >= v_from
     and v.transaction_date < v_to
   group by v.currency
  on conflict (jurisdiction, period_type, period_start, currency) do update
    set period_end = excluded.period_end,
        status = 'report_generated',
        gross_sales = excluded.gross_sales,
        net_sales = excluded.net_sales,
        vat_collected = excluded.vat_collected,
        vat_refunded = excluded.vat_refunded,
        vat_payable = excluded.vat_payable,
        report_generated_at = now(),
        updated_at = now()
    where vp.status not in ('submitted','paid');

  insert into public.audit_logs (actor, action, subject_type, subject_id, after)
  values (coalesce(nullif(current_setting('billing.actor', true), ''), 'system:vat-period'),
          'vat_period.refreshed', 'vat_period', p_jurisdiction || ':' || p_period_type || ':' || p_start::text,
          jsonb_build_object('period_end', v_end));

  return query
    select * from public.vat_periods
     where jurisdiction = p_jurisdiction and period_type = p_period_type and period_start = p_start
     order by currency;
end;
$$;

-- Instrumentpanelen. Pengar per valuta (SEK och EUR läggs aldrig ihop), bara live.
-- Nycklarna är ärliga: MRR är BRUTTO (priset inkluderar moms) och momsen är en uppskattning.
create or replace function public.billing_dashboard()
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Europe/Stockholm')::date;
  v_q_start timestamptz := date_trunc('quarter', now() at time zone 'Europe/Stockholm') at time zone 'Europe/Stockholm';
  v_q_end timestamptz := (date_trunc('quarter', now() at time zone 'Europe/Stockholm') + interval '3 months') at time zone 'Europe/Stockholm';
  v_money jsonb;
  v_by_provider jsonb;
  v_mrr jsonb;
  v_arr jsonb;
  v_arpu jsonb;
  v_active jsonb;
  v_churned int;
  v_active_n int;
  v_quarter jsonb;
  v_eu jsonb;
  v_filing jsonb;
  v_payment jsonb;
  v_review int;
begin
  select coalesce(jsonb_object_agg(m.currency, to_jsonb(m) - 'currency'), '{}'::jsonb) into v_money
    from (
      select currency,
             coalesce(sum(gross_amount) filter (where type = 'sale'), 0) as gross_sales,
             coalesce(sum(net_amount) filter (where type = 'sale'), 0) as net_sales,
             coalesce(sum(tax_amount) filter (where type = 'sale'), 0) as vat_on_sales,
             coalesce(-sum(gross_amount) filter (where type in ('refund','reversal','credit_note')), 0) as refunds_gross,
             coalesce(-sum(gross_amount) filter (where type = 'fee'), 0) as payment_fees,
             coalesce(sum(tax_amount) filter (where tax_type = 'vat'), 0) as estimated_vat_payable
        from public.financial_transactions
       where environment = 'live'
       group by currency) m;

  select coalesce(jsonb_object_agg(b.billing_provider, b.cur), '{}'::jsonb) into v_by_provider
    from (
      select billing_provider,
             jsonb_object_agg(currency, jsonb_build_object('gross_sales', g, 'net_sales', n)) as cur
        from (
          select billing_provider, currency,
                 coalesce(sum(gross_amount) filter (where type = 'sale'), 0) as g,
                 coalesce(sum(net_amount) filter (where type = 'sale'), 0) as n
            from public.financial_transactions
           where environment = 'live'
           group by billing_provider, currency) a
       group by billing_provider) b;

  with m as (
    select price_currency as c,
           sum(case price_interval
                 when 'month' then price_amount
                 when 'year' then round(price_amount / 12.0)
                 when 'week' then round(price_amount * 52 / 12.0)
               end)::bigint as mrr,
           count(*) as n
      from public.billing_subscriptions
     where environment = 'live'
       and provider in ('stripe','apple','google')
       and status in ('active','past_due')
       and price_amount is not null and price_currency is not null and price_interval is not null
     group by price_currency)
  select coalesce(jsonb_object_agg(c, mrr), '{}'::jsonb),
         coalesce(jsonb_object_agg(c, mrr * 12), '{}'::jsonb),
         coalesce(jsonb_object_agg(c, round(mrr::numeric / n)), '{}'::jsonb)
    into v_mrr, v_arr, v_arpu
    from m;

  select coalesce(jsonb_object_agg(provider, n), '{}'::jsonb), coalesce(sum(n), 0)::int
    into v_active, v_active_n
    from (select provider, count(*) as n
            from public.billing_subscriptions
           where environment = 'live' and status in ('trialing','active','past_due','grace')
             and provider in ('stripe','apple','google')
           group by provider) a;

  select count(*)::int into v_churned
    from public.billing_subscriptions
   where environment = 'live'
     and provider in ('stripe','apple','google')
     and status in ('canceled','expired','revoked')
     and updated_at >= now() - interval '30 days';

  select coalesce(jsonb_object_agg(q.currency, to_jsonb(q) - 'currency'), '{}'::jsonb) into v_quarter
    from (
      select currency,
             coalesce(sum(vat_amount) filter (where type = 'sale'), 0) as vat_collected,
             coalesce(-sum(vat_amount) filter (where type in ('refund','reversal','credit_note')), 0) as vat_refunded,
             coalesce(sum(vat_amount), 0) as estimated_vat_payable
        from public.vat_transactions
       where environment = 'live' and tax_type = 'vat'
         and transaction_date >= v_q_start and transaction_date < v_q_end
       group by currency) q;

  select coalesce(jsonb_object_agg(e.customer_country, e.cur), '{}'::jsonb) into v_eu
    from (
      select customer_country,
             jsonb_object_agg(currency, jsonb_build_object('net', n, 'vat', v)) as cur
        from (
          select customer_country, currency, sum(net_amount) as n, sum(vat_amount) as v
            from public.vat_transactions
           where environment = 'live' and tax_type = 'vat' and customer_country is not null
             and transaction_date >= v_q_start and transaction_date < v_q_end
           group by customer_country, currency) a
       group by customer_country) e;

  select to_jsonb(d) into v_filing
    from (select jurisdiction, scheme, period, filing_deadline, confirmed
            from public.tax_filing_deadlines
           where status = 'upcoming' and filing_deadline is not null and filing_deadline >= v_today
           order by filing_deadline limit 1) d;
  select to_jsonb(d) into v_payment
    from (select jurisdiction, scheme, period, payment_deadline, confirmed
            from public.tax_filing_deadlines
           where status = 'upcoming' and payment_deadline is not null and payment_deadline >= v_today
           order by payment_deadline limit 1) d;

  select count(*)::int into v_review
    from public.financial_transactions f
   where f.environment = 'live' and f.needs_review
     and not exists (select 1 from public.financial_transaction_reviews rv where rv.financial_transaction_id = f.id);

  return jsonb_build_object(
    'generated_at', now(),
    'notice', 'System estimates, not an official tax position. VAT figures need adviser/accountant confirmation.',
    'money_by_currency', v_money,
    'by_provider', v_by_provider,
    'mrr_gross_by_currency', v_mrr,
    'arr_gross_by_currency', v_arr,
    'arpu_gross_by_currency', v_arpu,
    'active_subscriptions', v_active_n,
    'active_subscriptions_by_provider', v_active,
    'canceled_or_expired_last_30d', v_churned,
    'churn_30d_rate', case when v_active_n + v_churned > 0
                           then round(v_churned::numeric / (v_active_n + v_churned), 4) end,
    'current_quarter', jsonb_build_object(
      'start', v_q_start, 'end', v_q_end,
      'vat_by_currency', v_quarter,
      'eu_sales_by_country', v_eu),
    'next_vat_filing', v_filing,
    'next_vat_payment', v_payment,
    'needs_review_count', v_review);
end;
$$;

-- ── Rättigheter ─────────────────────────────────────────────────────────────
-- Tabeller: RLS på, inga policys, bara service_role.
do $$
declare
  t text;
begin
  foreach t in array array[
    'billing_users','billing_customers','billing_products','billing_subscriptions','user_entitlements',
    'webhook_events','financial_transactions','vat_transactions','ledger_accounts','ledger_entries',
    'financial_transaction_reviews','vat_rates','tax_configuration','vat_periods','tax_filing_deadlines',
    'payment_routing_rules','audit_logs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated, public', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end
$$;

-- Funktioner: explicit revoke från anon/authenticated (default privileges återger dem annars).
revoke all on function public.billing_forbid_mutation() from public, anon, authenticated;
revoke all on function public.billing_config() from public, anon, authenticated;
revoke all on function public.billing_country_rank(text) from public, anon, authenticated;
revoke all on function public.billing_vat_from_gross(bigint, numeric) from public, anon, authenticated;
revoke all on function public.billing_entitlement_rows(uuid) from public, anon, authenticated;
revoke all on function public.billing_recompute_entitlements(uuid) from public, anon, authenticated;
revoke all on function public.billing_claim_webhook(text, text, text, text) from public, anon, authenticated;
revoke all on function public.billing_finish_webhook(text, text, text, text) from public, anon, authenticated;
revoke all on function public.billing_post_ledger(uuid) from public, anon, authenticated;
revoke all on function public.billing_apply_event(jsonb) from public, anon, authenticated;
revoke all on function public.billing_sweep() from public, anon, authenticated;
revoke all on function public.billing_oss_report(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.billing_refresh_vat_period(text, text, date) from public, anon, authenticated;
revoke all on function public.billing_dashboard() from public, anon, authenticated;

grant execute on function public.billing_forbid_mutation() to service_role;
grant execute on function public.billing_config() to service_role;
grant execute on function public.billing_country_rank(text) to service_role;
grant execute on function public.billing_vat_from_gross(bigint, numeric) to service_role;
grant execute on function public.billing_entitlement_rows(uuid) to service_role;
grant execute on function public.billing_recompute_entitlements(uuid) to service_role;
grant execute on function public.billing_claim_webhook(text, text, text, text) to service_role;
grant execute on function public.billing_finish_webhook(text, text, text, text) to service_role;
grant execute on function public.billing_post_ledger(uuid) to service_role;
grant execute on function public.billing_apply_event(jsonb) to service_role;
grant execute on function public.billing_sweep() to service_role;
grant execute on function public.billing_oss_report(timestamptz, timestamptz) to service_role;
grant execute on function public.billing_refresh_vat_period(text, text, date) to service_role;
grant execute on function public.billing_dashboard() to service_role;
