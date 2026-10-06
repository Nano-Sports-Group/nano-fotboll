-- Billing: scenarierna ur uppdraget §21 + oföränderlighet, moms, rapporter, rättigheter.
-- Körs som `begin; <filen>; rollback;` — inga psql-metakommandon, bara SQL.
-- Alla rader är environment='test' (utom 29/31 som bevisar att rapporterna bara läser live;
-- de ligger år 2031 så riktiga rader aldrig blandas in). Varje block skapar sina egna rader.

-- ── Hjälpfunktioner (försvinner med sessionen) ──────────────────────────────
create or replace function pg_temp.t_sub(
  p_provider text, p_id text, p_status text,
  p_time timestamptz default now(),
  p_end timestamptz default now() + interval '30 days',
  p_extra jsonb default '{}'::jsonb)
returns jsonb language sql as $$
  select jsonb_build_object(
    'provider', p_provider, 'provider_customer_id', 'cus_' || p_id, 'provider_subscription_id', p_id,
    'product_id', 'nano_fotboll_pro', 'plan_id', 'nano_fotboll_pro_month', 'status', p_status,
    'current_period_start', p_end - interval '30 days', 'current_period_end', p_end,
    'event_time', p_time, 'price_amount', 5900, 'price_currency', 'SEK', 'price_interval', 'month') || p_extra
$$;

create or replace function pg_temp.t_tx(
  p_type text, p_provider text, p_id text, p_gross bigint,
  p_country text default 'SE',
  p_extra jsonb default '{}'::jsonb)
returns jsonb language sql as $$
  select jsonb_build_object(
    'type', p_type, 'provider', p_provider, 'provider_transaction_id', p_id,
    'transaction_date', now(), 'currency', 'SEK', 'gross_amount', p_gross,
    'customer_country', p_country, 'customer_country_source', 'billing_address',
    'product_id', 'nano_fotboll_pro', 'invoice_id', 'inv_' || p_id) || p_extra
$$;

create or replace function pg_temp.t_ev(
  p_user text, p_sub jsonb, p_tx jsonb,
  p_country text default 'SE', p_env text default 'test', p_actor text default 'test:billing')
returns jsonb language sql as $$
  select jsonb_build_object(
    'environment', p_env, 'actor', p_actor,
    'user', jsonb_build_object('clerk_user_id', p_user, 'country', p_country,
                               'country_source', case when p_country is null then null else 'billing_address' end),
    'subscription', p_sub, 'transaction', p_tx)
$$;

create or replace function pg_temp.t_has(p_clerk text, p_ent text)
returns boolean language sql as $$
  select exists (select 1 from public.user_entitlements ue
                   join public.billing_users u on u.id = ue.user_id
                  where u.clerk_user_id = p_clerk and ue.entitlement = p_ent and ue.status = 'active')
$$;

-- 01. Ny Stripe-prenumeration
do $$
declare r jsonb; v_user uuid; n int; v_ft public.financial_transactions%rowtype; d bigint; c bigint;
begin
  r := public.billing_apply_event(pg_temp.t_ev('user_billingtest_01',
         pg_temp.t_sub('stripe', 'sub_t01', 'active'),
         pg_temp.t_tx('sale', 'stripe', 'in_t01', 5900)));
  v_user := (r ->> 'user_id')::uuid;
  select count(*) into n from public.billing_subscriptions where user_id = v_user;
  assert n = 1, '01: expected one subscription';
  select * into v_ft from public.financial_transactions where user_id = v_user and type = 'sale';
  assert v_ft.gross_amount = 5900 and v_ft.net_amount = 4720 and v_ft.tax_amount = 1180, '01: amounts';
  select count(*) into n from public.vat_transactions where customer_id = v_user;
  assert n = 1, '01: expected one vat row';
  select sum(debit), sum(credit), count(*) into d, c, n from public.ledger_entries where financial_transaction_id = v_ft.id;
  assert d = c and d = 5900 and n = 3, '01: ledger must balance with 3 lines';
  assert (r -> 'entitlements' ->> 'football_pro')::boolean, '01: football_pro';
  assert (r -> 'entitlements' ->> 'maps_pro')::boolean, '01: maps_pro';
  assert not (r -> 'entitlements' ->> 'tv_plus')::boolean, '01: tv_plus must be false';
  assert (select count(*) from jsonb_object_keys(r -> 'entitlements')) = 7, '01: all 7 entitlement keys present';
  assert (r ->> 'entitlements_changed')::boolean, '01: entitlements_changed';
  raise notice 'ok 01 new stripe subscription';
end $$;

-- 02. Befintlig prenumeration förnyas (ny faktura)
do $$
declare r jsonb; v_user uuid; n int;
begin
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_02',
    pg_temp.t_sub('stripe', 'sub_t02', 'active', now() - interval '31 days'),
    pg_temp.t_tx('sale', 'stripe', 'in_t02a', 5900)));
  r := public.billing_apply_event(pg_temp.t_ev('user_billingtest_02',
    pg_temp.t_sub('stripe', 'sub_t02', 'active', now()),
    pg_temp.t_tx('sale', 'stripe', 'in_t02b', 5900)));
  v_user := (r ->> 'user_id')::uuid;
  select count(*) into n from public.billing_subscriptions where user_id = v_user;
  assert n = 1, '02: still one subscription';
  select count(*) into n from public.financial_transactions where user_id = v_user and type = 'sale';
  assert n = 2, '02: two sales';
  assert not (r ->> 'entitlements_changed')::boolean, '02: no entitlement change on renewal';
  raise notice 'ok 02 existing subscription renewal';
end $$;

-- 03. Stripe-uppsägning
do $$
declare r jsonb; v_user uuid;
begin
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_03',
    pg_temp.t_sub('stripe', 'sub_t03', 'active', now() - interval '2 hours'),
    pg_temp.t_tx('sale', 'stripe', 'in_t03', 5900)));
  assert pg_temp.t_has('user_billingtest_03', 'football_pro'), '03: precondition';
  r := public.billing_apply_event(pg_temp.t_ev('user_billingtest_03',
    pg_temp.t_sub('stripe', 'sub_t03', 'canceled', now()), null));
  assert not pg_temp.t_has('user_billingtest_03', 'football_pro'), '03: entitlement must be gone';
  assert not (r -> 'entitlements' ->> 'football_pro')::boolean, '03: response false';
  assert (select status from public.user_entitlements where user_id = (r ->> 'user_id')::uuid and entitlement = 'football_pro') = 'revoked',
    '03: row marked revoked, not deleted';
  assert (select projection_dirty_at is not null from public.billing_users where clerk_user_id = 'user_billingtest_03'), '03: dirty';
  raise notice 'ok 03 stripe cancellation';
end $$;

