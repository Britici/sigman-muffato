/* ══════════════════════════════════════════════════════════════════
   SIGMAN — DASHBOARD — OEE + TPM
   Muffato Foods
   ══════════════════════════════════════════════════════════════════ */

// Cache de Solicitações de Compra (aba OrdensCompra) — sheet pesada,
// não vem no readAll() (ver SKIP_READ_ALL no Code.gs). Carregada sob
// demanda aqui, igual o módulo de Compras faz. null = ainda não carregou.
let _comprasCache = null;

async function _refreshComprasCache() {
  const d = await apiGet({ action: 'readCompras' });
  _comprasCache = (d && d.data) || [];
  renderDash();
}

function renderDash() {
  updStats();
  const t = today();

  if (_comprasCache === null) { _refreshComprasCache(); }

  // Filtro de período
  const sel = document.getElementById('dash-periodo');
  const per = sel ? sel.value : 'mes';
  const customDatesDiv = document.getElementById('dash-custom-dates');
  
  // Mostrar/ocultar campos de data customizados
  if (per === 'custom') {
    customDatesDiv.style.display = 'flex';
  } else {
    customDatesDiv.style.display = 'none';
  }
  
  let startDate;
  if (per === 'dia') {
    startDate = t;
  } else if (per === 'semana') {
    const d = new Date(); d.setDate(d.getDate()-7);
    startDate = d.toISOString().slice(0,10);
  } else if (per === 'ano') {
    startDate = t.slice(0,4) + '-01-01';
  } else if (per === 'custom') {
    startDate = document.getElementById('dash-dt-ini')?.value || t;
  } else {
    startDate = t.slice(0,7) + '-01';
  }

  // Dados filtrados pelo período
  let endDate = t;
  if (per === 'custom') {
    endDate = document.getElementById('dash-dt-fim')?.value || t;
  }
  const ordPer  = db.ordens.filter(o => o.data && o.data >= startDate && o.data <= endDate);
  const ordCorr = ordPer.filter(o => o.tipo === 'Corretiva');
  const cor     = ordCorr.length;
  const prev    = ordPer.filter(o => o.tipo === 'Preventiva').length;
  const melh    = ordPer.filter(o => o.tipo === 'Melhoria').length;
  const inspe   = ordPer.filter(o => o.tipo === 'Inspeção').length;
  const predi   = ordPer.filter(o => o.tipo === 'Preditiva').length;
  const total   = ordPer.length;
  const hj      = db.ordens.filter(o => o.data === t).length;
  const plOpen  = db.planejadas.filter(p => p.status !== 'Concluída').length;
  const plAtras = db.planejadas.filter(p => p.status === 'Atrasada').length;
  const solPend = (_comprasCache||[]).filter(o => o.Status !== 'concluida').length;
  // Solicitações de compra "atrasadas" = abertas há mais de 3 dias sem conclusão
  const solAtras = (_comprasCache||[]).filter(o => {
    if (o.Status === 'concluida' || !o.Data_Solicitacao) return false;
    const dias = (new Date(t) - new Date(String(o.Data_Solicitacao).slice(0,10))) / 86400000;
    return dias > 3;
  }).length;

  // RACR — corretivas que ultrapassaram o limite de parada por criticidade
  // e ainda não têm RACR aberta (ver função precisaRAC em os-planejadas.js)
  const racDevemAbrir = ordCorr.filter(o => {
    if (o.tipo !== 'Corretiva') return false;
    const parada = o.paradaMin || o.durMin || 0;
    if (parada <= 0) return false;
    const crit = getCriticidadeMaq(o.maq);
    return parada > limiteRAC(crit);
  });
  const racNaoAbertas = racDevemAbrir.filter(o => !(db.racs||[]).find(r => r.osNumero === o.numero));

  // Próximas Preventivas — count de planejadas abertas com prazo
  const proxCount = db.planejadas.filter(p => p.status !== 'Concluída' && p.prazo).length;
  const proxAtras = db.planejadas.filter(p => p.status === 'Atrasada').length;

  // Top Máquina — mais corretivas no período
  const _byMaq = {};
  ordCorr.forEach(o => {
    const k = o.maq + '||' + o.sala;
    if (!_byMaq[k]) _byMaq[k] = { maq: o.maq, sala: o.sala, n: 0 };
    _byMaq[k].n++;
  });
  const _topMaq = Object.values(_byMaq).sort((a,b) => b.n - a.n)[0];
  const topMaqNome = _topMaq?.maq || '—';
  const topMaqN    = _topMaq?.n   || 0;
  const topMaqSala = _topMaq?.sala || '';
  // Disponibilidade
  const horasTurno1 = parseFloat(db.configuracoes.horas_turno_1) || 7.1;
  const horasTurno2 = parseFloat(db.configuracoes.horas_turno_2) || 7.1;
  const horasTurno3 = parseFloat(db.configuracoes.horas_turno_3) || 0;
  
  // Dias corridos do período (não só dias com OS)
  const dtStart = new Date(startDate);
  const dtHoje  = new Date(t);
  const diasPer = Math.max(1, Math.round((dtHoje - dtStart) / 86400000) + 1);
  // Disponibilidade por sala (crítico = 1)
  const dispPorSala = calcDisponibilidadePorSala(ordPer, horasTurno1, horasTurno2, horasTurno3, diasPer);
  
  let disponib = 0;
  if (dispPorSala.length > 0) {
    const soma = dispPorSala.reduce((sum, s) => sum + (s.disp || 0), 0);
    disponib = Math.round(soma / dispPorSala.length);
  } else {
    disponib = 0;
    console.warn('[AVISO] Nenhuma sala cadastrada para o período');
  }
  
  const metaDisp   = db.configuracoes.meta_disponibilidade || 91;
  const salaComAlerta = dispPorSala.filter(s => s.disp < metaDisp);
  const ordCorrComTempo = ordCorr.filter(o => o.durMin > 0);
  const mttr = ordCorrComTempo.length ? Math.round(ordCorrComTempo.reduce((s,o)=>s+o.durMin,0)/ordCorrComTempo.length) : 0;
  
  // MTTR — tempo médio de reparo
  const nCorr = ordCorr.length;
  const tempoParadaTotal = ordCorr 
    .reduce((s,o) => s + (o.paradaMin || 0), 0);
  const minDispTotal = diasPer * (horasTurno1 + horasTurno2 + horasTurno3) * 60;
  const tempoFuncionando = Math.max(0, minDispTotal - tempoParadaTotal);
  const mtbfH = nCorr > 0 ? Math.round(tempoFuncionando / nCorr) : 0;
    
  // % Preventiva
  const pctPrev = total ? Math.round(prev/total*100) : 0;
    const metaPrev = 60;

  // ICP — Índice de Cumprimento do Plano
  const plPer = db.planejadas.filter(p => p.prazo && p.prazo >= startDate && p.prazo <= endDate);
  const plConclNoPrazo = plPer.filter(p =>
    p.status === 'Concluída' && p.concluidoEm && p.concluidoEm.slice(0,10) <= p.prazo
  );
  const icp = plPer.length ? Math.round(plConclNoPrazo.length / plPer.length * 100) : 0;
  const metaICP = 85;

    // Banner de alertas
  const banner = document.getElementById('dash-banner');
  if (banner) {
    const amanhaDt = new Date(); amanhaDt.setDate(amanhaDt.getDate()+1);
    const amanha = amanhaDt.toISOString().slice(0,10);
    const venceHoje = db.planejadas.filter(p => p.prazo === t && p.status !== 'Concluída');
    const venceAmanha = db.planejadas.filter(p => p.prazo === amanha && p.status !== 'Concluída');
    if (venceHoje.length || venceAmanha.length) {
      banner.style.display = 'block';
      banner.innerHTML = `<div style="background:rgba(196,18,48,.12);border:1px solid rgba(196,18,48,.4);border-radius:var(--rs);padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;gap:10px">
        <span style="font-size:22px">⚠️</span>
        <div style="font-size:15px;line-height:1.5">
          ${venceHoje.length ? `<strong style="color:#ff2244">${venceHoje.length} OS vence hoje!</strong><br>` : ''}
          ${venceAmanha.length ? `<span style="color:var(--org)">${venceAmanha.length} OS vence amanhã.</span>` : ''}
        </div>
      </div>`;
    } else { banner.style.display = 'none'; }
  }

  // KPI Cards
  const corColor = disponib >= metaDisp ? 'var(--grn)' : disponib >= metaDisp-10 ? 'var(--org)' : 'var(--red)';
    document.getElementById('d-stats').innerHTML = `
    <div class=\"sc-card\" style=\"background:var(--surf);border:1px solid var(--bord);padding:14px;display:flex;flex-direction:column;gap:10px\">
      <div style=\"display:flex;align-items:center;gap:8px\">
        <div style=\"font-size:22px\">${salaComAlerta.length === 0 ? '🟢' : '🔴'}</div>
        <div>
          <div style=\"font-size:13px;color:var(--txt3);font-variant:small-caps;font-weight:700\">Disponibilidade</div>
          <div style=\"font-size:16px;font-weight:700;color:var(--txt)\">${dispPorSala.length - salaComAlerta.length}/${dispPorSala.length} operando</div>
        </div>
      </div>
      ${salaComAlerta.length > 0 ? `<div style=\"border-top:1px solid var(--bord);padding-top:8px;font-size:14px\">
        ${salaComAlerta.slice(0, 3).map(s => 
          `<div style=\"display:flex;align-items:center;gap:6px;margin-bottom:4px\">
            <span style=\"color:${s.disp < 85 && s.disp >= 75 ? 'var(--org)' : 'var(--red)'}; font-size:11px\">●</span>
            <span style=\"color:var(--txt)\">${s.sala}</span>
            <span style=\"margin-left:auto;font-weight:700;color:${s.disp < 85 ? 'var(--org)' : 'var(--red)'}\">${s.disp}%</span>
          </div>`
        ).join('')}
        ${salaComAlerta.length > 3 ? `<div style=\"color:var(--txt3);font-size:13px;margin-top:4px\">+${salaComAlerta.length - 3} mais</div>` : ''}
      </div>` : ''}
        <button class=\"btn btn-sm btn-gh\" onclick=\"goToPage('salas-status')\" style=\"margin-top:4px;width:100%\">Ver Detalhes →</button>
        <div style="position:absolute;bottom:0;left:0;right:0;height:3px;background:${corColor};opacity:.5\"></div>
      </div>
      <div class="sc-card c-go" onclick="irParaCard('executadas')" style="cursor:pointer">
        <div class="sc-lbl">OS Hoje</div>
        <div class="sc-val">${hj}</div>
        <div style="font-size:11px;color:var(--txt3);margin-top:4px">Período: ${total}</div>
      </div>    
    <div class="sc-card c-p">
      <div class="sc-lbl">MTBF (min)</div>
      <div class="sc-val">${mtbfH > 0 ? mtbfH : '—'}</div>
      <div style="font-size:11px;color:var(--txt3);margin-top:4px">Tempo médio entre falhas</div>
    </div>
    <div class="sc-card c-b">
      <div class="sc-lbl">MTTR (min)</div>
      <div class="sc-val">${mttr}</div>
      <div style="font-size:11px;color:var(--txt3);margin-top:4px">Tempo médio de reparo</div>
    </div>
    <div class="sc-card ${solAtras > 0 ? 'c-r' : 'c-o'}" onclick="irParaCard('compras-acompanhamento')" style="cursor:pointer">
      <div class="sc-lbl">Solicitações de Compra</div>
      <div class="sc-val">${solPend}</div>
      <div style="font-size:11px;color:var(--txt3);margin-top:4px">${solAtras} atrasadas</div>
    </div>
    <div class="sc-card ${racNaoAbertas.length > 0 ? 'c-r' : 'c-o'}" onclick="irParaCard('analise-causa-raiz')" style="cursor:pointer">
      <div class="sc-lbl">RAC</div>
      <div class="sc-val">${racDevemAbrir.length}</div>
      <div style="font-size:11px;color:var(--txt3);margin-top:4px">${racNaoAbertas.length} não abertas</div>
    </div>
    <div class="sc-card c-r">
      <div class="sc-lbl">Preventivas</div>
      <div class="sc-val">${prev}</div>
      <div style="font-size:11px;color:var(--txt3);margin-top:4px">${total ? Math.round(prev/total*100) : 0}% do total</div>
    </div>
    <div class="sc-card c-r">
      <div class="sc-lbl">Corretivas</div>
      <div class="sc-val">${cor}</div>
      <div style="font-size:11px;color:var(--txt3);margin-top:4px">${total ? Math.round(cor/total*100) : 0}% do total</div>
    </div>
    <div class="sc-card c-r">
      <div class="sc-lbl">Melhoria</div>
      <div class="sc-val">${melh}</div>
      <div style="font-size:11px;color:var(--txt3);margin-top:4px">${total ? Math.round(melh/total*100) : 0}% do total</div>
    </div>
    <div class="sc-card c-r">
      <div class="sc-lbl">Inspeção</div>
      <div class="sc-val">${inspe}</div>
      <div style="font-size:11px;color:var(--txt3);margin-top:4px">${total ? Math.round(inspe/total*100) : 0}% do total</div>
    </div>
    <div class="sc-card c-r">
      <div class="sc-lbl">Preditiva</div>
      <div class="sc-val">${predi}</div>
      <div style="font-size:11px;color:var(--txt3);margin-top:4px">${total ? Math.round(predi/total*100) : 0}% do total</div>
    </div>
    <div class="sc-card ${plAtras > 0 ? 'c-r' : 'c-o'}" onclick="irParaCard('planejadas')" style="cursor:pointer">
      <div class="sc-lbl">Backlog OS</div>
      <div class="sc-val">${plOpen}</div>
      <div style="font-size:11px;color:var(--txt3);margin-top:4px">${plAtras} atrasadas</div>
    </div>`;

  // Gauge + PCM Ring + Trend + Próximas + Top Máquinas
  renderGauge('d-gauge', disponib, metaDisp);
  renderSalasStatus(ordPer, horasTurno1, horasTurno2, horasTurno3, diasPer);
  renderPCMRing('d-pcm-ring', pctPrev, metaPrev);
  renderTrend('d-trend');
  renderProximas('d-proximas');
  renderTopMaquinas('d-top-maq', ordPer);

  // Últimas 5 OS
  const rec = [...db.ordens].reverse().slice(0,5);
  document.getElementById('d-rec').innerHTML = rec.length === 0
    ? '<div class="empty"><div class="ei">📋</div><p>Nenhuma O.S. ainda.</p></div>'
    : rec.map(o => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--bord);gap:8px">
        <div>
          <span class="osn">${o.numero}</span>
          <div style="font-size:15px;font-weight:500;margin-top:2px">${o.sala} · ${o.maq}</div>
          <div style="font-size:13px;color:var(--txt3)">${o.manut} · ${fd(o.data)}${o.ini?' · '+o.ini+'-'+o.fim:''}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          ${tipoBadge(o.tipo)}${prio(o.prioridade)}
          ${o.durMin ? `<span style="font-size:11px;color:var(--txt3)">${o.durMin}min</span>` : ''}
        </div>
      </div>`).join('');

  // Planejadas abertas
  const plA = [...db.planejadas].filter(p => p.status !== 'Concluída').slice(0,5);
  document.getElementById('d-plan').innerHTML = plA.length === 0
    ? '<div class="empty"><div class="ei">📅</div><p>Sem O.S. planejadas abertas.</p></div>'
    : plA.map(p => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--bord);gap:8px">
        <div>
          <span class="osn">${p.numero}</span>
          <div style="font-size:15px;font-weight:500;margin-top:2px">${p.sala} · ${p.maq}</div>
          <div style="font-size:13px;color:var(--txt3)">${(()=>{
            if (!p.prazo) return 'Sem prazo';
            const dias = Math.ceil((new Date(p.prazo) - new Date(today())) / 86400000);
            if (dias < 0)  return `<span style="color:#ff2244;font-weight:700">⚠ ${Math.abs(dias)}d atrasada</span>`;
            if (dias === 0) return `<span style="color:#ff2244;font-weight:700">⚠ Vence hoje</span>`;
            if (dias <= 3)  return `<span style="color:var(--org);font-weight:600">🕐 Vence em ${dias}d</span>`;
            return `Prazo: ${fd(p.prazo)} (${dias}d)`;
})()}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          ${prio(p.prioridade)}${stBadge(p.status)}
          ${CU&&CU.tipo!=='producao'?`<button class="btn btn-sm btn-g" onclick="abrirConcluir('${p.numero}','plan')">Concluir</button>`:''}
        </div>
      </div>`).join('');

  // Solicitações pendentes
  const spL = db.solicitacoes.filter(s => s.status === 'Não Executada').slice(0,5);
  document.getElementById('d-sol').innerHTML = spL.length === 0
    ? '<div class="empty"><div class="ei">📣</div><p>Sem solicitações pendentes.</p></div>'
    : spL.map(s => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--bord);gap:8px">
        <div>
          <span class="osn">${s.numero}</span>
          <div style="font-size:15px;font-weight:500;margin-top:2px">${s.sala} · ${s.maq}</div>
          <div style="font-size:13px;color:var(--txt3)">${s.solicitante} · ${fd(s.criadoEm.slice(0,10))}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          ${prio(s.prioridade)}
          ${CU && CU.tipo !== 'producao'
            ? `<button class="btn btn-sm btn-g" onclick="abrirConcluir('${s.numero}','sol')">✓ Executar</button>`            : stBadge(s.status)}
        </div>
      </div>`).join('');

  // Preview última inspeção
  const lastInsp = [...db.inspecoes].sort((a,b) => (b.data||'').localeCompare(a.data||''))[0];
  document.getElementById('d-insp').innerHTML = lastInsp
    ? `<div style="font-size:14px;font-family:var(--fm);color:var(--txt3);margin-bottom:8px">
         ${fd(lastInsp.data)} · ${lastInsp.turno} · ${lastInsp.manut}
         <button class="btn btn-sm btn-gh" style="margin-left:10px" onclick="verRelatorio()">Ver</button>
       </div>
       <div class="wa-prev" style="max-height:180px;overflow:auto;font-size:13px">${gerarTextoRel(lastInsp)}</div>`
    : '<div class="empty"><div class="ei">🔍</div><p>Nenhuma inspeção registrada ainda.</p></div>';
  
  // Top salas
  const bySala = {};
  ordPer.filter(o => o.tipo === 'Corretiva')
    .forEach(o => { bySala[o.sala] = (bySala[o.sala] || 0) + 1; });
  const topSalas = Object.entries(bySala).sort((a,b) => b[1]-a[1]).slice(0,5);
  const maxSala  = topSalas[0]?.[1] || 1;
  const dTS = document.getElementById('d-top-salas');
  if (dTS) dTS.innerHTML = topSalas.length === 0
    ? '<div class="empty"><div class="ei">🏭</div><p>Sem corretivas no período.</p></div>'
    : topSalas.map(([sala,n], i) => `
        <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--bord)">
          <span style="font-family:var(--fm);font-size:13px;color:var(--txt3);min-width:14px">${i+1}</span>
          <div style="flex:1">
            <div style="font-size:15px;font-weight:500">${sala}</div>
            <div style="height:5px;background:var(--surf3);border-radius:3px;margin-top:4px;overflow:hidden">
              <div style="height:100%;width:${Math.round(n/maxSala*100)}%;background:var(--red);border-radius:3px"></div>
            </div>
          </div>
          <span style="font-family:var(--fw);font-size:20px;font-weight:800;color:var(--red)">${n}</span>
        </div>`).join('');
  
  // Histórico
  const dH = document.getElementById('d-historico');
  if (dH) dH.innerHTML = db.historico.length === 0
    ? '<div class="empty"><div class="ei">📝</div><p>Nenhuma ação ainda.</p></div>'
    : db.historico.slice(0, 10).map(h => {
        const ts   = new Date(h.ts);
        const hora = ts.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
        const dia  = ts.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'});
        const cor  = h.acao.includes('Excluiu') ? 'var(--red)'
                   : h.acao.includes('Criou')   ? 'var(--grn)'
                   : 'var(--blu)';
        return `
          <div style="display:flex;gap:8px;padding:7px 0;border-bottom:1px solid var(--bord);align-items:flex-start">
            <div style="width:7px;height:7px;border-radius:50%;background:${cor};flex-shrink:0;margin-top:4px"></div>
            <div style="flex:1;min-width:0">
              <div style="font-size:14px;font-weight:600">
                ${h.acao}
                <span style="font-family:var(--fm);color:var(--red);font-size:13px">${h.numero}</span>
              </div>
              <div style="font-size:13px;color:var(--txt2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${h.detalhe}</div>
              <div style="font-size:11px;color:var(--txt3);margin-top:2px">${h.user} · ${dia} ${hora}</div>
            </div>
          </div>`;
      }).join('');
}
async function exportDashPDF() {
  const t = today();
  const sel = document.getElementById('dash-periodo');
  const per = sel ? sel.value : 'mes';
  let perLbl, startDate, endDate;
  if (per === 'dia') {
    perLbl = 'Hoje'; startDate = t; endDate = t;
  } else if (per === 'semana') {
    const d=new Date(); d.setDate(d.getDate()-7);
    perLbl = 'Últimos 7 dias'; startDate = d.toISOString().slice(0,10); endDate = t;
  } else if (per === 'ano') {
    perLbl = 'Este Ano'; startDate = t.slice(0,4)+'-01-01'; endDate = t;
  } else if (per === 'custom') {
    startDate = document.getElementById('dash-dt-ini')?.value || t.slice(0,7)+'-01';
    endDate = document.getElementById('dash-dt-fim')?.value || t;
    perLbl = `${startDate} a ${endDate}`;
  } else {
    perLbl = 'Este Mês'; startDate = t.slice(0,7)+'-01'; endDate = t;
  }

  const ordP = db.ordens.filter(o => o.data && o.data >= startDate && o.data <= endDate);
  const ordCorr = ordP.filter(o => o.tipo === 'Corretiva');
  const ordPrev = ordP.filter(o => o.tipo === 'Preventiva');
  const ordMelh = ordP.filter(o => o.tipo === 'Melhoria');
  const ordInsp = ordP.filter(o => o.tipo === 'Inspeção');
  const ordPred = ordP.filter(o => o.tipo === 'Preditiva');
  
  const horas_turno_1 = parseFloat(db.configuracoes.horas_turno_1) || 7.1;
  const horas_turno_2 = parseFloat(db.configuracoes.horas_turno_2) || 7.1;
  const horas_turno_3 = parseFloat(db.configuracoes.horas_turno_3) || 0;
  const horasTotaisPorDia = horas_turno_1 + horas_turno_2 + horas_turno_3;
  
  const dispPorSala = calcDisponibilidadePorSala(ordP, horas_turno_1, horas_turno_2, horas_turno_3, Math.max(1, Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1));
  const disponib = dispPorSala.length > 0 ? Math.round(dispPorSala.reduce((s, sala) => s + (sala.disp || 0), 0) / dispPorSala.length) : 100;
  const metaDisp = db.configuracoes.meta_disponibilidade || 91;

  const hj = db.ordens.filter(o => o.data === t).length;
  const plOpen = db.planejadas.filter(p => p.status !== 'Concluída').length;
  const plAtras = db.planejadas.filter(p => p.status === 'Atrasada').length;
  const _comprasPdf = (await apiGet({ action: 'readCompras' }))?.data || [];
  const solPend = _comprasPdf.filter(o => o.Status !== 'concluida').length;
  const solAtras = _comprasPdf.filter(o => {
    if (o.Status === 'concluida' || !o.Data_Solicitacao) return false;
    const dias = (new Date(t) - new Date(String(o.Data_Solicitacao).slice(0,10))) / 86400000;
    return dias > 3;
  }).length;
  const racDevemAbrir = ordCorr.filter(o => {
    if (o.tipo !== 'Corretiva') return false;
    const parada = o.paradaMin || o.durMin || 0;
    if (parada <= 0) return false;
    return parada > limiteRAC(getCriticidadeMaq(o.maq));
  });
  const racNaoAbertas = racDevemAbrir.filter(o => !(db.racs||[]).find(r => r.osNumero === o.numero));
  
  const ordTempoExec = ordP.filter(o => o.durMin > 0);
  const mttr = ordTempoExec.length ? Math.round(ordTempoExec.reduce((s, o) => s + o.durMin, 0) / ordTempoExec.length) : 0;
  
  const nCorr = ordCorr.length;
  const tempoParadaTotal = ordCorr.reduce((s, o) => s + (o.paradaMin || o.durMin || 0), 0);
  const tempoFuncionando = (Math.max(1, Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1) * horasTotaisPorDia * 60) - tempoParadaTotal;
  const mtbf = nCorr > 0 ? Math.round(tempoFuncionando / nCorr) : 0;
  
  const pctPrev = ordP.length ? Math.round(ordPrev.length / ordP.length * 100) : 0;
  const metaPrev = 60;
  
  const byMaq = {};
  ordCorr.forEach(o => {
    const k = o.maq + '||' + o.sala;
    if (!byMaq[k]) byMaq[k] = { maq: o.maq, sala: o.sala, n: 0 };
    byMaq[k].n++;
  });
  const topMaqs = Object.values(byMaq).sort((a, b) => b.n - a.n).slice(0, 5);
  
  const bySala = {};
  ordCorr.forEach(o => {
    bySala[o.sala] = (bySala[o.sala] || 0) + 1;
  });
  const topSalas = Object.entries(bySala).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const win = window.open('','_blank');
  win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>SIGMAN — Dashboard ${fd(t)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size:13px; color: #111; padding: 14mm 16mm; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #C41230; padding-bottom: 8px; margin-bottom: 14px; }
    h1 { font-size:17px; color: #C41230; }
    h2 { font-size:13px; margin: 14px 0 8px; background: #f4f4f4; padding: 4px 8px; border-left: 3px solid #C41230; text-transform: uppercase; letter-spacing: .5px; }
    .grid-10 { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-bottom: 14px; }
    .card { border: 1px solid #e0e0e0; border-radius: 4px; padding: 10px; text-align: center; }
    .card-label { font-size:10px; color: #888; text-transform: uppercase; font-weight: 600; }
    .card-value { font-size:20px; font-weight: bold; color: #C41230; margin-top: 4px; }
    .card-sub { font-size:10px; color: #999; margin-top: 3px; }
    .grid-charts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 14px; }
    .chart-box { border: 1px solid #e0e0e0; border-radius: 4px; padding: 10px; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th, td { font-size:11px; padding: 4px 6px; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f4f4f4; font-weight: bold; }
    td:last-child { text-align: right; font-weight: bold; }
    .foot { margin-top: 18px; border-top: 1px solid #e0e0e0; padding-top: 6px; font-size:10px; color: #999; display: flex; justify-content: space-between; }
    @media print { body { padding: 8mm 10mm; } .no-print { display: none; } }
  </style></head><body>
  
  <div class="header">
    <div><b style="font-size:15px; color: #C41230;">MUFFATO FOODS</b><br><span style="font-size:10px; color: #666;">SIGMAN — Gestão de Manutenção</span></div>
    <h1>RELATÓRIO — DASHBOARD</h1>
    <div style="text-align: right; font-size:10px; color: #666;">Período: ${perLbl}<br>Gerado em: ${fd(t)}</div>
  </div>

  <h2>KPIs do Período — ${perLbl}</h2>
  <div class="grid-10">
    <div class="card"><div class="card-label">Disponibilidade</div><div class="card-value">${disponib}%</div></div>
    <div class="card"><div class="card-label">OS Hoje</div><div class="card-value">${hj}</div></div>
    <div class="card"><div class="card-label">MTBF (min)</div><div class="card-value">${mtbf}</div></div>
    <div class="card"><div class="card-label">MTTR (min)</div><div class="card-value">${mttr}</div></div>
    <div class="card"><div class="card-label">Solicitações de Compra</div><div class="card-value">${solPend}</div><div class="card-sub">${solAtras} atrasadas</div></div>
    <div class="card"><div class="card-label">RAC</div><div class="card-value">${racDevemAbrir.length}</div><div class="card-sub">${racNaoAbertas.length} não abertas</div></div>
    <div class="card"><div class="card-label">Preventivas</div><div class="card-value">${ordPrev.length}</div></div>
    <div class="card"><div class="card-label">Corretivas</div><div class="card-value">${ordCorr.length}</div></div>
    <div class="card"><div class="card-label">Melhoria</div><div class="card-value">${ordMelh.length}</div></div>
    <div class="card"><div class="card-label">Inspeção</div><div class="card-value">${ordInsp.length}</div></div>
    <div class="card"><div class="card-label">Preditiva</div><div class="card-value">${ordPred.length}</div></div>
    <div class="card"><div class="card-label">Backlog OS</div><div class="card-value">${plOpen}</div><div class="card-sub">${plAtras} atrasadas</div></div>
  </div>

  <h2>Gráficos do Período</h2>
  <div class="grid-charts">
    <div class="chart-box">
      <div style="font-size:11px; font-weight: 600; margin-bottom: 8px;">Disponibilidade do Período</div>
      <svg width="100%" height="80" viewBox="0 0 140 80" preserveAspectRatio="xMidYMid meet">
        <circle cx="50" cy="40" r="25" fill="none" stroke="#e0e0e0" stroke-width="8"></circle>
        <circle cx="50" cy="40" r="25" fill="none" stroke="#C41230" stroke-width="8" stroke-dasharray="${disponib * 1.57} 157" stroke-linecap="round" transform="rotate(-90 50 40)"></circle>
        <text x="50" y="45" text-anchor="middle" font-size="16" font-weight="bold" fill="#C41230">${disponib}%</text>
        <text x="120" y="20" font-size="10" fill="#666">Meta: ${metaDisp}%</text>
        <text x="120" y="35" font-size="10" fill="#666">Salas: ${dispPorSala.length}</text>
      </svg>
    </div>
    <div class="chart-box">
      <div style="font-size:11px; font-weight: 600; margin-bottom: 8px;">Meta PCM — % Preventiva</div>
      <svg width="100%" height="80" viewBox="0 0 140 80" preserveAspectRatio="xMidYMid meet">
        <circle cx="50" cy="40" r="25" fill="none" stroke="#e0e0e0" stroke-width="8"></circle>
        <circle cx="50" cy="40" r="25" fill="none" stroke="${pctPrev >= metaPrev ? '#16a34a' : '#C41230'}" stroke-width="8" stroke-dasharray="${pctPrev * 1.57} 157" stroke-linecap="round" transform="rotate(-90 50 40)"></circle>
        <text x="50" y="45" text-anchor="middle" font-size="16" font-weight="bold" fill="${pctPrev >= metaPrev ? '#16a34a' : '#C41230'}">${pctPrev}%</text>
        <text x="120" y="20" font-size="10" fill="#666">Meta: ${metaPrev}%</text>
        <text x="120" y="35" font-size="10" fill="#666">Status: ${pctPrev >= metaPrev ? '✅' : '⚠'}</text>
      </svg>
    </div>
    <div class="chart-box">
      <div style="font-size:11px; font-weight: 600; margin-bottom: 8px;">Tendência — OS por Mês</div>
      <svg width="100%" height="80" viewBox="0 0 140 90" preserveAspectRatio="xMidYMid meet">
        <text x="70" y="50" text-anchor="middle" font-size="10" fill="#666">Últimos 6 meses</text>
        <text x="70" y="65" text-anchor="middle" font-size="10" fill="#999">Corr: ${ordCorr.length} | Prev: ${ordPrev.length}</text>
      </svg>
    </div>
  </div>

  <h2>Rankings — Corretivas</h2>
  <div class="grid-2">
    <div>
      <div style="font-size:11px; font-weight: 600; color: #C41230; margin-bottom: 6px;">Ranking Salas — Corretivas</div>
      <table>
        <tr><th>Sala</th><th>OS</th></tr>
        ${topSalas.map(([sala, n]) => `<tr><td>${sala}</td><td>${n}</td></tr>`).join('')}
        ${topSalas.length === 0 ? `<tr><td colspan="2" style="text-align: center; color: #999;">Sem dados</td></tr>` : ''}
      </table>
    </div>
    <div>
      <div style="font-size:11px; font-weight: 600; color: #C41230; margin-bottom: 6px;">Ranking Máquinas — Corretivas</div>
      <table>
        <tr><th>Máquina</th><th>OS</th></tr>
        ${topMaqs.map(m => `<tr><td>${m.maq}</td><td>${m.n}</td></tr>`).join('')}
        ${topMaqs.length === 0 ? `<tr><td colspan="2" style="text-align: center; color: #999;">Sem dados</td></tr>` : ''}
      </table>
    </div>
  </div>

  <div class="foot"><span>SIGMAN — Muffato Foods</span><span>Confidencial</span><span>${fd(t)}</span></div>
  <script>setTimeout(()=>window.print(),400);<\/script>
  </body></html>`);
  win.document.close();
}

