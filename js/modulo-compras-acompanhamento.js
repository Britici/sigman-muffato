/* ═══════════════════════════════════════════════════════════════════════
   SIGMAN — Módulo: Acompanhamento das Ordens de Compra
   Muffato Foods | PCM · Compras
   v3 — Card de prazos, edição de etapas concluídas, obs/foto por etapa,
        timeout + retry no carregamento (bug do "timeout >15s" corrigido)
   ═══════════════════════════════════════════════════════════════════════ */
(function (global) {
'use strict';

/* ── CSS ──────────────────────────────────────────────────────────── */
const CSS_ID = 'css-sigman-compras-aco';
if (!document.getElementById(CSS_ID)) {
  const s = document.createElement('style');
  s.id = CSS_ID;
  s.textContent = `
.cac-wrap{padding:20px;font-family:inherit}
/* ── Card de Prazos ── */
.cac-prazos-card{
  background:var(--surf2);border:1px solid var(--bord);
  border-radius:var(--rs);margin-bottom:16px;overflow:hidden}
.cac-prazos-toggle{
  display:flex;align-items:center;justify-content:space-between;
  padding:11px 16px;cursor:pointer;user-select:none;
  font-size:.8rem;font-weight:700;font-variant:small-caps;color:var(--txt2);
  text-transform:uppercase;letter-spacing:.07em}
.cac-prazos-toggle:hover{background:rgba(255,255,255,.03)}
.cac-prazos-toggle span{font-size:.75rem;font-variant:small-caps;color:var(--txt3);font-weight:400;text-transform:none;letter-spacing:0}
.cac-prazos-body{display:none;overflow-x:auto;padding:0 0 4px}
.cac-prazos-body.open{display:block}
.cac-prazos-table{width:100%;border-collapse:collapse;font-size:.75rem}
.cac-prazos-table th{
  background:var(--surf);color:var(--txt2);font-weight:700;
  text-transform:uppercase;letter-spacing:.06em;
  padding:8px 10px;text-align:center;
  border-bottom:2px solid var(--bord);white-space:nowrap}
.cac-prazos-table td{padding:8px 10px;text-align:center;
  border-bottom:1px solid var(--bord);color:var(--txt1);white-space:nowrap}
.cac-prazos-table tr:last-child td{border-bottom:none}
.cac-prazos-table td.prazo-red{color:#ef4444;font-weight:600}
.cac-prazos-table td.prazo-total{font-weight:700;color:var(--txt1)}
.cac-pri-badge{display:inline-flex;align-items:center;justify-content:center;
  width:22px;height:22px;border-radius:50%;font-weight:700;font-size:.75rem}
.cac-pri-badge.p1{background:#ef4444;color:#fff}
.cac-pri-badge.p2{background:#eab308;color:#000}
.cac-pri-badge.p3{background:#3b82f6;color:#fff}
.cac-pri-badge.p4{background:#22c55e;color:#fff}
/* Filtros */
.cac-filtros{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;align-items:center}
.cac-filtros select{background:var(--surf2);border:1px solid var(--bord);color:var(--txt1);
  border-radius:7px;padding:7px 12px;font-size:.83rem;outline:none;cursor:pointer}
.cac-filtros select:focus{border-color:#C41230}
.cac-search{background:var(--surf2);border:1px solid var(--bord);color:var(--txt1);
  border-radius:7px;padding:7px 12px;font-size:.83rem;outline:none;min-width:200px}
.cac-search::placeholder{color:var(--txt3)}
.cac-search:focus{border-color:#C41230}
/* Tabs */
.cac-tabs{display:flex;gap:0;margin-bottom:16px;border-bottom:2px solid var(--bord)}
.cac-tab{padding:10px 22px;font-size:.88rem;font-weight:600;color:var(--txt3);cursor:pointer;
  border-bottom:2px solid transparent;margin-bottom:-2px;transition:color .2s,border-color .2s;user-select:none}
.cac-tab:hover{color:var(--txt1)}
.cac-tab.ativo{color:var(--txt1);border-bottom-color:#C41230}
.cac-tab-count{display:inline-flex;align-items:center;justify-content:center;
  background:var(--bord);color:var(--txt2);border-radius:10px;font-size:.7rem;
  min-width:20px;height:18px;padding:0 6px;margin-left:7px}
.cac-tab.ativo .cac-tab-count{background:#C41230;color:#fff}
/* Empty */
.cac-empty{text-align:center;padding:60px 20px;color:var(--txt3);font-size:.9rem}
.cac-empty svg{display:block;margin:0 auto 14px;opacity:.3}
.cac-empty .cac-btn-retry{margin-top:12px;padding:7px 16px;border-radius:7px;border:1px solid var(--bord);
  background:var(--surf2);color:var(--txt2);font-size:.82rem;cursor:pointer}
.cac-empty .cac-btn-retry:hover{border-color:#C41230;color:var(--txt1)}
/* Cards */
.cac-card{background:var(--surf2);border:1px solid var(--bord);
  border-radius:var(--rs);margin-bottom:12px;overflow:hidden;transition:border-color .2s}
.cac-card:hover{border-color:#374151}
.cac-card.pri-1{border-left:4px solid #ef4444}
.cac-card.pri-2{border-left:4px solid #eab308}
.cac-card.pri-3{border-left:4px solid #3b82f6}
.cac-card.pri-4{border-left:4px solid #22c55e}
.cac-card.concluida{opacity:.78}
.cac-card.orcamento_recusado{opacity:.78}
.cac-card-head{display:flex;align-items:center;gap:12px;padding:13px 16px;
  cursor:pointer;user-select:none;flex-wrap:wrap}
.cac-card-id{font-size:.72rem;font-weight:700;color:var(--txt3);font-family:monospace}
.cac-card-desc{flex:1;font-size:.9rem;color:var(--txt1);font-weight:600;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.cac-card-meta{display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:wrap}
.cac-badge{display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;
  font-size:.7rem;font-weight:700;letter-spacing:.04em;border:1px solid currentColor}
.cac-badge.pri-1{color:#ef4444;background:rgba(239,68,68,.1)}
.cac-badge.pri-2{color:#eab308;background:rgba(234,179,8,.1)}
.cac-badge.pri-3{color:#3b82f6;background:rgba(59,130,246,.1)}
.cac-badge.pri-4{color:#22c55e;background:rgba(34,197,94,.1)}
.cac-badge.status-em_andamento{color:#3b82f6;background:rgba(59,130,246,.1);border-color:#3b82f6}
.cac-badge.status-concluida{color:#22c55e;background:rgba(34,197,94,.1);border-color:#22c55e}
.cac-badge.status-orcamento_recusado{color:#ef4444;background:rgba(239,68,68,.1);border-color:#ef4444}
.cac-badge.status-atrasada{color:#ef4444;background:rgba(239,68,68,.1);border-color:#ef4444}
.cac-card-toggle{color:var(--txt3);font-size:.85rem;transition:transform .25s;margin-left:4px}
.cac-card-toggle.open{transform:rotate(180deg)}
.cac-card-body{padding:0 16px 16px;border-top:1px solid var(--bord);display:none}
.cac-card-body.open{display:block}
.cac-card-info{display:flex;gap:18px;flex-wrap:wrap;padding:12px 0 14px;
  font-size:.8rem;color:var(--txt3)}
.cac-card-info span b{color:var(--txt2);font-weight:600}
/* Stepper */
.cac-stepper{display:flex;align-items:flex-start;gap:0;overflow-x:auto;padding:4px 0 14px}
.cac-step{display:flex;flex-direction:column;align-items:center;
  flex:1;min-width:80px;position:relative}
.cac-step:not(:last-child)::after{
  content:'';position:absolute;top:14px;
  left:calc(50% + 14px);right:calc(-50% + 14px);
  height:2px;background:var(--bord);z-index:0}
.cac-step:not(:last-child).step-done::after{background:#22c55e}
.cac-step-dot{
  width:28px;height:28px;border-radius:50%;
  display:flex;align-items:center;justify-content:center;
  font-size:.7rem;font-weight:700;z-index:1;position:relative;
  border:2px solid transparent;transition:all .3s;flex-shrink:0}
.cac-step-dot.done{background:#22c55e;border-color:#22c55e;color:#fff}
.cac-step-dot.done.editavel{cursor:pointer;background:#16a34a}
.cac-step-dot.done.editavel:hover{background:#15803d;transform:scale(1.15);
  box-shadow:0 0 0 6px rgba(34,197,94,.2)}
.cac-step-dot.pending{background:var(--surf);border-color:var(--bord);color:var(--txt3)}
.cac-step-dot.active-ok{background:rgba(59,130,246,.12);border-color:#3b82f6;color:#93c5fd;
  animation:pulse-blue 1.6s ease-in-out infinite}
.cac-step-dot.active-late{background:rgba(239,68,68,.12);border-color:#ef4444;color:#fca5a5;
  animation:pulse-red 1.0s ease-in-out infinite}
.cac-step-dot.editavel{cursor:pointer;transition:transform .15s}
.cac-step-dot.editavel:not(.done):hover{transform:scale(1.18)}
@keyframes pulse-blue{
  0%,100%{box-shadow:0 0 0 0 rgba(59,130,246,.6)}
  50%{box-shadow:0 0 0 8px rgba(59,130,246,0)}}
@keyframes pulse-red{
  0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.7)}
  50%{box-shadow:0 0 0 8px rgba(239,68,68,0)}}
.cac-step-label{font-size:.62rem;color:var(--txt3);margin-top:6px;text-align:center;line-height:1.3;max-width:72px}
.cac-step-date{font-size:.6rem;color:#22c55e;margin-top:2px;text-align:center}
.cac-step-prazo{font-size:.6rem;color:#ef4444;margin-top:2px;text-align:center}
.cac-btn-etapa{margin-top:8px;padding:5px 13px;border-radius:6px;
  border:1px solid var(--bord);background:transparent;color:var(--txt2);
  font-size:.73rem;cursor:pointer;transition:all .2s}
.cac-btn-etapa:hover{border-color:#C41230;color:var(--txt1);background:rgba(196,18,48,.06)}
.cac-btn-etapa.editar-done{border-color:rgba(34,197,94,.4);color:#86efac;background:rgba(34,197,94,.07)}
.cac-btn-etapa.editar-done:hover{background:rgba(34,197,94,.15)}
.cac-btn-recusar{padding:5px 13px;border-radius:6px;
  border:1px solid rgba(239,68,68,.4);background:rgba(239,68,68,.08);
  color:#fca5a5;font-size:.73rem;cursor:pointer;transition:all .2s}
.cac-btn-recusar:hover{background:rgba(239,68,68,.2)}
/* Fotos no card */
.cac-photo-thumb{width:64px;height:64px;object-fit:cover;border-radius:6px;
  border:1px solid var(--bord);cursor:zoom-in;transition:transform .15s;display:block}
.cac-photo-thumb:hover{transform:scale(1.06)}
.cac-lightbox{position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:99999;
  display:none;align-items:center;justify-content:center;cursor:zoom-out;flex-direction:column;gap:14px}
.cac-lightbox.open{display:flex}
.cac-lightbox img{max-width:92vw;max-height:80vh;border-radius:8px;box-shadow:0 8px 40px rgba(0,0,0,.5)}
.cac-lightbox-print{padding:8px 18px;border-radius:7px;border:none;background:#C41230;color:#fff;
  font-size:.85rem;cursor:pointer;font-weight:700}
.cac-lightbox-print:hover{background:#a01028}
.cac-fotos-label{font-size:.68rem;font-weight:700;color:var(--txt3);
  text-transform:uppercase;letter-spacing:.07em;width:100%;margin-top:4px}
/* Info blocks (obs/preventiva) */
.cac-info-block{margin-top:10px;padding:10px 12px;background:var(--surf);
  border-radius:7px;border-left:3px solid var(--bord);font-size:.8rem;color:var(--txt2)}
.cac-info-block b{color:var(--txt2);display:block;font-size:.7rem;font-weight:700;
  text-transform:uppercase;letter-spacing:.07em;margin-bottom:3px}
/* Obs por etapa no card */
.cac-etapa-obs{margin-top:6px;padding:8px 10px;background:var(--surf);
  border-radius:6px;border-left:3px solid #22c55e;font-size:.78rem;color:var(--txt2)}
.cac-etapa-obs b{font-size:.67rem;font-weight:700;color:#86efac;
  text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:2px}
/* Modal */
.cac-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9990;
  display:flex;align-items:center;justify-content:center;padding:20px}
.cac-modal{background:var(--surf2);border:1px solid var(--bord);
  border-radius:var(--rs);width:100%;max-width:500px;max-height:92vh;
  overflow-y:auto;box-shadow:0 24px 60px rgba(0,0,0,.55)}
.cac-modal-header{display:flex;align-items:center;justify-content:space-between;
  padding:16px 20px;border-bottom:1px solid var(--bord)}
.cac-modal-title{font-size:1rem;font-weight:700;color:var(--txt1)}
.cac-modal-close{background:none;border:none;color:var(--txt3);font-size:1.1rem;
  cursor:pointer;padding:4px;transition:color .2s;line-height:1}
.cac-modal-close:hover{color:var(--txt1)}
.cac-modal-body{padding:20px}
.cac-modal-footer{display:flex;justify-content:flex-end;gap:10px;
  padding:14px 20px;border-top:1px solid var(--bord)}
.cac-modal .mf{display:flex;flex-direction:column;gap:5px;margin-bottom:14px}
.cac-modal .mf label{font-size:.73rem;font-variant:small-caps;font-weight:700;color:var(--txt2);
  text-transform:uppercase;letter-spacing:.07em}
.cac-modal .mf input,.cac-modal .mf textarea,.cac-modal .mf select{
  background:var(--bg);border:1px solid var(--bord);color:var(--txt1);
  border-radius:7px;padding:9px 11px;font-size:.88rem;outline:none;font-family:inherit}
.cac-modal .mf input:focus,.cac-modal .mf textarea:focus,.cac-modal .mf select:focus{
  border-color:#C41230;box-shadow:0 0 0 2px rgba(196,18,48,.1)}
.cac-modal .mf input[type=date]::-webkit-calendar-picker-indicator{filter:invert(.6)}
.cac-toggle-row{display:flex;align-items:center;gap:10px;padding:4px 0}
.cac-toggle-row label{font-size:.88rem;color:var(--txt1);cursor:pointer;flex:1}
.cac-toggle{width:42px;height:24px;background:var(--bord);border-radius:12px;
  position:relative;cursor:pointer;border:none;transition:background .2s;flex-shrink:0}
.cac-toggle.on{background:#ef4444}
.cac-toggle::after{content:'';position:absolute;top:3px;left:3px;width:18px;height:18px;
  border-radius:50%;background:#fff;transition:transform .2s}
.cac-toggle.on::after{transform:translateX(18px)}
.cac-foto-modal-drop{border:2px dashed var(--bord);border-radius:7px;padding:16px;
  text-align:center;cursor:pointer;color:var(--txt3);font-size:.83rem;transition:border-color .2s,background .2s}
.cac-foto-modal-drop:hover{border-color:#C41230;background:rgba(196,18,48,.05);color:var(--txt1)}
.cac-foto-modal-preview{margin-top:8px}
.cac-foto-modal-thumb{display:flex;align-items:center;gap:10px;padding:8px 10px;
  background:var(--surf);border-radius:6px;border:1px solid var(--bord)}
.cac-foto-modal-thumb img{width:44px;height:44px;object-fit:cover;border-radius:4px;flex-shrink:0}
.cac-foto-modal-thumb span{font-size:.78rem;color:var(--txt2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cac-foto-modal-thumb button{background:none;border:none;color:var(--txt3);
  cursor:pointer;font-size:.85rem;padding:4px;transition:color .2s;flex-shrink:0}
.cac-foto-modal-thumb button:hover{color:#ef4444}
.btn-cac-cancel{padding:9px 20px;border-radius:7px;border:1px solid var(--bord);
  background:transparent;color:var(--txt2);font-size:.88rem;cursor:pointer;transition:background .2s}
.btn-cac-cancel:hover{background:var(--surf)}
.btn-cac-save{padding:9px 22px;border-radius:7px;border:none;background:#C41230;
  color:#fff;font-size:.88rem;font-weight:700;cursor:pointer;transition:background .2s}
.btn-cac-save:hover{background:#a01028}
.btn-cac-save:disabled{opacity:.5;cursor:not-allowed}
.cac-spinner{display:inline-block;width:13px;height:13px;
  border:2px solid rgba(255,255,255,.25);border-top-color:#fff;border-radius:50%;
  animation:cac-spin .7s linear infinite;vertical-align:middle;margin-right:5px}
@keyframes cac-spin{to{transform:rotate(360deg)}}
.cac-toast{position:fixed;bottom:24px;right:24px;z-index:9999;padding:12px 20px;
  border-radius:8px;font-size:.88rem;font-weight:500;opacity:0;pointer-events:none;
  transform:translateY(10px);transition:all .3s;max-width:360px}
.cac-toast.show{opacity:1;transform:translateY(0)}
.cac-toast.ok {background:#14532d;color:#86efac;border:1px solid #22c55e}
.cac-toast.warn{background:#713f12;color:#fde68a;border:1px solid #eab308}
.cac-toast.err {background:#7f1d1d;color:#fca5a5;border:1px solid #ef4444}
`;
  document.head.appendChild(s);
}

/* ── CONSTANTS ────────────────────────────────────────────────────── */
const PRAZOS_ETAPAS = {
  1: [0, 0, 0, 0, 0],
  2: [2, 3, 5, 3, 2],
  3: [7,15, 7, 7,10],
  4: [7,30,13,10,30]
};
const PRAZO_NF = 7;

function _prazoEtapa(pri, idx) {
  const arr = PRAZOS_ETAPAS[pri] || PRAZOS_ETAPAS[2];
  if (idx <= 4) return arr[idx];
  if (idx === 5) return arr.reduce((a,b)=>a+b,0);
  return PRAZO_NF;
}

function _inicioEtapa(ordem, idx) {
  if (idx === 0 || idx === 5) return new Date(ordem.Data_Solicitacao);
  return new Date(ordem[ETAPAS[idx-1].col]);
}

const TOTAIS = {
  1: PRAZOS_ETAPAS[1].reduce((a,b)=>a+b,0) + PRAZO_NF,
  2: PRAZOS_ETAPAS[2].reduce((a,b)=>a+b,0) + PRAZO_NF,
  3: PRAZOS_ETAPAS[3].reduce((a,b)=>a+b,0) + PRAZO_NF,
  4: PRAZOS_ETAPAS[4].reduce((a,b)=>a+b,0) + PRAZO_NF
};

const PRIORIDADE_LABELS = { 1:'Emergencial', 2:'Urgente', 3:'Médio', 4:'Baixo' };

/* ETAPAS — obsCol e fotoCol mapeiam para colunas individuais no Sheets */
const ETAPAS = [
  { idx:0, label:'Solicitação', col:'Data_Etapa1', editavel:false, obsCol:null, fotoCol:null, extra:[] },
  { idx:1, label:'Orçamento', col:'Data_Etapa2', editavel:true, obsCol:'Obs_Etapa2', fotoCol:'Foto_Etapa2',
    extra:[
      { id:'Valor_Orcamento', label:'Valor do Orçamento (R$)', type:'number', placeholder:'0,00' },
      { id:'Orcamento_Recusado', label:'Orçamento Recusado?', type:'toggle' }
    ]},
  { idx:2, label:'RC / Pedido', col:'Data_Etapa3', editavel:true, obsCol:'Obs_Etapa3', fotoCol:'Foto_Etapa3',
    extra:[{ id:'Numero_RC', label:'N° RC / Pedido', type:'text', placeholder:'RC-000...' }]},
  { idx:3, label:'Aprovação', col:'Data_Etapa4', editavel:true, obsCol:'Obs_Etapa4', fotoCol:'Foto_Etapa4', extra:[] },
  { idx:4, label:'Envio Fornec.', col:'Data_Etapa5', editavel:true, obsCol:'Obs_Etapa5', fotoCol:'Foto_Etapa5', extra:[] },
  { idx:5, label:'Prev. Entrega', col:'Data_Etapa6', editavel:true, obsCol:'Obs_Etapa6', fotoCol:'Foto_Etapa6', extra:[],
    note:'Data prevista pelo fornecedor (pode ser futura)' },
  { idx:6, label:'Lançamento NF', col:'Data_Etapa7', editavel:true, obsCol:'Obs_Etapa7', fotoCol:'Foto_Etapa7',
    extra:[{ id:'Numero_NF', label:'N° Nota Fiscal', type:'text', placeholder:'NF-000...' }]}
];

/* ── STATE ────────────────────────────────────────────────────────── */
let _opts = {};
let _ordens = [];
let _abaAtiva = 'em_andamento';
let _lastEl = null;

/* ── LIGHTBOX (com botão de imprimir/salvar como PDF) ────────────── */
function _initLightbox() {
  if (document.getElementById('cac-lightbox')) return;
  var div = document.createElement('div');
  div.id = 'cac-lightbox';
  div.className = 'cac-lightbox';
  div.innerHTML = '<img id="cac-lightbox-img" src="" alt=""><button class="cac-lightbox-print" id="cac-lightbox-print-btn">🖨️ Imprimir / Salvar como PDF</button>';
  document.body.appendChild(div);
  div.addEventListener('click', function(e) {
    if (e.target.id === 'cac-lightbox-print-btn') return;
    this.classList.remove('open');
  });
  document.getElementById('cac-lightbox-print-btn').addEventListener('click', function(e) {
    e.stopPropagation();
    const src = document.getElementById('cac-lightbox-img').src;
    if (src && typeof abrirFotoImprimir === 'function') abrirFotoImprimir(src);
  });
  document.body.addEventListener('click', function(e) {
    var t = e.target.closest('.cac-photo-thumb');
    if (!t) return;
    document.getElementById('cac-lightbox-img').src = t.dataset.full;
    document.getElementById('cac-lightbox').classList.add('open');
  });
}

/* ── PUBLIC ───────────────────────────────────────────────────────── */
async function render(el, opts) {
  _initLightbox();
  _opts = opts;
  const body = el.querySelector('#pg-compras-acompanhamento-body') || el;
  _lastEl = body;
  body.innerHTML = _buildSkeleton();
  await _carregarOrdens(body);
}

/* ── SKELETON ─────────────────────────────────────────────────────── */
function _buildSkeleton() {
  return `
  <div class="cac-wrap">
    <!-- Card de Prazos por Prioridade -->
    <div class="cac-prazos-card">
      <div class="cac-prazos-toggle" id="cac-prazos-toggle">
        📋 Tabela de Prazos por Prioridade
        <span>▼ clique para expandir</span>
      </div>
      <div class="cac-prazos-body" id="cac-prazos-body">
        <table class="cac-prazos-table">
          <thead>
            <tr>
              <th>#</th>
              <th>1) Solicitação</th>
              <th>2) Orçamento</th>
              <th>3) Gerar RC/Pedido</th>
              <th>4) Aprovação</th>
              <th>5) Envio Fornecedor</th>
              <th>6) Previsão Entrega</th>
              <th>7) Lançamento NF</th>
              <th>Tempo Total</th>
            </tr>
          </thead>
          <tbody>
            ${[1,2,3,4].map(p => {
              const arr5 = PRAZOS_ETAPAS[p];
              const etapa6 = arr5.reduce((a,b)=>a+b,0);
              const pr = [...arr5, etapa6, PRAZO_NF];
              return '<tr><td><span class="cac-pri-badge p' + p + '">' + p + '</span></td>' +
                pr.map((d,i) => '<td' + (i===5?' class="prazo-red"':'') + '>' + (d===0?'0 dias':'Até '+d+' dia'+(d>1?'s':'')) + '</td>').join('') +
                '<td class="prazo-total">' + TOTAIS[p] + ' DIAS</td></tr>';
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="cac-filtros">
      <select id="cac-fil-prioridade">
        <option value="">Todas as prioridades</option>
        <option value="1">1 – Emergencial</option>
        <option value="2">2 – Urgente</option>
        <option value="3">3 – Médio</option>
        <option value="4">4 – Baixo</option>
      </select>
      <select id="cac-fil-sala">
        <option value="">Todas as salas</option>
      </select>
      <input class="cac-search" id="cac-search" type="text" placeholder="Buscar por ID, descrição, sala...">
    </div>

    <div class="cac-tabs">
      <div class="cac-tab ativo" data-tab="em_andamento">
        Em Andamento <span class="cac-tab-count" id="cnt-andamento">0</span>
      </div>
      <div class="cac-tab" data-tab="concluida">
        Concluídas <span class="cac-tab-count" id="cnt-concluida">0</span>
      </div>
    </div>

    <div id="cac-lista"></div>
    <div id="cac-toast" class="cac-toast"></div>
  </div>`;
}

/* ── LOAD ─────────────────────────────────────────────────────────── */
// PATCH (bug do timeout): antes usava fetch() puro, sem timeout e sem
// retry — em cold start do Apps Script (>15s) isso falhava direto e
// sem tentar de novo, diferente do resto do sistema (que usa apiGet/
// apiPost do core.js com timeout de 35-40s + 3 tentativas). Agora
// segue o mesmo padrão.
async function _carregarOrdens(el, _tentativa = 1) {
  const lista = el.querySelector('#cac-lista');
  const MAX_TENT = 3, TIMEOUT_MS = 35000;
  if (_tentativa === 1) lista.innerHTML = `<div class="cac-empty">Carregando ordens...</div>`;
  else lista.innerHTML = `<div class="cac-empty">⏳ Servidor demorando a responder — tentativa ${_tentativa}/${MAX_TENT}...</div>`;
  try {
    const r = await fetch(`${_opts.gsUrl}?action=read&sheet=compras`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    _ordens = (d.data || []).sort((a, b) =>
      new Date(b.Data_Solicitacao) - new Date(a.Data_Solicitacao));
    _popularFiltroSala(el);
    _bindTopEvents(el);
    _renderLista(el);
  } catch (e) {
    if (_tentativa < MAX_TENT) {
      await new Promise(res => setTimeout(res, 3000));
      return _carregarOrdens(el, _tentativa + 1);
    }
    const isTimeout = e.name === 'TimeoutError' || e.name === 'AbortError';
    lista.innerHTML = `<div class="cac-empty">❌ ${isTimeout ? 'O servidor não respondeu a tempo' : 'Erro ao carregar: ' + e.message}<br>
      <button class="cac-btn-retry" onclick="ComprasAcompanhamento.refresh()">🔄 Tentar novamente</button></div>`;
  }
}

function _popularFiltroSala(el) {
  const salas = [...new Set(_ordens.map(o => o.Sala).filter(Boolean))].sort();
  const sel = el.querySelector('#cac-fil-sala');
  sel.innerHTML = `<option value="">Todas as salas</option>` +
    salas.map(s => `<option value="${_esc(s)}">${_esc(s)}</option>`).join('');
}

/* ── EVENTS TOP ───────────────────────────────────────────────────── */
function _bindTopEvents(el) {
  /* Toggle tabela de prazos */
  el.querySelector('#cac-prazos-toggle').addEventListener('click', function () {
    const body = el.querySelector('#cac-prazos-body');
    const open = body.classList.toggle('open');
    this.querySelector('span').textContent = open ? '▲ clique para recolher' : '▼ clique para expandir';
  });

  el.querySelectorAll('.cac-tab').forEach(tab =>
    tab.addEventListener('click', function () {
      _abaAtiva = this.dataset.tab;
      el.querySelectorAll('.cac-tab').forEach(t => t.classList.remove('ativo'));
      this.classList.add('ativo');
      _renderLista(el);
    })
  );

  ['#cac-fil-prioridade','#cac-fil-sala','#cac-search'].forEach(id =>
    el.querySelector(id).addEventListener('input', () => _renderLista(el))
  );
}

/* ── RENDER LISTA ─────────────────────────────────────────────────── */
function _renderLista(el) {
  const filPri = el.querySelector('#cac-fil-prioridade').value;
  const filSala = el.querySelector('#cac-fil-sala').value;
  const busca = el.querySelector('#cac-search').value.toLowerCase();

  const isAndamento = o => o.Status === 'em_andamento';
  const isConcluida = o => o.Status === 'concluida' || o.Status === 'orcamento_recusado';

  const filtrar = o => {
    if (filPri && String(o.Prioridade) !== filPri) return false;
    if (filSala && o.Sala !== filSala) return false;
    if (busca && !(
      (o.ID || '').toLowerCase().includes(busca) ||
      (o.Descricao || '').toLowerCase().includes(busca) ||
      (o.Maquina || '').toLowerCase().includes(busca) ||
      (o.Sala || '').toLowerCase().includes(busca)
    )) return false;
    return true;
  };

  const andamento = _ordens.filter(o => isAndamento(o) && filtrar(o));
  const concluidas = _ordens.filter(o => isConcluida(o) && filtrar(o));

  el.querySelector('#cnt-andamento').textContent = andamento.length;
  el.querySelector('#cnt-concluida').textContent = concluidas.length;

  const lista = el.querySelector('#cac-lista');
  const atual = _abaAtiva === 'em_andamento' ? andamento : concluidas;

  if (!atual.length) {
    lista.innerHTML = `
      <div class="cac-empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
          <path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/>
          <path d="M16 3H8L6 7h12l-2-4z"/>
        </svg>
        Nenhuma ordem encontrada
      </div>`;
    return;
  }

  lista.innerHTML = atual.map(o => _buildCard(o)).join('');

  lista.querySelectorAll('.cac-card-head').forEach(head => {
    head.addEventListener('click', function () {
      const body = this.parentElement.querySelector('.cac-card-body');
      const toggle = this.querySelector('.cac-card-toggle');
      const open = body.classList.toggle('open');
      toggle.classList.toggle('open', open);
    });
  });

  lista.querySelectorAll('.cac-btn-etapa').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const ordem = _ordens.find(o => o.ID === btn.dataset.id);
      if (ordem) _abrirModal(ordem, Number(btn.dataset.etapa), el);
    });
  });

  lista.querySelectorAll('.cac-btn-recusar').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const ordem = _ordens.find(o => o.ID === btn.dataset.id);
      if (ordem) _recusarOrcamento(ordem, el);
    });
  });
}

