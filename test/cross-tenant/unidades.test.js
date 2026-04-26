// MADG MES — Cross-tenant RLS: tabela unidades
//
// Policies (do schema 0000):
//   SELECT/INSERT/UPDATE/DELETE: empresa_id = auth_empresa_id()
//
// Pattern simples tenant-scoped: tudo bate em empresa_id direto.

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

describe.skipIf(!supabaseRunning)('cross-tenant — unidades', () => {
  let userA;
  let serviceClient;

  beforeAll(async () => {
    userA = await createUserClient(EMAILS.divinissimo);
    serviceClient = await createServiceClient();
  });

  afterAll(async () => {
    await userA?.auth.signOut();
  });

  // Sem cleanAuditLog beforeEach: paralelismo entre arquivos faria uma
  // limpeza apagar audit rows de outro test em flight. Em vez disso,
  // assertions filtram por record_id (a row especifica que o test
  // inseriu/tocou) — escopa cada case a si mesmo.

  describe('SELECT', () => {
    it('ground truth: service_role ve unidade da empresa B', async () => {
      const { data, error } = await serviceClient
        .from('unidades')
        .select('id, nome, empresa_id')
        .eq('id', SEED_IDS.unidades.colortechDispersao);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data[0].empresa_id).toBe(SEED_IDS.empresas.colortech);
    });

    it('user A ve as proprias unidades', async () => {
      const { data, error } = await userA
        .from('unidades')
        .select('id, empresa_id')
        .eq('empresa_id', SEED_IDS.empresas.divinissimo);

      expect(error).toBeNull();
      expect(data.length).toBeGreaterThanOrEqual(2);
      expect(data.every(u => u.empresa_id === SEED_IDS.empresas.divinissimo)).toBe(true);
    });

    it('user A NAO ve unidade da empresa B (silent filter)', async () => {
      const { data, error } = await userA
        .from('unidades')
        .select('id, nome')
        .eq('id', SEED_IDS.unidades.colortechDispersao);

      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });

  describe('INSERT', () => {
    it('user A consegue criar unidade na propria empresa (audit row gerado)', async () => {
      const since = new Date();
      const { data, error } = await userA
        .from('unidades')
        .insert({
          empresa_id: SEED_IDS.empresas.divinissimo,
          nome: 'Test Fixture Unidade',
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.empresa_id).toBe(SEED_IDS.empresas.divinissimo);

      const audit = await getAuditSince(serviceClient, since, {
        tabela: 'unidades', op: 'INSERT', record_id: data.id,
      });
      expect(audit).toHaveLength(1);
      expect(audit[0].empresa_id).toBe(SEED_IDS.empresas.divinissimo);
      expect(audit[0].user_id).toBe(SEED_IDS.users.divinissimo);
      expect(audit[0].acted_as_super_admin).toBe(false);

      // Cleanup
      await serviceClient.from('unidades').delete().eq('id', data.id);
    });

    it('user A NAO consegue criar unidade pra empresa B (WITH CHECK 42501)', async () => {
      const since = new Date();
      const { data, error } = await userA
        .from('unidades')
        .insert({
          empresa_id: SEED_IDS.empresas.colortech,
          nome: 'Hijack tentativa',
        })
        .select();

      expect(error).not.toBeNull();
      expect(error.code).toBe('42501');
      expect(data).toBeNull();

      // INSERT cross-tenant block e' redundante checar audit_log (error
      // 42501 ja' prova que o WITH CHECK barrou antes do AFTER trigger).
    });
  });

  describe('UPDATE', () => {
    it('user A NAO consegue atualizar unidade da empresa B (silent)', async () => {
      const since = new Date();
      const target = SEED_IDS.unidades.colortechDispersao;
      const { data, error } = await userA
        .from('unidades')
        .update({ nome: 'Hijack' })
        .eq('id', target)
        .select();

      expect(error).toBeNull();
      expect(data).toEqual([]);

      const { data: groundTruth } = await serviceClient
        .from('unidades')
        .select('nome')
        .eq('id', target)
        .single();
      expect(groundTruth.nome).toBe('Planta Dispersao');

      const audit = await getAuditSince(serviceClient, since, {
        tabela: 'unidades', op: 'UPDATE', record_id: target,
      });
      expect(audit).toEqual([]);
    });
  });

  describe('DELETE', () => {
    it('user A NAO consegue deletar unidade da empresa B (silent)', async () => {
      const since = new Date();
      const target = SEED_IDS.unidades.colortechDispersao;
      const { data, error } = await userA
        .from('unidades')
        .delete()
        .eq('id', target)
        .select();

      expect(error).toBeNull();
      expect(data).toEqual([]);

      const { data: groundTruth } = await serviceClient
        .from('unidades')
        .select('id')
        .eq('id', target)
        .single();
      expect(groundTruth.id).toBe(target);

      const audit = await getAuditSince(serviceClient, since, {
        tabela: 'unidades', op: 'DELETE', record_id: target,
      });
      expect(audit).toEqual([]);
    });
  });
});
