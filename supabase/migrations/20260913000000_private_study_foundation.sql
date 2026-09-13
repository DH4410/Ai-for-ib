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

alter table private.past_paper_questions
  add column if not exists search_vector tsvector
  generated always as (to_tsvector('english', question_text)) stored;

create index if not exists past_paper_questions_search_vector_idx
  on private.past_paper_questions using gin (search_vector);
create index if not exists past_paper_questions_filter_idx
  on private.past_paper_questions (subject, year, paper, pairing_status);

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

alter table private.topic_mastery
  add column if not exists attempt_count integer not null default 0
  check (attempt_count >= 0);

create index if not exists learning_events_student_created_idx
  on private.learning_events (student_id, created_at desc);
create index if not exists topic_mastery_attempt_count_idx
  on private.topic_mastery (student_id, mastery_estimate, next_review_at);

alter table private.student_profiles enable row level security;
alter table private.learning_events enable row level security;
alter table private.topic_mastery enable row level security;

create policy "student profiles are private to their owner" on private.student_profiles
  for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
create policy "learning events are private to their owner" on private.learning_events
  for all to authenticated
  using ((select auth.uid()) = student_id)
  with check ((select auth.uid()) = student_id);
create policy "topic mastery is private to its owner" on private.topic_mastery
  for all to authenticated
  using ((select auth.uid()) = student_id)
  with check ((select auth.uid()) = student_id);

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


create or replace function public.search_private_past_paper_questions(
  p_subject text,
  p_query text,
  p_years integer[] default '{}',
  p_paper text default null,
  p_topic_ids text[] default '{}',
  p_paired_only boolean default false,
  p_limit integer default 20
)
returns table (
  id text,
  document_id uuid,
  subject text,
  title text,
  locator text,
  question_text text,
  markscheme_text text,
  topic_ids text[],
  year integer,
  paper text,
  question_number text,
  marks integer,
  pairing_status text,
  score real
)
language sql
stable
security definer
set search_path = private, public, extensions
as $$
  select
    question.id,
    question.source_question_document_id,
    question.subject,
    question_document.title,
    concat_ws(
      ' · ',
      initcap(question.session) || ' ' || question.year::text,
      question.timezone,
      question.level,
      upper(question.paper),
      'Q' || question.question_number || coalesce(question.subquestion, '')
    ) as locator,
    question.question_text,
    question.markscheme_text,
    coalesce(
      array_agg(distinct mapping.topic_id)
        filter (where mapping.topic_id is not null),
      '{}'
    ) as topic_ids,
    question.year,
    question.paper,
    question.question_number,
    question.marks,
    question.pairing_status,
    ts_rank(
      question.search_vector,
      plainto_tsquery('english', p_query)
    )::real as score
  from private.past_paper_questions question
  join private.documents question_document
    on question_document.id = question.source_question_document_id
  left join private.past_paper_question_topics mapping
    on mapping.past_paper_question_id = question.id
  where question.subject = p_subject
    and (
      cardinality(p_years) = 0
      or question.year = any(p_years)
    )
    and (
      p_paper is null
      or lower(question.paper) = lower(p_paper)
    )
    and (
      not p_paired_only
      or question.pairing_status = 'paired'
    )
    and (
      cardinality(p_topic_ids) = 0
      or not exists (
        select 1
        from unnest(p_topic_ids) requested(topic_id)
        where not exists (
          select 1
          from private.past_paper_question_topics required_topic
          where required_topic.past_paper_question_id = question.id
            and required_topic.topic_id = requested.topic_id
            and required_topic.confidence >= 0.8
        )
      )
    )
  group by question.id, question_document.title
  order by score desc, question.year desc, question.id
  limit least(greatest(p_limit, 1), 100);
$$;

revoke all on function public.search_private_past_paper_questions(
  text, text, integer[], text, text[], boolean, integer
) from public, anon, authenticated;
grant execute on function public.search_private_past_paper_questions(
  text, text, integer[], text, text[], boolean, integer
) to service_role;


