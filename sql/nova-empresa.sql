-- ============================================================
-- MADG MES — Template para criar nova empresa com dados
-- ============================================================
-- INSTRUCOES:
-- 1. Substitua todos os valores entre << >> pelos dados reais
-- 2. Rode este SQL no Supabase SQL Editor
-- 3. Crie o usuario via API admin ou pela tela do app
-- 4. Vincule o usuario no final deste script
-- ============================================================

-- Gerar UUIDs unicos para esta empresa
-- (copie os valores gerados para usar nos INSERTs abaixo)
DO $$
BEGIN
  RAISE NOTICE 'empresa_id:  %', gen_random_uuid();
  RAISE NOTICE 'unidade1_id: %', gen_random_uuid();
  RAISE NOTICE 'unidade2_id: %', gen_random_uuid();
  RAISE NOTICE 'linha1_id:   %', gen_random_uuid();
  RAISE NOTICE 'linha2_id:   %', gen_random_uuid();
  RAISE NOTICE 'linha3_id:   %', gen_random_uuid();
  RAISE NOTICE 'produto1_id: %', gen_random_uuid();
  RAISE NOTICE 'produto2_id: %', gen_random_uuid();
  RAISE NOTICE 'produto3_id: %', gen_random_uuid();
END $$;

-- ============================================================
-- 1. EMPRESA
-- ============================================================
-- Substitua o UUID pelo empresa_id gerado acima
INSERT INTO empresa (id, nome, segmento) VALUES (
  '<<EMPRESA_ID>>',
  '<<NOME DA EMPRESA>>',
  '<<SEGMENTO>>'  -- Alimentos, Metalurgia, Quimico, Vidro, Plasticos, Embalagens, Outro
);

-- ============================================================
-- 2. UNIDADES
-- ============================================================
INSERT INTO unidades (id, empresa_id, nome) VALUES
  ('<<UNIDADE1_ID>>', '<<EMPRESA_ID>>', '<<NOME UNIDADE 1>>'),
  ('<<UNIDADE2_ID>>', '<<EMPRESA_ID>>', '<<NOME UNIDADE 2>>');

-- ============================================================
-- 3. LINHAS DE PRODUCAO
-- ============================================================
INSERT INTO linhas (id, unidade_id, nome, descricao) VALUES
  ('<<LINHA1_ID>>', '<<UNIDADE1_ID>>', '<<NOME LINHA 1>>', '<<DESCRICAO OPCIONAL>>'),
  ('<<LINHA2_ID>>', '<<UNIDADE1_ID>>', '<<NOME LINHA 2>>', NULL),
  ('<<LINHA3_ID>>', '<<UNIDADE2_ID>>', '<<NOME LINHA 3>>', NULL);

-- ============================================================
-- 4. PRODUTOS
-- ============================================================
INSERT INTO produtos (id, empresa_id, codigo, descricao, unidade_medida, peso_unitario) VALUES
  ('<<PRODUTO1_ID>>', '<<EMPRESA_ID>>', '<<COD-001>>', '<<Descricao Produto 1>>', 'kg', NULL),
  ('<<PRODUTO2_ID>>', '<<EMPRESA_ID>>', '<<COD-002>>', '<<Descricao Produto 2>>', 'un', 0.5),
  ('<<PRODUTO3_ID>>', '<<EMPRESA_ID>>', '<<COD-003>>', '<<Descricao Produto 3>>', 'kg', NULL);
-- unidade_medida: kg, un, litros, metros, toneladas

-- ============================================================
-- 5. TAXAS DE PRODUCAO (velocidade por produto x linha)
-- ============================================================
INSERT INTO taxas_producao (produto_id, linha_id, velocidade, unidade_velocidade) VALUES
  ('<<PRODUTO1_ID>>', '<<LINHA1_ID>>', 100, 'kg/h'),
  ('<<PRODUTO1_ID>>', '<<LINHA2_ID>>', 120, 'kg/h'),
  ('<<PRODUTO2_ID>>', '<<LINHA1_ID>>', 500, 'un/h'),
  ('<<PRODUTO2_ID>>', '<<LINHA3_ID>>', 350, 'un/h'),
  ('<<PRODUTO3_ID>>', '<<LINHA2_ID>>', 80, 'kg/h');

-- ============================================================
-- 6. MOTIVOS DE PARADA
-- ============================================================
INSERT INTO motivos_parada (empresa_id, nome, tipo) VALUES
  ('<<EMPRESA_ID>>', 'Quebra mecanica', 'nao_planejada'),
  ('<<EMPRESA_ID>>', 'Setup / Troca', 'setup'),
  ('<<EMPRESA_ID>>', 'Falta de material', 'nao_planejada'),
  ('<<EMPRESA_ID>>', 'Falta de operador', 'nao_planejada'),
  ('<<EMPRESA_ID>>', 'Limpeza', 'planejada'),
  ('<<EMPRESA_ID>>', 'Intervalo / Refeicao', 'planejada'),
  ('<<EMPRESA_ID>>', 'Manutencao preventiva', 'planejada'),
  ('<<EMPRESA_ID>>', 'Ajuste de maquina', 'setup');

-- ============================================================
-- 7. TURNOS
-- ============================================================
INSERT INTO turnos (unidade_id, nome, hora_inicio, hora_fim) VALUES
  ('<<UNIDADE1_ID>>', 'Comercial', '08:00', '18:00'),
  ('<<UNIDADE2_ID>>', '1o Turno', '06:00', '14:00');

-- ============================================================
-- 8. ORDENS DE PRODUCAO (exemplos opcionais)
-- ============================================================
-- Descomente e ajuste para inserir dados de exemplo:
/*
INSERT INTO ordens_producao
  (unidade_id, linha_id, produto_id, data, hora_inicio, hora_fim,
   velocidade_padrao, tempo_planejado, tempo_setup, tempo_parada,
   qtd_produzida, qtd_rejeitada, qtd_reprocesso, observacao)
VALUES
  ('<<UNIDADE1_ID>>', '<<LINHA1_ID>>', '<<PRODUTO1_ID>>',
   '2026-04-15', '08:00', '17:00',
   100, 60, 15, 10,
   650, 12, 5, 'Producao normal');
*/

-- ============================================================
-- 9. VINCULAR USUARIO
-- ============================================================
-- Primeiro, crie o usuario:
--   Opcao A: Pela tela de "Criar conta" do app
--   Opcao B: Via API admin (rode no terminal):
--     curl -X POST "https://SEU-PROJETO.supabase.co/auth/v1/admin/users" \
--       -H "apikey: SUA_SERVICE_ROLE_KEY" \
--       -H "Authorization: Bearer SUA_SERVICE_ROLE_KEY" \
--       -H "Content-Type: application/json" \
--       -d '{"email":"usuario@empresa.com","password":"SenhaSegura123","email_confirm":true}'
--
-- Depois, descubra o UUID:
--   SELECT id, email FROM auth.users ORDER BY created_at DESC LIMIT 5;
--
-- Vincule:

-- INSERT INTO user_empresa (user_id, empresa_id, papel)
-- VALUES ('<<UUID_DO_USUARIO>>', '<<EMPRESA_ID>>', 'admin');
-- papel: admin, gestor, operador, visualizador
