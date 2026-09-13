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


-- Seed the public-label IB taxonomy used by the local classifier.
insert into private.topics (id, subject, parent_id, label, syllabus_version, curriculum_reference)
values
  ('chemistry.structure', 'chemistry', null, 'Structure', '2025', null),
  ('chemistry.structure.models', 'chemistry', 'chemistry.structure', 'Models of particulate nature', '2025', null),
  ('chemistry.structure.bonding', 'chemistry', 'chemistry.structure', 'Models of bonding and structure', '2025', null),
  ('chemistry.structure.classification', 'chemistry', 'chemistry.structure', 'Classification of matter', '2025', null),
  ('chemistry.reactivity', 'chemistry', null, 'Reactivity', '2025', null),
  ('chemistry.reactivity.driving-reactions', 'chemistry', 'chemistry.reactivity', 'What drives chemical reactions?', '2025', null),
  ('chemistry.reactivity.amount-rate-extent', 'chemistry', 'chemistry.reactivity', 'How much, how fast and how far?', '2025', null),
  ('chemistry.reactivity.mechanisms', 'chemistry', 'chemistry.reactivity', 'What are the mechanisms of chemical change?', '2025', null),
  ('physics.a.space-time-motion', 'physics', null, 'Theme A: Space, time and motion', '2025', null),
  ('physics.b.particulate-matter', 'physics', null, 'Theme B: The particulate nature of matter', '2025', null),
  ('physics.b.particulate-matter.specific-latent-heat', 'physics', 'physics.b.particulate-matter', 'Specific latent heat', '2025', null),
  ('physics.c.wave-behaviour', 'physics', null, 'Theme C: Wave behaviour', '2025', null),
  ('physics.d.fields', 'physics', null, 'Theme D: Fields', '2025', null),
  ('physics.e.nuclear-quantum', 'physics', null, 'Theme E: Nuclear and quantum physics', '2025', null),
  ('mathematics.number-algebra', 'mathematics', null, 'Number and algebra', '2025', null),
  ('mathematics.functions', 'mathematics', null, 'Functions', '2025', null),
  ('mathematics.geometry-trigonometry', 'mathematics', null, 'Geometry and trigonometry', '2025', null),
  ('mathematics.statistics-probability', 'mathematics', null, 'Statistics and probability', '2025', null),
  ('mathematics.calculus', 'mathematics', null, 'Calculus', '2025', null),
  ('mathematics.problem-solving', 'mathematics', null, 'Investigation and problem-solving skills', '2025', null)
on conflict (id) do update
set
  subject = excluded.subject,
  parent_id = excluded.parent_id,
  label = excluded.label,
  syllabus_version = excluded.syllabus_version,
  curriculum_reference = excluded.curriculum_reference;

