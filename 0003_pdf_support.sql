-- Add PDF support to receipts bucket
-- Run: supabase db push

-- Update allowed MIME types to include PDF
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
where id = 'receipts';

-- Add document_type, document_number, vendor, customer columns to receipts
alter table receipts
  add column if not exists document_type  text check (document_type in ('Factura', 'Remito', 'Ticket', 'Recibo', 'Otro')),
  add column if not exists document_number text,
  add column if not exists vendor_name     text,
  add column if not exists vendor_tax_id   text,
  add column if not exists customer_name   text,
  add column if not exists customer_tax_id text,
  add column if not exists subtotal        numeric(14,2),
  add column if not exists tax_amount      numeric(14,2),
  add column if not exists summary         text;
