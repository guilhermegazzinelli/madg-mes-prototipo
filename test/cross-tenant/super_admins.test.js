// MADG MES — Cross-tenant RLS: tabela super_admins
//
// Policies (do schema 0000):
//   SELECT: user_id = auth.uid() OR is_super_admin()
//   INSERT: is_super_admin()
//   DELETE: is_super_admin()
//   (NAO ha policy UPDATE — sem reassignar user_id ou criado_por)
//
// Trigger trg_prevent_last_super_admin_delete:
//   Bloqueia DELETE quando count(super_admins) <= 1.
//   Anti-lockout no nivel de DB.

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

describe.skipIf(!supabaseRunning)('cross-role — super_admins', () => {
  let userA;
  let superClient;
  let serviceClient;

  beforeAll(async () => {
    userA = await createUserClient(EMAILS.divinissimo);
    superClient = await createUserClient(EMAILS.superAdmin);
    serviceClient = await createServiceClient();
  });

  afterAll(async () => {
    await userA?.auth.signOut();
    await superClient?.auth.signOut();
  });

  describe('SELECT', () => {
    it('ground truth: service_role ve o super_admin do seed', async () => {
      const { data, error } = await serviceClient
        .from('super_admins')
        .select('user_id');

      expect(error).toBeNull();
      expect(data.length).toBeGreaterThanOrEqual(1);
      expect(data.some(s => s.user_id === SEED_IDS.users.superAdmin)).toBe(true);
    });

    it('regular user NAO ve nenhum super_admin (filter user_id != auth.uid + nao is_super_admin)', async () => {
      const { data, error } = await userA
        .from('super_admins')
        .select('user_id');

      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it('super-admin ve a propria row + outros super-admins (is_super_admin = true)', async () => {
      const { data, error } = await superClient
        .from('super_admins')
        .select('user_id');

      expect(error).toBeNull();
      expect(data.some(s => s.user_id === SEED_IDS.users.superAdmin)).toBe(true);
    });
  });

  describe('INSERT', () => {
    it('regular user NAO consegue se promover a super_admin (42501)', async () => {
      const { data, error } = await userA
        .from('super_admins')
        .insert({ user_id: SEED_IDS.users.divinissimo })
        .select();

      expect(error).not.toBeNull();
      expect(error.code).toBe('42501');
      expect(data).toBeNull();
    });

    it('regular user NAO consegue promover terceiros (42501)', async () => {
      const { data, error } = await userA
        .from('super_admins')
        .insert({ user_id: SEED_IDS.users.colortech })
        .select();

      expect(error).not.toBeNull();
      expect(error.code).toBe('42501');
      expect(data).toBeNull();
    });
  });

  describe('DELETE', () => {
    it('regular user NAO consegue deletar super_admin (silent — RLS USING bloqueia)', async () => {
      const since = new Date();
      const { data, error } = await userA
        .from('super_admins')
        .delete()
        .eq('user_id', SEED_IDS.users.superAdmin)
        .select();

      // Usuario nao tem visibilidade — RLS USING filtra antes do trigger.
      expect(error).toBeNull();
      expect(data).toEqual([]);

      const { data: groundTruth } = await serviceClient
        .from('super_admins')
        .select('user_id')
        .eq('user_id', SEED_IDS.users.superAdmin)
        .single();
      expect(groundTruth.user_id).toBe(SEED_IDS.users.superAdmin);

      const audit = await getAuditSince(serviceClient, since, {
        tabela: 'super_admins', op: 'DELETE',
      });
      // Pode ter audit row de outro test em paralelo, mas nada deste user
      const fromUserA = audit.filter(a => a.user_id === SEED_IDS.users.divinissimo);
      expect(fromUserA).toEqual([]);
    });

    it('anti-lockout: super-admin NAO consegue deletar a si mesmo se for o ultimo (trigger raise)', async () => {
      // Verifica que so' tem 1 super-admin (mesma row do seed).
      const { data: count } = await serviceClient
        .from('super_admins')
        .select('user_id');
      expect(count).toHaveLength(1);

      const { data, error } = await superClient
        .from('super_admins')
        .delete()
        .eq('user_id', SEED_IDS.users.superAdmin)
        .select();

      // Trigger raise EXCEPTION → postgrest mapeia pra erro com SQL state P0001 (RAISE)
      expect(error).not.toBeNull();
      expect(error.message).toMatch(/ultimo super_admin/i);

      // Confirm: row preservada
      const { data: groundTruth } = await serviceClient
        .from('super_admins')
        .select('user_id')
        .eq('user_id', SEED_IDS.users.superAdmin)
        .single();
      expect(groundTruth.user_id).toBe(SEED_IDS.users.superAdmin);
    });
  });
});
