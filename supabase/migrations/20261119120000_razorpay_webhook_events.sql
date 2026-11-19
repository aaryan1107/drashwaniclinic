-- Razorpay webhook audit log, idempotency and refund tracking.
--
-- razorpay_webhook_events: one row per signed webhook delivery, keyed by Razorpay's
-- x-razorpay-event-id. The razorpay-webhook Edge Function (service role) writes it and skips
-- retries of an event it already handled. Only Razorpay IDs, amounts and outcomes are stored:
-- no payer contact details or notes. Doctors can read it; nobody else can.
--
-- consultation_payments gains amount_refunded / refunded_at, written by refund.processed.
-- A full refund sets payment_status = 'REFUNDED', which no longer unlocks the consultation.

alter table public.consultation_payments
  add column if not exists amount_refunded integer,
  add column if not exists refunded_at timestamptz;

create table if not exists public.razorpay_webhook_events (
  id bigint generated always as identity primary key,
  event_id text unique,
  event text not null,
  razorpay_order_id text,
  razorpay_payment_id text,
  razorpay_refund_id text,
  amount integer,
  currency text,
  outcome text not null
    check (outcome in ('applied', 'no_change', 'ignored', 'rejected_amount', 'error')),
  payment_status text,
  received_at timestamptz not null default now()
);

create index if not exists razorpay_webhook_events_order_idx
  on public.razorpay_webhook_events (razorpay_order_id, received_at desc);

alter table public.razorpay_webhook_events enable row level security;

revoke all on public.razorpay_webhook_events from anon, authenticated;
grant select on public.razorpay_webhook_events to authenticated;

drop policy if exists "doctors can read razorpay webhook events" on public.razorpay_webhook_events;
create policy "doctors can read razorpay webhook events"
on public.razorpay_webhook_events for select
to authenticated
using (public.clinic_is_doctor());