-- 04. Misslyckad betalning: past_due + frist, rättighet kvar
do $$
declare r jsonb; v_t timestamptz := now(); g timestamptz;
begin
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_04',
    pg_temp.t_sub('stripe', 'sub_t04', 'active', v_t - interval '2 hours'),
    pg_temp.t_tx('sale', 'stripe', 'in_t04a', 5900)));
  r := public.billing_apply_event(pg_temp.t_ev('user_billingtest_04',
    pg_temp.t_sub('stripe', 'sub_t04', 'past_due', v_t), null));
  select grace_until into g from public.billing_subscriptions where provider_subscription_id = 'sub_t04';
  assert (select status from public.billing_subscriptions where provider_subscription_id = 'sub_t04') = 'past_due', '04: status';
  assert g is not null, '04: grace_until set';
  assert g = v_t + interval '3 days', '04: grace = event_time + 3 days, got ' || g::text;
  assert pg_temp.t_has('user_billingtest_04', 'football_pro'), '04: entitlement kept during grace';
  -- ett omförsök förlänger inte fristen
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_04',
    pg_temp.t_sub('stripe', 'sub_t04', 'past_due', v_t + interval '1 day'), null));
  assert (select grace_until from public.billing_subscriptions where provider_subscription_id = 'sub_t04') = g, '04: grace not extended';
  raise notice 'ok 04 failed payment';
end $$;

-- 05. Stripe-återbetalning: negativt, samma moms, originalet orört
do $$
declare r jsonb; v_user uuid; o public.financial_transactions%rowtype; f public.financial_transactions%rowtype;
        d bigint; c bigint;
begin
  r := public.billing_apply_event(pg_temp.t_ev('user_billingtest_05',
    pg_temp.t_sub('stripe', 'sub_t05', 'active'),
    pg_temp.t_tx('sale', 'stripe', 'in_t05', 5900)));
  v_user := (r ->> 'user_id')::uuid;
  r := public.billing_apply_event(pg_temp.t_ev('user_billingtest_05', null,
    pg_temp.t_tx('refund', 'stripe', 're_t05', 5900, 'SE',
                 jsonb_build_object('original_provider_transaction_id', 'in_t05'))));
  select * into o from public.financial_transactions where provider_transaction_id = 'in_t05' and type = 'sale';
  select * into f from public.financial_transactions where provider_transaction_id = 're_t05' and type = 'refund';
  assert f.gross_amount = -5900 and f.tax_amount = -1180 and f.net_amount = -4720, '05: refund amounts';
  assert f.refund_amount = 5900, '05: refund_amount absolute';
  assert f.original_transaction_id = o.id, '05: original linked';
  assert o.gross_amount = 5900 and o.tax_amount = 1180 and o.net_amount = 4720, '05: original untouched';
  assert not f.needs_review, '05: not flagged';
  assert (select count(*) from public.vat_transactions where financial_transaction_id = f.id and vat_amount = -1180 and refund_status = 'refunded') = 1,
    '05: refund vat row';
  select sum(debit), sum(credit) into d, c from public.ledger_entries where financial_transaction_id = f.id;
  assert d = c and d = 5900, '05: refund ledger balances';
  raise notice 'ok 05 stripe refund';
end $$;

-- 06. Dubblett-webhook och dubblett-transaktion
do $$
declare a text; b text; c text; r1 jsonb; r2 jsonb; ev jsonb; n int;
begin
  a := public.billing_claim_webhook('stripe', 'evt_t06', 'invoice.paid', 'hash1');
  assert a = 'process', '06: first claim -> process, got ' || a;
  perform public.billing_finish_webhook('stripe', 'evt_t06', 'processed', null);
  b := public.billing_claim_webhook('stripe', 'evt_t06', 'invoice.paid', 'hash1');
  assert b = 'done', '06: replay -> done, got ' || b;

  ev := pg_temp.t_ev('user_billingtest_06', pg_temp.t_sub('stripe', 'sub_t06', 'active'),
                     pg_temp.t_tx('sale', 'stripe', 'in_t06', 5900));
  r1 := public.billing_apply_event(ev);
  r2 := public.billing_apply_event(ev);
  assert not (r1 ->> 'duplicate_transaction')::boolean, '06: first not duplicate';
  assert (r2 ->> 'duplicate_transaction')::boolean, '06: second is duplicate';
  assert r1 ->> 'transaction_id' = r2 ->> 'transaction_id', '06: same transaction id returned';
  select count(*) into n from public.financial_transactions where provider_transaction_id = 'in_t06';
  assert n = 1, '06: one row';
  select count(*) into n from public.ledger_entries where financial_transaction_id = (r1 ->> 'transaction_id')::uuid;
  assert n = 3, '06: ledger not doubled';
  raise notice 'ok 06 duplicate webhook / transaction';
end $$;

-- 07. Apple-köp (plattformen redovisar moms)
do $$
declare r jsonb; f public.financial_transactions%rowtype; d bigint; c bigint;
begin
  r := public.billing_apply_event(pg_temp.t_ev('user_billingtest_07',
    pg_temp.t_sub('apple', 'apple_otx_t07', 'active'),
    pg_temp.t_tx('sale', 'apple', 'apple_tx_t07', 5900, 'SE',
                 jsonb_build_object('tax_type', 'platform_collected', 'customer_country_source', 'apple_storefront'))));
  select * into f from public.financial_transactions where provider_transaction_id = 'apple_tx_t07';
  assert f.tax_amount = 0 and f.net_amount = 5900 and f.tax_type = 'platform_collected', '07: platform collected';
  assert f.tax_exemption_reason is not null, '07: reason set';
  assert f.billing_provider = 'apple', '07: provider apple';
  assert not f.needs_review, '07: not flagged';
  assert (select count(*) from public.vat_transactions where financial_transaction_id = f.id) = 1, '07: vat row exists (zero tax)';
  select sum(debit), sum(credit) into d, c from public.ledger_entries where financial_transaction_id = f.id;
  assert d = c and d = 5900, '07: ledger balances';
  assert (select count(*) from public.ledger_entries l join public.ledger_accounts a on a.code = l.account_code and a.legal_entity = l.legal_entity
           where l.financial_transaction_id = f.id and a.role = 'clearing_apple') = 1, '07: apple clearing account used';
  assert pg_temp.t_has('user_billingtest_07', 'football_pro'), '07: entitlement';
  raise notice 'ok 07 apple purchase';
end $$;

-- 08. Apple-förnyelse
do $$
declare n int; m int;
begin
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_08',
    pg_temp.t_sub('apple', 'apple_otx_t08', 'active', now() - interval '31 days'),
    pg_temp.t_tx('sale', 'apple', 'apple_tx_t08a', 5900, 'SE', jsonb_build_object('tax_type', 'platform_collected'))));
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_08',
    pg_temp.t_sub('apple', 'apple_otx_t08', 'active', now()),
    pg_temp.t_tx('sale', 'apple', 'apple_tx_t08b', 5900, 'SE', jsonb_build_object('tax_type', 'platform_collected'))));
  select count(*) into n from public.billing_subscriptions where provider_subscription_id = 'apple_otx_t08';
  select count(*) into m from public.financial_transactions where provider_transaction_id like 'apple_tx_t08%';
  assert n = 1 and m = 2, '08: one subscription, two sales';
  raise notice 'ok 08 apple renewal';
