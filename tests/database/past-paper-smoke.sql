-- Synthetic integration fixtures only. The database is disposable.
begin;

do $$
declare
  rpc record;
  rpc_count integer := 0;
begin
  for rpc in
    select p.oid, p.proname
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'search_private_study_chunks', 'search_private_study_chunks_vector',
      'index_private_study_source', 'search_private_past_paper_questions',
      'get_private_past_paper_question', 'get_private_past_paper_asset',
      'record_private_learning_attempt', 'get_private_learning_progress',
      'index_private_past_paper', 'list_private_study_sources'
    )
  loop
    rpc_count := rpc_count + 1;
    if has_function_privilege('anon', rpc.oid, 'EXECUTE') or
       has_function_privilege('authenticated', rpc.oid, 'EXECUTE') or
       not has_function_privilege('service_role', rpc.oid, 'EXECUTE') then
      raise exception 'incorrect RPC privileges for %', rpc.proname;
    end if;
  end loop;
  if rpc_count <> 10 then raise exception 'expected ten private RPCs, found %', rpc_count; end if;
  if has_schema_privilege('anon', 'private', 'USAGE') or
     has_schema_privilege('authenticated', 'private', 'USAGE') then
    raise exception 'browser roles must not access private schema';
  end if;
end;
$$;

insert into auth.users(id) values
  ('12345678-1234-4234-8234-123456789012'),
  ('12345678-1234-4234-8234-123456789013');

set local role service_role;

do $$
declare
  result jsonb;
  source jsonb := '{
    "source_id":"synthetic-smoke-qp","subject":"physics",
    "document_kind":"question-paper","document_type":"question-paper",
    "title":"Synthetic mechanics fixture","filename":"synthetic-smoke-qp.pdf",
    "source_provider":"manual","source_reference":"synthetic-smoke",
    "copyright_status":"user-provided","year":2019,"session":"may",
    "timezone":"TZ2","level":"HL","paper":"p2","syllabus_version":"2016","language":"English"
  }'::jsonb;
  version jsonb := jsonb_build_object(
    'checksum_sha256', repeat('a',64), 'byte_count', 1,
    'mime_type','application/pdf', 'storage_path','physics/synthetic-smoke-qp.pdf'
  );
  scheme jsonb;
  scheme_version jsonb;
  base_question jsonb := '{
    "id":"synthetic-smoke-q1","subject":"physics","syllabus_version":"2016",
    "level":"HL","year":2019,"session":"may","timezone":"TZ2","paper":"p2",
    "question_number":"1","page_start":2,"page_end":2,"marks":2,
    "question_text":"Synthetic fixture: calculate energy.",
    "markscheme_text":"Synthetic fixture: one mark for formula and one for result.",
    "pairing_status":"paired","topic_ids":["physics.b.thermal-energy-transfers"],
    "topic_classification_method":"manual_metadata","topic_confidence":1
  }'::jsonb;
  question_only jsonb;
  visual jsonb;
  student uuid := '12345678-1234-4234-8234-123456789012';
  other_student uuid := '12345678-1234-4234-8234-123456789013';
  attempt jsonb := '{
    "subject":"physics","topic_id":"physics.b.thermal-energy-transfers",
    "past_paper_question_id":"synthetic-smoke-q1",
    "score":1,"maximum_marks":2,"misconception_tags":["units"]
  }'::jsonb;
  mastery jsonb := '{
    "topic_id":"physics.b.thermal-energy-transfers",
    "mastery_estimate":0.5,"attempt_count":1,
    "next_review_at":"2026-12-01T12:00:00Z"
  }'::jsonb;
begin
  scheme := source || '{"source_id":"synthetic-smoke-ms","document_kind":"markscheme","document_type":"markscheme","filename":"synthetic-smoke-ms.pdf"}'::jsonb;
  scheme_version := version || jsonb_build_object('checksum_sha256', repeat('b',64),'storage_path','physics/synthetic-smoke-ms.pdf');
  question_only := base_question || '{"id":"synthetic-smoke-q2","question_number":"2","pairing_status":"question_only","markscheme_text":null}'::jsonb;
  visual := base_question || '{"id":"synthetic-smoke-q3","question_number":"3","asset_references":["visual-context-required"]}'::jsonb;
  result := public.index_private_past_paper(source,version,scheme,scheme_version,jsonb_build_array(base_question,question_only,visual));
  if (result->>'question_count')::int <> 3 or (result->>'paired_question_count')::int <> 2 then
    raise exception 'incorrect paper indexing counts';
  end if;

  if (select count(*) from public.search_private_past_paper_questions('physics','energy',array[2019],'p2','HL','may','TZ2',array['physics.b.thermal-energy-transfers'],false,10)) <> 3 then
    raise exception 'paper archive filter did not return all fixtures';
  end if;
  if exists (select 1 from public.search_private_past_paper_questions('physics','energy',array[2025])) then
    raise exception 'paper search ignored year filter';
  end if;
  if (select count(*) from public.search_private_past_paper_questions('physics','energy',array[2019],null,null,null,null,'{}',true,10)) <> 2 then
    raise exception 'paired-only filter did not work';
  end if;
  if not exists (select 1 from public.get_private_past_paper_question('synthetic-smoke-q1') where pairing_status='paired' and marks=2) then
    raise exception 'exact marking question not found';
  end if;
  if exists (select 1 from public.get_private_past_paper_question('synthetic-smoke-q3')) then
    raise exception 'visual question entered text-only marking';
  end if;
  if not exists (select 1 from public.get_private_past_paper_asset('synthetic-smoke-q3') where storage_path='physics/synthetic-smoke-qp.pdf' and page_start=2) then
    raise exception 'PDF asset provenance not found';
  end if;
  if not exists (select 1 from public.list_private_study_sources('physics') where source_id='synthetic-smoke-qp' and question_count=3 and paired_question_count=2 and visual_dependent_question_count=1) then
    raise exception 'source catalog counts are wrong';
  end if;

  perform public.record_private_learning_attempt(student,attempt,mastery);
  if not exists (select 1 from public.get_private_learning_progress(student,'physics') where attempt_count=1 and misconception_tags=array['units']) then
    raise exception 'saved attempt not reflected in mastery';
  end if;
  if exists (select 1 from public.get_private_learning_progress(other_student,'physics')) then
    raise exception 'learner data crossed student boundaries';
  end if;

  begin
    perform public.record_private_learning_attempt(student,attempt || '{"past_paper_question_id":"synthetic-smoke-q2"}'::jsonb,mastery);
    raise exception 'expected unpaired-question rejection';
  exception when raise_exception then
    if sqlerrm not like '%paired official markscheme%' then raise; end if;
  end;
  begin
    perform public.record_private_learning_attempt(student,attempt || '{"maximum_marks":3}'::jsonb,mastery);
    raise exception 'expected wrong-mark-total rejection';
  exception when raise_exception then
    if sqlerrm not like '%maximum marks do not match%' then raise; end if;
  end;
end;
$$;

reset role;
rollback;
