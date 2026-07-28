/* ══════════════════════════════════════════════════════════════════
   SIGMAN — Core: Configuração, Estado Global e Camada de API
   Muffato Foods
   ORDEM DE CARREGAMENTO: este arquivo deve vir ANTES do script
   principal no index.html.
   ══════════════════════════════════════════════════════════════════ */

const API_URL = 'https://script.google.com/macros/s/AKfycbwzcntvx4_QfBYotW2Sz2H8TiwprqkmAyWolYlbIeCfTR2Uhj2VIgVC7Mun1mTaFXohuA/exec';
const USE_API = true; // false = modo offline (só localStorage)
const POLL_MS = 180000; // Atualização automática a cada 3 minutos
const CACHE_TTL_MS = 180000; // TTL do readAll: só busca novamente após 3 min

// ══════════════════════════════════════════════════════════════════════
// TEMPLATE DE INSPEÇÃO DIÁRIA (Equipamentos por Sala)
// ══════════════════════════════════════════════════════════════════════
const INSP_TMPL = [
  {"sala":"UTILIDADES", "equips":[{"id":"DISJUNTORES","nome":"DISJUNTORES CCM","subs":[]}]},
  {"sala":"PIZZA", "equips":[{"id":"PIZZA_LINHA","nome":"LINHA DE PRODUÇÃO","subs":[]}]},
  {"sala":"LÁCTEOS", "equips":[
    {"id":"LACTEOS_W905","nome":"FATIADORA WEBER 905","subs":[]},
    {"id":"LACTEOS_ULMA","nome":"TERMOFORMADORA ULMA","subs":[
      {"id":"LACTEOS_ULMA_VAC","nome":"TESTE DE VÁCUO"},
      {"id":"LACTEOS_ULMA_IMP","nome":"TESTE DE IMPRESSORA"}
    ]}
  ]},
  {"sala":"CÁRNEOS", "equips":[
    {"id":"CARNEOS_W405","nome":"FATIADORA WEBER 405","subs":[]},
    {"id":"CARNEOS_ULMA","nome":"TERMOFORMADORA ULMA","subs":[
      {"id":"CARNEOS_ULMA_VAC","nome":"TESTE DE VÁCUO"},
      {"id":"CARNEOS_ULMA_IMP","nome":"TESTE DE IMPRESSORA"}
    ]}
  ]},
  {"sala":"DEFUMADOS", "equips":[
    {"id":"DEFUM_ULMA","nome":"TERMOFORMADORA ULMA","subs":[
      {"id":"DEFUM_ULMA_VAC","nome":"TESTE DE VÁCUO"},
      {"id":"DEFUM_ULMA_IMP","nome":"TESTE DE IMPRESSORA"}
    ]}
  ]},
  {"sala":"BACALHAU", "equips":[
    {"id":"BAC_SERRA","nome":"SERRA FITA MONTEMIL","subs":[]},
    {"id":"BAC_ULMA","nome":"TERMOFORMADORA ULMA","subs":[
      {"id":"BAC_ULMA_VAC","nome":"TESTE DE VÁCUO"},
      {"id":"BAC_ULMA_IMP","nome":"TESTE DE IMPRESSORA"}
    ]}
  ]},
  {"sala":"LINGUIÇAS", "equips":[
    {"id":"LING_ELEV","nome":"ELEVADOR SULMAQ","subs":[]},
    {"id":"LING_HAND","nome":"EMBUTIDEIRA HANDTMANN VF 612","subs":[]},
    {"id":"LING_ULMA","nome":"TERMOFORMADORA ULMA","subs":[
      {"id":"LING_ULMA_VAC","nome":"TESTE DE VÁCUO"},
      {"id":"LING_ULMA_IMP","nome":"TESTE DE IMPRESSORA"}
    ]}
  ]},
  {"sala":"SALMOURAS", "equips":[
    {"id":"SALM_BAL","nome":"BALANÇA","subs":[]},
    {"id":"SALM_EKO","nome":"MISTURADOR DE MASSA EKOMEX","subs":[]},
    {"id":"SALM_MAX","nome":"MOEDOR MAXMAC","subs":[]},
    {"id":"SALM_TUM","nome":"TUMBLER HENNEKEN","subs":[]},
    {"id":"SALM_INJ","nome":"INJETORA HENNEKEN","subs":[]},
    {"id":"SALM_SAL","nome":"SALMOURA HENNEKEN","subs":[]}
  ]},
  {"sala":"TEMPERADOS", "equips":[
    {"id":"TEMP_DVAC","nome":"DUPLAVAC SELOVAC","subs":[]},
    {"id":"TEMP_TUM","nome":"TUMBLER MAXMAC","subs":[]},
    {"id":"TEMP_ULMA","nome":"TERMOFORMADORA ULMA","subs":[
      {"id":"TEMP_ULMA_VAC","nome":"TESTE DE VÁCUO"},
      {"id":"TEMP_ULMA_IMP","nome":"TESTE DE IMPRESSORA"}
    ]}
  ]},
  {"sala":"PORCIONAMENTO", "equips":[
    {"id":"PORC_FAT","nome":"FATIADORA DADAUX","subs":[]},
    {"id":"PORC_ULMA","nome":"TERMOFORMADORA ULMA","subs":[
      {"id":"PORC_ULMA_VAC","nome":"TESTE DE VÁCUO"},
      {"id":"PORC_ULMA_IMP","nome":"TESTE DE IMPRESSORA"}
    ]}
  ]},
  {"sala":"CORREDOR PORCIONAMENTO", "equips":[{"id":"CORR_BAL","nome":"BALANÇA","subs":[]}]},
  {"sala":"CARNE MOÍDA", "equips":[
    {"id":"CM_MOE","nome":"MISTURADOR DE MASSA EKOMEX","subs":[]},
    {"id":"CM_HAND","nome":"EMBUTIDEIRA HANDTMANN VF 620","subs":[]},
    {"id":"CM_GMD","nome":"PORCIONADORA HANDTMANN GMD 99-2","subs":[]},
    {"id":"CM_WS","nome":"SISTEMA DE PESAGEM HADTMANN WS 910","subs":[]},
    {"id":"CM_JA","nome":"ESTEIRA TRANSPORTADORA JA","subs":[]},
    {"id":"CM_ULMA","nome":"TERMOFORMADORA ULMA","subs":[
      {"id":"CM_ULMA_VAC","nome":"TESTE DE VÁCUO"},
      {"id":"CM_ULMA_IMP","nome":"TESTE DE IMPRESSORA"}
    ]}
  ]},
  {"sala":"DESOSSA", "equips":[
    {"id":"DES_SERRA3","nome":"SERRA FITA ESTEIRA 3","subs":[]},
    {"id":"DES_SERRACIRC","nome":"SERRA CIRCULAR","subs":[]},
    {"id":"DES_ESFOL","nome":"ESFOLIADEIRA ESTEIRA 1","subs":[]},
    {"id":"DES_CRYO","nome":"EMBALADORA CRYOVAC","subs":[]},
    {"id":"DES_TUNEL","nome":"TÚNEL DE TERMOENCOLHIMENTO CRYOVAC","subs":[]},
    {"id":"DES_VENTO","nome":"REMOVEDOR DE UMIDADE CRYOVAC","subs":[]},
    {"id":"DES_EST","nome":"ESTEIRAS","subs":[]},
    {"id":"DES_BAL","nome":"BALANÇA","subs":[]}
  ]}
];

