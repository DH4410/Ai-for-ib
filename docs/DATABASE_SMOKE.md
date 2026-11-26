# Database smoke checks

The CI database-smoke job starts a fresh disposable PostgreSQL 16 instance
with pgvector, initializes a minimal Supabase-compatible auth schema and
roles, and applies the complete foundation migration in one transaction.
It then exercises the private paper-indexing, retrieval, PDF-provenance,
source-catalog and learner-progress RPCs using synthetic fixtures. Tests
also check that browser roles cannot execute private RPCs.

This is an integration test of the SQL, not a hosted Supabase deployment or
an end-to-end authorization test. It does not reproduce Supabase Auth,
PostgREST or production configuration. No real learner, study paper,
secret or database endpoint is needed. The test fixture transaction rolls
back and the CI service is discarded.

For an actual dedicated project, follow the repository setup instructions
and never run the smoke bootstrap against a live database.
