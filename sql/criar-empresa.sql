-- ============================================================
-- MADG MES — Criacao automatizada de empresa por parametros
-- ============================================================
--
-- O QUE ESTE SCRIPT FAZ:
--   Cria uma empresa completa (empresa, unidades, linhas, produtos,
--   taxas de producao, motivos de parada, turnos) e opcionalmente
--   vincula um usuario ja existente no Supabase Auth. Tudo em uma
--   unica transacao — se algo falhar, nada e persistido.
--
-- ------------------------------------------------------------
-- COMO INSERIR / USAR (passo-a-passo):
-- ------------------------------------------------------------
--
-- PASSO 1 — Pre-requisitos
--   a) schema.sql ja executado no banco
--   b) (opcional, se for vincular usuario ja no script)
--      usuario criado em auth.users — pode ser:
--        - tela "Criar conta" do proprio app, OU
--        - Supabase Dashboard > Authentication > Users > "Add user", OU
--        - API admin:
--          curl -X POST "https://SEU-PROJETO.supabase.co/auth/v1/admin/users" \
--            -H "apikey: SERVICE_ROLE_KEY" \
--            -H "Authorization: Bearer SERVICE_ROLE_KEY" \
--            -H "Content-Type: application/json" \
--            -d '{"email":"user@empresa.com","password":"Senha123","email_confirm":true}'
--
-- PASSO 2 — Configurar os dados da empresa
--   Edite APENAS o bloco "CONFIGURACAO" abaixo (variaveis v_*).
--   Nao precisa mexer no restante do script.
--
--   Formato dos arrays (campos separados por "|"):
--     v_unidades:  'Nome da Unidade'
--     v_linhas:    'indice_unidade|nome|descricao'
--                  (indice_unidade = posicao 1-based em v_unidades)
--     v_produtos:  'codigo|descricao|unidade_medida|peso_unitario'
--                  (unidade_medida: kg, un, litros, metros, toneladas)
--                  (peso_unitario: deixe vazio '' para NULL)
--     v_taxas:     'indice_produto|indice_linha|velocidade|unidade_velocidade'
--                  (indices referenciam a ordem em v_produtos e v_linhas)
--     v_motivos:   'nome|tipo'
--                  (tipo: planejada, nao_planejada, setup)
--     v_turnos:    'indice_unidade|nome|hora_inicio|hora_fim'
--                  (horas no formato HH:MM 24h)
--
-- PASSO 3 — Rodar o script
--   a) Abra o Supabase SQL Editor (ou psql / DBeaver)
--   b) Cole o script inteiro
--   c) Execute (Ctrl+Enter / Run)
--   d) Se houver erro, a transacao inteira e revertida (rollback)
--
-- PASSO 4 — Conferir o resultado
--   Os IDs gerados aparecem na aba "Messages" (Supabase SQL Editor)
--   ou no log do psql via RAISE NOTICE. Copie o empresa_id se precisar
--   depois. Voce tambem pode descomentar o SELECT de verificacao no
--   final do arquivo.
--
-- PASSO 5 — Vincular usuarios adicionais (depois)
--   Se quiser adicionar mais usuarios na mesma empresa depois:
--     INSERT INTO user_empresa (user_id, empresa_id, papel)
--     VALUES (
--       (SELECT id FROM auth.users WHERE email='outro@empresa.com'),
--       '<EMPRESA_ID_GERADO>',
--       'operador'   -- admin, gestor, operador, visualizador
--     );
--
-- ------------------------------------------------------------
-- EXEMPLOS PRONTOS:
--   Ver sql/exemplo-haoma.sql (case real com dados da HAOMA)
-- ============================================================

