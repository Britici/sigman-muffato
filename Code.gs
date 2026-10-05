// ═══════════════════════════════════════════════════════════════════════════
// SIGMAN Enterprise — Google Apps Script + RACR Backend
// Muffato Foods | PCM · OEE · TPM
// Arquivo ÚNICO compartilhado por sigman-muffato e sigprod-muffato (colado
// direto no editor do Apps Script; cópias de Code.gs no GitHub não valem).
//
// v13 — preventivas: ciclos em múltiplos de 7 + agendamento permanente
//   • PERIODICIDADE_DIAS: Mensal 28, Trimestral 91, Semestral 182, Anual 364.
//     A máquina vence sempre no mesmo dia da semana (30 dias empurrava 2 dias
//     por ciclo e jogava OS em fim de semana).
//   • Máquina SEM Ultima_Preventiva_Gerada não gera mais OS (antes usava
//     Criado_Em e disparava rajada). Quem dá a data é agendarPreventivasInterno_
//     (dia útil com vaga, 6 OS/dia), chamada no início de toda geração real —
//     ativo novo entra na agenda sozinho. Preview e geração mostram
//     semReferencia (máquinas ainda sem data).
//   • A semeadura temporária da v12 virou agendamento permanente
//     (agendarPreventivasPreview/Real); feriados 2026-2027 em AGENDAR_FERIADOS.
// v12 — preventivas: preparo para a primeira geração
//   • Maquinas no SCHEMAS agora inclui Ultima_Preventiva_Gerada.
//   • Removidos setupPreventivaAutomaticaColuna e setupIdempotencyKeyColunasGeral
//     (já rodaram; colunas existem).
//   • Salas fora da preventiva automática (SALAS_FORA_PREVENTIVA): UTILIDADES,
//     SECUNDÁRIA e as 3 de efluentes. Vale para preview e geração real.
//   • Ativo lido por ativoSim_(): aceita 'Não'/'nao'/'N'/'false' etc. (antes só
//     'nao' sem acento; 'Não' passava como ativo). Vale também no login.
//   • Ultima_Preventiva_Gerada lida por dataLocal_(): texto 'yyyy-MM-dd' é
//     interpretado em data LOCAL (new Date('yyyy-MM-dd') dá UTC e recuava 1 dia).
// v11 — correções + limpeza
//   • salvarManualSenha: upsert por ID agora ATÔMICO (um único comLock).
//     Antes, updateRow e appendRow tomavam lock separados: dois envios
//     simultâneos do mesmo ID podiam ambos cair em "não encontrado" e
//     duplicar. Também parou de gravar "falha" no LogFila a cada registro
//     novo (vinha do updateRow que não achava o ID).
//   • Preventiva automática: a máquina é identificada pela LINHA da planilha,
//     não pelo nome (duas máquinas de mesmo nome em salas diferentes se
//     confundiam quando uma OS falhava). Ultima_Preventiva_Gerada agora é
//     gravada logo após cada OS criada — se a execução morrer no meio, o que
//     já foi gerado não é gerado de novo na rodada seguinte.
//   • Removido (comprovadamente sem uso): appendComNumero (wrapper sem nenhum
//     chamador — o núcleo virou appendComNumero_), sanitizarManuaisSenhasBulk
//     e sua chamada em readAll (inalcançável: manuaisSenhas está em
//     SKIP_READ_ALL), comentários de versões antigas.
// v10 — performance do readAll: planilha aberta 1x por execução (getSS_) +
//     cache de 20s com invalidação por geração. Corrige 404 em
//     script.googleusercontent.com/macros/echo no polling (execução lenta).
//     Edição manual direto na planilha pode aparecer com até 20s de atraso.
// v9 — lock dedicado na geração de preventivas; idempotência genérica
//     (Idempotency_Key) em appendRow; salvarManualSenha exige ID do cliente.
// ═══════════════════════════════════════════════════════════════════════════

var SHEET_ID = '1zOXdRQoTOwPLhd3uPG7IdMx3rGTAtCM8wUm8WjvnDhg';

// ── Mapeamento nome curto → nome real da aba ────────────────────────────────
var SHEET_NAMES = {
  salas:         'Salas',
  maquinas:      'Maquinas',
  usuarios:      'Usuarios',
  ordens:        'Ordens_Executadas',
  planejadas:    'OS_Planejadas',
  solicitacoes:  'Solicitacoes',
  inspecoes:     'Inspecoes_Diarias',
  configuracoes: 'Configuracoes',
  preventiva:    'Preventiva',
  historico:     'Historico',
  racs:          'RAC',
  compras:       'OrdensCompra',
  manuaisSenhas: 'ManuaisSenhas'
};

// ── Sheets excluídas do readAll (muito grandes / lidas sob demanda). Inclui
// manuaisSenhas de propósito: credenciais de equipamento só saem pela action
// explícita 'readManuaisSenhas', nunca no carregamento em massa.
var SKIP_READ_ALL = ['historico', 'compras', 'inspecoes', 'racs', 'manuaisSenhas'];

// ── Planilha aberta UMA vez por execução ────────────────────────────────────
// Variável global vive só durante a execução atual (cada request do Web App
// começa do zero), então não há risco de objeto velho entre requests.
var _ssCache = null;
function getSS_() {
  if (!_ssCache) _ssCache = SpreadsheetApp.openById(SHEET_ID);
  return _ssCache;
}

// ── Cache do readAll ────────────────────────────────────────────────────────
// Invalidação por "geração": o cache é gravado sob a chave 'ra:<gen>:...'.
// invalidarCacheReadAll_() troca <gen>; as entradas antigas ficam órfãs e
// expiram sozinhas pelo TTL. Qualquer falha de cache cai pro cálculo normal.
var CACHE_READALL_TTL_S  = 20;
var CACHE_READALL_CHUNK  = 30000; // chars por pedaço (limite do CacheService: 100KB por valor)
var CACHE_READALL_MAXCHK = 90;    // acima disso não cacheia (payload > ~2,7M chars)

function cacheGenReadAll_(cache) {
  return cache.get('ra_gen') || '0';
}

function invalidarCacheReadAll_() {
  try {
    CacheService.getScriptCache().put('ra_gen', String(Date.now()) + '_' + Math.floor(Math.random() * 1000000), 21600);
  } catch (e) {
    Logger.log('Cache: falha ao invalidar: ' + e);
  }
}

// Devolve o JSON (string) de readAll(), do cache quando possível.
function readAllJson_() {
  var cache = null;
  var gen = '0';
  var prefixo = '';
  try {
    cache   = CacheService.getScriptCache();
    gen     = cacheGenReadAll_(cache);
    prefixo = 'ra:' + gen + ':';
    var n = parseInt(cache.get(prefixo + 'n'), 10);
    if (n > 0) {
      var keys = [];
      for (var i = 0; i < n; i++) keys.push(prefixo + i);
      var got = cache.getAll(keys);
      var partes = [];
      for (var j = 0; j < n; j++) {
        var p = got[prefixo + j];
        if (p === undefined || p === null) { partes = null; break; }
        partes.push(p);
      }
      if (partes) return partes.join('');
    }
  } catch (e) {
    Logger.log('Cache: falha ao ler: ' + e);
    cache = null;
  }

  var json = JSON.stringify(readAll());

  if (cache) {
    try {
      // Só grava se ninguém invalidou enquanto calculávamos (senão guardaria
      // dado anterior a uma escrita recém-feita).
      if (cacheGenReadAll_(cache) === gen) {
        var total = Math.ceil(json.length / CACHE_READALL_CHUNK);
        if (total > 0 && total <= CACHE_READALL_MAXCHK) {
          var obj = {};
          for (var k = 0; k < total; k++) {
            obj[prefixo + k] = json.substr(k * CACHE_READALL_CHUNK, CACHE_READALL_CHUNK);
          }
          obj[prefixo + 'n'] = String(total);
          cache.putAll(obj, CACHE_READALL_TTL_S);
        }
      }
    } catch (e) {
      Logger.log('Cache: falha ao gravar: ' + e);
    }
  }
  return json;
}

