// MADG MES — Cross-tenant RLS: tabela produtos
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

describe.skipIf(!supabaseRunning)('cross-tenant — produtos', () => {
  let userA;
  let serviceClient;

  beforeAll(async () => {
    userA = await createUserClient(EMAILS.divinissimo);
    serviceClient = await createServiceClient();
  });

  afterAll(async () => {
    await userA?.auth.signOut();
  });

  // Filtragem por record_id em vez de cleanAuditLog beforeEach
  // (paralelismo entre arquivos faz cleanup global criar race).

  describe('SELECT', () => {
    it('ground truth: service_role ve produto da empresa B', async () => {
      const { data, error } = await serviceClient
        .from('produtos')
        .select('id, codigo, empresa_id')
        .eq('id', SEED_IDS.produtos.colortechPigmentoAzul);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data[0].empresa_id).toBe(SEED_IDS.empresas.colortech);
    });

    it('user A ve produtos proprios', async () => {
      const { data, error } = await userA
        .from('produtos')
        .select('id, empresa_id')
        .eq('empresa_id', SEED_IDS.empresas.divinissimo);

      expect(error).toBeNull();
      expect(data.length).toBeGreaterThanOrEqual(5);
      expect(data.every(p => p.empresa_id === SEED_IDS.empresas.divinissimo)).toBe(true);
    });

    it('user A NAO ve produto da empresa B (silent filter)', async () => {
      const { data, error } = await userA
        .from('produtos')
        .select('id, codigo')
        .eq('id', SEED_IDS.produtos.colortechPigmentoAzul);

      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });

  describe('INSERT', () => {
    it('user A consegue criar produto na propria empresa (audit gerado)', async () => {
      const since = new Date();
      const { data, error } = await userA
        .from('produtos')
        .insert({
          empresa_id: SEED_IDS.empresas.divinissimo,
          codigo: 'TEST-FIXTURE-001',
          descricao: 'Produto de teste cross-tenant',
          unidade_medida: 'un',
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.empresa_id).toBe(SEED_IDS.empresas.divinissimo);

      const audit = await getAuditSince(serviceClient, since, {
        tabela: 'produtos', op: 'INSERT', record_id: data.id,
      });
      expect(audit).toHaveLength(1);
      expect(audit[0].user_id).toBe(SEED_IDS.users.divinissimo);
      expect(audit[0].empresa_id).toBe(SEED_IDS.empresas.divinissimo);

      await serviceClient.from('produtos').delete().eq('id', data.id);
    });

    it('user A NAO consegue criar produto pra empresa B (WITH CHECK 42501)', async () => {
      const since = new Date();
      const { data, error } = await userA
        .from('produtos')
        .insert({
          empresa_id: SEED_IDS.empresas.colortech,
          codigo: 'HIJACK-001',
          descricao: 'Tentativa de injecao em outro tenant',
          unidade_medida: 'kg',
        })
        .select();

      expect(error).not.toBeNull();
      expect(error.code).toBe('42501');
      expect(data).toBeNull();

      // INSERT bloqueado em WITH CHECK (42501) — AFTER trigger nao dispara,
      // checar audit_log e' redundante.
    });
  });

  describe('UPDATE', () => {
    it('user A NAO consegue atualizar produto da empresa B (silent)', async () => {
      const since = new Date();
      const target = SEED_IDS.produtos.colortechPigmentoAzul;
      const { data, error } = await userA
        .from('produtos')
        .update({ codigo: 'HIJACKED' })
        .eq('id', target)
        .select();

      expect(error).toBeNull();
      expect(data).toEqual([]);

      const { data: groundTruth } = await serviceClient
        .from('produtos')
        .select('codigo')
        .eq('id', target)
        .single();
      expect(groundTruth.codigo).toBe('PG-AZ-001');

      const audit = await getAuditSince(serviceClient, since, {
        tabela: 'produtos', op: 'UPDATE', record_id: target,
      });
      expect(audit).toEqual([]);
    });
  });

  describe('DELETE', () => {
    it('user A NAO consegue deletar produto da empresa B (silent)', async () => {
      const since = new Date();
      const target = SEED_IDS.produtos.colortechPigmentoAzul;
      const { data, error } = await userA
        .from('produtos')
        .delete()
        .eq('id', target)
        .select();

      expect(error).toBeNull();
      expect(data).toEqual([]);

      const { data: groundTruth } = await serviceClient
        .from('produtos')
        .select('id')
        .eq('id', target)
        .single();
      expect(groundTruth.id).toBe(target);

      const audit = await getAuditSince(serviceClient, since, {
        tabela: 'produtos', op: 'DELETE', record_id: target,
      });
      expect(audit).toEqual([]);
    });
  });
});
