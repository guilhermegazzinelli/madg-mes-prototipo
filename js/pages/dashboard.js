// MADG MES — Dashboard OEE

async function renderDashboard(container) {
  const hoje = new Date().toISOString().split('T')[0];

  try {
    // Buscar ordens de hoje
    const { data: ordens, error } = await db
      .from('ordens_producao')
      .select('*, linhas(nome), produtos(descricao, codigo)')
      .eq('data', hoje);

    if (error) throw error;

    if (!ordens || ordens.length === 0) {
      container.innerHTML = `
        <div class="page-header">
          <div>
            <h1 class="page-title">Dashboard</h1>
            <p class="page-subtitle">${formatDate(hoje)}</p>
          </div>
        </div>
        <div class="empty-state">
          <div class="icon">📊</div>
          <p>Nenhuma ordem registrada hoje</p>
          <a href="#/ordens/new" class="btn btn-primary">Registrar Producao</a>
        </div>`;
      return;
    }

    // Consolidar OEE
    const consolidado = OEE.consolidar(ordens);

    // Agrupar por linha
    const porLinha = {};
    for (const o of ordens) {
      const key = o.linha_id;
      if (!porLinha[key]) porLinha[key] = { nome: o.linhas?.nome || 'N/A', ordens: [] };
      porLinha[key].ordens.push(o);
    }

    const linhasHTML = Object.values(porLinha).map(g => {
      const c = OEE.consolidar(g.ordens);
      return `
        <div class="flex justify-between items-center" style="padding:8px 0; border-bottom:1px solid var(--cinza-border)">
          <span style="font-weight:600">${g.nome}</span>
          <span class="badge ${OEE.badgeClass(c.oee)}">${OEE.pct(c.oee)}</span>
        </div>`;
    }).join('');

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Dashboard</h1>
          <p class="page-subtitle">${formatDate(hoje)} — ${ordens.length} ordem(ns)</p>
        </div>
        <a href="#/ordens/new" class="btn btn-warning">+ Nova Ordem</a>
      </div>

      <div class="stats-row">
        <div class="stat-card">
          ${UI.gauge(consolidado.oee, 'OEE')}
        </div>
        <div class="stat-card">
          ${UI.gauge(consolidado.disponibilidade, 'Disp.', true)}
        </div>
        <div class="stat-card">
          ${UI.gauge(consolidado.performance, 'Perf.', true)}
        </div>
        <div class="stat-card">
          ${UI.gauge(consolidado.qualidade, 'Qual.', true)}
        </div>
      </div>

      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-value">${OEE.num(consolidado.totalProduzido, 0)}</div>
          <div class="stat-label">Produzido</div>
        </div>
        <div class="stat-card">
          <div class="stat-value text-red">${OEE.num(consolidado.totalRejeitado, 0)}</div>
          <div class="stat-label">Rejeitado</div>
        </div>
        <div class="stat-card">
          <div class="stat-value text-orange">${OEE.minutesToDisplay(consolidado.totalParado)}</div>
          <div class="stat-label">Parado</div>
        </div>
        <div class="stat-card">
          <div class="stat-value text-blue">${OEE.minutesToDisplay(consolidado.totalProdutivo)}</div>
          <div class="stat-label">Produtivo</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">OEE por Linha (Hoje)</div>
        ${linhasHTML}
      </div>`;

  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>Erro ao carregar dashboard: ${err.message}</p></div>`;
  }
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
}
