-- Private storage for prescription PDFs, so the doctor can send a patient a time-limited link.
-- The app uploads <patient id>/<RX number>.pdf as the doctor and shares a signed link (30 days).
-- NOT YET APPLIED to the live project: apply it, then the "Send on WhatsApp" button uses links.
-- Until then the app falls back to sharing the PDF file itself.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('prescription-pdfs', 'prescription-pdfs', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

create policy "doctors upload prescription pdfs"
on storage.objects for insert to authenticated
with check (bucket_id = 'prescription-pdfs' and public.clinic_is_doctor());

create policy "doctors replace prescription pdfs"
on storage.objects for update to authenticated
using (bucket_id = 'prescription-pdfs' and public.clinic_is_doctor())
with check (bucket_id = 'prescription-pdfs' and public.clinic_is_doctor());

create policy "doctors and staff read prescription pdfs"
on storage.objects for select to authenticated
using (bucket_id = 'prescription-pdfs' and (public.clinic_is_doctor() or public.clinic_is_staff()));

create policy "patients read their own prescription pdfs"
on storage.objects for select to authenticated
using (bucket_id = 'prescription-pdfs' and (storage.foldername(name))[1] = auth.uid()::text);