end $$;

-- 09. Apple-uppsägning/utgång
do $$
begin
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_09',
    pg_temp.t_sub('apple', 'apple_otx_t09', 'active', now() - interval '1 hour'),
    pg_temp.t_tx('sale', 'apple', 'apple_tx_t09', 5900, 'SE', jsonb_build_object('tax_type', 'platform_collected'))));
  assert pg_temp.t_has('user_billingtest_09', 'football_pro'), '09: precondition';
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_09',
    pg_temp.t_sub('apple', 'apple_otx_t09', 'expired', now()), null));
  assert not pg_temp.t_has('user_billingtest_09', 'football_pro'), '09: entitlement gone';
  raise notice 'ok 09 apple cancellation';
end $$;

-- 10. Google-köp
do $$
declare r jsonb; f public.financial_transactions%rowtype;
begin
  r := public.billing_apply_event(pg_temp.t_ev('user_billingtest_10',
    pg_temp.t_sub('google', 'gtoken_t10', 'active'),
    pg_temp.t_tx('sale', 'google', 'GPA.t10', 5900, 'SE',
                 jsonb_build_object('tax_type', 'platform_collected', 'customer_country_source', 'google_play_country'))));
  select * into f from public.financial_transactions where provider_transaction_id = 'GPA.t10';
  assert f.tax_amount = 0 and f.tax_type = 'platform_collected' and f.tax_exemption_reason is not null, '10: platform collected';
  assert (select count(*) from public.ledger_entries l join public.ledger_accounts a on a.code = l.account_code and a.legal_entity = l.legal_entity
           where l.financial_transaction_id = f.id and a.role = 'clearing_google') = 1, '10: google clearing account';
  assert pg_temp.t_has('user_billingtest_10', 'football_pro'), '10: entitlement';
  assert (select source from public.user_entitlements where subscription_id = (r ->> 'subscription_id')::uuid and entitlement = 'football_pro') = 'google',
    '10: source mirrors provider';
  raise notice 'ok 10 google purchase';
end $$;

-- 11. Google-förnyelse
do $$
declare n int; m int;
begin
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_11',
    pg_temp.t_sub('google', 'gtoken_t11', 'active', now() - interval '31 days'),
    pg_temp.t_tx('sale', 'google', 'GPA.t11a', 5900, 'SE', jsonb_build_object('tax_type', 'platform_collected'))));
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_11',
    pg_temp.t_sub('google', 'gtoken_t11', 'active', now()),
    pg_temp.t_tx('sale', 'google', 'GPA.t11b', 5900, 'SE', jsonb_build_object('tax_type', 'platform_collected'))));
  select count(*) into n from public.billing_subscriptions where provider_subscription_id = 'gtoken_t11';
  select count(*) into m from public.financial_transactions where provider_transaction_id like 'GPA.t11%';
  assert n = 1 and m = 2, '11: one subscription, two sales';
  raise notice 'ok 11 google renewal';
end $$;

-- 12. Google-uppsägning
do $$
begin
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_12',
    pg_temp.t_sub('google', 'gtoken_t12', 'active', now() - interval '1 hour'),
    pg_temp.t_tx('sale', 'google', 'GPA.t12', 5900, 'SE', jsonb_build_object('tax_type', 'platform_collected'))));
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_12',
    pg_temp.t_sub('google', 'gtoken_t12', 'canceled', now()), null));
  assert not pg_temp.t_has('user_billingtest_12', 'football_pro'), '12: entitlement gone';
  raise notice 'ok 12 google cancellation';
end $$;

-- 13. Dubblett Apple-transaktion
do $$
declare ev jsonb; n int;
begin
  ev := pg_temp.t_ev('user_billingtest_13', pg_temp.t_sub('apple', 'apple_otx_t13', 'active'),
         pg_temp.t_tx('sale', 'apple', 'apple_tx_t13', 5900, 'SE', jsonb_build_object('tax_type', 'platform_collected')));
  perform public.billing_apply_event(ev);
  assert (public.billing_apply_event(ev) ->> 'duplicate_transaction')::boolean, '13: duplicate flagged';
  select count(*) into n from public.financial_transactions where provider_transaction_id = 'apple_tx_t13';
  assert n = 1, '13: one row';
  raise notice 'ok 13 duplicate apple transaction';
end $$;

-- 14. Dubblett Google purchase token = en prenumeration
do $$
declare n int; m int;
begin
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_14',
    pg_temp.t_sub('google', 'gtoken_t14', 'active', now() - interval '1 hour'),
    pg_temp.t_tx('sale', 'google', 'GPA.t14a', 5900, 'SE', jsonb_build_object('tax_type', 'platform_collected'))));
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_14',
    pg_temp.t_sub('google', 'gtoken_t14', 'active', now()),
    pg_temp.t_tx('sale', 'google', 'GPA.t14b', 5900, 'SE', jsonb_build_object('tax_type', 'platform_collected'))));
  select count(*) into n from public.billing_subscriptions where provider = 'google' and provider_subscription_id = 'gtoken_t14';
  assert n = 1, '14: one subscription for one purchase token';
  select count(*) into m from public.user_entitlements ue join public.billing_users u on u.id = ue.user_id
   where u.clerk_user_id = 'user_billingtest_14' and ue.entitlement = 'football_pro';
  assert m = 1, '14: one entitlement row';
  -- samma token från en ANNAN användare nekas
  begin
    perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_14b',
      pg_temp.t_sub('google', 'gtoken_t14', 'active'), null));
    raise exception '14: token reuse by another user must fail';
  exception when raise_exception then
    assert sqlerrm like '%belongs to another user%', '14: wrong error: ' || sqlerrm;
  end;
  raise notice 'ok 14 duplicate google purchase token';
end $$;

-- 15. Svensk moms 25 %
do $$
declare f public.financial_transactions%rowtype;
begin
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_15',
    pg_temp.t_sub('stripe', 'sub_t15', 'active'), pg_temp.t_tx('sale', 'stripe', 'in_t15', 5900, 'SE')));
  select * into f from public.financial_transactions where provider_transaction_id = 'in_t15';
  assert f.tax_rate = 0.25 and f.tax_amount = 1180 and f.net_amount = 4720, '15: SE 25 %';
  assert f.tax_type = 'vat' and f.tax_calculation_method = 'inclusive_from_gross' and f.tax_country = 'SE', '15: method/country';
  assert not f.needs_review, '15: not flagged';
  assert (select vat_code from public.vat_transactions where financial_transaction_id = f.id) = 'SE-STD', '15: vat code';
  raise notice 'ok 15 swedish vat';
end $$;

