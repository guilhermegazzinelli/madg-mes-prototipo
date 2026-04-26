// MADG MES — Cross-tenant RLS: super-admin lifecycle (D12 OV4)
//
// Cobre:
//   - Switching context entre empresas (impersonacao dinamica)
//   - Clearing context (NULL → sem empresa visivel)
//   - Context staleness apos sign-out (DB row preserva)
//   - Audit trail registra empresa contextual no momento do write
//
// Estes tests focam no LIFECYCLE da impersonacao via super_admin_context,
// nao em individual policies (cobertas em super_admin_context.test.js).

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

describe.skipIf(!supabaseRunning)('cross-tenant — super-admin lifecycle', () => {
  let superClient;
  let serviceClient;

  beforeAll(async () => {
    superClient = await createUserClient(EMAILS.superAdmin);
    serviceClient = await createServiceClient();
  });

  afterAll(async () => {
    try { await setSuperAdminContext(superClient, null); } catch {}
    await superClient?.auth.signOut();
  });

  describe('Switching context entre empresas', () => {
    it('switch A->B: visibilidade muda imediatamente (sem cache stale)', async () => {
      // Arranque em divinissimo
      await setSuperAdminContext(superClient, SEED_IDS.empresas.divinissimo);
      const { data: divUnits } = await superClient
        .from('unidades').select('empresa_id');
      expect(divUnits.every(u => u.empresa_id === SEED_IDS.empresas.divinissimo)).toBe(true);

      // Switch pra colortech
      await setSuperAdminContext(superClient, SEED_IDS.empresas.colortech);
      const { data: colorUnits } = await superClient
        .from('unidades').select('empresa_id');
      expect(colorUnits.every(u => u.empresa_id === SEED_IDS.empresas.colortech)).toBe(true);
      // Garantia: NAO ve nada da divinissimo no segundo query
      expect(colorUnits.some(u => u.empresa_id === SEED_IDS.empresas.divinissimo)).toBe(false);
    });

    it('clear context (NULL): super-admin volta a ver vazio', async () => {
      await setSuperAdminContext(superClient, SEED_IDS.empresas.colortech);
      // Confirma que ve colortech
      const { data: before } = await superClient.from('unidades').select('empresa_id');
      expect(before.length).toBeGreaterThan(0);

      // Limpa context
      await setSuperAdminContext(superClient, null);

      // Sem context = auth_empresa_id NULL = nada visivel em tenant tables
      const { data: after } = await superClient.from('unidades').select('empresa_id');
      expect(after).toEqual([]);
    });
  });

  describe('Persistencia do context', () => {
    it('context sobrevive sign-out + sign-in (row no DB, nao session)', async () => {
      // Set context
      await setSuperAdminContext(superClient, SEED_IDS.empresas.divinissimo);

      // Logout + new client
      await superClient.auth.signOut();
      const reLogged = await createUserClient(EMAILS.superAdmin);

      try {
        // Sem chamar setSuperAdminContext, le diretamente
        const { data, error } = await reLogged
          .from('super_admin_context')
          .select('selected_empresa_id')
          .eq('user_id', SEED_IDS.users.superAdmin)
          .single();

        expect(error).toBeNull();
        expect(data.selected_empresa_id).toBe(SEED_IDS.empresas.divinissimo);
      } finally {
        // Cleanup pra nao poluir outros tests
        try { await setSuperAdminContext(reLogged, null); } catch {}
        await reLogged.auth.signOut();
        // Re-cria superClient pro afterAll
        superClient = await createUserClient(EMAILS.superAdmin);
      }
    });
  });

  describe('Audit trail por context', () => {
    it('write em context A vs context B: audit registra empresa correta em cada caso', async () => {
      // Write em divinissimo
      await setSuperAdminContext(superClient, SEED_IDS.empresas.divinissimo);
      const sinceDiv = new Date();
      const { data: divCreated } = await superClient
        .from('motivos_parada')
        .insert({
          empresa_id: SEED_IDS.empresas.divinissimo,
          nome: 'lifecycle-test-div',
          tipo: 'planejada',
        })
        .select()
        .single();

      const auditDiv = await getAuditSince(serviceClient, sinceDiv, {
        tabela: 'motivos_parada', op: 'INSERT', record_id: divCreated.id,
      });
      expect(auditDiv).toHaveLength(1);
      expect(auditDiv[0].empresa_id).toBe(SEED_IDS.empresas.divinissimo);
      expect(auditDiv[0].acted_as_super_admin).toBe(true);

      // Switch pra colortech, novo write
      await setSuperAdminContext(superClient, SEED_IDS.empresas.colortech);
      const sinceColor = new Date();
      const { data: colorCreated } = await superClient
        .from('motivos_parada')
        .insert({
          empresa_id: SEED_IDS.empresas.colortech,
          nome: 'lifecycle-test-color',
          tipo: 'planejada',
        })
        .select()
        .single();

      const auditColor = await getAuditSince(serviceClient, sinceColor, {
        tabela: 'motivos_parada', op: 'INSERT', record_id: colorCreated.id,
      });
      expect(auditColor).toHaveLength(1);
      expect(auditColor[0].empresa_id).toBe(SEED_IDS.empresas.colortech);
      expect(auditColor[0].acted_as_super_admin).toBe(true);

      // Cleanup
      await serviceClient.from('motivos_parada').delete().in('id', [divCreated.id, colorCreated.id]);
      await setSuperAdminContext(superClient, null);
    });
  });
});