function renderGauge(containerId, value, meta) {
  const cont = document.getElementById(containerId);
  if (!cont) return;
  if (!value || isNaN(value)) {
    value = 0;
    console.warn('[renderGauge] value é NaN, setando 0');
  }
  const color = value >= meta ? 'var(--grn)' : value >= meta-10 ? 'var(--org)' : 'var(--red)';
  const pct = Math.min(100, Math.max(0, value));
  const r = 40, cx = 52, cy = 46, sw = 13;
  function polarXY(deg) {
    const rad = (deg - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }
  function arcPath(s, e) {
    const sp = polarXY(s), ep = polarXY(e);
    const large = (e - s) > 180 ? 1 : 0;
    return `M ${sp.x.toFixed(2)} ${sp.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${ep.x.toFixed(2)} ${ep.y.toFixed(2)}`;
  }
  const valDeg = 180 + (pct / 100) * 180;
  const metaDeg = 180 + (meta / 100) * 180;
  const mp = polarXY(metaDeg);
  cont.innerHTML = `
    <div style="display:flex;align-items:center;gap:18px;padding:10px 4px">
      <div style="flex-shrink:0">
        <svg width="104" height="62" viewBox="0 0 104 62" style="overflow:visible">
          <path d="${arcPath(180,360)}" fill="none" stroke="var(--surf3)" stroke-width="${sw}" stroke-linecap="round"/>
          <path d="${arcPath(180, valDeg < 180.1 ? 180.1 : valDeg)}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>
          <circle cx="${mp.x.toFixed(2)}" cy="${mp.y.toFixed(2)}" r="4" fill="#f59e0b" stroke="var(--bg)" stroke-width="2"/>
          <text x="${cx}" y="${cy-6}" text-anchor="middle" font-size="19" font-weight="800" fill="${color}" font-family="Barlow Condensed,sans-serif">${value}%</text>
          <text x="${cx}" y="${cy+8}" text-anchor="middle" font-size="8" fill="var(--txt3)" font-family="Barlow,sans-serif">0% ←——→ 100%</text>
        </svg>
      </div>
      <div>
        <div style="font-size:15px;font-weight:600;color:var(--txt)">Disponibilidade</div>
        <div style="font-size:14px;color:var(--txt3);margin-top:5px">Meta: <strong style="color:#f59e0b">${meta}%</strong></div>
        <div style="height:5px;background:var(--surf3);border-radius:3px;width:110px;margin-top:8px;overflow:hidden">
          <div style="height:100%;width:${Math.min(100,value)}%;background:${color};border-radius:3px"></div>
        </div>
        <div style="font-size:13px;margin-top:6px;font-weight:600;color:${value>=meta?'var(--grn)':'var(--red)'}">
          ${value >= meta ? '✅ Meta atingida' : `⚠ Abaixo em ${meta-value}%`}
        </div>
      </div>
    </div>`;
}

function renderPCMRing(containerId, value, meta) {
  const cont = document.getElementById(containerId);
  if (!cont) return;
  const color = value >= meta ? 'var(--grn)' : value >= meta * 0.75 ? 'var(--org)' : 'var(--red)';
  const r = 40, cx = 52, cy = 52, sw = 13;
  const circ = 2 * Math.PI * r;
  const fill = Math.min(1, value / 100) * circ;
  cont.innerHTML = `
    <div style="display:flex;align-items:center;gap:18px;padding:10px 4px">
      <div style="flex-shrink:0">
        <svg width="104" height="104" viewBox="0 0 104 104">
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--surf3)" stroke-width="${sw}"/>
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}"
            stroke-dasharray="${fill.toFixed(2)} ${circ.toFixed(2)}"
            stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})"/>
          <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central"
            font-size="19" font-weight="800" fill="${color}" font-family="Barlow Condensed,sans-serif">${value}%</text>
        </svg>
      </div>
      <div>
        <div style="font-size:15px;font-weight:600;color:var(--txt)">% Preventiva</div>
        <div style="font-size:14px;color:var(--txt3);margin-top:5px">Meta PCM: <strong style="color:#f59e0b">${meta}%</strong></div>
        <div style="height:5px;background:var(--surf3);border-radius:3px;width:110px;margin-top:8px;overflow:hidden">
          <div style="height:100%;width:${Math.min(100,value)}%;background:${color};border-radius:3px"></div>
        </div>
        <div style="font-size:13px;margin-top:6px;font-weight:600;color:${value>=meta?'var(--grn)':'var(--red)'}">
          ${value >= meta ? '✅ Meta atingida' : `⚠ Faltam ${meta - value}%`}
        </div>
      </div>
    </div>`;
}
  
function renderTrend(containerId) {
  const cont = document.getElementById(containerId);
  if (!cont) return;
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    months.push(d.toISOString().slice(0,7));
  }
  const corrData = months.map(m => db.ordens.filter(o => o.data && o.data.startsWith(m) && o.tipo === 'Corretiva').length);
  const prevData = months.map(m => db.ordens.filter(o => o.data && o.data.startsWith(m) && o.tipo === 'Preventiva').length);
  const maxVal = Math.max(...corrData, ...prevData, 1);
  const chartH = 90, barW = 16, gap = 5, groupGap = 12, startX = 8, topPad = 14;
  const groupW = barW * 2 + gap;
  const svgW = startX * 2 + months.length * (groupW + groupGap) - groupGap;
  let bars = '';
  months.forEach((m, i) => {
    const x = startX + i * (groupW + groupGap);
    const lbl = m.slice(5,7) + '/' + m.slice(2,4);
    const cH = corrData[i] > 0 ? Math.max(4, Math.round(corrData[i]/maxVal*chartH)) : 0;
    const pH = prevData[i] > 0 ? Math.max(4, Math.round(prevData[i]/maxVal*chartH)) : 0;
    bars += `
      <rect x="${x}" y="${chartH-cH+topPad}" width="${barW}" height="${cH||1}" rx="3" fill="var(--red)" opacity=".85"/>
      ${corrData[i]?`<text x="${x+barW/2}" y="${chartH-cH+topPad-3}" text-anchor="middle" font-size="9" fill="var(--txt2)" font-family="var(--fw)">${corrData[i]}</text>`:''}
      <rect x="${x+barW+gap}" y="${chartH-pH+topPad}" width="${barW}" height="${pH||1}" rx="3" fill="var(--grn)" opacity=".85"/>
      ${prevData[i]?`<text x="${x+barW+gap+barW/2}" y="${chartH-pH+topPad-3}" text-anchor="middle" font-size="9" fill="var(--txt2)" font-family="var(--fw)">${prevData[i]}</text>`:''}
      <text x="${x+groupW/2}" y="${chartH+topPad+12}" text-anchor="middle" font-size="9" fill="var(--txt3)" font-family="var(--fw)">${lbl}</text>`;
      });
  cont.innerHTML = `
    <div style="display:flex;gap:14px;margin-bottom:10px">
      <span style="display:flex;align-items:center;gap:5px;font-size:13px;color:var(--txt2)"><span style="width:10px;height:10px;background:var(--red);border-radius:2px;opacity:.85;display:inline-block"></span>Corretiva</span>
      <span style="display:flex;align-items:center;gap:5px;font-size:13px;color:var(--txt2)"><span style="width:10px;height:10px;background:var(--grn);border-radius:2px;opacity:.85;display:inline-block"></span>Preventiva</span>
    </div>
    <svg width="100%" height="${chartH+18}" viewBox="0 0 ${svgW} ${chartH+18}" preserveAspectRatio="xMidYMid meet">${bars}</svg>`;
}

