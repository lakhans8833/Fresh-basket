-- Production-readiness audit (4 Nov 2026), part 1 — RECONCILED 5 Nov 2026.
--
-- This branch originally created public.stock_movements and public.admin_audit_log here. Before it was
-- merged, the same two tables (same names, different columns) went live with
-- 20261105000001_admin_audit_log_and_stock_ledger.sql (PR #36). Creating them here as well would leave a
-- database with whichever shape ran first and a stock trigger writing columns that don't exist (every
-- order would fail). So this file now only adds the helper below; the tables come from 20261105000001 and
-- 20261105000002 adds what this branch needs on top (order id per movement, labels, stricter grants).
-- This file was never applied to the production database (the branch wasn't merged; preview builds don't
-- migrate), so changing it is safe.

-- Reads a transaction-local uuid label; a malformed value is ignored rather than failing the stock change.
create or replace function public.fb_setting_uuid(p_name text) returns uuid
language plpgsql stable set search_path = public as $$
declare v text := nullif(current_setting(p_name, true), '');
begin
  return v::uuid;
exception when invalid_text_representation then
  return null;
end $$;
revoke all on function public.fb_setting_uuid(text) from public, anon, authenticated;

-- Rollback: drop function if exists public.fb_setting_uuid(text);
