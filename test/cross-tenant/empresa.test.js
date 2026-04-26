// MADG MES — Cross-tenant RLS: tabela empresa
//
// Policies (do schema 0000):
//   SELECT: id = auth_empresa_id() OR is_super_admin()
//   INSERT: is_super_admin()
//   UPDATE: is_super_admin()
//   DELETE: is_super_admin()
//
// Pattern: empresa-A logado = divinissimo, empresa-B alvo = colortech.
// Cross-tenant = user A tentando ver/mexer em empresa B.

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

describe.skipIf(!supabaseRunning)('cross-tenant — empresa', () => {
  let userA;        // divinissimo (regular user)
  let serviceClient;

  beforeAll(async () => {
    userA = await createUserClient(EMAILS.divinissimo);
    serviceClient = await createServiceClient();
  });

  afterAll(async () => {
    await userA?.auth.signOut();
  });

  // Sem cleanAuditLog beforeEach: filtragem por record_id/tabela escopa
  // cada case sem precisar limpar audit log global (que rebentaria
  // tests rodando em paralelo de outros arquivos).

  // ------------------------------------------------------------
  // SELECT
  // ------------------------------------------------------------
  describe('SELECT', () => {
    it('ground truth: service_role ve empresa B (colortech)', async () => {
      const { data, error } = await serviceClient
        .from('empresa')
        .select('id, nome')
        .eq('id', SEED_IDS.empresas.colortech);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data[0].nome).toBe('ColorTech Pigmentos');
    });

    it('user A ve empresa propria (divinissimo)', async () => {
      const { data, error } = await userA
        .from('empresa')
        .select('id, nome')
        .eq('id', SEED_IDS.empresas.divinissimo);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data[0].nome).toBe('Divinissimo Alimentos');
    });

    it('user A NAO ve empresa B (silent filter, sem erro)', async () => {
      const { data, error } = await userA
        .from('empresa')
        .select('id, nome')
        .eq('id', SEED_IDS.empresas.colortech);

      expect(error).toBeNull();   // RLS nao gera erro em SELECT
      expect(data).toEqual([]);   // Filtra silently
    });

    it('user A listing geral retorna apenas empresa propria', async () => {
      const { data, error } = await userA
        .from('empresa')
        .select('id');

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data[0].id).toBe(SEED_IDS.empresas.divinissimo);
    });
  });

  // ------------------------------------------------------------
  // INSERT
  // ------------------------------------------------------------
  describe('INSERT', () => {
    it('user A NAO consegue criar empresa nova (gate is_super_admin)', async () => {
      const since = new Date();
      const { data, error } = await userA
        .from('empresa')
        .insert({ nome: 'Tentativa user A', segmento: 'Outro' })
        .select();

      // RLS WITH CHECK retorna erro 403 (postgrest mapeia pra 42501)
      expect(error).not.toBeNull();
      expect(error.code).toBe('42501');
      expect(data).toBeNull();

      // Confirma que NAO houve audit row (write nao aconteceu)
      const audit = await getAuditSince(serviceClient, since, { tabela: 'empresa', op: 'INSERT' });
      expect(audit).toEqual([]);
    });
  });

  // ------------------------------------------------------------
  // UPDATE
  // ------------------------------------------------------------
  describe('UPDATE', () => {
    it('user A NAO consegue atualizar empresa B (silent filter, 0 rows)', async () => {
      const since = new Date();
      const { data, error } = await userA
        .from('empresa')
        .update({ nome: 'Hijack Tentativa' })
        .eq('id', SEED_IDS.empresas.colortech)
        .select();

      // PostgREST: UPDATE com filtro RLS que nao matcha = 0 rows, sem erro.
      expect(error).toBeNull();
      expect(data).toEqual([]);

      // Ground truth: nome de colortech inalterado
      const { data: groundTruth } = await serviceClient
        .from('empresa')
        .select('nome')
        .eq('id', SEED_IDS.empresas.colortech)
        .single();
      expect(groundTruth.nome).toBe('ColorTech Pigmentos');

      // Sem audit row de UPDATE
      const audit = await getAuditSince(serviceClient, since, { tabela: 'empresa', op: 'UPDATE' });
      expect(audit).toEqual([]);
    });

    it('user A NAO consegue atualizar empresa propria (gate is_super_admin)', async () => {
      // Mesmo pra propria empresa, regular user nao tem is_super_admin.
      // UPDATE policy e' is_super_admin() — falha silently.
      const since = new Date();
      const originalName = 'Divinissimo Alimentos';

      const { data, error } = await userA
        .from('empresa')
        .update({ nome: 'Tentativa rebrand' })
        .eq('id', SEED_IDS.empresas.divinissimo)
        .select();

      expect(error).toBeNull();
      expect(data).toEqual([]);

      const { data: groundTruth } = await serviceClient
        .from('empresa')
        .select('nome')
        .eq('id', SEED_IDS.empresas.divinissimo)
        .single();
      expect(groundTruth.nome).toBe(originalName);

      const audit = await getAuditSince(serviceClient, since, { tabela: 'empresa', op: 'UPDATE' });
      expect(audit).toEqual([]);
    });
  });

  // ------------------------------------------------------------
  // DELETE
  // ------------------------------------------------------------
  describe('DELETE', () => {
    it('user A NAO consegue deletar empresa B (silent filter)', async () => {
      const since = new Date();
      const { data, error } = await userA
        .from('empresa')
        .delete()
        .eq('id', SEED_IDS.empresas.colortech)
        .select();

      expect(error).toBeNull();
      expect(data).toEqual([]);

      // Ground truth: colortech ainda existe
      const { data: groundTruth } = await serviceClient
        .from('empresa')
        .select('id')
        .eq('id', SEED_IDS.empresas.colortech)
        .single();
      expect(groundTruth.id).toBe(SEED_IDS.empresas.colortech);

      const audit = await getAuditSince(serviceClient, since, { tabela: 'empresa', op: 'DELETE' });
      expect(audit).toEqual([]);
    });
  });

  // ------------------------------------------------------------
  // JOIN cross-tenant via user_empresa
  // ------------------------------------------------------------
  describe('JOIN', () => {
    it('user A via JOIN user_empresa->empresa retorna apenas propria', async () => {
      const { data, error } = await userA
        .from('user_empresa')
        .select('empresa_id, empresa:empresa_id(id, nome)');

      expect(error).toBeNull();
      // user_empresa policy: user_id = auth.uid() — so' a propria row
      expect(data).toHaveLength(1);
      expect(data[0].empresa.id).toBe(SEED_IDS.empresas.divinissimo);
      // JOIN nao expoe outras empresas mesmo via select expansion
    });
  });
});
