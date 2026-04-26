-- ============================================================
-- ROLLBACK: migration 0001_audit_log
--
-- USAR APENAS SE: triggers AFTER causarem erro em mutacao de prod e
-- precisar reverter rapido. NAO aplicar preventivamente.
--
-- Como aplicar (via psql, NAO via supabase db reset):
--   psql "postgresql://postgres:SENHA@db.PROJECT-REF.supabase.co:5432/postgres" \
--        -f scripts/rollback-0001-audit-log.sql
--
-- Ordem importa: drop triggers ANTES de drop function (FK do trigger
-- pra function); drop function ANTES de drop table audit_log (function
-- referencia a tabela); drop table por ultimo.
--
-- Effect: as 12 tabelas mutaveis voltam a NAO gerar audit row em
-- writes. Trail historico (rows ja existentes em audit_log) e' perdido
-- com o DROP TABLE — backup recomendado se quer preservar.
--
-- Idempotente: usa IF EXISTS em todos drops.
-- ============================================================

BEGIN;

-- 1. Drop dos 12 triggers AFTER
DROP TRIGGER IF EXISTS trg_audit_empresa             ON public.empresa;
DROP TRIGGER IF EXISTS trg_audit_user_empresa        ON public.user_empresa;
DROP TRIGGER IF EXISTS trg_audit_super_admins        ON public.super_admins;
DROP TRIGGER IF EXISTS trg_audit_super_admin_context ON public.super_admin_context;
DROP TRIGGER IF EXISTS trg_audit_unidades            ON public.unidades;
DROP TRIGGER IF EXISTS trg_audit_linhas              ON public.linhas;
DROP TRIGGER IF EXISTS trg_audit_produtos            ON public.produtos;
DROP TRIGGER IF EXISTS trg_audit_taxas_producao      ON public.taxas_producao;
DROP TRIGGER IF EXISTS trg_audit_motivos_parada      ON public.motivos_parada;
DROP TRIGGER IF EXISTS trg_audit_turnos              ON public.turnos;
DROP TRIGGER IF EXISTS trg_audit_ordens_producao     ON public.ordens_producao;
DROP TRIGGER IF EXISTS trg_audit_paradas             ON public.paradas;

-- 2. Drop function log_audit (depende de audit_log, drop antes da tabela)
DROP FUNCTION IF EXISTS public.log_audit();

-- 3. Drop tabela audit_log (cascata limpa policies + indexes + FK)
DROP TABLE IF EXISTS public.audit_log;

-- 4. Marcar migration como NAO aplicada (pra supabase CLI nao tentar
--    reverter de novo numa proxima vez)
DELETE FROM supabase_migrations.schema_migrations
 WHERE version = '0001';

COMMIT;

-- ============================================================
-- Verificacao pos-rollback:
--   SELECT trigger_name FROM information_schema.triggers
--    WHERE trigger_name LIKE 'trg_audit_%';   -- 0 rows
--   SELECT to_regclass('public.audit_log');   -- NULL
--   SELECT to_regproc('public.log_audit');    -- NULL
-- ============================================================