create or replace function public.record_private_learning_attempt(
  p_student_id uuid,
  p_attempt jsonb,
  p_mastery jsonb
)
returns void
language plpgsql
security definer
set search_path = private, public, auth
as $$
declare
  v_subject text;
  v_topic_id text;
begin
  if p_student_id is null then
    raise exception 'student id is required';
  end if;
  if jsonb_typeof(p_attempt) <> 'object'
    or jsonb_typeof(p_mastery) <> 'object' then
    raise exception 'attempt and mastery must be JSON objects';
  end if;

  v_subject := p_attempt->>'subject';
  v_topic_id := p_attempt->>'topic_id';

  if v_topic_id is null
    or v_topic_id <> p_mastery->>'topic_id' then
    raise exception 'attempt and mastery topic IDs must match';
  end if;

  if not exists (
    select 1
    from private.topics topic
    where topic.id = v_topic_id
      and topic.subject = v_subject
  ) then
    raise exception 'attempt topic does not match the subject taxonomy';
  end if;

  insert into private.student_profiles (id)
  values (p_student_id)
  on conflict (id) do nothing;

  insert into private.learning_events (
    student_id,
    past_paper_question_id,
    subject,
    topic_id,
    score,
    maximum_marks,
    hints_used,
    attempt_number,
    misconception_tags,
    confidence,
    elapsed_seconds,
    created_at
  )
  values (
    p_student_id,
    nullif(p_attempt->>'past_paper_question_id', ''),
    v_subject,
    v_topic_id,
    (p_attempt->>'score')::numeric,
    (p_attempt->>'maximum_marks')::numeric,
    coalesce((p_attempt->>'hints_used')::integer, 0),
    coalesce((p_attempt->>'attempt_number')::integer, 1),
    array(
      select jsonb_array_elements_text(
        coalesce(p_attempt->'misconception_tags', '[]'::jsonb)
      )
    ),
    nullif(p_attempt->>'confidence', '')::real,
    nullif(p_attempt->>'elapsed_seconds', '')::integer,
    coalesce(
      nullif(p_attempt->>'occurred_at', '')::timestamptz,
      now()
    )
  );

  insert into private.topic_mastery (
    student_id,
    topic_id,
    mastery_estimate,
    attempt_count,
    next_review_at,
    updated_at
  )
  values (
    p_student_id,
    v_topic_id,
    (p_mastery->>'mastery_estimate')::real,
    coalesce((p_mastery->>'attempt_count')::integer, 1),
    nullif(p_mastery->>'next_review_at', '')::timestamptz,
    coalesce(
      nullif(p_mastery->>'updated_at', '')::timestamptz,
      now()
    )
  )
  on conflict (student_id, topic_id) do update
  set
    mastery_estimate = excluded.mastery_estimate,
    attempt_count = excluded.attempt_count,
    next_review_at = excluded.next_review_at,
    updated_at = excluded.updated_at;
end;
$$;

