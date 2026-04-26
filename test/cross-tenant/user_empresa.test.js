// MADG MES — Cross-tenant RLS: tabela user_empresa
//
// Policies (do schema 0000):
//   SELECT: user_id = auth.uid() OR is_super_admin()
//   INSERT: is_super_admin()
//   UPDATE: is_super_admin()
//   DELETE: is_super_admin()
//
// Implicacao: user_empresa NAO e' tenant-scoped por empresa_id pra leitura
// — e' user-scoped (cada user so' ve a propria membership). Writes
// exigem super-admin. Cross-tenant aqui = user A querendo ver/mexer
// na membership de user B.

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

describe.skipIf(!supabaseRunning)('cross-tenant — user_empresa', () => {
  let userA;
  let serviceClient;

  beforeAll(async () => {
    userA = await createUserClient(EMAILS.divinissimo);
    serviceClient = await createServiceClient();
  });

  afterAll(async () => {
    await userA?.auth.signOut();
  });

  beforeEach(async () => {
    await cleanAuditLog(serviceClient);
  });

  describe('SELECT', () => {
    it('ground truth: service_role ve membership do user B (colortech)', async () => {
      const { data, error } = await serviceClient
        .from('user_empresa')
        .select('user_id, empresa_id, papel')
        .eq('user_id', SEED_IDS.users.colortech);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data[0].empresa_id).toBe(SEED_IDS.empresas.colortech);
      expect(data[0].papel).toBe('admin');
    });

    it('user A ve a propria membership', async () => {
      const { data, error } = await userA
        .from('user_empresa')
        .select('user_id, empresa_id, papel')
        .eq('user_id', SEED_IDS.users.divinissimo);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data[0].empresa_id).toBe(SEED_IDS.empresas.divinissimo);
    });

    it('user A NAO ve membership de user B (silent filter)', async () => {
      const { data, error } = await userA
        .from('user_empresa')
        .select('user_id, empresa_id')
        .eq('user_id', SEED_IDS.users.colortech);

      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it('user A listing geral retorna apenas a propria row', async () => {
      const { data, error } = await userA
        .from('user_empresa')
        .select('user_id');

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data[0].user_id).toBe(SEED_IDS.users.divinissimo);
    });
  });

  describe('INSERT', () => {
    it('user A NAO consegue se auto-vincular a empresa B (gate is_super_admin)', async () => {
      const since = new Date();
      const { data, error } = await userA
        .from('user_empresa')
        .insert({
          user_id: SEED_IDS.users.divinissimo,
          empresa_id: SEED_IDS.empresas.colortech,
          papel: 'admin',
        })
        .select();

      expect(error).not.toBeNull();
      expect(error.code).toBe('42501');
      expect(data).toBeNull();

      const audit = await getAuditSince(serviceClient, since, { tabela: 'user_empresa', op: 'INSERT' });
      expect(audit).toEqual([]);
    });

    it('user A NAO consegue criar membership para outro user', async () => {
      const since = new Date();
      const { data, error } = await userA
        .from('user_empresa')
        .insert({
          user_id: SEED_IDS.users.metalurgica,
          empresa_id: SEED_IDS.empresas.divinissimo,
          papel: 'admin',
        })
        .select();

      expect(error).not.toBeNull();
      expect(error.code).toBe('42501');
      expect(data).toBeNull();

      const audit = await getAuditSince(serviceClient, since, { tabela: 'user_empresa' });
      expect(audit).toEqual([]);
    });
  });

  describe('UPDATE', () => {
    it('user A NAO consegue mudar o proprio papel (gate is_super_admin)', async () => {
      const since = new Date();
      const { data, error } = await userA
        .from('user_empresa')
        .update({ papel: 'visualizador' })
        .eq('user_id', SEED_IDS.users.divinissimo)
        .select();

      // Sem policy de UPDATE pra papel=user — silent (sem erro, 0 rows).
      // Confirma que mesmo a propria row e' read-only sem super-admin.
      expect(error).toBeNull();
      expect(data).toEqual([]);

      const { data: groundTruth } = await serviceClient
        .from('user_empresa')
        .select('papel')
        .eq('user_id', SEED_IDS.users.divinissimo)
        .single();
      expect(groundTruth.papel).toBe('admin');

      const audit = await getAuditSince(serviceClient, since, { tabela: 'user_empresa', op: 'UPDATE' });
      expect(audit).toEqual([]);
    });

    it('user A NAO consegue mudar papel de user B (silent)', async () => {
      const since = new Date();
      const { data, error } = await userA
        .from('user_empresa')
        .update({ papel: 'visualizador' })
        .eq('user_id', SEED_IDS.users.colortech)
        .select();

      expect(error).toBeNull();
      expect(data).toEqual([]);

      const { data: groundTruth } = await serviceClient
        .from('user_empresa')
        .select('papel')
        .eq('user_id', SEED_IDS.users.colortech)
        .single();
      expect(groundTruth.papel).toBe('admin');

      const audit = await getAuditSince(serviceClient, since, { tabela: 'user_empresa', op: 'UPDATE' });
      expect(audit).toEqual([]);
    });
  });

  describe('DELETE', () => {
    it('user A NAO consegue se desvincular da propria empresa', async () => {
      const since = new Date();
      const { data, error } = await userA
        .from('user_empresa')
        .delete()
        .eq('user_id', SEED_IDS.users.divinissimo)
        .select();

      expect(error).toBeNull();
      expect(data).toEqual([]);

      const { data: groundTruth } = await serviceClient
        .from('user_empresa')
        .select('user_id')
        .eq('user_id', SEED_IDS.users.divinissimo)
        .single();
      expect(groundTruth.user_id).toBe(SEED_IDS.users.divinissimo);

      const audit = await getAuditSince(serviceClient, since, { tabela: 'user_empresa', op: 'DELETE' });
      expect(audit).toEqual([]);
    });

    it('user A NAO consegue deletar membership de user B (silent)', async () => {
      const since = new Date();
      const { data, error } = await userA
        .from('user_empresa')
        .delete()
        .eq('user_id', SEED_IDS.users.colortech)
        .select();

      expect(error).toBeNull();
      expect(data).toEqual([]);

      const { data: groundTruth } = await serviceClient
        .from('user_empresa')
        .select('user_id')
        .eq('user_id', SEED_IDS.users.colortech)
        .single();
      expect(groundTruth.user_id).toBe(SEED_IDS.users.colortech);

      const audit = await getAuditSince(serviceClient, since, { tabela: 'user_empresa' });
      expect(audit).toEqual([]);
    });
  });
});
