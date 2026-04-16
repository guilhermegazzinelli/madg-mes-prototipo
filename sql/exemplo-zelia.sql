-- ============================================================
-- MADG MES — Exemplo real: Goiabada da Zelia
-- ============================================================
-- Exemplo de uso do template criar-empresa.sql com dados reais
-- do catalogo Goiabada Zelia (goiabadazelia.com.br/produtos).
--
-- Empresa: Goiabada da Zelia — doceria mineira tradicional
-- (goiabadas, bananadas, mangadas em barras, latas e potes).
--
-- Estrutura:
--   1 unidade (Fabrica Minas Gerais)
--   4 linhas de producao:
--     Linha 01 — Barras (goiabadas e bananadas em barra)
--     Linha 02 — Latas Varejo (enlatados ate 800g)
--     Linha 03 — Potes (goiabadas em pote plastico)
--     Linha 04 — Industrial (latas grandes 10kg, 25kg, 50kg)
--
-- COMO USAR:
--   1. schema.sql ja aplicado
--   2. Rode este script inteiro no Supabase SQL Editor
--   3. Usuario admin@goiabadazelia.com.br e criado com uma
--      SENHA TEMPORARIA ALEATORIA (exibida no RAISE NOTICE final).
--      Copie da aba Messages e troque no 1o login.
--
-- Para usar uma senha especifica, edite v_user_password localmente
-- ANTES de rodar (nao comite com senha hardcoded).
-- ============================================================

DO $$
DECLARE
  -- ==========================================================
  -- CONFIGURACAO — Goiabada da Zelia
  -- ==========================================================

  v_nome_empresa  TEXT := 'Goiabada da Zelia';
  v_segmento      TEXT := 'Alimentos';

  v_unidades TEXT[] := ARRAY[
    'Fabrica Minas Gerais'
  ];

  -- LINHAS (indice_unidade|nome|descricao)
  v_linhas TEXT[] := ARRAY[
    '1|Linha 01 - Barras|Envase de goiabadas e bananadas em barra',
    '1|Linha 02 - Latas Varejo|Envase de enlatados ate 800g (goiabada, bananada, mangada)',
    '1|Linha 03 - Potes|Envase de goiabadas em pote plastico',
    '1|Linha 04 - Industrial|Envase de latas grandes (10kg, 25kg, 50kg) para food service'
  ];

  -- PRODUTOS reais do catalogo Zelia
  -- (codigo|descricao|unidade_medida|peso_unitario em kg)
  v_produtos TEXT[] := ARRAY[
    -- Linha 01 - Barras
    'BARRA-GC-250|Goiabada Cascao Barra 250g|un|0.250',
    'BARRA-GC-L250|Goiabada Cascao Light Barra 250g|un|0.250',
    'BARRA-GC-500|Goiabada Cascao Barra 500g|un|0.500',
    'BARRA-GC-600|Goiabada Cascao Barra 600g|un|0.600',
    'BARRA-GC-800|Goiabada Cascao Barra 800g|un|0.800',
    'BARRA-BAN-250|Bananada Barra 250g|un|0.250',
    'BARRA-BAN-S250|Bananada Sem Acucar Barra 250g|un|0.250',
    -- Linha 02 - Latas Varejo
    'LATA-GC-400|Goiabada Cascao Lata 400g|un|0.400',
    'LATA-GC-800|Goiabada Cascao Lata 800g|un|0.800',
    'LATA-BAN-400|Bananada Lata 400g|un|0.400',
    'LATA-BAN-Z400|Bananada Zero Lata 400g|un|0.400',
    'LATA-BAN-800|Bananada Lata 800g|un|0.800',
    'LATA-MAN-400|Mangada Lata 400g|un|0.400',
    -- Linha 03 - Potes
    'POTE-GC-250|Goiabada Cascao Pote 250g|un|0.250',
    'POTE-GC-700|Goiabada Cascao Pote 700g|un|0.700',
    -- Linha 04 - Industrial
    'IND-GC-10K|Goiabada Cascao Lata 10kg|un|10.000',
    'IND-GC-25K|Goiabada Cascao Bloco 25kg|un|25.000',
    'IND-GC-50K|Goiabada Cascao Bloco 50kg|un|50.000'
  ];

  -- TAXAS DE PRODUCAO (indice_produto|indice_linha|velocidade|unidade)
  -- Velocidades estimativas — ajustar com dados reais da operacao
  v_taxas TEXT[] := ARRAY[
    -- Linha 01 (Barras): barras menores mais rapidas
    '1|1|1200|un/h',    -- Barra GC 250
    '2|1|1200|un/h',    -- Barra GC Light 250
    '3|1|900|un/h',     -- Barra GC 500
    '4|1|800|un/h',     -- Barra GC 600
    '5|1|700|un/h',     -- Barra GC 800
    '6|1|1200|un/h',    -- Bananada Barra 250
    '7|1|1100|un/h',    -- Bananada sem acucar 250
    -- Linha 02 (Latas Varejo)
    '8|2|900|un/h',     -- Lata GC 400
    '9|2|600|un/h',     -- Lata GC 800
    '10|2|900|un/h',    -- Lata Ban 400
    '11|2|900|un/h',    -- Lata Ban Zero 400
    '12|2|600|un/h',    -- Lata Ban 800
    '13|2|900|un/h',    -- Lata Man 400
    -- Linha 03 (Potes)
    '14|3|800|un/h',    -- Pote GC 250
    '15|3|500|un/h',    -- Pote GC 700
    -- Linha 04 (Industrial): unidades muito maiores, velocidades baixas
    '16|4|60|un/h',     -- Lata 10kg
    '17|4|25|un/h',     -- Bloco 25kg
    '18|4|12|un/h'      -- Bloco 50kg
  ];

  -- MOTIVOS DE PARADA — adaptados para doceria
  v_motivos TEXT[] := ARRAY[
    'Setup / Troca de sabor|setup',
    'Troca de embalagem|setup',
    'Ajuste de temperatura do tacho|setup',
    'Falta de goiaba|nao_planejada',
    'Falta de banana|nao_planejada',
    'Falta de manga|nao_planejada',
    'Falta de acucar|nao_planejada',
    'Falta de embalagem|nao_planejada',
    'Quebra mecanica|nao_planejada',
    'Falta de operador|nao_planejada',
    'Limpeza entre lotes|planejada',
    'Sanitizacao diaria|planejada',
    'Intervalo / Refeicao|planejada',
    'Manutencao preventiva|planejada',
    'Validacao de qualidade|planejada'
  ];

  -- TURNOS (indice_unidade|nome|hora_inicio|hora_fim)
  v_turnos TEXT[] := ARRAY[
    '1|1o Turno|06:00|14:00',
    '1|2o Turno|14:00|22:00',
    '1|Administrativo|08:00|18:00'
  ];

  -- USUARIO — criado em auth.users com senha aleatoria
  -- A senha gerada aparece no RAISE NOTICE final (aba Messages)
  v_user_email    TEXT := 'admin@goiabadazelia.com.br';
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
  RAISE NOTICE 'GOIABADA DA ZELIA CRIADA COM SUCESSO';
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
-- WHERE e.nome = 'Goiabada da Zelia'
-- GROUP BY e.nome, u.nome, l.nome
-- ORDER BY l.nome;
