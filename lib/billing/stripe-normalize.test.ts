import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";
import {
  collectCountry,
  disputeEvent,
  feeEvent,
  invoiceSaleEvent,
  refundEvent,
  stripeStatusToBilling,
  subscriptionEvent,
} from "./stripe-normalize";

const T0 = 1_791_000_000; // 2026-10-03
const common = { clerkUserId: "user_1", eventTime: T0 + 100, livemode: true };

// Fixturerna är delobjekt typade mot Stripes egna typer (Partial) och castas till hela typen — fälten som
// normaliseraren läser är de enda som finns, så en omdöpt Stripe-egenskap fäller kompileringen här.
function sub(over: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  const base: Partial<Stripe.Subscription> = {
    id: "sub_1",
    status: "active",
    customer: "cus_1",
    metadata: { clerkUserId: "user_1", vertical: "football", plan: "pro", interval: "month", founder: "false" },
    cancel_at_period_end: false,
    cancel_at: null,
    latest_invoice: "in_1",
    items: {
      object: "list",
      has_more: false,
      url: "",
      data: [
        {
          id: "si_1",
          current_period_start: T0,
          current_period_end: T0 + 30 * 86400,
          price: { id: "price_1", lookup_key: "nano_fotboll_pro_month", unit_amount: 8900, currency: "sek", product: "nano_fotboll_pro", recurring: { interval: "month" } },
        },
      ],
    } as unknown as Stripe.ApiList<Stripe.SubscriptionItem>,
    ...over,
  };
  return base as Stripe.Subscription;
}

function invoice(over: Partial<Stripe.Invoice> = {}): Stripe.Invoice {
  const base: Partial<Stripe.Invoice> = {
    id: "in_1",
    number: "NANO-0001",
    hosted_invoice_url: "https://invoice.stripe.com/i/acct/in_1",
    currency: "sek",
    total: 8900,
    amount_paid: 8900,
    created: T0,
    status_transitions: { paid_at: T0 + 5 } as Stripe.Invoice.StatusTransitions,
    customer_email: "anna@example.se",
    customer_address: { country: "SE" } as Stripe.Address,
    automatic_tax: { enabled: false, status: null } as Stripe.Invoice.AutomaticTax,
    total_taxes: null,
    ...over,
  };
  return base as Stripe.Invoice;
}

const charge = (country: string | null, billing: string | null = null): Stripe.Charge =>
  ({
    id: "ch_1",
    billing_details: { address: billing ? { country: billing } : null },
    payment_method_details: { type: "card", card: { country } },
  }) as unknown as Stripe.Charge;

const bt = (over: Partial<Stripe.BalanceTransaction> = {}): Stripe.BalanceTransaction =>
  ({ id: "txn_1", amount: 3050, currency: "aed", exchange_rate: 0.3427, fee: 120, net: 2930, created: T0 + 6, ...over }) as Stripe.BalanceTransaction;

test("statusmappning", () => {
  const cases: [Stripe.Subscription.Status, string][] = [
    ["trialing", "trialing"], ["active", "active"], ["past_due", "past_due"], ["unpaid", "expired"],
    ["canceled", "canceled"], ["paused", "paused"], ["incomplete", "expired"], ["incomplete_expired", "expired"],
  ];
  for (const [from, to] of cases) assert.equal(stripeStatusToBilling(from), to, from);
});

test("ny prenumeration: produkt, plan, period, pris och event_time = event.created", () => {
  const r = subscriptionEvent(sub({ status: "trialing" }), common);
  assert.ok(r.ok);
  const e = r.value;
  assert.equal(e.environment, "live");
  assert.equal(e.actor, "webhook:stripe");
  assert.equal(e.user.clerk_user_id, "user_1");
  assert.equal(e.transaction, undefined);
  const s = e.subscription!;
  assert.equal(s.provider, "stripe");
  assert.equal(s.provider_customer_id, "cus_1");
  assert.equal(s.provider_subscription_id, "sub_1");
  assert.equal(s.provider_transaction_id, "in_1");
  assert.equal(s.product_id, "nano_fotboll_pro");
  assert.equal(s.plan_id, "nano_fotboll_pro_month");
  assert.equal(s.status, "trialing");
  assert.equal(s.current_period_end, new Date((T0 + 30 * 86400) * 1000).toISOString());
  assert.equal(s.event_time, new Date((T0 + 100) * 1000).toISOString());
  assert.equal(s.price_amount, 8900);
  assert.equal(s.price_currency, "SEK");
  assert.equal(s.price_interval, "month");
  assert.equal(s.grace_until, null);
});

test("livemode false → test-miljö", () => {
  const r = subscriptionEvent(sub(), { ...common, livemode: false });
  assert.ok(r.ok);
  assert.equal(r.value.environment, "test");
});