// ── Schemas completos de cada aba ───────────────────────────────────────────
var SCHEMAS = {
  'Salas': [
    'ID_Sala','Nome','Descricao','Ativo','Criado_Em','Idempotency_Key'
  ],
  'Maquinas': [
    'ID_Maquina','Sala','Nome','Tag','Criticidade',
    'Periodicidade_Preventiva','Descricao','Ativo','Criado_Em','Idempotency_Key',
    'Ultima_Preventiva_Gerada'
  ],
  'Ordens_Executadas': [
    'OS_Numero','Data','Sala','Maquina','Tag_Maquina','Tipo','Prioridade',
    'Manutentor','Hora_Inicio','Hora_Fim','Duracao_Min','Tempo_Parada_Min',
    'Problema','Acao_Executada','Acao_Preventiva','Foto_URL','Fotos','Pecas_Utilizadas',
    'Origem','OS_Origem_Ref','Criado_Em'
  ],
  'OS_Planejadas': [
    'PL_Numero','Sala','Maquina','Tag_Maquina','Tipo','Prioridade',
    'Prazo_Limite','Horas_Turno','Descricao_Planejada','Status',
    'Manutentor_Exec','Data_Execucao','Hora_Inicio','Hora_Fim',
    'Duracao_Min','Servico_Executado','Criado_Em','Concluido_Em','Fotos'
  ],
  'Solicitacoes': [
    'SOL_Numero','Sala','Maquina','Tipo','Prioridade','Descricao',
    'Status','Solicitante','Manutentor_Exec','Data_Execucao',
    'Servico_Executado','Foto_URL','Fotos','Criado_Em','Concluido_Em'
  ],
  'Inspecoes_Diarias': [
    'ID_Inspecao','Data','Turno','Horas_Turno','Manutentor',
    'Sala','Equipamento','Sub_Item','Status','Hora','Observacoes','Criado_Em'
  ],
  'Usuarios': [
    'Login','Nome','Tipo_Acesso','Senha_Hash','Ativo','Criado_Em','Cargo','Idempotency_Key'
  ],
  'Configuracoes': [
    'Chave','Valor','Descricao','Atualizado_Em'
  ],
  'Preventiva': [
    'ID','Modelo','Data_Execucao','Maquina','Tag','Manutentor','Periodicidade',
    'Area','Tarefa','Status','Hora_Inicio','Hora_Fim','Materiais','Observacoes','Criado_Em','Idempotency_Key'
  ],
  'Historico': [
    'ID','Data_Hora','Usuario','Login','Acao','Numero_Ref','Detalhe','Idempotency_Key'
  ],
  'RAC': [
    'ID','Data_Abertura','OS_Numero','Equipamento','Sala','Criticidade',
    'Tempo_Parada_Min','Limite_Min','Falha','Causa_Raiz',
    'Why1','Why2','Why3','Why4','Why5',
    'Acao_Imediata','Acao_Preventiva','Resp_Producao','Resp_Manutencao',
    'Executantes','Status','Data_Fechamento','Fechado_Por',
    'Usuario_Criacao','Data_Criacao','Idempotency_Key'
  ],
  'OrdensCompra': [
    'ID', 'Data_Solicitacao', 'Solicitante',
    'Sala', 'Maquina', 'Tipo_Acao', 'Prioridade',
    'Descricao', 'Quantidade', 'Fornecedor_Sugerido',
    'Acao_Preventiva', 'Fotos', 'Status',
    'Data_Etapa1',
    'Data_Etapa2', 'Orcamento_Recusado', 'Valor_Orcamento',
    'Data_Etapa3', 'Numero_RC',
    'Data_Etapa4',
    'Data_Etapa5',
    'Data_Etapa6',
    'Data_Etapa7', 'Numero_NF',
    'Observacoes',
    'Obs_Etapa2', 'Obs_Etapa3', 'Obs_Etapa4',
    'Obs_Etapa5', 'Obs_Etapa6', 'Obs_Etapa7',
    'Foto_Etapa2', 'Foto_Etapa3', 'Foto_Etapa4',
    'Foto_Etapa5', 'Foto_Etapa6', 'Foto_Etapa7',
    'Idempotency_Key'
  ],
  'ManuaisSenhas': [
    'ID','Sala','Equipamento','Manual_URL','Credenciais','Atualizado_Por','Atualizado_Em'
  ],
  'LogFila': [
    'Data_Hora','Usuario','Acao','Sheet','ID_Ref','Status','Detalhe'
  ]
};

var REQUIRED_FIELDS = {
  ordens:       ['OS_Numero','Sala','Maquina','Tipo'],
  planejadas:   ['PL_Numero','Sala','Maquina','Tipo'],
  solicitacoes: ['SOL_Numero','Sala','Maquina','Descricao'],
  maquinas:     ['ID_Maquina','Sala','Nome'],
  salas:        ['Nome'],
  racs:         ['ID','OS_Numero'],
  compras:      ['ID','Sala','Descricao'],
  manuaisSenhas:['ID','Sala','Equipamento']
};

function validarObrigatorios(key, rowObj, isUpdate) {
  var campos = REQUIRED_FIELDS[key];
  if (!campos) return null;
  for (var i = 0; i < campos.length; i++) {
    var c = campos[i];
    var v = rowObj[c];
    if (isUpdate) {
      if (v !== undefined && String(v).trim() === '') {
        return 'Campo obrigatório não pode ficar vazio: ' + c;
      }
    } else {
      if (v === undefined || String(v).trim() === '') {
        return 'Campo obrigatório ausente: ' + c;
      }
    }
  }
  return null;
}

function comLock(fn) {
  var lock = LockService.getScriptLock();
  var gotLock = lock.tryLock(10000);
  if (!gotLock) {
    return { ok: false, error: 'Sistema ocupado (outra gravação em andamento). Tente novamente em instantes.' };
  }
  try {
    return fn();
  } catch (e) {
    return { ok: false, error: e.toString() };
  } finally {
    invalidarCacheReadAll_(); // nunca lança; roda antes de soltar o lock
    lock.releaseLock();
  }
}

function logGravacao(usuario, acao, sheetKey, idRef, status, detalhe) {
  try {
    var sh = getSheet('LogFila');
    sh.appendRow([
      new Date().toISOString(),
      usuario || '',
      acao || '',
      sheetKey || '',
      idRef || '',
      status || '',
      detalhe || ''
    ]);
  } catch (e) {
    Logger.log('Erro ao gravar LogFila: ' + e.toString());
  }
}

function doGet(e) {
  if (!e || !e.parameter) {
    return jsonOut({ ok: true, msg: 'SIGMAN API v5 online', ts: new Date().toISOString() });
  }
  try {
    var p = e.parameter;
    if (p.action === 'ping')                return jsonOut({ ok: true, ts: new Date().toISOString() });
    if (p.action === 'readAll')             return jsonOutRaw_('{"ok":true,"data":' + readAllJson_() + '}');
    if (p.action === 'read')                return jsonOut({ ok: true, data: readSheet(p.sheet) });
    if (p.action === 'readHistorico')       return jsonOut({ ok: true, data: readSheet('historico') });
    if (p.action === 'readCompras')         return jsonOut({ ok: true, data: readSheet('compras') });
    if (p.action === 'readInspecoes')       return jsonOut({ ok: true, data: readSheet('inspecoes') });
    if (p.action === 'readRacs')            return jsonOut({ ok: true, data: readSheet('racs') });
    if (p.action === 'readManuaisSenhas')   return jsonOut({ ok: true, data: readSheet('manuaisSenhas') });
    if (p.action === 'previewPreventivas')  return jsonOut(gerarPreventivasAutomaticas(true));
    if (p.action === 'planos_list')         return jsonOut(listarPlanosPreventiva());
    if (p.action === 'planos_get')          return jsonOut(carregarPlanoPreventiva(p.modelo));
    return jsonOut({ ok: false, error: 'GET action desconhecida: ' + p.action });
  } catch(err) {
    return jsonOut({ ok: false, error: err.toString() });
  }
}

