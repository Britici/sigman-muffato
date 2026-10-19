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
// HORÁRIO SINCRONIZADO COM O SERVIDOR (Brasília / rede)
// O relógio do dispositivo (celular/PC) pode estar errado ou ter sido
// alterado manualmente pelo usuário — isso furaria a janela de 5 min de
// edição/exclusão (podeEditar) e distorceria "hoje" no dashboard. Aqui
// sincronizamos com o timestamp do próprio Apps Script (Google, sempre
// correto e em UTC — toISOString() é absoluto, não depende de fuso) na
// abertura do app e periodicamente, calculando um offset que corrige
// qualquer drift/desvio do relógio local sem precisar trocar o fuso do
// dispositivo. A "hora de Brasília" é só a exibição (fuso America/Sao_Paulo,
// sem horário de verão desde 2019) — o instante em si já é correto porque
// vem do servidor.
// ══════════════════════════════════════════════════════════════════════
let _serverOffsetMs = 0;      // servidor - local, em ms
let _serverSyncOk = false;    // true assim que a 1ª sincronização funcionar

async function syncServerTime() {
  try {
    const antes = Date.now();
    const res = await fetch(API_URL + '?action=ping', { signal: AbortSignal.timeout(8000) });
    const depois = Date.now();
    const json = await res.json();
    if (json && json.ts) {
      // corrige a latência de ida/volta pela metade (RTT/2), estimativa padrão
      const rtt = depois - antes;
      const tsServidor = new Date(json.ts).getTime() + Math.round(rtt / 2);
      _serverOffsetMs = tsServidor - depois;
      _serverSyncOk = true;
    }
  } catch (e) {
    // offline ou timeout: mantém o último offset conhecido (ou 0 na 1ª vez).
    // Não bloqueia o app — só significa que podeEditar()/today() usam o
    // relógio local puro até a próxima sincronização bem-sucedida.
    console.warn('[SIGMAN] Sincronização de horário falhou, usando relógio local:', e.message);
  }
}

// Instante atual corrigido pelo offset do servidor (ms desde epoch)
function agoraServidorMs() { return Date.now() + _serverOffsetMs; }

// Sincroniza no carregamento e a cada 5 min (corrige drift ao longo do turno)
setTimeout(syncServerTime, 4000); // atrasado: não compete com o readAll no cold start do Apps Script
setInterval(syncServerTime, 5 * 60 * 1000);

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
function dbPadrao() {
  return {
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
}
let db = dbPadrao();

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
    menus: ['dashboard','planejadas','executadas','abertura','inspecao','manuais-senhas'] // manuais-senhas é só visualização (regra 15/10/2026)
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
// ── Sessão (token emitido pelo login do Code.gs v14) ─────────────────────
// O token é assinado pelo servidor e expira lá (12h sem uso, teto 7 dias).
// Guardá-lo em localStorage é o mesmo nível de exposição da sessão que já
// existia; quem decide se vale é SEMPRE o servidor.
const TK_KEY = 'sigman_tk';
function getToken() { try { return localStorage.getItem(TK_KEY) || ''; } catch (e) { return ''; } }
function setToken(t) { try { if (t) localStorage.setItem(TK_KEY, t); else localStorage.removeItem(TK_KEY); } catch (e) {} }
// Cópia do corpo com o token atual (o corpo guardado na fila NUNCA leva token).
function comToken(body) { return Object.assign({}, body, { token: getToken() }); }

let _sessaoEncerrando = false;
function sessaoInvalida(msg) {
  if (_sessaoEncerrando) return;
  _sessaoEncerrando = true;
  setTimeout(() => { _sessaoEncerrando = false; }, 1500);
  setToken('');
  if (!CU) return; // tela de login: nada a derrubar
  showToast(msg || 'Sessão expirada. Faça login novamente.', 'war', 7000);
  if (typeof doLogout === 'function') doLogout();
}

// Passa por aqui TODA resposta do servidor: guarda o token renovado (tk) e,
// se a sessão não vale mais, encerra o app.
function authAplicarResposta(json) {
  if (!json || typeof json !== 'object') return;
  if (json.tk) setToken(json.tk);
  if (json.code === 'AUTH') sessaoInvalida(json.error);
}

// ══════════════════════════════════════════════════════════════════════
// API — comunicação com Google Sheets
// ══════════════════════════════════════════════════════════════════════
// GETs só de leitura: podem ser disparados em duplicidade (hedging) sem efeito colateral.
const _GET_SEGURO = /^(ping|read\w*|planos_list|planos_get|previewPreventivas)$/;
const GET_TIMEOUT_MS   = 20000; // por tentativa (cold start do Apps Script costuma levar 3–8s)
const GET_HEDGE_MS     = 7000;  // sem resposta em 7s → dispara um 2º pedido em paralelo
const GET_MAX_TENTATIVAS = 4;

function _fetchJson(url, ms) {
  return fetch(url, { signal: AbortSignal.timeout(ms) }).then(r => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  });
}

