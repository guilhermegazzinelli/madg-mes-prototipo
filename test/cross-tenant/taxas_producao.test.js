// MADG MES — Cross-tenant RLS: tabela taxas_producao
//
// Policies (do schema 0000) — nested 1-level via produtos:
//   SELECT/INSERT/UPDATE/DELETE: produto_id IN
//     (SELECT id FROM produtos WHERE empresa_id = auth_empresa_id())
//
// Constraint: UNIQUE (produto_id, linha_id) — INSERT same-tenant
// precisa de combo nao usado.

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

describe.skipIf(!supabaseRunning)('cross-tenant — taxas_producao', () => {
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
    it('ground truth: service_role ve taxa anchor da empresa B', async () => {
      const { data, error } = await serviceClient
        .from('taxas_producao')
        .select('id, produto_id, velocidade')
        .eq('id', SEED_IDS.taxas.colortechAnchor);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data[0].produto_id).toBe(SEED_IDS.produtos.colortechPigmentoAzul);
    });

    it('user A ve taxas dos proprios produtos', async () => {
      const { data, error } = await userA
        .from('taxas_producao')
        .select('id, produto_id');

      expect(error).toBeNull();
      expect(data.length).toBeGreaterThanOrEqual(5);
    });

    it('user A NAO ve taxa da empresa B (silent filter)', async () => {
      const { data, error } = await userA
        .from('taxas_producao')
        .select('id, velocidade')
        .eq('id', SEED_IDS.taxas.colortechAnchor);

      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });

  describe('INSERT', () => {
    it('user A consegue criar taxa em produto proprio (combo livre)', async () => {
      // produto 0014 (Risole Milho) + linha 0013 (Linha 04) — NAO usado no seed.
      const since = new Date();
      const { data, error } = await userA
        .from('taxas_producao')
        .insert({
          produto_id: '30000000-0000-0000-0000-000000000014',
          linha_id:   '20000000-0000-0000-0000-000000000013',
          velocidade: 9999,
          unidade_velocidade: 'un/h',
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.velocidade).toBe(9999);

      const audit = await getAuditSince(serviceClient, since, {
        tabela: 'taxas_producao', op: 'INSERT', record_id: data.id,
      });
      expect(audit).toHaveLength(1);
      expect(audit[0].user_id).toBe(SEED_IDS.users.divinissimo);

      await serviceClient.from('taxas_producao').delete().eq('id', data.id);
    });

    it('user A NAO consegue criar taxa pra produto da empresa B (42501)', async () => {
      const { data, error } = await userA
        .from('taxas_producao')
        .insert({
          produto_id: SEED_IDS.produtos.colortechPigmentoAzul,
          linha_id:   SEED_IDS.linhas.colortechM01,
          velocidade: 100,
          unidade_velocidade: 'kg/h',
        })
        .select();

      expect(error).not.toBeNull();
      expect(error.code).toBe('42501');
      expect(data).toBeNull();
    });
  });

  describe('UPDATE', () => {
    it('user A NAO consegue atualizar taxa da empresa B (silent)', async () => {
      const since = new Date();
      const target = SEED_IDS.taxas.colortechAnchor;
      const { data, error } = await userA
        .from('taxas_producao')
        .update({ velocidade: 1 })
        .eq('id', target)
        .select();

      expect(error).toBeNull();
      expect(data).toEqual([]);

      const { data: groundTruth } = await serviceClient
        .from('taxas_producao')
        .select('velocidade')
        .eq('id', target)
        .single();
      expect(Number(groundTruth.velocidade)).toBe(85);

      const audit = await getAuditSince(serviceClient, since, {
        tabela: 'taxas_producao', op: 'UPDATE', record_id: target,
      });
      expect(audit).toEqual([]);
    });
  });

  describe('DELETE', () => {
    it('user A NAO consegue deletar taxa da empresa B (silent)', async () => {
      const since = new Date();
      const target = SEED_IDS.taxas.colortechAnchor;
      const { data, error } = await userA
        .from('taxas_producao')
        .delete()
        .eq('id', target)
        .select();

      expect(error).toBeNull();
      expect(data).toEqual([]);

      const { data: groundTruth } = await serviceClient
        .from('taxas_producao')
        .select('id')
        .eq('id', target)
        .single();
      expect(groundTruth.id).toBe(target);

      const audit = await getAuditSince(serviceClient, since, {
        tabela: 'taxas_producao', op: 'DELETE', record_id: target,
      });
      expect(audit).toEqual([]);
    });
  });
});