-- 16. Tysk moms 19 %
do $$
declare f public.financial_transactions%rowtype;
begin
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_16',
    pg_temp.t_sub('stripe', 'sub_t16', 'active'), pg_temp.t_tx('sale', 'stripe', 'in_t16', 5900, 'DE'), 'DE'));
  select * into f from public.financial_transactions where provider_transaction_id = 'in_t16';
  assert f.tax_rate = 0.19 and f.tax_amount = 942 and f.net_amount = 4958, '16: DE 19 % -> 942/4958, got ' || f.tax_amount;
  assert f.tax_country = 'DE', '16: tax country';
  raise notice 'ok 16 german vat';
end $$;

-- 17. Momsinklusivt pris
do $$
begin
  assert public.billing_vat_from_gross(5900, 0.25) = 1180, '17: 5900 @ 25 % = 1180';
  assert public.billing_vat_from_gross(5900, 0.25) <> 1475, '17: NOT gross * rate (1475)';
  assert 5900 - public.billing_vat_from_gross(5900, 0.25) = 4720, '17: net 4720';
  assert public.billing_vat_from_gross(-5900, 0.25) = -1180, '17: negative symmetrical';
  raise notice 'ok 17 vat-inclusive pricing';
end $$;

-- 18. Delåterbetalning reverserar moms proportionellt
do $$
declare r jsonb; f1 public.financial_transactions%rowtype; f2 public.financial_transactions%rowtype; f3 public.financial_transactions%rowtype;
begin
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_18',
    pg_temp.t_sub('stripe', 'sub_t18', 'active'), pg_temp.t_tx('sale', 'stripe', 'in_t18', 5900)));
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_18', null,
    pg_temp.t_tx('refund', 'stripe', 're_t18a', 2950, 'SE', jsonb_build_object('original_provider_transaction_id', 'in_t18'))));
  select * into f1 from public.financial_transactions where provider_transaction_id = 're_t18a';
  assert f1.gross_amount = -2950 and f1.tax_amount = -590 and f1.net_amount = -2360, '18: half refund -> -2950/-590/-2360';
  assert (select refund_status from public.vat_transactions where financial_transaction_id = f1.id) = 'partially_refunded', '18: partially_refunded';
  assert not f1.needs_review, '18: first partial ok';

  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_18', null,
    pg_temp.t_tx('refund', 'stripe', 're_t18b', 2950, 'SE', jsonb_build_object('original_provider_transaction_id', 'in_t18'))));
  select * into f2 from public.financial_transactions where provider_transaction_id = 're_t18b';
  assert f2.tax_amount = -590, '18: second half takes the rest';
  assert (select refund_status from public.vat_transactions where financial_transaction_id = f2.id) = 'refunded', '18: now fully refunded';
  assert (select sum(tax_amount) from public.financial_transactions where original_transaction_id = f1.original_transaction_id) = -1180,
    '18: total refunded VAT equals original VAT';

  -- mer än originalet återbetalas: bokförs men flaggas
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_18', null,
    pg_temp.t_tx('refund', 'stripe', 're_t18c', 100, 'SE', jsonb_build_object('original_provider_transaction_id', 'in_t18'))));
  select * into f3 from public.financial_transactions where provider_transaction_id = 're_t18c';
  assert f3.needs_review and f3.review_reason like '%exceed%', '18: over-refund flagged, got ' || coalesce(f3.review_reason, 'null');
  raise notice 'ok 18 partial refund reverses vat proportionally';
end $$;

-- 19. Valutaomräkning: kurs, källa och tid följer med
do $$
declare r jsonb; f public.financial_transactions%rowtype; v_user uuid;
begin
  r := public.billing_apply_event(pg_temp.t_ev('user_billingtest_19',
    pg_temp.t_sub('stripe', 'sub_t19', 'active'),
    pg_temp.t_tx('sale', 'stripe', 'in_t19', 5900, 'SE',
      jsonb_build_object('accounting_currency', 'AED', 'accounting_amount', 2000, 'fx_rate', 0.3390,
                         'fx_rate_source', 'stripe_balance_transaction', 'fx_timestamp', now()))));
  v_user := (r ->> 'user_id')::uuid;
  select * into f from public.financial_transactions where provider_transaction_id = 'in_t19';
  assert f.accounting_currency = 'AED' and f.accounting_amount = 2000 and f.fx_rate = 0.339
         and f.fx_rate_source = 'stripe_balance_transaction' and f.fx_timestamp is not null, '19: fx stored';

  -- direkt insert utan kurs nekas av CHECK
  begin
    insert into public.financial_transactions
      (user_id, billing_provider, provider_transaction_id, type, currency, gross_amount, net_amount, tax_amount,
       tax_type, tax_calculation_method, accounting_currency, accounting_amount, environment)
    values (v_user, 'stripe', 'in_t19_nofx', 'sale', 'SEK', 5900, 4720, 1180, 'vat', 'inclusive_from_gross', 'AED', 2000, 'test');
    raise exception '19: insert without fx_rate must fail';
  exception when check_violation then null;
  end;

  -- och via funktionen
  begin
    perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_19', null,
      pg_temp.t_tx('sale', 'stripe', 'in_t19_nofx2', 5900, 'SE',
        jsonb_build_object('accounting_currency', 'AED', 'accounting_amount', 2000))));
    raise exception '19: apply_event without fx_rate must fail';
  exception when check_violation then null;
  end;
  raise notice 'ok 19 currency conversion';
end $$;

-- 20. Användaren byter leverantör: Stripe avslutad, Apple aktiv
do $$
declare v_user uuid; n int; m int;
begin
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_20',
    pg_temp.t_sub('stripe', 'sub_t20', 'active', now() - interval '3 hours'),
    pg_temp.t_tx('sale', 'stripe', 'in_t20', 5900)));
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_20',
    pg_temp.t_sub('stripe', 'sub_t20', 'canceled', now() - interval '2 hours'), null));
  assert not pg_temp.t_has('user_billingtest_20', 'football_pro'), '20: gone after stripe cancel';
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_20',
    pg_temp.t_sub('apple', 'apple_otx_t20', 'active', now()),
    pg_temp.t_tx('sale', 'apple', 'apple_tx_t20', 5900, 'SE', jsonb_build_object('tax_type', 'platform_collected'))));
  select id into v_user from public.billing_users where clerk_user_id = 'user_billingtest_20';
  select count(*) into n from public.billing_users where clerk_user_id = 'user_billingtest_20';
  assert n = 1, '20: one user';
  select count(*) into n from public.billing_subscriptions where user_id = v_user;
  assert n = 2, '20: two subscriptions';
  assert pg_temp.t_has('user_billingtest_20', 'football_pro'), '20: entitlement true again via apple';
  select count(distinct billing_provider) into m from public.financial_transactions where user_id = v_user;
  assert m = 2, '20: billing history on both providers';
  assert (select count(*) from public.user_entitlements where user_id = v_user and entitlement = 'football_pro' and status = 'active') = 1,
    '20: exactly one active football_pro row';
  raise notice 'ok 20 user changes provider';