// ══════════════════════════════════════════════════════════════════════
// BANCO DE DADOS LOCAL (cache em memória + localStorage)
// ══════════════════════════════════════════════════════════════════════
let db = {
  salas: [],
  maquinas: [],
  ordens: [],
  planejadas: [],
  solicitacoes: [],
  inspecoes: [],
  usuarios: [],
  configuracoes: {
    horas_turno_1: 7.1, horas_turno_2: 7.1, horas_turno_3: 0,
    meta_disponibilidade: 91, meta_performance: 90, meta_qualidade: 99
  },
  osC:1, plC:1, solC:1, inspC:1,
  historico: [],
  racs: [],
  manuaisSenhas: []
};

// ══════════════════════════════════════════════════════════════════════
// CONTROLE DE ACESSO (menus por nível)
// ══════════════════════════════════════════════════════════════════════
const ROLES = {
  administracao: {
    label: 'Administração',
    menus: ['dashboard','planejadas','executadas','abertura','inspecao', 'pcm', 'solicitacao','ativos','usuarios','manuais-senhas']
  },
  manutencao: {
    label: 'Manutenção',
    menus: ['dashboard','planejadas','executadas','abertura','inspecao','manuais-senhas']
  },
  producao: {
    label: 'Produção',
    menus: ['solicitacao']
  },
  diretoria: {
    label: 'Diretoria',
    menus: ['dashboard','executadas','solicitacao']
  }
};

