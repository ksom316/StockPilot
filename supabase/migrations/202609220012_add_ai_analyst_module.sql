-- PostgreSQL requires a newly added enum value to be committed before it is
-- used by later data changes. The disabled-row backfill is in the next
-- migration for that reason.

alter type public.optional_module add value 'ai_analyst';