end $$;

-- 21. Utgång: perioden slut för länge sedan → sweep
do $$
declare v_user uuid; got text[];
begin
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_21',
    pg_temp.t_sub('stripe', 'sub_t21', 'active'), pg_temp.t_tx('sale', 'stripe', 'in_t21', 5900)));
  assert pg_temp.t_has('user_billingtest_21', 'football_pro'), '21: precondition';
  update public.billing_subscriptions
     set current_period_end = now() - interval '30 days' where provider_subscription_id = 'sub_t21';
  select coalesce(array_agg(x), '{}') into got from public.billing_sweep() x;
  assert 'user_billingtest_21' = any (got), '21: sweep returns the clerk id';
  assert (select status from public.billing_subscriptions where provider_subscription_id = 'sub_t21') = 'expired', '21: subscription expired';
  assert not pg_temp.t_has('user_billingtest_21', 'football_pro'), '21: entitlement false';
  assert exists (select 1 from public.audit_logs where subject_id = (select id::text from public.billing_subscriptions where provider_subscription_id = 'sub_t21')
                   and actor = 'cron:sweep' and action = 'subscription.status_changed'), '21: sweep audited';
  -- andra körningen har inget kvar att göra för den här användaren
  select coalesce(array_agg(x), '{}') into got from public.billing_sweep() x;
  assert not ('user_billingtest_21' = any (got)), '21: sweep is idempotent';
  raise notice 'ok 21 subscription expiration';
end $$;

-- 22. Utgångsfrist (grace)
do $$
declare got text[];
begin
  -- grace i framtiden: kvar
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_22a',
    pg_temp.t_sub('stripe', 'sub_t22a', 'past_due', now(), now() + interval '30 days',
                  jsonb_build_object('grace_until', now() + interval '2 days')),
    null));
  assert pg_temp.t_has('user_billingtest_22a', 'football_pro'), '22: true while grace is in the future';

  -- grace passerad: borta direkt, och sweep stänger prenumerationen
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_22b',
    pg_temp.t_sub('stripe', 'sub_t22b', 'active', now() - interval '1 hour'), pg_temp.t_tx('sale', 'stripe', 'in_t22b', 5900)));
  assert pg_temp.t_has('user_billingtest_22b', 'football_pro'), '22: precondition b';
  update public.billing_subscriptions set status = 'past_due', grace_until = now() - interval '1 hour'
   where provider_subscription_id = 'sub_t22b';
  select coalesce(array_agg(x), '{}') into got from public.billing_sweep() x;
  assert 'user_billingtest_22b' = any (got), '22: sweep reports the user';
  assert (select status from public.billing_subscriptions where provider_subscription_id = 'sub_t22b') = 'expired', '22: expired';
  assert not pg_temp.t_has('user_billingtest_22b', 'football_pro'), '22: false after grace';
  assert pg_temp.t_has('user_billingtest_22a', 'football_pro'), '22: sweep leaves the other grace alone';

  -- redan passerad grace i själva händelsen: aldrig rättighet
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_22c',
    pg_temp.t_sub('stripe', 'sub_t22c', 'past_due', now(), now() + interval '30 days',
                  jsonb_build_object('grace_until', now() - interval '1 day')), null));
  assert not pg_temp.t_has('user_billingtest_22c', 'football_pro'), '22: expired grace gives nothing';
  raise notice 'ok 22 grace period';
end $$;

-- 23. Misslyckad förnyelse som senare lyckas
do $$
declare s public.billing_subscriptions%rowtype;
begin
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_23',
    pg_temp.t_sub('stripe', 'sub_t23', 'active', now() - interval '3 hours'),
    pg_temp.t_tx('sale', 'stripe', 'in_t23a', 5900)));
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_23',
    pg_temp.t_sub('stripe', 'sub_t23', 'past_due', now() - interval '2 hours'), null));
  select * into s from public.billing_subscriptions where provider_subscription_id = 'sub_t23';
  assert s.status = 'past_due' and s.grace_until is not null, '23: past_due with grace';
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_23',
    pg_temp.t_sub('stripe', 'sub_t23', 'active', now() - interval '1 hour'),
    pg_temp.t_tx('sale', 'stripe', 'in_t23b', 5900)));
  select * into s from public.billing_subscriptions where provider_subscription_id = 'sub_t23';
  assert s.status = 'active' and s.grace_until is null, '23: back to active, grace cleared';
  assert pg_temp.t_has('user_billingtest_23', 'football_pro'), '23: entitlement true';
  assert (select count(*) from public.financial_transactions where subscription_id = s.id and type = 'sale') = 2, '23: both invoices booked';
  raise notice 'ok 23 failed renewal that later succeeds';
end $$;

-- 24. Kampanjrättighet (inga pengar, ingen transaktion)
do $$
declare r jsonb; v_user uuid;
begin
  r := public.billing_apply_event(pg_temp.t_ev('user_billingtest_24',
    pg_temp.t_sub('promotional', 'promo_t24', 'active', now(), now() + interval '7 days'), null,
    'SE', 'test', 'campaign:launch'));
  v_user := (r ->> 'user_id')::uuid;
  assert pg_temp.t_has('user_billingtest_24', 'football_pro'), '24: entitlement';
  assert (select source from public.user_entitlements where user_id = v_user and entitlement = 'football_pro') = 'promotional', '24: source promotional';
  assert (select valid_until is not null from public.user_entitlements where user_id = v_user and entitlement = 'football_pro'), '24: valid_until set';
  assert (select count(*) from public.financial_transactions where user_id = v_user) = 0, '24: no transaction';
  assert r ->> 'transaction_id' is null, '24: transaction_id null';
  -- en kampanj kan inte producera en försäljning
  begin
    perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_24',
      pg_temp.t_sub('promotional', 'promo_t24', 'active'),
      pg_temp.t_tx('sale', 'promotional', 'promo_sale_t24', 5900)));
    raise exception '24: promotional sale must be rejected';
  exception when raise_exception then
    assert sqlerrm like '%no money flow%', '24: wrong error: ' || sqlerrm;
  end;
  raise notice 'ok 24 promotional entitlement';
end $$;