-- Atomic server-only loader for one immutable source version.
-- The private schema remains unexposed; only service_role can execute this RPC.
create or replace function public.index_private_study_source(
  p_document jsonb,
  p_version jsonb,
  p_pages jsonb,
  p_chunks jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, extensions
as $$
declare
  v_document_id uuid;
  v_document_version_id uuid;
  v_page_count integer;
  v_chunk_count integer;
begin
  if jsonb_typeof(p_document) <> 'object' then
    raise exception 'p_document must be a JSON object';
  end if;
  if jsonb_typeof(p_version) <> 'object' then
    raise exception 'p_version must be a JSON object';
  end if;

  p_pages := coalesce(p_pages, '[]'::jsonb);
  p_chunks := coalesce(p_chunks, '[]'::jsonb);

  if jsonb_typeof(p_pages) <> 'array' then
    raise exception 'p_pages must be a JSON array';
  end if;
  if jsonb_typeof(p_chunks) <> 'array' then
    raise exception 'p_chunks must be a JSON array';
  end if;

  insert into private.documents (
    source_id,
    subject,
    document_type,
    title,
    filename,
    author,
    publisher,
    source_provider,
    source_reference,
    useful_for_knowledge_base,
    copyright_status
  )
  values (
    p_document->>'source_id',
    p_document->>'subject',
    p_document->>'document_type',
    p_document->>'title',
    p_document->>'filename',
    nullif(p_document->>'author', ''),
    nullif(p_document->>'publisher', ''),
    p_document->>'source_provider',
    p_document->>'source_reference',
    coalesce((p_document->>'useful_for_knowledge_base')::boolean, true),
    p_document->>'copyright_status'
  )
  on conflict (source_id) do update
  set
    subject = excluded.subject,
    document_type = excluded.document_type,
    title = excluded.title,
    filename = excluded.filename,
    author = excluded.author,
    publisher = excluded.publisher,
    source_provider = excluded.source_provider,
    source_reference = excluded.source_reference,
    useful_for_knowledge_base = excluded.useful_for_knowledge_base,
    copyright_status = excluded.copyright_status
  returning id into v_document_id;

  insert into private.document_versions (
    document_id,
    checksum_sha256,
    byte_count,
    mime_type,
    storage_path,
    acquired_at
  )
  values (
    v_document_id,
    p_version->>'checksum_sha256',
    (p_version->>'byte_count')::bigint,
    p_version->>'mime_type',
    p_version->>'storage_path',
    coalesce((p_version->>'acquired_at')::timestamptz, now())
  )
  on conflict (document_id, checksum_sha256) do update
  set
    byte_count = excluded.byte_count,
    mime_type = excluded.mime_type,
    storage_path = excluded.storage_path,
    acquired_at = excluded.acquired_at
  returning id into v_document_version_id;

  delete from private.document_pages
  where document_version_id = v_document_version_id;

  delete from private.content_chunks
  where document_version_id = v_document_version_id;

  insert into private.document_pages (
    document_version_id,
    page_number,
    extraction_method,
    text_quality,
    extracted_text,
    extraction_error
  )
  select
    v_document_version_id,
    (page.value->>'page_number')::integer,
    page.value->>'extraction_method',
    (page.value->>'text_quality')::real,
    null,
    null
  from jsonb_array_elements(p_pages) as page(value);

  insert into private.content_chunks (
    id,
    document_version_id,
    subject,
    document_type,
    title,
    heading_path,
    page_start,
    page_end,
    content,
    equation_references,
    figure_references,
    embedding
  )
  select
    chunk.value->>'id',
    v_document_version_id,
    chunk.value->>'subject',
    p_document->>'document_type',
    chunk.value->>'title',
    array(
      select jsonb_array_elements_text(
        coalesce(chunk.value->'heading_path', '[]'::jsonb)
      )
    ),
    (chunk.value->>'page_start')::integer,
    (chunk.value->>'page_end')::integer,
    chunk.value->>'content',
    array(
      select jsonb_array_elements_text(
        coalesce(chunk.value->'equation_references', '[]'::jsonb)
      )
    ),
    array(
      select jsonb_array_elements_text(
        coalesce(chunk.value->'figure_references', '[]'::jsonb)
      )
    ),
    case
      when jsonb_typeof(chunk.value->'embedding') = 'array'
        then ((chunk.value->'embedding')::text)::extensions.vector(1024)
      else null
    end
  from jsonb_array_elements(p_chunks) as chunk(value);

  if exists (
    select 1
    from jsonb_array_elements(p_chunks) as chunk(value)
    cross join lateral jsonb_array_elements_text(
      coalesce(chunk.value->'topic_ids', '[]'::jsonb)
    ) as requested_topic(topic_id)
    left join private.topics topic on topic.id = requested_topic.topic_id
    where topic.id is null
  ) then
    raise exception 'one or more chunk topic IDs are not present in the private topic taxonomy';
  end if;

  insert into private.content_chunk_topics (
    content_chunk_id,
    topic_id,
    classification_method,
    confidence
  )
  select
    chunk.value->>'id',
    requested_topic.topic_id,
    chunk.value->>'classification_method',
    (chunk.value->>'topic_confidence')::real
  from jsonb_array_elements(p_chunks) as chunk(value)
  cross join lateral jsonb_array_elements_text(
    coalesce(chunk.value->'topic_ids', '[]'::jsonb)
  ) as requested_topic(topic_id)
  join private.topics topic on topic.id = requested_topic.topic_id
  where chunk.value->>'classification_method' in (
    'manual_metadata',
    'heading_rule',
    'keyword_rule',
    'model_assisted'
  );

  select count(*)::integer into v_page_count
  from private.document_pages
  where document_version_id = v_document_version_id;

  select count(*)::integer into v_chunk_count
  from private.content_chunks
  where document_version_id = v_document_version_id;

  return jsonb_build_object(
    'document_id', v_document_id::text,
    'document_version_id', v_document_version_id::text,
    'page_count', v_page_count,
    'chunk_count', v_chunk_count
  );
end;
$$;

revoke all on function public.index_private_study_source(jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.index_private_study_source(jsonb, jsonb, jsonb, jsonb)
  to service_role;