/* ── BUILD CARD ───────────────────────────────────────────────────── */
function _buildCard(ordem) {
  const pri = Number(ordem.Prioridade) || 2;
  const priLabel = PRIORIDADE_LABELS[pri] || '';
  const isAdmin = (_opts.user || {}).Tipo_Acesso === 'administracao';
  const isConcl = ordem.Status === 'concluida' || ordem.Status === 'orcamento_recusado';
  const atrasada = !isConcl && _estaAtrasada(ordem);

  const statusLabel = {
    em_andamento: 'Em Andamento',
    concluida: '✅ Concluída',
    orcamento_recusado: '🚫 Orç. Recusado'
  }[ordem.Status] || ordem.Status;

  const statusClass = atrasada ? 'status-atrasada' : `status-${ordem.Status}`;
  const statusTxt = atrasada ? '⚠️ Atrasada' : statusLabel;

  const steps = ETAPAS.map(e => _buildStep(ordem, e, isAdmin, isConcl)).join('');
  const fotos = _parseFotos(ordem.Fotos);

  /* Fotos iniciais */
  const fotosIniciaisHtml = fotos.length
    ? '<div class="cac-fotos-grid"><span class="cac-fotos-label">📎 Fotos da Solicitação</span>' +
      fotos.map(url =>
        '<img class="cac-photo-thumb" src="' + _esc(driveThumb(url)) + '" data-full="' + _esc(driveThumb(url)) + '" alt="Foto">'
      ).join('') +
      '</div>'
    : '';

  /* Fotos e obs por etapa */
  const etapaObsHtml = ETAPAS.filter(e => e.obsCol || e.fotoCol).map(e => {
    const obs = ordem[e.obsCol] || '';
    const foto = ordem[e.fotoCol] || '';
    if (!obs && !foto) return '';
    let html = '<div class="cac-etapa-obs"><b>Etapa ' + (e.idx+1) + ' — ' + e.label + '</b>';
    if (obs) html += '<div>' + _esc(obs) + '</div>';
    if (foto) html += '<div style="margin-top:6px"><img class="cac-photo-thumb" src="' + _esc(driveThumb(foto)) + '" data-full="' + _esc(driveThumb(foto)) + '" alt="Foto etapa"></div>';
    html += '</div>';
    return html;
  }).join('');

  const etapa2Ok = !!ordem.Data_Etapa2;
  const mostrarRecusar = isAdmin && !isConcl && etapa2Ok && ordem.Orcamento_Recusado !== 'TRUE';

  const prevHtml = ordem.Acao_Preventiva
    ? `<div class="cac-info-block"><b>Ação Preventiva</b>${_esc(ordem.Acao_Preventiva)}</div>` : '';
  const obsGeralHtml = ordem.Observacoes
    ? `<div class="cac-info-block"><b>Observações Gerais</b>${_esc(ordem.Observacoes)}</div>` : '';

  return `
  <div class="cac-card pri-${pri} ${isConcl?(ordem.Status==='orcamento_recusado'?'orcamento_recusado':'concluida'):''}">
    <div class="cac-card-head">
      <span class="cac-card-id">${_esc(ordem.ID)}</span>
      <span class="cac-card-desc" title="${_esc(ordem.Descricao)}">${_esc(ordem.Descricao||'—')}</span>
      <div class="cac-card-meta">
        <span class="cac-badge pri-${pri}">${priLabel}</span>
        <span class="cac-badge ${statusClass}">${statusTxt}</span>
        <span class="cac-card-toggle">▼</span>
      </div>
    </div>
    <div class="cac-card-body">
      <div class="cac-card-info">
        <span><b>Sala:</b> ${_esc(ordem.Sala)}</span>
        <span><b>Máquina:</b> ${_esc(ordem.Maquina)}</span>
        <span><b>Qtd:</b> ${_esc(String(ordem.Quantidade||'—'))}</span>
        ${ordem.Fornecedor_Sugerido?`<span><b>Fornecedor:</b> ${_esc(ordem.Fornecedor_Sugerido)}</span>`:''}
        ${ordem.Numero_RC ?`<span><b>RC:</b> ${_esc(ordem.Numero_RC)}</span>`:''}
        ${ordem.Numero_NF ?`<span><b>NF:</b> ${_esc(ordem.Numero_NF)}</span>`:''}
        ${ordem.Valor_Orcamento ?`<span><b>Orçamento:</b> R$ ${_esc(String(ordem.Valor_Orcamento))}</span>`:''}
        <span><b>Data:</b> ${_fmtDate(ordem.Data_Solicitacao)}</span>
        <span><b>Solicitante:</b> ${_esc(ordem.Solicitante)}</span>
      </div>
      <div class="cac-stepper">${steps}</div>
      ${mostrarRecusar?`<div style="margin-top:8px">
        <button class="cac-btn-recusar" data-id="${_esc(ordem.ID)}">🚫 Recusar Orçamento</button>
      </div>`:''}
      ${fotosIniciaisHtml}
      ${etapaObsHtml}
      ${prevHtml}
      ${obsGeralHtml}
    </div>
  </div>`;
}

