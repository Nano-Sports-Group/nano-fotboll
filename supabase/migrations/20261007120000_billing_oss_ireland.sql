-- Founder-beslut 2026-10-07: momsen redovisas själv via EU:s OSS (non-Union) med Irland som
-- identifieringsmedlemsstat; Stripe Tax används inte. Trafiken antas vara svensk.
-- Bara data — och fortfarande märkt TAX_ADVISER_VERIFICATION_REQUIRED: beslutet är founderns,
-- bekräftelsen är rådgivarens. Registreringsnummer saknas tills registreringen är gjord.

update public.tax_configuration
   set tax_regime = 'non_union_oss',
       currency = 'EUR',
       notes = 'Founder 2026-10-07: non-Union OSS, identifieringsmedlemsstat Irland (Revenue). Inte registrerad än. '
            || 'Deklarationen lämnas i EUR; försäljningen sker i SEK, så kurs och kursdag ska bekräftas av rådgivaren. '
            || 'Stripe Tax används inte — momsen räknas ur vat_rates.',
       updated_at = now()
 where legal_entity = 'HMJ98' and country = 'EU' and tax_scheme = 'eu_oss_non_union'
   and verification_status = 'TAX_ADVISER_VERIFICATION_REQUIRED';

-- Första perioden som uppskattning (confirmed=false): OSS deklareras och betalas senast sista dagen
-- i månaden efter kvartalet. Gäller först när registreringen finns; revisorn bekräftar.
insert into public.tax_filing_deadlines
  (jurisdiction, scheme, period, filing_deadline, payment_deadline, status, confirmed, notes)
values
  ('IE', 'eu_oss_non_union', '2026-Q4', date '2027-01-31', date '2027-01-31', 'upcoming', false,
   'Uppskattning. Förutsätter OSS-registrering i Irland med start senast 2026-Q4. Bekräftas av rådgivaren.')
on conflict (jurisdiction, scheme, period) do nothing;

-- Android → webben för att uppgradera kontot. AVSTÄNGD: Google Play tillåter bara länkning till
-- köp utanför appen inom ett uttryckligt program. Slås på (enabled=true) när appen är ansluten.
insert into public.payment_routing_rules (priority, platform, country, program, flow, enabled, note)
select 50, 'android', 'SE', 'google_play_eea_external_offers', 'external_web_checkout', false,
       'Fortsätt på Nano Web. Slå på först när appen är ansluten till Googles program för externa erbjudanden (EES).'
where not exists (
  select 1 from public.payment_routing_rules
   where platform = 'android' and flow = 'external_web_checkout' and country = 'SE');
