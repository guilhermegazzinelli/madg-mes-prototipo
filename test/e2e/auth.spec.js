// MADG MES — E2E auth flow (smoke test do Phase 1).
//
// Cobre o caminho mais critico: login + logout. Se isso quebrar,
// nenhuma outra coisa importa.

import { test, expect, EMAILS, PASSWORD, isSupabaseRunningAndSeeded } from './fixtures/auth.js';

let supabaseLocalReady;
test.beforeAll(async () => {
  supabaseLocalReady = await isSupabaseRunningAndSeeded();
});

test.beforeEach(() => {
  test.skip(!supabaseLocalReady, 'Supabase local nao acessivel ou seed nao aplicado — `supabase start && supabase db reset`');
});

test.describe('auth — login flow', () => {
  test('mostra form de login quando nao autenticado', async ({ pageWithLocalSupabase: page }) => {
    await page.goto('/');

    // Form de login renderiza
    await expect(page.locator('#login-email')).toBeVisible();
    await expect(page.locator('#login-senha')).toBeVisible();
    await expect(page.locator('#btn-login')).toBeVisible();

    // Sidebar e bottom-nav escondidos (showLogin set display:none)
    await expect(page.locator('.sidebar')).toBeHidden();
  });

  test('login com credenciais validas leva ao app', async ({ pageWithLocalSupabase: page }) => {
    await page.goto('/');
    await page.fill('#login-email', EMAILS.divinissimo);
    await page.fill('#login-senha', PASSWORD);
    await page.click('#btn-login');

    // Sidebar reaparece
    await expect(page.locator('.sidebar')).toBeVisible({ timeout: 10_000 });

    // Bottom-nav (mobile) tambem visivel (display nao-none)
    const bottomNavDisplay = await page.locator('.bottom-nav').evaluate(el => el.style.display);
    expect(bottomNavDisplay).not.toBe('none');
  });

  test('login com senha errada mostra erro inline', async ({ pageWithLocalSupabase: page }) => {
    await page.goto('/');
    await page.fill('#login-email', EMAILS.divinissimo);
    await page.fill('#login-senha', 'senha-errada-mesmo');
    await page.click('#btn-login');

    const err = page.locator('#login-error');
    await expect(err).toBeVisible({ timeout: 5_000 });
    await expect(err).toContainText('Email ou senha incorretos');

    // Sidebar continua escondida (login falhou)
    await expect(page.locator('.sidebar')).toBeHidden();
  });

  test('login com email vazio mostra validacao client-side', async ({ pageWithLocalSupabase: page }) => {
    await page.goto('/');
    await page.fill('#login-email', '');
    await page.fill('#login-senha', PASSWORD);
    await page.click('#btn-login');

    const err = page.locator('#login-error');
    await expect(err).toBeVisible();
    await expect(err).toContainText('Preencha email e senha');
  });
});

test.describe('auth — usuario autenticado', () => {
  test('divinissimo ve sidebar com items de cadastros', async ({ pageAsDivinissimo: page }) => {
    // Sidebar tem links pra cadastros — confirma user com user_empresa
    await expect(page.locator('.sidebar a[href="#/cadastros/unidades"]')).toBeVisible();
    await expect(page.locator('.sidebar a[href="#/cadastros/produtos"]')).toBeVisible();

    // Items de admin (super_admin) NAO visiveis pra regular user
    await expect(page.locator('.sidebar a[href="#/admin/empresas"]')).toBeHidden();
  });

  test('super-admin ve items de admin/* extras', async ({ pageAsSuperAdmin: page }) => {
    // Items de admin viram visiveis (super_admin path do supabase.js)
    await expect(page.locator('.sidebar a[href="#/admin/empresas"]')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.sidebar a[href="#/admin/usuarios"]')).toBeVisible();
  });
});