/* ── BUILD STEP ───────────────────────────────────────────────────── */
function _buildStep(ordem, etapa, isAdmin, isConcl) {
  const state = _getStepState(ordem, etapa.idx);
  const isDone = state === 'done';

  /* Admin pode editar qualquer etapa editável — inclusive as já concluídas */
  const canEdit = isAdmin && etapa.editavel && !isConcl;

  const prazoInfo = (state==='active-ok'||state==='active-late')
    ? `<span class="cac-step-prazo">${_prazoLabel(ordem,etapa.idx)}</span>` : '';
  const dateInfo = isDone
    ? `<span class="cac-step-date">${_fmtDateShort(ordem[etapa.col])}</span>` : '';

  const btnClass = isDone ? 'editar-done' : (state==='active-late' ? '' : '');
  const btnIcon = isDone ? '✏️ Editar' : (state==='active-late' ? '🔴 Preencher' : '📝 Preencher');

  const btnEditar = canEdit ? `
    <button class="cac-btn-etapa ${btnClass}"
      data-id="${_esc(ordem.ID)}" data-etapa="${etapa.idx}">
      ${btnIcon}
    </button>` : '';

  const lineDone = isDone ? 'step-done' : '';

  return `
  <div class="cac-step ${lineDone}">
    <div class="cac-step-dot ${state} ${canEdit?'editavel':''}"
      ${canEdit?`title="${isDone?'Clique para editar':'Clique para preencher'}"
      onclick="this.closest('.cac-card-body').querySelector('.cac-btn-etapa[data-etapa=&quot;${etapa.idx}&quot;]')?.click()"`:''}>
      ${isDone?'✓':etapa.idx+1}
    </div>
    <span class="cac-step-label">${etapa.label}</span>
    ${dateInfo}
    ${prazoInfo}
    ${btnEditar}
  </div>`;
}

