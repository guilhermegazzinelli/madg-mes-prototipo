// MADG MES — Helpers para criar clientes Supabase em testes.
//
// Uso:
//   import { isSupabaseRunning, createUserClient, createServiceClient } from './helpers/supabase-clients.js';
//
// Filosofia:
//   - Tests integram com Supabase LOCAL (Docker via supabase start).
//   - Skip em CI ate' workflow especifico ser criado em Item 2 expansao.
//   - Keys sao defaults publicos do Supabase local — NUNCA reutilizar em prod.

const SUPABASE_URL = process.env.SUPABASE_TEST_URL || 'http://127.0.0.1:54321';

// Default keys do Supabase local — publicos em docs, hardcoded no CLI.
// Override via env var em ambientes diferentes.
const ANON_KEY = process.env.SUPABASE_TEST_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const SERVICE_KEY = process.env.SUPABASE_TEST_SERVICE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

/**
 * Detecta se Supabase local esta acessivel.
 * Usado pra skipIf nos testes — CI sem Supabase passa sem rodar.
 */
export async function isSupabaseRunning() {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Cria client autenticado como user de empresa.
 * Faz signInWithPassword usando credenciais do seed.
 *
 * @param {string} email - email do user (ex: 'divinissimo@madg.local')
 * @param {string} password - senha (default: senha do seed)
 * @returns {SupabaseClient}
 */
export async function createUserClient(email, password = 'madglocal2026') {
  // Import dinamico pra evitar carregar @supabase/supabase-js quando skip
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
 * Usar APENAS pra setup de fixtures / verificacao de "ground truth".
 * Nunca pra simular user real.
 */
export async function createServiceClient() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// UUIDs do seed — referenciados nos testes
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
    divinissimoPDQ:       '10000000-0000-0000-0000-000000000001',
    divinissimoSalgados:  '10000000-0000-0000-0000-000000000002',
    metalurgicaUsinagem:  '10000000-0000-0000-0000-000000000099',
  },
};

export const EMAILS = {
  divinissimo: 'divinissimo@madg.local',
  metalurgica: 'metalurgica@madg.local',
  colortech:   'colortech@madg.local',
  vitromax:    'vitromax@madg.local',
  superAdmin:  'super@madg.local',
};
