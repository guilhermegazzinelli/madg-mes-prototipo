// MADG MES — Cross-tenant RLS: tabela turnos
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

describe.skipIf(!supabaseRunning)('cross-tenant — turnos', () => {
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
    it('ground truth: service_role ve turno da empresa B', async () => {
      const { data, error } = await serviceClient
        .from('turnos')
        .select('id, unidade_id, nome')
        .eq('id', SEED_IDS.turnos.colortech1oTurno);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data[0].unidade_id).toBe(SEED_IDS.unidades.colortechDispersao);
    });

    it('user A ve turnos das proprias unidades', async () => {
      const { data, error } = await userA
        .from('turnos')
        .select('id, unidade_id');

      expect(error).toBeNull();
      expect(data.length).toBeGreaterThanOrEqual(2);
      const validUnidades = [
        SEED_IDS.unidades.divinissimoPDQ,
        SEED_IDS.unidades.divinissimoSalgados,
      ];
      expect(data.every(t => validUnidades.includes(t.unidade_id))).toBe(true);
    });

    it('user A NAO ve turno da empresa B (silent filter)', async () => {
      const { data, error } = await userA
        .from('turnos')
        .select('id, nome')
        .eq('id', SEED_IDS.turnos.colortech1oTurno);

      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });

  describe('INSERT', () => {
    it('user A consegue criar turno em unidade propria', async () => {
      const since = new Date();
      const { data, error } = await userA
        .from('turnos')
        .insert({
          unidade_id: SEED_IDS.unidades.divinissimoPDQ,
          nome: 'Test fixture turno',
          hora_inicio: '14:00',
          hora_fim: '22:00',
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.unidade_id).toBe(SEED_IDS.unidades.divinissimoPDQ);

      const audit = await getAuditSince(serviceClient, since, {
        tabela: 'turnos', op: 'INSERT', record_id: data.id,
      });
      expect(audit).toHaveLength(1);
      expect(audit[0].user_id).toBe(SEED_IDS.users.divinissimo);

      await serviceClient.from('turnos').delete().eq('id', data.id);
    });

    it('user A NAO consegue criar turno em unidade da empresa B (42501)', async () => {
      const { data, error } = await userA
        .from('turnos')
        .insert({
          unidade_id: SEED_IDS.unidades.colortechDispersao,
          nome: 'Hijack turno',
          hora_inicio: '06:00',
          hora_fim: '14:00',
        })
        .select();

      expect(error).not.toBeNull();
      expect(error.code).toBe('42501');
      expect(data).toBeNull();
    });
  });

  describe('UPDATE', () => {
    it('user A NAO consegue atualizar turno da empresa B (silent)', async () => {
      const since = new Date();
      const target = SEED_IDS.turnos.colortech1oTurno;
      const { data, error } = await userA
        .from('turnos')
        .update({ nome: 'Hijack' })
        .eq('id', target)
        .select();

      expect(error).toBeNull();
      expect(data).toEqual([]);

      const { data: groundTruth } = await serviceClient
        .from('turnos')
        .select('nome')
        .eq('id', target)
        .single();
      expect(groundTruth.nome).toBe('1o Turno');

      const audit = await getAuditSince(serviceClient, since, {
        tabela: 'turnos', op: 'UPDATE', record_id: target,
      });
      expect(audit).toEqual([]);
    });
  });

  describe('DELETE', () => {
    it('user A NAO consegue deletar turno da empresa B (silent)', async () => {
      const since = new Date();
      const target = SEED_IDS.turnos.colortech1oTurno;
      const { data, error } = await userA
        .from('turnos')
        .delete()
        .eq('id', target)
        .select();

      expect(error).toBeNull();
      expect(data).toEqual([]);

      const { data: groundTruth } = await serviceClient
        .from('turnos')
        .select('id')
        .eq('id', target)
        .single();
      expect(groundTruth.id).toBe(target);

      const audit = await getAuditSince(serviceClient, since, {
        tabela: 'turnos', op: 'DELETE', record_id: target,
      });
      expect(audit).toEqual([]);
    });
  });
});