// Uma tentativa = 1 pedido; se for leitura segura e demorar (ou falhar cedo), um 2º pedido
// corre junto e vale a primeira resposta boa.
function _umaTentativaGet(url, hedge) {
  return new Promise((resolve, reject) => {
    let feito = false, ativos = 0, hedgeUsado = !hedge, timer = null;
    const lanca = () => { ativos++; _fetchJson(url, GET_TIMEOUT_MS).then(ok, ko); };
    const ok = j => { if (feito) return; feito = true; clearTimeout(timer); resolve(j); };
    const ko = e => {
      ativos--;
      if (feito) return;
      if (!hedgeUsado) { hedgeUsado = true; clearTimeout(timer); lanca(); return; } // falhou cedo: não espera os 7s
      if (ativos === 0) { feito = true; clearTimeout(timer); reject(e); }
    };
    lanca();
    if (hedge) timer = setTimeout(() => { if (!feito && !hedgeUsado) { hedgeUsado = true; lanca(); } }, GET_HEDGE_MS);
  });
}

async function apiGet(params, _tentativa = 1) {
  if (!USE_API) return null;
  const seguro = _GET_SEGURO.test(String(params && params.action));
  // Leituras auxiliares esperam o readAll em andamento (evita várias chamadas frias ao mesmo tempo).
  if (_tentativa === 1 && _cargaEmCurso && /^(readHistorico|readCompras|readInspecoes|readRacs|readManuaisSenhas)$/.test(String(params.action))) {
    try { await _cargaEmCurso; } catch (_) {}
  }
  try {
    const q = Object.entries({ ...params, token: getToken() }).map(([k,v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    const json = await _umaTentativaGet(API_URL + '?' + q, seguro);
    authAplicarResposta(json);
    return json;
  } catch(e) {
    const isTimeout = e.name === 'TimeoutError' || e.name === 'AbortError';
    console.warn(`[API GET] ${isTimeout ? 'Timeout' : 'Erro'} (tentativa ${_tentativa}/${GET_MAX_TENTATIVAS}) — ${e.message}`);
    if (_tentativa < GET_MAX_TENTATIVAS) {
      // Espera crescente (2s, 4s, 6s): deixa o Apps Script acordar / o Google estabilizar
      await new Promise(r => setTimeout(r, 2000 * _tentativa));
      return apiGet(params, _tentativa + 1);
    }
    // Todas as tentativas falharam — avisa visualmente
    showApiStatus('offline');
    return null;
  }
}

// Erros em que reenviar o MESMO corpo só repetiria a recusa: não entram na
// fila (e, se já estavam nela, vão para a "fila morta" em vez de ficar em loop).
const FILA_ERROS_PERMANENTES = ['FORBIDDEN', 'VALIDATION', 'NOTFOUND', 'DUP'];
const FILA_KEY = 'sigman_fila';
const FILA_MORTA_KEY = 'sigman_fila_morta';
const FILA_MAX_TENTATIVAS = 8;                    // recusas do servidor (não conta queda de rede)
const FILA_MAX_IDADE_MS = 7 * 24 * 3600 * 1000;   // mais velho que isso não é reenviado

function _erroPermanente(json) {
  return !!json && (FILA_ERROS_PERMANENTES.includes(json.code) || json.error === 'NUMERO_DUPLICADO');
}

// noQueueOnFail: quando true, uma resposta ok:false do servidor NÃO vai
// pra fila de retry offline (usado em retries imediatos, ex: número
// duplicado — reenviar o mesmo body só repetiria o mesmo erro). Falha de
// REDE (catch) continua indo pra fila normalmente, preservando o
// comportamento offline-first em qualquer caso.
// Recusa permanente (sem permissão, dado inválido, não encontrado) NUNCA entra
// na fila. Sessão expirada (AUTH) entra: é reenviada depois do próximo login.
async function apiPost(body, noQueueOnFail) {
  if (!USE_API) return null;
  const dono = (typeof CU !== 'undefined' && CU) ? CU.login : ''; // CU pode virar null se a sessão cair no meio
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(comToken(body)),
      signal: AbortSignal.timeout(40000)
    });
    const json = await res.json();
    authAplicarResposta(json);
    if (!json.ok) {
      console.error('[API POST] Erro:', json.code || '', json.error);
      if (!noQueueOnFail) {
        if (_erroPermanente(json)) {
          _filaMorta({ body, ts: Date.now(), user: dono }, json.error || json.code);
          showToast('⚠️ O servidor recusou uma gravação: ' + (json.error || json.code), 'war', 6000);
        } else {
          apiQueueFailed(body, dono);
        }
      }
      return json; // objeto com ok:false — caller distingue com 'res && res.ok'
    }
    return json;
  } catch(e) {
    console.error('[API POST]', e.message);
    if (!noQueueOnFail) apiQueueFailed(body, dono);
    return null; // falha de rede/timeout — sinal de offline preservado
  }
}

