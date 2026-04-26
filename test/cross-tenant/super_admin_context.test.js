// MADG MES — Cross-tenant RLS: tabela super_admin_context
//
// Policy unica (ALL ops):
//   user_id = auth.uid() AND is_super_admin()
//
// Significado:
//   - Regular user nao satisfaz is_super_admin() → bloqueado em tudo
//   - Super-admin so' acessa a propria row (user_id = auth.uid)
//   - super_admin_context e' onde "impersonacao" se materializa: super-admin
//     popula selected_empresa_id, dai auth_empresa_id() retorna esse valor
//     em vez de null

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  isSupabaseRunning,
  createUserClient,
  createServiceClient,
  SEED_IDS,
  EMAILS,
  setSuperAdminContext,
} from '../helpers/supabase-clients.js';

const supabaseRunning = await isSupabaseRunning();

describe.skipIf(!supabaseRunning)('cross-role — super_admin_context', () => {
  let userA;
  let superClient;
  let serviceClient;

  beforeAll(async () => {
    userA = await createUserClient(EMAILS.divinissimo);
    superClient = await createUserClient(EMAILS.superAdmin);
    serviceClient = await createServiceClient();
  });

  afterAll(async () => {
    // Limpa context do super-admin (deixa NULL pra nao poluir outros tests)
    try { await setSuperAdminContext(superClient, null); } catch {}
    await userA?.auth.signOut();
    await superClient?.auth.signOut();
  });

  beforeEach(async () => {
    // Reset context entre tests pra cada case partir do zero
    try { await setSuperAdminContext(superClient, null); } catch {}
  });

  describe('SELECT', () => {
    it('ground truth: service_role ve super_admin_context (vazio inicialmente)', async () => {
      const { data, error } = await serviceClient
        .from('super_admin_context')
        .select('user_id, selected_empresa_id');

      expect(error).toBeNull();
      // Policy beforeEach acabou de limpar, deve estar vazio ou com selected_empresa_id=null
      const superRow = data.find(r => r.user_id === SEED_IDS.users.superAdmin);
      if (superRow) {
        expect(superRow.selected_empresa_id).toBeNull();
      }
    });

    it('regular user NAO ve super_admin_context (gate is_super_admin)', async () => {
      const { data, error } = await userA
        .from('super_admin_context')
        .select('*');

      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it('super-admin com context populado ve a propria row', async () => {
      await setSuperAdminContext(superClient, SEED_IDS.empresas.colortech);

      const { data, error } = await superClient
        .from('super_admin_context')
        .select('user_id, selected_empresa_id');

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data[0].user_id).toBe(SEED_IDS.users.superAdmin);
      expect(data[0].selected_empresa_id).toBe(SEED_IDS.empresas.colortech);
    });
  });

  describe('INSERT/UPDATE direto', () => {
    it('regular user NAO consegue inserir context (gate)', async () => {
      const { data, error } = await userA
        .from('super_admin_context')
        .insert({
          user_id: SEED_IDS.users.divinissimo,
          selected_empresa_id: SEED_IDS.empresas.colortech,
        })
        .select();

      expect(error).not.toBeNull();
      expect(error.code).toBe('42501');
      expect(data).toBeNull();
    });

    it('regular user NAO consegue inserir context PRO super-admin (hijack)', async () => {
      // Teste de hijack: regular tenta criar context com user_id = super-admin
      const { data, error } = await userA
        .from('super_admin_context')
        .insert({
          user_id: SEED_IDS.users.superAdmin,
          selected_empresa_id: SEED_IDS.empresas.divinissimo,
        })
        .select();

      expect(error).not.toBeNull();
      expect(error.code).toBe('42501');
      expect(data).toBeNull();
    });
  });

  describe('Impersonacao via auth_empresa_id', () => {
    it('super-admin SEM context: auth_empresa_id retorna NULL → ve nada de empresas', async () => {
      // Sem context populado, super-admin nao tem empresa-default
      // (sem user_empresa row). RLS de tabelas tenant filtra tudo.
      const { data, error } = await superClient
        .from('unidades')
        .select('id');

      expect(error).toBeNull();
      // Sem context: auth_empresa_id() = NULL → predicado nao matcha
      expect(data).toEqual([]);
    });

    it('super-admin COM context = colortech: ve unidades da colortech', async () => {
      await setSuperAdminContext(superClient, SEED_IDS.empresas.colortech);

      const { data, error } = await superClient
        .from('unidades')
        .select('id, empresa_id');

      expect(error).toBeNull();
      expect(data.length).toBeGreaterThanOrEqual(2);
      expect(data.every(u => u.empresa_id === SEED_IDS.empresas.colortech)).toBe(true);
    });

    it('super-admin COM context = divinissimo: ve unidades da divinissimo', async () => {
      await setSuperAdminContext(superClient, SEED_IDS.empresas.divinissimo);

      const { data, error } = await superClient
        .from('unidades')
        .select('id, empresa_id');

      expect(error).toBeNull();
      expect(data.length).toBeGreaterThanOrEqual(2);
      expect(data.every(u => u.empresa_id === SEED_IDS.empresas.divinissimo)).toBe(true);
    });
  });
});