function doPost(e) {
  if (!e || !e.postData) return jsonOut({ ok: false, error: 'POST sem dados' });
  try {
    var d = JSON.parse(e.postData.contents);
    var usuario = d.usuario || '';
    if (d.action === 'append')              return jsonOut(appendRow(d.sheet, d.row, usuario, d.idempotencyKey));
    if (d.action === 'update')              return jsonOut(updateRow(d.sheet, d.id, d.idCol, d.row, usuario));
    if (d.action === 'delete')              return jsonOut(deleteRow(d.sheet, d.id, d.idCol, usuario));
    if (d.action === 'importarTodos')       return jsonOut(importarTodos(d.payload));
    if (d.action === 'uploadFoto')          return jsonOut(uploadFoto(d.numero, d.fileName, d.mimeType, d.base64));
    if (d.action === 'appendBatch')         return jsonOut(appendBatch(d.sheet, d.rows, usuario));
    if (d.action === 'salvarRACR')          return jsonOut(salvarRACR(d.racr));
    if (d.action === 'encerrarRACR')        return jsonOut(encerrarRACR(d.id, usuario));
    if (d.action === 'addOrdemCompra')      return jsonOut(addOrdemCompra(d.dados));
    if (d.action === 'salvarManualSenha')   return jsonOut(salvarManualSenha(d.dados, usuario));
    if (d.action === 'login')               return jsonOut(verificarLogin(d.login, d.senha));
    if (d.action === 'trocarSenha')         return jsonOut(trocarSenha(d.login, d.novaSenha));
    if (d.action === 'gerarPreventivasManual') return jsonOut(gerarPreventivasAutomaticas(false));
    return jsonOut({ ok: false, error: 'POST action desconhecida: ' + d.action });
  } catch(err) {
    return jsonOut({ ok: false, error: err.toString() });
  }
}

function getSheet(key) {
  var ss   = getSS_();
  var name = SHEET_NAMES[key] || key;
  var sh   = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); }
  if (sh.getLastRow() === 0 && SCHEMAS[name]) {
    var cols = SCHEMAS[name];
    sh.getRange(1, 1, 1, cols.length).setValues([cols]);
    formatHeader(sh, cols.length);
  }
  return sh;
}

function formatHeader(sh, ncols) {
  var r = sh.getRange(1, 1, 1, ncols);
  r.setBackground('#C41230').setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(10);
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, ncols);
}

function sheetToObjects(sh) {
  if (sh.getLastRow() < 2) return [];
  var data    = sh.getDataRange().getValues();
  var headers = data[0];
  return data.slice(1).filter(function(row) {
    return row.some(function(c) { return c !== ''; });
  }).map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) {
      var val = row[i];
      if (val instanceof Date) {
        var y  = val.getFullYear();
        var mo = String(val.getMonth() + 1).padStart(2, '0');
        var d  = String(val.getDate()).padStart(2, '0');
        var hr = String(val.getHours()).padStart(2, '0');
        var mi = String(val.getMinutes()).padStart(2, '0');
        if (y === 1899 || y === 1900) {
          val = hr + ':' + mi;
        } else {
          val = y + '-' + mo + '-' + d;
        }
      }
      obj[h] = val;
    });
    return obj;
  });
}

function readSheet(key) {
  var arr = sheetToObjects(getSheet(key));
  if (key === 'usuarios') return sanitizarUsuarios(arr);
  return arr;
}

function readAll() {
  var r = {};
  Object.keys(SHEET_NAMES).forEach(function(k) {
    if (SKIP_READ_ALL.indexOf(k) >= 0) {
      r[k] = [];
      return;
    }
    try {
      r[k] = sheetToObjects(getSheet(k));
      if (k === 'usuarios') r[k] = sanitizarUsuarios(r[k]);
    } catch(e) {
      r[k] = [];
      Logger.log('Erro ao ler ' + k + ': ' + e);
    }
  });
  return r;
}

// Senha_Hash NUNCA sai pro cliente, hasheada ou não — login e troca de senha
// são inteiramente server-side (verificarLogin/trocarSenha). No lugar, expõe
// só um booleano (MudarSenha) que a UI usa pra forçar a tela de troca —
// não é segredo, não ajuda um atacante a autenticar.
function sanitizarUsuarios(arr) {
  return arr.map(function(r) {
    var copia = {};
    Object.keys(r).forEach(function(k) { if (k !== 'Senha_Hash') copia[k] = r[k]; });
    copia.MudarSenha = (r.Senha_Hash === 'mudar123');
    return copia;
  });
}

function idRefDe(rowObj) {
  return rowObj.OS_Numero || rowObj.PL_Numero || rowObj.SOL_Numero ||
         rowObj.ID_Maquina || rowObj.ID || rowObj.Nome || '';
}

var NUMERO_COLS = {
  ordens:       'OS_Numero',
  planejadas:   'PL_Numero',
  solicitacoes: 'SOL_Numero'
};

// Verifica se já existe uma linha recente (últimos `minutos`) com a mesma
// Idempotency_Key nesta aba — usado por addOrdemCompra e salvarRACR, que
// geram ID por timestamp e não têm outra forma de detectar duplicata.
// IMPORTANTE: chamar só de DENTRO de um comLock() já ativo (esta função
// não abre lock própria — ver uso nos dois lugares que a chamam).
// Só olha as últimas ~50 linhas: appendRow sempre grava no fim, então
// qualquer duplicata dentro da janela de minutos está entre as mais
// recentes — evita reler a aba inteira a cada gravação.
function achouIdempotencyKeyRecente(sh, headers, idempotencyKey, minutos) {
  if (!idempotencyKey) return null;
  var keyIdx = headers.indexOf('Idempotency_Key');
  if (keyIdx < 0) return null; // coluna Idempotency_Key não existe nesta aba — checagem ignorada
  var idIdx     = headers.indexOf('ID');
  var totalRows = sh.getLastRow() - 1;
  if (totalRows < 1) return null;
  var scanRows = Math.min(totalRows, 50);
  var startRow = sh.getLastRow() - scanRows + 1;
  var corpo    = sh.getRange(startRow, 1, scanRows, headers.length).getValues();
  var dataIdx  = headers.indexOf('Data_Solicitacao');
  if (dataIdx < 0) dataIdx = headers.indexOf('Data_Criacao');
  if (dataIdx < 0) dataIdx = headers.indexOf('Criado_Em'); // salas/maquinas/usuarios/preventiva/historico usam esse nome
  var limite = new Date(Date.now() - minutos * 60 * 1000);
  for (var i = corpo.length - 1; i >= 0; i--) {
    if (String(corpo[i][keyIdx]) === String(idempotencyKey)) {
      if (dataIdx >= 0) {
        var dt = new Date(corpo[i][dataIdx]);
        if (!isNaN(dt.getTime()) && dt < limite) continue; // chave expirada, não conta
      }
      return { id: corpo[i][idIdx] };
    }
  }
  return null;
}

// idempotencyKey (opcional): protege contra o mesmo append ser reenviado
// duas vezes (retry da fila offline do core.js depois de um timeout em que
// o servidor já tinha terminado de gravar da primeira vez). Só tem efeito
// em abas com coluna Idempotency_Key (ver SCHEMAS);
// nas demais, achouIdempotencyKeyRecente() no-opa e o comportamento é o de
// sempre. Isso NÃO substitui a checagem de NUMERO_DUPLICADO (que já cobre
// ordens/planejadas/solicitacoes) — cobre os demais sheets (salas, maquinas,
// usuarios, preventiva, historico), que não tinham proteção nenhuma.
function appendRow(key, rowObj, usuario, idempotencyKey) {
  var erro = validarObrigatorios(key, rowObj, false);
  if (erro) {
    logGravacao(usuario, 'append', key, idRefDe(rowObj), 'falha', erro);
    return { ok: false, error: erro };
  }
  var resultado = comLock(function() {
    var sh      = getSheet(key);
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];

    if (idempotencyKey) {
      var existente = achouIdempotencyKeyRecente(sh, headers, idempotencyKey, 60);
      if (existente) return { ok: true, sheet: key, duplicataEvitada: true };
    }

    var numCol = NUMERO_COLS[key];
    if (numCol) {
      var numColIdx = headers.indexOf(numCol);
      var numVal    = rowObj[numCol];
      if (numColIdx >= 0 && numVal && sh.getLastRow() > 1) {
        var coluna = sh.getRange(2, numColIdx + 1, sh.getLastRow() - 1, 1).getValues();
        for (var i = 0; i < coluna.length; i++) {
          if (String(coluna[i][0]) === String(numVal)) {
            return { ok: false, error: 'NUMERO_DUPLICADO', numeroConflito: numVal };
          }
        }
      }
    }

    var row = headers.map(function(h) {
      if (h === 'Idempotency_Key') return idempotencyKey || '';
      return rowObj[h] !== undefined ? rowObj[h] : '';
    });
    sh.appendRow(row);
    return { ok: true, sheet: key };
  });
  logGravacao(usuario, 'append', key, idRefDe(rowObj), resultado.ok ? 'sucesso' : 'falha', resultado.error || '');
  return resultado;
}

