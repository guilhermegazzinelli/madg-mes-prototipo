// MADG MES — Cross-tenant RLS: tabela linhas
//
// Policies (do schema 0000) — nested 1-level via unidades:
//   SELECT/INSERT/UPDATE/DELETE: unidade_id IN
//     (SELECT id FROM unidades WHERE empresa_id = auth_empresa_id())
//
// Cross-tenant: user A tentando referenciar unidade_id da empresa B
// faz a subquery retornar vazia, predicado falha → silent ou 42501.

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

describe.skipIf(!supabaseRunning)('cross-tenant — linhas', () => {
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
    it('ground truth: service_role ve linha da empresa B', async () => {
      const { data, error } = await serviceClient
        .from('linhas')
        .select('id, unidade_id, nome')
        .eq('id', SEED_IDS.linhas.colortechD01);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data[0].unidade_id).toBe(SEED_IDS.unidades.colortechDispersao);
    });

    it('user A ve linhas das proprias unidades', async () => {
      const { data, error } = await userA
        .from('linhas')
        .select('id, unidade_id');

      expect(error).toBeNull();
      expect(data.length).toBeGreaterThanOrEqual(6); // divinissimo tem 6 linhas
      // Todas pertencem a unidades de divinissimo (10000000-...0001 ou 0002)
      const validUnidades = [
        SEED_IDS.unidades.divinissimoPDQ,
        SEED_IDS.unidades.divinissimoSalgados,
      ];
      expect(data.every(l => validUnidades.includes(l.unidade_id))).toBe(true);
    });

    it('user A NAO ve linha da empresa B (silent filter)', async () => {
      const { data, error } = await userA
        .from('linhas')
        .select('id, nome')
        .eq('id', SEED_IDS.linhas.colortechD01);

      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });

  describe('INSERT', () => {
    it('user A consegue criar linha em unidade propria (audit gerado)', async () => {
      const since = new Date();
      const { data, error } = await userA
        .from('linhas')
        .insert({
          unidade_id: SEED_IDS.unidades.divinissimoPDQ,
          nome: 'Test fixture linha',
          descricao: 'Cross-tenant test',
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.unidade_id).toBe(SEED_IDS.unidades.divinissimoPDQ);

      const audit = await getAuditSince(serviceClient, since, {
        tabela: 'linhas', op: 'INSERT', record_id: data.id,
      });
      expect(audit).toHaveLength(1);
      expect(audit[0].user_id).toBe(SEED_IDS.users.divinissimo);
      expect(audit[0].empresa_id).toBe(SEED_IDS.empresas.divinissimo);

      await serviceClient.from('linhas').delete().eq('id', data.id);
    });

    it('user A NAO consegue criar linha em unidade da empresa B (42501)', async () => {
      const { data, error } = await userA
        .from('linhas')
        .insert({
          unidade_id: SEED_IDS.unidades.colortechDispersao,
          nome: 'Hijack linha',
        })
        .select();

      expect(error).not.toBeNull();
      expect(error.code).toBe('42501');
      expect(data).toBeNull();
    });
  });

  describe('UPDATE', () => {
    it('user A NAO consegue atualizar linha da empresa B (silent)', async () => {
      const since = new Date();
      const target = SEED_IDS.linhas.colortechD01;
      const { data, error } = await userA
        .from('linhas')
        .update({ nome: 'Hijack' })
        .eq('id', target)
        .select();

      expect(error).toBeNull();
      expect(data).toEqual([]);

      const { data: groundTruth } = await serviceClient
        .from('linhas')
        .select('nome')
        .eq('id', target)
        .single();
      expect(groundTruth.nome).toBe('Dispersor D-01');

      const audit = await getAuditSince(serviceClient, since, {
        tabela: 'linhas', op: 'UPDATE', record_id: target,
      });
      expect(audit).toEqual([]);
    });
  });

  describe('DELETE', () => {
    it('user A NAO consegue deletar linha da empresa B (silent)', async () => {
      const since = new Date();
      const target = SEED_IDS.linhas.colortechD01;
      const { data, error } = await userA
        .from('linhas')
        .delete()
        .eq('id', target)
        .select();

      expect(error).toBeNull();
      expect(data).toEqual([]);

      const { data: groundTruth } = await serviceClient
        .from('linhas')
        .select('id')
        .eq('id', target)
        .single();
      expect(groundTruth.id).toBe(target);

      const audit = await getAuditSince(serviceClient, since, {
        tabela: 'linhas', op: 'DELETE', record_id: target,
      });
      expect(audit).toEqual([]);
    });
  });
});
