// MADG MES — Lista de Ordens de Producao

async function renderOrdens(container) {
  container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  const hoje = new Date().toISOString().split('T')[0];

  try {
    const [{ data: linhas }, { data: unidades }] = await Promise.all([
      db.from('linhas').select('id, nome').order('nome'),
      db.from('unidades').select('id, nome').order('nome')
    ]);

    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Ordens de Producao</h1>
        <a href="#/ordens/new" class="btn btn-warning">+ Nova Ordem</a>
      </div>

      <div class="card mb-2">
        <div class="form-row" style="grid-template-columns: 1fr 1fr 1fr auto">
          <div class="form-group">
            <label>Data Inicio</label>
            <input type="date" class="form-control" id="filtro-de" value="${hoje}">
          </div>
          <div class="form-group">
            <label>Data Fim</label>
            <input type="date" class="form-control" id="filtro-ate" value="${hoje}">
          </div>
          <div class="form-group">
            <label>Linha</label>
            <select class="form-control" id="filtro-linha">
              <option value="">Todas</option>
              ${linhas.map(l => `<option value="${l.id}">${l.nome}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="align-self:end">
            <button class="btn btn-primary" id="btn-filtrar">Filtrar</button>
          </div>
        </div>
      </div>

      <div id="ordens-list"></div>`;

    async function loadOrdens() {
      const de = document.getElementById('filtro-de').value;
      const ate = document.getElementById('filtro-ate').value;
      const linhaId = document.getElementById('filtro-linha').value;
      const listEl = document.getElementById('ordens-list');

      listEl.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

      let query = db.from('ordens_producao')
        .select('*, linhas(nome), produtos(codigo, descricao), unidades(nome)')
        .order('data', { ascending: false })
        .order('hora_inicio', { ascending: true });

      if (de) query = query.gte('data', de);
      if (ate) query = query.lte('data', ate);
      if (linhaId) query = query.eq('linha_id', linhaId);

      const { data: ordens, error } = await query.limit(100);
      if (error) { listEl.innerHTML = `<p class="text-red">Erro: ${error.message}</p>`; return; }

      if (!ordens || ordens.length === 0) {
        listEl.innerHTML = `<div class="empty-state"><div class="icon">📋</div><p>Nenhuma ordem no periodo</p></div>`;
        return;
      }

      // Calcular OEE para cada ordem
      const rows = ordens.map(o => {
        const r = OEE.calcular(o);
        return { ...o, _oee: r };
      });

      listEl.innerHTML = UI.table([
        { key: 'data', label: 'Data', format: v => new Date(v + 'T12:00').toLocaleDateString('pt-BR') },
        { key: 'unidades', label: 'Unidade', format: v => v?.nome || '-' },
        { key: 'linhas', label: 'Linha', format: v => v?.nome || '-' },
        { key: 'produtos', label: 'Produto', format: v => v ? `${v.codigo}` : '-' },
        { key: 'hora_inicio', label: 'Inicio', format: v => v?.slice(0,5) },
        { key: 'hora_fim', label: 'Fim', format: v => v?.slice(0,5) },
        { key: '_oee', label: 'Disp.', align: 'center', format: v => `<span class="badge ${OEE.badgeClass(v.disponibilidade)}">${OEE.pct(v.disponibilidade)}</span>` },
        { key: '_oee', label: 'Perf.', align: 'center', format: v => `<span class="badge ${OEE.badgeClass(v.performance)}">${OEE.pct(v.performance)}</span>` },
        { key: '_oee', label: 'Qual.', align: 'center', format: v => `<span class="badge ${OEE.badgeClass(v.qualidade)}">${OEE.pct(v.qualidade)}</span>` },
        { key: '_oee', label: 'OEE', align: 'center', format: v => `<strong class="badge ${OEE.badgeClass(v.oee)}">${OEE.pct(v.oee)}</strong>` },
        { key: 'qtd_produzida', label: 'Produzido', align: 'right', format: v => OEE.num(v, 0) },
      ], rows, {
        onEdit: true,
        emptyMsg: 'Nenhuma ordem encontrada'
      });

      // Consolidado do periodo
      const consolidado = OEE.consolidar(ordens);
      const summaryEl = document.createElement('div');
      summaryEl.className = 'oee-panel mt-2';
      summaryEl.innerHTML = `
        <div>
          <div class="oee-item-label">Disp. Media</div>
          <div class="oee-item-value">${OEE.pct(consolidado.disponibilidade)}</div>
        </div>
        <div>
          <div class="oee-item-label">Perf. Media</div>
          <div class="oee-item-value">${OEE.pct(consolidado.performance)}</div>
        </div>
        <div>
          <div class="oee-item-label">Qual. Media</div>
          <div class="oee-item-value">${OEE.pct(consolidado.qualidade)}</div>
        </div>
        <div>
          <div class="oee-item-label">OEE Consolidado</div>
          <div class="oee-item-value">${OEE.pct(consolidado.oee)}</div>
        </div>`;
      listEl.prepend(summaryEl);

      // Edit clicks
      listEl.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', () => Router.navigate(`/ordens/${btn.dataset.id}`));
      });
    }

    container.querySelector('#btn-filtrar').addEventListener('click', loadOrdens);
    loadOrdens();

  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>Erro: ${err.message}</p></div>`;
  }
}
