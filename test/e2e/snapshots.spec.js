// MADG MES — Visual regression snapshots (TODO-5).
//
// Cobertura: 13 estados estáveis das principais páginas. Cada snapshot
// e' baseline pixel-exato; PRs futuros disparam diff-check automático.
//
// Padrões de robustez:
//   - animations: 'disabled' freeza CSS transitions/animations (Playwright)
//   - mask: [...] obscura inputs de data dinâmicos (page reload muda valor)
//   - waitForTimeout pequeno apos navigate pra ApexCharts terminar render
//   - maxDiffPixels: 100 tolera ~0.01% diff (anti-aliasing entre runs)
//
// Atualizar baselines apos mudanca intencional de UI:
//   npm run test:e2e -- snapshots --update-snapshots
//
// Snapshots por OS: arquivos terminam em -linux/-darwin/-win32. Repo
// versiona apenas linux (CI tambem linux); contributors em outros OS
// terao falha esperada e devem rodar local sem commitar.

import { test, expect, isSupabaseRunningAndSeeded } from './fixtures/auth.js';
import { navigateTo, waitModalOpen, cancelModal } from './helpers.js';

let supabaseLocalReady;
test.beforeAll(async () => {
  supabaseLocalReady = await isSupabaseRunningAndSeeded();
});
test.beforeEach(() => {
  test.skip(!supabaseLocalReady, 'Supabase local indisponivel');
});

// Defaults pra todas as snapshots — animations off, threshold tolerante
const SNAP = {
  animations: 'disabled',
  maxDiffPixels: 100,
};

// Tempo pra graficos ApexCharts renderizarem completamente
const CHART_RENDER_MS = 1500;

test.describe('snapshots — auth states', () => {
  test('login form (default state)', async ({ pageWithLocalSupabase: page }) => {
    await page.goto('/');
    await page.waitForSelector('#login-email', { state: 'visible' });
    // Aguarda foco/transicoes assentarem
    await page.waitForTimeout(200);
    await expect(page).toHaveScreenshot('auth-login.png', SNAP);
  });

  test('login form com erro de credencial', async ({ pageWithLocalSupabase: page }) => {
    await page.goto('/');
    await page.fill('#login-email', 'fake@madg.local');
    await page.fill('#login-senha', 'errada');
    await page.click('#btn-login');
    // Espera mensagem de erro aparecer (state-based)
    await expect(page.locator('#login-error')).toBeVisible();
    await page.waitForTimeout(200);
    await expect(page).toHaveScreenshot('auth-login-erro.png', SNAP);
  });
});

test.describe('snapshots — divinissimo (regular user)', () => {
  test('dashboard OEE', async ({ pageAsDivinissimo: page }) => {
    await navigateTo(page, '#/dashboard');
    await page.waitForTimeout(CHART_RENDER_MS);
    await expect(page).toHaveScreenshot('dashboard-oee.png', {
      ...SNAP,
      // Mask: data filter (current date) + tendencia (depende de dados reais)
      mask: [
        page.locator('#dash-data'),
        page.locator('#dash-tendencia'),
      ],
    });
  });

  test('lista de ordens (vazia para data atual)', async ({ pageAsDivinissimo: page }) => {
    await navigateTo(page, '#/ordens');
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('ordens-lista.png', {
      ...SNAP,
      mask: [page.locator('#filtro-de'), page.locator('#filtro-ate')],
    });
  });

  test('form nova ordem (selects vazios)', async ({ pageAsDivinissimo: page }) => {
    await navigateTo(page, '#/ordens/new');
    // Espera selects popularem com opcoes carregadas async
    await page.waitForFunction(() => {
      const sel = document.querySelector('#sel-unidade');
      return sel && sel.options.length > 1;
    }, { timeout: 5_000 });
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('ordem-form-novo.png', {
      ...SNAP,
      // Mask: data input default (hoje), variável entre runs
      mask: [page.locator('input[type=date]')],
    });
  });

  test('cadastros — unidades list', async ({ pageAsDivinissimo: page }) => {
    await navigateTo(page, '#/cadastros/unidades');
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('cadastros-unidades.png', SNAP);
  });

  test('cadastros — produtos list', async ({ pageAsDivinissimo: page }) => {
    await navigateTo(page, '#/cadastros/produtos');
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('cadastros-produtos.png', SNAP);
  });

  test('cadastros — taxas list', async ({ pageAsDivinissimo: page }) => {
    await navigateTo(page, '#/cadastros/taxas');
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('cadastros-taxas.png', SNAP);
  });

  test('cadastros — motivos list', async ({ pageAsDivinissimo: page }) => {
    await navigateTo(page, '#/cadastros/motivos');
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('cadastros-motivos.png', SNAP);
  });

  test('cadastros — linhas list', async ({ pageAsDivinissimo: page }) => {
    await navigateTo(page, '#/cadastros/linhas');
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('cadastros-linhas.png', SNAP);
  });

  test('modal nova-unidade aberto', async ({ pageAsDivinissimo: page }) => {
    await navigateTo(page, '#/cadastros/unidades');
    await page.click('#btn-nova-unidade');
    await waitModalOpen(page);
    await page.waitForTimeout(200);
    await expect(page).toHaveScreenshot('modal-nova-unidade.png', SNAP);
    await cancelModal(page);
  });
});

test.describe('snapshots — super-admin', () => {
  test('admin/empresas list (4 empresas seed)', async ({ pageAsSuperAdmin: page }) => {
    await navigateTo(page, '#/admin/empresas');
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('admin-empresas.png', SNAP);
  });

  test('admin/usuarios list', async ({ pageAsSuperAdmin: page }) => {
    await navigateTo(page, '#/admin/usuarios');
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('admin-usuarios.png', SNAP);
  });

  test('sidebar com items super-admin visiveis', async ({ pageAsSuperAdmin: page }) => {
    await page.goto('/');
    await page.waitForSelector('.sidebar', { state: 'visible' });
    await page.waitForTimeout(300);
    // So' a sidebar (clip pra reduzir flake da main area)
    const sidebar = page.locator('.sidebar');
    await expect(sidebar).toHaveScreenshot('sidebar-super-admin.png', SNAP);
  });
});