function renderProximas(containerId) {
  const cont = document.getElementById(containerId);
  if (!cont) return;
  const t = today();
  const abertas = db.planejadas
    .filter(p => p.status !== 'Concluída' && p.prazo)
    .sort((a,b) => a.prazo.localeCompare(b.prazo))
    .slice(0,3);
  if (!abertas.length) {
    cont.innerHTML = '<div class="empty"><div class="ei">📅</div><p>Sem preventivas pendentes.</p></div>';
    return;
  }
  cont.innerHTML = abertas.map(p => {
    const dias = Math.ceil((new Date(p.prazo) - new Date(t)) / 86400000);
    const uc = dias < 0 ? '#ff2244' : dias <= 3 ? 'var(--org)' : 'var(--grn)';
    const ul = dias < 0 ? `${Math.abs(dias)}d atrasada` : dias === 0 ? 'Vence hoje' : `${dias}d restantes`;
    const bw = Math.min(100, Math.max(5, 100 - Math.max(0,dias)/30*100));
    return `
      <div style="padding:9px 0;border-bottom:1px solid var(--bord)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <span class="osn">${p.numero}</span>
            <div style="font-size:14px;font-weight:500;margin-top:2px">${p.sala} · ${p.maq}</div>
          </div>
          <div style="text-align:right">
            ${prio(p.prioridade)}
            <div style="font-size:13px;font-weight:700;color:${uc};margin-top:4px">${ul}</div>
          </div>
        </div>
        <div style="height:4px;background:var(--surf3);border-radius:2px;margin-top:6px;overflow:hidden">
          <div style="height:100%;width:${bw}%;background:${uc};border-radius:2px"></div>
        </div>
      </div>`;
  }).join('');
}

