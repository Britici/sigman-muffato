// ═══════════════════════════════════════════════════════════════════════════
// SIGMAN Enterprise — Google Apps Script + RACR Backend
// Muffato Foods | PCM · OEE · TPM
// v2 — OrdensCompra com colunas Obs/Foto por etapa | readAll sem Historico
// ═══════════════════════════════════════════════════════════════════════════
// SETUP:
//   1. Cole este código no Apps Script (substitua tudo)
//   2. Coloque seu SHEET_ID na linha abaixo
//   3. Selecione "setupSheets" → ▶ Executar (UMA VEZ)
//   4. Implantar → Nova implantação → App da Web
//      Executar como: Eu | Quem acessa: Qualquer pessoa
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
  insp_rota:     'Insp_Rota',
  insp_maquina:  'Insp_Maquina',
  preventiva:    'Preventiva',
  historico:     'Historico',
  racs:          'RAC',
  compras:       'OrdensCompra'
};

// ── Sheets excluídas do readAll inicial (muito grandes / não necessárias no boot)
var SKIP_READ_ALL = ['historico'];

// ── Schemas completos de cada aba ───────────────────────────────────────────
var SCHEMAS = {
  'Salas': [
    'ID_Sala','Nome','Descricao','Ativo','Criado_Em'
  ],
  'Maquinas': [
    'ID_Maquina','Sala','Nome','Tag','Criticidade',
    'Periodicidade_Preventiva','Descricao','Ativo','Criado_Em'
  ],
  'Ordens_Executadas': [
    'OS_Numero','Data','Sala','Maquina','Tag_Maquina','Tipo','Prioridade',
    'Manutentor','Hora_Inicio','Hora_Fim','Duracao_Min','Tempo_Parada_Min',
    'Problema','Acao_Executada','Acao_Preventiva','Foto_URL','Pecas_Utilizadas',
    'Origem','OS_Origem_Ref','Criado_Em'
  ],
  'OS_Planejadas': [
    'PL_Numero','Sala','Maquina','Tag_Maquina','Tipo','Prioridade',
    'Prazo_Limite','Horas_Turno','Descricao_Planejada','Status',
    'Manutentor_Exec','Data_Execucao','Hora_Inicio','Hora_Fim',
    'Duracao_Min','Servico_Executado','Criado_Em','Concluido_Em'
  ],
  'Solicitacoes': [
    'SOL_Numero','Sala','Maquina','Tipo','Prioridade','Descricao',
    'Status','Solicitante','Manutentor_Exec','Data_Execucao',
    'Servico_Executado','Criado_Em','Concluido_Em'
  ],
  'Inspecoes_Diarias': [
    'ID_Inspecao','Data','Turno','Horas_Turno','Manutentor',
    'Sala','Equipamento','Sub_Item','Status','Hora','Observacoes','Criado_Em'
  ],
  'Usuarios': [
    'Login','Nome','Tipo_Acesso','Senha_Hash','Ativo','Criado_Em'
  ],
  'Configuracoes': [
    'Chave','Valor','Descricao','Atualizado_Em'
  ],
  'Insp_Rota': [
    'ID','Data','Turno','Manutentor','Sala','Ponto_Inspecao',
    'Item','Status','Hora','Valor_Medido','Limite_Min','Limite_Max',
    'Observacoes','Acao_Necessaria','Criado_Em'
  ],
  'Insp_Maquina': [
    'ID','Data','Maquina','Tag','Manutentor','Sistema',
    'Item_Verificado','Status','Valor_Medido','Unidade',
    'Observacoes','Acao_Necessaria','Criado_Em'
  ],
  'Preventiva': [
    'ID','Data_Execucao','Maquina','Tag','Manutentor','Periodicidade',
    'Tarefa','Status','Duracao_Min','Materiais','Observacoes','Criado_Em'
  ],
  'Historico': [
    'ID','Data_Hora','Usuario','Login','Acao','Numero_Ref','Detalhe'
  ],
  'RAC': [
    'ID','Data_Abertura','OS_Numero','Equipamento','Sala','Criticidade',
    'Tempo_Parada_Min','Limite_Min','Falha','Causa_Raiz',
    'Why1','Why2','Why3','Why4','Why5',
    'Acao_Imediata','Acao_Preventiva','Resp_Producao','Resp_Manutencao',
    'Executantes','Status','Data_Fechamento','Fechado_Por',
    'Usuario_Criacao','Data_Criacao'
  ],

  // ── OrdensCompra — schema completo com obs/foto por etapa ──────────────
  'OrdensCompra': [
    // Identificação
    'ID', 'Data_Solicitacao', 'Solicitante',
    'Sala', 'Maquina', 'Tipo_Acao', 'Prioridade',
    'Descricao', 'Quantidade', 'Fornecedor_Sugerido',
    'Acao_Preventiva', 'Fotos', 'Status',
    // Etapas — datas e campos específicos
    'Data_Etapa1',
    'Data_Etapa2', 'Orcamento_Recusado', 'Valor_Orcamento',
    'Data_Etapa3', 'Numero_RC',
    'Data_Etapa4',
    'Data_Etapa5',
    'Data_Etapa6',
    'Data_Etapa7', 'Numero_NF',
    // Observações gerais
    'Observacoes',
    // Observações por etapa (colunas individuais — Z a AE)
    'Obs_Etapa2', 'Obs_Etapa3', 'Obs_Etapa4',
    'Obs_Etapa5', 'Obs_Etapa6', 'Obs_Etapa7',
    // Fotos por etapa (colunas individuais — AF a AK)
    'Foto_Etapa2', 'Foto_Etapa3', 'Foto_Etapa4',
    'Foto_Etapa5', 'Foto_Etapa6', 'Foto_Etapa7'
  ]
};