-- 25. Manuell adminrättighet med granskningslogg
do $$
declare r jsonb; v_user uuid; n int;
begin
  r := public.billing_apply_event(pg_temp.t_ev('user_billingtest_25',
    pg_temp.t_sub('manual', 'manual_t25', 'active', now(), now() + interval '365 days'), null,
    'SE', 'test', 'admin:test'));
  v_user := (r ->> 'user_id')::uuid;
  assert pg_temp.t_has('user_billingtest_25', 'football_pro'), '25: entitlement';
  assert (select source from public.user_entitlements where user_id = v_user and entitlement = 'football_pro') = 'manual', '25: source manual';
  select count(*) into n from public.audit_logs where actor = 'admin:test' and action = 'subscription.created'
     and subject_id = (r ->> 'subscription_id');
  assert n = 1, '25: audit row for the subscription with the admin actor';
  select count(*) into n from public.audit_logs where actor = 'admin:test' and action = 'entitlements.changed' and subject_id = v_user::text;
  assert n = 1, '25: audit row for the entitlement change with the admin actor';
  -- manuell justering tillåts men flaggas (inget clearingkonto)
  r := public.billing_apply_event(pg_temp.t_ev('user_billingtest_25', null,
    pg_temp.t_tx('adjustment', 'manual', 'adj_t25', -1000, 'SE'), 'SE', 'test', 'admin:test'));
  assert (select needs_review from public.financial_transactions where id = (r ->> 'transaction_id')::uuid), '25: manual adjustment flagged';
  assert (select count(*) from public.ledger_entries where financial_transaction_id = (r ->> 'transaction_id')::uuid) = 0, '25: no ledger lines without clearing account';
  raise notice 'ok 25 manual admin entitlement';
end $$;

-- 26. Oföränderlighet: UPDATE, DELETE och TRUNCATE nekas
do $$
declare r jsonb; v_tx uuid; v_aud uuid; t text; ok boolean;
begin
  r := public.billing_apply_event(pg_temp.t_ev('user_billingtest_26',
    pg_temp.t_sub('stripe', 'sub_t26', 'active'), pg_temp.t_tx('sale', 'stripe', 'in_t26', 5900)));
  v_tx := (r ->> 'transaction_id')::uuid;
  select id into v_aud from public.audit_logs order by created_at desc limit 1;

  -- financial_transactions
  ok := false; begin update public.financial_transactions set gross_amount = 1, net_amount = 1 - tax_amount where id = v_tx;
  exception when restrict_violation then ok := true; end; assert ok, '26: UPDATE financial_transactions must fail';
  ok := false; begin delete from public.financial_transactions where id = v_tx;
  exception when restrict_violation then ok := true; end; assert ok, '26: DELETE financial_transactions must fail';
  -- vat_transactions
  ok := false; begin update public.vat_transactions set vat_amount = 0, net_amount = gross_amount where financial_transaction_id = v_tx;
  exception when restrict_violation then ok := true; end; assert ok, '26: UPDATE vat_transactions must fail';
  ok := false; begin delete from public.vat_transactions where financial_transaction_id = v_tx;
  exception when restrict_violation then ok := true; end; assert ok, '26: DELETE vat_transactions must fail';
  -- ledger_entries
  ok := false; begin update public.ledger_entries set debit = debit + 1 where financial_transaction_id = v_tx;
  exception when restrict_violation then ok := true; end; assert ok, '26: UPDATE ledger_entries must fail';
  ok := false; begin delete from public.ledger_entries where financial_transaction_id = v_tx;
  exception when restrict_violation then ok := true; end; assert ok, '26: DELETE ledger_entries must fail';
  -- audit_logs
  ok := false; begin update public.audit_logs set actor = 'evil' where id = v_aud;
  exception when restrict_violation then ok := true; end; assert ok, '26: UPDATE audit_logs must fail';
  ok := false; begin delete from public.audit_logs where id = v_aud;
  exception when restrict_violation then ok := true; end; assert ok, '26: DELETE audit_logs must fail';

  -- TRUNCATE: audit_logs har ingen FK mot sig, så triggern är det som stoppar den
  ok := false; begin execute 'truncate table public.audit_logs';
  exception when restrict_violation then ok := true; end; assert ok, '26: TRUNCATE audit_logs must fail with the trigger';
  foreach t in array array['financial_transactions','vat_transactions','ledger_entries'] loop
    ok := false;
    begin execute format('truncate table public.%I', t);
    exception when others then ok := true; end;
    assert ok, '26: TRUNCATE ' || t || ' must fail';
  end loop;

  assert (select gross_amount from public.financial_transactions where id = v_tx) = 5900, '26: row intact';
  raise notice 'ok 26 immutability';
end $$;

-- 27. Okänt eller saknat land → moms 0 och granskning
do $$
declare f public.financial_transactions%rowtype; g public.financial_transactions%rowtype; h public.financial_transactions%rowtype;
begin
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_27a',
    pg_temp.t_sub('stripe', 'sub_t27a', 'active'), pg_temp.t_tx('sale', 'stripe', 'in_t27a', 5900, 'FR'), 'FR'));
  select * into f from public.financial_transactions where provider_transaction_id = 'in_t27a';
  assert f.tax_amount = 0 and f.net_amount = 5900 and f.tax_type = 'unknown', '27: FR -> tax 0 / unknown';
  assert f.needs_review and f.review_reason like '%FR%', '27: FR flagged with reason, got ' || coalesce(f.review_reason, 'null');

  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_27b',
    pg_temp.t_sub('stripe', 'sub_t27b', 'active'), pg_temp.t_tx('sale', 'stripe', 'in_t27b', 5900, null), null));
  select * into g from public.financial_transactions where provider_transaction_id = 'in_t27b';
  assert g.tax_amount = 0 and g.needs_review and g.review_reason like '%country missing%', '27: missing country flagged';

  -- motstridiga landbevis
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_27c',
    pg_temp.t_sub('stripe', 'sub_t27c', 'active'),
    pg_temp.t_tx('sale', 'stripe', 'in_t27c', 5900, 'SE',
      jsonb_build_object('country_evidence', jsonb_build_array(
        jsonb_build_object('source', 'payment_method_country', 'value', 'SE'),
        jsonb_build_object('source', 'ip', 'value', 'DE'))))));
  select * into h from public.financial_transactions where provider_transaction_id = 'in_t27c';
  assert h.needs_review and h.review_reason like '%conflicting%', '27: conflicting evidence flagged';
  assert h.tax_amount = 1180, '27: tax still computed from the declared country';

  -- dispute: negativt, ingen momsrad, alltid granskning
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_27c', null,
    pg_temp.t_tx('dispute', 'stripe', 'dp_t27c', 5900, 'SE', jsonb_build_object('original_provider_transaction_id', 'in_t27c'))));
  assert (select needs_review and gross_amount = -5900 and tax_amount = 0 from public.financial_transactions where provider_transaction_id = 'dp_t27c'),
    '27: dispute negative, flagged';
  assert (select count(*) from public.vat_transactions v join public.financial_transactions ft on ft.id = v.financial_transaction_id
           where ft.provider_transaction_id = 'dp_t27c') = 0, '27: no vat row for a dispute';
  raise notice 'ok 27 unknown / missing country';
end $$;