function _filaLer(k) { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { return []; } }
function _filaGravar(k, arr) { try { localStorage.setItem(k, JSON.stringify(arr)); } catch (e) {} }

// "Fila morta": o que o servidor recusou de vez (ou que passou do limite). Fica
// guardada (máx. 100) para conferência — nada some em silêncio.
function _filaMorta(item, erro) {
  const m = _filaLer(FILA_MORTA_KEY);
  m.push({ ...item, erro: String(erro || ''), morreuEm: Date.now() });
  _filaGravar(FILA_MORTA_KEY, m.slice(-100));
}
window.sigmanFilaMorta = () => _filaLer(FILA_MORTA_KEY);

// Fila de operações que falharam. Cada item guarda quem era o usuário: só o
// mesmo login reenvia (o servidor atribui a gravação à sessão que envia).
function apiQueueFailed(body, dono) {
  try {
    // Nunca guardar credenciais em localStorage.
    if (!body || body.action === 'login' || body.action === 'trocarSenha') return;
    const limpo = Object.assign({}, body); delete limpo.token;
    const fila = _filaLer(FILA_KEY);
    fila.push({
      id: gerarIdLocal('q'), body: limpo, ts: Date.now(), tries: 0,
      user: dono !== undefined ? dono : ((typeof CU !== 'undefined' && CU) ? CU.login : '')
    });
    localStorage.setItem(FILA_KEY, JSON.stringify(fila));
    showApiStatus('offline');
  } catch(e) {}
}

// Trava de reentrância: numa conexão lenta, um flush pode levar mais que
// os 45s do intervalo abaixo. Sem essa trava, o próximo tick do setInterval
// (que não espera o anterior terminar) lê a MESMA fila ainda não gravada de
// volta no localStorage e reenvia os mesmos itens — risco de duplicar
// registros no Sheets. Com a trava, um flush em andamento bloqueia o
// próximo até terminar.
let _flushEmAndamento = false;

