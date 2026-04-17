// MADG MES — Dashboard de Analise de Paradas e Perdas

// Paleta alinhada com as CSS vars (ApexCharts nao le var() — usar hex)
const PARADAS_CORES = {
  azul: '#1a5276',
  azul_light: '#2471a3',
  laranja: '#e67e22',
  verde: '#27ae60',
  vermelho: '#c0392b',
  amarelo: '#f39c12',
  cinza: '#95a5a6'
};

const PARADAS_COR_TIPO = {
  planejada: PARADAS_CORES.amarelo,
  setup: PARADAS_CORES.azul,
  nao_planejada: PARADAS_CORES.vermelho
};

const PARADAS_LABEL_TIPO = {
  planejada: 'Planejada',
  setup: 'Setup',
  nao_planejada: 'Nao planejada'
};

// Estado de graficos (para destruir entre re-renders)
const paradasState = { charts: {}, motivoFiltroAtivo: null };

async function renderDashboardParadas(container) {
  // Periodo default: ultimos 30 dias
  const hoje = new Date();
  const inicioDefault = new Date(hoje);
  inicioDefault.setDate(inicioDefault.getDate() - 29);
  const fmt = d => d.toISOString().split('T')[0];

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Analise de Paradas e Perdas</h1>
        <p class="page-subtitle" id="par-subtitle"></p>
      </div>
      <a href="#/dashboard" class="btn btn-sm btn-outline">← Dashboard OEE</a>
    </div>

    <div class="card">
      <div class="flex gap-1 items-center" style="flex-wrap:wrap">
        <label style="font-size:0.85rem;color:var(--cinza-text)">De</label>
        <input type="date" class="form-control" id="par-inicio" value="${fmt(inicioDefault)}" style="width:auto">
        <label style="font-size:0.85rem;color:var(--cinza-text)">Ate</label>
        <input type="date" class="form-control" id="par-fim" value="${fmt(hoje)}" style="width:auto">
        <select class="form-control" id="par-unidade" style="width:auto">
          <option value="">Todas as unidades</option>
        </select>
        <select class="form-control" id="par-linha" style="width:auto">
          <option value="">Todas as linhas</option>
        </select>
        <button class="btn btn-sm btn-outline" id="par-btn-30">30d</button>
        <button class="btn btn-sm btn-outline" id="par-btn-7">7d</button>
        <button class="btn btn-sm btn-primary" id="par-btn-aplicar">Aplicar</button>
      </div>
    </div>

    <div id="par-content"><div class="loading"><div class="spinner"></div></div></div>`;

  // Carregar selects de filtro
  const [{ data: unidades }, { data: linhas }] = await Promise.all([
    db.from('unidades').select('id, nome').eq('ativo', true).order('nome'),
    db.from('linhas').select('id, nome, unidade_id').eq('ativo', true).order('nome')
  ]);

  const selUnidade = container.querySelector('#par-unidade');
  const selLinha = container.querySelector('#par-linha');
  (unidades || []).forEach(u => {
    selUnidade.innerHTML += `<option value="${u.id}">${u.nome}</option>`;
  });
  const refreshLinhas = () => {
    const uid = selUnidade.value;
    selLinha.innerHTML = '<option value="">Todas as linhas</option>';
    (linhas || []).filter(l => !uid || l.unidade_id === uid).forEach(l => {
      selLinha.innerHTML += `<option value="${l.id}">${l.nome}</option>`;
    });
  };
  refreshLinhas();
  selUnidade.addEventListener('change', refreshLinhas);

  // Botoes de atalho de periodo
  const setPeriodo = (dias) => {
    const fim = new Date();
    const ini = new Date(fim);
    ini.setDate(ini.getDate() - (dias - 1));
    container.querySelector('#par-inicio').value = fmt(ini);
    container.querySelector('#par-fim').value = fmt(fim);
    carregar();
  };
  container.querySelector('#par-btn-30').addEventListener('click', () => setPeriodo(30));
  container.querySelector('#par-btn-7').addEventListener('click', () => setPeriodo(7));
  container.querySelector('#par-btn-aplicar').addEventListener('click', carregar);

  async function carregar() {
    paradasState.motivoFiltroAtivo = null;
    const inicio = container.querySelector('#par-inicio').value;
    const fim = container.querySelector('#par-fim').value;
    const unidade_id = container.querySelector('#par-unidade').value || null;
    const linha_id = container.querySelector('#par-linha').value || null;
    await loadParadas({ inicio, fim, unidade_id, linha_id });
  }

  await carregar();
}

async function loadParadas({ inicio, fim, unidade_id, linha_id }) {
  const contentEl = document.getElementById('par-content');
  const subtitleEl = document.getElementById('par-subtitle');
  contentEl.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  // Destruir charts anteriores (evita memory leak)
  Object.values(paradasState.charts).forEach(c => { try { c.destroy(); } catch (e) {} });
  paradasState.charts = {};

  try {
    // 1. Buscar ORDENS do periodo (para calcular tempo total de producao)
    let qOrdens = db.from('ordens_producao')
      .select('id, data, hora_inicio, hora_fim, linha_id, unidade_id, linhas(nome, unidade_id), unidades(nome)')
      .gte('data', inicio)
      .lte('data', fim);
    if (unidade_id) qOrdens = qOrdens.eq('unidade_id', unidade_id);
    if (linha_id) qOrdens = qOrdens.eq('linha_id', linha_id);
    const { data: ordens, error: eOrd } = await qOrdens;
    if (eOrd) throw eOrd;

    const ordemIds = (ordens || []).map(o => o.id);
    subtitleEl.textContent = `${formatDateBR(inicio)} — ${formatDateBR(fim)} · ${ordens?.length || 0} ordens`;

    if (!ordens || ordens.length === 0) {
      contentEl.innerHTML = `
        <div class="empty-state">
          <div class="icon">⏱️</div>
          <p>Nenhuma ordem no periodo selecionado</p>
          <p class="text-muted">Ajuste os filtros ou registre ordens com paradas detalhadas.</p>
          <a href="#/ordens/new" class="btn btn-primary mt-2">Registrar ordem</a>
        </div>`;
      return;
    }

    // 2. Buscar PARADAS vinculadas a essas ordens (com joins)
    const { data: paradas, error: ePar } = await db
      .from('paradas')
      .select('id, hora_inicio, hora_fim, descricao, motivo_id, linha_id, ordem_id, motivos_parada(nome, tipo), linhas(nome)')
      .in('ordem_id', ordemIds);
    if (ePar) throw ePar;

    // 3. Calcular duracao e enriquecer cada parada
    const paradasEnriq = (paradas || [])
      .map(p => {
        const dur = computeDuracaoMin(p.hora_inicio, p.hora_fim);
        if (dur === null || dur <= 0) return null;
        const ordem = ordens.find(o => o.id === p.ordem_id);
        return {
          ...p,
          duracao: dur,
          motivo_nome: p.motivos_parada?.nome || '(sem motivo)',
          motivo_tipo: p.motivos_parada?.tipo || 'nao_planejada',
          linha_nome: p.linhas?.nome || ordem?.linhas?.nome || '-',
          data: ordem?.data || null
        };
      })
      .filter(Boolean);

    // 4. Calcular tempo total de ordens do periodo (denominador do %)
    const tempoTotalOrdens = (ordens || []).reduce((acc, o) => {
      let t = OEE.timeToMinutes(o.hora_fim?.slice(0, 5)) - OEE.timeToMinutes(o.hora_inicio?.slice(0, 5));
      if (t < 0) t += 1440;
      return acc + Math.max(0, t);
    }, 0);

    if (paradasEnriq.length === 0) {
      contentEl.innerHTML = `
        <div class="empty-state">
          <div class="icon">✅</div>
          <p>Nenhuma parada registrada no periodo</p>
          <p class="text-muted">
            ${ordens.length} ordens no periodo, ${OEE.minutesToDisplay(tempoTotalOrdens)} de producao sem paradas detalhadas.
          </p>
        </div>`;
      return;
    }

    // 5. Renderizar estrutura base + graficos
    renderParadasLayout(contentEl);
    renderKPIs(paradasEnriq, tempoTotalOrdens, ordens);
    renderPareto(paradasEnriq);
    renderDonutTipo(paradasEnriq);
    renderRankingLinhas(paradasEnriq, ordens);
    renderTabelaDrill(paradasEnriq);

  } catch (err) {
    contentEl.innerHTML = `<div class="empty-state"><p>Erro: ${err.message}</p></div>`;
  }
}

function renderParadasLayout(contentEl) {
  contentEl.innerHTML = `
    <div id="par-kpis" class="stats-row"></div>

    <div class="chart-card">
      <div class="card-header">Pareto de Motivos (80/20)</div>
      <div id="par-pareto"></div>
      <p class="text-muted" style="font-size:0.75rem;margin:4px 0 0">
        Barras = duracao total por motivo. Linha = % acumulado. Os motivos ate 80% sao prioridade de acao.
      </p>
    </div>

    <div class="chart-grid-2">
      <div class="chart-card">
        <div class="card-header">Distribuicao por Tipo</div>
        <div id="par-donut"></div>
      </div>
      <div class="chart-card">
        <div class="card-header">Top Linhas Afetadas</div>
        <div id="par-ranking"></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">Drill-down por Motivo</div>
      <p class="text-muted" style="font-size:0.8rem;margin:-8px 0 8px">Clique numa linha para ver as ordens que tiveram aquela parada.</p>
      <div id="par-tabela"></div>
    </div>`;
}

// ---------- KPIs ----------
function renderKPIs(paradas, tempoTotalOrdens, ordens) {
  const totalParado = paradas.reduce((s, p) => s + p.duracao, 0);
  const pctPerdido = tempoTotalOrdens > 0 ? (totalParado / tempoTotalOrdens) : 0;

  // Top motivo
  const porMotivo = agrupar(paradas, p => p.motivo_nome);
  const [topMotivoNome, topMotivoArr] = Object.entries(porMotivo)
    .sort((a, b) => somaDur(b[1]) - somaDur(a[1]))[0] || ['-', []];
  const topMotivoDur = somaDur(topMotivoArr);

  // Top linha (% do proprio tempo)
  const porLinha = agrupar(paradas, p => p.linha_nome);
  const tempoPorLinha = {};
  ordens.forEach(o => {
    const nome = o.linhas?.nome || '-';
    let t = OEE.timeToMinutes(o.hora_fim?.slice(0, 5)) - OEE.timeToMinutes(o.hora_inicio?.slice(0, 5));
    if (t < 0) t += 1440;
    tempoPorLinha[nome] = (tempoPorLinha[nome] || 0) + Math.max(0, t);
  });
  let topLinha = '-', topLinhaPct = 0;
  Object.entries(porLinha).forEach(([linha, arr]) => {
    const dur = somaDur(arr);
    const total = tempoPorLinha[linha] || 0;
    const pct = total > 0 ? dur / total : 0;
    if (pct > topLinhaPct) { topLinha = linha; topLinhaPct = pct; }
  });

  document.getElementById('par-kpis').innerHTML = `
    <div class="stat-card">
      <div class="stat-value text-orange">${OEE.minutesToDisplay(totalParado)}</div>
      <div class="stat-label">Tempo total parado</div>
    </div>
    <div class="stat-card">
      <div class="stat-value ${pctPerdido > 0.2 ? 'text-red' : 'text-orange'}">${OEE.pct(pctPerdido)}</div>
      <div class="stat-label">% do tempo perdido</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" style="font-size:1.1rem;line-height:1.2">${escapeHtml(topMotivoNome)}</div>
      <div class="stat-label">Motivo #1 · ${OEE.minutesToDisplay(topMotivoDur)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" style="font-size:1.1rem;line-height:1.2">${escapeHtml(topLinha)}</div>
      <div class="stat-label">Linha mais afetada · ${OEE.pct(topLinhaPct)}</div>
    </div>`;
}

// ---------- Pareto ----------
function renderPareto(paradas) {
  const porMotivo = agrupar(paradas, p => p.motivo_nome);
  const entries = Object.entries(porMotivo)
    .map(([nome, arr]) => ({ nome, duracao: somaDur(arr), tipo: arr[0].motivo_tipo }))
    .sort((a, b) => b.duracao - a.duracao);

  const total = entries.reduce((s, e) => s + e.duracao, 0) || 1;
  let acumulado = 0;
  const pctAcum = entries.map(e => {
    acumulado += e.duracao;
    return +((acumulado / total) * 100).toFixed(1);
  });

  const options = {
    chart: { type: 'line', height: 340, toolbar: { show: false } },
    series: [
      { name: 'Duracao (min)', type: 'column', data: entries.map(e => e.duracao) },
      { name: '% acumulado', type: 'line', data: pctAcum }
    ],
    xaxis: { categories: entries.map(e => e.nome), labels: { rotate: -35, style: { fontSize: '11px' } } },
    yaxis: [
      {
        title: { text: 'Minutos', style: { fontSize: '11px' } },
        labels: { formatter: v => Math.round(v) }
      },
      {
        opposite: true, min: 0, max: 100,
        title: { text: '% acumulado', style: { fontSize: '11px' } },
        labels: { formatter: v => v + '%' }
      }
    ],
    colors: [PARADAS_CORES.vermelho, PARADAS_CORES.laranja],
    stroke: { width: [0, 3], curve: 'straight' },
    markers: { size: [0, 4] },
    dataLabels: {
      enabled: true, enabledOnSeries: [1],
      formatter: v => v + '%',
      style: { fontSize: '10px' }
    },
    annotations: {
      yaxis: [{
        y: 80, yAxisIndex: 1,
        borderColor: PARADAS_CORES.cinza, strokeDashArray: 4,
        label: { text: '80%', style: { color: '#fff', background: PARADAS_CORES.cinza } }
      }]
    },
    tooltip: {
      shared: true, intersect: false,
      y: { formatter: (v, { seriesIndex }) => seriesIndex === 0 ? OEE.minutesToDisplay(v) : v + '%' }
    },
    legend: { position: 'top' }
  };

  const el = document.getElementById('par-pareto');
  el.innerHTML = '';
  paradasState.charts.pareto = new ApexCharts(el, options);
  paradasState.charts.pareto.render();
}

// ---------- Donut por tipo ----------
function renderDonutTipo(paradas) {
  const porTipo = agrupar(paradas, p => p.motivo_tipo);
  const labels = Object.keys(porTipo);
  const data = labels.map(t => somaDur(porTipo[t]));
  const total = data.reduce((s, v) => s + v, 0);

  const options = {
    chart: { type: 'donut', height: 300 },
    series: data,
    labels: labels.map(t => PARADAS_LABEL_TIPO[t] || t),
    colors: labels.map(t => PARADAS_COR_TIPO[t] || PARADAS_CORES.cinza),
    legend: { position: 'bottom' },
    dataLabels: { formatter: v => v.toFixed(1) + '%' },
    plotOptions: {
      pie: {
        donut: {
          labels: {
            show: true,
            total: {
              show: true, label: 'Total',
              formatter: () => OEE.minutesToDisplay(total)
            }
          }
        }
      }
    },
    tooltip: { y: { formatter: v => OEE.minutesToDisplay(v) } }
  };

  const el = document.getElementById('par-donut');
  el.innerHTML = '';
  paradasState.charts.donut = new ApexCharts(el, options);
  paradasState.charts.donut.render();
}

// ---------- Ranking por linha (bar horizontal) ----------
function renderRankingLinhas(paradas, ordens) {
  const porLinha = agrupar(paradas, p => p.linha_nome);
  const tempoPorLinha = {};
  ordens.forEach(o => {
    const nome = o.linhas?.nome || '-';
    let t = OEE.timeToMinutes(o.hora_fim?.slice(0, 5)) - OEE.timeToMinutes(o.hora_inicio?.slice(0, 5));
    if (t < 0) t += 1440;
    tempoPorLinha[nome] = (tempoPorLinha[nome] || 0) + Math.max(0, t);
  });

  const entries = Object.entries(porLinha)
    .map(([linha, arr]) => ({ linha, duracao: somaDur(arr), total: tempoPorLinha[linha] || 0 }))
    .sort((a, b) => b.duracao - a.duracao)
    .slice(0, 10);

  const options = {
    chart: { type: 'bar', height: Math.max(240, entries.length * 36), toolbar: { show: false } },
    series: [{ name: 'Min. parados', data: entries.map(e => e.duracao) }],
    xaxis: { categories: entries.map(e => e.linha) },
    plotOptions: {
      bar: {
        horizontal: true, borderRadius: 4, barHeight: '70%',
        dataLabels: { position: 'bottom' }
      }
    },
    dataLabels: {
      enabled: true, textAnchor: 'start', offsetX: 0,
      formatter: (v, { dataPointIndex }) => {
        const e = entries[dataPointIndex];
        const pct = e.total > 0 ? (e.duracao / e.total) * 100 : 0;
        return `${OEE.minutesToDisplay(e.duracao)} (${pct.toFixed(1)}%)`;
      },
      style: { colors: ['#fff'], fontSize: '11px', fontWeight: 600 }
    },
    colors: [PARADAS_CORES.laranja],
    tooltip: { y: { formatter: v => OEE.minutesToDisplay(v) } }
  };

  const el = document.getElementById('par-ranking');
  el.innerHTML = '';
  paradasState.charts.ranking = new ApexCharts(el, options);
  paradasState.charts.ranking.render();
}

// ---------- Tabela drill-down ----------
function renderTabelaDrill(paradas) {
  const porMotivo = {};
  paradas.forEach(p => {
    const k = p.motivo_nome;
    if (!porMotivo[k]) porMotivo[k] = { itens: [], tipo: p.motivo_tipo };
    porMotivo[k].itens.push(p);
  });

  const rows = Object.entries(porMotivo).map(([motivo, obj]) => {
    const total = somaDur(obj.itens);
    const media = total / obj.itens.length;
    const ultima = obj.itens.reduce((acc, p) => !acc || (p.data > acc) ? p.data : acc, null);
    return {
      motivo,
      tipo: obj.tipo,
      eventos: obj.itens.length,
      total,
      media,
      ultima,
      itens: obj.itens
    };
  }).sort((a, b) => b.total - a.total);

  const tbl = UI.table(
    [
      { key: 'motivo', label: 'Motivo' },
      { key: 'tipo', label: 'Tipo', align: 'center', format: t => {
        if (t === 'planejada') return '<span class="badge badge-yellow">Plan.</span>';
        if (t === 'setup') return '<span class="badge badge-blue">Setup</span>';
        return '<span class="badge badge-red">N.Plan.</span>';
      }},
      { key: 'eventos', label: 'Eventos', align: 'right' },
      { key: 'total', label: 'Duracao total', align: 'right', format: v => OEE.minutesToDisplay(v) },
      { key: 'media', label: 'Duracao media', align: 'right', format: v => OEE.minutesToDisplay(Math.round(v)) },
      { key: 'ultima', label: 'Ultima ocorrencia', align: 'center', format: v => v ? new Date(v + 'T12:00').toLocaleDateString('pt-BR') : '-' }
    ],
    rows,
    { emptyMsg: 'Sem paradas' }
  );

  const el = document.getElementById('par-tabela');
  el.innerHTML = tbl;

  // Tornar linhas clicaveis
  el.querySelectorAll('tbody tr').forEach((tr, idx) => {
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', () => openDrillModal(rows[idx]));
  });
}

function openDrillModal(row) {
  const ordensAgr = {};
  row.itens.forEach(p => {
    if (!ordensAgr[p.ordem_id]) {
      ordensAgr[p.ordem_id] = {
        ordem_id: p.ordem_id, linha: p.linha_nome, data: p.data, paradas: []
      };
    }
    ordensAgr[p.ordem_id].paradas.push(p);
  });

  const ordensArr = Object.values(ordensAgr).sort((a, b) => (b.data || '').localeCompare(a.data || ''));

  const body = `
    <p class="text-muted" style="font-size:0.85rem">
      <strong>${row.eventos}</strong> eventos em <strong>${ordensArr.length}</strong> ordens ·
      Total <strong>${OEE.minutesToDisplay(row.total)}</strong> ·
      Media <strong>${OEE.minutesToDisplay(Math.round(row.media))}</strong>
    </p>
    <div style="max-height:420px;overflow-y:auto">
      ${ordensArr.map(o => `
        <div style="padding:8px 0;border-bottom:1px solid var(--cinza-border)">
          <div class="flex justify-between items-center">
            <div>
              <strong>${o.linha}</strong>
              <span class="text-muted" style="margin-left:8px;font-size:0.85rem">
                ${o.data ? new Date(o.data + 'T12:00').toLocaleDateString('pt-BR') : '-'}
              </span>
            </div>
            <a href="#/ordens/${o.ordem_id}/paradas" class="btn btn-sm btn-outline">Abrir ordem</a>
          </div>
          <div style="font-size:0.78rem;color:var(--cinza-text);margin-top:4px">
            ${o.paradas.map(p =>
              `${p.hora_inicio?.slice(0,5)}–${p.hora_fim?.slice(0,5)} (${OEE.minutesToDisplay(p.duracao)})${p.descricao ? ' · ' + escapeHtml(p.descricao) : ''}`
            ).join(' &nbsp;|&nbsp; ')}
          </div>
        </div>
      `).join('')}
    </div>`;

  const mod = UI.modal(`Motivo: ${row.motivo}`, body, '<button class="btn btn-primary modal-close-btn">Fechar</button>');
  mod.el.querySelector('.modal-close-btn').addEventListener('click', mod.close);
}

// ---------- Helpers locais ----------
function computeDuracaoMin(inicio, fim) {
  if (!inicio || !fim) return null;
  const i = OEE.timeToMinutes(inicio.slice(0, 5));
  const f = OEE.timeToMinutes(fim.slice(0, 5));
  let dur = f - i;
  if (dur < 0) dur += 1440;
  return dur;
}

function agrupar(arr, keyFn) {
  const out = {};
  arr.forEach(item => {
    const k = keyFn(item);
    if (!out[k]) out[k] = [];
    out[k].push(item);
  });
  return out;
}

function somaDur(arr) {
  return arr.reduce((s, p) => s + (p.duracao || 0), 0);
}

function formatDateBR(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr + 'T12:00').toLocaleDateString('pt-BR');
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