// ═══════════════════════════════════════════════════════════════════════════
// ROTEADOR GET
// ═══════════════════════════════════════════════════════════════════════════
function doGet(e) {
  if (!e || !e.parameter) {
    return jsonOut({ ok: true, msg: 'SIGMAN API v4 online', ts: new Date().toISOString() });
  }
  try {
    var p = e.parameter;
    if (p.action === 'ping')           return jsonOut({ ok: true, ts: new Date().toISOString() });
    if (p.action === 'readAll')        return jsonOut({ ok: true, data: readAll() });
    if (p.action === 'read')           return jsonOut({ ok: true, data: readSheet(p.sheet) });
    // Leitura lazy de sheets pesadas (chamadas sob demanda pelo frontend)
    if (p.action === 'readHistorico')  return jsonOut({ ok: true, data: readSheet('historico') });
    if (p.action === 'readCompras')    return jsonOut({ ok: true, data: readSheet('compras') });
    return jsonOut({ ok: false, error: 'GET action desconhecida: ' + p.action });
  } catch(err) {
    return jsonOut({ ok: false, error: err.toString() });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ROTEADOR POST
// ═══════════════════════════════════════════════════════════════════════════
function doPost(e) {
  if (!e || !e.postData) return jsonOut({ ok: false, error: 'POST sem dados' });
  try {
    var d = JSON.parse(e.postData.contents);
    if (d.action === 'append')         return jsonOut(appendRow(d.sheet, d.row));
    if (d.action === 'update')         return jsonOut(updateRow(d.sheet, d.id, d.idCol, d.row));
    if (d.action === 'delete')         return jsonOut(deleteRow(d.sheet, d.id, d.idCol));
    if (d.action === 'importarTodos')  return jsonOut(importarTodos(d.payload));
    if (d.action === 'uploadFoto')     return jsonOut(uploadFoto(d.numero, d.fileName, d.mimeType, d.base64));
    if (d.action === 'appendBatch')    return jsonOut(appendBatch(d.sheet, d.rows));
    if (d.action === 'salvarRACR')     return jsonOut(salvarRACR(d.racr));
    if (d.action === 'encerrarRACR')   return jsonOut(encerrarRACR(d.id));
    if (d.action === 'lerRACR')        return jsonOut(readSheet('racs'));
    if (d.action === 'planos_list')    return jsonOut(encerrarRACR(d.id));
    if (d.action === 'planos_get')     return jsonOut(carregarPlanoPreventiva(e.parameter.modelo));
    if (d.action === 'addOrdemCompra') return jsonOut(addOrdemCompra(d.dados));
    return jsonOut({ ok: false, error: 'POST action desconhecida: ' + d.action });
  } catch(err) {
    return jsonOut({ ok: false, error: err.toString() });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ACESSO À PLANILHA
// ═══════════════════════════════════════════════════════════════════════════
function getSheet(key) {
  var ss   = SpreadsheetApp.openById(SHEET_ID);
  var name = SHEET_NAMES[key] || key;
  var sh   = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); }
  // Auto-cria cabeçalho se aba estiver vazia
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

function readSheet(key) { return sheetToObjects(getSheet(key)); }

// readAll otimizado — exclui sheets pesadas que não são necessárias no boot
function readAll() {
  var r = {};
  Object.keys(SHEET_NAMES).forEach(function(k) {
    if (SKIP_READ_ALL.indexOf(k) >= 0) {
      r[k] = []; // retorna vazio para não quebrar frontend que espera a chave
      return;
    }
    try {
      r[k] = sheetToObjects(getSheet(k));
    } catch(e) {
      r[k] = [];
      Logger.log('Erro ao ler ' + k + ': ' + e);
    }
  });
  return r;
}

// ═══════════════════════════════════════════════════════════════════════════
// CRUD
// ═══════════════════════════════════════════════════════════════════════════
function appendRow(key, rowObj) {
  var sh      = getSheet(key);
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var row     = headers.map(function(h) { return rowObj[h] !== undefined ? rowObj[h] : ''; });
  sh.appendRow(row);
  return { ok: true, sheet: key };
}

function appendBatch(key, rowsObj) {
  if (!rowsObj || !rowsObj.length) return { ok: true, sheet: key, count: 0 };
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
}

function updateRow(key, id, idCol, newData) {
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
}

function deleteRow(key, id, idCol) {
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
}

// ═══════════════════════════════════════════════════════════════════════════
// ORDENS DE COMPRA
// ═══════════════════════════════════════════════════════════════════════════
function addOrdemCompra(dados) {
  try {
    var now = new Date().toISOString();
    var id  = 'OC_' + Date.now();

    var linha = {
      ID:                  id,
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
      Data_Etapa2:         '',
      Orcamento_Recusado:  '',
      Valor_Orcamento:     '',
      Data_Etapa3:         '',
      Numero_RC:           '',
      Data_Etapa4:         '',
      Data_Etapa5:         '',
      Data_Etapa6:         '',
      Data_Etapa7:         '',
      Numero_NF:           '',
      Observacoes:         dados.observacoes    || '',
      // Obs e fotos por etapa — iniciam vazios
      Obs_Etapa2:  '', Obs_Etapa3:  '', Obs_Etapa4:  '',
      Obs_Etapa5:  '', Obs_Etapa6:  '', Obs_Etapa7:  '',
      Foto_Etapa2: '', Foto_Etapa3: '', Foto_Etapa4: '',
      Foto_Etapa5: '', Foto_Etapa6: '', Foto_Etapa7: ''
    };

    appendRow('compras', linha);
    return { ok: true, id: id };
  } catch(e) {
    return { ok: false, error: e.toString() };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RACR — BACKEND
// ═══════════════════════════════════════════════════════════════════════════
function salvarRACR(racrObj) {
  try {
    var now = new Date().toISOString();
    var id  = 'RACR_' + Date.now();
    var novaLinha = {
      ID:               id,
      Data_Abertura:    racrObj.data          || new Date().toISOString().split('T')[0],
      OS_Numero:        racrObj.osNumero       || '',
      Equipamento:      racrObj.equipamento    || '',
      Sala:             racrObj.sala           || '',
      Criticidade:      racrObj.criticidade    || '',
      Tempo_Parada_Min: racrObj.tempoParada    || 0,
      Limite_Min:       racrObj.limiteMin      || 0,
      Falha:            racrObj.falha          || '',
      Causa_Raiz:       racrObj.causa          || '',
      Why1:             racrObj.why1           || '',
      Why2:             racrObj.why2           || '',
      Why3:             racrObj.why3           || '',
      Why4:             racrObj.why4           || '',
      Why5:             racrObj.why5           || '',
      Acao_Imediata:    racrObj.acaoImediata   || '',
      Acao_Preventiva:  racrObj.acaoPreventiva || '',
      Resp_Producao:    racrObj.respProd       || '',
      Resp_Manutencao:  racrObj.respManu       || '',
      Executantes:      racrObj.executantes    || '',
      Status:           'Aberto',
      Data_Fechamento:  '',
      Fechado_Por:      '',
      Usuario_Criacao:  racrObj.usuario        || 'Sistema',
      Data_Criacao:     now
    };
    appendRow('racs', novaLinha);
    return { ok: true, id: id, msg: 'RACR salvo com sucesso' };
  } catch(e) {
    return { ok: false, error: e.toString() };
  }
}

function encerrarRACR(id) {
  try {
    var sh       = getSheet('racs');
    var data     = sh.getDataRange().getValues();
    var headers  = data[0];
    var idIdx    = headers.indexOf('ID');
    var stIdx    = headers.indexOf('Status');
    var dtIdx    = headers.indexOf('Data_Fechamento');
    var fechIdx  = headers.indexOf('Fechado_Por');
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idIdx]) === String(id)) {
        sh.getRange(i + 1, stIdx   + 1).setValue('Fechado');
        sh.getRange(i + 1, dtIdx   + 1).setValue(new Date().toISOString());
        sh.getRange(i + 1, fechIdx + 1).setValue('Sistema');
        return { ok: true, msg: 'RACR fechado' };
      }
    }
    return { ok: false, error: 'RACR não encontrado: ' + id };
  } catch(e) {
    return { ok: false, error: e.toString() };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// IMPORTAR DADOS DO HTML (migração inicial)
// ═══════════════════════════════════════════════════════════════════════════
function importarTodos(payload) {
  var log = [];
  var now = new Date().toISOString();

  if (payload.salas && payload.salas.length) {
    var shSalas    = getSheet('salas');
    var existSalas = sheetToObjects(shSalas).map(function(r) { return r.Nome; });
    payload.salas.forEach(function(nome) {
      if (existSalas.indexOf(nome) >= 0) return;
      var id = nome.toUpperCase().replace(/\s+/g, '_');
      appendRow('salas', { ID_Sala:id, Nome:nome, Descricao:'', Ativo:'sim', Criado_Em:now });
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
      });
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
    appendRow('configuracoes', { Chave:cfg[0], Valor:cfg[1], Descricao:cfg[2], Atualizado_Em:now });
  });
  log.push('Configurações verificadas');

  Logger.log('Importação: ' + log.join(', '));
  return { ok: true, log: log };
}

// ═══════════════════════════════════════════════════════════════════════════
// UPLOAD DE FOTO — Google Drive → pasta sigman/
// ═══════════════════════════════════════════════════════════════════════════
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

    var blob = Utilities.newBlob(
      decoded,
      mimeType || 'image/jpeg',
      fileName || (numero + '.jpg')
    );
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

// ═══════════════════════════════════════════════════════════════════════════
// SETUP — cria/atualiza todas as abas com cabeçalho e formatação
// ═══════════════════════════════════════════════════════════════════════════
function setupSheets() {
  var ss = SpreadsheetApp.openById(SHEET_ID);

  Object.keys(SCHEMAS).forEach(function(name) {
    var cols = SCHEMAS[name];
    var sh   = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.clearContents();
    sh.getRange(1, 1, 1, cols.length).setValues([cols]);
    formatHeader(sh, cols.length);
    Logger.log('✅ ' + name + ' — ' + cols.length + ' colunas');
  });

  var ordem = [
    'Ordens_Executadas','OS_Planejadas','Solicitacoes',
    'Inspecoes_Diarias','Insp_Rota','Insp_Maquina','Preventiva',
    'RAC','OrdensCompra','Salas','Maquinas','Usuarios','Configuracoes','Historico'
  ];
  ordem.forEach(function(name, pos) {
    var sh = ss.getSheetByName(name);
    if (sh) { ss.setActiveSheet(sh); ss.moveActiveSheet(pos + 1); }
  });

  Logger.log('✅ SETUP COMPLETO! Abas: ' + Object.keys(SCHEMAS).length);
}

// ═══════════════════════════════════════════════════════════════════════════
// SETUP COMPRAS — adiciona as novas colunas na aba OrdensCompra existente
// SEM apagar os dados. Execute UMA VEZ após atualizar o script.
// ═══════════════════════════════════════════════════════════════════════════
function setupComprasNovasColunas() {
  var ss      = SpreadsheetApp.openById(SHEET_ID);
  var sh      = ss.getSheetByName('OrdensCompra');
  if (!sh) { Logger.log('❌ Aba OrdensCompra não encontrada'); return; }

  var headers     = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var novasCols   = [
    'Obs_Etapa2','Obs_Etapa3','Obs_Etapa4','Obs_Etapa5','Obs_Etapa6','Obs_Etapa7',
    'Foto_Etapa2','Foto_Etapa3','Foto_Etapa4','Foto_Etapa5','Foto_Etapa6','Foto_Etapa7'
  ];
  var adicionadas = 0;

  novasCols.forEach(function(col) {
    if (headers.indexOf(col) >= 0) {
      Logger.log('⏭ ' + col + ' já existe');
      return;
    }
    var nextCol = sh.getLastColumn() + 1;
    sh.getRange(1, nextCol).setValue(col);
    // Formata o header da nova coluna
    var cell = sh.getRange(1, nextCol);
    cell.setBackground('#C41230').setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(10);
    sh.autoResizeColumn(nextCol);
    Logger.log('✅ Coluna adicionada: ' + col + ' (col ' + nextCol + ')');
    adicionadas++;
  });

  Logger.log('✅ setupComprasNovasColunas concluído — ' + adicionadas + ' coluna(s) nova(s) adicionada(s)');
}

// ═══════════════════════════════════════════════════════════════════════════
// INSPEÇÕES
// ═══════════════════════════════════════════════════════════════════════════
 
const ID_PLANILHA_PLANOS = '1TP4qUd5tR5HmjtrSV6pYeveLSq0txBNtiNWUMVXVbAc'; // da URL: /d/ESTE_ID/edit
 
function listarPlanosPreventiva() {
  const ss = SpreadsheetApp.openById(ID_PLANILHA_PLANOS);
  return ss.getSheets()
    .map(s => s.getName())
    .filter(nome => !nome.startsWith('_')); // aba "_instrucoes" etc fica de fora
}
 
function carregarPlanoPreventiva(nomeModelo) {
  const ss = SpreadsheetApp.openById(ID_PLANILHA_PLANOS);
  const sheet = ss.getSheetByName(nomeModelo);
  if (!sheet) throw new Error('Modelo "' + nomeModelo + '" não encontrado.');
 
  const dados = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 0), 2).getValues(); // pula header, colunas A e B
  const mecanico = dados.map(r => r[0]).filter(v => String(v).trim() !== '');
  const eletrico = dados.map(r => r[1]).filter(v => String(v).trim() !== '');
  return { mecanico, eletrico };
}
 

// ═══════════════════════════════════════════════════════════════════════════
// UTILITÁRIOS
// ═══════════════════════════════════════════════════════════════════════════
function jsonOut(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}