-- 28. Händelser i oordning
do $$
declare t timestamptz := now();
begin
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_28',
    pg_temp.t_sub('stripe', 'sub_t28', 'active', t), pg_temp.t_tx('sale', 'stripe', 'in_t28', 5900)));
  -- en äldre "canceled" anländer efteråt
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_28',
    pg_temp.t_sub('stripe', 'sub_t28', 'canceled', t - interval '1 hour'), null));
  assert (select status from public.billing_subscriptions where provider_subscription_id = 'sub_t28') = 'active', '28: older event ignored';
  assert pg_temp.t_has('user_billingtest_28', 'football_pro'), '28: entitlement kept';
  -- en nyare gäller
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_28',
    pg_temp.t_sub('stripe', 'sub_t28', 'canceled', t + interval '1 hour'), null));
  assert (select status from public.billing_subscriptions where provider_subscription_id = 'sub_t28') = 'canceled', '28: newer event applies';
  raise notice 'ok 28 out-of-order events';
end $$;

-- 29. OSS-rapporten: land × sats × valuta, bara live, bara moms
do $$
declare
  c_from constant timestamptz := timestamptz '2031-03-01 00:00:00+00';
  c_to constant timestamptz := timestamptz '2031-04-01 00:00:00+00';
  d jsonb := jsonb_build_object('transaction_date', timestamptz '2031-03-15 12:00:00+00');
  se record; de record; n int;
begin
  -- SE: en försäljning + en halv återbetalning
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_29se',
    pg_temp.t_sub('stripe', 'sub_t29se', 'active'), pg_temp.t_tx('sale', 'stripe', 'in_t29se', 5900, 'SE', d), 'SE', 'live'));
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_29se', null,
    pg_temp.t_tx('refund', 'stripe', 're_t29se', 2950, 'SE', d || jsonb_build_object('original_provider_transaction_id', 'in_t29se')), 'SE', 'live'));
  -- DE
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_29de',
    pg_temp.t_sub('stripe', 'sub_t29de', 'active'), pg_temp.t_tx('sale', 'stripe', 'in_t29de', 5900, 'DE', d), 'DE', 'live'));
  -- test-miljön i samma fönster ska inte synas
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_29t',
    pg_temp.t_sub('stripe', 'sub_t29t', 'active'), pg_temp.t_tx('sale', 'stripe', 'in_t29t', 5900, 'SE', d), 'SE', 'test'));
  -- okänt land (live) är inte moms och ska inte med
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_29fr',
    pg_temp.t_sub('stripe', 'sub_t29fr', 'active'), pg_temp.t_tx('sale', 'stripe', 'in_t29fr', 5900, 'FR', d), 'FR', 'live'));

  select count(*) into n from public.billing_oss_report(c_from, c_to);
  assert n = 2, '29: exactly SE and DE, got ' || n;
  select * into se from public.billing_oss_report(c_from, c_to) where country = 'SE';
  select * into de from public.billing_oss_report(c_from, c_to) where country = 'DE';
  assert se.vat_rate = 0.25 and se.currency = 'SEK', '29: SE group keys';
  assert se.sales_net = 4720 and se.sales_vat = 1180, '29: SE sales (test env excluded), got ' || se.sales_net;
  assert se.refunds_net = -2360 and se.refunds_vat = -590, '29: SE refunds';
  assert se.adjustments_net = 0 and se.adjustments_vat = 0, '29: SE adjustments';
  assert se.total_net = 2360 and se.total_vat_payable = 590 and se.transaction_count = 2, '29: SE totals';
  assert se.needs_review_count = 0, '29: SE needs_review_count';
  assert de.vat_rate = 0.19 and de.sales_net = 4958 and de.sales_vat = 942 and de.total_vat_payable = 942 and de.transaction_count = 1, '29: DE';
  raise notice 'ok 29 oss report';
end $$;

-- 30. Rättigheter: varken anon eller authenticated når något
do $$
declare t record; f record; priv text;
begin
  for t in
    select c.oid, c.relname, c.relrowsecurity
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and c.relname in ('billing_users','billing_customers','billing_products','billing_subscriptions','user_entitlements',
         'webhook_events','financial_transactions','vat_transactions','ledger_accounts','ledger_entries',
         'financial_transaction_reviews','vat_rates','tax_configuration','vat_periods','tax_filing_deadlines',
         'payment_routing_rules','audit_logs')
  loop
    assert t.relrowsecurity, '30: RLS must be on for ' || t.relname;
    assert not exists (select 1 from pg_policy where polrelid = t.oid), '30: no policies on ' || t.relname;
    foreach priv in array array['anon','authenticated'] loop
      assert not has_table_privilege(priv, t.oid, 'select,insert,update,delete,truncate,references,trigger'),
        '30: ' || priv || ' has privileges on ' || t.relname;
    end loop;
    assert has_table_privilege('service_role', t.oid, 'select,insert'), '30: service_role must have access to ' || t.relname;
  end loop;
  assert (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and c.relname in ('billing_users','billing_customers','billing_products',
             'billing_subscriptions','user_entitlements','webhook_events','financial_transactions','vat_transactions','ledger_accounts',
             'ledger_entries','financial_transaction_reviews','vat_rates','tax_configuration','vat_periods','tax_filing_deadlines',
             'payment_routing_rules','audit_logs')) = 17, '30: all 17 billing tables exist';

  for f in
    select p.oid, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'billing\_%'
  loop
    foreach priv in array array['anon','authenticated'] loop
      assert not has_function_privilege(priv, f.oid, 'execute'), '30: ' || priv || ' can execute ' || f.proname;
    end loop;
    assert not has_function_privilege('public', f.oid, 'execute'), '30: PUBLIC can execute ' || f.proname;
    assert has_function_privilege('service_role', f.oid, 'execute'), '30: service_role cannot execute ' || f.proname;
    assert (select array_to_string(proconfig, ',') from pg_proc where oid = f.oid) like '%search_path=public, pg_temp%',
      '30: search_path not pinned on ' || f.proname;
    assert not (select prosecdef from pg_proc where oid = f.oid), '30: ' || f.proname || ' must be SECURITY INVOKER';
  end loop;
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('billing_apply_event','billing_recompute_entitlements','billing_claim_webhook',
             'billing_finish_webhook','billing_sweep','billing_vat_from_gross','billing_oss_report','billing_refresh_vat_period',
             'billing_dashboard')) = 9, '30: all nine contract functions exist';
  raise notice 'ok 30 privileges';
end $$;

-- 31. Momsperiod: submitted/paid skrivs aldrig över
do $$
declare p public.vat_periods%rowtype;
        d jsonb := jsonb_build_object('transaction_date', timestamptz '2031-05-10 12:00:00+00');