/* ── STEP STATE ───────────────────────────────────────────────────── */
function _getStepState(ordem, idx) {
  if (ordem[ETAPAS[idx].col]) return 'done';
  if (ordem.Status==='concluida'||ordem.Status==='orcamento_recusado') return 'pending';
  const isAtual = ETAPAS.slice(0,idx).every(e=>!!ordem[e.col]);
  if (!isAtual) return 'pending';
  const pri = Number(ordem.Prioridade)||2;
  const prazoDias = _prazoEtapa(pri, idx);
  const startDate = _inicioEtapa(ordem, idx);
  if (isNaN(startDate.getTime())) return 'active-ok';
  const diff = (Date.now()-startDate.getTime())/86400000;
  return Math.floor(diff)>prazoDias?'active-late':'active-ok';
}

function _estaAtrasada(ordem) {
  return ETAPAS.some((_,idx)=>_getStepState(ordem,idx)==='active-late');
}

function _prazoLabel(ordem,idx) {
  const pri = Number(ordem.Prioridade)||2;
  const prazoDias = _prazoEtapa(pri, idx);
  const startDate = _inicioEtapa(ordem, idx);
  if (isNaN(startDate.getTime())) return '';
  const diff = Math.floor((Date.now()-startDate.getTime())/86400000);
  if (prazoDias===0) return diff===0?'Hoje':`+${diff}d`;
  if (diff>prazoDias) return `+${diff-prazoDias}d atraso`;
  const rest = prazoDias-diff;
  return `${rest}d restante${rest===1?'':'s'}`;
}

