// MADG MES — Playwright config (Item 1d).
// Documentacao: https://playwright.dev/docs/test-configuration
//
// Filosofia:
//   - Tests E2E em test/e2e/ (separados do vitest em test/schema.test.js,
//     test/cross-tenant/, test/helpers/)
//   - Spawn dev server local (npx serve public) automaticamente via webServer
//   - Tests apontam pro Supabase LOCAL (Docker) via window.__SUPABASE_*_OVERRIDE
//     em fixtures/auth.js — supabase.js da app le esse override antes do
//     fallback pra URL prod hardcoded
//   - Skip silently no CI ate workflow especifico ser configurado (pra nao
//     rodar contra Supabase prod do cliente)
//   - Sem snapshots visuais nesse phase (TODO-5 trata disso)

import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8080';

export default defineConfig({
  testDir: './test/e2e',
  testMatch: '**/*.spec.js',

  // Tests sao rapidos (lookups DOM em SPA estatica) — timeout generoso
  // pro caso de Supabase local estar lento na primeira query.
  timeout: 30_000,
  expect: { timeout: 5_000 },

  // Sem retry — se falhou a 1a, falhou. Forca tests deterministicos.
  retries: 0,

  // Sequencial entre arquivos — same-user fixture compartilhada via
  // storageState. Paralelismo dentro do mesmo arquivo OK (cada test
  // tem own page).
  workers: 1,

  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Spawna `npx serve public` automaticamente. Reutiliza se ja estiver up.
  webServer: {
    command: 'npx serve public -l 8080',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
