// MADG MES — Calculos OEE e utilitarios

const OEE = {
  /**
   * Converte string "HH:MM" para minutos
   */
  timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  },

  /**
   * Converte minutos para string "Xh XXmin"
   */
  minutesToDisplay(min) {
    if (!min || min <= 0) return '0min';
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    if (h === 0) return `${m}min`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}min`;
  },

  /**
   * Calcula OEE completo a partir de uma ordem
   * @param {Object} ordem - dados da ordem de producao
   * @returns {Object} { tempoProgramado, tempoProdutivo, disponibilidade, performance, qualidade, oee, qtdTeorica }
   */
  calcular(ordem) {
    const horaInicioMin = this.timeToMinutes(ordem.hora_inicio);
    const horaFimMin = this.timeToMinutes(ordem.hora_fim);

    // Tempo total (cobre virada de meia-noite)
    let totalMin = horaFimMin - horaInicioMin;
    if (totalMin < 0) totalMin += 1440;

    // Tempos em minutos (ja vem como integer)
    const planejado = Number(ordem.tempo_planejado) || 0;
    const setup = Number(ordem.tempo_setup) || 0;
    const parada = Number(ordem.tempo_parada) || 0;

    // Disponibilidade
    const tempoProgramado = totalMin - planejado;
    const tempoProdutivo = Math.max(0, tempoProgramado - setup - parada);
    const disponibilidade = tempoProgramado > 0 ? tempoProdutivo / tempoProgramado : 0;

    // Performance
    const velocidade = Number(ordem.velocidade_padrao) || 0;
    const horasProdutivas = tempoProdutivo / 60;
    const qtdTeorica = velocidade * horasProdutivas;
    const qtdProduzida = Number(ordem.qtd_produzida) || 0;
    const performance = qtdTeorica > 0 ? qtdProduzida / qtdTeorica : 0;

    // Qualidade
    const qtdRejeitada = Number(ordem.qtd_rejeitada) || 0;
    const producaoTotal = qtdProduzida + qtdRejeitada;
    const qualidade = producaoTotal > 0 ? qtdProduzida / producaoTotal : 1;

    // OEE
    const oee = disponibilidade * performance * qualidade;

    return {
      totalMin,
      tempoProgramado,
      tempoProdutivo,
      disponibilidade,
      performance,
      qualidade,
      oee,
      qtdTeorica,
      qtdProduzida,
      qtdRejeitada,
      producaoTotal
    };
  },

  /**
   * Consolida OEE de multiplas ordens (media ponderada por tempo produtivo)
   */
  consolidar(ordens) {
    let totalPeso = 0;
    let sumD = 0, sumP = 0, sumQ = 0;
    let totalProduzido = 0, totalRejeitado = 0, totalParado = 0;

    for (const ordem of ordens) {
      const r = this.calcular(ordem);
      const peso = r.tempoProdutivo;
      totalPeso += peso;
      sumD += r.disponibilidade * peso;
      sumP += r.performance * peso;
      sumQ += r.qualidade * peso;
      totalProduzido += r.qtdProduzida;
      totalRejeitado += r.qtdRejeitada;
      totalParado += (Number(ordem.tempo_setup) || 0) + (Number(ordem.tempo_parada) || 0);
    }

    const d = totalPeso > 0 ? sumD / totalPeso : 0;
    const p = totalPeso > 0 ? sumP / totalPeso : 0;
    const q = totalPeso > 0 ? sumQ / totalPeso : 0;

    return {
      disponibilidade: d,
      performance: p,
      qualidade: q,
      oee: d * p * q,
      totalProduzido,
      totalRejeitado,
      totalParado,
      totalProdutivo: totalPeso,
      qtdOrdens: ordens.length
    };
  },

  /**
   * Retorna cor CSS baseada no valor OEE
   */
  cor(valor) {
    const pct = valor * 100;
    if (pct >= 75) return 'var(--verde)';
    if (pct >= 50) return 'var(--amarelo)';
    return 'var(--vermelho)';
  },

  /**
   * Retorna classe de badge baseada no valor OEE
   */
  badgeClass(valor) {
    const pct = valor * 100;
    if (pct >= 75) return 'badge-green';
    if (pct >= 50) return 'badge-yellow';
    return 'badge-red';
  },

  /**
   * Formata percentual
   */
  pct(valor) {
    return (valor * 100).toFixed(1) + '%';
  },

  /**
   * Formata numero com separador de milhar
   */
  num(valor, decimais = 0) {
    return Number(valor || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: decimais,
      maximumFractionDigits: decimais
    });
  }
};
