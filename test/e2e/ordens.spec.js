// MADG MES — E2E happy-path: ordens (list + nova ordem).
//
// Cobre: lista de ordens com filtros, navegacao pra "Nova Ordem".
// Submissao completa de ordem (apontamento) eh form pesado — fica TODO.

import { test, expect, isSupabaseRunningAndSeeded } from './fixtures/auth.js';
import { navigateTo } from './helpers.js';

let supabaseLocalReady;
test.beforeAll(async () => {
  supabaseLocalReady = await isSupabaseRunningAndSeeded();
});
test.beforeEach(() => {
  test.skip(!supabaseLocalReady, 'Supabase local indisponivel');
});

test.describe('ordens — lista', () => {
  test('renderiza com filtros de data e linha + botao filtrar', async ({ pageAsDivinissimo: page }) => {
    await navigateTo(page, '#/ordens');

    await expect(page.locator('.page-title')).toContainText('Ordens de Producao');
    await expect(page.locator('#filtro-de')).toBeVisible();
    await expect(page.locator('#filtro-ate')).toBeVisible();
    await expect(page.locator('#filtro-linha')).toBeVisible();
    await expect(page.locator('#btn-filtrar')).toBeVisible();
    await expect(page.locator('#ordens-list')).toBeVisible();
  });

  test('filtra com range de datas + clicar filtrar nao da erro', async ({ pageAsDivinissimo: page }) => {
    await navigateTo(page, '#/ordens');

    // Range que cobre o seed (2026-04-01 a 2026-04-15)
    await page.locator('#filtro-de').fill('2026-04-01');
    await page.locator('#filtro-ate').fill('2026-04-30');
    await page.click('#btn-filtrar');

    // Sem erro renderizado
    await expect(page.locator('#main-content')).not.toContainText('Erro');
  });
});

test.describe('ordens — nova ordem', () => {
  test('navega via sidebar + form aparece com selects', async ({ pageAsDivinissimo: page }) => {
    await navigateTo(page, '#/ordens/new');

    await expect(page.locator('.page-title')).toContainText('Nova Ordem');
    await expect(page.locator('#ordem-form')).toBeVisible();
    await expect(page.locator('#sel-unidade')).toBeVisible();
    await expect(page.locator('#sel-linha')).toBeVisible();
    await expect(page.locator('#sel-produto')).toBeVisible();
  });

  test('seleciona unidade -> linha popula com opcoes da unidade', async ({ pageAsDivinissimo: page }) => {
    await navigateTo(page, '#/ordens/new');

    // Espera unidade ter opcoes carregadas (auto-load de db.from('unidades'))
    await page.waitForFunction(() => {
      const sel = document.querySelector('#sel-unidade');
      return sel && sel.options.length > 1;
    }, { timeout: 5_000 });

    await page.locator('#sel-unidade').selectOption({ index: 1 });

    // Linha select deveria popular apos unidade selecionada
    await page.waitForFunction(() => {
      const sel = document.querySelector('#sel-linha');
      return sel && sel.options.length > 1;
    }, { timeout: 5_000 });
  });
});
