// MADG MES — Formulario de Apontamento de Producao

async function renderOrdemForm(container, params = {}) {
  container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  const isEdit = !!params.id;

  try {
    // Carregar dados de referencia
    const [{ data: unidades }, { data: linhas }, { data: produtos }] = await Promise.all([
      db.from('unidades').select('id, nome').eq('ativo', true).order('nome'),
      db.from('linhas').select('id, nome, unidade_id').eq('ativo', true).order('nome'),
      db.from('produtos').select('id, codigo, descricao').eq('ativo', true).order('codigo')
    ]);

    let ordem = null;
    if (isEdit) {
      const { data, error } = await db.from('ordens_producao').select('*').eq('id', params.id).single();
      if (error) throw error;
      ordem = data;
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
            <label>Hora Inicio</label>
            <input type="time" class="form-control oee-input" name="hora_inicio" value="${ordem?.hora_inicio?.slice(0,5) || ''}">
          </div>
          <div class="form-group">
            <label>Hora Fim</label>
            <input type="time" class="form-control oee-input" name="hora_fim" value="${ordem?.hora_fim?.slice(0,5) || ''}">
          </div>
        </div>

        <div class="form-row" style="grid-template-columns: 1fr 1fr 1fr">
          <div class="form-group">
            <label>Parada Planejada (min)</label>
            <input type="number" class="form-control oee-input" name="tempo_planejado" value="${ordem?.tempo_planejado || 0}" min="0">
          </div>
          <div class="form-group">
            <label>Setup (min)</label>
            <input type="number" class="form-control oee-input" name="tempo_setup" value="${ordem?.tempo_setup || 0}" min="0">
          </div>
          <div class="form-group">
            <label>Parada Nao Plan. (min)</label>
            <input type="number" class="form-control oee-input" name="tempo_parada" value="${ordem?.tempo_parada || 0}" min="0">
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

      document.getElementById('oee-d').textContent = formData.hora_inicio && formData.hora_fim ? OEE.pct(r.disponibilidade) : '-';
      document.getElementById('oee-p').textContent = r.qtdTeorica > 0 ? OEE.pct(r.performance) : '-';
      document.getElementById('oee-q').textContent = r.producaoTotal > 0 ? OEE.pct(r.qualidade) : '-';

      const hasData = formData.hora_inicio && formData.hora_fim && r.qtdTeorica > 0 && r.producaoTotal > 0;
      document.getElementById('oee-total').textContent = hasData ? OEE.pct(r.oee) : '-';
    }

    // Event listeners
    selUnidade.addEventListener('change', updateLinhas);
    selLinha.addEventListener('change', updateVelocidade);
    selProduto.addEventListener('change', updateVelocidade);

    form.querySelectorAll('.oee-input').forEach(input => {
      input.addEventListener('input', updateOEE);
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

      let error;
      if (isEdit) ({ error } = await db.from('ordens_producao').update(payload).eq('id', params.id));
      else ({ error } = await db.from('ordens_producao').insert(payload));

      if (error) { UI.toast('Erro: ' + error.message, 'error'); return; }
      UI.toast(isEdit ? 'Ordem atualizada' : 'Ordem registrada');
      Router.navigate('/ordens');
    });

  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>Erro: ${err.message}</p></div>`;
  }
}
