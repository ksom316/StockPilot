-- Restore the authenticated execution boundary for Finance mutations.
-- The function bodies continue to enforce active owner/manager membership and
-- the enabled Expenses module through private.has_finance_access().
grant execute on function public.create_expense(uuid, uuid, numeric, date, text, text) to authenticated;
grant execute on function public.update_expense(uuid, uuid, numeric, date, text, text) to authenticated;
grant execute on function public.void_expense(uuid, text) to authenticated;
