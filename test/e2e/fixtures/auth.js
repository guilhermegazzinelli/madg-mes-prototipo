// MADG MES — Auth fixture pra Playwright E2E.
//
// Responsabilidade:
//   1. Detectar se Supabase LOCAL esta acessivel + seeded — skip silently
//      em CI ou ambiente sem stack
//   2. Injetar window.__SUPABASE_URL_OVERRIDE / __KEY_OVERRIDE via
//      addInitScript ANTES do supabase.js carregar — assim a app
//      conecta no local em vez de prod
//   3. Login programatico via UI (mesmo flow do user) — confirma
//      que o login form realmente funciona e nao bypassa
//   4. Persistencia via storageState pra reuso entre specs
//
// Uso:
//   import { test, expect } from '../fixtures/auth.js';
//   test('xyz', async ({ pageAsDivinissimo }) => { ... });

import { test as base, expect } from '@playwright/test';

const SUPABASE_LOCAL_URL = 'http://127.0.0.1:54321';
const SUPABASE_LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
// Service_role: APENAS pra probe de healthcheck (bypassa RLS pra detectar
// se seed aplicado). Tests reais usam ANON via UI login.
const SUPABASE_LOCAL_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const EMAILS = {
  divinissimo: 'divinissimo@madg.local',
  metalurgica: 'metalurgica@madg.local',
  colortech:   'colortech@madg.local',
  superAdmin:  'super@madg.local',
};
const PASSWORD = 'madglocal2026';

/**
 * Probe duplo: auth health + REST contra empresa table com seed.
 * Mesma logica do test/helpers/supabase-clients.js usada nos vitest tests.
 */
/**
 * Probe duplo: auth health + REST contra empresa table com seed.
 * Mesma logica do test/helpers/supabase-clients.js usada nos vitest tests.
 *
 * NAO e' top-level await (Playwright + ESM + TLA = bug). Specs chamam
 * via test.beforeAll: const ready = await isSupabaseRunningAndSeeded();
 *                     test.skip(!ready, '...');
 */
export async function isSupabaseRunningAndSeeded() {
  try {
    const health = await fetch(`${SUPABASE_LOCAL_URL}/auth/v1/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!health.ok) return false;

    // service_role pra bypassar RLS — empresa table tem gate baseado em
    // auth_empresa_id que retorna NULL pra anon nao-logado.
    const restRes = await fetch(`${SUPABASE_LOCAL_URL}/rest/v1/empresa?select=id&limit=1`, {
      headers: {
        apikey: SUPABASE_LOCAL_SERVICE_KEY,
        authorization: `Bearer ${SUPABASE_LOCAL_SERVICE_KEY}`,
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
 * Fixture extendido: pageAsDivinissimo (e variantes) abre a app
 * com override de Supabase URL/key + login feito via UI.
 *
 * Cada test que usa o fixture comeca com session ativa de divinissimo.
 */
export const test = base.extend({
  /** Page com override de URL setado, mas sem login ainda. */
  pageWithLocalSupabase: async ({ page }, use) => {
    await page.addInitScript(([url, key]) => {
      window.__SUPABASE_URL_OVERRIDE = url;
      window.__SUPABASE_KEY_OVERRIDE = key;
    }, [SUPABASE_LOCAL_URL, SUPABASE_LOCAL_ANON_KEY]);
    await use(page);
  },

  /** Page com login feito como divinissimo (regular user, empresa A). */
  pageAsDivinissimo: async ({ page }, use) => {
    await page.addInitScript(([url, key]) => {
      window.__SUPABASE_URL_OVERRIDE = url;
      window.__SUPABASE_KEY_OVERRIDE = key;
    }, [SUPABASE_LOCAL_URL, SUPABASE_LOCAL_ANON_KEY]);
    await loginAs(page, EMAILS.divinissimo);
    await use(page);
  },

  /** Page com login como super-admin (acesso aos admin/* routes). */
  pageAsSuperAdmin: async ({ page }, use) => {
    await page.addInitScript(([url, key]) => {
      window.__SUPABASE_URL_OVERRIDE = url;
      window.__SUPABASE_KEY_OVERRIDE = key;
    }, [SUPABASE_LOCAL_URL, SUPABASE_LOCAL_ANON_KEY]);
    await loginAs(page, EMAILS.superAdmin);
    await use(page);
  },
});

/**
 * Login programatico via UI — preenche form, clica botao, espera
 * sidebar aparecer (sinal de auth state listener ter rodado).
 */
async function loginAs(page, email) {
  await page.goto('/');

  // Espera form de login renderizar (showLogin chamado em initAuth)
  await page.waitForSelector('#login-email', { timeout: 10_000 });

  await page.fill('#login-email', email);
  await page.fill('#login-senha', PASSWORD);
  await page.click('#btn-login');

  // Apos login: sidebar reaparece (showLogin escondeu via display:none).
  // Esperar nav.sidebar com display != none.
  await page.waitForFunction(() => {
    const sidebar = document.querySelector('.sidebar');
    return sidebar && sidebar.style.display !== 'none';
  }, { timeout: 10_000 });
}

export { expect, EMAILS, PASSWORD, loginAs };