async function apiFlushQueue() {
  if (_flushEmAndamento) return;
  if (!CU || !getToken()) return; // sem sessão não há como enviar; a fila espera o próximo login
  _flushEmAndamento = true;
  let mortas = 0;
  try {
    const fila = _filaLer(FILA_KEY);
    if (!fila.length) return;
    // Itens de versões antigas não tinham id: atribui e grava ANTES de qualquer await.
    let semId = false;
    fila.forEach(i => { if (!i.id) { i.id = gerarIdLocal('q'); semId = true; } });
    if (semId) _filaGravar(FILA_KEY, fila);

    const restante = [];
    let parar = false;
    for (const item of fila) {
      // Pára na 1ª falha de rede/sessão: preserva a ordem (um append antes do update dele).
      if (parar || (item.user && CU && item.user !== CU.login)) { restante.push(item); continue; }
      if (Date.now() - (item.ts || 0) > FILA_MAX_IDADE_MS) { _filaMorta(item, 'expirado (> 7 dias)'); mortas++; continue; }

      let json = null;
      try {
        const r = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify(comToken(item.body)),
          signal: AbortSignal.timeout(40000)
        });
        json = await r.json();
      } catch (e) { json = null; }

      authAplicarResposta(json); // AUTH → derruba a sessão; a fila continua guardada
      if (json && json.ok) continue;                                  // enviado
      if (!json || json.code === 'AUTH') { restante.push(item); parar = true; continue; }
      if (json.code === 'BUSY') { restante.push(item); continue; }    // servidor ocupado: tenta no próximo ciclo, sem contar
      item.tries = (item.tries || 0) + 1;
      if (_erroPermanente(json) || item.tries >= FILA_MAX_TENTATIVAS) {
        _filaMorta(item, json.error || json.code); mortas++;
      } else {
        restante.push(item);
      }
    }
    // Junta o que entrou na fila enquanto enviávamos (sem isso o flush apagava esses itens).
    const idsEnviados = new Set(fila.map(i => i.id));
    const novos = _filaLer(FILA_KEY).filter(i => !i.id || !idsEnviados.has(i.id));
    _filaGravar(FILA_KEY, restante.concat(novos));
    if (!restante.length && !novos.length) showApiStatus('online');
  } catch(e) {
  } finally {
    _flushEmAndamento = false;
    if (mortas) showToast('⚠️ ' + mortas + ' registro(s) pendente(s) foram recusados pelo servidor e separados (console: sigmanFilaMorta()). Confira se estão no sistema.', 'war', 9000);
  }
}

