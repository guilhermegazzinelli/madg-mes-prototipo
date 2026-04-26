// MADG MES — Helpers para criar clientes Supabase em testes.
//
// Uso:
//   import {
//     isSupabaseRunning, createUserClient, createServiceClient,
//     SEED_IDS, EMAILS, cleanAuditLog, getAuditSince
//   } from './helpers/supabase-clients.js';
//
// Filosofia:
//   - Tests integram com Supabase LOCAL (Docker via supabase start).
//   - Skip em CI ate' workflow especifico ser criado.
//   - Keys sao defaults publicos do Supabase local — NUNCA reutilizar em prod.

const SUPABASE_URL = process.env.SUPABASE_TEST_URL || 'http://127.0.0.1:54321';

// Default keys do Supabase local — publicos em docs, hardcoded no CLI.
// Override via env var em ambientes diferentes.
const ANON_KEY = process.env.SUPABASE_TEST_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const SERVICE_KEY = process.env.SUPABASE_TEST_SERVICE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

/**
 * Detecta se Supabase local esta acessivel E o seed foi aplicado.
 * Probing /auth/v1/health sozinho passa em stack subido sem seed —
 * causando login falhar com "Database error querying schema". Aqui
 * fazemos probe duplo: health + REST contra `empresa` (publica via
 * service_role) pra confirmar schema + seed presentes.
 */
export async function isSupabaseRunning() {
  try {
    const health = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!health.ok) return false;

    // Confirma seed via service_role: precisa achar pelo menos 1 empresa.
    const restRes = await fetch(`${SUPABASE_URL}/rest/v1/empresa?select=id&limit=1`, {
      headers: {
        apikey: SERVICE_KEY,
        authorization: `Bearer ${SERVICE_KEY}`,
      },
      signal: AbortSignal.timeout(2000),
    });
    if (!restRes.ok) return false;
    const rows = await restRes.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * Cria client autenticado como user de empresa.
 * Faz signInWithPassword usando credenciais do seed.
 */
export async function createUserClient(email, password = 'madglocal2026') {
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`Login falhou para ${email}: ${error.message}`);
  }
  return client;
}

/**
 * Cria client com service_role key — BYPASSA RLS.
 * Usar APENAS pra setup de fixtures / verificacao de "ground truth"
 * / leitura do audit_log pra verificar comportamento. Nunca pra
 * simular user real.
 */
export async function createServiceClient() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ============================================================
// SEED_IDS — UUIDs estaveis hardcoded no seed.sql
// ============================================================
// Convencao de prefixo:
//   00 = empresa
//   aa = user (auth.users)
//   10 = unidade
//   20 = linha
//   30 = produto
//   40 = motivo_parada
//   50 = taxa_producao  (apenas anchors — restante e' auto-id)
//   60 = turno          (apenas anchors)
//   70 = ordem_producao (apenas anchors)
//   80 = parada         (apenas anchors)
//
// Suffix .0001..0014 = divinissimo, .0030..0037 = colortech,
//        .0040..0047 = vitromax, .0099 = metalurgica.
// Empresa A nos cross-tenant tests = divinissimo.
// Empresa B = colortech (seed rico cobre todos cenarios).

