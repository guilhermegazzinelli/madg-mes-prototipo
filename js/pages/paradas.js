// MADG MES — Registro de Paradas (detalhe por ordem)

async function renderParadas(container, params = {}) {
  if (!params.id) { Router.navigate('/ordens'); return; }

  container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    const [{ data: ordem }, { data: paradas, error: e2 }, { data: motivos }] = await Promise.all([
      db.from('ordens_producao').select('*, linhas(nome), produtos(codigo, descricao)').eq('id', params.id).single(),
      db.from('paradas').select('*, motivos_parada(nome, tipo)').eq('ordem_id', params.id).order('hora_inicio'),
      db.from('motivos_parada').select('id, nome, tipo').eq('ativo', true).order('nome')
    ]);

    if (!ordem) { container.innerHTML = '<p>Ordem nao encontrada</p>'; return; }

    const totalParadasMin = (paradas || []).reduce((sum, p) => {
      if (!p.hora_inicio || !p.hora_fim) return sum;
      let dur = OEE.timeToMinutes(p.hora_fim.slice(0,5)) - OEE.timeToMinutes(p.hora_inicio.slice(0,5));
      if (dur < 0) dur += 1440;
      return sum + dur;
    }, 0);

    const declaradoMin = (ordem.tempo_setup || 0) + (ordem.tempo_parada || 0);

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Paradas da Ordem</h1>
          <p class="page-subtitle">${ordem.produtos?.codigo} — ${ordem.linhas?.nome} — ${new Date(ordem.data + 'T12:00').toLocaleDateString('pt-BR')}</p>
        </div>
        <a href="#/ordens/${params.id}" class="btn btn-outline">Voltar</a>
      </div>

      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-value">${OEE.minutesToDisplay(declaradoMin)}</div>
          <div class="stat-label">Declarado na Ordem</div>
        </div>
        <div class="stat-card">
          <div class="stat-value ${totalParadasMin > declaradoMin ? 'text-red' : ''}">${OEE.minutesToDisplay(totalParadasMin)}</div>
          <div class="stat-label">Detalhado Aqui</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${(paradas || []).length}</div>
          <div class="stat-label">Eventos</div>
        </div>
      </div>

      <button class="btn btn-warning mb-2" id="btn-nova-parada">+ Registrar Parada</button>

      <div id="paradas-list">
        ${UI.table([
          { key: 'hora_inicio', label: 'Inicio', format: v => v?.slice(0,5) },
          { key: 'hora_fim', label: 'Fim', format: v => v?.slice(0,5) || 'Em andamento' },
          { key: 'motivos_parada', label: 'Motivo', format: v => v?.nome || '-' },
          { key: 'motivos_parada', label: 'Tipo', align: 'center', format: v => {
            if (!v) return '-';
            if (v.tipo === 'planejada') return '<span class="badge badge-blue">Plan.</span>';
            if (v.tipo === 'setup') return '<span class="badge badge-yellow">Setup</span>';
            return '<span class="badge badge-red">N.Plan.</span>';
          }},
          { key: 'descricao', label: 'Descricao' },
        ], paradas || [], { onDelete: true, emptyMsg: 'Nenhuma parada registrada' })}
      </div>`;

    container.querySelector('#btn-nova-parada').addEventListener('click', () => {
      openParadaForm(params.id, ordem.linha_id, motivos);
    });

    container.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (await UI.confirm('Excluir esta parada?')) {
          await db.from('paradas').delete().eq('id', btn.dataset.id);
          UI.toast('Parada excluida');
          renderParadas(container, params);
        }
      });
    });

  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>Erro: ${err.message}</p></div>`;
  }
}

function openParadaForm(ordemId, linhaId, motivos) {
  const motivoOpts = motivos.map(m => `<option value="${m.id}">${m.nome} (${m.tipo})</option>`).join('');

  const { el, close } = UI.modal('Registrar Parada',
    `<div class="form-row">
      <div class="form-group">
        <label>Hora Inicio (HH:MM)</label>
        <input type="text" class="form-control time-24h-modal" id="par-inicio" placeholder="08:00" maxlength="5" inputmode="numeric">
      </div>
      <div class="form-group">
        <label>Hora Fim (HH:MM)</label>
        <input type="text" class="form-control time-24h-modal" id="par-fim" placeholder="08:30" maxlength="5" inputmode="numeric">
      </div>
    </div>
    <div class="form-group">
      <label>Motivo</label>
      <select class="form-control" id="par-motivo">
        <option value="">Selecione...</option>${motivoOpts}
      </select>
    </div>
    <div class="form-group">
      <label>Descricao</label>
      <input type="text" class="form-control" id="par-desc" placeholder="Opcional">
    </div>`,
    `<button class="btn btn-outline btn-cancel">Cancelar</button>
     <button class="btn btn-primary btn-save">Salvar</button>`
  );

  // Mascara 24h
  el.querySelectorAll('.time-24h-modal').forEach(input => {
    input.addEventListener('input', (e) => {
      let v = e.target.value.replace(/[^\d]/g, '');
      if (v.length >= 3) v = v.slice(0, 2) + ':' + v.slice(2, 4);
      if (v.length > 5) v = v.slice(0, 5);
      const parts = v.split(':');
      if (parts[0] && parseInt(parts[0]) > 23) v = '23' + (parts[1] !== undefined ? ':' + parts[1] : '');
      if (parts[1] && parseInt(parts[1]) > 59) v = parts[0] + ':59';
      e.target.value = v;
    });
  });

  el.querySelector('.btn-cancel').addEventListener('click', close);
  el.querySelector('.btn-save').addEventListener('click', async () => {
    const hora_inicio = el.querySelector('#par-inicio').value;
    const hora_fim = el.querySelector('#par-fim').value;
    if (!hora_inicio) { UI.toast('Hora inicio obrigatoria', 'error'); return; }

    const payload = {
      ordem_id: ordemId,
      linha_id: linhaId,
      hora_inicio,
      hora_fim: hora_fim || null,
      motivo_id: el.querySelector('#par-motivo').value || null,
      descricao: el.querySelector('#par-desc').value.trim() || null
    };

    const { error } = await db.from('paradas').insert(payload);
    if (error) { UI.toast('Erro: ' + error.message, 'error'); return; }
    UI.toast('Parada registrada');
    close();
    renderParadas(document.getElementById('main-content'), { id: ordemId });
  });
}
