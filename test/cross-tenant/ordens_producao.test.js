// MADG MES — Cross-tenant RLS: tabela ordens_producao
//
// Policies (do schema 0000) — nested 1-level via unidades:
//   SELECT/INSERT/UPDATE/DELETE: unidade_id IN
//     (SELECT id FROM unidades WHERE empresa_id = auth_empresa_id())

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

describe.skipIf(!supabaseRunning)('cross-tenant — ordens_producao', () => {
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
    it('ground truth: service_role ve ordem anchor da empresa B', async () => {
      const { data, error } = await serviceClient
        .from('ordens_producao')
        .select('id, unidade_id, data')
        .eq('id', SEED_IDS.ordens.colortechAnchor);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data[0].unidade_id).toBe(SEED_IDS.unidades.colortechMoagem);
    });

    it('user A ve ordens das proprias unidades', async () => {
      const { data, error } = await userA
        .from('ordens_producao')
        .select('id, unidade_id');

      expect(error).toBeNull();
      expect(data.length).toBeGreaterThanOrEqual(5); // divinissimo tem 9 ordens
      const validUnidades = [
        SEED_IDS.unidades.divinissimoPDQ,
        SEED_IDS.unidades.divinissimoSalgados,
      ];
      expect(data.every(o => validUnidades.includes(o.unidade_id))).toBe(true);
    });

    it('user A NAO ve ordem da empresa B (silent filter)', async () => {
      const { data, error } = await userA
        .from('ordens_producao')
        .select('id')
        .eq('id', SEED_IDS.ordens.colortechAnchor);

      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });

  describe('INSERT', () => {
    it('user A consegue criar ordem em unidade propria', async () => {
      const since = new Date();
      const { data, error } = await userA
        .from('ordens_producao')
        .insert({
          unidade_id: SEED_IDS.unidades.divinissimoPDQ,
          linha_id:   SEED_IDS.linhas.divinissimoPDQ,
          produto_id: SEED_IDS.produtos.divinissimoPDQHoraForno,
          data: '2026-04-26',
          hora_inicio: '06:00',
          hora_fim: '14:00',
          velocidade_padrao: 1441,
          tempo_planejado: 60,
          qtd_produzida: 1000,
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.unidade_id).toBe(SEED_IDS.unidades.divinissimoPDQ);

      const audit = await getAuditSince(serviceClient, since, {
        tabela: 'ordens_producao', op: 'INSERT', record_id: data.id,
      });
      expect(audit).toHaveLength(1);
      expect(audit[0].user_id).toBe(SEED_IDS.users.divinissimo);

      await serviceClient.from('ordens_producao').delete().eq('id', data.id);
    });

    it('user A NAO consegue criar ordem em unidade da empresa B (42501)', async () => {
      const { data, error } = await userA
        .from('ordens_producao')
        .insert({
          unidade_id: SEED_IDS.unidades.colortechDispersao,
          linha_id:   SEED_IDS.linhas.colortechD01,
          produto_id: SEED_IDS.produtos.colortechPigmentoAzul,
          data: '2026-04-26',
          hora_inicio: '06:00',
          hora_fim: '14:00',
          velocidade_padrao: 100,
        })
        .select();

      expect(error).not.toBeNull();
      expect(error.code).toBe('42501');
      expect(data).toBeNull();
    });
  });

  describe('UPDATE', () => {
    it('user A NAO consegue atualizar ordem da empresa B (silent)', async () => {
      const since = new Date();
      const target = SEED_IDS.ordens.colortechAnchor;
      const { data, error } = await userA
        .from('ordens_producao')
        .update({ qtd_produzida: 0 })
        .eq('id', target)
        .select();

      expect(error).toBeNull();
      expect(data).toEqual([]);

      const { data: groundTruth } = await serviceClient
        .from('ordens_producao')
        .select('qtd_produzida')
        .eq('id', target)
        .single();
      expect(Number(groundTruth.qtd_produzida)).toBe(395);

      const audit = await getAuditSince(serviceClient, since, {
        tabela: 'ordens_producao', op: 'UPDATE', record_id: target,
      });
      expect(audit).toEqual([]);
    });
  });

  describe('DELETE', () => {
    it('user A NAO consegue deletar ordem da empresa B (silent)', async () => {
      const since = new Date();
      const target = SEED_IDS.ordens.colortechAnchor;
      const { data, error } = await userA
        .from('ordens_producao')
        .delete()
        .eq('id', target)
        .select();

      expect(error).toBeNull();
      expect(data).toEqual([]);

      const { data: groundTruth } = await serviceClient
        .from('ordens_producao')
        .select('id')
        .eq('id', target)
        .single();
      expect(groundTruth.id).toBe(target);

      const audit = await getAuditSince(serviceClient, since, {
        tabela: 'ordens_producao', op: 'DELETE', record_id: target,
      });
      expect(audit).toEqual([]);
    });
  });
});