export const SEED_IDS = {
  empresas: {
    divinissimo: '00000000-0000-0000-0000-000000000001',
    metalurgica: '00000000-0000-0000-0000-000000000002',
    colortech:   '00000000-0000-0000-0000-000000000003',
    vitromax:    '00000000-0000-0000-0000-000000000004',
  },
  users: {
    divinissimo: 'aa000000-0000-0000-0000-000000000001',
    metalurgica: 'aa000000-0000-0000-0000-000000000002',
    colortech:   'aa000000-0000-0000-0000-000000000003',
    vitromax:    'aa000000-0000-0000-0000-000000000004',
    superAdmin:  'aa000000-0000-0000-0000-000000000099',
  },
  unidades: {
    divinissimoPDQ:        '10000000-0000-0000-0000-000000000001',
    divinissimoSalgados:   '10000000-0000-0000-0000-000000000002',
    metalurgicaUsinagem:   '10000000-0000-0000-0000-000000000099',
    colortechDispersao:    '10000000-0000-0000-0000-000000000030',
    colortechMoagem:       '10000000-0000-0000-0000-000000000031',
    vitromaxForno:         '10000000-0000-0000-0000-000000000040',
    vitromaxBeneficiamento:'10000000-0000-0000-0000-000000000041',
  },
  linhas: {
    divinissimoPDQ:    '20000000-0000-0000-0000-000000000001',
    divinissimoLinha01:'20000000-0000-0000-0000-000000000010',
    metalurgicaCNC:    '20000000-0000-0000-0000-000000000099',
    colortechD01:      '20000000-0000-0000-0000-000000000030',
    colortechD02:      '20000000-0000-0000-0000-000000000031',
    colortechE01:      '20000000-0000-0000-0000-000000000032',
    colortechM01:      '20000000-0000-0000-0000-000000000033',
    colortechM02:      '20000000-0000-0000-0000-000000000034',
  },
  produtos: {
    divinissimoPDQHoraForno: '30000000-0000-0000-0000-000000000001',
    divinissimoCoxinha:      '30000000-0000-0000-0000-000000000010',
    metalurgicaEixo:         '30000000-0000-0000-0000-000000000099',
    colortechPigmentoAzul:   '30000000-0000-0000-0000-000000000030',
    colortechPigmentoVermelho:'30000000-0000-0000-0000-000000000031',
  },
  motivos: {
    divinissimoQuebra:     '40000000-0000-0000-0000-000000000001',
    divinissimoSetup:      '40000000-0000-0000-0000-000000000002',
    divinissimoQualidade:  '40000000-0000-0000-0000-000000000008',
    // motivos da metalurgica/colortech/vitromax sao auto-id (sem stable UUID)
  },
  taxas: {
    divinissimoAnchor: '50000000-0000-0000-0000-000000000001',
    colortechAnchor:   '50000000-0000-0000-0000-000000000030',
  },
  turnos: {
    divinissimoComercial: '60000000-0000-0000-0000-000000000001',
    colortech1oTurno:     '60000000-0000-0000-0000-000000000030',
  },
  ordens: {
    divinissimoAnchor: '70000000-0000-0000-0000-000000000001',
    colortechAnchor:   '70000000-0000-0000-0000-000000000030',
  },
  paradas: {
    divinissimoAnchor: '80000000-0000-0000-0000-000000000001',
    colortechAnchor:   '80000000-0000-0000-0000-000000000030',
  },
};

export const EMAILS = {
  divinissimo: 'divinissimo@madg.local',
  metalurgica: 'metalurgica@madg.local',
  colortech:   'colortech@madg.local',
  vitromax:    'vitromax@madg.local',
  superAdmin:  'super@madg.local',
};

// ============================================================
// AUDIT LOG HELPERS
// ============================================================
// Cross-tenant tests verificam que ops bloqueadas por RLS NAO
// geram audit row (write nao aconteceu). Helpers usam service_role
// pra ler audit_log completo (RLS bypass).

/**
 * Limpa audit_log pra tests comecarem do zero.
 * Use em beforeEach() pra isolar cases independentes.
 *
 * NOTA: isso requer service_role; user normal nao consegue
 * (audit_log so' tem policy SELECT, nem INSERT/UPDATE/DELETE).
 * Service_role bypassa RLS mas TRUNCATE precisa de privilegio
 * de owner — usamos DELETE em vez disso.
 */
export async function cleanAuditLog(serviceClient) {
  // DELETE all rows. service_role tem permissao.
  // Filtro impossivel pra capturar todas as rows sem warning do
  // postgrest (delete sem WHERE retorna erro proteg-ivel).
  const { error } = await serviceClient
    .from('audit_log')
    .delete()
    .gte('criado_em', '1900-01-01');
  if (error) throw new Error(`cleanAuditLog falhou: ${error.message}`);
}

/**
 * Le todas as audit rows criadas desde um timestamp.
 * Use pra contar quantas writes uma operacao gerou.
 *
 * @param {SupabaseClient} serviceClient - client com service_role
 * @param {Date|string} since - timestamp inicio (ISO string ou Date)
 * @param {object} [filter] - filtros adicionais: { tabela, op, user_id, empresa_id }
 */
export async function getAuditSince(serviceClient, since, filter = {}) {
  let query = serviceClient
    .from('audit_log')
    .select('*')
    .gte('criado_em', new Date(since).toISOString())
    .order('criado_em', { ascending: true });

  if (filter.tabela)     query = query.eq('tabela', filter.tabela);
  if (filter.op)         query = query.eq('op', filter.op);
  if (filter.user_id)    query = query.eq('user_id', filter.user_id);
  if (filter.empresa_id) query = query.eq('empresa_id', filter.empresa_id);
  if (filter.record_id)  query = query.eq('record_id', filter.record_id);

  const { data, error } = await query;
  if (error) throw new Error(`getAuditSince falhou: ${error.message}`);
  return data;
}

// ============================================================
// SUPER-ADMIN CONTEXT HELPERS
// ============================================================

/**
 * Set super_admin_context.selected_empresa_id (impersonation).
 * Chama rpc_admin_selecionar_empresa.
 *
 * @param {SupabaseClient} superClient - client logado como super-admin
 * @param {string|null} empresaId - UUID da empresa OR null pra limpar
 */
export async function setSuperAdminContext(superClient, empresaId) {
  const { error } = await superClient.rpc('rpc_admin_selecionar_empresa', {
    p_empresa_id: empresaId,
  });
  if (error) throw new Error(`setSuperAdminContext falhou: ${error.message}`);
}
