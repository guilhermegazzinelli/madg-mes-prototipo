// MADG MES — Cross-tenant RLS: tabela paradas
//
// Policies (do schema 0000) — nested 2-level via ordens → unidades:
//   SELECT/INSERT/DELETE: ordem_id IN
//     (SELECT id FROM ordens_producao WHERE unidade_id IN
//        (SELECT id FROM unidades WHERE empresa_id = auth_empresa_id()))
//
// DESIGN INTENCIONAL: paradas e' append-only.
// Sem policy UPDATE no FORCE RLS = UPDATE direto retorna silent
// (data: [], sem erro). Edicao = DELETE + INSERT, preservando audit trail.
// Ver migration 0002_doc_paradas_append_only.sql + TODO-8 (RESOLVED).
// public/js/pages/paradas.js confirma o fluxo: so' chama select/insert/delete.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isSupabaseRunning,
  createUserClient,
  createServiceClient,
  SEED_IDS,
  EMAILS,
  getAuditSince,
} from '../helpers/supabase-clients.js';

const supabaseRunning = await isSupabaseRunning();

describe.skipIf(!supabaseRunning)('cross-tenant — paradas', () => {
  let userA;
  let serviceClient;

  beforeAll(async () => {
    userA = await createUserClient(EMAILS.divinissimo);
    serviceClient = await createServiceClient();
  });

  afterAll(async () => {
    await userA?.auth.signOut();
  });

  describe('SELECT', () => {
    it('ground truth: service_role ve parada anchor da empresa B', async () => {
      const { data, error } = await serviceClient
        .from('paradas')
        .select('id, ordem_id, descricao')
        .eq('id', SEED_IDS.paradas.colortechAnchor);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data[0].ordem_id).toBe(SEED_IDS.ordens.colortechAnchor);
    });

    it('user A ve as proprias paradas', async () => {
      const { data, error } = await userA
        .from('paradas')
        .select('id, ordem_id');

      expect(error).toBeNull();
      // Divinissimo tem 2 paradas no seed (anchor + outra)
      expect(data.length).toBeGreaterThanOrEqual(1);
    });

    it('user A NAO ve parada da empresa B (silent filter via 2-level nest)', async () => {
      const { data, error } = await userA
        .from('paradas')
        .select('id, descricao')
        .eq('id', SEED_IDS.paradas.colortechAnchor);

      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });

  describe('INSERT', () => {
    it('user A consegue criar parada em ordem propria', async () => {
      const since = new Date();
      const { data, error } = await userA
        .from('paradas')
        .insert({
          ordem_id:   SEED_IDS.ordens.divinissimoAnchor,
          linha_id:   SEED_IDS.linhas.divinissimoPDQ,
          hora_inicio:'15:00',
          hora_fim:   '15:10',
          motivo_id:  SEED_IDS.motivos.divinissimoQuebra,
          descricao:  'Test fixture parada',
        })
        .select()
        .single();

      expect(error).toBeNull();

      const audit = await getAuditSince(serviceClient, since, {
        tabela: 'paradas', op: 'INSERT', record_id: data.id,
      });
      expect(audit).toHaveLength(1);
      expect(audit[0].user_id).toBe(SEED_IDS.users.divinissimo);

      await serviceClient.from('paradas').delete().eq('id', data.id);
    });

    it('user A NAO consegue criar parada em ordem da empresa B (42501)', async () => {
      const { data, error } = await userA
        .from('paradas')
        .insert({
          ordem_id:   SEED_IDS.ordens.colortechAnchor,
          linha_id:   SEED_IDS.linhas.colortechM01,
          hora_inicio:'09:00',
          hora_fim:   '09:15',
          descricao:  'Hijack parada',
        })
        .select();

      expect(error).not.toBeNull();
      expect(error.code).toBe('42501');
      expect(data).toBeNull();
    });
  });

  describe('UPDATE (append-only by design)', () => {
    it('append-only: user A NAO consegue UPDATE mesmo na propria empresa (silent, by design)', async () => {
      // Sem CREATE POLICY ... FOR UPDATE no schema, FORCE RLS bloqueia.
      // INTENCIONAL: paradas sao append-only. Edicao = DELETE + INSERT.
      const since = new Date();
      const target = SEED_IDS.paradas.divinissimoAnchor;
      const { data, error } = await userA
        .from('paradas')
        .update({ descricao: 'Tentativa de UPDATE' })
        .eq('id', target)
        .select();

      expect(error).toBeNull();
      expect(data).toEqual([]);

      const { data: groundTruth } = await serviceClient
        .from('paradas')
        .select('descricao')
        .eq('id', target)
        .single();
      expect(groundTruth.descricao).toContain('quebra rolamento');

      const audit = await getAuditSince(serviceClient, since, {
        tabela: 'paradas', op: 'UPDATE', record_id: target,
      });
      expect(audit).toEqual([]);
    });

    it('append-only: UPDATE cross-tenant em parada da empresa B tambem silent', async () => {
      const since = new Date();
      const target = SEED_IDS.paradas.colortechAnchor;
      const { data, error } = await userA
        .from('paradas')
        .update({ descricao: 'Hijack' })
        .eq('id', target)
        .select();

      expect(error).toBeNull();
      expect(data).toEqual([]);

      const audit = await getAuditSince(serviceClient, since, {
        tabela: 'paradas', op: 'UPDATE', record_id: target,
      });
      expect(audit).toEqual([]);
    });
  });

  describe('DELETE', () => {
    it('user A NAO consegue deletar parada da empresa B (silent)', async () => {
      const since = new Date();
      const target = SEED_IDS.paradas.colortechAnchor;
      const { data, error } = await userA
        .from('paradas')
        .delete()
        .eq('id', target)
        .select();

      expect(error).toBeNull();
      expect(data).toEqual([]);

      const { data: groundTruth } = await serviceClient
        .from('paradas')
        .select('id')
        .eq('id', target)
        .single();
      expect(groundTruth.id).toBe(target);

      const audit = await getAuditSince(serviceClient, since, {
        tabela: 'paradas', op: 'DELETE', record_id: target,
      });
      expect(audit).toEqual([]);
    });
  });
});
