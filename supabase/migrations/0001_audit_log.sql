-- ============================================================
-- Migration: 0001_audit_log
--
-- ESCOPO:
--   - Tabela audit_log (write-only via trigger, SELECT-only via RLS)
--   - Function log_audit() (SECURITY DEFINER — bypassa RLS pra escrever)
--   - Triggers AFTER INSERT/UPDATE/DELETE em 11 tabelas mutaveis
--
-- POR QUE:
--   - Item 2 do design doc Ship & Harden v1 exige rastreabilidade de
--     escritas por empresa, especialmente pra detectar super-admin
--     impersonando empresa via super_admin_context (acted_as_super_admin)
--   - Cross-tenant tests usam audit_log pra verificar que opera-coes
--     bloqueadas por RLS NAO geram audit row (write nao aconteceu)
--
-- INVARIANTES:
--   - audit_log e' write-only do ponto de vista do usuario:
--       INSERT direto bloqueado (so' a function SECURITY DEFINER escreve)
--       UPDATE/DELETE sem policy = bloqueado pelo FORCE RLS
--   - acted_as_super_admin = true quando is_super_admin() E o user tem
--     super_admin_context.selected_empresa_id populado naquele momento
--   - Se RLS bloqueia o INSERT/UPDATE/DELETE original, AFTER trigger
--     NAO dispara — audit_log so' registra ops que aconteceram de fato
-- ============================================================

SET statement_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET row_security = off;

-- ============================================================
-- TABELA audit_log
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_log (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela                text        NOT NULL,
  record_id             uuid,                       -- PK da row afetada (nullable: tabelas com PK composto)
  op                    text        NOT NULL CHECK (op IN ('INSERT','UPDATE','DELETE')),
  user_id               uuid                        REFERENCES auth.users(id) ON DELETE SET NULL,
  empresa_id            uuid                        REFERENCES public.empresa(id) ON DELETE SET NULL,
  acted_as_super_admin  boolean     NOT NULL DEFAULT false,
  dados_antigos         jsonb,                      -- to_jsonb(OLD); NULL em INSERT
  dados_novos           jsonb,                      -- to_jsonb(NEW); NULL em DELETE
  criado_em             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log OWNER TO postgres;

-- Indexes pros queries comuns
CREATE INDEX IF NOT EXISTS idx_audit_log_empresa_criado    ON public.audit_log (empresa_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_tabela_record     ON public.audit_log (tabela, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_criado       ON public.audit_log (user_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_super_admin       ON public.audit_log (acted_as_super_admin) WHERE acted_as_super_admin = true;

-- RLS: enable + force (rls_auto_enable event trigger ja' faz o ENABLE,
-- mas FORCE precisa ser explicito pra impedir que postgres role bypasse)
ALTER TABLE public.audit_log ENABLE  ROW LEVEL SECURITY;
ALTER TABLE public.audit_log FORCE   ROW LEVEL SECURITY;

-- Apenas SELECT permitido pro usuario; INSERT/UPDATE/DELETE = sem policy = bloqueado pelo FORCE RLS.
-- A function log_audit (SECURITY DEFINER) bypassa isso pra escrever.
CREATE POLICY audit_log_select ON public.audit_log
  FOR SELECT
  USING (empresa_id = auth_empresa_id() OR is_super_admin());

-- ============================================================
-- FUNCTION log_audit (SECURITY DEFINER)
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_audit() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_record_id          uuid;
  v_dados_antigos      jsonb;
  v_dados_novos        jsonb;
  v_acted_as_super     boolean;
  v_user_id            uuid;
  v_empresa_id         uuid;
BEGIN
  v_user_id := auth.uid();

  -- Tabelas tem id (uuid) na maioria; super_admins/super_admin_context
  -- usam user_id como PK; user_empresa tem id proprio.
  -- COALESCE pega id, ou cai pra user_id se nao houver.
  IF TG_OP = 'DELETE' THEN
    v_record_id     := COALESCE((to_jsonb(OLD)->>'id')::uuid, (to_jsonb(OLD)->>'user_id')::uuid);
    v_dados_antigos := to_jsonb(OLD);
    v_dados_novos   := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_record_id     := COALESCE((to_jsonb(NEW)->>'id')::uuid, (to_jsonb(NEW)->>'user_id')::uuid);
    v_dados_antigos := NULL;
    v_dados_novos   := to_jsonb(NEW);
  ELSE  -- UPDATE
    v_record_id     := COALESCE((to_jsonb(NEW)->>'id')::uuid, (to_jsonb(NEW)->>'user_id')::uuid);
    v_dados_antigos := to_jsonb(OLD);
    v_dados_novos   := to_jsonb(NEW);
  END IF;

  -- Empresa do contexto da operacao (super_admin pode ter selected_empresa_id != user_empresa)
  v_empresa_id := auth_empresa_id();

  -- Marca acted_as_super_admin quando o user e' super_admin E tem context populado.
  -- (Super-admin sem context = NULL empresa, nao "agindo como" ninguem.)
  v_acted_as_super := is_super_admin() AND EXISTS (
    SELECT 1
      FROM super_admin_context
     WHERE user_id = v_user_id
       AND selected_empresa_id IS NOT NULL
  );

  INSERT INTO public.audit_log (
    tabela, record_id, op, user_id, empresa_id,
    acted_as_super_admin, dados_antigos, dados_novos
  )
  VALUES (
    TG_TABLE_NAME, v_record_id, TG_OP, v_user_id, v_empresa_id,
    v_acted_as_super, v_dados_antigos, v_dados_novos
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

ALTER FUNCTION public.log_audit() OWNER TO postgres;

-- ============================================================
-- TRIGGERS — 11 tabelas mutaveis
-- ============================================================
-- Pattern: AFTER INSERT OR UPDATE OR DELETE ... FOR EACH ROW
-- AFTER (nao BEFORE) garante que so' loga ops que passaram RLS.
--
-- Ordem alfabetica pra facilitar review.

CREATE TRIGGER trg_audit_empresa
  AFTER INSERT OR UPDATE OR DELETE ON public.empresa
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

CREATE TRIGGER trg_audit_linhas
  AFTER INSERT OR UPDATE OR DELETE ON public.linhas
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

CREATE TRIGGER trg_audit_motivos_parada
  AFTER INSERT OR UPDATE OR DELETE ON public.motivos_parada
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

CREATE TRIGGER trg_audit_ordens_producao
  AFTER INSERT OR UPDATE OR DELETE ON public.ordens_producao
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

CREATE TRIGGER trg_audit_paradas
  AFTER INSERT OR UPDATE OR DELETE ON public.paradas
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

CREATE TRIGGER trg_audit_produtos
  AFTER INSERT OR UPDATE OR DELETE ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

CREATE TRIGGER trg_audit_super_admin_context
  AFTER INSERT OR UPDATE OR DELETE ON public.super_admin_context
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

CREATE TRIGGER trg_audit_super_admins
  AFTER INSERT OR UPDATE OR DELETE ON public.super_admins
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

CREATE TRIGGER trg_audit_taxas_producao
  AFTER INSERT OR UPDATE OR DELETE ON public.taxas_producao
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

CREATE TRIGGER trg_audit_turnos
  AFTER INSERT OR UPDATE OR DELETE ON public.turnos
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

CREATE TRIGGER trg_audit_unidades
  AFTER INSERT OR UPDATE OR DELETE ON public.unidades
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

CREATE TRIGGER trg_audit_user_empresa
  AFTER INSERT OR UPDATE OR DELETE ON public.user_empresa
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

-- ============================================================
-- Verificacao pos-aplicacao:
--   SELECT COUNT(*) FROM audit_log;       -> 0 (vazio inicialmente)
--   SELECT trigger_name FROM information_schema.triggers
--    WHERE trigger_name LIKE 'trg_audit_%';  -> 12 triggers
-- ============================================================
