// MADG MES — E2E happy-path: cadastros (5 paginas, mesma estrutura).
//
// Cadastros cobertos: unidades, linhas, produtos, taxas, motivos.
// Cada um: navega -> ve lista -> abre modal nova -> preenche -> salva ->
// confirma row na tabela -> deleta row de teste.
//
// Pattern compartilhado em test/e2e/helpers.js.

import { test, expect, EMAILS, PASSWORD, isSupabaseRunningAndSeeded } from './fixtures/auth.js';
import { navigateTo, createCadastro, deleteFirstRowMatching, waitModalOpen, saveModal } from './helpers.js';

let supabaseLocalReady;
test.beforeAll(async () => {
  supabaseLocalReady = await isSupabaseRunningAndSeeded();
});
test.beforeEach(() => {
  test.skip(!supabaseLocalReady, 'Supabase local indisponivel');
});

// Suffix unique-per-run pra nao colidir com fixtures previos / paralelos
const RUN_TAG = `e2e-${Date.now()}`;

test.describe('cadastros — unidades', () => {
  test('navega -> cria -> ve na lista -> deleta', async ({ pageAsDivinissimo: page }) => {
    await navigateTo(page, '#/cadastros/unidades');

    await expect(page.locator('.page-title')).toContainText('Unidades');
    await expect(page.locator('#btn-nova-unidade')).toBeVisible();

    const nome = `Unidade ${RUN_TAG}`;
    await createCadastro(page, {
      newButtonId: 'btn-nova-unidade',
      fields: { 'unidade-nome': nome },
    });

    // Row aparece na tabela (signal de sucesso suficiente)
    await expect(page.locator(`tr:has-text("${nome}")`)).toBeVisible({ timeout: 5_000 });

    // Cleanup
    await deleteFirstRowMatching(page, nome);
  });
});

test.describe('cadastros — linhas', () => {
  test('navega -> cria -> ve na lista -> deleta', async ({ pageAsDivinissimo: page }) => {
    await navigateTo(page, '#/cadastros/linhas');

    await expect(page.locator('.page-title')).toContainText('Linhas');
    await expect(page.locator('#btn-nova-linha')).toBeVisible();

    const nome = `Linha ${RUN_TAG}`;
    await page.click('#btn-nova-linha');
    await waitModalOpen(page);

    // Select da unidade via attribute name=unidade_id (UI.select gera assim)
    await page.locator('[name=unidade_id]').selectOption({ index: 1 });
    await page.fill('#linha-nome', nome);

    await saveModal(page);

    await expect(page.locator(`tr:has-text("${nome}")`)).toBeVisible({ timeout: 5_000 });
    await deleteFirstRowMatching(page, nome);
  });
});

test.describe('cadastros — produtos', () => {
  test('navega -> cria -> ve na lista -> deleta', async ({ pageAsDivinissimo: page }) => {
    await navigateTo(page, '#/cadastros/produtos');

    await expect(page.locator('.page-title')).toContainText('Produtos');
    await expect(page.locator('#btn-novo-produto')).toBeVisible();

    const codigo = `E2E-${RUN_TAG.substring(0, 12)}`;  // Cap em 16 chars
    const descricao = `Produto E2E ${RUN_TAG}`;

    await createCadastro(page, {
      newButtonId: 'btn-novo-produto',
      fields: {
        'prod-codigo': codigo,
        'prod-desc': descricao,
      },
    });

    await expect(page.locator(`tr:has-text("${codigo}")`)).toBeVisible({ timeout: 5_000 });
    await deleteFirstRowMatching(page, codigo);
  });
});

test.describe('cadastros — motivos de parada', () => {
  test('navega -> cria -> ve na lista -> deleta', async ({ pageAsDivinissimo: page }) => {
    await navigateTo(page, '#/cadastros/motivos');

    await expect(page.locator('.page-title')).toContainText('Motivos');
    await expect(page.locator('#btn-novo-motivo')).toBeVisible();

    const nome = `Motivo ${RUN_TAG}`;
    await page.click('#btn-novo-motivo');
    await waitModalOpen(page);
    await page.fill('#motivo-nome', nome);
    // tipo e' select com opcoes planejada/nao_planejada/setup
    await page.locator('#motivo-tipo').selectOption('planejada');

    await saveModal(page);

    await expect(page.locator(`tr:has-text("${nome}")`)).toBeVisible({ timeout: 5_000 });
    await deleteFirstRowMatching(page, nome);
  });
});

test.describe('cadastros — taxas de producao', () => {
  test('navega + ve lista (CRUD pulado: precisa produto+linha existente nao-conflitante)', async ({ pageAsDivinissimo: page }) => {
    await navigateTo(page, '#/cadastros/taxas');

    await expect(page.locator('.page-title')).toContainText('Taxas');
    // Lista renderiza (mesmo que vazia pra divinissimo). Confirmar button "Nova" presente.
    await expect(page.locator('#btn-nova-taxa')).toBeVisible();

    // CRUD completo pulado: taxa exige produto_id + linha_id nao-usado
    // (UNIQUE constraint). Stable IDs do seed ocupam quase todos
    // combos. Cobrir CRUD completo aqui requer fixture builder mais
    // sofisticado — vira TODO se for prioritario.
  });
});