// Gera o próximo número (prefixo + 4 dígitos) e grava a linha. SEM lock próprio:
// só chamar de dentro de um lock já ativo (hoje, só o lock dedicado de
// gerarPreventivasAutomaticas).
function appendComNumero_(key, coluna, prefixo, rowObj) {
  var sh      = getSheet(key);
  var data    = sh.getDataRange().getValues();
  var headers = data[0];
  var colIdx  = headers.indexOf(coluna);
  if (colIdx < 0) return { ok: false, error: 'Coluna não encontrada: ' + coluna };

  var max = 0;
  for (var i = 1; i < data.length; i++) {
    var v = String(data[i][colIdx] || '');
    if (v.indexOf(prefixo) === 0) {
      var n = parseInt(v.substring(prefixo.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  var numero = prefixo + String(max + 1).padStart(4, '0');
  rowObj[coluna] = numero;

  var erro = validarObrigatorios(key, rowObj, false);
  if (erro) return { ok: false, error: erro };

  var row = headers.map(function(h) { return rowObj[h] !== undefined ? rowObj[h] : ''; });
  sh.appendRow(row);
  return { ok: true, sheet: key, numero: numero };
}

function appendBatch(key, rowsObj, usuario) {
  if (!rowsObj || !rowsObj.length) return { ok: true, sheet: key, count: 0 };
  var resultado = comLock(function() {
    var sh      = getSheet(key);
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var rows    = rowsObj.map(function(rowObj) {
      return headers.map(function(h) {
        return rowObj[h] !== undefined ? rowObj[h] : '';
      });
    });
    var lastRow = sh.getLastRow();
    sh.getRange(lastRow + 1, 1, rows.length, headers.length).setValues(rows);
    return { ok: true, sheet: key, count: rows.length };
  });
  logGravacao(usuario, 'appendBatch', key, '', resultado.ok ? 'sucesso' : 'falha', resultado.error || ('' + (resultado.count || 0) + ' linha(s)'));
  return resultado;
}

function updateRow(key, id, idCol, newData, usuario) {
  var erro = validarObrigatorios(key, newData, true);
  if (erro) {
    logGravacao(usuario, 'update', key, id, 'falha', erro);
    return { ok: false, error: erro };
  }
  var resultado = comLock(function() {
    var sh      = getSheet(key);
    var data    = sh.getDataRange().getValues();
    var headers = data[0];
    var idIdx   = headers.indexOf(idCol);
    if (idIdx < 0) return { ok: false, error: 'Coluna não encontrada: ' + idCol };
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idIdx]) === String(id)) {
        var row = headers.map(function(h, j) {
          return newData[h] !== undefined ? newData[h] : data[i][j];
        });
        sh.getRange(i + 1, 1, 1, headers.length).setValues([row]);
        return { ok: true };
      }
    }
    return { ok: false, error: 'Não encontrado: ' + id };
  });
  logGravacao(usuario, 'update', key, id, resultado.ok ? 'sucesso' : 'falha', resultado.error || '');
  return resultado;
}

function deleteRow(key, id, idCol, usuario) {
  var resultado = comLock(function() {
    var sh    = getSheet(key);
    var data  = sh.getDataRange().getValues();
    var idIdx = data[0].indexOf(idCol);
    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][idIdx]) === String(id)) {
        sh.deleteRow(i + 1);
        return { ok: true };
      }
    }
    return { ok: false, error: 'Não encontrado: ' + id };
  });
  logGravacao(usuario, 'delete', key, id, resultado.ok ? 'sucesso' : 'falha', resultado.error || '');
  return resultado;
}

// ══════════════════════════════════════════════════════════════════════
// LOGIN — validação de senha 100% server-side. Senha_Hash nunca sai
// daqui: o cliente manda login+senha em texto (protegido pelo HTTPS do
// Apps Script) e recebe de volta só o usuário (sem senha) + ok/erro.
// Mesmo algoritmo de hash que já existia no cliente (sha256("sigman:"+
// login+":"+senha), prefixo "h1:"), só que agora roda aqui.
// ══════════════════════════════════════════════════════════════════════
function hashSenha_(login, senha) {
  var msg = 'sigman:' + String(login).toLowerCase() + ':' + senha;
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, msg, Utilities.Charset.UTF_8);
  var hex = bytes.map(function(b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
  return 'h1:' + hex;
}

function verificarLogin(login, senha) {
  if (!login || !senha) return { ok: false, error: 'Usuário ou senha incorretos.' };
  login = String(login).trim();

  var sh      = getSheet('usuarios');
  var data    = sh.getDataRange().getValues();
  var headers = data[0];
  var loginIdx = headers.indexOf('Login');
  var senhaIdx = headers.indexOf('Senha_Hash');
  var nomeIdx  = headers.indexOf('Nome');
  var cargoIdx = headers.indexOf('Cargo');
  var tipoIdx  = headers.indexOf('Tipo_Acesso');
  var ativoIdx = headers.indexOf('Ativo');
  if (loginIdx < 0 || senhaIdx < 0) {
    return { ok: false, error: 'Configuração inválida: colunas Login/Senha_Hash ausentes.' };
  }

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][loginIdx]).toLowerCase() !== login.toLowerCase()) continue;

    var stored = String(data[i][senhaIdx] || '');
    var ok = false;

    if (stored.indexOf('h1:') === 0) {
      ok = (hashSenha_(login, senha) === stored);
    } else {
      // Ainda em texto puro (inclui o sentinela 'mudar123'). Compara direto
      // e migra pra hash — exceto quando é o sentinela, porque aí quem
      // grava o hash definitivo é a troca obrigatória de senha (trocarSenha).
      ok = (stored === senha);
      if (ok && stored !== 'mudar123') {
        var novoHash = hashSenha_(login, senha);
        var rowFixa = i + 1, colFixa = senhaIdx + 1;
        comLock(function() { sh.getRange(rowFixa, colFixa).setValue(novoHash); });
      }
    }

    if (!ok) return { ok: false, error: 'Usuário ou senha incorretos.' };

    var ativo = ativoIdx >= 0 ? ativoSim_(data[i][ativoIdx]) : true;
    if (!ativo) return { ok: false, error: 'Usuário desativado. Fale com a Administração.' };

    var user = {
      login: data[i][loginIdx],
      nome:  nomeIdx  >= 0 ? data[i][nomeIdx]  : '',
      cargo: cargoIdx >= 0 ? data[i][cargoIdx] : '',
      tipo:  tipoIdx  >= 0 ? data[i][tipoIdx]  : '',
      ativo: true
    };
    return { ok: true, user: user, mustChangePassword: (stored === 'mudar123') };
  }

  return { ok: false, error: 'Usuário ou senha incorretos.' };
}

function trocarSenha(login, novaSenha) {
  if (!login || !novaSenha || String(novaSenha).length < 4) {
    return { ok: false, error: 'Senha inválida (mínimo 4 caracteres).' };
  }
  if (novaSenha === 'mudar123') {
    return { ok: false, error: 'Escolha uma senha diferente de "mudar123".' };
  }
  return comLock(function() {
    var sh       = getSheet('usuarios');
    var data     = sh.getDataRange().getValues();
    var headers  = data[0];
    var loginIdx = headers.indexOf('Login');
    var senhaIdx = headers.indexOf('Senha_Hash');
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][loginIdx]).toLowerCase() === String(login).toLowerCase()) {
        sh.getRange(i + 1, senhaIdx + 1).setValue(hashSenha_(login, novaSenha));
        return { ok: true };
      }
    }
    return { ok: false, error: 'Usuário não encontrado.' };
  });
}