test("past_due och canceled behåller prenumerationen med rätt status; uppsägning flaggas", () => {
  const past = subscriptionEvent(sub({ status: "past_due" }), common);
  assert.ok(past.ok);
  assert.equal(past.value.subscription?.status, "past_due");
  const canceled = subscriptionEvent(sub({ status: "canceled", cancel_at_period_end: true }), common);
  assert.ok(canceled.ok);
  assert.equal(canceled.value.subscription?.status, "canceled");
  assert.equal(canceled.value.subscription?.cancel_at_period_end, true);
});

test("okänd produkt eller saknad metadata ger skäl — ingen gissad produkt", () => {
  const r = subscriptionEvent(
    sub({ metadata: { clerkUserId: "user_1", vertical: "padel", plan: "pro" }, items: { data: [{ price: { product: "prod_random" } }] } as unknown as Stripe.ApiList<Stripe.SubscriptionItem> }),
    common,
  );
  assert.equal(r.ok, false);
});

test("produkten kan också läsas ur prisets produkt-id när metadata saknas", () => {
  const r = subscriptionEvent(sub({ metadata: { clerkUserId: "user_1" } }), common);
  // Utan vertical/plan i metadata: vertical = football men plan saknas → reservvägen via produkt-id.
  assert.ok(r.ok);
  assert.equal(r.value.subscription?.product_id, "nano_fotboll_pro");
});

test("förnyelsefaktura: sale = invoice.total, landet ur fakturaadress, kortland som bevis", () => {
  const r = invoiceSaleEvent({ ...common, invoice: invoice(), subscription: sub(), charge: charge("SE") });
  assert.ok(r.ok);
  const t = r.value.transaction!;
  assert.equal(t.type, "sale");
  assert.equal(t.provider_transaction_id, "in_1");
  assert.equal(t.gross_amount, 8900);
  assert.equal(t.currency, "SEK");
  assert.equal(t.transaction_date, new Date((T0 + 5) * 1000).toISOString());
  assert.equal(t.invoice_id, "in_1");
  assert.equal(t.invoice_number, "NANO-0001");
  assert.equal(t.invoice_url, "https://invoice.stripe.com/i/acct/in_1");
  assert.equal(t.product_id, "nano_fotboll_pro");
  assert.equal(t.customer_country, "SE");
  assert.equal(t.customer_country_source, "billing_address");
  assert.deepEqual(t.country_evidence, [
    { source: "billing_address", value: "SE" },
    { source: "payment_method_country", value: "SE" },
  ]);
  assert.equal(t.tax_amount, null);
  assert.equal(r.value.subscription?.provider_subscription_id, "sub_1");
  assert.equal(r.value.user.country, "SE");
});

test("0 kr-faktura (trial) ger ingen transaktion alls", () => {
  const r = invoiceSaleEvent({ ...common, invoice: invoice({ total: 0, amount_paid: 0 }), subscription: sub() });
  assert.equal(r.ok, false);
});

test("Stripe Tax: beräknad moms används som den är", () => {
  const taxed = invoice({
    automatic_tax: { enabled: true, status: "complete" } as Stripe.Invoice.AutomaticTax,
    total_taxes: [{ amount: 1780, tax_behavior: "inclusive", taxability_reason: "standard_rated", taxable_amount: 7120, type: "tax_rate_details", tax_rate_details: null }],
  });
  const r = invoiceSaleEvent({ ...common, invoice: taxed, subscription: sub() });
  assert.ok(r.ok);
  assert.equal(r.value.transaction?.tax_amount, 1780);
});

test("utan Stripe Tax lämnas momsen null så att databasen räknar ur vat_rates", () => {
  const off = invoiceSaleEvent({ ...common, invoice: invoice({ total_taxes: [{ amount: 500 } as Stripe.Invoice.TotalTax] }), subscription: sub() });
  assert.ok(off.ok);
  assert.equal(off.value.transaction?.tax_amount, null);
  // Påslagen men ofullständig beräkning räknas inte som beräknad.
  const failed = invoiceSaleEvent({
    ...common,
    invoice: invoice({ automatic_tax: { enabled: true, status: "requires_location_inputs" } as Stripe.Invoice.AutomaticTax, total_taxes: [] }),
    subscription: sub(),
  });
  assert.ok(failed.ok);
  assert.equal(failed.value.transaction?.tax_amount, null);
});