let CU = null; // usuário logado
let _pollTimer = null; // timer de atualização automática
let _dashTimer = null; // timer específico do dashboard (15s)
let _curDet = null;
let _dashAutoRf = false; // auto-refresh dashboard ativo?

// ══════════════════════════════════════════════════════════════════════
// API — comunicação com Google Sheets
// ══════════════════════════════════════════════════════════════════════
async function apiGet(params, _tentativa = 1) {
  if (!USE_API) return null;
  const MAX_TENTATIVAS = 3;
  const TIMEOUT_MS = 35000; // 35s cobre o cold start do Apps Script
  try {
    const q = Object.entries(params).map(([k,v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    const res = await fetch(API_URL + '?' + q, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch(e) {
    const isTimeout = e.name === 'TimeoutError' || e.name === 'AbortError';
    console.warn(`[API GET] ${isTimeout ? 'Timeout' : 'Erro'} (tentativa ${_tentativa}/${MAX_TENTATIVAS}) — ${e.message}`);
    if (_tentativa < MAX_TENTATIVAS) {
      // Espera 3s antes de tentar novamente (deixa o Apps Script acordar)
      await new Promise(r => setTimeout(r, 3000));
      return apiGet(params, _tentativa + 1);
    }
    // Todas as tentativas falharam — avisa visualmente
    showApiStatus('offline');
    return null;
  }
}

async function apiPost(body) {
  if (!USE_API) return null;
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(40000)
    });
    const json = await res.json();
    if (!json.ok) {
      console.error('[API POST] Erro:', json.error);
      apiQueueFailed(body);
      return null;
    }
    return json;
  } catch(e) {
    console.error('[API POST]', e.message);
    apiQueueFailed(body);
    return null;
  }
}

// Fila de operações que falharam
function apiQueueFailed(body) {
  try {
    const fila = JSON.parse(localStorage.getItem('sigman_fila') || '[]');
    fila.push({ body, ts: Date.now() });
    localStorage.setItem('sigman_fila', JSON.stringify(fila));
    showApiStatus('offline');
  } catch(e) {}
}

async function apiFlushQueue() {
  try {
    const fila = JSON.parse(localStorage.getItem('sigman_fila') || '[]');
    if (!fila.length) return;
    const restante = [];
    for (const item of fila) {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(item.body)
      }).then(r => r.json()).catch(() => null);
      if (!res || !res.ok) restante.push(item);
    }
    localStorage.setItem('sigman_fila', JSON.stringify(restante));
    if (!restante.length) showApiStatus('online');
  } catch(e) {}
}

// Tenta reenviar fila a cada 30 segundos
setInterval(async () => {
  const fila = JSON.parse(localStorage.getItem('sigman_fila') || '[]');
  if (fila.length > 0) await apiFlushQueue();
}, 45000);

function showApiStatus(status) {
  let el = document.getElementById('api-status-bar');
  if (!el) {
    el = document.createElement('div');
    el.id = 'api-status-bar';
    el.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:9999;padding:10px 16px;border-radius:8px;font-family:var(--fw);font-size:14px;font-weight:700;font-variant:small-caps;letter-spacing:.04em;display:flex;align-items:center;gap:8px;box-shadow:0 4px 20px rgba(0,0,0,.4);transition:all .3s';
    document.body.appendChild(el);
  }
  if (status === 'offline') {
    el.style.background = 'rgba(196,18,48,.92)';
    el.style.color = '#fff';
    el.style.border = '1px solid rgba(196,18,48,.5)';
    el.innerHTML = '⚠️ Sheets indisponível — dado salvo localmente. Tentando reconectar...';
    el.style.display = 'flex';
  } else {
    el.style.background = 'rgba(31,217,136,.92)';
    el.style.color = '#000';
    el.style.border = '1px solid rgba(31,217,136,.4)';
    el.innerHTML = '✅ Reconectado — dados sincronizados.';
    setTimeout(() => { el.style.display = 'none'; }, 4000);
  }
}

