-- ============================================================
-- Migration: 0002_doc_paradas_append_only
--
-- ESCOPO: documentacao apenas — adiciona COMMENTs em paradas
-- explicando a ausencia de policy UPDATE.
--
-- POR QUE:
--   Schema 0000 declara apenas 3 policies em paradas (SELECT, INSERT,
--   DELETE) enquanto outras tenant-scoped tables (unidades, linhas,
--   produtos, taxas_producao, motivos_parada, turnos, ordens_producao)
--   declaram 4 (incluem UPDATE). Tests cross-tenant comprovam que UPDATE
--   em paradas e' silent (FORCE RLS sem policy = bloqueado).
--
--   Investigacao em 2026-04-26 confirmou: e' INTENCIONAL, nao hole.
--   - sql/schema.sql original (pre-Supabase CLI) ja nao tinha policy UPDATE
--   - public/js/pages/paradas.js so' faz select/insert/delete; o botao
--     "Salvar" do modal aciona INSERT (nao UPDATE)
--   - Fluxo do operador: corrigir parada errada = DELETE + INSERT nova
--
-- INVARIANTE: paradas sao append-only por design.
-- Edicao = DELETE + INSERT, preservando audit trail.
-- ============================================================

SET statement_timeout = 0;
SET client_encoding = 'UTF8';

COMMENT ON TABLE public.paradas IS
  'Append-only por design. Edicao = DELETE + INSERT (preserva audit trail). '
  'Sem policy UPDATE no FORCE RLS — UPDATE direto retorna silent (data: [], '
  'sem erro). Ver test/cross-tenant/paradas.test.js + TODO-8 (RESOLVED).';

COMMENT ON POLICY paradas_select ON public.paradas IS
  'Visivel para users da empresa dona da ordem (nested 2-level via ordens -> unidades).';

COMMENT ON POLICY paradas_insert ON public.paradas IS
  'INSERT permitido se ordem pertence a unidade da empresa do user. '
  'Junto com DELETE, e o unico vetor de mutacao — paradas sao append-only.';

COMMENT ON POLICY paradas_delete ON public.paradas IS
  'DELETE permitido para correcao (errar motivo, errar horario). '
  'Combinado com INSERT, substitui UPDATE: deleta a errada e cria a correta.';

-- ============================================================
-- Verificacao pos-aplicacao:
--   psql> \d+ paradas
--     Description: Append-only por design...
--   psql> \dRp+ paradas paradas_select
--     Description: Visivel para users da empresa...
-- ============================================================