// Tenta reenviar a fila a cada 45 segundos
setInterval(async () => {
  if (_filaLer(FILA_KEY).length > 0) await apiFlushQueue();
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

// Gera um identificador único por tentativa de gravação. Usado como
// idempotencyKey: se o apiPost falhar e cair na fila offline, o mesmo
// `body` (já com essa chave dentro) é reenviado depois por apiFlushQueue —
// então o Code.gs consegue perceber "isso já foi gravado" e não duplicar,
// mesmo se a 1ª tentativa tiver na real terminado no servidor antes do
// timeout do cliente.
function gerarIdempotencyKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'idk-' + Date.now() + '-' + Math.random().toString(36).slice(2);
}

// ID de registro gerado no cliente (usado hoje por manuais-senhas.js pra
// registro novo). Diferente de gerarIdempotencyKey: este vira o ID
// persistido na planilha (coluna ID), não só uma chave de dedup — precisa
// ser único por registro, mas estável entre tentativas do MESMO registro
// (a chamada só acontece 1x por registro novo, então isso é garantido).
function gerarIdLocal(prefixo) {
  const sufixo = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : Date.now() + '-' + Math.random().toString(36).slice(2);
  return prefixo + '_' + sufixo;
}

// Envia nova linha para o Sheets
function apiAppend(sheet, row) {
  return apiPost({ action:'append', sheet, row, idempotencyKey: gerarIdempotencyKey(), usuario: (typeof CU!=='undefined'&&CU)?CU.nome:'' });
}

// Append com retry automático de número sequencial (OS-/PL-/SOL-).
// Corrige a corrida entre dois usuários gerando o mesmo número quase
// simultaneamente: o servidor (Code.gs) valida duplicidade DENTRO do
// lock de escrita e retorna { ok:false, error:'NUMERO_DUPLICADO' }. Aqui
// no client, ao ver esse erro específico, avançamos o contador local e
// tentamos de novo — sem enfileirar (reenviar o mesmo número só repetiria
// o erro). Qualquer outra falha (rede, offline, validação) cai na fila
// normal como sempre, preservando o comportamento offline-first.
//   row         — objeto já com [numeroCol] preenchido (ex: {OS_Numero:'OS-0042',...})
//   numeroCol   — nome da coluna do número (ex: 'OS_Numero')
//   prefixo     — ex: 'OS-'
//   counterProp — nome da prop em db usada como contador (ex: 'osC')
// Retorna { ok, numero, offline } — numero pode diferir do original em row
// se houve retry; o caller deve atualizar seu registro local com esse valor.
async function apiAppendComRetryNumero(sheet, row, numeroCol, prefixo, counterProp, maxTentativas = 5) {
  const dono = (typeof CU !== 'undefined' && CU) ? CU.login : ''; // a sessão pode cair no meio do laço
  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    const res = await apiPost({ action:'append', sheet, row, usuario:(typeof CU!=='undefined'&&CU)?CU.nome:'' }, true);
    if (res && res.ok) return { ok:true, numero: row[numeroCol] };
    if (res && res.error === 'NUMERO_DUPLICADO') {
      db[counterProp]++;
      const novoNumero = prefixo + String(db[counterProp]).padStart(4,'0');
      console.warn(`[SIGMAN] ${row[numeroCol]} já existia no servidor — tentando ${novoNumero} (${tentativa}/${maxTentativas}).`);
      row[numeroCol] = novoNumero;
      continue;
    }
    // Falha de rede (res===null) ou outro erro de validação: mantém o
    // número já calculado e enfileira para sync posterior, como sempre.
    // Recusa permanente (sem permissão / dado inválido) não vai pra fila: reenviar só repetiria o erro.
    if (!_erroPermanente(res)) apiQueueFailed({ action:'append', sheet, row, usuario:(typeof CU!=='undefined'&&CU)?CU.nome:'' }, dono);
    return { ok:false, numero: row[numeroCol], offline: res === null, error: res && res.error, code: res && res.code };
  }
  return { ok:false, numero:null, error:'Não foi possível gerar número único após ' + maxTentativas + ' tentativas.' };
}
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
// ── Carga completa (readAll) com: 1 execução por vez, faixa de "dados desatualizados" e
//    reconexão automática a cada 30s enquanto o Sheets não responder.
let _cargaEmCurso = null;
let _retryCargaTimer = null;