// Envia nova linha para o Sheets
function apiAppend(sheet, row) { return apiPost({ action:'append', sheet, row, usuario: (typeof CU!=='undefined'&&CU)?CU.nome:'' }); }
// Atualiza linha existente
function apiUpdate(sheet, id, idCol, row) { return apiPost({ action:'update', sheet, id, idCol, row, usuario: (typeof CU!=='undefined'&&CU)?CU.nome:'' }); }
// Remove linha
function apiDelete(sheet, id, idCol) { return apiPost({ action:'delete', sheet, id, idCol, usuario: (typeof CU!=='undefined'&&CU)?CU.nome:'' }); }

// ── Normalização de valores vindos do Sheets ─────────────────────────────
function normDate(v) {
  if (!v) return '';
  if (typeof v === 'number') {
    const d = new Date((v - 25569) * 86400000);
    return isNaN(d) ? '' : d.toISOString().slice(0,10);
  }
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
  return s.slice(0,10);
}

function normTime(v) {
  if (!v) return '';
  if (typeof v === 'number') {
    const frac = v % 1;
    const min = Math.round(frac * 1440);
    return String(Math.floor(min/60)).padStart(2,'0') + ':' + String(min%60).padStart(2,'0');
  }
  const s = String(v);
  if (s.includes('T')) {
    // Usa horário LOCAL, não UTC
    const d = new Date(s);
    return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  }
  if (/^\d{1,2}:\d{2}/.test(s)) return s.slice(0,5);
  return '';
}

function driveThumb(url) {
  if (!url) return url;
  var m = url.match(/\/file\/d\/([^/]+)/) || url.match(/[?&]id=([^&]+)/);
  if (!m) return url;
  return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w1000';
}

function normStr(v) { return v === null || v === undefined ? '' : String(v); }