begin
  -- eget fönster (Q2 2031, live) så blocket inte beror på något annat
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_31',
    pg_temp.t_sub('stripe', 'sub_t31', 'active'), pg_temp.t_tx('sale', 'stripe', 'in_t31', 5900, 'SE', d), 'SE', 'live'));
  select * into p from public.billing_refresh_vat_period('SE', 'quarterly', date '2031-04-01') limit 1;
  assert p.vat_collected = 1180 and p.vat_refunded = 0 and p.vat_payable = 1180 and p.gross_sales = 5900 and p.net_sales = 4720,
    '31: period figures, got ' || p.vat_payable;
  assert p.period_end = date '2031-06-30', '31: quarter end, got ' || p.period_end;
  assert p.status = 'report_generated', '31: status';

  update public.vat_periods set status = 'submitted', submitted_at = now(), vat_payable = 1 where id = p.id;
  perform public.billing_refresh_vat_period('SE', 'quarterly', date '2031-04-01');
  select * into p from public.vat_periods where id = p.id;
  assert p.status = 'submitted' and p.vat_payable = 1, '31: submitted period untouched';

  update public.vat_periods set status = 'paid' where id = p.id;
  perform public.billing_refresh_vat_period('SE', 'quarterly', date '2031-04-01');
  assert (select vat_payable from public.vat_periods where id = p.id) = 1, '31: paid period untouched';
  raise notice 'ok 31 vat period';
end $$;

-- 32. Instrumentpanelen: pengar per valuta, ärliga nycklar
do $$
declare d jsonb;
begin
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_32',
    pg_temp.t_sub('stripe', 'sub_t32', 'active'), pg_temp.t_tx('sale', 'stripe', 'in_t32', 5900), 'SE', 'live'));
  d := public.billing_dashboard();
  assert d ? 'money_by_currency' and d ? 'mrr_gross_by_currency' and d ? 'needs_review_count' and d ? 'notice', '32: keys';
  assert d -> 'money_by_currency' -> 'SEK' ? 'estimated_vat_payable', '32: estimated_vat_payable key';
  assert not (d -> 'money_by_currency' ? 'total'), '32: never a cross-currency total';
  assert (d -> 'mrr_gross_by_currency' ->> 'SEK')::bigint >= 5900, '32: mrr includes the live subscription';
  assert (d ->> 'active_subscriptions')::int >= 1, '32: active subscriptions';
  raise notice 'ok 32 dashboard';
end $$;

-- 33. Webhook-omförsök: failed → process, färsk processing → busy, gammal processing → process
do $$
declare a text; att int;
begin
  assert public.billing_claim_webhook('stripe', 'evt_t33', 'invoice.paid', 'h') = 'process', '33: first';
  assert public.billing_claim_webhook('stripe', 'evt_t33', 'invoice.paid', 'h') = 'busy', '33: fresh processing is busy';
  perform public.billing_finish_webhook('stripe', 'evt_t33', 'failed', 'boom');
  assert (select error_message from public.webhook_events where event_id = 'evt_t33') = 'boom', '33: error stored';
  assert public.billing_claim_webhook('stripe', 'evt_t33', 'invoice.paid', 'h') = 'process', '33: retry after failed';
  select attempts into att from public.webhook_events where event_id = 'evt_t33';
  assert att = 2, '33: attempts incremented';
  update public.webhook_events set last_attempt_at = now() - interval '10 minutes' where event_id = 'evt_t33';
  assert public.billing_claim_webhook('stripe', 'evt_t33', 'invoice.paid', 'h') = 'process', '33: stale processing reclaimed';
  perform public.billing_finish_webhook('stripe', 'evt_t33', 'ignored', null);
  assert public.billing_claim_webhook('stripe', 'evt_t33', 'invoice.paid', 'h') = 'done', '33: ignored is done';
  raise notice 'ok 33 webhook retries';
end $$;

-- 34. Indata valideras
do $$
declare ok boolean; ev jsonb;
begin
  ev := pg_temp.t_ev('user_billingtest_34', pg_temp.t_sub('stripe', 'sub_t34', 'active'), pg_temp.t_tx('sale', 'stripe', 'in_t34', 5900));
  ok := false; begin perform public.billing_apply_event(ev - 'actor'); exception when raise_exception then ok := true; end; assert ok, '34: actor required';
  ok := false; begin perform public.billing_apply_event(jsonb_set(ev, '{environment}', '"prod"')); exception when raise_exception then ok := true; end; assert ok, '34: environment';
  ok := false; begin perform public.billing_apply_event(jsonb_set(ev, '{subscription,provider}', '"paypal"')); exception when raise_exception then ok := true; end; assert ok, '34: provider';
  ok := false; begin perform public.billing_apply_event(jsonb_set(ev, '{subscription,status}', '"weird"')); exception when raise_exception then ok := true; end; assert ok, '34: status';
  ok := false; begin perform public.billing_apply_event(jsonb_set(ev, '{subscription,product_id}', '"nope"')); exception when raise_exception then ok := true; end; assert ok, '34: product';
  ok := false; begin perform public.billing_apply_event(jsonb_set(ev, '{transaction,type}', '"gift"')); exception when raise_exception then ok := true; end; assert ok, '34: type';
  ok := false; begin perform public.billing_apply_event(ev #- '{transaction,provider_transaction_id}'); exception when raise_exception then ok := true; end; assert ok, '34: tx id';
  ok := false; begin perform public.billing_apply_event(ev #- '{user,clerk_user_id}'); exception when raise_exception then ok := true; end; assert ok, '34: clerk id';
  ok := false; begin perform public.billing_apply_event(jsonb_set(ev, '{transaction,type}', '"refund"')); exception when raise_exception then ok := true; end; assert ok, '34: refund needs original id';
  assert not exists (select 1 from public.billing_users where clerk_user_id = 'user_billingtest_34'), '34: nothing written by rejected events';
  -- landstyrka: ip skriver inte över billing_address
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_34b', null, null, 'SE'));
  perform public.billing_apply_event(jsonb_set(jsonb_set(pg_temp.t_ev('user_billingtest_34b', null, null, 'DE'), '{user,country_source}', '"ip"'), '{user,country}', '"DE"'));
  assert (select country from public.billing_users where clerk_user_id = 'user_billingtest_34b') = 'SE', '34: weaker source must not overwrite';
  perform public.billing_apply_event(jsonb_set(jsonb_set(pg_temp.t_ev('user_billingtest_34b', null, null, 'DE'), '{user,country_source}', '"stripe_tax"'), '{user,country}', '"DE"'));
  assert (select country from public.billing_users where clerk_user_id = 'user_billingtest_34b') = 'DE', '34: stronger source overwrites';
  raise notice 'ok 34 validation and country strength';
end $$;

-- 35. En kampanj slutar på sitt datum; fristen vid leverantörsavbrott gäller bara riktiga leverantörer
do $$
begin
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_35a',
    pg_temp.t_sub('promotional', 'promo_t35', 'active', now() - interval '8 days', now() - interval '1 hour'), null,
    'SE', 'test', 'campaign:launch'));
  assert not pg_temp.t_has('user_billingtest_35a', 'football_pro'), '35: promotional must end at its date';
  perform public.billing_apply_event(pg_temp.t_ev('user_billingtest_35b',
    pg_temp.t_sub('stripe', 'sub_t35', 'active', now() - interval '31 days', now() - interval '1 hour'), null));
  assert pg_temp.t_has('user_billingtest_35b', 'football_pro'), '35: stripe keeps last verified state inside the outage window';
  raise notice 'ok 35 outage grace only for real providers';
end $$;