// juntar=true: quem chama (login/polling) aceita aproveitar um pedido já em andamento mesmo com force.
function apiLoadAll(silent = false, force = false, juntar = false) {
  if (!USE_API) return Promise.resolve();
  let p;
  const fim = () => { if (_cargaEmCurso === p) _cargaEmCurso = null; };
  if (_cargaEmCurso) {
    // Leitura comum: compartilha o pedido em andamento.
    if (!force || juntar) return _cargaEmCurso;
    // force (pós-gravação / polling): NÃO pode aproveitar um pedido que começou antes da gravação
    // (traria o estado antigo). Espera o atual terminar e faz um novo.
    const anterior = _cargaEmCurso;
    p = anterior.catch(() => {}).then(() => _apiLoadAllImpl(silent, true)).finally(fim);
  } else {
    // Cache local ainda válido e carga não forçada: não há o que buscar. Isto NÃO pode virar
    // "carga em curso": um pedido que não fez nada, registrado como carga, era aproveitado
    // (juntar) por quem pediu carga FORÇADA. No F5 (showPage chama apiLoadAll(true) antes do
    // init pedir a forçada) o readAll nunca saía, db.usuarios ficava vazio e o app deslogava.
    if (!force && (Date.now() - Number(localStorage.getItem('sigman_last_load') || 0)) < CACHE_TTL_MS) {
      if (!silent) console.log('[SIGMAN] Cache válido — readAll ignorado');
      return Promise.resolve();
    }
    p = _apiLoadAllImpl(silent, force).finally(fim);
  }
  _cargaEmCurso = p;
  return p;
}

function _marcarDesatualizado(on) {
  try { if (typeof setOffline === 'function') setOffline(on); } catch (_) {}
  const q = document.getElementById('offline-quando');
  if (q) {
    const t = Number(localStorage.getItem('sigman_last_load') || 0);
    q.textContent = t ? ' Última atualização: ' + new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '.' : '';
  }
  clearTimeout(_retryCargaTimer); _retryCargaTimer = null;
  if (on) {
    if (typeof CU !== 'undefined' && CU) _retryCargaTimer = setTimeout(() => { apiRetryAgora(); }, 30000);
  } else {
    const b = document.getElementById('api-status-bar');
    if (b && b.style.display !== 'none') showApiStatus('online'); // tira o aviso vermelho antigo
  }
}

async function apiRetryAgora() {
  clearTimeout(_retryCargaTimer); _retryCargaTimer = null;
  if (typeof CU === 'undefined' || !CU) return;
  const antes = Number(localStorage.getItem('sigman_last_load') || 0);
  try { await apiLoadAll(true, true); } catch (_) {}
  const depois = Number(localStorage.getItem('sigman_last_load') || 0);
  if (depois > antes && typeof rerenderAtual === 'function') rerenderAtual();
}

async function _apiLoadAllImpl(silent = false, force = false) {
  // TTL: só vai ao Sheets se passou mais de CACHE_TTL_MS desde o último readAll
  // force=true é usado após gravações (append/update/delete) para garantir consistência
  const lastLoad = Number(localStorage.getItem('sigman_last_load') || 0);
  if (!force && (Date.now() - lastLoad) < CACHE_TTL_MS) {
    if (!silent) console.log('[SIGMAN] Cache válido — readAll ignorado');
    return;
  }
  const json = await apiGet({ action: 'readAll' });
  if (json && json.code === 'AUTH') return; // sessão caiu: authAplicarResposta já avisou e fez logout
  if (!json || !json.ok) {
    _marcarDesatualizado(true);
    if (!silent) {
      showToast('⚠️ Sheets indisponível — exibindo dados do cache local.', 'er', 5000);
      console.warn('[SIGMAN] Sheets indisponível, usando cache local');
    }
    return;
  }
  localStorage.setItem('sigman_last_load', String(Date.now()));
  _marcarDesatualizado(false);
  const d = json.data;

  // Helper: parse array de fotos, com fallback lazy para Foto_URL (registros antigos)
  function _parseJsonFotos(r, fallbackKey) {
    try {
      const arr = JSON.parse(r.Fotos || '[]');
      if (Array.isArray(arr) && arr.length) return arr;
    } catch (_) {}
    const u = fallbackKey ? (r[fallbackKey] || '') : '';
    return u ? [u] : [];
  }

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
      fotos: _parseJsonFotos(r, 'Foto_URL'),
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
      fotos: _parseJsonFotos(r, null),
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
      fotoUrl: normStr(r.Foto_URL||''),
      fotos: _parseJsonFotos(r, 'Foto_URL')
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

  // Usuários — o backend NUNCA envia Senha_Hash/senha em texto puro (removido
  // do readAll no Code.gs). O login é validado no servidor (action 'login').
  // db.usuarios aqui só serve pra listar/editar usuários na tela de Admin —
  // não guarda mais senha nenhuma, nem local nem remota.
  if (d.usuarios && d.usuarios.length) {
    // Mantém TODOS os usuários (ativos e desativados) — desativar não é excluir.
    db.usuarios = d.usuarios
      .filter(r => r.Login)
      .map(r => ({
        login: r.Login,
        nome: r.Nome,
        cargo: r.Cargo || '',
        tipo: r.Tipo_Acesso,
        mudarSenha: !!r.MudarSenha, // true = senha ainda é a padrão de reset, precisa trocar
        ativo: String(r.Ativo).toLowerCase() !== 'nao'
      }));
    if (typeof populateMnSelects === 'function') populateMnSelects();
  }
  // sigman_users (cache local de senha) não é mais usado — se existir de uma
  // sessão antiga, remove pra não deixar senha em texto puro no localStorage.
  localStorage.removeItem('sigman_users');

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
  // Preserva rascunhos locais (nunca enviados ao Sheets) — sem isso, cada
  // reload da tela RACR sobrescrevia db.racs só com os dados do backend
  // e apagava qualquer rascunho salvo localmente, inclusive no localStorage.
  const rascunhosLocais = (db.racs || []).filter(r => r.status === 'Rascunho');
  db.racs = [
    ...json.data.map(r => ({
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
    })),
    ...rascunhosLocais
  ];
  saveDB();
}