// ── Carrega todos os dados do Sheets ────────────────────────────────────
async function apiLoadAll(silent = false, force = false) {
  if (!USE_API) return;
  // TTL: só vai ao Sheets se passou mais de CACHE_TTL_MS desde o último readAll
  // force=true é usado após gravações (append/update/delete) para garantir consistência
  const lastLoad = Number(localStorage.getItem('sigman_last_load') || 0);
  if (!force && (Date.now() - lastLoad) < CACHE_TTL_MS) {
    if (!silent) console.log('[SIGMAN] Cache válido — readAll ignorado');
    return;
  }
  const json = await apiGet({ action: 'readAll' });
  if (!json || !json.ok) {
    if (!silent) {
      showToast('⚠️ Sheets indisponível — exibindo dados do cache local.', 'er', 5000);
      console.warn('[SIGMAN] Sheets indisponível, usando cache local');
    }
    return;
  }
  localStorage.setItem('sigman_last_load', String(Date.now()));
  const d = json.data;

  // Ordens Executadas
  if (d.ordens && d.ordens.length) {
    db.ordens = d.ordens.map(r => ({
      id: crypto.randomUUID(),
      numero: normStr(r.OS_Numero),
      sala: normStr(r.Sala),
      maq: normStr(r.Maquina),
      tipo: normStr(r.Tipo),
      prioridade: normStr(r.Prioridade),
      manut: normStr(r.Manutentor),
      data: normDate(r.Data),
      ini: normTime(r.Hora_Inicio),
      fim: normTime(r.Hora_Fim),
      durMin: Number(r.Duracao_Min) || 0,
      paradaMin: Number(r.Tempo_Parada_Min) || 0,
      prob: normStr(r.Problema),
      acao: normStr(r.Acao_Executada),
      acaoPrev: normStr(r.Acao_Preventiva||''),
      fotoUrl: normStr(r.Foto_URL||''),
      origem: normStr(r.Origem),
      origemNum: normStr(r.OS_Origem_Ref),
      criadoEm: normStr(r.Criado_Em)
    }));
    const max = Math.max(...db.ordens.map(o => parseInt(o.numero.replace(/\D/g,''))||0), 0);
    db.osC = max + 1;
  }

  // OS Planejadas
  if (d.planejadas && d.planejadas.length) {
    db.planejadas = d.planejadas.map(r => ({
      id: crypto.randomUUID(),
      numero: normStr(r.PL_Numero),
      sala: normStr(r.Sala),
      maq: normStr(r.Maquina),
      tipo: normStr(r.Tipo),
      prioridade: normStr(r.Prioridade),
      prazo: normDate(r.Prazo_Limite),
      horasTurno: Number(r.Horas_Turno) || 10,
      desc: normStr(r.Descricao_Planejada),
      status: normStr(r.Status) || 'Pendente',
      manut: normStr(r.Manutentor_Exec),
      dtExec: normDate(r.Data_Execucao),
      ini: normTime(r.Hora_Inicio),
      fim: normTime(r.Hora_Fim),
      durMin: Number(r.Duracao_Min) || 0,
      desc2: normStr(r.Servico_Executado),
      criadoEm: normStr(r.Criado_Em)
    }));
    const max = Math.max(...db.planejadas.map(p => parseInt(p.numero.replace(/\D/g,''))||0), 0);
    db.plC = max + 1;
  }

  // Solicitações
  if (d.solicitacoes && d.solicitacoes.length) {
    db.solicitacoes = d.solicitacoes.map(r => ({
      id: crypto.randomUUID(),
      numero: normStr(r.SOL_Numero),
      sala: normStr(r.Sala),
      maq: normStr(r.Maquina),
      tipo: normStr(r.Tipo),
      prioridade: normStr(r.Prioridade),
      desc: normStr(r.Descricao),
      status: normStr(r.Status) || 'Não Executada',
      solicitante:normStr(r.Solicitante),
      manut: normStr(r.Manutentor_Exec),
      dtExec: normDate(r.Data_Execucao),
      desc2: normStr(r.Servico_Executado),
      criadoEm: normStr(r.Criado_Em),
      fotoUrl: normStr(r.Foto_URL||'')
    }));
    const max = Math.max(...db.solicitacoes.map(s => parseInt(s.numero.replace(/\D/g,''))||0), 0);
    db.solC = max + 1;
  }

  // Inspeções Diárias
  if (d.historico && d.historico.length) {
    db.historico = d.historico.slice(0, 100).map(r => ({
      ts: normStr(r.Data_Hora),
      user: normStr(r.Usuario),
      login: normStr(r.Login),
      acao: normStr(r.Acao),
      numero: normStr(r.Numero_Ref),
      detalhe: normStr(r.Detalhe)
    }));
  }

  // Usuários — Sheets é a fonte de verdade; Senha_Hash do Sheets é usada diretamente.
  // Se o usuário mudou a senha pelo app, a versão local tem prioridade.
  const localUsers = JSON.parse(localStorage.getItem('sigman_users') || '[]');
  if (d.usuarios && d.usuarios.length) {
    // Mantém TODOS os usuários (ativos e desativados) — desativar não é excluir.
    // Login continua funcionando normalmente pra quem está ativo.
    db.usuarios = d.usuarios
      .filter(r => r.Login)
      .map(r => {
        const loc = localUsers.find(u => u.login === r.Login);
        // Prioridade: senha alterada no app (localStorage) > Senha_Hash do Sheets > fallback
        const senha = loc ? loc.senha : (r.Senha_Hash || 'mudar123');
        return {
          login: r.Login,
          nome: r.Nome,
          cargo: r.Cargo || '',
          tipo: r.Tipo_Acesso,
          senha,
          ativo: String(r.Ativo).toLowerCase() !== 'nao'
        };
      });
  } else if (localUsers.length) {
    db.usuarios = localUsers;
  }

  // Ativos (Salas e Máquinas) — substitui completamente pelo Sheets (reflete exclusões)
  if (d.salas && d.salas.length) {
    db.salas = d.salas.filter(r => r.Ativo !== 'nao').map(r => normStr(r.Nome)).filter(Boolean);
    db.salas.sort();
  }
  if (d.maquinas && d.maquinas.length) {
    db.maquinas = d.maquinas.filter(r => r.Ativo !== 'nao').map(r => ({
      id: normStr(r.ID_Maquina) || (normStr(r.Sala)+'_'+normStr(r.Nome)).replace(/\s+/g,'_'),
      nome: normStr(r.Nome),
      sala: normStr(r.Sala),
      tag: normStr(r.Tag),
      criticidade: normStr(r.Criticidade) || '3',
      periodicidade: normStr(r.Periodicidade_Preventiva) || 'Mensal',
      modeloPadrao: normStr(r.ModeloPadrao||'')
    }));
    db.maquinas.sort((a,b) => (a.sala+a.nome).localeCompare(b.sala+b.nome));
  }

  // Configurações
  if (d.configuracoes && d.configuracoes.length) {
    d.configuracoes.forEach(r => {
      if (r.Chave) db.configuracoes[r.Chave] = isNaN(r.Valor) ? r.Valor : Number(r.Valor);
    });
  }

  saveDB();
  if (!silent) console.log('[SIGMAN] ✅ Dados carregados do Sheets');
}

