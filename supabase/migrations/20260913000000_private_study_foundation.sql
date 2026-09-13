create extension if not exists vector with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table if not exists private.documents (
  id uuid primary key default gen_random_uuid(),
  source_id text not null unique,
  subject text not null check (subject in ('chemistry', 'physics', 'mathematics', 'ib')),
  document_type text not null,
  title text not null,
  filename text not null,
  author text,
  publisher text,
  source_provider text not null check (source_provider in ('managebac', 'ibdocs', 'manual')),
  source_reference text not null,
  useful_for_knowledge_base boolean not null default true,
  copyright_status text not null check (copyright_status in ('private-licensed', 'user-provided', 'unknown')),
  created_at timestamptz not null default now()
);

create table if not exists private.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references private.documents(id) on delete restrict,
  checksum_sha256 text not null check (checksum_sha256 ~ '^[A-Fa-f0-9]{64}$'),
  byte_count bigint not null check (byte_count >= 0),
  mime_type text not null,
  storage_path text not null,
  acquired_at timestamptz not null,
  unique (document_id, checksum_sha256)
);

create table if not exists private.document_pages (
  id uuid primary key default gen_random_uuid(),
  document_version_id uuid not null references private.document_versions(id) on delete cascade,
  page_number integer not null check (page_number > 0),
  extraction_method text not null check (extraction_method in ('text', 'ocr_required', 'ocr', 'failed')),
  text_quality real not null check (text_quality >= 0 and text_quality <= 1),
  extracted_text text,
  extraction_error text,
  unique (document_version_id, page_number)
);

create table if not exists private.topics (
  id text primary key,
  subject text not null check (subject in ('chemistry', 'physics', 'mathematics')),
  parent_id text references private.topics(id) on delete restrict,
  label text not null,
  syllabus_version text not null,
  curriculum_reference text,
  unique (subject, label, syllabus_version)
);

create table if not exists private.content_chunks (
  id text primary key,
  document_version_id uuid not null references private.document_versions(id) on delete cascade,
  subject text not null check (subject in ('chemistry', 'physics', 'mathematics')),
  document_type text not null,
  title text not null,
  heading_path text[] not null default '{}',
  page_start integer not null check (page_start > 0),
  page_end integer not null check (page_end >= page_start),
  content text not null,
  equation_references text[] not null default '{}',
  figure_references text[] not null default '{}',
  embedding extensions.vector(1024),
  search_vector tsvector generated always as (to_tsvector('english', title || ' ' || content)) stored
);

create index if not exists content_chunks_search_vector_idx on private.content_chunks using gin (search_vector);
create index if not exists content_chunks_embedding_idx on private.content_chunks using hnsw (embedding extensions.vector_cosine_ops);
create index if not exists content_chunks_subject_document_type_idx on private.content_chunks (subject, document_type);

create table if not exists private.content_chunk_topics (
  content_chunk_id text not null references private.content_chunks(id) on delete cascade,
  topic_id text not null references private.topics(id) on delete restrict,
  classification_method text not null check (classification_method in ('manual_metadata', 'heading_rule', 'keyword_rule', 'model_assisted')),
  confidence real not null check (confidence >= 0 and confidence <= 1),
  primary key (content_chunk_id, topic_id)
);

create table if not exists private.past_paper_questions (
  id text primary key,
  source_question_document_id uuid not null references private.documents(id) on delete restrict,
  source_markscheme_document_id uuid references private.documents(id) on delete restrict,
  subject text not null check (subject in ('chemistry', 'physics', 'mathematics')),
  syllabus_version text not null,
  level text not null check (level in ('HL', 'SL')),
  year integer not null check (year between 2000 and 2100),
  session text not null check (session in ('may', 'november')),
  timezone text not null,
  paper text not null,
  question_number text not null,
  subquestion text,
  marks integer check (marks >= 0),
  command_terms text[] not null default '{}',
  question_text text not null,
  markscheme_text text,
  asset_references text[] not null default '{}',
  pairing_status text not null check (pairing_status in ('paired', 'question_only', 'ambiguous'))
);

create table if not exists private.past_paper_question_topics (
  past_paper_question_id text not null references private.past_paper_questions(id) on delete cascade,
  topic_id text not null references private.topics(id) on delete restrict,
  classification_method text not null check (classification_method in ('manual_metadata', 'heading_rule', 'keyword_rule', 'model_assisted')),
  confidence real not null check (confidence >= 0 and confidence <= 1),
  primary key (past_paper_question_id, topic_id)
);

create table if not exists private.student_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists private.learning_events (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references private.student_profiles(id) on delete cascade,
  past_paper_question_id text references private.past_paper_questions(id) on delete set null,
  subject text not null check (subject in ('chemistry', 'physics', 'mathematics')),
  topic_id text references private.topics(id) on delete set null,
  score numeric not null check (score >= 0),
  maximum_marks numeric not null check (maximum_marks > 0),
  hints_used integer not null default 0 check (hints_used >= 0),
  attempt_number integer not null default 1 check (attempt_number > 0),
  misconception_tags text[] not null default '{}',
  confidence real check (confidence >= 0 and confidence <= 1),
  elapsed_seconds integer check (elapsed_seconds >= 0),
  created_at timestamptz not null default now()
);

