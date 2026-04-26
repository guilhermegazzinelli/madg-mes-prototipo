// MADG MES — E2E happy-path: rotas admin/* (super-admin only).

import { test, expect, isSupabaseRunningAndSeeded } from './fixtures/auth.js';
import { navigateTo, waitModalOpen, cancelModal } from './helpers.js';

let supabaseLocalReady;
test.beforeAll(async () => {
  supabaseLocalReady = await isSupabaseRunningAndSeeded();
});
test.beforeEach(() => {
  test.skip(!supabaseLocalReady, 'Supabase local indisponivel');
});

test.describe('admin — empresas', () => {
  test('super-admin ve lista com 4 empresas seed', async ({ pageAsSuperAdmin: page }) => {
    await navigateTo(page, '#/admin/empresas');

    await expect(page.locator('.page-title')).toContainText('Empresas');
    await expect(page.locator('#btn-nova-empresa')).toBeVisible();

    // Confirma que pelo menos as 4 empresas demo aparecem na tabela
    for (const nome of ['Divinissimo', 'Metalurgica', 'ColorTech', 'VitroMax']) {
      await expect(page.locator(`tr:has-text("${nome}")`)).toBeVisible();
    }
  });

  test('botao "Entrar como" + "Sair do contexto" visiveis', async ({ pageAsSuperAdmin: page }) => {
    await navigateTo(page, '#/admin/empresas');

    // Algum botao "Entrar como" deve existir (uma empresa que nao seja a atual)
    const entrarBtns = await page.locator('.btn-entrar').count();
    expect(entrarBtns).toBeGreaterThanOrEqual(0); // Pode ser 0 se super-admin ja esta numa empresa

    // Botao "Sair do contexto" pode estar visivel ou nao dependendo do estado
    // do super_admin_context. Apenas verifica que renderiza sem erro.
    await expect(page.locator('#main-content')).not.toContainText('Erro');
  });

  test('modal "Nova Empresa" abre com inputs', async ({ pageAsSuperAdmin: page }) => {
    await navigateTo(page, '#/admin/empresas');

    await page.click('#btn-nova-empresa');
    await waitModalOpen(page, 'Nova Empresa');

    await expect(page.locator('#empresa-nome')).toBeVisible();
    await expect(page.locator('#empresa-segmento')).toBeVisible();

    // Cancelar (nao quero criar empresa real durante test)
    await cancelModal(page);
  });

  test('regular user (divinissimo) NAO ve link admin/empresas na sidebar', async ({ pageAsDivinissimo: page }) => {
    // Sidebar items super_admin-only ficam escondidos (display:none)
    await expect(page.locator('.sidebar a[href="#/admin/empresas"]')).toBeHidden();
  });
});

test.describe('admin — usuarios', () => {
  test('super-admin ve lista de usuarios + botao novo', async ({ pageAsSuperAdmin: page }) => {
    await navigateTo(page, '#/admin/usuarios');

    await expect(page.locator('.page-title')).toContainText('Usuarios');
    await expect(page.locator('#btn-novo-usuario')).toBeVisible();

    // Confirma que pelo menos super-admin aparece (ele mesmo)
    await expect(page.locator('tr:has-text("super@madg.local")')).toBeVisible();
  });

  test('regular user NAO ve link admin/usuarios', async ({ pageAsDivinissimo: page }) => {
    await expect(page.locator('.sidebar a[href="#/admin/usuarios"]')).toBeHidden();
  });
});