function addOrdemCompra(dados) {
  var resultado;
  try {
    resultado = comLock(function() {
      var sh      = getSheet('compras');
      var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];

      var existente = achouIdempotencyKeyRecente(sh, headers, dados.idempotencyKey, 10);
      if (existente) {
        return { ok: true, sheet: 'compras', id: existente.id, duplicado: true };
      }

      var now = new Date().toISOString();
      var linha = {
        ID:                  'OC_' + Date.now(),
        Data_Solicitacao:    now,
        Solicitante:         dados.solicitante    || '',
        Sala:                dados.sala           || '',
        Maquina:             dados.maquina        || '',
        Tipo_Acao:           dados.tipoAcao       || '',
        Prioridade:          dados.prioridade     || 2,
        Descricao:           dados.descricao      || '',
        Quantidade:          dados.quantidade     || '',
        Fornecedor_Sugerido: dados.fornecedor     || '',
        Acao_Preventiva:     dados.acaoPreventiva || '',
        Fotos:               JSON.stringify(dados.fotos || []),
        Status:              'em_andamento',
        Data_Etapa1:         now,
        Observacoes:         dados.observacoes    || '',
        Idempotency_Key:     dados.idempotencyKey || ''
      };

      var erro = validarObrigatorios('compras', linha, false);
      if (erro) return { ok: false, error: erro };

      // Colunas não citadas em `linha` (Data_Etapa2, Obs_EtapaN, etc.)
      // saem como '' automaticamente — mesmo padrão do appendRow().
      var row = headers.map(function(h) { return linha[h] !== undefined ? linha[h] : ''; });
      sh.appendRow(row);
      return { ok: true, sheet: 'compras', id: linha.ID };
    });
  } catch(e) {
    resultado = { ok: false, error: e.toString() };
  }
  logGravacao(
    dados.solicitante || '', 'addOrdemCompra', 'compras',
    (resultado && resultado.id) || '',
    (resultado && resultado.ok) ? 'sucesso' : 'falha',
    (resultado && resultado.error) || (resultado && resultado.duplicado ? 'idempotente (duplicata evitada)' : '')
  );
  return resultado;
}

// Upsert por ID, tudo dentro de UM comLock (achar → atualizar, ou criar).
// O ID é sempre gerado no CLIENTE (manuais-senhas.js) e reaproveitado em
// qualquer retry do mesmo registro: se a 1ª tentativa gravou no servidor mas
// o cliente achou que deu timeout, o retry encontra o ID e só atualiza.
function salvarManualSenha(dados, usuario) {
  if (!dados || !dados.sala || !dados.equipamento) {
    return { ok: false, error: 'Sala e Equipamento são obrigatórios.' };
  }
  if (!dados.id) {
    return { ok: false, error: 'ID obrigatório (gerado no cliente) — atualize manuais-senhas.js.' };
  }
  var now = new Date().toISOString();
  var linha = {
    ID: dados.id,
    Sala: dados.sala, Equipamento: dados.equipamento,
    Manual_URL: dados.manualUrl || '',
    Credenciais: JSON.stringify(dados.credenciais || []),
    Atualizado_Por: usuario || '', Atualizado_Em: now
  };
  var erro = validarObrigatorios('manuaisSenhas', linha, false);
  if (erro) {
    logGravacao(usuario, 'salvarManualSenha', 'manuaisSenhas', dados.id, 'falha', erro);
    return { ok: false, error: erro };
  }

  var resultado = comLock(function() {
    var sh      = getSheet('manuaisSenhas');
    var data    = sh.getDataRange().getValues();
    var headers = data[0];
    var idIdx   = headers.indexOf('ID');
    if (idIdx < 0) return { ok: false, error: 'Coluna não encontrada: ID' };

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idIdx]) === String(dados.id)) {
        var atualizada = headers.map(function(h, j) {
          return linha[h] !== undefined ? linha[h] : data[i][j];
        });
        sh.getRange(i + 1, 1, 1, headers.length).setValues([atualizada]);
        return { ok: true, id: dados.id };
      }
    }
    var nova = headers.map(function(h) { return linha[h] !== undefined ? linha[h] : ''; });
    sh.appendRow(nova);
    return { ok: true, id: dados.id };
  });
  logGravacao(usuario, 'salvarManualSenha', 'manuaisSenhas', dados.id, resultado.ok ? 'sucesso' : 'falha', resultado.error || '');
  return resultado;
}

function salvarRACR(racrObj) {
  var resultado;
  try {
    resultado = comLock(function() {
      var sh      = getSheet('racs');
      var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];

      var existente = achouIdempotencyKeyRecente(sh, headers, racrObj.idempotencyKey, 10);
      if (existente) {
        return { ok: true, id: existente.id, msg: 'RACR salvo com sucesso', duplicado: true };
      }

      var now = new Date().toISOString();
      var novaLinha = {
        ID: 'RACR_' + Date.now(),
        Data_Abertura:    racrObj.data          || now.split('T')[0],
        OS_Numero:        racrObj.osNumero       || '',
        Equipamento:      racrObj.equipamento    || '',
        Sala:             racrObj.sala           || '',
        Criticidade:      racrObj.criticidade    || '',
        Tempo_Parada_Min: racrObj.tempoParada    || 0,
        Limite_Min:       racrObj.limiteMin      || 0,
        Falha:            racrObj.falha          || '',
        Causa_Raiz:       racrObj.causa          || '',
        Why1: racrObj.why1 || '', Why2: racrObj.why2 || '',
        Why3: racrObj.why3 || '', Why4: racrObj.why4 || '', Why5: racrObj.why5 || '',
        Acao_Imediata:    racrObj.acaoImediata   || '',
        Acao_Preventiva:  racrObj.acaoPreventiva || '',
        Resp_Producao:    racrObj.respProd       || '',
        Resp_Manutencao:  racrObj.respManu       || '',
        Executantes:      racrObj.executantes    || '',
        Fotos:            JSON.stringify(racrObj.fotos || []),
        Status: 'Aberto', Data_Fechamento: '', Fechado_Por: '',
        Usuario_Criacao:  racrObj.usuario        || 'Sistema',
        Data_Criacao:     now,
        Idempotency_Key:  racrObj.idempotencyKey || ''
      };

      var erro = validarObrigatorios('racs', novaLinha, false);
      if (erro) return { ok: false, error: erro };

      var row = headers.map(function(h) { return novaLinha[h] !== undefined ? novaLinha[h] : ''; });
      sh.appendRow(row);
      return { ok: true, id: novaLinha.ID, msg: 'RACR salvo com sucesso' };
    });
  } catch(e) {
    resultado = { ok: false, error: e.toString() };
  }
  logGravacao(
    (racrObj && racrObj.usuario) || '', 'salvarRACR', 'racs',
    (resultado && resultado.id) || '',
    (resultado && resultado.ok) ? 'sucesso' : 'falha',
    (resultado && resultado.error) || (resultado && resultado.duplicado ? 'idempotente (duplicata evitada)' : '')
  );
  return resultado;
}

function encerrarRACR(id, usuario) {
  var resultado = comLock(function() {
    var sh      = getSheet('racs');
    var data    = sh.getDataRange().getValues();
    var headers = data[0];
    var idIdx   = headers.indexOf('ID');
    var stIdx   = headers.indexOf('Status');
    var dtIdx   = headers.indexOf('Data_Fechamento');
    var fechIdx = headers.indexOf('Fechado_Por');
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idIdx]) === String(id)) {
        sh.getRange(i + 1, stIdx   + 1).setValue('Fechado');
        sh.getRange(i + 1, dtIdx   + 1).setValue(new Date().toISOString());
        sh.getRange(i + 1, fechIdx + 1).setValue(usuario || 'Sistema');
        return { ok: true, msg: 'RACR fechado' };
      }
    }
    return { ok: false, error: 'RACR não encontrado: ' + id };
  });
  logGravacao(usuario || '', 'encerrarRACR', 'racs', id, resultado.ok ? 'sucesso' : 'falha', resultado.error || '');
  return resultado;
}

function importarTodos(payload) {
  var log = [];
  var now = new Date().toISOString();

  if (payload.salas && payload.salas.length) {
    var shSalas    = getSheet('salas');
    var existSalas = sheetToObjects(shSalas).map(function(r) { return r.Nome; });
    payload.salas.forEach(function(nome) {
      if (existSalas.indexOf(nome) >= 0) return;
      var id = nome.toUpperCase().replace(/\s+/g, '_');
      appendRow('salas', { ID_Sala:id, Nome:nome, Descricao:'', Ativo:'sim', Criado_Em:now }, 'Importação');
    });
    log.push('Salas: ' + payload.salas.length);
  }

  if (payload.maquinas && payload.maquinas.length) {
    var shMaq    = getSheet('maquinas');
    var existMaq = sheetToObjects(shMaq).map(function(r) { return r.Nome + '|' + r.Sala; });
    payload.maquinas.forEach(function(m) {
      if (existMaq.indexOf(m.nome + '|' + m.sala) >= 0) return;
      var id = (m.sala + '_' + m.nome).toUpperCase().replace(/\s+/g, '_');
      appendRow('maquinas', {
        ID_Maquina: id, Sala: m.sala, Nome: m.nome, Tag: m.tag || '',
        Criticidade: m.criticidade || 'Média',
        Periodicidade_Preventiva: m.periodicidade || 'Mensal',
        Descricao: '', Ativo: 'sim', Criado_Em: now
      }, 'Importação');
    });
    log.push('Máquinas: ' + payload.maquinas.length);
  }

  var shCfg    = getSheet('configuracoes');
  var existCfg = sheetToObjects(shCfg).map(function(r) { return r.Chave; });
  var cfgs = [
    ['horas_turno_1',        '10',            'Horas do 1º Turno'],
    ['horas_turno_2',        '10',            'Horas do 2º Turno'],
    ['horas_turno_3',        '10',            'Horas do 3º Turno'],
    ['meta_disponibilidade', '85',            'Meta Disponibilidade OEE (%)'],
    ['meta_performance',     '90',            'Meta Performance OEE (%)'],
    ['meta_qualidade',       '99',            'Meta Qualidade OEE (%)'],
    ['empresa',              'Muffato Foods', 'Nome da empresa'],
    ['unidade',              'Pato Branco - PR', 'Unidade']
  ];
  cfgs.forEach(function(cfg) {
    if (existCfg.indexOf(cfg[0]) >= 0) return;
    appendRow('configuracoes', { Chave:cfg[0], Valor:cfg[1], Descricao:cfg[2], Atualizado_Em:now }, 'Importação');
  });
  log.push('Configurações verificadas');

  Logger.log('Importação: ' + log.join(', '));
  return { ok: true, log: log };
}

