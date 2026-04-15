# Changelog — MADG MES Protótipo

## [0.1.6] — 2026-04-15
### Corrigido
- Campos de horário trocados de `input type=time` para texto com máscara 24h (HH:MM)
- Eliminado problema de AM/PM que causava cálculos errados de performance
- Auto-inserção de ":" após 2 dígitos, validação 0-23h e 0-59min

### Adicionado
- Resumo de tempos calculados no formulário (total, programado, produtivo, qtd. teórica)
- Alerta visual quando tempo total excede 16h (possível erro de digitação)
- Máscara 24h aplicada nos formulários de ordem e paradas

## [0.1.5] — 2026-04-15
### Documentação
- README.md com instruções completas de setup, estrutura e cálculos OEE
- CHANGELOG.md com histórico de versões
- Template `sql/nova-empresa.sql` para criar empresa com usuário e dados
- CREDENCIAIS.md (local, fora do git) com todas as chaves e logins

## [0.1.4] — 2026-04-15
### Segurança
- RLS com `FORCE ROW LEVEL SECURITY` em todas as tabelas
- Policies recriadas garantindo isolamento total por empresa
- Função `auth_empresa_id()` como base de todas as policies

### Dados Demo
- ColorTech Pigmentos: 2 plantas, 5 linhas, 8 produtos, 13 ordens
- VitroMax Vidros: 2 plantas, 6 linhas, 8 produtos, 15 ordens
- 4 usuários demo com isolamento testado e validado

## [0.1.3] — 2026-04-15
### Corrigido
- Chave Supabase trocada para anon JWT (compatível com REST API)
- Chave `sb_publishable_` funciona para Auth mas não para queries REST

## [0.1.2] — 2026-04-15
### Dashboard
- Seletor de data para navegar entre dias de produção
- Sugestão de datas com dados quando o dia selecionado está vazio
- OEE por linha com detalhes (produto, D/P/Q individual)
- Detalhe por ordem com link para edição
- Tendência histórica com barras visuais de OEE por dia
- Média consolidada do período

## [0.1.1] — 2026-04-15
### Segurança
- Autenticação via Supabase Auth (email/senha)
- Tabela `user_empresa` para vínculo usuário ↔ empresa
- RLS habilitado em todas as tabelas
- Login/cadastro/logout no frontend

### Alterado
- `empresa_id` passado explicitamente nos INSERTs dos CRUDs
- `criado_por` registrado nas ordens de produção
- Navegação oculta até o login ser concluído

## [0.1.0] — 2026-04-15
### Adicionado
- Schema SQL com 9 tabelas (empresa, unidades, linhas, produtos, taxas_producao, motivos_parada, turnos, ordens_producao, paradas)
- Seed com dados demo baseados na planilha real de OEE
- SPA vanilla HTML/CSS/JS com router hash-based
- Design system: cores MADG, responsivo mobile-first, componentes reutilizáveis
- CRUDs completos: unidades, linhas, produtos, taxas de produção, motivos de parada
- Formulário de apontamento de produção com cálculo OEE ao vivo (D × P × Q)
- Lista de ordens com filtros (data, linha) e OEE calculado por registro
- Dashboard com gauges OEE, stats cards e consolidação por linha
- Registro detalhado de paradas vinculado a ordens
- Cálculos OEE client-side (nunca armazenados, sempre derivados)
