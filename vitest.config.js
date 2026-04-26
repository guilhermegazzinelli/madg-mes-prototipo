// MADG MES — Vitest config
// Documentação: https://vitest.dev/config/
//
// Filosofia:
//   - Tests vivem em test/ na raiz
//   - Tudo .test.js / .spec.js dentro de test/ é descoberto automaticamente
//   - Sem JSDOM no v1: o frontend é vanilla <script src> sem ES modules,
//     então não testamos componentes do frontend aqui. Cross-tenant test
//     (Item 2) chama Supabase REST direto via @supabase/supabase-js — Node puro.
//   - Adicionar JSDOM/Playwright em arquivos de config separados quando
//     Item 1d (Playwright happy-path) chegar.

export default {
  test: {
    include: ['test/**/*.{test,spec}.{js,mjs,ts}'],
    exclude: ['node_modules', 'dist', '.git', 'test/e2e/**'],
    reporters: ['default'],
    // Sem coverage por padrão — habilitar via `npm run test:coverage`

    // Cross-tenant tests compartilham 1 super-admin user (seed).
    // Arquivos paralelos brigando por super_admin_context (UPSERT row
    // unica) geram race: arquivo A seta context, arquivo B limpa via
    // beforeEach, arquivo A le e ve null.
    // Desabilitar fileParallelism custa ~2s extras no full run mas
    // elimina a classe inteira de races. Vale a pena pra suite RLS.
    fileParallelism: false,
  },
};
