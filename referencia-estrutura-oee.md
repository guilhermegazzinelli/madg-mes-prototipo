# MADG MES — Modelo de Dados e Cálculos OEE

**Versão:** 1.0  
**Atualizado em:** 2026-04-15  
**Escopo:** Modelo genérico do sistema MADG MES para qualquer indústria

---

## 1. Conceito

O MADG MES coleta dados de produção no chão de fábrica e calcula automaticamente o OEE (Overall Equipment Effectiveness) — o indicador universal de eficiência produtiva.

O sistema se adapta a qualquer indústria: alimentos, metalurgia, plásticos, embalagens, etc. O cliente configura suas próprias unidades, linhas, produtos e taxas de produção.

**Premissas do modelo:**
- Uma empresa pode ter múltiplas **unidades fabris** (plantas)
- Cada unidade tem uma ou mais **linhas de produção** (máquinas, células)
- Cada linha produz um ou mais **produtos**, cada um com uma **taxa de produção padrão** (velocidade) específica para aquela linha
- O operador registra **ordens de produção** ao longo do dia — o sistema calcula o OEE automaticamente
- O OEE pode ser visualizado por ordem, por linha, por unidade ou consolidado

---

## 2. Entidades e Cadastros

### 2.1 Empresa

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | uuid | Identificador único |
| nome | text | Razão social ou nome fantasia |
| segmento | enum | Alimentos, Metalurgia, Plásticos, Embalagens, Outro |
| logo | file | Logo da empresa (opcional) |
| criado_em | datetime | Data de criação da conta |

### 2.2 Unidade Fabril (Planta)

Uma empresa pode operar múltiplas fábricas ou setores independentes.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | uuid | Identificador único |
| empresa_id | ref → Empresa | A qual empresa pertence |
| nome | text | Ex: "Planta 1", "Fábrica Norte", "Setor Usinagem" |
| ativo | bool | Se está em operação |

### 2.3 Linha de Produção

Linha, máquina, célula, estação — qualquer recurso produtivo que o cliente queira medir.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | uuid | Identificador único |
| unidade_id | ref → Unidade | A qual planta pertence |
| nome | text | Ex: "Linha 01", "CNC-03", "Injetora 5" |
| descricao | text | Detalhes opcionais (tipo, capacidade) |
| ativo | bool | Se está em operação |

### 2.4 Produto

O que é produzido. Pode ser um SKU final, um semi-acabado ou um intermediário.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | uuid | Identificador único |
| empresa_id | ref → Empresa | A qual empresa pertence |
| codigo | text | Código interno do produto (livre) |
| descricao | text | Nome/descrição do produto |
| unidade_medida | enum | kg, un, litros, metros, toneladas |
| peso_unitario | decimal | Peso por unidade (kg), se aplicável |
| ativo | bool | Se é produzido atualmente |

### 2.5 Taxa de Produção (Produto × Linha)

A velocidade padrão de cada produto em cada linha. Este é o coração do cálculo de performance — a mesma peça pode ter velocidades diferentes em máquinas diferentes.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | uuid | Identificador único |
| produto_id | ref → Produto | Qual produto |
| linha_id | ref → Linha | Em qual linha |
| velocidade | decimal | Taxa padrão (un/h, kg/h, pç/h) |
| unidade_velocidade | enum | un/h, kg/h, pç/h, m/h, l/h |
| tempo_ciclo | decimal | Alternativa: segundos por peça (inverso da velocidade) |
| origem | enum | manual, auto-aprendido | Como foi definido |

**Regra:** `velocidade = 3600 / tempo_ciclo` (conversão automática)

**Nota:** Nem todo produto roda em toda linha. A existência de um registro nesta tabela indica que aquele produto **pode** ser produzido naquela linha.

### 2.6 Turno

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | uuid | Identificador único |
| unidade_id | ref → Unidade | A qual planta pertence |
| nome | text | Ex: "Manhã", "Turno A", "Comercial" |
| hora_inicio | time | Início padrão |
| hora_fim | time | Fim padrão |
| dias_semana | int[] | Dias ativos (1=seg...7=dom) |