create or replace function public.get_private_learning_progress(
  p_student_id uuid,
  p_subject text default null
)
returns table (
  subject text,
  topic_id text,
  label text,
  mastery_estimate real,
  attempt_count integer,
  next_review_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = private, public
as $$
  select
    topic.subject,
    mastery.topic_id,
    topic.label,
    mastery.mastery_estimate,
    mastery.attempt_count,
    mastery.next_review_at,
    mastery.updated_at
  from private.topic_mastery mastery
  join private.topics topic on topic.id = mastery.topic_id
  where mastery.student_id = p_student_id
    and (p_subject is null or topic.subject = p_subject)
  order by
    mastery.mastery_estimate asc,
    mastery.next_review_at asc nulls first,
    mastery.topic_id;
$$;

revoke all on function public.record_private_learning_attempt(uuid, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.get_private_learning_progress(uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_private_learning_attempt(uuid, jsonb, jsonb)
  to service_role;
grant execute on function public.get_private_learning_progress(uuid, text)
  to service_role;


create or replace function public.index_private_past_paper(
  p_question_document jsonb,
  p_question_version jsonb,
  p_markscheme_document jsonb,
  p_markscheme_version jsonb,
  p_questions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, extensions
as $$
declare
  v_question_document_id uuid;
  v_question_version_id uuid;
  v_markscheme_document_id uuid;
  v_markscheme_version_id uuid;
  v_question_count integer;
  v_paired_question_count integer;
begin
  if jsonb_typeof(p_question_document) <> 'object'
    or jsonb_typeof(p_question_version) <> 'object' then
    raise exception 'question document and version must be JSON objects';
  end if;

  p_questions := coalesce(p_questions, '[]'::jsonb);
  if jsonb_typeof(p_questions) <> 'array' then
    raise exception 'p_questions must be a JSON array';
  end if;

  if p_question_document->>'document_kind' <> 'question-paper'
    or p_question_document->>'document_type' <> 'question-paper' then
    raise exception 'question document must be a question paper';
  end if;

  if (p_markscheme_document is null) <> (p_markscheme_version is null) then
    raise exception 'markscheme document and version must be supplied together';
  end if;

  if p_markscheme_document is not null
    and (
      jsonb_typeof(p_markscheme_document) <> 'object'
      or jsonb_typeof(p_markscheme_version) <> 'object'
      or p_markscheme_document->>'document_kind' <> 'markscheme'
      or p_markscheme_document->>'document_type' <> 'markscheme'
    ) then
    raise exception 'markscheme metadata is invalid';
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
    p_question_document->>'source_id',
    p_question_document->>'subject',
    p_question_document->>'document_type',
    p_question_document->>'title',
    p_question_document->>'filename',
    nullif(p_question_document->>'author', ''),
    nullif(p_question_document->>'publisher', ''),
    p_question_document->>'source_provider',
    p_question_document->>'source_reference',
    coalesce(
      (p_question_document->>'useful_for_knowledge_base')::boolean,
      true
    ),
    p_question_document->>'copyright_status'
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
  returning id into v_question_document_id;

  insert into private.document_versions (
    document_id,
    checksum_sha256,
    byte_count,
    mime_type,
    storage_path,
    acquired_at
  )
  values (
    v_question_document_id,
    p_question_version->>'checksum_sha256',
    (p_question_version->>'byte_count')::bigint,
    p_question_version->>'mime_type',
    p_question_version->>'storage_path',
    coalesce(
      nullif(p_question_version->>'acquired_at', '')::timestamptz,
      now()
    )
  )
  on conflict (document_id, checksum_sha256) do update
  set
    byte_count = excluded.byte_count,
    mime_type = excluded.mime_type,
    storage_path = excluded.storage_path,
    acquired_at = excluded.acquired_at
  returning id into v_question_version_id;

  if p_markscheme_document is not null then
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
      p_markscheme_document->>'source_id',
      p_markscheme_document->>'subject',
      p_markscheme_document->>'document_type',
      p_markscheme_document->>'title',
      p_markscheme_document->>'filename',
      nullif(p_markscheme_document->>'author', ''),
      nullif(p_markscheme_document->>'publisher', ''),
      p_markscheme_document->>'source_provider',
      p_markscheme_document->>'source_reference',
      coalesce(
        (p_markscheme_document->>'useful_for_knowledge_base')::boolean,
        true
      ),
      p_markscheme_document->>'copyright_status'
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
    returning id into v_markscheme_document_id;

    insert into private.document_versions (
      document_id,
      checksum_sha256,
      byte_count,
      mime_type,
      storage_path,
      acquired_at
    )
    values (
      v_markscheme_document_id,
      p_markscheme_version->>'checksum_sha256',
      (p_markscheme_version->>'byte_count')::bigint,
      p_markscheme_version->>'mime_type',
      p_markscheme_version->>'storage_path',
      coalesce(
        nullif(p_markscheme_version->>'acquired_at', '')::timestamptz,
        now()
      )
    )
    on conflict (document_id, checksum_sha256) do update
    set
      byte_count = excluded.byte_count,
      mime_type = excluded.mime_type,
      storage_path = excluded.storage_path,
      acquired_at = excluded.acquired_at
    returning id into v_markscheme_version_id;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_questions) question(value)
    where question.value->>'subject' <> p_question_document->>'subject'
      or (question.value->>'year')::integer <>
        (p_question_document->>'year')::integer
      or lower(question.value->>'paper') <>
        lower(p_question_document->>'paper')
      or question.value->>'level' <>
        p_question_document->>'level'
      or question.value->>'session' <>
        p_question_document->>'session'
      or upper(question.value->>'timezone') <>
        upper(p_question_document->>'timezone')
  ) then
    raise exception 'question metadata does not match the source paper';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_questions) question(value)
    where question.value->>'pairing_status' = 'paired'
      and v_markscheme_document_id is null
  ) then
    raise exception 'paired questions require a markscheme document';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_questions) question(value)
    cross join lateral jsonb_array_elements_text(
      coalesce(question.value->'topic_ids', '[]'::jsonb)
    ) requested(topic_id)
    left join private.topics topic on topic.id = requested.topic_id
    where topic.id is null
  ) then
    raise exception 'one or more question topic IDs are not in the private taxonomy';
  end if;

  delete from private.past_paper_questions
  where source_question_document_id = v_question_document_id;

  insert into private.past_paper_questions (
    id,
    source_question_document_id,
    source_markscheme_document_id,
    subject,
    syllabus_version,
    level,
    year,
    session,
    timezone,
    paper,
    question_number,
    subquestion,
    marks,
    command_terms,
    question_text,
    markscheme_text,
    asset_references,
    pairing_status
  )
  select
    question.value->>'id',
    v_question_document_id,
    case
      when question.value->>'pairing_status' = 'paired'
        then v_markscheme_document_id
      else null
    end,
    question.value->>'subject',
    question.value->>'syllabus_version',
    question.value->>'level',
    (question.value->>'year')::integer,
    question.value->>'session',
    question.value->>'timezone',
    lower(question.value->>'paper'),
    question.value->>'question_number',
    nullif(question.value->>'subquestion', ''),
    nullif(question.value->>'marks', '')::integer,
    array(
      select jsonb_array_elements_text(
        coalesce(question.value->'command_terms', '[]'::jsonb)
      )
    ),
    question.value->>'question_text',
    case
      when question.value->>'pairing_status' = 'paired'
        then nullif(question.value->>'markscheme_text', '')
      else null
    end,
    '{}'::text[],
    question.value->>'pairing_status'
  from jsonb_array_elements(p_questions) question(value);

  insert into private.past_paper_question_topics (
    past_paper_question_id,
    topic_id,
    classification_method,
    confidence
  )
  select
    question.value->>'id',
    requested.topic_id,
    question.value->>'topic_classification_method',
    (question.value->>'topic_confidence')::real
  from jsonb_array_elements(p_questions) question(value)
  cross join lateral jsonb_array_elements_text(
    coalesce(question.value->'topic_ids', '[]'::jsonb)
  ) requested(topic_id)
  join private.topics topic on topic.id = requested.topic_id
  where question.value->>'topic_classification_method' in (
    'manual_metadata',
    'heading_rule',
    'keyword_rule',
    'model_assisted'
  );

  select count(*)::integer,
         count(*) filter (
           where pairing_status = 'paired'
         )::integer
  into v_question_count, v_paired_question_count
  from private.past_paper_questions
  where source_question_document_id = v_question_document_id;

  return jsonb_build_object(
    'question_document_id', v_question_document_id::text,
    'markscheme_document_id',
      case
        when v_markscheme_document_id is null then null
        else v_markscheme_document_id::text
      end,
    'question_count', v_question_count,
    'paired_question_count', v_paired_question_count
  );
end;
$$;

revoke all on function public.index_private_past_paper(
  jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.index_private_past_paper(
  jsonb, jsonb, jsonb, jsonb, jsonb
) to service_role;
