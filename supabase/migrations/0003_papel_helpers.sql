-- ============================================================
-- Migration: 0003_papel_helpers
--
-- ESCOPO: helpers SQL pra permissionamento por papel (preparatorio).
--
-- Funcoes:
--   - current_user_papel() -> text — devolve papel do user logado na
--     empresa atual (auth_empresa_id). NULL pra super_admin sem context.
--   - is_admin_da_empresa() -> boolean — true se user logado e' admin
--     na empresa atual. Usado em RPCs empresa-level (proxima migration)
--     pra gate de cadastro/remocao de usuarios.
--
-- Esta migration NAO altera nenhuma policy RLS — so adiciona helpers.
-- Hard permissionamento (policies UPDATE/DELETE por papel) vem em
-- migration 0005 separada, com cross-tenant tests atualizados antes.
-- ============================================================

SET statement_timeout = 0;
SET client_encoding = 'UTF8';

-- ============================================================
-- current_user_papel(): papel do user logado na empresa atual
-- ============================================================
-- Lookup: user_empresa.papel WHERE user_id = auth.uid AND empresa_id = auth_empresa_id.
-- Para super_admin com context populado: tenta tambem buscar via
-- user_empresa, mas caira em NULL se super-admin nao tiver vinculo
-- explicito (e nao tem por design — super-admin transcende empresas).
--
-- Retornos possiveis: 'admin' | 'gestor' | 'operador' | 'visualizador' | NULL
CREATE OR REPLACE FUNCTION public.current_user_papel() RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = 'public', 'pg_temp'
AS $$
  SELECT papel
    FROM user_empresa
   WHERE user_id    = auth.uid()
     AND empresa_id = auth_empresa_id()
   LIMIT 1;
$$;

ALTER FUNCTION public.current_user_papel() OWNER TO postgres;

-- ============================================================
-- is_admin_da_empresa(): user logado e admin na empresa atual?
-- ============================================================
-- Combina is_super_admin (super tem todos os privilegios via context)
-- com check explicito de papel='admin'.
--
-- Usado em RPCs empresa-level pra autorizar cadastro/remocao de
-- usuarios SEM precisar do super-admin global.
CREATE OR REPLACE FUNCTION public.is_admin_da_empresa() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = 'public', 'pg_temp'
AS $$
  SELECT
    public.is_super_admin()
    OR public.current_user_papel() = 'admin';
$$;

ALTER FUNCTION public.is_admin_da_empresa() OWNER TO postgres;

-- ============================================================
-- Verificacao pos-aplicacao:
--   SELECT current_user_papel();      -- NULL se nao logado / super sem context
--   SELECT is_admin_da_empresa();     -- false se nao logado
-- ============================================================