DO $$
DECLARE
  -- ==========================================================
  -- CONFIGURACAO — edite os valores abaixo
  -- ==========================================================

  -- EMPRESA
  v_nome_empresa  TEXT := 'Minha Empresa Ltda';
  v_segmento      TEXT := 'Alimentos';  -- Alimentos, Metalurgia, Quimico, Vidro, Plasticos, Embalagens, Outro

  -- UNIDADES (array — adicione/remova conforme necessario)
  v_unidades TEXT[] := ARRAY[
    'Unidade Matriz',
    'Unidade Filial'
  ];

  -- LINHAS (formato: 'indice_unidade|nome|descricao')
  -- indice_unidade refere-se a posicao no array v_unidades (1-based)
  v_linhas TEXT[] := ARRAY[
    '1|Linha 01 - Envase|Envase automatico',
    '1|Linha 02 - Embalagem|Embalagem secundaria',
    '2|Linha 03 - Producao|Linha principal da filial'
  ];

  -- PRODUTOS (formato: 'codigo|descricao|unidade_medida|peso_unitario')
  -- unidade_medida: kg, un, litros, metros, toneladas
  -- peso_unitario: pode ser NULL (passe string vazia)
  v_produtos TEXT[] := ARRAY[
    'PRD-001|Produto A 500g|kg|0.5',
    'PRD-002|Produto B 1kg|kg|1.0',
    'PRD-003|Produto C unitario|un|'
  ];

  -- TAXAS DE PRODUCAO (formato: 'indice_produto|indice_linha|velocidade|unidade_velocidade')
  v_taxas TEXT[] := ARRAY[
    '1|1|100|kg/h',
    '1|2|120|kg/h',
    '2|1|500|kg/h',
    '3|3|350|un/h'
  ];

  -- MOTIVOS DE PARADA (formato: 'nome|tipo')
  -- tipo: planejada, nao_planejada, setup
  v_motivos TEXT[] := ARRAY[
    'Quebra mecanica|nao_planejada',
    'Setup / Troca|setup',
    'Falta de material|nao_planejada',
    'Falta de operador|nao_planejada',
    'Limpeza|planejada',
    'Intervalo / Refeicao|planejada',
    'Manutencao preventiva|planejada',
    'Ajuste de maquina|setup'
  ];

  -- TURNOS (formato: 'indice_unidade|nome|hora_inicio|hora_fim')
  v_turnos TEXT[] := ARRAY[
    '1|Comercial|08:00|18:00',
    '1|Noturno|22:00|06:00',
    '2|1o Turno|06:00|14:00'
  ];

  -- USUARIO (opcional) — deixe v_user_email = NULL se nao quer criar agora
  -- Se v_user_password for preenchido, o usuario e CRIADO em auth.users.
  -- Se v_user_password for NULL e v_user_email preenchido, tenta vincular
  -- um usuario ja existente.
  -- ATENCAO: senha fica em claro no SQL — nao comite esse arquivo com
  --          senhas reais. Prefira senhas temporarias e trocar no 1o login.
  v_user_email    TEXT := NULL;             -- ex: 'admin@minhaempresa.com'
  v_user_password TEXT := NULL;             -- ex: 'Senha@2026' (NULL = nao cria)
  v_user_papel    TEXT := 'admin';          -- admin, gestor, operador, visualizador

  -- ==========================================================
  -- FIM DA CONFIGURACAO — nao precisa editar daqui pra baixo
  -- ==========================================================

  -- variaveis internas
  v_empresa_id    UUID := gen_random_uuid();
  v_unidade_ids   UUID[] := '{}';
  v_linha_ids     UUID[] := '{}';
  v_produto_ids   UUID[] := '{}';
  v_user_id       UUID;
  v_item          TEXT;
  v_parts         TEXT[];
  v_new_id        UUID;
  v_idx           INT;
  v_peso          NUMERIC;
  v_count         INT;