/* ── MODAL DE ETAPA ───────────────────────────────────────────────── */
function _abrirModal(ordem, etapaIdx, el) {
  const etapa = ETAPAS[etapaIdx];
  const isDone = !!ordem[etapa.col];
  const hoje = new Date().toISOString().split('T')[0];

  let _modalFotoFile = null, _modalFotoB64 = null, _modalFotoMime = null;
  let toggleState = false;

  const extraHtml = etapa.extra.map(ex => {
    if (ex.type==='toggle') return `
      <div class="mf">
        <div class="cac-toggle-row">
          <label for="m-${ex.id}">${ex.label}</label>
          <button type="button" class="cac-toggle${ordem[ex.id]==='TRUE'?' on':''}"
            id="m-${ex.id}" aria-pressed="${ordem[ex.id]==='TRUE'}"></button>
        </div>
      </div>`;
    return `
      <div class="mf">
        <label for="m-${ex.id}">${ex.label}</label>
        <input type="${ex.type==='number'?'number':'text'}" id="m-${ex.id}"
          min="0" step="0.01" placeholder="${_esc(ex.placeholder||'')}"
          value="${_esc(String(ordem[ex.id]||''))}">
      </div>`;
  }).join('');

  const noteHtml = etapa.note
    ? `<p style="font-size:.78rem;color:var(--txt3);margin:0 0 14px">${etapa.note}</p>` : '';

  const obsAtual = etapa.obsCol ? (ordem[etapa.obsCol] || '') : '';
  const fotoAtual = etapa.fotoCol ? (ordem[etapa.fotoCol] || '') : '';

  const fotoAtualHtml = fotoAtual
    ? '<div style="margin-bottom:8px">' +
        '<span style="font-size:.75rem;color:var(--txt3);display:block;margin-bottom:4px">Foto atual:</span>' +
        '<img class="cac-photo-thumb" src="' + _esc(driveThumb(fotoAtual)) + '" data-full="' + _esc(driveThumb(fotoAtual)) + '" alt="Foto atual">' +
      '</div>'
    : '';

  const html = `
  <div class="cac-modal-overlay" id="cac-modal-overlay">
    <div class="cac-modal">
      <div class="cac-modal-header">
        <span class="cac-modal-title">${isDone?'✏️ Editar':'📝 Preencher'} Etapa ${etapaIdx+1} — ${etapa.label}</span>
        <button class="cac-modal-close" id="cac-modal-close-btn">✕</button>
      </div>
      <div class="cac-modal-body">
        <p style="font-size:.8rem;color:var(--txt3);margin:0 0 16px">
          Ordem: <b style="color:var(--txt2)">${_esc(ordem.ID)}</b>
          <span style="margin-left:8px">${_esc(ordem.Descricao||'')}</span>
        </p>
        ${noteHtml}
        <div class="mf">
          <label for="m-data_disp">Data de Conclusão <span style="color:#C41230">*</span></label>
          <input type="hidden" id="m-data" value="${isDone?(ordem[etapa.col]||hoje):hoje}">
          <input type="text" id="m-data_disp" class="date-mask" placeholder="dd/mm/aaaa" inputmode="numeric" maxlength="10" oninput="dateMaskInput(this)" value="${fd(isDone?(ordem[etapa.col]||hoje):hoje)}" required>
        </div>
        ${extraHtml}
        <!-- Observações desta etapa -->
        <div class="mf" style="margin-top:4px">
          <label for="m-obs">Observações <span style="text-transform:none;font-weight:400;color:var(--txt3)">(opcional)</span></label>
          <textarea id="m-obs" rows="2" style="resize:vertical"
            placeholder="Anotações desta etapa...">${_esc(obsAtual)}</textarea>
        </div>
        <!-- Foto desta etapa -->
        <div class="mf">
          <label>Foto <span style="text-transform:none;font-weight:400;color:var(--txt3)">(opcional)</span></label>
          ${fotoAtualHtml}
          <div class="cac-foto-modal-drop" id="m-foto-drop">
            📷 ${fotoAtual?'Substituir foto':'Clique para anexar foto desta etapa'}
            <input type="file" id="m-foto-input" accept="image/*" style="display:none">
          </div>
          <div id="m-foto-preview" class="cac-foto-modal-preview"></div>
        </div>
      </div>
      <div class="cac-modal-footer">
        <button class="btn-cac-cancel" id="cac-modal-cancel">Cancelar</button>
        <button class="btn-cac-save" id="cac-modal-salvar">
          ${isDone?'✏️ Atualizar Etapa':'Salvar Etapa'}
        </button>
      </div>
    </div>
  </div>`;

  document.body.insertAdjacentHTML('beforeend', html);
  const overlay = document.getElementById('cac-modal-overlay');
  initDateIcons(overlay);

  /* Toggle — init state */
  overlay.querySelectorAll('.cac-toggle').forEach(tog => {
    toggleState = tog.classList.contains('on');
    tog.addEventListener('click', function () {
      toggleState = !toggleState;
      this.classList.toggle('on', toggleState);
      this.setAttribute('aria-pressed', toggleState);
    });
  });

  /* Foto bind */
  const fotoDropEl = overlay.querySelector('#m-foto-drop');
  const fotoInpEl = overlay.querySelector('#m-foto-input');
  const fotoPrevEl = overlay.querySelector('#m-foto-preview');

  fotoDropEl.addEventListener('click', () => fotoInpEl.click());
  fotoInpEl.addEventListener('change', function () {
    const file = this.files[0];
    if (!file||!file.type.startsWith('image/')) return;
    _modalFotoFile = file; _modalFotoMime = file.type;
    const reader = new FileReader();
    reader.onload = ev => {
      _modalFotoB64 = ev.target.result.split(',')[1];
      fotoPrevEl.innerHTML = `
        <div class="cac-foto-modal-thumb">
          <img src="${ev.target.result}" alt="${_esc(file.name)}">
          <span>${_esc(file.name)} · ${(file.size/1024).toFixed(0)} KB</span>
          <button type="button" id="m-foto-remover">✕</button>
        </div>`;
      overlay.querySelector('#m-foto-remover').addEventListener('click', () => {
        _modalFotoFile=null;_modalFotoB64=null;_modalFotoMime=null;
        fotoInpEl.value=''; fotoPrevEl.innerHTML='';
      });
    };
    reader.readAsDataURL(file);
  });

  /* Fechar */
  const fechar = () => overlay.remove();
  overlay.querySelector('#cac-modal-close-btn').addEventListener('click', fechar);
  overlay.querySelector('#cac-modal-cancel').addEventListener('click', fechar);
  overlay.addEventListener('click', e => { if (e.target===overlay) fechar(); });

  /* Salvar */
  overlay.querySelector('#cac-modal-salvar').addEventListener('click', async function () {
    const dataVal = overlay.querySelector('#m-data').value;
    if (!dataVal) { alert('Informe a data.'); return; }

    this.disabled = true;
    this.innerHTML = `<span class="cac-spinner"></span>Salvando...`;

    const payload = { [etapa.col]: dataVal };

    /* Campos extras */
    etapa.extra.forEach(ex => {
      if (ex.type==='toggle') {
        payload[ex.id] = toggleState ? 'TRUE' : 'FALSE';
      } else {
        const v = overlay.querySelector(`#m-${ex.id}`)?.value||'';
        if (v) payload[ex.id] = v;
      }
    });

    /* Obs desta etapa (coluna própria) */
    if (etapa.obsCol) {
      payload[etapa.obsCol] = overlay.querySelector('#m-obs')?.value?.trim() || '';
    }

    /* Se etapa 7 → concluída */
    if (etapaIdx===6) payload.Status = 'concluida';

    try {
      /* Upload foto desta etapa (coluna própria) */
      if (_modalFotoB64 && etapa.fotoCol && _opts.gsUrl) {
        try {
          const ext = (_modalFotoFile?.name?.split('.').pop()||'jpg').toLowerCase();
          const fr = await _post(_opts.gsUrl, {
            action: 'uploadFoto',
            numero: `${ordem.ID}_etapa${etapaIdx+1}`,
            fileName: `${ordem.ID}_etapa${etapaIdx+1}.${ext}`,
            mimeType: _modalFotoMime||'image/jpeg',
            base64: _modalFotoB64
          });
          if (fr.ok && fr.fileUrl) payload[etapa.fotoCol] = fr.fileUrl;
        } catch(fotoErr) { console.warn('Foto não enviada:', fotoErr); }
      }

      const r = await _post(_opts.gsUrl, {
        action: 'update', sheet: 'compras',
        id: ordem.ID, idCol: 'ID', row: payload
      });
      if (!r.ok) throw new Error(r.error||'Erro no servidor');

      Object.assign(ordem, payload);
      fechar();
      _renderLista(el);
      _toast(el, `✅ Etapa ${etapaIdx+1} ${isDone?'atualizada':'registrada'}!`, 'ok');
    } catch(err) {
      _toast(el, '❌ '+err.message, 'err');
      this.disabled = false;
      this.textContent = isDone?'✏️ Atualizar Etapa':'Salvar Etapa';
    }
  });
}

