-- MADG MES — Vincular usuario a empresa
--
-- Apos criar o usuario via tela de cadastro do app,
-- rode este SQL no Supabase SQL Editor para dar acesso.
--
-- Para encontrar o UUID do usuario:
--   SELECT id, email FROM auth.users ORDER BY created_at DESC LIMIT 5;

-- Vincular usuario a Empresa 1 (Divinissimo Alimentos)
INSERT INTO user_empresa (user_id, empresa_id, papel)
VALUES (
  'COLE_O_UUID_DO_USUARIO_AQUI',
  '00000000-0000-0000-0000-000000000001',  -- Divinissimo Alimentos
  'admin'
);

-- Para vincular a Empresa 2 (Metalurgica Exemplo), use:
-- INSERT INTO user_empresa (user_id, empresa_id, papel)
-- VALUES (
--   'COLE_O_UUID_DO_USUARIO_AQUI',
--   '00000000-0000-0000-0000-000000000002',  -- Metalurgica Exemplo
--   'admin'
-- );
