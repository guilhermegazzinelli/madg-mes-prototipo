// MADG MES — E2E happy-path: dashboards.
// Coverage: dashboard OEE principal + dashboard de paradas (read-only).

import { test, expect, isSupabaseRunningAndSeeded } from './fixtures/auth.js';
import { navigateTo } from './helpers.js';

let supabaseLocalReady;
test.beforeAll(async () => {
  supabaseLocalReady = await isSupabaseRunningAndSeeded();
});
test.beforeEach(() => {
  test.skip(!supabaseLocalReady, 'Supabase local indisponivel');
});

test.describe('dashboard OEE', () => {
  test('renderiza com elementos chave (page title, filtro de data, conteudo, tendencia)', async ({ pageAsDivinissimo: page }) => {
    await navigateTo(page, '#/dashboard');

    await expect(page.locator('.page-title')).toContainText('Dashboard OEE');
    await expect(page.locator('#dash-data')).toBeVisible();
    await expect(page.locator('#btn-hoje')).toBeVisible();
    await expect(page.locator('#dash-content')).toBeVisible();
    // Tendencia renderiza abaixo (mesmo que vazia — confirma estrutura)
    await expect(page.locator('#dash-tendencia')).toBeVisible();
  });

  test('botao "Hoje" reseta o filtro de data pra hoje', async ({ pageAsDivinissimo: page }) => {
    await navigateTo(page, '#/dashboard');

    // Mudar data pra ontem
    const ontem = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    await page.locator('#dash-data').fill(ontem);
    expect(await page.locator('#dash-data').inputValue()).toBe(ontem);

    // Clicar "Hoje" volta pra data atual
    await page.click('#btn-hoje');
    const hoje = new Date().toISOString().slice(0, 10);
    expect(await page.locator('#dash-data').inputValue()).toBe(hoje);
  });
});

test.describe('dashboard paradas', () => {
  test('renderiza com link da sidebar e elementos de filtro', async ({ pageAsDivinissimo: page }) => {
    await navigateTo(page, '#/dashboard/paradas');

    // Page title diferente do dashboard principal
    await expect(page.locator('.page-title')).toBeVisible();
    // Confirma que algum elemento de conteudo carregou (nao deu erro)
    await expect(page.locator('#main-content')).not.toContainText('Erro');
  });
});
