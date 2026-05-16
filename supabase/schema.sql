# Database Setup for Vaultic

Execute the following SQL in your Supabase SQL Editor:

```sql
-- Enable pgvector
create extension if not exists vector;

-- Documents Table
create table documents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  content_type text not null,
  size_bytes bigint not null,
  status text not null default 'pending'
    check (status in ('pending','processing','ready','error')),
  chunk_count int default 0,
  error_message text,
  created_at timestamptz default now()
);

-- Document Chunks Table
create table document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade,
  filename text not null,
  page_number int not null,
  chunk_index int not null,
  content text not null,
  embedding vector(3072),
  created_at timestamptz default now()
);

-- Index for Vector Search
create index on document_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Conversations Table
create table conversations (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'New Conversation',
  employee_id text references employees(employee_id),
  created_at timestamptz default now()
);

-- Messages Table
create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  employee_id text references employees(employee_id),
  created_at timestamptz default now()
);

-- Employee accounts
create table employees (
  id uuid primary key default gen_random_uuid(),
  employee_id text unique not null,
  full_name text not null,
  role text not null default 'employee' check (role in ('admin', 'employee')),
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Sessions table
create table sessions (
  id uuid primary key default gen_random_uuid(),
  employee_id text references employees(employee_id) on delete cascade,
  token uuid default gen_random_uuid(),
  created_at timestamptz default now(),
  expires_at timestamptz default now() + interval '8 hours'
);

-- Similarity Search Function
create or replace function match_documents(
  query_embedding vector(3072),
  match_threshold float,
  match_count int,
  filter_document_id uuid default null
)
returns table (
  id uuid, filename text, page_number int,
  chunk_index int, content text, similarity float
)
language plpgsql as $$
begin
  return query
  select dc.id, dc.filename, dc.page_number,
    dc.chunk_index, dc.content,
    1 - (dc.embedding <=> query_embedding) as similarity
  from document_chunks dc
  where (filter_document_id is null or dc.document_id = filter_document_id)
    and 1 - (dc.embedding <=> query_embedding) > match_threshold
  order by dc.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- License Management Table
create table licenses (
  id uuid primary key default gen_random_uuid(),
  license_key text unique not null,
  is_active boolean default true,
  allowed_domain text default 'ANY',
  transaction_hash text,
  payment_received_at timestamptz,
  created_at timestamptz default now()
);

-- IMPORTANT: Enable RLS on all tables to lock them down
alter table public.document_chunks enable row level security;
alter table public.documents enable row level security;
alter table public.messages enable row level security;
alter table public.conversations enable row level security;
alter table public.employees enable row level security;
alter table public.sessions enable row level security;
alter table public.licenses enable row level security;

-- Default RLS Policies (Deny All by default, which happens when RLS is enabled without policies)
-- The backend uses the SERVICE_ROLE which bypasses RLS safely.
```

# Storage Setup
Create a bucket named `knowledge-vault` in Supabase Storage. Set it to public or configure RLS as needed.