### 2.7 Motivo de Parada

Catálogo configurável de razões de parada, por empresa.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | uuid | Identificador único |
| empresa_id | ref → Empresa | A qual empresa pertence |
| nome | text | Ex: "Quebra mecânica", "Setup", "Falta material" |
| tipo | enum | planejada, nao_planejada, setup |
| ativo | bool | Se ainda é usado |

---

## 3. Coleta de Dados — Apontamento de Produção

### 3.1 Ordem de Produção (registro principal)

Cada registro representa: **"nesta data, nesta linha, produzi este produto das HH:MM às HH:MM"**. É a unidade atômica de coleta.

| Campo | Tipo | Descrição | Preenchimento |
|-------|------|-----------|---------------|
| id | uuid | Identificador único | Auto |
| unidade_id | ref → Unidade | Planta | Operador seleciona |
| linha_id | ref → Linha | Linha/máquina | Operador seleciona |
| produto_id | ref → Produto | O que foi produzido | Operador seleciona |
| data | date | Data da produção | Auto (hoje) |
| turno_id | ref → Turno | Turno (opcional) | Auto ou seleção |
| hora_inicio | time | Início da produção | Operador informa |
| hora_fim | time | Fim da produção | Operador informa |
| velocidade_padrao | decimal | Taxa padrão (da tabela Produto×Linha) | Auto |
| tempo_planejado | interval | Paradas planejadas (intervalo, refeição) | Operador informa |
| tempo_setup | interval | Tempo de setup/troca | Operador informa |
| tempo_parada | interval | Paradas não planejadas | Operador informa |
| qtd_produzida | decimal | Quantidade boa produzida | Operador informa |
| qtd_rejeitada | decimal | Quantidade rejeitada/refugo/descarte | Operador informa |
| qtd_reprocesso | decimal | Quantidade retrabalhada | Operador informa |
| observacao | text | Notas livres | Opcional |
| criado_em | datetime | Timestamp do registro | Auto |
| criado_por | ref → Usuário | Quem registrou | Auto |

**Regras:**
- No mesmo dia, uma linha pode ter **múltiplas ordens** (trocas de produto)
- O mesmo produto pode rodar em **múltiplas linhas** simultaneamente
- `qtd_produzida` = quantidade boa (aprovada)
- `qtd_rejeitada` = refugo, descarte, perdas
- `qtd_reprocesso` = material que voltou ao processo (não é perda final, mas impacta qualidade)

### 3.2 Registro de Parada (detalhe opcional)

Para empresas que querem catalogar cada evento de parada individualmente (análise de Pareto).

| Campo | Tipo | Descrição | Preenchimento |
|-------|------|-----------|---------------|
| id | uuid | Identificador único | Auto |
| ordem_id | ref → Ordem | A qual ordem pertence | Auto |
| linha_id | ref → Linha | Linha afetada | Auto (da ordem) |
| hora_inicio | time | Quando parou | Operador informa |
| hora_fim | time | Quando retomou | Operador informa |
| motivo_id | ref → Motivo | Razão da parada | Operador seleciona |
| descricao | text | Detalhes livres | Opcional |

**Regra:** A soma das durações das paradas deve ser coerente com `tempo_parada` + `tempo_setup` da ordem, mas não é obrigatório detalhar todas as paradas.

---

## 4. Cálculos OEE

### 4.1 Fórmula Universal

```
OEE = Disponibilidade × Performance × Qualidade
```

Cada componente é um percentual de 0% a 100% (pode exceder 100% em casos de sobreprodução).

### 4.2 Disponibilidade

Mede: **do tempo que deveria estar produzindo, quanto realmente produziu?**

```
Tempo Programado  = Hora Fim - Hora Início - Tempo Planejado
Tempo Produtivo   = Tempo Programado - Tempo Setup - Tempo Parada
Disponibilidade   = Tempo Produtivo / Tempo Programado
```