function uploadFoto(numero, fileName, mimeType, base64) {
  try {
    var rootFolder    = DriveApp.getRootFolder();
    var sigmanFolders = rootFolder.getFoldersByName('sigman');
    var sigmanFolder  = sigmanFolders.hasNext()
      ? sigmanFolders.next()
      : rootFolder.createFolder('sigman');

    var subName    = numero || 'SEM_NUMERO';
    var subFolders = sigmanFolder.getFoldersByName(subName);
    var subFolder  = subFolders.hasNext()
      ? subFolders.next()
      : sigmanFolder.createFolder(subName);

    var decoded;
    try {
      decoded = Utilities.base64Decode(base64);
    } catch(e) {
      return { ok: false, error: 'Arquivo corrompido: ' + e.message };
    }

    var blob = Utilities.newBlob(decoded, mimeType || 'image/jpeg', fileName || (numero + '.jpg'));
    var file = subFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    var fileId  = file.getId();
    var fileUrl = 'https://drive.google.com/file/d/' + fileId + '/view';
    Logger.log('Foto salva: ' + fileUrl);
    return { ok: true, fileId: fileId, fileUrl: fileUrl };
  } catch(e) {
    Logger.log('Erro uploadFoto: ' + e.toString());
    return { ok: false, error: e.toString() };
  }
}

function getOrCreateBackupFolder() {
  var root = DriveApp.getRootFolder();
  var it   = root.getFoldersByName('sigman_backups');
  return it.hasNext() ? it.next() : root.createFolder('sigman_backups');
}

function limparBackupsAntigos(pasta, manterDias) {
  var limite   = new Date(Date.now() - manterDias * 24 * 60 * 60 * 1000);
  var arquivos = pasta.getFiles();
  while (arquivos.hasNext()) {
    var f = arquivos.next();
    if (f.getDateCreated() < limite) f.setTrashed(true);
  }
}

function backupDiario() {
  try {
    var arquivoOriginal = DriveApp.getFileById(SHEET_ID);
    var pastaBackup     = getOrCreateBackupFolder();
    var nomeBackup = 'SIGMAN_backup_' +
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HHmm');
    arquivoOriginal.makeCopy(nomeBackup, pastaBackup);
    limparBackupsAntigos(pastaBackup, 15);
    limparLogAntigo(90);
    Logger.log('✅ Backup criado: ' + nomeBackup);
  } catch(e) {
    Logger.log('❌ Erro no backup diário: ' + e.toString());
  }
}

function limparLogAntigo(dias) {
  dias = dias || 90;
  try {
    var sh = getSheet('LogFila');
    var data = sh.getDataRange().getValues();
    if (data.length < 2) { Logger.log('⏭ LogFila vazio, nada a limpar.'); return; }
    var limite = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
    var manter = [data[0]];
    var removidas = 0;
    for (var i = 1; i < data.length; i++) {
      var dh = new Date(data[i][0]);
      if (isNaN(dh.getTime()) || dh >= limite) {
        manter.push(data[i]);
      } else {
        removidas++;
      }
    }
    if (removidas > 0) {
      sh.clearContents();
      sh.getRange(1, 1, manter.length, manter[0].length).setValues(manter);
      formatHeader(sh, manter[0].length);
    }
    Logger.log('✅ limparLogAntigo — ' + removidas + ' linha(s) removida(s) (mais de ' + dias + ' dias).');
  } catch(e) {
    Logger.log('❌ Erro em limparLogAntigo: ' + e.toString());
  }
}

function criarTriggerBackup() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'backupDiario') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('backupDiario').timeBased().everyDays(1).atHour(3).create();
  Logger.log('✅ Trigger de backup diário criado (às 3h).');
}

const ID_PLANILHA_PLANOS = '1TP4qUd5tR5HmjtrSV6pYeveLSq0txBNtiNWUMVXVbAc';

function listarPlanosPreventiva() {
  const ss = SpreadsheetApp.openById(ID_PLANILHA_PLANOS);
  return ss.getSheets()
    .map(s => s.getName())
    .filter(nome => !nome.startsWith('_'));
}

function carregarPlanoPreventiva(nomeModelo) {
  const ss    = SpreadsheetApp.openById(ID_PLANILHA_PLANOS);
  const sheet = ss.getSheetByName(nomeModelo);
  if (!sheet) throw new Error('Modelo "' + nomeModelo + '" não encontrado.');
  const dados    = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 0), 2).getValues();
  const mecanico = dados.map(r => r[0]).filter(v => String(v).trim() !== '');
  const eletrico = dados.map(r => r[1]).filter(v => String(v).trim() !== '');
  return { mecanico, eletrico };
}

// ═══════════════════════════════════════════════════════════════════════════
// PREVENTIVA AUTOMÁTICA POR PERIODICIDADE
// ─────────────────────────────────────────────────────────────────────────
// Regra: a geração NUNCA depende de a anterior ter sido concluída. É
// calendário puro — se a periodicidade é Semanal, nasce uma preventiva nova
// toda semana, executada a anterior ou não. Por isso a referência de cálculo
// é "quando foi GERADA a última" (coluna Ultima_Preventiva_Gerada, em
// Maquinas), nunca o status da OS anterior.
//
// Como usar:
//   - GET  previewPreventivas      → dry-run: mostra o que SERIA gerado hoje,
//                                     sem gravar nada.
//   - POST gerarPreventivasManual  → gera de verdade (sem checagem de perfil
//                                     no servidor, como todo o arquivo — só
//                                     expor na tela de PCM/admin).
//   - criarTriggerPreventivas()    → rodar UMA vez no editor pra agendar o
//                                     disparo diário (5h).
//   - Pré-requisito: coluna Ultima_Preventiva_Gerada em Maquinas (já existe).
// ═══════════════════════════════════════════════════════════════════════════

var PERIODICIDADE_DIAS = {
  'Semanal':    7,
  'Mensal':     28,   // múltiplos de 7: mesmo dia da semana em todo ciclo
  'Trimestral': 91,
  'Semestral':  182,
  'Anual':      364
};

// Salas que NÃO entram na preventiva automática (decisão 01/10/2026: "não
// tratar ainda"). Comparação sem acento/caixa/espaços nas pontas.
var SALAS_FORA_PREVENTIVA = [
  'UTILIDADES', 'SECUNDARIA',
  'EFLUENTE INDUSTRIAL', 'EFLUENTES FINAIS', 'TRATAMENTO EFLUENTES'
];

