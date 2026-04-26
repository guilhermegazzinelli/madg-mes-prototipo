// MADG MES — Cross-tenant RLS: tabela motivos_parada
//
// Policies (do schema 0000):
//   SELECT/INSERT/UPDATE/DELETE: empresa_id = auth_empresa_id()

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  isSupabaseRunning,
  createUserClient,
  createServiceClient,
  SEED_IDS,
  EMAILS,
  cleanAuditLog,
  getAuditSince,
} from '../helpers/supabase-clients.js';

const supabaseRunning = await isSupabaseRunning();

describe.skipIf(!supabaseRunning)('cross-tenant — motivos_parada', () => {
  let userA;
  let serviceClient;

  beforeAll(async () => {
    userA = await createUserClient(EMAILS.divinissimo);
    serviceClient = await createServiceClient();
  });

  afterAll(async () => {
    await userA?.auth.signOut();
  });

  // Filtragem por record_id em vez de cleanAuditLog beforeEach.

  describe('SELECT', () => {
    it('ground truth: service_role ve motivo da empresa B (colortech)', async () => {
      // Colortech motivos sao auto-id, busca por nome
      const { data, error } = await serviceClient
        .from('motivos_parada')
        .select('id, nome, empresa_id')
        .eq('empresa_id', SEED_IDS.empresas.colortech)
        .limit(1);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data[0].empresa_id).toBe(SEED_IDS.empresas.colortech);
    });

    it('user A ve motivos da propria empresa (10 da divinissimo)', async () => {
      const { data, error } = await userA
        .from('motivos_parada')
        .select('id, empresa_id');

      expect(error).toBeNull();
      expect(data.length).toBeGreaterThanOrEqual(10);
      expect(data.every(m => m.empresa_id === SEED_IDS.empresas.divinissimo)).toBe(true);
    });

    it('user A NAO ve motivo da empresa B (filtro por id estavel)', async () => {
      // Stable IDs sao apenas pra divinissimo (40000000-...0001..0010).
      // Cross-tenant: querying esse ID nao retorna pra colortech (eh divinissimo).
      // Pra cross-tenant query real, busca via empresa_id.
      const { data, error } = await userA
        .from('motivos_parada')
        .select('id')
        .eq('empresa_id', SEED_IDS.empresas.colortech);

      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });

  describe('INSERT', () => {
    it('user A consegue criar motivo na propria empresa', async () => {
      const since = new Date();
      const { data, error } = await userA
        .from('motivos_parada')
        .insert({
          empresa_id: SEED_IDS.empresas.divinissimo,
          nome: 'Test fixture motivo',
          tipo: 'planejada',
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.empresa_id).toBe(SEED_IDS.empresas.divinissimo);

      const audit = await getAuditSince(serviceClient, since, {
        tabela: 'motivos_parada', op: 'INSERT', record_id: data.id,
      });
      expect(audit).toHaveLength(1);
      expect(audit[0].user_id).toBe(SEED_IDS.users.divinissimo);

      await serviceClient.from('motivos_parada').delete().eq('id', data.id);
    });

    it('user A NAO consegue criar motivo pra empresa B (WITH CHECK 42501)', async () => {
      const since = new Date();
      const { data, error } = await userA
        .from('motivos_parada')
        .insert({
          empresa_id: SEED_IDS.empresas.colortech,
          nome: 'Hijack motivo',
          tipo: 'nao_planejada',
        })
        .select();

      expect(error).not.toBeNull();
      expect(error.code).toBe('42501');
      expect(data).toBeNull();

      // INSERT bloqueado em WITH CHECK (42501) — checar audit_log e' redundante.
    });
  });

  describe('UPDATE', () => {
    it('user A NAO consegue atualizar motivo da empresa B (silent)', async () => {
      // Pega um motivo da colortech via service_role pra usar o id real
      const { data: bRow } = await serviceClient
        .from('motivos_parada')
        .select('id, nome')
        .eq('empresa_id', SEED_IDS.empresas.colortech)
        .limit(1)
        .single();

      const since = new Date();
      const { data, error } = await userA
        .from('motivos_parada')
        .update({ nome: 'Hijack' })
        .eq('id', bRow.id)
        .select();

      expect(error).toBeNull();
      expect(data).toEqual([]);

      const { data: groundTruth } = await serviceClient
        .from('motivos_parada')
        .select('nome')
        .eq('id', bRow.id)
        .single();
      expect(groundTruth.nome).toBe(bRow.nome);

      const audit = await getAuditSince(serviceClient, since, {
        tabela: 'motivos_parada', op: 'UPDATE', record_id: bRow.id,
      });
      expect(audit).toEqual([]);
    });
  });

  describe('DELETE', () => {
    it('user A NAO consegue deletar motivo da empresa B (silent)', async () => {
      const { data: bRow } = await serviceClient
        .from('motivos_parada')
        .select('id')
        .eq('empresa_id', SEED_IDS.empresas.colortech)
        .limit(1)
        .single();

      const since = new Date();
      const { data, error } = await userA
        .from('motivos_parada')
        .delete()
        .eq('id', bRow.id)
        .select();

      expect(error).toBeNull();
      expect(data).toEqual([]);

      const { data: groundTruth } = await serviceClient
        .from('motivos_parada')
        .select('id')
        .eq('id', bRow.id)
        .maybeSingle();
      expect(groundTruth?.id).toBe(bRow.id);

      const audit = await getAuditSince(serviceClient, since, {
        tabela: 'motivos_parada', op: 'DELETE', record_id: bRow.id,
      });
      expect(audit).toEqual([]);
    });
  });
});
