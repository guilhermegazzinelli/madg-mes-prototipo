// MADG MES — Dashboard OEE

async function renderDashboard(container) {
  const hoje = new Date().toISOString().split('T')[0];

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Dashboard OEE</h1>
        <p class="page-subtitle" id="dash-subtitle"></p>
      </div>
      <div class="flex gap-1 items-center" style="flex-wrap:wrap">
        <input type="date" class="form-control" id="dash-data" value="${hoje}" style="width:auto">
        <button class="btn btn-sm btn-outline" id="btn-hoje">Hoje</button>
        <a href="#/ordens/new" class="btn btn-sm btn-warning">+ Nova Ordem</a>
      </div>
    </div>
    <div id="dash-content"><div class="loading"><div class="spinner"></div></div></div>
    <div class="card mt-2" id="dash-tendencia">
      <div class="card-header">Tendencia OEE — Ultimos dias com producao</div>
      <div id="tendencia-content"><div class="loading"><div class="spinner"></div></div></div>
    </div>`;

  const dataInput = container.querySelector('#dash-data');
  container.querySelector('#btn-hoje').addEventListener('click', () => {
    dataInput.value = hoje;
    loadDashboard(hoje);
  });
  dataInput.addEventListener('change', () => loadDashboard(dataInput.value));

  // Carregar dia selecionado + tendencia em paralelo
  await Promise.all([
    loadDashboard(hoje),
    loadTendencia()
  ]);
}

async function loadDashboard(data) {
  const contentEl = document.getElementById('dash-content');
  const subtitleEl = document.getElementById('dash-subtitle');
  contentEl.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    const { data: ordens, error } = await db
      .from('ordens_producao')
      .select('*, linhas(nome), produtos(descricao, codigo), unidades(nome)')
      .eq('data', data)
      .order('hora_inicio');

    if (error) throw error;

    subtitleEl.textContent = formatDate(data);

    if (!ordens || ordens.length === 0) {
      // Buscar datas que tem dados para sugerir
      const { data: datasComDados } = await db
        .from('ordens_producao')
        .select('data')
        .order('data', { ascending: false })
        .limit(10);

      const datasUnicas = [...new Set((datasComDados || []).map(d => d.data))].slice(0, 5);
      const sugestoes = datasUnicas.map(d =>
        `<button class="btn btn-sm btn-outline btn-data-sugestao" data-data="${d}">${new Date(d + 'T12:00').toLocaleDateString('pt-BR')}</button>`
      ).join(' ');

      contentEl.innerHTML = `
        <div class="empty-state">
          <div class="icon">📊</div>
          <p>Nenhuma ordem registrada em ${new Date(data + 'T12:00').toLocaleDateString('pt-BR')}</p>
          ${sugestoes ? `<p class="text-muted mb-1" style="font-size:0.85rem">Datas com producao:</p><div class="flex gap-1" style="justify-content:center;flex-wrap:wrap">${sugestoes}</div>` : ''}
          <div class="mt-2"><a href="#/ordens/new" class="btn btn-primary">Registrar Producao</a></div>
        </div>`;

      contentEl.querySelectorAll('.btn-data-sugestao').forEach(btn => {
        btn.addEventListener('click', () => {
          document.getElementById('dash-data').value = btn.dataset.data;
          loadDashboard(btn.dataset.data);
        });
      });
      return;
    }

    // Consolidar OEE do dia
    const consolidado = OEE.consolidar(ordens);

    // Agrupar por linha
    const porLinha = {};
    for (const o of ordens) {
      const key = o.linha_id;
      if (!porLinha[key]) porLinha[key] = { nome: o.linhas?.nome || 'N/A', unidade: o.unidades?.nome || '', ordens: [] };
      porLinha[key].ordens.push(o);
    }

    const linhasHTML = Object.values(porLinha).map(g => {
      const c = OEE.consolidar(g.ordens);
      const produtos = g.ordens.map(o => o.produtos?.codigo).filter(Boolean).join(', ');
      return `
        <div style="padding:10px 0; border-bottom:1px solid var(--cinza-border)">
          <div class="flex justify-between items-center">
            <div>
              <strong>${g.nome}</strong>
              <span class="text-muted" style="font-size:0.75rem; margin-left:8px">${g.unidade}</span>
            </div>
            <span class="badge ${OEE.badgeClass(c.oee)}" style="font-size:0.85rem">${OEE.pct(c.oee)}</span>
          </div>
          <div style="font-size:0.8rem; color:var(--cinza-text); margin-top:4px">
            ${produtos} — ${OEE.num(c.totalProduzido, 0)} produzido — D:${OEE.pct(c.disponibilidade)} P:${OEE.pct(c.performance)} Q:${OEE.pct(c.qualidade)}
          </div>
        </div>`;
    }).join('');

    // Detalhe por ordem
    const ordensHTML = ordens.map(o => {
      const r = OEE.calcular(o);
      return `
        <div style="padding:8px 0; border-bottom:1px solid var(--cinza-border); font-size:0.85rem">
          <div class="flex justify-between items-center">
            <div>
              <strong>${o.produtos?.codigo || '-'}</strong> — ${o.linhas?.nome || '-'}
              <span class="text-muted" style="margin-left:4px">${o.hora_inicio?.slice(0,5)} - ${o.hora_fim?.slice(0,5)}</span>
            </div>
            <a href="#/ordens/${o.id}" class="badge ${OEE.badgeClass(r.oee)}" style="text-decoration:none;cursor:pointer">${OEE.pct(r.oee)}</a>
          </div>
          <div class="text-muted" style="font-size:0.75rem; margin-top:2px">
            Produzido: ${OEE.num(r.qtdProduzida, 0)} | Teorico: ${OEE.num(r.qtdTeorica, 0)} | Rejeitado: ${OEE.num(r.qtdRejeitada, 0)}
          </div>
        </div>`;
    }).join('');

    contentEl.innerHTML = `
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
          <div class="stat-value text-blue">${consolidado.qtdOrdens}</div>
          <div class="stat-label">Ordens</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">OEE por Linha</div>
        ${linhasHTML}
      </div>

      <div class="card mt-2">
        <div class="card-header">Detalhe por Ordem</div>
        ${ordensHTML}
      </div>`;

  } catch (err) {
    contentEl.innerHTML = `<div class="empty-state"><p>Erro: ${err.message}</p></div>`;
  }
}

async function loadTendencia() {
  const tendEl = document.getElementById('tendencia-content');

  try {
    // Buscar todas as ordens (ultimas 30 dias com dados)
    const { data: ordens, error } = await db
      .from('ordens_producao')
      .select('data, hora_inicio, hora_fim, velocidade_padrao, tempo_planejado, tempo_setup, tempo_parada, qtd_produzida, qtd_rejeitada, qtd_reprocesso, linhas(nome)')
      .order('data', { ascending: false })
      .limit(500);

    if (error) throw error;
    if (!ordens || ordens.length === 0) {
      tendEl.innerHTML = '<p class="text-muted" style="padding:12px">Sem dados para exibir tendencia</p>';
      return;
    }

    // Agrupar por data
    const porData = {};
    for (const o of ordens) {
      if (!porData[o.data]) porData[o.data] = [];
      porData[o.data].push(o);
    }

    // Calcular OEE por dia (ordenado cronologicamente)
    const dias = Object.keys(porData).sort();

    const tabelaHTML = dias.map(data => {
      const c = OEE.consolidar(porData[data]);
      const dataFormatada = new Date(data + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      const diaSemana = new Date(data + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short' });

      // Barra visual proporcional ao OEE
      const pctOEE = Math.round(c.oee * 100);
      const cor = OEE.cor(c.oee);

      return `
        <div class="flex items-center gap-1" style="padding:6px 0; border-bottom:1px solid var(--cinza-border); cursor:pointer" onclick="document.getElementById('dash-data').value='${data}'; loadDashboard('${data}'); window.scrollTo(0,0)">
          <div style="width:70px; font-size:0.8rem">
            <strong>${dataFormatada}</strong>
            <div class="text-muted" style="font-size:0.7rem">${diaSemana}</div>
          </div>
          <div style="flex:1; height:24px; background:#e0e0e0; border-radius:4px; overflow:hidden; position:relative">
            <div style="height:100%; width:${Math.min(pctOEE, 100)}%; background:${cor}; border-radius:4px; transition:width 0.3s"></div>
            <span style="position:absolute; top:50%; left:8px; transform:translateY(-50%); font-size:0.75rem; font-weight:700; color:${pctOEE > 40 ? '#fff' : 'var(--texto)'}">${OEE.pct(c.oee)}</span>
          </div>
          <div style="width:50px; text-align:right; font-size:0.75rem; color:var(--cinza-text)">
            ${c.qtdOrdens}x
          </div>
          <div style="width:80px; text-align:right; font-size:0.75rem">
            ${OEE.num(c.totalProduzido, 0)}
          </div>
        </div>`;
    }).join('');

    // Calcular media geral
    const allOrdens = Object.values(porData).flat();
    const media = OEE.consolidar(allOrdens);

    tendEl.innerHTML = `
      <div style="padding:8px 0; margin-bottom:4px; font-size:0.8rem; color:var(--cinza-text)">
        <div class="flex justify-between">
          <span>Media do periodo: <strong style="color:var(--texto)">${OEE.pct(media.oee)}</strong> (D:${OEE.pct(media.disponibilidade)} P:${OEE.pct(media.performance)} Q:${OEE.pct(media.qualidade)})</span>
          <span>${dias.length} dias | ${allOrdens.length} ordens</span>
        </div>
      </div>
      <div class="flex text-muted" style="font-size:0.7rem; padding:4px 0; border-bottom:2px solid var(--cinza-border)">
        <div style="width:70px">Data</div>
        <div style="flex:1">OEE</div>
        <div style="width:50px; text-align:right">Ordens</div>
        <div style="width:80px; text-align:right">Produzido</div>
      </div>
      ${tabelaHTML}`;

  } catch (err) {
    tendEl.innerHTML = `<p class="text-muted" style="padding:12px">Erro: ${err.message}</p>`;
  }
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