test("motstridiga landbevis sparas ALLA; prioriteten följer ARCHITECTURE §7", () => {
  const customer = { tax: { location: { country: "DE", source: "billing_address", state: null } } } as unknown as Stripe.Customer;
  const c = collectCountry({ customer, invoice: invoice({ customer_address: { country: "SE" } as Stripe.Address }), charge: charge("NO", "FI") });
  assert.equal(c.country, "DE");
  assert.equal(c.source, "stripe_tax");
  assert.deepEqual(c.evidence, [
    { source: "stripe_tax", value: "DE" },
    { source: "billing_address", value: "SE" },
    { source: "billing_address", value: "FI" },
    { source: "payment_method_country", value: "NO" },
  ]);
});

test("inget land alls ger null, aldrig en gissning", () => {
  const c = collectCountry({ invoice: invoice({ customer_address: null }), charge: charge(null) });
  assert.deepEqual(c, { country: null, source: null, evidence: [] });
});

test("bara kortland tillgängligt används som källa payment_method_country", () => {
  const c = collectCountry({ invoice: invoice({ customer_address: null }), charge: charge("se") });
  assert.equal(c.country, "SE");
  assert.equal(c.source, "payment_method_country");
});

test("växelkurs ur balanstransaktionen när valutan skiljer sig; annars alla fyra fält null", () => {
  const withFx = invoiceSaleEvent({ ...common, invoice: invoice(), subscription: sub(), balanceTransaction: bt() });
  assert.ok(withFx.ok);
  const t = withFx.value.transaction!;
  assert.equal(t.accounting_currency, "AED");
  assert.equal(t.accounting_amount, 3050);
  assert.equal(t.fx_rate, 0.3427);
  assert.equal(t.fx_rate_source, "stripe_balance_transaction");
  assert.equal(t.fx_timestamp, new Date((T0 + 6) * 1000).toISOString());

  for (const balanceTransaction of [bt({ currency: "sek" }), bt({ exchange_rate: null }), null, undefined]) {
    const r = invoiceSaleEvent({ ...common, invoice: invoice(), subscription: sub(), balanceTransaction });
    assert.ok(r.ok);
    const x = r.value.transaction!;
    assert.deepEqual([x.accounting_currency, x.accounting_amount, x.fx_rate, x.fx_rate_source, x.fx_timestamp], [null, null, null, null, null]);
  }
});

test("avgift i balanstransaktionens valuta, negativ, txn_-id", () => {
  const r = feeEvent({ ...common, balanceTransaction: bt(), invoiceId: "in_1", productId: "nano_fotboll_pro" });
  assert.ok(r.ok);
  const t = r.value.transaction!;
  assert.equal(t.type, "fee");
  assert.equal(t.provider_transaction_id, "txn_1");
  assert.equal(t.currency, "AED");
  assert.equal(t.gross_amount, -120);
  assert.equal(t.invoice_id, "in_1");
  assert.equal(r.value.subscription, undefined);
  assert.equal(feeEvent({ ...common, balanceTransaction: bt({ fee: 0 }), invoiceId: null, productId: null }).ok, false);
});

test("återbetalning: re_-id, negativt belopp, original = fakturan", () => {
  const refund = { id: "re_1", amount: 8900, currency: "sek", created: T0 + 3600 } as Stripe.Refund;
  const r = refundEvent({ ...common, refund, originalInvoiceId: "in_1", productId: "nano_fotboll_pro" });
  assert.ok(r.ok);
  const t = r.value.transaction!;
  assert.equal(t.type, "refund");
  assert.equal(t.provider_transaction_id, "re_1");
  assert.equal(t.gross_amount, -8900);
  assert.equal(t.original_provider_transaction_id, "in_1");
  assert.equal(refundEvent({ ...common, refund, originalInvoiceId: null, productId: null }).ok, false);
});

test("delåterbetalning i annan valuta får växelkurs ur sin balanstransaktion", () => {
  const refund = { id: "re_2", amount: 4000, currency: "sek", created: T0 + 3600 } as Stripe.Refund;
  const r = refundEvent({ ...common, refund, originalInvoiceId: "in_1", productId: null, balanceTransaction: bt({ amount: -1371, exchange_rate: 0.3427 }) });
  assert.ok(r.ok);
  assert.equal(r.value.transaction?.gross_amount, -4000);
  assert.equal(r.value.transaction?.accounting_amount, -1371);
});

test("tvist: dp_-id, negativt brutto, original = fakturan", () => {
  const dispute = { id: "dp_1", amount: 8900, currency: "sek", created: T0 + 7200 } as Stripe.Dispute;
  const r = disputeEvent({ ...common, dispute, originalInvoiceId: "in_1", productId: "nano_fotboll_pro" });
  assert.ok(r.ok);
  const t = r.value.transaction!;
  assert.equal(t.type, "dispute");
  assert.equal(t.provider_transaction_id, "dp_1");
  assert.equal(t.gross_amount, -8900);
  assert.equal(t.original_provider_transaction_id, "in_1");
});