/* ── RECUSAR ORÇAMENTO ────────────────────────────────────────────── */
async function _recusarOrcamento(ordem, el) {
  if (!confirm(`Recusar o orçamento da ordem ${ordem.ID}?\nEssa ação encerrará a ordem como "Orçamento Recusado".`)) return;
  try {
    const r = await _post(_opts.gsUrl, {
      action:'update', sheet:'compras', id:ordem.ID, idCol:'ID',
      row:{ Orcamento_Recusado:'TRUE', Status:'orcamento_recusado',
            Data_Etapa2: new Date().toISOString().split('T')[0] }
    });
    if (!r.ok) throw new Error(r.error);
    Object.assign(ordem,{Orcamento_Recusado:'TRUE',Status:'orcamento_recusado'});
    _renderLista(el);
    _toast(el,'🚫 Orçamento recusado. Ordem encerrada.','warn');
  } catch(err) { _toast(el,'❌ '+err.message,'err'); }
}

/* ── UTILS ────────────────────────────────────────────────────────── */
// PATCH (bug do timeout): mesmo tratamento de _carregarOrdens — timeout
// explícito + 3 tentativas antes de desistir.
async function _post(url, payload, _tentativa = 1) {
  const MAX_TENT = 3, TIMEOUT_MS = 40000;
  try {
    const r = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    return await r.json();
  } catch (e) {
    if (_tentativa < MAX_TENT) {
      await new Promise(res => setTimeout(res, 3000));
      return _post(url, payload, _tentativa + 1);
    }
    const isTimeout = e.name === 'TimeoutError' || e.name === 'AbortError';
    throw new Error(isTimeout ? 'Servidor não respondeu a tempo (timeout).' : e.message);
  }
}

function _parseFotos(raw) { try { return JSON.parse(raw||'[]'); } catch { return []; } }

function _fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('pt-BR'); } catch { return iso; }
}

function _fmtDateShort(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
  } catch { return iso; }
}

function _toast(el, msg, type) {
  const t = el.querySelector('#cac-toast');
  if (!t) return;
  t.textContent = msg; t.className = `cac-toast ${type} show`;
  clearTimeout(t._tid); t._tid = setTimeout(()=>t.classList.remove('show'),5000);
}

function _esc(s) {
  return String(s||'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── EXPORT ───────────────────────────────────────────────────────── */
global.ComprasAcompanhamento = {
  render,
  refresh: () => { if (_lastEl) _carregarOrdens(_lastEl); }
};

})(window);