| Variável | Significado |
|----------|-------------|
| Hora Fim - Hora Início | Período total na fábrica |
| Tempo Planejado | Paradas previstas (refeição, intervalo) — não conta contra a disponibilidade |
| Tempo Programado | Tempo em que a máquina deveria estar rodando |
| Tempo Setup | Troca de produto, ajuste — conta como perda de disponibilidade |
| Tempo Parada | Quebra, falta material, etc. — conta como perda |

**Exemplo:**
- Turno: 05:50 às 16:09 = 10h19min
- Intervalo (planejado): 1h00
- Tempo programado: 9h19min (559 min)
- Setup: 0min, Parada: 0min
- **Disponibilidade: 100%**

### 4.3 Performance

Mede: **no tempo que estava rodando, produziu na velocidade esperada?**

```
Quantidade Teórica  = Velocidade Padrão × Tempo Produtivo (em horas)
Performance         = Quantidade Produzida Real / Quantidade Teórica
```

**A velocidade padrão vem do cadastro Produto × Linha** — é o valor de referência que o sistema usa para saber o que deveria ter produzido.

**Exemplo:**
- Velocidade padrão: 1.441 kg/h
- Tempo produtivo: 9h19min = 9,317h
- Teórico: 1.441 × 9,317 = 12.426 kg
- Produzido: 11.278 kg
- **Performance: 90,8%**

### 4.4 Qualidade

Mede: **do que produziu, quanto estava bom?**

```
Produção Total   = Quantidade Produzida + Quantidade Rejeitada
Qualidade        = Quantidade Produzida / Produção Total
```

Ou, de forma equivalente:

```
Qualidade = 1 - (Rejeitada + Reprocesso) / (Produzida + Rejeitada)
```

**Exemplo:**
- Produzido (bom): 11.278 kg
- Rejeitado (lavagem + reprocesso): 33 kg
- Total: 11.311 kg
- **Qualidade: 99,7%**

### 4.5 OEE Final

```
OEE = 100% × 90,8% × 99,7% = 90,5%
```

### 4.6 Consolidação

| Nível | Como calcular |
|-------|---------------|
| Por ordem | D × P × Q da ordem individual |
| Por linha/dia | Média ponderada por tempo produtivo de todas as ordens daquela linha no dia |
| Por unidade/dia | Média ponderada de todas as linhas da unidade |
| Por período | OEE calculado sobre os totais acumulados do período |

**Média ponderada:** O peso é o tempo produtivo (ou volume) de cada ordem, para que ordens maiores tenham mais influência no resultado.

---

## 5. Indicadores Derivados

Além do OEE, o sistema calcula automaticamente:

| Indicador | Fórmula | Utilidade |
|-----------|---------|-----------|
| **Tempo Produtivo** | Σ (Hora Fim - Hora Início - Planejado - Setup - Parada) | Horas efetivas de produção |
| **Tempo Parado** | Σ (Setup + Parada) | Total de perdas de disponibilidade |
| **Volume Produzido** | Σ qtd_produzida | Total de produção boa |
| **Volume Rejeitado** | Σ qtd_rejeitada | Total de refugo |
| **Taxa de Refugo** | Rejeitado / (Produzido + Rejeitado) | Percentual de perda de qualidade |
| **Produtividade** | Volume Produzido / Tempo Produtivo | Velocidade real média |
| **Eficiência de Velocidade** | Produtividade / Velocidade Padrão | Performance sem efeito do mix |
| **Top Paradas (Pareto)** | Ranking por duração ou frequência de motivo_id | Priorizar ações de melhoria |
| **MTBF** | Tempo Produtivo / N° de paradas | Tempo médio entre falhas |
| **MTTR** | Tempo Parado / N° de paradas | Tempo médio de reparo |

---

## 6. Hierarquia de Visualização

