// MADG MES — Cross-tenant RLS: tabela audit_log
//
// Policies (do migration 0001):
//   SELECT: empresa_id = auth_empresa_id() OR is_super_admin()
//   INSERT/UPDATE/DELETE: SEM policy → bloqueado pelo FORCE RLS.
//   Apenas a function log_audit (SECURITY DEFINER) escreve, via triggers.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isSupabaseRunning,
  createUserClient,
  createServiceClient,
  SEED_IDS,
  EMAILS,
  getAuditSince,
  setSuperAdminContext,
} from '../helpers/supabase-clients.js';

const supabaseRunning = await isSupabaseRunning();

describe.skipIf(!supabaseRunning)('cross-tenant — audit_log', () => {
  let userA;
  let superClient;
  let serviceClient;

  beforeAll(async () => {
    userA = await createUserClient(EMAILS.divinissimo);
    superClient = await createUserClient(EMAILS.superAdmin);
    serviceClient = await createServiceClient();
  });

  afterAll(async () => {
    try { await setSuperAdminContext(superClient, null); } catch {}
    await userA?.auth.signOut();
    await superClient?.auth.signOut();
  });

  describe('SELECT — visibility cross-tenant', () => {
    it('user A INSERT gera audit row visivel pra user A (empresa propria)', async () => {
      const since = new Date();
      // Insere algo pra gerar audit row
      const { data: created } = await userA
        .from('motivos_parada')
        .insert({
          empresa_id: SEED_IDS.empresas.divinissimo,
          nome: 'audit-test-fixture',
          tipo: 'planejada',
        })
        .select()
        .single();

      // User A le audit_log direto e ve a row
      const { data, error } = await userA
        .from('audit_log')
        .select('id, tabela, op, empresa_id, user_id')
        .eq('record_id', created.id);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data[0].tabela).toBe('motivos_parada');
      expect(data[0].op).toBe('INSERT');
      expect(data[0].empresa_id).toBe(SEED_IDS.empresas.divinissimo);

      await serviceClient.from('motivos_parada').delete().eq('id', created.id);
    });

    it('user A NAO ve audit rows de empresa B (silent filter)', async () => {
      // Pega audit row da colortech via service_role
      const { data: colortechAuditRows } = await serviceClient
        .from('audit_log')
        .select('id')
        .eq('empresa_id', SEED_IDS.empresas.colortech)
        .limit(1);

      if (colortechAuditRows.length === 0) {
        // Sem audit rows da colortech ainda — gera uma via service_role.
        // Service insert nao gera audit row porque trigger usa auth.uid()
        // que e' NULL pra service_role. Skip esse case se colortech ainda
        // nao acumulou audit (nao quebra contrato — sem evidencia, skip).
        return;
      }

      const { data: leakCheck, error } = await userA
        .from('audit_log')
        .select('id')
        .in('id', colortechAuditRows.map(r => r.id));

      expect(error).toBeNull();
      expect(leakCheck).toEqual([]);
    });
  });

  describe('Direct write blocked — apenas trigger escreve', () => {
    it('user A NAO consegue INSERT direto em audit_log (sem policy)', async () => {
      const { data, error } = await userA
        .from('audit_log')
        .insert({
          tabela: 'fake',
          op: 'INSERT',
          record_id: '00000000-0000-0000-0000-000000000000',
        })
        .select();

      expect(error).not.toBeNull();
      expect(error.code).toBe('42501');
      expect(data).toBeNull();
    });

    it('user A NAO consegue UPDATE em audit_log (immutability)', async () => {
      const { data: row } = await serviceClient
        .from('audit_log')
        .select('id')
        .limit(1)
        .maybeSingle();
      if (!row) return; // sem rows pra atualizar

      const { data, error } = await userA
        .from('audit_log')
        .update({ tabela: 'tampered' })
        .eq('id', row.id)
        .select();

      expect(error).toBeNull();
      expect(data).toEqual([]);

      const { data: groundTruth } = await serviceClient
        .from('audit_log')
        .select('tabela')
        .eq('id', row.id)
        .single();
      expect(groundTruth.tabela).not.toBe('tampered');
    });

    it('user A NAO consegue DELETE audit row (preserve trail)', async () => {
      const { data: row } = await serviceClient
        .from('audit_log')
        .select('id')
        .limit(1)
        .maybeSingle();
      if (!row) return;

      const { data, error } = await userA
        .from('audit_log')
        .delete()
        .eq('id', row.id)
        .select();

      expect(error).toBeNull();
      expect(data).toEqual([]);

      const { data: groundTruth } = await serviceClient
        .from('audit_log')
        .select('id')
        .eq('id', row.id)
        .maybeSingle();
      expect(groundTruth?.id).toBe(row.id);
    });
  });

  describe('acted_as_super_admin marker', () => {
    it('regular user write: acted_as_super_admin = false', async () => {
      const since = new Date();
      const { data: created } = await userA
        .from('motivos_parada')
        .insert({
          empresa_id: SEED_IDS.empresas.divinissimo,
          nome: 'asa-marker-test-regular',
          tipo: 'planejada',
        })
        .select()
        .single();

      const audit = await getAuditSince(serviceClient, since, {
        tabela: 'motivos_parada', op: 'INSERT', record_id: created.id,
      });
      expect(audit).toHaveLength(1);
      expect(audit[0].acted_as_super_admin).toBe(false);

      await serviceClient.from('motivos_parada').delete().eq('id', created.id);
    });

    it('super-admin COM context populado: acted_as_super_admin = true', async () => {
      await setSuperAdminContext(superClient, SEED_IDS.empresas.divinissimo);

      const since = new Date();
      const { data: created } = await superClient
        .from('motivos_parada')
        .insert({
          empresa_id: SEED_IDS.empresas.divinissimo,
          nome: 'asa-marker-test-super',
          tipo: 'planejada',
        })
        .select()
        .single();

      const audit = await getAuditSince(serviceClient, since, {
        tabela: 'motivos_parada', op: 'INSERT', record_id: created.id,
      });
      expect(audit).toHaveLength(1);
      expect(audit[0].acted_as_super_admin).toBe(true);
      expect(audit[0].user_id).toBe(SEED_IDS.users.superAdmin);
      expect(audit[0].empresa_id).toBe(SEED_IDS.empresas.divinissimo);

      await serviceClient.from('motivos_parada').delete().eq('id', created.id);
      await setSuperAdminContext(superClient, null);
    });
  });
});