BEGIN
  -- ==========================================================
  -- 1. EMPRESA
  -- ==========================================================
  INSERT INTO empresa (id, nome, segmento)
  VALUES (v_empresa_id, v_nome_empresa, v_segmento);

  RAISE NOTICE '[OK] Empresa criada: % (id=%)', v_nome_empresa, v_empresa_id;

  -- ==========================================================
  -- 2. UNIDADES
  -- ==========================================================
  FOREACH v_item IN ARRAY v_unidades LOOP
    v_new_id := gen_random_uuid();
    INSERT INTO unidades (id, empresa_id, nome)
    VALUES (v_new_id, v_empresa_id, v_item);
    v_unidade_ids := array_append(v_unidade_ids, v_new_id);
  END LOOP;
  RAISE NOTICE '[OK] % unidades criadas', array_length(v_unidade_ids, 1);

  -- ==========================================================
  -- 3. LINHAS
  -- ==========================================================
  FOREACH v_item IN ARRAY v_linhas LOOP
    v_parts := string_to_array(v_item, '|');
    v_idx := v_parts[1]::INT;
    v_new_id := gen_random_uuid();
    INSERT INTO linhas (id, unidade_id, nome, descricao)
    VALUES (
      v_new_id,
      v_unidade_ids[v_idx],
      v_parts[2],
      NULLIF(v_parts[3], '')
    );
    v_linha_ids := array_append(v_linha_ids, v_new_id);
  END LOOP;
  RAISE NOTICE '[OK] % linhas criadas', array_length(v_linha_ids, 1);

  -- ==========================================================
  -- 4. PRODUTOS
  -- ==========================================================
  FOREACH v_item IN ARRAY v_produtos LOOP
    v_parts := string_to_array(v_item, '|');
    v_peso := NULLIF(v_parts[4], '')::NUMERIC;
    v_new_id := gen_random_uuid();
    INSERT INTO produtos (id, empresa_id, codigo, descricao, unidade_medida, peso_unitario)
    VALUES (
      v_new_id,
      v_empresa_id,
      v_parts[1],
      v_parts[2],
      v_parts[3],
      v_peso
    );
    v_produto_ids := array_append(v_produto_ids, v_new_id);
  END LOOP;
  RAISE NOTICE '[OK] % produtos criados', array_length(v_produto_ids, 1);

  -- ==========================================================
  -- 5. TAXAS DE PRODUCAO
  -- ==========================================================
  v_count := 0;
  FOREACH v_item IN ARRAY v_taxas LOOP
    v_parts := string_to_array(v_item, '|');
    INSERT INTO taxas_producao (produto_id, linha_id, velocidade, unidade_velocidade)
    VALUES (
      v_produto_ids[v_parts[1]::INT],
      v_linha_ids[v_parts[2]::INT],
      v_parts[3]::NUMERIC,
      v_parts[4]
    );
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE '[OK] % taxas de producao criadas', v_count;

  -- ==========================================================
  -- 6. MOTIVOS DE PARADA
  -- ==========================================================
  v_count := 0;
  FOREACH v_item IN ARRAY v_motivos LOOP
    v_parts := string_to_array(v_item, '|');
    INSERT INTO motivos_parada (empresa_id, nome, tipo)
    VALUES (v_empresa_id, v_parts[1], v_parts[2]);
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE '[OK] % motivos de parada criados', v_count;

  -- ==========================================================
  -- 7. TURNOS
  -- ==========================================================
  v_count := 0;
  FOREACH v_item IN ARRAY v_turnos LOOP
    v_parts := string_to_array(v_item, '|');
    INSERT INTO turnos (unidade_id, nome, hora_inicio, hora_fim)
    VALUES (
      v_unidade_ids[v_parts[1]::INT],
      v_parts[2],
      v_parts[3]::TIME,
      v_parts[4]::TIME
    );
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE '[OK] % turnos criados', v_count;

  -- ==========================================================
  -- 8. CRIAR E/OU VINCULAR USUARIO (opcional)
  -- ==========================================================
  IF v_user_email IS NOT NULL THEN
    SELECT id INTO v_user_id FROM auth.users WHERE email = v_user_email LIMIT 1;

    -- Se nao existe e senha foi fornecida, cria o usuario direto em auth.users
    IF v_user_id IS NULL AND v_user_password IS NOT NULL THEN
      v_user_id := gen_random_uuid();

      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, recovery_sent_at, last_sign_in_at,
        raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_user_id,
        'authenticated',
        'authenticated',
        v_user_email,
        crypt(v_user_password, gen_salt('bf')),
        now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{}'::jsonb,
        now(), now(),
        '', '', '', ''
      );

      INSERT INTO auth.identities (
        id, user_id, provider_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(),
        v_user_id,
        v_user_email,
        jsonb_build_object('sub', v_user_id::text, 'email', v_user_email),
        'email',
        now(), now(), now()
      );

      RAISE NOTICE '[OK] Usuario % criado em auth.users (id=%)', v_user_email, v_user_id;
    END IF;

    IF v_user_id IS NULL THEN
      RAISE WARNING '[!] Usuario % nao existe e nao foi fornecida senha — vincule depois manualmente', v_user_email;
    ELSE
      INSERT INTO user_empresa (user_id, empresa_id, papel)
      VALUES (v_user_id, v_empresa_id, v_user_papel)
      ON CONFLICT (user_id, empresa_id) DO UPDATE SET papel = EXCLUDED.papel;
      RAISE NOTICE '[OK] Usuario % vinculado como %', v_user_email, v_user_papel;
    END IF;
  END IF;

  -- ==========================================================
  -- RESUMO
  -- ==========================================================
  RAISE NOTICE '============================================';
  RAISE NOTICE 'EMPRESA CRIADA COM SUCESSO';
  RAISE NOTICE '  empresa_id = %', v_empresa_id;
  RAISE NOTICE '  unidades   = %', v_unidade_ids;
  RAISE NOTICE '  linhas     = %', v_linha_ids;
  RAISE NOTICE '  produtos   = %', v_produto_ids;
  RAISE NOTICE '============================================';

END $$;

-- ============================================================
-- VERIFICACAO (opcional) — rode para conferir o que foi criado
-- ============================================================
-- SELECT e.nome as empresa, u.nome as unidade, l.nome as linha
-- FROM empresa e
-- LEFT JOIN unidades u ON u.empresa_id = e.id
-- LEFT JOIN linhas l ON l.unidade_id = u.id
-- WHERE e.nome = 'Minha Empresa Ltda'
-- ORDER BY u.nome, l.nome;