```
Empresa
  └── Unidade Fabril (Planta)
        └── Linha de Produção
              └── Produto (via tabela Taxa de Produção)
                    └── Ordem de Produção (apontamento diário)
                          ├── Paradas (detalhe)
                          └── OEE calculado (D × P × Q)

Consolidação:
  Ordem → Linha/Dia → Unidade/Dia → Empresa/Dia → Período
```

---

## 7. Diagrama de Relacionamentos

```
┌──────────┐     ┌──────────────┐     ┌──────────┐
│ Empresa  │────<│ Unidade      │────<│  Linha   │
└──────────┘     └──────────────┘     └────┬─────┘
     │                                     │
     │           ┌──────────────┐          │
     └──────────<│  Produto     │          │
     │           └──────┬───────┘          │
     │                  │                  │
     │           ┌──────┴───────┐          │
     │           │ Taxa de Prod.│>─────────┘
     │           │ (Prod×Linha) │
     │           └──────────────┘
     │
     │           ┌──────────────┐
     └──────────<│Motivo Parada │
                 └──────────────┘

┌──────────────────────────────────────────────┐
│              Ordem de Produção                │
│  (data, linha, produto, tempos, quantidades)  │
│──────────────────────────────────────────────│
│  → linha_id    → produto_id    → turno_id    │
│  hora_inicio   hora_fim                      │
│  tempo_planejado  tempo_setup  tempo_parada  │
│  qtd_produzida  qtd_rejeitada  qtd_reprocesso│
└──────────────────┬───────────────────────────┘
                   │
            ┌──────┴───────┐
            │   Parada     │
            │  (detalhe)   │
            │  motivo_id   │
            │  hora ini/fim│
            └──────────────┘

Cálculos (derivados da Ordem):
  Disponibilidade = Tempo Produtivo / Tempo Programado
  Performance     = Qtd Produzida / Qtd Teórica
  Qualidade       = Qtd Boa / Qtd Total
  OEE             = D × P × Q
```

---

## 8. Exemplo: Como a Planilha Mapeia para o Modelo

Para validar que o modelo genérico cobre o caso real:

| Planilha (específico) | Modelo MADG MES (genérico) |
|----------------------|---------------------------|
| Fábrica PDQ / Salgados | Unidade Fabril |
| Linha 01, 02... 1.1, 7.1 | Linha de Produção |
| SKU P024.9 / SA2106 | Produto |
| Velocidade 1441 kg/h por produto | Taxa de Produção (Produto × Linha) |
| Aba "Disponibilidade" | Campos hora_inicio, hora_fim, tempos na Ordem |
| Aba "Performance" | Campos qtd_produzida, velocidade na Ordem |
| Aba "Qualidade" | Campos qtd_rejeitada, qtd_reprocesso na Ordem |
| Aba "Paradas" | Tabela Parada (detalhe da Ordem) |
| Aba "OEE" | Cálculo automático sobre a Ordem |
| Aba "Mão de Obra" | Fora do escopo v1 (futuro) |
| Aba "Dashboard" | Tela de dashboard com consolidação |

---

## 9. Escopo do Protótipo (v1)

### Cadastros
1. **Unidades** — CRUD simples (nome, ativo)
2. **Linhas** — CRUD vinculado à unidade
3. **Produtos** — CRUD com código, descrição, unidade de medida
4. **Taxa de Produção** — Tabela cruzada Produto × Linha com velocidade
5. **Motivos de Parada** — Lista configurável

### Coleta
6. **Apontamento de Produção** — Formulário: data, linha, produto, horários, tempos, quantidades
7. **Registro de Parada** — Detalhe opcional por ordem

### Visualização
8. **OEE por Ordem** — Card com D × P × Q calculado
9. **OEE por Linha/Dia** — Resumo consolidado
10. **Lista de Ordens** — Histórico com filtros

### Fora do escopo v1
- Mão de obra / equipe
- Sobrepeso
- Notificações
- Integração com sensores
- Multi-empresa (hardcoded para 1 empresa)
- Autenticação por PIN