function semAcento_(v) {
  return String(v === null || v === undefined ? '' : v)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function salaForaPreventiva_(sala) {
  return SALAS_FORA_PREVENTIVA.indexOf(semAcento_(sala).toUpperCase()) >= 0;
}

// Ativo: só é "inativo" quando o valor diz isso. Vazio = ativo.
function ativoSim_(v) {
  var s = semAcento_(v).toLowerCase();
  return ['nao', 'n', 'false', '0', 'inativo', 'desativado', 'off'].indexOf(s) < 0;
}

// Data da célula → Date em horário LOCAL. Texto 'yyyy-MM-dd' vira meia-noite
// local (new Date('yyyy-MM-dd') seria UTC e, no fuso -03, cairia no dia anterior).
function dataLocal_(v) {
  if (v instanceof Date) return new Date(v.getTime());
  var s = String(v === null || v === undefined ? '' : v).trim();
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return new Date(v);
}

// dryRun=true: só calcula e devolve o que SERIA gerado, sem gravar nada.
// dryRun=false: gera de verdade (cria PL em OS_Planejadas + atualiza
//               Ultima_Preventiva_Gerada em Maquinas).
//
// Lock dedicado (não usa comLock genérico): a operação real percorre todas
// as máquinas e pode levar mais que os 10s do comLock padrão. Trava a
// seção inteira — leitura de Maquinas + gravação de todas as PL + update
// da coluna — pra impedir que duas execuções concorrentes (gatilho manual
// clicado + trigger diário disparando junto, ou duplo clique) leiam o
// mesmo "ainda não gerada" e criem preventiva duplicada pra mesma máquina.
// dryRun também passa pelo lock: mais barato que criar dois caminhos, e
// evita ler Maquinas no meio de uma gravação real em andamento.
function gerarPreventivasAutomaticas(dryRun) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return { ok: false, error: 'Geração de preventivas já em andamento (outra execução segurando o lock). Tente novamente em instantes.' };
  }
  try {
    var ag = null;
    if (!dryRun) {
      ag = agendarPreventivasInterno_(false); // dá data às máquinas novas antes de gerar
      if (!ag.ok) return ag;
    }
    var res = gerarPreventivasAutomaticasInterno_(dryRun);
    if (ag && res && res.ok) res.agendadas = ag.gravadas;
    return res;
  } catch (e) {
    return { ok: false, error: e.toString() };
  } finally {
    if (!dryRun) invalidarCacheReadAll_(); // gravou em OS_Planejadas e Maquinas
    lock.releaseLock();
  }
}

