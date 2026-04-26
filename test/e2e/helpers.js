// MADG MES — E2E test helpers compartilhados.
//
// Convencao: helpers retornam Promises. Tests aguardam explicitamente.

import { expect } from '@playwright/test';

/**
 * Navega via hash router (vanilla SPA usa #/route).
 * Aguarda main-content terminar de renderizar conteudo nao-loading.
 */
export async function navigateTo(page, route) {
  await page.click(`.sidebar a[href="${route}"]`);
  // Aguarda o spinner sumir (router carregou pagina nova)
  await page.waitForFunction(() => {
    const main = document.getElementById('main-content');
    return main && !main.querySelector('.spinner');
  }, { timeout: 10_000 });
}

/**
 * Espera toast aparecer com texto especifico (ou qualquer toast se sem texto).
 * Toast desaparece em ~3s, este helper retorna apos detectar.
 */
export async function expectToast(page, text = null, type = null) {
  const selector = type ? `.toast.toast-${type}` : '.toast';
  const toast = page.locator(selector).first();
  await expect(toast).toBeVisible({ timeout: 5_000 });
  if (text) {
    await expect(toast).toContainText(text);
  }
  return toast;
}

/**
 * Confirma dialog UI.confirm() — clica btn-confirm.
 */
export async function confirmDialog(page) {
  await page.click('.btn-confirm');
}

/**
 * Aguarda modal abrir + retorna locator do modal-body.
 */
export async function waitModalOpen(page, titleContains = null) {
  await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 5_000 });
  if (titleContains) {
    await expect(page.locator('.modal-title')).toContainText(titleContains);
  }
  return page.locator('.modal');
}

/**
 * Salva modal (clica btn-save). Confia no fato de que modal fecha
 * em sucesso (UI.modal close() apos toast). Nao assert toast text
 * pra evitar race entre toasts (criar+excluir overlap em 3s).
 */
export async function saveModal(page) {
  await page.click('.modal .btn-save');
  await expect(page.locator('.modal-overlay')).toBeHidden({ timeout: 5_000 });
}

/**
 * Wrapper legado mantido pra retrocompat — usa saveModal sob o capo.
 * @deprecated assertion de toast e' fragil; use saveModal + state check.
 */
export async function saveModalAndExpectToast(page, _expectedToastText = null) {
  await saveModal(page);
}

/**
 * Cancela modal (clica btn-cancel ou modal-close).
 */
export async function cancelModal(page) {
  await page.click('.modal .btn-cancel');
  await expect(page.locator('.modal-overlay')).toBeHidden({ timeout: 5_000 });
}

/**
 * Helper pra cadastros que seguem o pattern unidades.js / linhas.js / etc:
 *   - btn-nova-{kind} pra abrir modal de criacao
 *   - inputs id={kind}-{field} pra preencher
 *   - btn-save pra submeter
 *   - btn-edit / btn-delete por row
 *
 * Retorna o nome usado pra identificacao posterior nas asserts.
 */
export async function createCadastro(page, { newButtonId, fields }) {
  await page.click(`#${newButtonId}`);
  await waitModalOpen(page);

  for (const [inputId, value] of Object.entries(fields)) {
    const input = page.locator(`#${inputId}`);
    const tag = await input.evaluate(el => el.tagName);
    if (tag === 'SELECT') {
      await input.selectOption(value);
    } else {
      await input.fill(value);
    }
  }

  await saveModal(page);
}

/**
 * Deleta a primeira row matching texto via btn-delete + UI.confirm.
 * Aguarda row sumir da tabela (signal de re-render apos delete).
 */
export async function deleteFirstRowMatching(page, rowText) {
  const row = page.locator(`tr:has-text("${rowText}")`).first();
  await expect(row).toBeVisible();
  await row.locator('.btn-delete').click();
  await waitModalOpen(page, 'Confirmar');
  await confirmDialog(page);
  // Confirma que row desapareceu (re-render apos delete)
  await expect(page.locator(`tr:has-text("${rowText}")`)).toHaveCount(0, { timeout: 5_000 });
}
