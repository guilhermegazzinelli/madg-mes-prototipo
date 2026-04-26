// MADG MES — Formulario de Apontamento de Producao

async function renderOrdemForm(container, params = {}) {
  container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  const isEdit = !!params.id;

  try {
    // Carregar dados de referencia
    const [{ data: unidades }, { data: linhas }, { data: produtos }, { data: motivos }] = await Promise.all([
      db.from('unidades').select('id, nome').eq('ativo', true).order('nome'),
      db.from('linhas').select('id, nome, unidade_id').eq('ativo', true).order('nome'),
      db.from('produtos').select('id, codigo, descricao').eq('ativo', true).order('codigo'),
      db.from('motivos_parada').select('id, nome, tipo').eq('ativo', true).order('nome')
    ]);

    let ordem = null;
    let paradasInline = [];
    if (isEdit) {
      const { data, error } = await db.from('ordens_producao').select('*').eq('id', params.id).single();
      if (error) throw error;
      ordem = data;

      // Carrega paradas existentes desta ordem para a mini-tabela
      const { data: paradasExist } = await db
        .from('paradas')
        .select('motivo_id, hora_inicio, hora_fim, descricao')
        .eq('ordem_id', params.id)
        .order('hora_inicio');
      paradasInline = (paradasExist || []).map(p => ({
        motivo_id: p.motivo_id || '',
        hora_inicio: p.hora_inicio ? p.hora_inicio.slice(0, 5) : '',
        hora_fim: p.hora_fim ? p.hora_fim.slice(0, 5) : '',
        descricao: p.descricao || ''
      }));
    }

    const hoje = new Date().toISOString().split('T')[0];

    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">${isEdit ? 'Editar Ordem' : 'Nova Ordem de Producao'}</h1>
      </div>

      <form id="ordem-form" class="card">
        <div class="form-row">
          <div class="form-group">
            <label>Data</label>
            <input type="date" class="form-control" name="data" value="${ordem?.data || hoje}">
          </div>
          <div class="form-group">
            <label>Unidade</label>
            <select class="form-control" name="unidade_id" id="sel-unidade">
              <option value="">Selecione...</option>
              ${unidades.map(u => `<option value="${u.id}" ${u.id === ordem?.unidade_id ? 'selected' : ''}>${u.nome}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Linha</label>
            <select class="form-control" name="linha_id" id="sel-linha">
              <option value="">Selecione a unidade primeiro</option>
            </select>
          </div>
          <div class="form-group">
            <label>Produto</label>
            <select class="form-control" name="produto_id" id="sel-produto">
              <option value="">Selecione...</option>
              ${produtos.map(p => `<option value="${p.id}" ${p.id === ordem?.produto_id ? 'selected' : ''}>${p.codigo} - ${p.descricao}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="form-group" style="padding:8px 12px; background:var(--cinza-bg); border-radius:var(--radius)">
          <span class="text-muted" style="font-size:0.8rem">Velocidade padrao:</span>
          <strong id="velocidade-display">-</strong>
          <input type="hidden" name="velocidade_padrao" id="velocidade-val" value="${ordem?.velocidade_padrao || ''}">
        </div>

        <hr style="margin:16px 0; border:none; border-top:1px solid var(--cinza-border)">

        <div class="form-row">
          <div class="form-group">
            <label>Hora Inicio (HH:MM)</label>
            <input type="text" class="form-control oee-input time-24h" name="hora_inicio" value="${ordem?.hora_inicio?.slice(0,5) || ''}" placeholder="08:00" maxlength="5" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]">
          </div>
          <div class="form-group">
            <label>Hora Fim (HH:MM)</label>
            <input type="text" class="form-control oee-input time-24h" name="hora_fim" value="${ordem?.hora_fim?.slice(0,5) || ''}" placeholder="17:00" maxlength="5" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]">
          </div>
        </div>

        <div class="form-row" style="grid-template-columns: 1fr 1fr 1fr">
          <div class="form-group">
            <label>Parada Planejada (min) <small id="hint-planejado" class="text-muted" style="display:none">auto</small></label>
            <input type="number" class="form-control oee-input" name="tempo_planejado" value="${ordem?.tempo_planejado || 0}" min="0">
          </div>
          <div class="form-group">
            <label>Setup (min) <small id="hint-setup" class="text-muted" style="display:none">auto</small></label>
            <input type="number" class="form-control oee-input" name="tempo_setup" value="${ordem?.tempo_setup || 0}" min="0">
          </div>
          <div class="form-group">
            <label>Parada Nao Plan. (min) <small id="hint-parada" class="text-muted" style="display:none">auto</small></label>
            <input type="number" class="form-control oee-input" name="tempo_parada" value="${ordem?.tempo_parada || 0}" min="0">
          </div>
        </div>

        <!-- Paradas detalhadas (mini-tabela inline) -->
        <div class="form-group" style="border:1px solid var(--cinza-border);border-radius:var(--radius);padding:12px;background:#fafafa">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <label style="margin:0"><strong>Paradas detalhadas</strong> <small class="text-muted">(opcional — sobrescreve os minutos acima)</small></label>
            <button type="button" class="btn btn-sm btn-outline" id="btn-add-parada">+ Parada</button>
          </div>
          <div id="paradas-inline-header" style="display:none;grid-template-columns: 2fr 0.8fr 0.8fr 0.8fr 2fr auto;gap:6px;padding:0 4px 4px;font-size:0.75rem;color:var(--cinza-text);font-weight:600">
            <div>Motivo</div><div>Inicio</div><div>Fim</div><div>Dur.</div><div>Descricao</div><div></div>
          </div>
          <div id="paradas-inline-list"></div>
          <div id="paradas-totais" style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--cinza-border);font-size:0.8rem;color:var(--cinza-text);display:none">
            <strong>Totais:</strong>
            <span id="tot-planejada">0min</span> planejada &nbsp;|&nbsp;
            <span id="tot-setup">0min</span> setup &nbsp;|&nbsp;
            <span id="tot-nao-planejada">0min</span> nao plan.
          </div>
        </div>

        <hr style="margin:16px 0; border:none; border-top:1px solid var(--cinza-border)">

        <div class="form-row" style="grid-template-columns: 1fr 1fr 1fr">
          <div class="form-group">
            <label>Qtd. Produzida</label>
            <input type="number" step="0.01" class="form-control oee-input" name="qtd_produzida" value="${ordem?.qtd_produzida || ''}" placeholder="0">
          </div>
          <div class="form-group">
            <label>Qtd. Rejeitada</label>
            <input type="number" step="0.01" class="form-control oee-input" name="qtd_rejeitada" value="${ordem?.qtd_rejeitada || 0}" placeholder="0">
          </div>
          <div class="form-group">
            <label>Qtd. Reprocesso</label>
            <input type="number" step="0.01" class="form-control oee-input" name="qtd_reprocesso" value="${ordem?.qtd_reprocesso || 0}" placeholder="0">
          </div>
        </div>

        <div class="form-group">
          <label>Observacao</label>
          <input type="text" class="form-control" name="observacao" value="${ordem?.observacao || ''}" placeholder="Opcional">
        </div>

        <!-- Resumo de tempos calculados -->
        <div id="oee-tempos" style="padding:10px 12px; background:var(--cinza-bg); border-radius:var(--radius); font-size:0.8rem; color:var(--cinza-text); margin-bottom:8px"></div>

        <!-- Painel OEE ao vivo -->
        <div class="oee-panel" id="oee-live">
          <div>
            <div class="oee-item-label">Disponib.</div>
            <div class="oee-item-value" id="oee-d">-</div>
          </div>
          <div>
            <div class="oee-item-label">Perform.</div>
            <div class="oee-item-value" id="oee-p">-</div>
          </div>
          <div>
            <div class="oee-item-label">Qualidade</div>
            <div class="oee-item-value" id="oee-q">-</div>
          </div>
          <div>
            <div class="oee-item-label">OEE</div>
            <div class="oee-item-value" id="oee-total">-</div>
          </div>
        </div>

        <div class="form-actions">
          <a href="#/ordens" class="btn btn-outline">Cancelar</a>
          <button type="submit" class="btn btn-primary">${isEdit ? 'Atualizar' : 'Salvar Ordem'}</button>
        </div>
      </form>`;

    // Estado local
    const allLinhas = linhas;
    const form = container.querySelector('#ordem-form');
    const selUnidade = form.querySelector('#sel-unidade');
    const selLinha = form.querySelector('#sel-linha');
    const selProduto = form.querySelector('#sel-produto');

    // Filtrar linhas por unidade
    function updateLinhas() {
      const uid = selUnidade.value;
      const filtered = allLinhas.filter(l => l.unidade_id === uid);
      selLinha.innerHTML = '<option value="">Selecione...</option>' +
        filtered.map(l => `<option value="${l.id}" ${l.id === ordem?.linha_id ? 'selected' : ''}>${l.nome}</option>`).join('');
      updateVelocidade();
    }

    // Buscar velocidade padrao
    async function updateVelocidade() {
      const produto_id = selProduto.value;
      const linha_id = selLinha.value;
      const display = document.getElementById('velocidade-display');
      const input = document.getElementById('velocidade-val');

      if (!produto_id || !linha_id) {
        display.textContent = '-';
        input.value = '';
        updateOEE();
        return;
      }

      const { data } = await db.from('taxas_producao')
        .select('velocidade, unidade_velocidade')
        .eq('produto_id', produto_id)
        .eq('linha_id', linha_id)
        .single();

      if (data) {
        display.textContent = `${OEE.num(data.velocidade, 0)} ${data.unidade_velocidade}`;
        input.value = data.velocidade;
      } else {
        display.textContent = 'Nao cadastrada (informe manualmente)';
        input.value = '';
      }
      updateOEE();
    }

    // Calculo OEE ao vivo
    function updateOEE() {
      const formData = Object.fromEntries(new FormData(form));
      formData.velocidade_padrao = document.getElementById('velocidade-val').value;
      const r = OEE.calcular(formData);

      // Mostrar tempos intermediarios para validacao
      const temposEl = document.getElementById('oee-tempos');
      if (formData.hora_inicio && formData.hora_fim) {
        const vel = Number(formData.velocidade_padrao) || 0;
        temposEl.innerHTML = `
          <strong>Tempo total:</strong> ${OEE.minutesToDisplay(r.totalMin)}
          &nbsp;|&nbsp; <strong>Programado:</strong> ${OEE.minutesToDisplay(r.tempoProgramado)}
          &nbsp;|&nbsp; <strong>Produtivo:</strong> ${OEE.minutesToDisplay(r.tempoProdutivo)}
          ${vel > 0 ? `&nbsp;|&nbsp; <strong>Qtd. teorica:</strong> ${OEE.num(r.qtdTeorica, 1)}` : ''}
        `;
        // Alerta se tempo total parecer errado (> 16h)
        if (r.totalMin > 960) {
          temposEl.innerHTML += `<br><span style="color:var(--vermelho)">⚠ Tempo total de ${OEE.minutesToDisplay(r.totalMin)} — verifique as horas</span>`;
        }
      } else {
        temposEl.innerHTML = 'Preencha hora inicio e fim para ver o calculo';
      }

      document.getElementById('oee-d').textContent = formData.hora_inicio && formData.hora_fim ? OEE.pct(r.disponibilidade) : '-';
      document.getElementById('oee-p').textContent = r.qtdTeorica > 0 ? OEE.pct(r.performance) : '-';
      document.getElementById('oee-q').textContent = r.producaoTotal > 0 ? OEE.pct(r.qualidade) : '-';

      const hasData = formData.hora_inicio && formData.hora_fim && r.qtdTeorica > 0 && r.producaoTotal > 0;
      document.getElementById('oee-total').textContent = hasData ? OEE.pct(r.oee) : '-';
    }

    // ==========================================================
    // Paradas inline — gerenciamento do array local
    // ==========================================================
    function computeDuracao(inicio, fim) {
      if (!inicio || !fim || inicio.length < 5 || fim.length < 5) return null;
      let dur = OEE.timeToMinutes(fim) - OEE.timeToMinutes(inicio);
      if (dur < 0) dur += 1440;
      return dur;
    }

    function maskTime24h(raw) {
      let v = (raw || '').replace(/[^\d]/g, '');
      if (v.length >= 3) v = v.slice(0, 2) + ':' + v.slice(2, 4);
      if (v.length > 5) v = v.slice(0, 5);
      const parts = v.split(':');
      if (parts[0] && parseInt(parts[0]) > 23) v = '23' + (parts[1] !== undefined ? ':' + parts[1] : '');
      if (parts[1] && parseInt(parts[1]) > 59) v = parts[0] + ':59';
      return v;
    }

    function renderParadasInline() {
      const listEl = document.getElementById('paradas-inline-list');
      const headerEl = document.getElementById('paradas-inline-header');
      const totaisEl = document.getElementById('paradas-totais');

      if (paradasInline.length === 0) {
        listEl.innerHTML = '<p class="text-muted" style="font-size:0.85rem;margin:4px 0 0">Nenhuma parada adicionada. Os minutos acima ficam editaveis.</p>';
        headerEl.style.display = 'none';
        totaisEl.style.display = 'none';
      } else {
        headerEl.style.display = 'grid';
        totaisEl.style.display = '';
        listEl.innerHTML = paradasInline.map((p, idx) => {
          const dur = computeDuracao(p.hora_inicio, p.hora_fim);
          const motivoOpts = motivos.map(m =>
            `<option value="${m.id}" ${m.id === p.motivo_id ? 'selected' : ''} data-tipo="${m.tipo}">${m.nome} (${m.tipo})</option>`
          ).join('');
          return `
            <div class="parada-row" data-idx="${idx}" style="display:grid;grid-template-columns: 2fr 0.8fr 0.8fr 0.8fr 2fr auto;gap:6px;align-items:center;margin-bottom:6px">
              <select class="form-control parada-field" data-field="motivo_id">
                <option value="">Motivo...</option>${motivoOpts}
              </select>
              <input type="text" class="form-control parada-field time-24h-inline" data-field="hora_inicio" value="${p.hora_inicio}" placeholder="08:00" maxlength="5" inputmode="numeric">
              <input type="text" class="form-control parada-field time-24h-inline" data-field="hora_fim" value="${p.hora_fim}" placeholder="08:30" maxlength="5" inputmode="numeric">
              <div style="padding:8px;text-align:center;font-size:0.85rem;color:${dur !== null ? 'var(--cinza-text)' : 'var(--vermelho)'}">${dur !== null ? OEE.minutesToDisplay(dur) : '-'}</div>
              <input type="text" class="form-control parada-field" data-field="descricao" value="${p.descricao || ''}" placeholder="Descricao (opcional)">
              <button type="button" class="btn btn-sm btn-danger parada-remove" data-idx="${idx}" title="Remover">✕</button>
            </div>`;
        }).join('');

        // Event listeners das linhas (mascara + atualizacao + recalculo num unico handler)
        listEl.querySelectorAll('.parada-row').forEach(row => {
          const idx = Number(row.dataset.idx);
          row.querySelectorAll('.parada-field').forEach(inp => {
            const field = inp.dataset.field;
            const isTime = inp.classList.contains('time-24h-inline');
            inp.addEventListener('input', (e) => {
              let v = e.target.value;
              if (isTime) {
                v = maskTime24h(v);
                e.target.value = v;
              }
              paradasInline[idx][field] = v;
              // Atualiza celula de duracao em tempo real
              if (isTime) {
                const dur = computeDuracao(paradasInline[idx].hora_inicio, paradasInline[idx].hora_fim);
                const durCell = row.children[3];
                if (durCell) {
                  durCell.textContent = dur !== null ? OEE.minutesToDisplay(dur) : '-';
                  durCell.style.color = dur !== null ? 'var(--cinza-text)' : 'var(--vermelho)';
                }
              }
              recalcularParadas();
            });
          });
        });
        listEl.querySelectorAll('.parada-remove').forEach(btn => {
          btn.addEventListener('click', () => {
            paradasInline.splice(Number(btn.dataset.idx), 1);
            renderParadasInline();
            recalcularParadas();
          });
        });
      }
    }

    function recalcularParadas() {
      const totais = { planejada: 0, setup: 0, nao_planejada: 0 };
      paradasInline.forEach(p => {
        const motivo = motivos.find(m => m.id === p.motivo_id);
        const dur = computeDuracao(p.hora_inicio, p.hora_fim);
        if (motivo && dur !== null && dur > 0) {
          totais[motivo.tipo] += dur;
        }
      });

      const inpPlanejado = form.querySelector('[name=tempo_planejado]');
      const inpSetup = form.querySelector('[name=tempo_setup]');
      const inpParada = form.querySelector('[name=tempo_parada]');
      const hasInline = paradasInline.length > 0;

      inpPlanejado.readOnly = hasInline;
      inpSetup.readOnly = hasInline;
      inpParada.readOnly = hasInline;
      document.getElementById('hint-planejado').style.display = hasInline ? '' : 'none';
      document.getElementById('hint-setup').style.display = hasInline ? '' : 'none';
      document.getElementById('hint-parada').style.display = hasInline ? '' : 'none';

      if (hasInline) {
        inpPlanejado.value = totais.planejada;
        inpSetup.value = totais.setup;
        inpParada.value = totais.nao_planejada;
      }

      document.getElementById('tot-planejada').textContent = OEE.minutesToDisplay(totais.planejada);
      document.getElementById('tot-setup').textContent = OEE.minutesToDisplay(totais.setup);
      document.getElementById('tot-nao-planejada').textContent = OEE.minutesToDisplay(totais.nao_planejada);

      // Re-renderizar a coluna de duracao sem perder foco? Simples: so atualiza totais aqui.
      // A duracao por linha sera refletida no proximo render (que ja acontece em adicionar/remover).
      updateOEE();
    }

    function applyTimeMask24h(input) {
      input.addEventListener('input', (e) => {
        let v = e.target.value.replace(/[^\d]/g, '');
        if (v.length >= 3) v = v.slice(0, 2) + ':' + v.slice(2, 4);
        if (v.length > 5) v = v.slice(0, 5);
        const parts = v.split(':');
        if (parts[0] && parseInt(parts[0]) > 23) v = '23' + (parts[1] !== undefined ? ':' + parts[1] : '');
        if (parts[1] && parseInt(parts[1]) > 59) v = parts[0] + ':59';
        e.target.value = v;
      });
    }

    document.getElementById('btn-add-parada').addEventListener('click', () => {
      paradasInline.push({ motivo_id: '', hora_inicio: '', hora_fim: '', descricao: '' });
      renderParadasInline();
      recalcularParadas();
    });

    renderParadasInline();
    recalcularParadas();

    // ==========================================================
    // Event listeners
    // ==========================================================
    selUnidade.addEventListener('change', updateLinhas);
    selLinha.addEventListener('change', updateVelocidade);
    selProduto.addEventListener('change', updateVelocidade);

    form.querySelectorAll('.oee-input').forEach(input => {
      input.addEventListener('input', updateOEE);
    });

    // Mascara 24h nos campos de hora (auto-insere ":" apos 2 digitos)
    form.querySelectorAll('.time-24h').forEach(input => {
      input.addEventListener('input', (e) => {
        let v = e.target.value.replace(/[^\d]/g, '');
        if (v.length >= 3) v = v.slice(0, 2) + ':' + v.slice(2, 4);
        if (v.length > 5) v = v.slice(0, 5);
        // Validar hora 0-23 e minuto 0-59
        const parts = v.split(':');
        if (parts[0] && parseInt(parts[0]) > 23) v = '23' + (parts[1] !== undefined ? ':' + parts[1] : '');
        if (parts[1] && parseInt(parts[1]) > 59) v = parts[0] + ':59';
        e.target.value = v;
        updateOEE();
      });
    });

    // Init
    if (ordem?.unidade_id) updateLinhas();
    updateOEE();

    // Submit
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(form));

      if (!fd.unidade_id || !fd.linha_id || !fd.produto_id) {
        UI.toast('Selecione unidade, linha e produto', 'error'); return;
      }
      if (!fd.hora_inicio || !fd.hora_fim) {
        UI.toast('Informe hora inicio e fim', 'error'); return;
      }

      const payload = {
        unidade_id: fd.unidade_id,
        linha_id: fd.linha_id,
        produto_id: fd.produto_id,
        data: fd.data,
        hora_inicio: fd.hora_inicio,
        hora_fim: fd.hora_fim,
        velocidade_padrao: parseFloat(document.getElementById('velocidade-val').value) || 0,
        tempo_planejado: parseInt(fd.tempo_planejado) || 0,
        tempo_setup: parseInt(fd.tempo_setup) || 0,
        tempo_parada: parseInt(fd.tempo_parada) || 0,
        qtd_produzida: parseFloat(fd.qtd_produzida) || 0,
        qtd_rejeitada: parseFloat(fd.qtd_rejeitada) || 0,
        criado_por: currentUser?.id || null,
        qtd_reprocesso: parseFloat(fd.qtd_reprocesso) || 0,
        observacao: fd.observacao || null
      };

      let ordemId = isEdit ? params.id : null;
      let error;
      if (isEdit) {
        ({ error } = await db.from('ordens_producao').update(payload).eq('id', params.id));
      } else {
        const { data: novaOrdem, error: e } = await db
          .from('ordens_producao')
          .insert(payload)
          .select('id')
          .single();
        error = e;
        if (novaOrdem) ordemId = novaOrdem.id;
      }

      if (error) { UI.toast('Erro ao salvar ordem: ' + error.message, 'error'); return; }

      // Sincronizar paradas inline:
      // - Em edit: sempre limpa as existentes da ordem (mesmo se paradasInline ficou vazio)
      // - Em create: so insere se tem paradas
      if (isEdit) {
        const { error: eDel } = await db.from('paradas').delete().eq('ordem_id', ordemId);
        if (eDel) {
          UI.toast('Ordem salva, mas erro ao limpar paradas antigas: ' + eDel.message, 'error');
          Router.navigate('/ordens');
          return;
        }
      }

      const paradasValidas = paradasInline.filter(p =>
        p.motivo_id && p.hora_inicio && p.hora_fim
      ).map(p => ({
        ordem_id: ordemId,
        linha_id: payload.linha_id,
        motivo_id: p.motivo_id,
        hora_inicio: p.hora_inicio,
        hora_fim: p.hora_fim,
        descricao: p.descricao || null
      }));

      if (paradasValidas.length > 0) {
        const { error: eIns } = await db.from('paradas').insert(paradasValidas);
        if (eIns) {
          UI.toast('Ordem salva, mas erro ao gravar paradas: ' + eIns.message, 'error');
          Router.navigate('/ordens');
          return;
        }
      }

      const ignoradas = paradasInline.length - paradasValidas.length;
      if (ignoradas > 0) {
        UI.toast(`${ignoradas} parada(s) ignorada(s) por estarem incompletas`, 'error');
      }

      UI.toast(isEdit ? 'Ordem atualizada' : 'Ordem registrada');
      Router.navigate('/ordens');
    });

  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>Erro: ${err.message}</p></div>`;
  }
}