function gerarPreventivasAutomaticasInterno_(dryRun) {
  var shMaq = getSheet('maquinas');
  var dataMaq = shMaq.getDataRange().getValues();
  var headers = dataMaq[0];

  var idxAtivo   = headers.indexOf('Ativo');
  var idxSala    = headers.indexOf('Sala');
  var idxNome    = headers.indexOf('Nome');
  var idxTag     = headers.indexOf('Tag');
  var idxPeriod  = headers.indexOf('Periodicidade_Preventiva');
  var idxGerada  = headers.indexOf('Ultima_Preventiva_Gerada'); // -1 se a coluna não existir

  if (idxPeriod < 0) {
    return { ok: false, error: 'Coluna Periodicidade_Preventiva não encontrada em Maquinas.' };
  }
  // Sem Ultima_Preventiva_Gerada não há referência de data: a coluna é obrigatória.
  if (idxGerada < 0) {
    return { ok: false, error: 'Coluna Ultima_Preventiva_Gerada não existe em Maquinas. Crie o cabeçalho na planilha.' };
  }

  var hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  var geradas = [];
  var semReferencia = 0; // sem data de referência: ficam de fora até o agendamento dar uma

  for (var i = 1; i < dataMaq.length; i++) {
    var linha = dataMaq[i];
    var ativo = idxAtivo >= 0 ? ativoSim_(linha[idxAtivo]) : true;
    if (!ativo) continue;

    var periodicidade = String(linha[idxPeriod] || '').trim();
    var intervaloDias = PERIODICIDADE_DIAS[periodicidade];
    if (!intervaloDias) continue; // sem periodicidade reconhecida, ignora
    if (salaForaPreventiva_(linha[idxSala])) continue; // sala fora do escopo (ver SALAS_FORA_PREVENTIVA)

    var ultimaGerada = linha[idxGerada];
    if (ultimaGerada === '' || ultimaGerada === null || ultimaGerada === undefined) { semReferencia++; continue; }
    var referencia = dataLocal_(ultimaGerada);
    if (isNaN(referencia.getTime())) { semReferencia++; continue; }
    referencia.setHours(0, 0, 0, 0);

    var proximaData = new Date(referencia.getTime() + intervaloDias * 24 * 60 * 60 * 1000);
    if (hoje < proximaData) continue; // ainda não venceu

    var sala   = linha[idxSala];
    var maquina = linha[idxNome];
    var tag    = idxTag >= 0 ? linha[idxTag] : '';

    geradas.push({
      sala: sala, maquina: maquina, tag: tag,
      periodicidade: periodicidade,
      prazoLimite: Utilities.formatDate(proximaData, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      linhaPlanilha: i + 1 // identifica a máquina pela linha, nunca pelo nome (nomes repetem entre salas)
    });
  }

  if (dryRun) {
    var itens = geradas.map(function(g) {
      return { sala: g.sala, maquina: g.maquina, tag: g.tag, periodicidade: g.periodicidade, prazoLimite: g.prazoLimite };
    });
    return { ok: true, dryRun: true, totalASerGerado: itens.length, semReferencia: semReferencia, itens: itens };
  }

  // Execução real: grava as OS_Planejadas. appendComNumero_ não abre lock
  // próprio — já estamos dentro do lock dedicado de gerarPreventivasAutomaticas.
  // Ultima_Preventiva_Gerada é gravada IMEDIATAMENTE após cada OS criada (não
  // no fim): se a execução morrer no meio (timeout, erro), o que já foi gerado
  // não é gerado de novo na rodada seguinte. Quem falhou continua "devendo" e
  // tenta de novo na próxima rodada.
  var criadas = [];
  var falhas = [];
  geradas.forEach(function(g) {
    var res = appendComNumero_('planejadas', 'PL_Numero', 'PL-', {
      Sala: g.sala,
      Maquina: g.maquina,
      Tag_Maquina: g.tag,
      Tipo: 'Preventiva',
      Prioridade: 3,
      Prazo_Limite: g.prazoLimite,
      Descricao_Planejada: 'Preventiva automática — periodicidade: ' + g.periodicidade,
      Status: 'Pendente',
      Criado_Em: new Date().toISOString()
    });
    logGravacao('Sistema (Preventiva Automática)', 'appendComNumero', 'planejadas', res.numero || (g.sala + '/' + g.maquina), res.ok ? 'sucesso' : 'falha', res.error || '');
    if (res.ok) {
      criadas.push(res.numero);
      shMaq.getRange(g.linhaPlanilha, idxGerada + 1).setValue(hoje);
    } else {
      falhas.push({ sala: g.sala, maquina: g.maquina, erro: res.error });
    }
  });

  Logger.log('✅ gerarPreventivasAutomaticas — ' + criadas.length + ' criada(s), ' + falhas.length + ' falha(s).');
  return { ok: true, dryRun: false, criadas: criadas, falhas: falhas, semReferencia: semReferencia };
}

// ═══════════════════════════════════════════════════════════════════════════
// AGENDAMENTO DAS PREVENTIVAS (1ª carga + ativos novos)
// ─────────────────────────────────────────────────────────────────────────
// Máquina SEM Ultima_Preventiva_Gerada não gera OS. Esta rotina dá a ela um
// primeiro vencimento FUTURO, em dia útil, no primeiro dia com vaga
// (AGENDAR_CAPACIDADE_DIA OS/dia, contando também a volta dos ciclos das
// máquinas já agendadas) e grava
//   Ultima_Preventiva_Gerada = vencimento − periodicidade.
// As periodicidades são múltiplos de 7: a máquina vence sempre no mesmo dia
// da semana (sem OS em fim de semana, sem drift). Atraso antigo é zerado.
// Roda sozinha no início de toda geração real (inclusive a diária das 5h),
// então ativo novo cadastrado entra na agenda no dia seguinte. À mão:
//   agendarPreventivasPreview() (não grava) / agendarPreventivasReal().
// Só mexe em máquina ativa, dentro do escopo e SEM data. Pode rodar sempre.
// ═══════════════════════════════════════════════════════════════════════════
var AGENDAR_INICIO_MIN     = '2026-10-13'; // não agenda antes desta data (yyyy-MM-dd); passou? usa o próximo dia útil
var AGENDAR_CAPACIDADE_DIA = 6;
var AGENDAR_JANELA_DIAS    = 91;           // 1º vencimento cai em até min(periodicidade, 91) dias
var AGENDAR_HORIZONTE_DIAS = 364;          // até onde a carga futura é contada
// Feriados nacionais (só afetam o 1º vencimento; ciclos seguintes repetem o dia da semana).
// Feriado local/emenda: acrescentar aqui.
var AGENDAR_FERIADOS = [
  '2026-10-12', '2026-11-02', '2026-11-20', '2026-12-25',
  '2027-01-01', '2027-03-26', '2027-04-21', '2027-09-07',
  '2027-10-12', '2027-11-02', '2027-11-15'
];

function chaveData_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function somaDias_(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function diffDias_(a, b) { // b − a, em dias de calendário
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function ehDiaUtil_(d) {
  var w = d.getDay();
  return w !== 0 && w !== 6 && AGENDAR_FERIADOS.indexOf(chaveData_(d)) < 0;
}

function inicioAgendamento_(hoje) {
  var ini = somaDias_(hoje, 1);
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(AGENDAR_INICIO_MIN);
  if (m) {
    var min = new Date(+m[1], +m[2] - 1, +m[3]);
    if (min > ini) ini = min;
  }
  while (!ehDiaUtil_(ini)) ini = somaDias_(ini, 1);
  return ini;
}

function agendarPreventivas_(dryRun) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return { ok: false, error: 'Outra execução segurando o lock. Tente novamente em instantes.' };
  }
  try {
    return agendarPreventivasInterno_(dryRun);
  } catch (e) {
    return { ok: false, error: e.toString() };
  } finally {
    if (!dryRun) invalidarCacheReadAll_();
    lock.releaseLock();
  }
}

// SEM lock próprio: chamar de dentro de um lock já ativo.
function agendarPreventivasInterno_(dryRun) {
  var cap = AGENDAR_CAPACIDADE_DIA, H = AGENDAR_HORIZONTE_DIAS;
  if (!(cap > 0)) return { ok: false, error: 'AGENDAR_CAPACIDADE_DIA inválida.' };
  var hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  var ini = inicioAgendamento_(hoje);

  var sh   = getSheet('maquinas');
  var data = sh.getDataRange().getValues();
  var h    = data[0];
  var iAtivo = h.indexOf('Ativo'), iSala = h.indexOf('Sala');
  var iPer = h.indexOf('Periodicidade_Preventiva'), iGer = h.indexOf('Ultima_Preventiva_Gerada');
  if (iPer < 0 || iGer < 0) {
    return { ok: false, error: 'Faltam colunas em Maquinas (Periodicidade_Preventiva / Ultima_Preventiva_Gerada).' };
  }

  var carga = {}; // offset de calendário (a partir de ini) → OS já agendadas, incluindo a volta dos ciclos
  var soma = function (off, dias, delta) {
    for (var o = off; o < H; o += dias) carga[o] = (carga[o] || 0) + delta;
  };
  var ordemSala = {}, nSalas = 0, novos = [];
  var cont = { foraEscopo: 0, jaTemData: 0, invalidas: 0 };

  for (var i = 1; i < data.length; i++) {
    var l = data[i];
    if (iAtivo >= 0 && !ativoSim_(l[iAtivo])) continue;
    var dias = PERIODICIDADE_DIAS[String(l[iPer] || '').trim()];
    if (!dias) continue;
    if (salaForaPreventiva_(l[iSala])) { cont.foraEscopo++; continue; }
    var g = l[iGer];
    if (g === '' || g === null || g === undefined) {
      var sala = String(l[iSala]);
      if (!(sala in ordemSala)) ordemSala[sala] = nSalas++;
      novos.push({ linha: i, sala: sala, dias: dias, ord: ordemSala[sala] });
      continue;
    }
    var ult = dataLocal_(g);
    if (isNaN(ult.getTime())) { cont.invalidas++; continue; }
    cont.jaTemData++;
    var venc = somaDias_(ult, dias);
    var atraso = diffDias_(venc, ini);
    if (atraso > 0) venc = somaDias_(venc, Math.ceil(atraso / dias) * dias);
    soma(diffDias_(ini, venc), dias, 1);
  }

  // Mais frequentes primeiro; dentro disso, por sala (técnico atende a sala toda no mesmo dia).
  novos.sort(function (a, b) { return (a.dias - b.dias) || (a.ord - b.ord) || (a.linha - b.linha); });
  var uteis = [];
  for (var d0 = 0; d0 < AGENDAR_JANELA_DIAS; d0++) if (ehDiaUtil_(somaDias_(ini, d0))) uteis.push(d0);

  var forcadas = 0;
  novos.forEach(function (it) {
    var janela = Math.min(it.dias, AGENDAR_JANELA_DIAS);
    var escolhido = -1, melhor = -1, picoMelhor = 1e9;
    for (var q = 0; q < uteis.length && uteis[q] < janela; q++) {
      var o2 = uteis[q], pico = 0;
      for (var r = o2; r < H; r += it.dias) { var c = carga[r] || 0; if (c > pico) pico = c; }
      if (pico < cap) { escolhido = o2; break; }
      if (pico < picoMelhor) { picoMelhor = pico; melhor = o2; }
    }
    if (escolhido < 0) { escolhido = melhor >= 0 ? melhor : (uteis.length ? uteis[0] : 0); forcadas++; }
    soma(escolhido, it.dias, 1);
    it.vence  = somaDias_(ini, escolhido);
    it.ultima = somaDias_(it.vence, -it.dias);
  });

  var porDia = {}, porSala = {};
  novos.forEach(function (it) {
    var c = chaveData_(it.vence);
    porDia[c] = (porDia[c] || 0) + 1;
    var ps = porSala[it.sala] || (porSala[it.sala] = { n: 0, de: c, ate: c });
    ps.n++; if (c < ps.de) ps.de = c; if (c > ps.ate) ps.ate = c;
  });
  var maxCarga = 0, diasAcimaCap = 0;
  Object.keys(carga).forEach(function (k) {
    if (carga[k] > maxCarga) maxCarga = carga[k];
    if (carga[k] > cap) diasAcimaCap++;
  });

  if (!dryRun && novos.length) {
    // Só mexe na coluna Ultima_Preventiva_Gerada; preserva o que já existe nas demais linhas.
    var rng  = sh.getRange(2, iGer + 1, data.length - 1, 1);
    var vals = rng.getValues();
    novos.forEach(function (it) { vals[it.linha - 1][0] = it.ultima; });
    rng.setValues(vals);
    rng.setNumberFormat('yyyy-mm-dd');
  }

  return {
    ok: true, dryRun: !!dryRun, inicio: chaveData_(ini), capacidadeDia: cap,
    novas: novos.length, gravadas: dryRun ? 0 : novos.length,
    jaTemData: cont.jaTemData, foraEscopo: cont.foraEscopo, datasInvalidas: cont.invalidas,
    acimaDaCapacidade: forcadas, maxCarga: maxCarga, diasAcimaCap: diasAcimaCap,
    porDia: porDia, porSala: porSala
  };
}

function agendarLog_(r) {
  if (!r.ok) { Logger.log('ERRO: ' + r.error); return; }
  Logger.log((r.dryRun ? 'PREVIEW (nada gravado)' : 'GRAVADO: ' + r.gravadas + ' linha(s)') + ' | inicio=' + r.inicio + ' cap/dia=' + r.capacidadeDia);
  Logger.log('novas=' + r.novas + ' jaTemData=' + r.jaTemData + ' foraEscopo=' + r.foraEscopo + ' datasInvalidas=' + r.datasInvalidas);
  Logger.log('acimaDaCapacidade=' + r.acimaDaCapacidade + ' maxCarga=' + r.maxCarga + ' diasAcimaCap=' + r.diasAcimaCap);
  Logger.log('porDia=' + JSON.stringify(r.porDia));
  Logger.log('porSala=' + JSON.stringify(r.porSala));
}

function agendarPreventivasPreview() { agendarLog_(agendarPreventivas_(true)); }
function agendarPreventivasReal()    { agendarLog_(agendarPreventivas_(false)); }

// Rodar UMA VEZ, manualmente, depois de validar o preview e testar
// gerarPreventivasAutomaticas(false). Agenda o disparo diário às 5h (antes do
// início do 1º turno).
function criarTriggerPreventivas() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'rodarGeracaoPreventivasDiaria') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('rodarGeracaoPreventivasDiaria').timeBased().everyDays(1).atHour(5).create();
  Logger.log('✅ Trigger de preventivas automáticas criado (diário, às 5h).');
}

function rodarGeracaoPreventivasDiaria() {
  gerarPreventivasAutomaticas(false);
}

// Igual a jsonOut, mas recebe JSON já serializado (evita parse + stringify
// de novo quando o payload vem do cache).
function jsonOutRaw_(jsonStr) {
  return ContentService
    .createTextOutput(jsonStr)
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonOut(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
