-- Gaffer documents table.
-- Apply once in the Supabase dashboard SQL editor (or via supabase db push).

create table if not exists gaffer_documents (
  id         uuid        primary key default gen_random_uuid(),
  doc_id     text        not null unique,   -- mirrors GafferDocument.meta.id
  name       text        not null,
  doc        jsonb       not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for fast doc_id lookups (upsert conflict target).
create unique index if not exists gaffer_documents_doc_id_idx on gaffer_documents (doc_id);