async function apiLoadHistorico() {
  if (!USE_API) return;
  const json = await apiGet({ action: 'readHistorico' });
  if (!json?.ok) return;
  db.historico = (json.data || [])
    .map(r => ({
      ts: normStr(r.Data_Hora),
      user: normStr(r.Usuario),
      login: normStr(r.Login),
      acao: normStr(r.Acao),
      numero: normStr(r.Numero_Ref),
      detalhe: normStr(r.Detalhe)
    }))
    .sort((a, b) => new Date(b.ts) - new Date(a.ts))
    .slice(0, 100);
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

// ── Dono do cache local (v15) ──────────────────────────────────────────
// O cache 'sigman_v4' guarda os dados do último login deste navegador. Como o
// servidor agora entrega a cada perfil só o que ele pode ver, um login de
// perfil menor NÃO pode herdar o cache de um perfil maior (o cliente ignora
// listas vazias e manteria os dados antigos). Quando o dono (login|perfil)
// muda, o cache local e a memória são zerados antes de qualquer tela abrir.
// Rascunhos de RACR ainda não enviados são preservados (não são recuperáveis).
// A fila offline (sigman_fila) NÃO é tocada: ela já se protege por usuário.
const DONO_CACHE_KEY = 'sigman_dono';

function garantirDonoDoCache(user) {
  if (!user || !user.login) return;
  const dono = String(user.login).toLowerCase() + '|' + String(user.tipo || '');
  let atual = null;
  try { atual = localStorage.getItem(DONO_CACHE_KEY); } catch(e) {}
  if (atual === dono) return;

  let rascunhos = [];
  try {
    const r = JSON.parse(localStorage.getItem('sigman_v4') || '{}');
    rascunhos = (r.racs || []).filter(x => x && x.status === 'Rascunho');
  } catch(e) {}

  Object.keys(db).forEach(k => delete db[k]);
  Object.assign(db, dbPadrao());
  try { localStorage.removeItem('sigman_v4'); } catch(e) {}
  try { localStorage.removeItem('sigman_last_load'); } catch(e) {} // força carga completa em seguida
  if (rascunhos.length) { db.racs = rascunhos; saveDB(); }
  try { localStorage.setItem(DONO_CACHE_KEY, dono); } catch(e) {}
}