create table if not exists private.topic_mastery (
  student_id uuid not null references private.student_profiles(id) on delete cascade,
  topic_id text not null references private.topics(id) on delete cascade,
  mastery_estimate real not null check (mastery_estimate >= 0 and mastery_estimate <= 1),
  next_review_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (student_id, topic_id)
);

alter table private.student_profiles enable row level security;
alter table private.learning_events enable row level security;
alter table private.topic_mastery enable row level security;

create policy "student profiles are private to their owner" on private.student_profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "learning events are private to their owner" on private.learning_events
  for all using (auth.uid() = student_id) with check (auth.uid() = student_id);
create policy "topic mastery is private to its owner" on private.topic_mastery
  for all using (auth.uid() = student_id) with check (auth.uid() = student_id);

create or replace function public.search_private_study_chunks(
  p_subject text,
  p_document_types text[],
  p_query text,
  p_topic_ids text[] default '{}',
  p_limit integer default 20
)
returns table (
  id text,
  document_id uuid,
  document_type text,
  subject text,
  title text,
  locator text,
  page_start integer,
  page_end integer,
  text text,
  topic_ids text[],
  score real
)
language sql
stable
security definer
set search_path = private, public, extensions
as $$
  select
    chunk.id,
    version.document_id,
    chunk.document_type,
    chunk.subject,
    chunk.title,
    concat_ws(' — ', nullif(array_to_string(chunk.heading_path, ' > '), ''), 'p. ' || chunk.page_start::text),
    chunk.page_start,
    chunk.page_end,
    chunk.content,
    coalesce(array_agg(distinct mapping.topic_id) filter (where mapping.topic_id is not null), '{}') as topic_ids,
    ts_rank(chunk.search_vector, plainto_tsquery('english', p_query))::real as score
  from content_chunks chunk
  join document_versions version on version.id = chunk.document_version_id
  left join content_chunk_topics mapping on mapping.content_chunk_id = chunk.id
  where chunk.subject = p_subject
    and chunk.document_type = any(p_document_types)
    and chunk.search_vector @@ plainto_tsquery('english', p_query)
    and (
      cardinality(p_topic_ids) = 0
      or exists (
        select 1 from content_chunk_topics required_topic
        where required_topic.content_chunk_id = chunk.id
          and required_topic.topic_id = any(p_topic_ids)
      )
    )
  group by chunk.id, version.document_id
  order by score desc, chunk.id
  limit least(greatest(p_limit, 1), 100);
$$;

create or replace function public.search_private_study_chunks_vector(
  p_subject text,
  p_document_types text[],
  p_embedding extensions.vector(1024),
  p_topic_ids text[] default '{}',
  p_limit integer default 20
)
returns table (
  id text,
  document_id uuid,
  document_type text,
  subject text,
  title text,
  locator text,
  page_start integer,
  page_end integer,
  text text,
  topic_ids text[],
  score real
)
language sql
stable
security definer
set search_path = private, public, extensions
as $$
  select
    chunk.id,
    version.document_id,
    chunk.document_type,
    chunk.subject,
    chunk.title,
    concat_ws(' — ', nullif(array_to_string(chunk.heading_path, ' > '), ''), 'p. ' || chunk.page_start::text),
    chunk.page_start,
    chunk.page_end,
    chunk.content,
    coalesce(array_agg(distinct mapping.topic_id) filter (where mapping.topic_id is not null), '{}') as topic_ids,
    (1 - (chunk.embedding <=> p_embedding))::real as score
  from content_chunks chunk
  join document_versions version on version.id = chunk.document_version_id
  left join content_chunk_topics mapping on mapping.content_chunk_id = chunk.id
  where chunk.subject = p_subject
    and chunk.document_type = any(p_document_types)
    and chunk.embedding is not null
    and (
      cardinality(p_topic_ids) = 0
      or exists (
        select 1 from content_chunk_topics required_topic
        where required_topic.content_chunk_id = chunk.id
          and required_topic.topic_id = any(p_topic_ids)
      )
    )
  group by chunk.id, version.document_id
  order by chunk.embedding <=> p_embedding, chunk.id
  limit least(greatest(p_limit, 1), 100);
$$;

revoke all on function public.search_private_study_chunks(text, text[], text, text[], integer) from public, anon, authenticated;
revoke all on function public.search_private_study_chunks_vector(text, text[], extensions.vector, text[], integer) from public, anon, authenticated;
grant execute on function public.search_private_study_chunks(text, text[], text, text[], integer) to service_role;
grant execute on function public.search_private_study_chunks_vector(text, text[], extensions.vector, text[], integer) to service_role;