function renderTopMaquinas(containerId, ordPer) {
  const cont = document.getElementById(containerId);
  if (!cont) return;
  const byMaq = {};
  ordPer.filter(o => o.tipo === 'Corretiva').forEach(o => {
    const k = o.maq + '||' + o.sala;
    if (!byMaq[k]) byMaq[k] = { maq: o.maq, sala: o.sala, n: 0, min: 0 };
    byMaq[k].n++;
    byMaq[k].min += (o.paradaMin || o.durMin || 0);
  });
  const top = Object.values(byMaq).sort((a,b) => b.n-a.n).slice(0,5);
  if (!top.length) {
    cont.innerHTML = '<div class="empty"><div class="ei">🔧</div><p>Sem corretivas no período.</p></div>';
    return;
  }
  const maxN = top[0].n;
  cont.innerHTML = top.map((m,i) => `
    <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--bord)">
      <span style="font-family:var(--fm);font-size:13px;color:var(--txt3);min-width:14px">${i+1}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.maq}</div>
        <div style="font-size:11px;color:var(--txt3)">${m.sala}${m.min?' · '+m.min+'min parada':''}</div>
        <div style="height:4px;background:var(--surf3);border-radius:2px;margin-top:3px;overflow:hidden">
          <div style="height:100%;width:${Math.round(m.n/maxN*100)}%;background:var(--org);border-radius:2px"></div>
        </div>
      </div>
      <span style="font-family:var(--fw);font-size:18px;font-weight:800;color:var(--org)">${m.n}</span>
    </div>`).join('');
}