// ── Lazy loaders — chamados sob demanda ao entrar nas páginas ──────────────
async function apiLoadInspecoes() {
  if (!USE_API) return;
  const json = await apiGet({ action: 'readInspecoes' });
  if (!json?.ok || !json.data?.length) return;
  const map = {};
  json.data.forEach(r => {
    const key = normDate(r.Data) + '|' + normStr(r.Turno) + '|' + normStr(r.Manutentor);
    if (!map[key]) map[key] = {
      id: normStr(r.ID_Inspecao) || key,
      data: normDate(r.Data),
      turno: normStr(r.Turno),
      horasTurno: Number(r.Horas_Turno) || 10,
      manut: normStr(r.Manutentor),
      itens: []
    };
    map[key].itens.push({
      sala: normStr(r.Sala), equip: normStr(r.Equipamento),
      sub: normStr(r.Sub_Item), status: normStr(r.Status),
      hora: normTime(r.Hora), obs: normStr(r.Observacoes)
    });
  });
  db.inspecoes = Object.values(map);
  saveDB();
}

async function apiLoadRacs() {
  if (!USE_API) return;
  const json = await apiGet({ action: 'readRacs' });
  if (!json?.ok || !json.data?.length) return;
  db.racs = json.data.map(r => ({
    id: normStr(r.ID),
    osNumero: normStr(r.OS_Numero),
    maquina: normStr(r.Equipamento),
    sala: normStr(r.Sala),
    criticidade: Number(r.Criticidade) || 3,
    tempoParada: Number(r.Tempo_Parada_Min) || 0,
    limiteMin: Number(r.Limite_Min) || 0,
    falha: normStr(r.Falha),
    causaRaiz: normStr(r.Causa_Raiz),
    why1: normStr(r.Why1), why2: normStr(r.Why2), why3: normStr(r.Why3),
    why4: normStr(r.Why4), why5: normStr(r.Why5),
    acaoImediata: normStr(r.Acao_Imediata),
    acaoPreventiva: normStr(r.Acao_Preventiva),
    respProd: normStr(r.Resp_Producao),
    respManu: normStr(r.Resp_Manutencao),
    executantes: normStr(r.Executantes),
    fotos: (() => { try { return JSON.parse(r.Fotos || '[]'); } catch { return []; } })(),
    status: normStr(r.Status) || 'Aberto',
    dataAbertura: normDate(r.Data_Abertura),
    dataBaixa: normDate(r.Data_Fechamento),
    fechadoPor: normStr(r.Fechado_Por),
    criadoEm: normStr(r.Data_Criacao)
  }));
  saveDB();
}

async function apiLoadManuaisSenhas() {
  if (!USE_API) return;
  const json = await apiGet({ action: 'readManuaisSenhas' });
  if (!json?.ok) return;
  db.manuaisSenhas = (json.data || []).map(r => ({
    id: normStr(r.ID),
    sala: normStr(r.Sala),
    maquina: normStr(r.Equipamento),
    manualUrl: normStr(r.Manual_URL),
    credenciais: (() => { try { return JSON.parse(r.Credenciais || '[]'); } catch { return []; } })(),
    atualizadoPor: normStr(r.Atualizado_Por),
    atualizadoEm: normStr(r.Atualizado_Em)
  }));
  saveDB();
}

// ── localStorage ───────────────────────────────────────────────────────
function saveDB() {
  try {
    localStorage.setItem('sigman_v4', JSON.stringify({
      salas: db.salas, maquinas: db.maquinas,
      ordens: db.ordens, planejadas: db.planejadas,
      solicitacoes: db.solicitacoes, inspecoes: db.inspecoes,
      osC: db.osC, plC: db.plC, solC: db.solC, inspC: db.inspC,
      historico: db.historico,
      configuracoes: db.configuracoes,
      racs: db.racs
    }));
  } catch(e) {}
}

function loadDB() {
  try {
    const r = localStorage.getItem('sigman_v4');
    if (r) Object.assign(db, JSON.parse(r));
  } catch(e) {}
}
