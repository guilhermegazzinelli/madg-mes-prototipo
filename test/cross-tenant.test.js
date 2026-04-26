// MADG MES — Cross-tenant isolation tests
//
// Item 2 do design doc Ship & Harden v1.
// SPIKE: estamos validando o FORMATO da assertion antes de expandir
// pras 65+ cases do plano completo.
//
// Tabelas-alvo: 11 mutaveis + audit_log SELECT-only.
// Cenarios por tabela: SELECT, INSERT, UPDATE, DELETE, JOIN, RPC.
// Total final esperado: ~65 cases. Hoje rodamos 1 cenario base.
//
// Como rodar localmente:
//   1. supabase start    (sobe Docker stack)
//   2. supabase db reset (aplica schema + seed)
//   3. npm test
//
// CI hoje: skip silently se Supabase local nao estiver acessivel.
// Workflow dedicado pra rodar isso em GH Actions virara em Item 2 expansao.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isSupabaseRunning,
  createUserClient,
  createServiceClient,
  SEED_IDS,
  EMAILS,
} from './helpers/supabase-clients.js';

// Detecta UMA VEZ no carregamento do modulo. Vitest top-level await funciona.
const supabaseRunning = await isSupabaseRunning();

describe.skipIf(!supabaseRunning)('Cross-tenant isolation — SPIKE (1 cenario)', () => {
  let userDivinissimo;  // logged in como divinissimo@madg.local
  let serviceClient;     // service_role — bypassa RLS

  beforeAll(async () => {
    userDivinissimo = await createUserClient(EMAILS.divinissimo);
    serviceClient = await createServiceClient();
  });

  afterAll(async () => {
    await userDivinissimo?.auth.signOut();
  });

  it('ground truth: service_role consegue ler unidade da Metalurgica', async () => {
    // Comprova que a unidade existe no banco — descarta falso positivo
    // de "tabela vazia, RLS irrelevante".
    const { data, error } = await serviceClient
      .from('unidades')
      .select('id, nome, empresa_id')
      .eq('id', SEED_IDS.unidades.metalurgicaUsinagem);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0].nome).toBe('Planta Usinagem');
    expect(data[0].empresa_id).toBe(SEED_IDS.empresas.metalurgica);
  });

  it('cross-tenant SELECT: user da Divinissimo NAO ve unidade da Metalurgica', async () => {
    // O caso central: RLS deve filtrar silently. Espera-se array vazio,
    // NAO erro. (PostgREST com RLS retorna [] em vez de 403/404.)
    const { data, error } = await userDivinissimo
      .from('unidades')
      .select('id, nome')
      .eq('id', SEED_IDS.unidades.metalurgicaUsinagem);

    expect(error).toBeNull();    // RLS nao gera erro em SELECT
    expect(data).toEqual([]);    // Filtra silently
  });

  it('sanity check: user da Divinissimo VE suas proprias unidades', async () => {
    // Confirma que o user consegue ler dado da PROPRIA empresa —
    // descarta falso negativo de "tudo bloqueado por RLS errada".
    const { data, error } = await userDivinissimo
      .from('unidades')
      .select('id, nome, empresa_id')
      .eq('empresa_id', SEED_IDS.empresas.divinissimo);

    expect(error).toBeNull();
    expect(data.length).toBeGreaterThanOrEqual(2);  // Seed tem 2 unidades pra Divinissimo
    expect(data.every(u => u.empresa_id === SEED_IDS.empresas.divinissimo)).toBe(true);
  });
});

// =================================================================
// Note pra expansao (Item 2 completo, ~12-22h CC):
//
// 1. Replicar o pattern acima pras 11 tabelas mutaveis:
//      empresa, user_empresa, unidades, linhas, produtos,
//      taxas_producao, motivos_parada, turnos,
//      ordens_producao, paradas, super_admin_context
//
// 2. Pra cada tabela, 6 cenarios:
//      SELECT, INSERT (forcando empresa_id de B), UPDATE (em row de B),
//      DELETE (em row de B), JOIN cross-tenant, RPC call cross-tenant
//
// 3. audit_log: 1 cenario SELECT-only (eh write-only via trigger).
//
// 4. Super-admin scenarios (4):
//      - Super-admin sem context impersonando NADA -> ve so dados proprios
//      - Super-admin com super_admin_context populado -> ve dados da
//        empresa selecionada (audit log marca acted_as_super_admin=true)
//      - User regular tentando INSERT em super_admin_context -> 403/empty
//      - rpc_admin_listar_usuarios chamado por non-super-admin -> rejected
//
// 5. Lifecycle (do D12 OV4):
//      - Token theft simulation (session token de super-admin reusado)
//      - Context staleness (logout deve limpar super_admin_context row)
//
// Total esperado pos-expansao: ~65 cases, runtime ~5-15s.
// =================================================================
