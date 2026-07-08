/* =============================================================
   TesouroSimula — main.js
   Motor de simulação, integração BCB, gráficos e recomendações
   ============================================================= */
(() => {
  'use strict';

  /* ------------------------------------------------------------
     CONFIGURAÇÕES E CONSTANTES
     ------------------------------------------------------------ */
  const CONFIG = {
    custodiaB3AnualPct: 0.20,      // % a.a. sobre valor que exceder o limite
    custodiaB3Limite: 10000,       // R$ isento de custódia
    defaultSelic: 10.75,
    defaultIpca: 4.50,
    bcbSelicUrl: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json',
    bcbIpcaUrl: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.13522/dados/ultimos/1?formato=json',
  };

  const IR_BRACKETS = [
    { maxDays: 180, rate: 0.225, label: 'até 180 dias — 22,5%' },
    { maxDays: 360, rate: 0.20,  label: '181 a 360 dias — 20%' },
    { maxDays: 720, rate: 0.175, label: '361 a 720 dias — 17,5%' },
    { maxDays: Infinity, rate: 0.15, label: 'acima de 720 dias — 15%' },
  ];

  const TITLE_META = {
    selic:      { label: 'Tesouro Selic',                   color: '#12a06a', tributado: true,  liquidezDiaria: true },
    ipca:       { label: 'Tesouro IPCA+',                   color: '#0a7d51', tributado: true,  liquidezDiaria: true },
    ipca_juros: { label: 'Tesouro IPCA+ c/ Juros Semestrais',color: '#2ec98a', tributado: true,  liquidezDiaria: true },
    pre:        { label: 'Tesouro Prefixado',                color: '#d4a531', tributado: true,  liquidezDiaria: true },
    pre_juros:  { label: 'Prefixado c/ Juros Semestrais',    color: '#f0c866', tributado: true,  liquidezDiaria: true },
  };

  /* ------------------------------------------------------------
     UTILITÁRIOS
     ------------------------------------------------------------ */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  const formatBRL = (value) => (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const formatPct = (value, digits = 2) => `${(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;

  const annualToMonthlyRate = (annualPct) => Math.pow(1 + (annualPct / 100), 1 / 12) - 1;

  function getIRRateByDays(days) {
    for (const bracket of IR_BRACKETS) {
      if (days <= bracket.maxDays) return bracket.rate;
    }
    return IR_BRACKETS[IR_BRACKETS.length - 1].rate;
  }
  function getIRLabelByDays(days) {
    for (const bracket of IR_BRACKETS) {
      if (days <= bracket.maxDays) return bracket.label;
    }
    return IR_BRACKETS[IR_BRACKETS.length - 1].label;
  }

  /* ------------------------------------------------------------
     INTEGRAÇÃO COM API DO BANCO CENTRAL (SGS)
     ------------------------------------------------------------ */
  async function fetchBcbSeries(url) {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error('Falha na API do BCB');
    const json = await res.json();
    if (!Array.isArray(json) || !json.length) throw new Error('Série vazia');
    const last = json[json.length - 1];
    return { value: parseFloat(last.valor.replace(',', '.')), date: last.data };
  }

  async function loadOfficialRates() {
    const selicStatusEl = $('#heroSelicStatus');
    const ipcaStatusEl = $('#heroIpcaStatus');
    let selicOk = false, ipcaOk = false;

    try {
      const selic = await fetchBcbSeries(CONFIG.bcbSelicUrl);
      $('#heroSelicValue').textContent = formatPct(selic.value);
      selicStatusEl.textContent = `atualizado (${selic.date})`;
      selicStatusEl.classList.add('is-live');
      const selicInput = $('#taxaSelic');
      if (selicInput && !selicInput.dataset.touched) selicInput.value = selic.value.toFixed(2);
      selicOk = true;
    } catch (err) {
      $('#heroSelicValue').textContent = formatPct(CONFIG.defaultSelic);
      selicStatusEl.textContent = 'valor de referência (offline)';
    }

    try {
      const ipca = await fetchBcbSeries(CONFIG.bcbIpcaUrl);
      $('#heroIpcaValue').textContent = formatPct(ipca.value);
      ipcaStatusEl.textContent = `atualizado (${ipca.date})`;
      ipcaStatusEl.classList.add('is-live');
      const ipcaInput = $('#taxaIpca');
      if (ipcaInput && !ipcaInput.dataset.touched) ipcaInput.value = ipca.value.toFixed(2);
      ipcaOk = true;
    } catch (err) {
      $('#heroIpcaValue').textContent = formatPct(CONFIG.defaultIpca);
      ipcaStatusEl.textContent = 'valor de referência (offline)';
    }

    if (selicOk || ipcaOk) {
      $('#rateUpdatedAt').textContent = `Consultado em ${new Date().toLocaleString('pt-BR')}.`;
    } else {
      $('#rateUpdatedAt').textContent = 'Não foi possível consultar o BCB agora — exibindo valores de referência.';
    }
    // Recalcula com as taxas oficiais assim que chegarem
    runFullSimulation();
  }

  /* ------------------------------------------------------------
     MOTOR DE SIMULAÇÃO
     ------------------------------------------------------------ */
  // Calcula a taxa bruta anual efetiva de acordo com o tipo de título
  function getAnnualGrossRate(tipo, inputs) {
    switch (tipo) {
      case 'selic':
        return inputs.taxaSelic + inputs.spreadSelic;
      case 'ipca':
      case 'ipca_juros':
        return ((1 + inputs.taxaIpca / 100) * (1 + inputs.jurosReal / 100) - 1) * 100;
      case 'pre':
      case 'pre_juros':
        return inputs.taxaPre;
      default:
        return 0;
    }
  }

  /**
   * Simula mês a mês um investimento com aportes mensais, taxa de corretora,
   * custódia B3 e retorna série temporal + resumo final com IR aplicado.
   */
  function simulateInvestment({ valorInicial, aporteMensal, totalMeses, annualGrossRatePct, annualBrokerFeePct = 0, isento = false }) {
    const annualNetOfBrokerPct = annualGrossRatePct - annualBrokerFeePct;
    const monthlyRate = annualToMonthlyRate(annualNetOfBrokerPct);

    let balance = valorInicial;
    let invested = valorInicial;
    let custodyPaidAccum = 0;

    const series = [{
      month: 0, invested, balanceGross: balance, custodyPaidAccum, balanceAfterCustody: balance,
    }];

    for (let m = 1; m <= totalMeses; m++) {
      // rendimento do mês
      balance *= (1 + monthlyRate);

      // custódia B3: 0,20% a.a. sobre o que exceder o limite, cobrada proporcionalmente ao mês
      if (!isento) {
        const base = Math.max(0, balance - CONFIG.custodiaB3Limite);
        const custodyMonthly = base * (CONFIG.custodiaB3AnualPct / 100) / 12;
        balance -= custodyMonthly;
        custodyPaidAccum += custodyMonthly;
      }

      // aporte mensal (feito ao final do mês, começa a render no mês seguinte)
      balance += aporteMensal;
      invested += aporteMensal;

      series.push({ month: m, invested, balanceGross: balance + custodyPaidAccum, custodyPaidAccum, balanceAfterCustody: balance });
    }

    const finalInvested = invested;
    const finalBalanceAfterCustody = balance;
    const totalDays = totalMeses * 30;
    const grossGain = finalBalanceAfterCustody - finalInvested;

    let irRate = 0, irValue = 0, liquid = finalBalanceAfterCustody;
    if (!isento && grossGain > 0) {
      irRate = getIRRateByDays(totalDays);
      irValue = grossGain * irRate;
      liquid = finalBalanceAfterCustody - irValue;
    }

    return {
      series,
      finalInvested,
      finalBalanceAfterCustody,
      custodyPaidAccum,
      irRate,
      irValue,
      liquid,
      totalFees: custodyPaidAccum + irValue,
      totalDays,
    };
  }

  // Constrói série líquida ano a ano (para tabela e gráfico), aplicando IR
  // proporcional ao tempo decorrido em cada ponto.
  function buildYearlySeries(sim, totalMeses) {
    const rows = [];
    const monthsPerYear = 12;
    const lastMonthIndex = sim.series.length - 1;
    const years = Math.ceil(totalMeses / monthsPerYear);
    for (let y = 1; y <= years; y++) {
      const monthIdx = Math.min(y * monthsPerYear, lastMonthIndex);
      const point = sim.series[monthIdx];
      const days = monthIdx * 30;
      const gain = point.balanceAfterCustody - point.invested;
      const irRate = gain > 0 ? getIRRateByDays(days) : 0;
      const irValue = gain > 0 ? gain * irRate : 0;
      const liquid = point.balanceAfterCustody - irValue;
      rows.push({
        year: y,
        month: monthIdx,
        invested: point.invested,
        gross: point.balanceGross,
        fees: point.custodyPaidAccum + irValue,
        liquid,
      });
    }
    return rows;
  }

  /* ------------------------------------------------------------
     UI: SELEÇÃO DE TÍTULO
     ------------------------------------------------------------ */
  function setupTitleCards() {
    const cards = $$('.title-card');
    function refresh() {
      cards.forEach(c => c.classList.toggle('active', c.querySelector('input').checked));
      const selected = $('input[name="tipoTitulo"]:checked').value;
      $('#rateFieldsSelic').classList.toggle('hidden', !(selected === 'selic'));
      $('#rateFieldsIpca').classList.toggle('hidden', !(selected === 'ipca' || selected === 'ipca_juros'));
      $('#rateFieldsPre').classList.toggle('hidden', !(selected === 'pre' || selected === 'pre_juros'));
    }
    cards.forEach(c => c.addEventListener('click', () => setTimeout(refresh, 0)));
    refresh();
  }

  /* ------------------------------------------------------------
     LEITURA DOS INPUTS
     ------------------------------------------------------------ */
  function readInputs() {
    const tipoTitulo = $('input[name="tipoTitulo"]:checked').value;
    return {
      tipoTitulo,
      valorInicial: Math.max(0, parseFloat($('#valorInicial').value) || 0),
      aporteMensal: Math.max(0, parseFloat($('#aporteMensal').value) || 0),
      prazoAnos: Math.max(0, parseInt($('#prazoAnos').value) || 0),
      prazoMeses: Math.max(0, parseInt($('#prazoMeses').value) || 0),
      taxaSelic: parseFloat($('#taxaSelic').value) || 0,
      spreadSelic: parseFloat($('#spreadSelic').value) || 0,
      taxaIpca: parseFloat($('#taxaIpca').value) || 0,
      jurosReal: parseFloat($('#jurosReal').value) || 0,
      taxaPre: parseFloat($('#taxaPre').value) || 0,
      taxaCorretora: parseFloat($('#taxaCorretora').value) || 0,
      objetivo: $('#objetivo').value,
      perfil: $('#perfil').value,
    };
  }

  /* ------------------------------------------------------------
     GRÁFICOS
     ------------------------------------------------------------ */
  let evolutionChart = null;
  let compareChart = null;

  function renderEvolutionChart(sim, totalMeses) {
    const ctx = $('#evolutionChart').getContext('2d');
    const step = totalMeses > 60 ? 3 : 1;
    const labels = [];
    const investedData = [];
    const liquidData = [];
    const grossData = [];

    for (let m = 0; m <= totalMeses; m += step) {
      const point = sim.series[m];
      const days = m * 30;
      const gain = point.balanceAfterCustody - point.invested;
      const irRate = gain > 0 ? getIRRateByDays(days) : 0;
      const liquidEstimate = point.balanceAfterCustody - (gain > 0 ? gain * irRate : 0);
      labels.push(m === 0 ? 'Início' : (m % 12 === 0 ? `${m / 12}a` : `${m}m`));
      investedData.push(point.invested.toFixed(2));
      grossData.push(point.balanceGross.toFixed(2));
      liquidData.push(liquidEstimate.toFixed(2));
    }

    if (evolutionChart) evolutionChart.destroy();
    evolutionChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Total investido',
            data: investedData,
            borderColor: '#9db1a9',
            backgroundColor: 'rgba(157,177,169,0.08)',
            borderDash: [6, 4],
            fill: false,
            tension: 0.25,
            pointRadius: 0,
          },
          {
            label: 'Valor bruto acumulado',
            data: grossData,
            borderColor: '#d4a531',
            backgroundColor: 'rgba(212,165,49,0.08)',
            fill: false,
            tension: 0.25,
            pointRadius: 0,
          },
          {
            label: 'Valor líquido estimado',
            data: liquidData,
            borderColor: '#0a7d51',
            backgroundColor: 'rgba(10,125,81,0.15)',
            fill: true,
            tension: 0.25,
            pointRadius: 0,
            borderWidth: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, font: { family: 'Inter' } } },
          tooltip: {
            callbacks: {
              label: (item) => `${item.dataset.label}: ${formatBRL(parseFloat(item.raw))}`,
            },
          },
        },
        scales: {
          y: {
            ticks: { callback: (v) => 'R$ ' + Number(v).toLocaleString('pt-BR', { notation: 'compact' }) },
            grid: { color: '#eef6f1' },
          },
          x: { grid: { display: false } },
        },
      },
    });
  }

  function renderCompareChart(results) {
    const ctx = $('#compareChart').getContext('2d');
    const labels = results[0].sim.series
      .filter((_, i) => i % (results[0].totalMeses > 60 ? 3 : 1) === 0)
      .map(p => p.month === 0 ? 'Início' : (p.month % 12 === 0 ? `${p.month / 12}a` : `${p.month}m`));

    const datasets = results.map(r => {
      const step = r.totalMeses > 60 ? 3 : 1;
      const data = [];
      for (let m = 0; m <= r.totalMeses; m += step) {
        const point = r.sim.series[m];
        const days = m * 30;
        const gain = point.balanceAfterCustody - point.invested;
        const irRate = (!r.isento && gain > 0) ? getIRRateByDays(days) : 0;
        data.push((point.balanceAfterCustody - gain * irRate).toFixed(2));
      }
      return {
        label: r.label,
        data,
        borderColor: r.color,
        backgroundColor: r.color + '22',
        fill: false,
        tension: 0.25,
        pointRadius: 0,
        borderWidth: r.highlight ? 3 : 2,
      };
    });

    if (compareChart) compareChart.destroy();
    compareChart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } },
          tooltip: { callbacks: { label: (item) => `${item.dataset.label}: ${formatBRL(parseFloat(item.raw))}` } },
        },
        scales: {
          y: { ticks: { callback: (v) => 'R$ ' + Number(v).toLocaleString('pt-BR', { notation: 'compact' }) }, grid: { color: '#eef6f1' } },
          x: { grid: { display: false } },
        },
      },
    });

    // legenda customizada
    const legendEl = $('#compareLegend');
    legendEl.innerHTML = results.map(r => {
      const last = r.sim.liquid;
      return `<div class="compare-item">
        <span class="ci-head"><span class="ci-dot" style="background:${r.color}"></span>${r.label}</span>
        <span class="ci-value">${formatBRL(last)}</span>
        <span class="ci-desc">${r.desc}</span>
      </div>`;
    }).join('');
  }

  /* ------------------------------------------------------------
     TABELA ANO A ANO
     ------------------------------------------------------------ */
  function renderYearTable(sim, totalMeses) {
    const rows = buildYearlySeries(sim, totalMeses);
    const tbody = $('#yearTable tbody');
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td>${r.year}${r.month < r.year * 12 ? ' (parcial)' : ''}</td>
        <td>${formatBRL(r.invested)}</td>
        <td>${formatBRL(r.gross)}</td>
        <td>${formatBRL(r.fees)}</td>
        <td><strong>${formatBRL(r.liquid)}</strong></td>
      </tr>
    `).join('');
  }

  /* ------------------------------------------------------------
     RECOMENDAÇÕES PERSONALIZADAS
     ------------------------------------------------------------ */
  function buildRecommendation(inputs, totalMeses) {
    const prazoAnos = totalMeses / 12;
    const titleLabel = TITLE_META[inputs.tipoTitulo].label;
    let recTitle, recBody;

    if (inputs.objetivo === 'reserva' || prazoAnos <= 1) {
      recTitle = 'Tesouro Selic';
      recBody = `Para reserva de emergência ou prazos curtos (até 1 ano), o <strong>Tesouro Selic</strong> é geralmente a melhor escolha: baixíssima volatilidade, liquidez diária e rentabilidade acompanhando os juros básicos da economia.`;
    } else if (inputs.objetivo === 'viagem' && prazoAnos <= 3) {
      recTitle = 'Tesouro Selic';
      recBody = `Para objetivos de curto/médio prazo como viagens, o <strong>Tesouro Selic</strong> evita o risco de marcação a mercado caso você precise resgatar antes da data planejada.`;
    } else if ((inputs.objetivo === 'aposentadoria' || inputs.objetivo === 'educacao') && prazoAnos >= 5) {
      recTitle = 'Tesouro IPCA+';
      recBody = `Para ${inputs.objetivo === 'aposentadoria' ? 'aposentadoria' : 'educação'} e horizontes longos (5+ anos), o <strong>Tesouro IPCA+</strong> protege seu poder de compra da inflação e garante juros reais — ideal para acumular patrimônio no longo prazo. Considere a variante com <strong>juros semestrais</strong> se quiser renda periódica ao longo do caminho.`;
    } else if (inputs.objetivo === 'bem' && prazoAnos >= 2 && prazoAnos < 5) {
      recTitle = 'Tesouro IPCA+ ou Prefixado';
      recBody = `Para comprar um bem em 2 a 5 anos, avalie o <strong>Tesouro IPCA+</strong> (protege da inflação) ou o <strong>Tesouro Prefixado</strong> se a taxa fixa oferecida no momento estiver atrativa e você tiver certeza de que não precisará resgatar antes do vencimento.`;
    } else if (inputs.perfil === 'arrojado' && (inputs.tipoTitulo === 'pre' || inputs.tipoTitulo === 'pre_juros')) {
      recTitle = 'Tesouro Prefixado';
      recBody = `Como investidor de perfil arrojado buscando travar uma taxa fixa, o <strong>Tesouro Prefixado</strong> pode ser interessante quando as taxas de juros futuras estão em patamar elevado — mas fique atento à volatilidade de preço caso precise vender antes do vencimento.`;
    } else {
      recTitle = titleLabel;
      recBody = `Com base no prazo de ${prazoAnos.toFixed(1).replace('.', ',')} ano(s) informado, o título selecionado (<strong>${titleLabel}</strong>) é uma opção coerente com seu objetivo. Avalie sempre a taxa oferecida no momento da compra em tesourodireto.com.br antes de decidir.`;
    }

    let perfilNote = '';
    if (inputs.perfil === 'conservador') {
      perfilNote = ' Como seu perfil é conservador, priorize títulos pós-fixados (Selic) ou indexados à inflação (IPCA+), evitando concentrar-se em prefixados de longo prazo.';
    } else if (inputs.perfil === 'arrojado') {
      perfilNote = ' Mesmo com perfil arrojado, lembre-se de que títulos públicos são renda fixa: a "ousadia" aqui está mais em travar taxas prefixadas altas do que em buscar grandes oscilações.';
    }

    return { title: recTitle, html: recBody + perfilNote };
  }

  /* ------------------------------------------------------------
     ORQUESTRAÇÃO PRINCIPAL
     ------------------------------------------------------------ */
  function runFullSimulation() {
    const inputs = readInputs();
    const totalMeses = inputs.prazoAnos * 12 + inputs.prazoMeses;
    if (totalMeses <= 0) return;

    const annualGrossRate = getAnnualGrossRate(inputs.tipoTitulo, inputs);

    const mainSim = simulateInvestment({
      valorInicial: inputs.valorInicial,
      aporteMensal: inputs.aporteMensal,
      totalMeses,
      annualGrossRatePct: annualGrossRate,
      annualBrokerFeePct: inputs.taxaCorretora,
      isento: false,
    });

    // ---- KPIs ----
    $('#kpiInvestido').textContent = formatBRL(mainSim.finalInvested);
    $('#kpiBruto').textContent = formatBRL(mainSim.finalBalanceAfterCustody + mainSim.custodyPaidAccum);
    $('#kpiImpostos').textContent = formatBRL(mainSim.totalFees);
    $('#kpiLiquido').textContent = formatBRL(mainSim.liquid);
    const rentTotalPct = mainSim.finalInvested > 0 ? ((mainSim.liquid / mainSim.finalInvested) - 1) * 100 : 0;
    const anos = totalMeses / 12;
    const rentAnoPct = anos > 0 ? (Math.pow(mainSim.liquid / mainSim.finalInvested, 1 / anos) - 1) * 100 : 0;
    $('#kpiRentTotal').textContent = formatPct(rentTotalPct);
    $('#kpiRentAno').textContent = formatPct(rentAnoPct);

    // ---- Gráfico evolução ----
    renderEvolutionChart(mainSim, totalMeses);

    // ---- Tabela ano a ano ----
    renderYearTable(mainSim, totalMeses);

    // ---- Comparativo ----
    const selicRateForCompare = inputs.tipoTitulo === 'selic' ? (inputs.taxaSelic + inputs.spreadSelic) : inputs.taxaSelic;
    const poupancaAnnual = selicRateForCompare > 8.5
      ? (Math.pow(1.005, 12) - 1) * 100
      : (0.70 * selicRateForCompare);
    const cdiProxy = selicRateForCompare;
    const cdbAnnual = cdiProxy * 1.0; // 100% do CDI
    const lciAnnual = cdiProxy * 0.90; // 90% do CDI, isento de IR

    const simSelected = mainSim;
    const simPoupanca = simulateInvestment({
      valorInicial: inputs.valorInicial, aporteMensal: inputs.aporteMensal, totalMeses,
      annualGrossRatePct: poupancaAnnual, annualBrokerFeePct: 0, isento: true,
    });
    const simCdb = simulateInvestment({
      valorInicial: inputs.valorInicial, aporteMensal: inputs.aporteMensal, totalMeses,
      annualGrossRatePct: cdbAnnual, annualBrokerFeePct: 0, isento: false,
    });
    const simLci = simulateInvestment({
      valorInicial: inputs.valorInicial, aporteMensal: inputs.aporteMensal, totalMeses,
      annualGrossRatePct: lciAnnual, annualBrokerFeePct: 0, isento: true,
    });

    const compareResults = [
      { label: TITLE_META[inputs.tipoTitulo].label, sim: simSelected, color: '#0a7d51', totalMeses, isento: false, highlight: true, desc: `Rentabilidade líquida final estimada · IR ${formatPct(simSelected.irRate * 100, 1)}` },
      { label: 'Poupança', sim: simPoupanca, color: '#9db1a9', totalMeses, isento: true, desc: 'Isenta de IR · rende menos em juros altos' },
      { label: 'CDB 100% CDI', sim: simCdb, color: '#3178c6', totalMeses, isento: false, desc: `Sujeito à mesma tabela regressiva de IR · risco de crédito do banco` },
      { label: 'LCI/LCA 90% CDI', sim: simLci, color: '#d4a531', totalMeses, isento: true, desc: 'Isenta de IR para pessoa física · pode ter carência' },
    ];
    renderCompareChart(compareResults);

    // ---- Recomendações ----
    const reco = buildRecommendation(inputs, totalMeses);
    $('#recoText').innerHTML = reco.html;
    $('#recoMain h3').textContent = `Melhor opção sugerida: ${reco.title}`;
  }

  /* ------------------------------------------------------------
     ACCORDION (FAQ)
     ------------------------------------------------------------ */
  function setupAccordion() {
    $$('.accordion-item').forEach(item => {
      const trigger = $('.accordion-trigger', item);
      const panel = $('.accordion-panel', item);
      trigger.addEventListener('click', () => {
        const isOpen = item.classList.contains('open');
        $$('.accordion-item').forEach(i => {
          i.classList.remove('open');
          $('.accordion-panel', i).style.maxHeight = null;
        });
        if (!isOpen) {
          item.classList.add('open');
          panel.style.maxHeight = panel.scrollHeight + 'px';
        }
      });
    });
  }

  /* ------------------------------------------------------------
     NAV MOBILE
     ------------------------------------------------------------ */
  function setupNav() {
    const toggle = $('#navToggle');
    const links = $('#navLinks');
    toggle.addEventListener('click', () => links.classList.toggle('open'));
    $$('#navLinks a').forEach(a => a.addEventListener('click', () => links.classList.remove('open')));
  }

  /* ------------------------------------------------------------
     INIT
     ------------------------------------------------------------ */
  function init() {
    setupTitleCards();
    setupAccordion();
    setupNav();

    // marca inputs como "tocados" para não sobrescrever depois de edição manual
    ['taxaSelic', 'taxaIpca'].forEach(id => {
      $('#' + id).addEventListener('input', (e) => { e.target.dataset.touched = '1'; });
    });

    $('#simForm').addEventListener('submit', (e) => {
      e.preventDefault();
      runFullSimulation();
      document.getElementById('resultados-section').scrollIntoView({ behavior: 'smooth' });
    });

    // primeira simulação com valores padrão
    runFullSimulation();

    // busca taxas oficiais (assíncrono) e recalcula quando chegar
    loadOfficialRates();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
