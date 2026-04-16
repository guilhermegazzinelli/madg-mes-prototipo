-- ============================================================
-- MADG MES — Exemplo real: HAOMA Chocolates
-- ============================================================
-- Exemplo de uso do template criar-empresa.sql com dados reais
-- do catalogo HAOMA (haoma.com.br).
--
-- Empresa: HAOMA — confeitaria premium (chocolates, marshmallows,
-- bombons, pacocas, biscottinos).
--
-- Estrutura simulada:
--   1 unidade (Fabrica Sao Paulo)
--   2 linhas de producao:
--     Linha 01 — Nuage (marshmallows em lata e pouch)
--     Linha 02 — Confeitos (bombons, pacocas, biscottinos)
--
-- COMO USAR:
--   1. schema.sql ja deve estar aplicado
--   2. Rode este script inteiro no Supabase SQL Editor
--   3. O usuario admin@haoma.com e criado automaticamente com uma
--      SENHA TEMPORARIA ALEATORIA (exibida na aba Messages ao final).
--      Copie a senha do RAISE NOTICE e troque no 1o login.
--
-- Para usar uma senha especifica, edite a variavel v_user_password
-- localmente ANTES de rodar (nao comite com senha hardcoded).
-- ============================================================

DO $$
DECLARE
  -- ==========================================================
  -- CONFIGURACAO — HAOMA
  -- ==========================================================

  -- EMPRESA
  v_nome_empresa  TEXT := 'HAOMA Chocolates';
  v_segmento      TEXT := 'Alimentos';

  -- UNIDADES
  v_unidades TEXT[] := ARRAY[
    'Fabrica Sao Paulo'
  ];

  -- LINHAS (indice_unidade|nome|descricao)
  v_linhas TEXT[] := ARRAY[
    '1|Linha 01 - Nuage|Envase de marshmallow em lata e pouch',
    '1|Linha 02 - Confeitos|Producao de bombons, pacocas e biscottinos'
  ];

  -- PRODUTOS (codigo|descricao|unidade_medida|peso_unitario em kg)
  -- Produtos reais do catalogo HAOMA
  v_produtos TEXT[] := ARRAY[
    -- Linha Nuage
    'NUAGE-TRAD-120|Nuage Tradicional Lata 120g|un|0.120',
    'NUAGE-FV-120|Nuage Frutas Vermelhas Lata 120g|un|0.120',
    'NUAGE-MAR-120|Nuage Maracuja Lata 120g|un|0.120',
    'NUAGE-TRAD-180|Nuage Tradicional Pouch 180g|un|0.180',
    'NUAGE-LIMIR-180|Nuage Limao e Mirtilo Pouch 180g|un|0.180',
    -- Linha Confeitos
    'BOMBOM-AVEL-80|Bombom Avela Pack 80g|un|0.080',
    'BOMBOM-AMEND-80|Bombom Amendoim Pack 80g|un|0.080',
    'BOMBOM-CB-80|Bombom Chocolate Branco Pack 80g|un|0.080',
    'PACOCA-CHOC-112|Pacoca Chocolate 56% 112,5g|un|0.1125',
    'PACOCA-CAJU-112|Pacoca Castanha de Caju e Coco 112,5g|un|0.1125',
    'BISCOTT-CHOC-84|Biscottino Chocolate 56% 84g|un|0.084',
    'BISCOTT-PIST-84|Biscottino Pistache com Chocolate Branco 84g|un|0.084'
  ];

  -- TAXAS DE PRODUCAO (indice_produto|indice_linha|velocidade|unidade)
  -- Numeros estimados para exemplo; ajustar com dados reais da operacao
  v_taxas TEXT[] := ARRAY[
    -- Linha 01 (Nuage): latas mais rapidas, pouch mais lento
    '1|1|800|un/h',     -- Nuage Trad Lata
    '2|1|800|un/h',     -- Nuage FV Lata
    '3|1|800|un/h',     -- Nuage Maracuja Lata
    '4|1|500|un/h',     -- Nuage Trad Pouch
    '5|1|500|un/h',     -- Nuage Lim/Mirt Pouch
    -- Linha 02 (Confeitos): velocidades por tipo
    '6|2|600|un/h',     -- Bombom Avela
    '7|2|600|un/h',     -- Bombom Amendoim
    '8|2|600|un/h',     -- Bombom CB
    '9|2|450|un/h',     -- Pacoca Chocolate
    '10|2|450|un/h',    -- Pacoca Caju
    '11|2|700|un/h',    -- Biscottino Chocolate
    '12|2|700|un/h'     -- Biscottino Pistache
  ];

  -- MOTIVOS DE PARADA — adaptados para confeitaria
  v_motivos TEXT[] := ARRAY[
    'Setup / Troca de sabor|setup',
    'Troca de embalagem|setup',
    'Falta de cobertura de chocolate|nao_planejada',
    'Falta de embalagem primaria|nao_planejada',
    'Ajuste de temperagem|setup',
    'Quebra mecanica|nao_planejada',
    'Limpeza entre lotes|planejada',
    'Sanitizacao|planejada',
    'Intervalo / Refeicao|planejada',
    'Manutencao preventiva|planejada',
    'Falta de operador|nao_planejada',
    'Parada para validacao de qualidade|planejada'
  ];

  -- TURNOS (indice_unidade|nome|hora_inicio|hora_fim)
  v_turnos TEXT[] := ARRAY[
    '1|1o Turno|06:00|14:00',
    '1|2o Turno|14:00|22:00',
    '1|Administrativo|08:00|18:00'
  ];

  -- USUARIO — criado automaticamente em auth.users com senha aleatoria
  -- A senha gerada aparece no RAISE NOTICE final (aba Messages)
  v_user_email    TEXT := 'admin@haoma.com';
  v_user_password TEXT := encode(gen_random_bytes(9), 'base64');  -- ~12 chars
  v_user_papel    TEXT := 'admin';

  -- ==========================================================
  -- FIM DA CONFIGURACAO
  -- ==========================================================

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
  -- 1. EMPRESA
  INSERT INTO empresa (id, nome, segmento)
  VALUES (v_empresa_id, v_nome_empresa, v_segmento);
  RAISE NOTICE '[OK] Empresa criada: % (id=%)', v_nome_empresa, v_empresa_id;

  -- 2. UNIDADES
  FOREACH v_item IN ARRAY v_unidades LOOP
    v_new_id := gen_random_uuid();
    INSERT INTO unidades (id, empresa_id, nome)
    VALUES (v_new_id, v_empresa_id, v_item);
    v_unidade_ids := array_append(v_unidade_ids, v_new_id);
  END LOOP;
  RAISE NOTICE '[OK] % unidades criadas', array_length(v_unidade_ids, 1);

  -- 3. LINHAS
  FOREACH v_item IN ARRAY v_linhas LOOP
    v_parts := string_to_array(v_item, '|');
    v_idx := v_parts[1]::INT;
    v_new_id := gen_random_uuid();
    INSERT INTO linhas (id, unidade_id, nome, descricao)
    VALUES (v_new_id, v_unidade_ids[v_idx], v_parts[2], NULLIF(v_parts[3], ''));
    v_linha_ids := array_append(v_linha_ids, v_new_id);
  END LOOP;
  RAISE NOTICE '[OK] % linhas criadas', array_length(v_linha_ids, 1);

  -- 4. PRODUTOS
  FOREACH v_item IN ARRAY v_produtos LOOP
    v_parts := string_to_array(v_item, '|');
    v_peso := NULLIF(v_parts[4], '')::NUMERIC;
    v_new_id := gen_random_uuid();
    INSERT INTO produtos (id, empresa_id, codigo, descricao, unidade_medida, peso_unitario)
    VALUES (v_new_id, v_empresa_id, v_parts[1], v_parts[2], v_parts[3], v_peso);
    v_produto_ids := array_append(v_produto_ids, v_new_id);
  END LOOP;
  RAISE NOTICE '[OK] % produtos criados', array_length(v_produto_ids, 1);

  -- 5. TAXAS
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

  -- 6. MOTIVOS
  v_count := 0;
  FOREACH v_item IN ARRAY v_motivos LOOP
    v_parts := string_to_array(v_item, '|');
    INSERT INTO motivos_parada (empresa_id, nome, tipo)
    VALUES (v_empresa_id, v_parts[1], v_parts[2]);
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE '[OK] % motivos de parada criados', v_count;

  -- 7. TURNOS
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

  -- 8. CRIAR E VINCULAR USUARIO
  IF v_user_email IS NOT NULL THEN
    SELECT id INTO v_user_id FROM auth.users WHERE email = v_user_email LIMIT 1;

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
      RAISE WARNING '[!] Usuario % nao existe e senha nao foi informada', v_user_email;
    ELSE
      INSERT INTO user_empresa (user_id, empresa_id, papel)
      VALUES (v_user_id, v_empresa_id, v_user_papel)
      ON CONFLICT (user_id, empresa_id) DO UPDATE SET papel = EXCLUDED.papel;
      RAISE NOTICE '[OK] Usuario % vinculado como %', v_user_email, v_user_papel;
    END IF;
  END IF;

  RAISE NOTICE '============================================';
  RAISE NOTICE 'HAOMA CRIADA COM SUCESSO';
  RAISE NOTICE '  empresa_id  = %', v_empresa_id;
  RAISE NOTICE '  login       = %', v_user_email;
  RAISE NOTICE '  senha temp. = %   <-- TROCAR NO 1o LOGIN', v_user_password;
  RAISE NOTICE '============================================';

END $$;

-- ============================================================
-- VERIFICACAO
-- ============================================================
-- SELECT e.nome AS empresa, u.nome AS unidade, l.nome AS linha,
--        COUNT(DISTINCT t.produto_id) AS produtos_na_linha
-- FROM empresa e
-- JOIN unidades u ON u.empresa_id = e.id
-- JOIN linhas l ON l.unidade_id = u.id
-- LEFT JOIN taxas_producao t ON t.linha_id = l.id
-- WHERE e.nome = 'HAOMA Chocolates'
-- GROUP BY e.nome, u.nome, l.nome
-- ORDER BY l.nome;
