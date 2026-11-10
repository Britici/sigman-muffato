// ═══════════════════════════════════════════════════════════════════════════
// SIGMAN Enterprise — Google Apps Script + RACR Backend
// Muffato Foods | PCM · OEE · TPM
// Arquivo ÚNICO compartilhado por sigman-muffato e sigprod-muffato (colado
// direto no editor do Apps Script; cópias de Code.gs no GitHub não valem).
//
// v18 — Baixa no servidor, folha impressa, checklist do PM e importador dos modelos.
//   • concluirOS (POST): única porta para concluir planejada/solicitação. Sob lock: valida, gera o número da OS no
//     servidor, grava Ordens_Executadas e fecha a origem. Recusa baixa duplicada (JA_CONCLUIDA), data futura,
//     parada > duração, hora fim < início sem confirmação de meia-noite e manutentor fora do cadastro.
//     Baixado_Por (sessão) fica separado de Manutentor (quem executou).
//   • Reenvio da fila offline (offline:true) de uma O.S. que outra pessoa já concluiu NÃO é descartado:
//     vira OS COMPLEMENTAR (número novo, mesma origem, texto "[Complementar à PL-0001 …]"); a origem não é alterada.
//     Online (sem offline:true) a baixa duplicada continua recusada (JA_CONCLUIDA).
//   • marcarImpressa (POST): grava Impressa_Em/Impressa_Por da folha em branco. Não conclui.
//   • update genérico NÃO conclui mais planejada/solicitação nem toca em Baixado_Por/Impressa_*/Concluido_Em
//     (BLOQUEAR_BAIXA_GENERICA). Em Ordens_Executadas, Baixado_Por é sempre o usuário da sessão.
//   • ExecucaoItens perdeu o append genérico (risco nº 1 do v42): só entra por pmGravarChecklist (POST), que
//     valida a ocorrência na grade de PM e os itens do modelo (cascata), abre corretiva em CORRETIVA/PARAR
//     (PARAR = prioridade 1) e só marca Feita_Em ao finalizar com todos os itens.
//   • Importador dos modelos: pmImportarModelosPreview / pmImportarModelosReal (planilha do PCM).
//   • Rode migrarColunasV18() UMA vez no editor após colar esta versão (acrescenta colunas; não mexe nos dados).
//
// v17 — ModelosItens ganha a coluna Freq (Q/M/T/S/A): cada item do checklist diz a partir de qual
//   frequência entra (a OS anual inclui os itens das frequências menores).
//   • SCHEMAS.ModelosItens: Freq no fim. Freq é obrigatória e validada no servidor (Q/M/T/S/A exato).
//   • pmCriarAbas() agora CONFERE o cabeçalho das 3 abas PM e acrescenta no fim a coluna que faltar
//     (migra a aba já criada sem tocar nos dados). Rode pmCriarAbas() UMA vez após colar esta versão.
//   • Gravar em ModelosItens antes da migração é recusado (evita perder Freq em silêncio).
// v16 — PLANO DE MANUTENÇÃO (PM) · Etapa 2 · SEM geração automática de OS
//   • Abas novas: PlanosPM (plano por máquina e frequência), ModelosItens (itens do
//     checklist por modelo) e ExecucaoItens (resposta de cada item: OK/CORRIGI/CORRETIVA/PARAR).
//     Rode pmCriarAbas() UMA vez no editor (cria cabeçalhos, formato texto nas datas e listas).
//   • Motor de vencimentos (seção PM-MOTOR no fim do arquivo): grade fixa por plano, ciclos
//     ENCAIXADOS Q14/M28/T84/S168/A336, cascata (mesma máquina + mesma data = 1 OS, maior
//     frequência), tolerância, "absorvida". Máquina é identificada por ID_Maquina, nunca por Tag.
//   • GET pmPrevisao (admin/manutenção): SÓ LÊ. Mostra o que o motor geraria hoje + avisos
//     (plano sem máquina, inválido, duplicado, tag repetida, início em fim de semana). Não grava OS.
//   • Gravação em PlanosPM validada no servidor (frequência, data real, ciclo múltiplo de 7,
//     tolerância, máquina existente). O gerador antigo (Ultima_Preventiva_Gerada, 91/182/364 dias)
//     continua intacto e independente até a virada.
//
// v15 — readAll FILTRADO POR PERFIL (AUTH_ENFORCE = true)
//   • readAll só devolve as abas que o perfil pode ler (ACL_LEITURA); as demais
//     voltam como [] (o cliente não quebra) e nem são lidas da planilha.
//   • ACL_LEITURA é a ÚNICA fonte: a action 'read' e o readAll usam a mesma tabela.
//     Antes o readAll ignorava a ACL e mandava até 'preventiva' para todo login.
//   • O cache do readAll agora é POR PERFIL (chave 'ra:<gen>:<perfil>:').
//   • Perfil fora da lista (Tipo_Acesso com erro de digitação) recebe tudo vazio.
//
// v14 — SEGURANÇA: sessão por token + permissão por perfil no servidor
//   • login emite token assinado (HMAC-SHA256, segredo em Script Properties).
//     Validade ociosa 12h (renovada a cada uso, no máx. a cada 30 min) e teto
//     absoluto de 7 dias. O token NÃO carrega perfil: perfil/ativo/senha vêm
//     da aba Usuarios a cada validação (cache 60s) — desativar usuário, mudar
//     perfil ou trocar/resetar senha derruba/atualiza a sessão em até 60s.
//   • TODA ação exige token, exceto ping e login. ACL por ação e por aba
//     (ACL_LEITURA / ACL_ESCRITA / ACL_GET). Aba fora da lista = negado.
//   • "usuario" dos logs, Solicitante de compras e RACR vêm do token, não do cliente.
//   • trocarSenha: só vale quando a senha atual é o sentinela 'mudar123'
//     (antes qualquer um trocava a senha de qualquer login sem autenticar).
//   • Login com bloqueio: 5 falhas → 10 min bloqueado (CacheService).
//   • uploadFoto: só imagem, limite de tamanho, nome/pasta sanitizados.
//   • Erros trazem "code" (AUTH, FORBIDDEN, VALIDATION, NOTFOUND, DUP, BUSY,
//     LOCKED) para o cliente decidir entre reenviar ou descartar.
//   • ROLLOUT: AUTH_ENFORCE=false aceita chamadas SEM token (clientes antigos);
//     com token, valida e aplica ACL mesmo assim. Depois que todos estiverem no
//     frontend novo, mudar para true e publicar nova versão.
//   • Rodar UMA vez no editor: setupSessionSecret().
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
  manuaisSenhas: 'ManuaisSenhas',
  planosPM:      'PlanosPM',
  modelosItens:  'ModelosItens',
  execItens:     'ExecucaoItens'
};

// ── Sheets excluídas do readAll (muito grandes / lidas sob demanda). Inclui
// manuaisSenhas de propósito: credenciais de equipamento só saem pela action
// explícita 'readManuaisSenhas', nunca no carregamento em massa.
var SKIP_READ_ALL = ['historico', 'compras', 'inspecoes', 'racs', 'manuaisSenhas', 'planosPM', 'modelosItens', 'execItens'];

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

// Devolve o JSON (string) de readAll(sess), do cache quando possível.
// O cache é por perfil: cada perfil enxerga um conjunto diferente de abas.
// sess === null (modo compatível, sem token) usa a chave '*' e recebe tudo.
function readAllJson_(sess) {
  var cache = null;
  var gen = '0';
  var prefixo = '';
  var perfilChave = sess ? String(sess.tipo || '').replace(/[^a-z0-9_]/g, '').substring(0, 30) : '*';
  try {
    cache   = CacheService.getScriptCache();
    gen     = cacheGenReadAll_(cache);
    prefixo = 'ra:' + gen + ':' + perfilChave + ':';
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

  var json = JSON.stringify(readAll(sess));

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
    'Origem','OS_Origem_Ref','Criado_Em','Baixado_Por'
  ],
  'OS_Planejadas': [
    'PL_Numero','Sala','Maquina','Tag_Maquina','Tipo','Prioridade',
    'Prazo_Limite','Horas_Turno','Descricao_Planejada','Status',
    'Manutentor_Exec','Data_Execucao','Hora_Inicio','Hora_Fim',
    'Duracao_Min','Servico_Executado','Criado_Em','Concluido_Em','Fotos',
    'Baixado_Por','Impressa_Em','Impressa_Por'
  ],
  'Solicitacoes': [
    'SOL_Numero','Sala','Maquina','Tipo','Prioridade','Descricao',
    'Status','Solicitante','Manutentor_Exec','Data_Execucao',
    'Servico_Executado','Foto_URL','Fotos','Criado_Em','Concluido_Em',
    'Baixado_Por','Impressa_Em','Impressa_Por'
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
  'PlanosPM': [
    'ID_Plano','ID_Maquina','Sala','Maquina','Tag','Freq','Modelo','Primeira',
    'Ciclo_Dias','Tol_Dias','Duracao_Min','Parada','Ativo','Criado_Em','Atualizado_Em','Idempotency_Key'
  ],
  'ModelosItens': [
    'ID_Item','Modelo','Disciplina','Ordem','Descricao','Ativo','Freq'
  ],
  'ExecucaoItens': [
    'ID_Exec','OS_Numero','Chave','ID_Maquina','Venc','Tol_Ate','Feita_Em','Manutentor',
    'Modelo','Disciplina','Ordem','Item','Resultado','Observacao','Foto_URL','OS_Corretiva',
    'Criado_Em','Idempotency_Key'
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
  manuaisSenhas:['ID','Sala','Equipamento'],
  planosPM:     ['ID_Plano','ID_Maquina','Freq','Primeira'],
  modelosItens: ['ID_Item','Modelo','Disciplina','Descricao','Freq'],
  execItens:    ['ID_Exec','Chave','ID_Maquina','Item','Resultado']
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
  if (key === 'planosPM') return pmValidarPlanoRow_(rowObj, isUpdate);
  if (key === 'modelosItens') return pmValidarItemRow_(rowObj, isUpdate);
  return null;
}

function comLock(fn) {
  var lock = LockService.getScriptLock();
  var gotLock = lock.tryLock(10000);
  if (!gotLock) {
    return { ok: false, code: 'BUSY', error: 'Sistema ocupado (outra gravação em andamento). Tente novamente em instantes.' };
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

// ═══════════════════════════════════════════════════════════════════════════
// SESSÃO E AUTORIZAÇÃO (v14)
// ═══════════════════════════════════════════════════════════════════════════
var AUTH_ENFORCE     = true;             // true = exige token em toda ação (exceto ping/login)
var SESSAO_IDLE_H    = 12;               // validade a partir do último uso
var SESSAO_MAX_H     = 168;              // teto absoluto desde o login (7 dias)
var SESSAO_RENOVA_MS = 30 * 60 * 1000;   // só emite token novo se o atual tem mais de 30 min
var SESSAO_TROCA_MS  = 15 * 60 * 1000;   // token de troca obrigatória de senha: 15 min
var LOGIN_MAX_FALHAS = 5;
var LOGIN_BLOQUEIO_S = 600;
var USR_CACHE_TTL_S  = 60;
var UPLOAD_MAX_B64   = 14000000;         // ~10 MB binário

var P_ADM = 'administracao', P_MAN = 'manutencao', P_PRO = 'producao', P_DIR = 'diretoria';
var P_TODOS = [P_ADM, P_MAN, P_PRO, P_DIR];
var P_OPER  = [P_ADM, P_MAN];
var P_GEST  = [P_ADM, P_MAN, P_DIR];

// MATRIZ DE ACESSO (regra de 15/10/2026) — telas e o que cada uma precisa do servidor:
//   produção     → Solicitação de O.S.
//   diretoria    → Dashboard, Solicitação de O.S., O.S. Executadas (somente consulta)
//   manutenção   → Dashboard e O.S. Planejadas (concluir planejadas/solicitações), O.S. Executadas,
//                  Abertura de O.S., Inspeção Diária, Manuais e Senhas (só leitura)
//   administração→ tudo (inclui PCM: planejamento, preventiva, RACR, compras; ativos; usuários)
// Mantenha estas tabelas e ROLES (js/core.js) iguais: tela sem permissão no servidor
// aparece como erro, e permissão sem tela é superfície de ataque à toa.

// Leitura por aba. Vale para a action 'read' e variantes E para o readAll (v15).
//   produção   → salas, maquinas (listas do formulário) e solicitacoes
//   diretoria  → + ordens, planejadas, configuracoes (Dashboard e O.S. Executadas)
//   manutenção → + usuarios (seletor de manutentor)
//   administração → tudo
// configuracoes só é usada pelo Dashboard; usuarios, só pelos seletores de
// manutentor e pela tela de Administração. Contadores osC/plC/solC do cliente
// vêm de ordens/planejadas/solicitacoes: cada perfil lê a aba em que cria registro.
var ACL_LEITURA = {
  salas: P_TODOS, maquinas: P_TODOS, solicitacoes: P_TODOS,
  ordens: P_GEST, planejadas: P_GEST, configuracoes: P_GEST,
  usuarios: P_OPER,
  inspecoes: P_OPER, racs: [P_ADM], historico: P_GEST, compras: P_GEST,
  preventiva: [P_ADM], manuaisSenhas: P_OPER,
  planosPM: [P_ADM], modelosItens: P_OPER, execItens: P_GEST
};

// Escrita por aba e operação. Aba/operação ausente = negado.
// racs, manuaisSenhas e compras (criação) só entram por salvarRACR,
// salvarManualSenha e addOrdemCompra, que têm regra própria no doPost.
var ACL_ESCRITA = {
  ordens:        { append: P_OPER, update: P_OPER, delete: P_OPER },
  planejadas:    { append: [P_ADM], update: P_OPER, delete: P_OPER }, // criar = Planejamento (PCM, só admin); concluir/excluir(5 min) = Planejadas e Dashboard
  solicitacoes:  { append: [P_ADM, P_PRO, P_DIR], update: P_OPER, delete: [P_ADM] },
  inspecoes:     { append: P_OPER },
  preventiva:    { append: [P_ADM] },
  historico:     { append: P_TODOS },
  salas:         { append: [P_ADM], update: [P_ADM], delete: [P_ADM] },
  maquinas:      { append: [P_ADM], update: [P_ADM], delete: [P_ADM] },
  usuarios:      { append: [P_ADM], update: [P_ADM] },
  configuracoes: { append: [P_ADM], update: [P_ADM] },
  compras:       { update: [P_ADM] },
  planosPM:      { append: [P_ADM], update: [P_ADM], delete: [P_ADM] },
  modelosItens:  { append: [P_ADM], update: [P_ADM], delete: [P_ADM] },
  execItens:     { update: [P_ADM] } // v18: sem append genérico; a gravação do checklist é só por pmGravarChecklist
};

function own_(obj, k) { return Object.prototype.hasOwnProperty.call(obj, k); }
function perfilNorm_(v) { return semAcento_(v).toLowerCase().replace(/\s+/g, ''); }
function negar_(msg) { return { ok: false, code: 'FORBIDDEN', error: msg || 'Sem permissão para esta ação.' }; }
function erroAuth_(msg) { return { ok: false, code: 'AUTH', error: msg || 'Sessão inválida ou expirada. Faça login novamente.' }; }
// sess === null só ocorre em modo compatível (AUTH_ENFORCE=false, cliente sem token).
function pode_(sess, perfis) { return !sess || perfis.indexOf(sess.tipo) >= 0; }

var _segredoMemo = null; // vale só dentro desta execução (cada request começa do zero)
function segredoSessao_() {
  if (_segredoMemo) return _segredoMemo;
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('SESSION_SECRET');
  if (s) { _segredoMemo = s; return s; }
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    s = props.getProperty('SESSION_SECRET');
    if (!s) {
      s = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid();
      props.setProperty('SESSION_SECRET', s);
    }
    _segredoMemo = s;
    return s;
  } finally {
    lock.releaseLock();
  }
}

// Rodar UMA vez no editor (evita corrida na criação do segredo). Rodar de novo
// NÃO troca o segredo existente; para derrubar todas as sessões: rotacionarSegredoSessao().
function setupSessionSecret() {
  segredoSessao_();
  Logger.log('✅ SESSION_SECRET pronto.');
}

// Derruba TODAS as sessões abertas (todos precisam fazer login de novo).
function rotacionarSegredoSessao() {
  PropertiesService.getScriptProperties().deleteProperty('SESSION_SECRET');
  _segredoMemo = null;
  segredoSessao_();
  Logger.log('✅ Segredo rotacionado: todas as sessões foram invalidadas.');
}

function assinar_(texto) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(texto, segredoSessao_()));
}

function iguais_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  var r = 0;
  for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// "Versão" da senha: muda sempre que Senha_Hash muda (troca/reset) e invalida
// os tokens antigos. É um HMAC truncado — não expõe nada do hash armazenado.
function pvDe_(armazenado) {
  return assinar_('pv:' + String(armazenado)).substring(0, 12);
}

function emitirToken_(login, pv, origemMs, restrito) {
  var agora = Date.now();
  var o = origemMs || agora;
  var exp = restrito
    ? agora + SESSAO_TROCA_MS
    : Math.min(agora + SESSAO_IDLE_H * 3600000, o + SESSAO_MAX_H * 3600000);
  var corpo = Utilities.base64EncodeWebSafe(
    JSON.stringify({ l: login, i: agora, x: exp, o: o, p: pv, r: restrito ? 1 : 0 }),
    Utilities.Charset.UTF_8
  );
  return corpo + '.' + assinar_(corpo);
}

// Geração própria do cache de usuários: só muda quando a aba Usuarios é gravada pelo
// sistema (append/update/delete em 'usuarios', troca de senha, migração de hash).
// Antes dividia a geração do readAll, que muda a CADA gravação: depois de qualquer
// OS salva, a próxima leitura reabria a planilha só para validar o login.
function invalidarCacheUsuarios_() {
  try {
    CacheService.getScriptCache().put('usr_gen', String(Date.now()) + '_' + Math.floor(Math.random() * 1000000), 21600);
  } catch (e) {}
}

// Usuário "ao vivo" (perfil, ativo, versão da senha). Cache de 60s; edição feita direto
// na planilha demora até 60s para valer, edição pelo sistema vale na hora.
function usuarioPorLogin_(login) {
  var low = String(login || '').toLowerCase();
  if (!low) return null;
  var cache = null, ck = null;
  try {
    cache = CacheService.getScriptCache();
    ck = 'u:' + (cache.get('usr_gen') || '0') + ':' + low.substring(0, 100);
    var c = cache.get(ck);
    if (c) return JSON.parse(c);
  } catch (e) { cache = null; }

  var data = getSheet('usuarios').getDataRange().getValues();
  var h = data[0];
  var iL = h.indexOf('Login'), iS = h.indexOf('Senha_Hash'), iN = h.indexOf('Nome');
  var iT = h.indexOf('Tipo_Acesso'), iA = h.indexOf('Ativo');
  if (iL < 0 || iS < 0) return null;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][iL]).toLowerCase() !== low) continue;
    var armazenado = String(data[i][iS] || '');
    var u = {
      login: String(data[i][iL]),
      nome:  iN >= 0 ? String(data[i][iN]) : '',
      tipo:  iT >= 0 ? perfilNorm_(data[i][iT]) : '',
      ativo: iA >= 0 ? ativoSim_(data[i][iA]) : true,
      pv:    pvDe_(armazenado),
      mudar: armazenado === 'mudar123'
    };
    if (cache) { try { cache.put(ck, JSON.stringify(u), USR_CACHE_TTL_S); } catch (e2) {} }
    return u;
  }
  return null;
}

// → { ok:true, sess } | { ok:false, code:'AUTH', error }
function validarToken_(token) {
  if (!token || typeof token !== 'string') return erroAuth_('Sessão ausente. Faça login.');
  var partes = token.split('.');
  if (partes.length !== 2) return erroAuth_();
  if (!iguais_(assinar_(partes[0]), partes[1])) return erroAuth_();
  var p;
  try {
    p = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(partes[0])).getDataAsString());
  } catch (e) { return erroAuth_(); }
  var agora = Date.now();
  if (!p || !p.l || !(p.x > agora) || !(p.o + SESSAO_MAX_H * 3600000 > agora)) {
    return erroAuth_('Sessão expirada. Faça login novamente.');
  }
  var u = usuarioPorLogin_(p.l);
  if (!u || !u.ativo || u.pv !== p.p) {
    return erroAuth_('Sessão encerrada (acesso alterado). Faça login novamente.');
  }
  var sess = { login: u.login, nome: u.nome, tipo: u.tipo, restrito: !!p.r, origem: p.o, novoToken: null };
  if (!p.r && (agora - p.i) > SESSAO_RENOVA_MS) {
    sess.novoToken = emitirToken_(u.login, u.pv, p.o, false);
  }
  return { ok: true, sess: sess };
}

// → { sess } | { erro }
function autenticar_(token) {
  if (!AUTH_ENFORCE && !token) return { sess: null };
  var r = validarToken_(token);
  return r.ok ? { sess: r.sess } : { erro: r };
}

function resp_(r, sess) {
  if (sess && sess.novoToken && r && typeof r === 'object') r.tk = sess.novoToken;
  return jsonOut(r);
}

function respRaw_(jsonStr, sess) {
  if (sess && sess.novoToken) {
    jsonStr = jsonStr.slice(0, -1) + ',"tk":' + JSON.stringify(sess.novoToken) + '}';
  }
  return jsonOutRaw_(jsonStr);
}

function checarLeitura_(sess, sheet) {
  if (!own_(SHEET_NAMES, sheet) || !own_(ACL_LEITURA, sheet)) return negar_('Aba não permitida para leitura.');
  if (!pode_(sess, ACL_LEITURA[sheet])) return negar_();
  return null;
}

function checarEscrita_(sess, acao, sheet) {
  if (!own_(SHEET_NAMES, sheet) || !own_(ACL_ESCRITA, sheet) || !own_(ACL_ESCRITA[sheet], acao)) {
    return negar_('Operação não permitida: ' + acao + ' em ' + sheet);
  }
  if (!pode_(sess, ACL_ESCRITA[sheet][acao])) return negar_();
  return null;
}

function doGet(e) {
  if (!e || !e.parameter) {
    return jsonOut({ ok: true, msg: 'SIGMAN API v14 online', ts: new Date().toISOString() });
  }
  var sess = null;
  try {
    var p = e.parameter;
    if (p.action === 'ping') return jsonOut({ ok: true, ts: new Date().toISOString() });

    var a = autenticar_(p.token);
    if (a.erro) return jsonOut(a.erro);
    sess = a.sess;
    if (sess && sess.restrito) return jsonOut(erroAuth_('Troca de senha pendente.'));

    var nega = null;
    switch (p.action) {
      case 'readAll':
        return respRaw_('{"ok":true,"data":' + readAllJson_(sess) + '}', sess);
      case 'read':
        nega = checarLeitura_(sess, p.sheet);
        return resp_(nega || { ok: true, data: readSheet(p.sheet) }, sess);
      case 'readHistorico':
        nega = checarLeitura_(sess, 'historico');
        return resp_(nega || { ok: true, data: readSheet('historico') }, sess);
      case 'readCompras':
        nega = checarLeitura_(sess, 'compras');
        return resp_(nega || { ok: true, data: readSheet('compras') }, sess);
      case 'readInspecoes':
        nega = checarLeitura_(sess, 'inspecoes');
        return resp_(nega || { ok: true, data: readSheet('inspecoes') }, sess);
      case 'readRacs':
        nega = checarLeitura_(sess, 'racs');
        return resp_(nega || { ok: true, data: readSheet('racs') }, sess);
      case 'readManuaisSenhas':
        nega = checarLeitura_(sess, 'manuaisSenhas');
        return resp_(nega || { ok: true, data: readSheet('manuaisSenhas') }, sess);
      case 'previewPreventivas': // consulta aberta a quem tem a tela Planejadas; GERAR continua só admin
        if (!pode_(sess, P_OPER)) return resp_(negar_(), sess);
        return resp_(gerarPreventivasAutomaticas(true), sess);
      case 'pmPrevisao': // SÓ LEITURA: o que o motor de PM geraria hoje. Não grava nada.
        if (!pode_(sess, P_OPER)) return resp_(negar_(), sess);
        return resp_(pmPrevisao_(p.antecedencia, p.desde), sess);
      case 'planos_list':
        if (!pode_(sess, [P_ADM])) return resp_(negar_(), sess);
        return resp_(listarPlanosPreventiva(), sess);
      case 'planos_get':
        if (!pode_(sess, [P_ADM])) return resp_(negar_(), sess);
        return resp_(carregarPlanoPreventiva(p.modelo), sess);
    }
    return resp_({ ok: false, error: 'GET action desconhecida: ' + p.action }, sess);
  } catch (err) {
    return jsonOut({ ok: false, error: err.toString() });
  }
}

function doPost(e) {
  if (!e || !e.postData) return jsonOut({ ok: false, error: 'POST sem dados' });
  var sess = null;
  try {
    var d = JSON.parse(e.postData.contents);
    if (d.action === 'login') return jsonOut(verificarLogin(d.login, d.senha));

    var a = autenticar_(d.token);
    if (a.erro) return jsonOut(a.erro);
    sess = a.sess;
    if (sess && sess.restrito && d.action !== 'trocarSenha') return jsonOut(erroAuth_('Troca de senha pendente.'));

    // Com sessão, o nome vem do token (o cliente não escolhe quem é).
    var usuario = sess ? sess.nome : (d.usuario || '');
    var nega = null;

    switch (d.action) {
      case 'append':
        nega = checarEscrita_(sess, 'append', d.sheet);
        if (!nega && d.sheet === 'ordens' && d.row && typeof d.row === 'object') d.row.Baixado_Por = usuario; // auditoria: sempre a sessão
        return resp_(nega || appendRow(d.sheet, d.row, usuario, d.idempotencyKey), sess);
      case 'appendBatch':
        nega = checarEscrita_(sess, 'append', d.sheet);
        if (!nega && (!Array.isArray(d.rows) || d.rows.length > 500)) nega = { ok: false, code: 'VALIDATION', error: 'Lote inválido (máx. 500 linhas).' };
        return resp_(nega || appendBatch(d.sheet, d.rows, usuario), sess);
      case 'update':
        nega = checarEscrita_(sess, 'update', d.sheet);
        if (!nega) nega = guardaUpdateGenerico_(d.sheet, d.id, d.idCol, d.row);
        return resp_(nega || updateRow(d.sheet, d.id, d.idCol, d.row, usuario), sess);
      case 'delete':
        nega = checarEscrita_(sess, 'delete', d.sheet);
        return resp_(nega || deleteRow(d.sheet, d.id, d.idCol, usuario), sess);
      case 'importarTodos':
        if (!pode_(sess, [P_ADM])) return resp_(negar_(), sess);
        return resp_(importarTodos(d.payload || {}), sess);
      case 'uploadFoto':
        if (!pode_(sess, P_TODOS)) return resp_(negar_(), sess);
        return resp_(uploadFoto(d.numero, d.fileName, d.mimeType, d.base64), sess);
      case 'salvarRACR':
        if (!pode_(sess, [P_ADM])) return resp_(negar_(), sess);
        if (d.racr && sess) d.racr.usuario = sess.nome;
        return resp_(salvarRACR(d.racr || {}), sess);
      case 'encerrarRACR':
        if (!pode_(sess, [P_ADM])) return resp_(negar_(), sess);
        return resp_(encerrarRACR(d.id, usuario), sess);
      case 'addOrdemCompra':
        if (!pode_(sess, [P_ADM])) return resp_(negar_(), sess);
        if (d.dados && sess) d.dados.solicitante = sess.nome;
        return resp_(addOrdemCompra(d.dados || {}), sess);
      case 'salvarManualSenha':
        if (!pode_(sess, [P_ADM])) return resp_(negar_(), sess);
        return resp_(salvarManualSenha(d.dados, usuario), sess);
      case 'trocarSenha':
        return resp_(trocarSenha(sess, d.login, d.novaSenha), sess);
      case 'concluirOS':
        if (!pode_(sess, P_OPER)) return resp_(negar_(), sess);
        return resp_(concluirOS(sess, d), sess);
      case 'marcarImpressa':
        if (!pode_(sess, P_OPER)) return resp_(negar_(), sess);
        return resp_(marcarImpressa(sess, d), sess);
      case 'pmGravarChecklist':
        if (!pode_(sess, P_OPER)) return resp_(negar_(), sess);
        return resp_(pmGravarChecklist(sess, d), sess);
      case 'gerarPreventivasManual':
        if (!pode_(sess, [P_ADM])) return resp_(negar_(), sess);
        return resp_(gerarPreventivasAutomaticas(false), sess);
    }
    return resp_({ ok: false, error: 'POST action desconhecida: ' + d.action }, sess);
  } catch (err) {
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

// sess === null (modo compatível) lê tudo; com sessão, só as abas de ACL_LEITURA
// do perfil (negada = [] e a aba nem é aberta). Aba fora de ACL_LEITURA = negada.
function readAll(sess) {
  var r = {};
  Object.keys(SHEET_NAMES).forEach(function(k) {
    if (SKIP_READ_ALL.indexOf(k) >= 0 || !own_(ACL_LEITURA, k) || !pode_(sess, ACL_LEITURA[k])) {
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
  solicitacoes: 'SOL_Numero',
  planosPM:     'ID_Plano',
  modelosItens: 'ID_Item'
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
    return { ok: false, code: 'VALIDATION', error: erro };
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
            return { ok: false, code: 'DUP', error: 'NUMERO_DUPLICADO', numeroConflito: numVal };
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
  if (key === 'usuarios') invalidarCacheUsuarios_();
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
    return { ok: false, code: 'VALIDATION', error: erro };
  }
  var resultado = comLock(function() {
    var sh      = getSheet(key);
    var data    = sh.getDataRange().getValues();
    var headers = data[0];
    var idIdx   = headers.indexOf(idCol);
    if (idIdx < 0) return { ok: false, code: 'VALIDATION', error: 'Coluna não encontrada: ' + idCol };
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idIdx]) === String(id)) {
        var row = headers.map(function(h, j) {
          return newData[h] !== undefined ? newData[h] : data[i][j];
        });
        sh.getRange(i + 1, 1, 1, headers.length).setValues([row]);
        return { ok: true };
      }
    }
    return { ok: false, code: 'NOTFOUND', error: 'Não encontrado: ' + id };
  });
  if (key === 'usuarios') invalidarCacheUsuarios_();
  logGravacao(usuario, 'update', key, id, resultado.ok ? 'sucesso' : 'falha', resultado.error || '');
  return resultado;
}

function deleteRow(key, id, idCol, usuario) {
  var resultado = comLock(function() {
    var sh    = getSheet(key);
    var data  = sh.getDataRange().getValues();
    var idIdx = data[0].indexOf(idCol);
    if (idIdx < 0) return { ok: false, code: 'VALIDATION', error: 'Coluna não encontrada: ' + idCol };
    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][idIdx]) === String(id)) {
        sh.deleteRow(i + 1);
        return { ok: true };
      }
    }
    return { ok: false, code: 'NOTFOUND', error: 'Não encontrado: ' + id };
  });
  if (key === 'usuarios') invalidarCacheUsuarios_();
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

function loginChaveFalha_(login) { return 'lf:' + String(login).toLowerCase().substring(0, 60); }

function loginBloqueado_(login) {
  try {
    var n = parseInt(CacheService.getScriptCache().get(loginChaveFalha_(login)), 10);
    return n >= LOGIN_MAX_FALHAS;
  } catch (e) { return false; }
}

function loginFalhou_(login) {
  try {
    var c = CacheService.getScriptCache(), k = loginChaveFalha_(login);
    var n = parseInt(c.get(k), 10) || 0;
    c.put(k, String(n + 1), LOGIN_BLOQUEIO_S);
  } catch (e) {}
}

function loginOk_(login) {
  try { CacheService.getScriptCache().remove(loginChaveFalha_(login)); } catch (e) {}
}

function verificarLogin(login, senha) {
  if (!login || !senha) return { ok: false, error: 'Usuário ou senha incorretos.' };
  login = String(login).trim();
  senha = String(senha);
  if (loginBloqueado_(login)) {
    return { ok: false, code: 'LOCKED', error: 'Muitas tentativas incorretas. Aguarde 10 minutos e tente de novo.' };
  }

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
    var finalStored = stored;
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
        var mig = comLock(function() { sh.getRange(rowFixa, colFixa).setValue(novoHash); return { ok: true }; });
        if (mig && mig.ok) { finalStored = novoHash; invalidarCacheUsuarios_(); } // se o lock falhar, segue em texto puro (migra no próximo login)
      }
    }

    if (!ok) { loginFalhou_(login); return { ok: false, error: 'Usuário ou senha incorretos.' }; }

    var ativo = ativoIdx >= 0 ? ativoSim_(data[i][ativoIdx]) : true;
    if (!ativo) return { ok: false, error: 'Usuário desativado. Fale com a Administração.' };

    loginOk_(login);
    var user = {
      login: data[i][loginIdx],
      nome:  nomeIdx  >= 0 ? data[i][nomeIdx]  : '',
      cargo: cargoIdx >= 0 ? data[i][cargoIdx] : '',
      tipo:  tipoIdx  >= 0 ? data[i][tipoIdx]  : '',
      ativo: true
    };
    var mudar = (finalStored === 'mudar123');
    // mudar=true → token restrito (15 min), só serve para trocarSenha.
    return { ok: true, user: user, mustChangePassword: mudar, token: emitirToken_(String(user.login), pvDe_(finalStored), 0, mudar) };
  }

  loginFalhou_(login); // login inexistente conta igual (não revela quais logins existem)
  return { ok: false, error: 'Usuário ou senha incorretos.' };
}

// Só troca quando a senha atual é o sentinela 'mudar123' (reset pela Administração
// ou usuário novo). Não existe troca voluntária: sem senha antiga, ela seria
// uma porta para tomar conta de uma sessão roubada.
// sess=null só em modo compatível (cliente antigo, sem token): aceita o login do
// corpo, mas a regra do sentinela continua valendo.
function trocarSenha(sess, loginLegado, novaSenha) {
  novaSenha = String(novaSenha === undefined || novaSenha === null ? '' : novaSenha);
  if (novaSenha.length < 4) return { ok: false, code: 'VALIDATION', error: 'Senha inválida (mínimo 4 caracteres).' };
  if (novaSenha === 'mudar123') return { ok: false, code: 'VALIDATION', error: 'Escolha uma senha diferente de "mudar123".' };
  var login = sess ? sess.login : String(loginLegado || '');
  if (!login) return { ok: false, code: 'VALIDATION', error: 'Login ausente.' };

  var res = comLock(function() {
    var sh       = getSheet('usuarios');
    var data     = sh.getDataRange().getValues();
    var headers  = data[0];
    var loginIdx = headers.indexOf('Login');
    var senhaIdx = headers.indexOf('Senha_Hash');
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][loginIdx]).toLowerCase() === login.toLowerCase()) {
        if (String(data[i][senhaIdx] || '') !== 'mudar123') {
          return negar_('A troca de senha só é permitida após reset pela Administração.');
        }
        var novoHash = hashSenha_(String(data[i][loginIdx]), novaSenha);
        sh.getRange(i + 1, senhaIdx + 1).setValue(novoHash);
        return { ok: true, hash: novoHash, login: String(data[i][loginIdx]) };
      }
    }
    return { ok: false, code: 'NOTFOUND', error: 'Usuário não encontrado.' };
  });
  if (!res.ok) return res;
  invalidarCacheUsuarios_();
  return { ok: true, token: emitirToken_(res.login, pvDe_(res.hash), sess ? sess.origem : 0, false) };
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
    if (typeof base64 !== 'string' || !base64.length) return { ok: false, code: 'VALIDATION', error: 'Arquivo vazio.' };
    if (base64.length > UPLOAD_MAX_B64) return { ok: false, code: 'VALIDATION', error: 'Arquivo grande demais (máx. ~10 MB).' };
    mimeType = String(mimeType || 'image/jpeg').toLowerCase();
    if (!/^(image\/(jpeg|jpg|png|webp|gif|heic|heif)|application\/pdf)$/.test(mimeType)) {
      return { ok: false, code: 'VALIDATION', error: 'Tipo de arquivo não permitido (só imagem ou PDF).' };
    }
    var ehPdf = (mimeType === 'application/pdf');
    if (ehPdf) {
      var cab;
      try { cab = Utilities.base64Decode(base64.substring(0, 8)); } catch (e) { cab = []; }
      if (String.fromCharCode(cab[0] & 255, cab[1] & 255, cab[2] & 255, cab[3] & 255) !== '%PDF') {
        return { ok: false, code: 'VALIDATION', error: 'Arquivo não é um PDF válido.' };
      }
    }
    numero   = String(numero || 'SEM_NUMERO').replace(/[^A-Za-z0-9_\-]/g, '_').substring(0, 60);
    fileName = String(fileName || (numero + (ehPdf ? '.pdf' : '.jpg'))).replace(/[\\\/:*?"<>|]/g, '_').substring(0, 100);
    if (ehPdf && !/\.pdf$/i.test(fileName)) fileName += '.pdf';
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
//   - POST gerarPreventivasManual  → gera de verdade (somente administração — checado no servidor desde a v14).
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


// ═══════════════════════════════════════════════════════════════════════════
// PLANO DE MANUTENÇÃO (PM) — v16
// Tudo daqui para baixo é novo e independente do gerador antigo de preventivas.
// ═══════════════════════════════════════════════════════════════════════════

// ═══ PM-MOTOR:INICIO ═══ (cópia exata de pm-motor.js — não edite aqui; edite lá, rode node test.js e recopie)
/* SIGMAN PM - motor de vencimentos v3 (puro, sem I/O). Datas 'YYYY-MM-DD'. Sem fuso: aritmética em dias UTC.
   Este bloco é copiado TAL QUAL para o Code.gs (seção PM-MOTOR). Edite aqui, rode node test.js e recopie.
   plano.maquina deve ser o ID ÚNICO da máquina (ID_Maquina), nunca a Tag: tags repetem e fundiriam máquinas na cascata.
   v3: ciclos ENCAIXADOS (Q14 | M28 | T84 | S168 | A336, todos múltiplos de 28): toda data de frequência maior cai numa
       data das menores, então a cascata sempre junta inspeção e preventiva numa OS só (mesma primeira data-base).
       validar(plano) = regra única de cadastro (usada também na gravação da aba). pendentes(..., desde) ignora antes de 'desde'. */
var PMMotor = (function () {
  var CICLO = { Q: 14, M: 28, T: 84, S: 168, A: 336 };
  var TOL = { Q: 2, M: 5, T: 7, S: 14, A: 14 };
  var ORDEM = ['Q', 'M', 'T', 'S', 'A'];
  function ds(s) { var p = s.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5; }
  function sd(n) { return new Date(n * 864e5).toISOString().slice(0, 10); }
  function dataValida(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && sd(ds(s)) === s; }
  function vazio(v) { return v === null || v === undefined || v === ''; }
  function maior(a, b) { return ORDEM.indexOf(a) >= ORDEM.indexOf(b) ? a : b; }

  /* Números do plano (ciclo e tolerância) já normalizados, ou null se inválidos. */
  function numeros(plano) {
    if (!plano || !CICLO[plano.freq]) return null;
    var c = vazio(plano.ciclo) ? CICLO[plano.freq] : Number(plano.ciclo);
    var t = vazio(plano.tol) ? TOL[plano.freq] : Number(plano.tol);
    if (!isFinite(c) || c < 1 || Math.floor(c) !== c) return null; /* ciclo 0 ou inválido travaria o laço */
    if (!isFinite(t) || t < 0 || Math.floor(t) !== t) return null;
    return { c: c, t: t };
  }

  /* Regra única de cadastro. Devolve '' se o plano é válido, senão a mensagem de erro.
     Mais rígida que 'ocorrencias': ciclo próprio tem de ser múltiplo de 7 (mesmo dia da semana) e tolerância até 60. */
  function validar(plano) {
    if (!plano || !CICLO[plano.freq]) return 'Frequência inválida (use Q, M, T, S ou A).';
    if (!dataValida(plano.primeira)) return 'Primeira data inválida (use AAAA-MM-DD, data real).';
    var n = numeros(plano);
    if (!n) return 'Ciclo ou tolerância inválidos (números inteiros, ciclo ≥ 1, tolerância ≥ 0).';
    if (n.c % 7 !== 0) return 'Ciclo precisa ser múltiplo de 7 dias (mesmo dia da semana em todo ciclo).';
    if (n.t > 60) return 'Tolerância acima de 60 dias.';
    return '';
  }

  /* Ocorrências de UM plano até 'ate' (inclusive), a partir de plano.primeira, em grade fixa (primeira + n*ciclo). */
  function ocorrencias(plano, ate) {
    if (!plano.ativo || !dataValida(plano.primeira) || !dataValida(ate)) return [];
    var n = numeros(plano);
    if (!n) return [];
    var out = [], d = ds(plano.primeira), fim = ds(ate);
    for (; d <= fim; d += n.c) out.push({ plano: plano.id, maquina: plano.maquina, freq: plano.freq, venc: sd(d), tolAte: sd(d + n.t) });
    return out;
  }

  /* Junta ocorrências da mesma máquina na mesma data: 1 OS, frequência mais alta (cascata). Chave idempotente máquina|data. */
  function gerar(planos, ate) {
    var mapa = {};
    planos.forEach(function (p) {
      ocorrencias(p, ate).forEach(function (o) {
        var k = o.maquina + '|' + o.venc, x = mapa[k];
        if (!x) mapa[k] = { chave: k, maquina: o.maquina, venc: o.venc, tolAte: o.tolAte, freq: o.freq, planos: [o.plano] };
        else {
          x.freq = maior(x.freq, o.freq); x.planos.push(o.plano);
          if (o.tolAte > x.tolAte) x.tolAte = o.tolAte; /* tolerância do maior serviço */
        }
      });
    });
    return Object.keys(mapa).sort().map(function (k) { return mapa[k]; });
  }

  /* Situação de uma OS frente a 'hoje' e às chaves já executadas. */
  function situacao(os, hoje, feitas) {
    if (feitas && feitas[os.chave]) return 'feita';
    if (os.venc > hoje) return 'a_vencer';
    return hoje <= os.tolAte ? 'vencida' : 'atrasada';
  }

  /* Pendentes: ocorrências de 'desde' (opcional) até hoje+antecedência e não feitas. Atrasadas antigas NÃO se acumulam:
     se há ocorrência posterior da mesma máquina, já vencida, de frequência igual ou maior (pendente OU já feita),
     a anterior atrasada é marcada 'absorvida' (a mais alta cobre). */
  function pendentes(planos, hoje, feitas, antecedencia, desde) {
    var ate = sd(ds(hoje) + (antecedencia || 0));
    var todas = gerar(planos, ate).filter(function (o) { return !dataValida(desde) || o.venc >= desde; });
    var porMaq = {};
    todas.forEach(function (o) { (porMaq[o.maquina] = porMaq[o.maquina] || []).push(o); });
    return todas.filter(function (o) { return !(feitas && feitas[o.chave]); }).map(function (o) {
      var s = situacao(o, hoje, feitas);
      var absorvida = s === 'atrasada' && porMaq[o.maquina].some(function (p) {
        return p.venc > o.venc && p.venc <= hoje && ORDEM.indexOf(p.freq) >= ORDEM.indexOf(o.freq);
      });
      return Object.assign({}, o, { situacao: absorvida ? 'absorvida' : s });
    });
  }

  /* Indicador: % no prazo = feitas até tolAte / execuções cujo prazo já fechou.
     execs: [{tolAte, feitaEm}]. Com 'hoje', o que não foi feito e ainda está dentro da tolerância não entra na conta.
     Sem 'hoje', todas as execuções contam. */
  function noPrazo(execs, hoje) {
    var base = hoje ? execs.filter(function (e) { return e.feitaEm || e.tolAte < hoje; }) : execs;
    if (!base.length) return null;
    var ok = base.filter(function (e) { return e.feitaEm && e.feitaEm <= e.tolAte; }).length;
    return Math.round(100 * ok / base.length);
  }

  /* Dia da semana de uma data 'YYYY-MM-DD' (0 = domingo). */
  function diaSemana(s) { return new Date(ds(s) * 864e5).getUTCDay(); }

  return { CICLO: CICLO, TOL: TOL, dataValida: dataValida, validar: validar, diaSemana: diaSemana, ocorrencias: ocorrencias, gerar: gerar, situacao: situacao, pendentes: pendentes, noPrazo: noPrazo };
})();
// ═══ PM-MOTOR:FIM ═══

var PM_TZ = 'America/Sao_Paulo';
var PM_MAX_ITENS = 1000;

// ═══ PM-CALC:INICIO ═══ (puro: recebe linhas já lidas e devolve o resultado; testável fora do Apps Script)
function pmPrevisaoCalc_(planosRows, maquinasRows, execRows, hoje, antecedencia, desde) {
  var avisos = [], maq = {}, planos = [], vistos = {};
  maquinasRows.forEach(function(m) { maq[String(m.ID_Maquina).trim()] = m; });

  planosRows.forEach(function(r) {
    var p = {
      id: String(r.ID_Plano === undefined ? '' : r.ID_Plano).trim(),
      maquina: String(r.ID_Maquina === undefined ? '' : r.ID_Maquina).trim(),
      freq: String(r.Freq === undefined ? '' : r.Freq).trim().toUpperCase(),
      primeira: String(r.Primeira === undefined ? '' : r.Primeira).trim(),
      ciclo: r.Ciclo_Dias, tol: r.Tol_Dias, ativo: ativoSim_(r.Ativo)
    };
    if (!p.id && !p.maquina) return; // linha em branco
    if (!p.ativo) return;
    var m = maq[p.maquina];
    if (!m) { avisos.push({ tipo: 'plano_sem_maquina', plano: p.id, detalhe: 'ID_Maquina "' + p.maquina + '" não existe em Maquinas.' }); return; }
    if (!ativoSim_(m.Ativo)) { avisos.push({ tipo: 'maquina_inativa', plano: p.id, detalhe: 'Máquina inativa: plano ignorado.' }); return; }
    var erro = PMMotor.validar(p);
    if (erro) { avisos.push({ tipo: 'plano_invalido', plano: p.id, detalhe: erro }); return; }
    var dk = p.maquina + '|' + p.freq;
    if (vistos[dk]) { avisos.push({ tipo: 'plano_duplicado', plano: p.id, detalhe: 'Mesma máquina e frequência do plano ' + vistos[dk] + ': este foi ignorado.' }); return; }
    vistos[dk] = p.id;
    var dow = PMMotor.diaSemana(p.primeira);
    if (dow === 0 || dow === 6) avisos.push({ tipo: 'primeira_fim_de_semana', plano: p.id, detalhe: 'Primeira data cai em fim de semana: todas as OS desta grade cairão nele.' });
    planos.push(p);
  });

  // Tag repetida entre máquinas diferentes que têm plano (a chave usa ID_Maquina, então não funde; só avisa).
  var tags = {};
  Object.keys(vistos).forEach(function(dk) {
    var id = dk.split('|')[0], m = maq[id], tg = m ? String(m.Tag || '').trim() : '';
    if (!tg) return;
    (tags[tg] = tags[tg] || {})[id] = 1;
  });
  Object.keys(tags).forEach(function(tg) {
    var ids = Object.keys(tags[tg]);
    if (ids.length > 1) avisos.push({ tipo: 'tag_duplicada', plano: '', detalhe: 'Tag "' + tg + '" em ' + ids.length + ' máquinas (' + ids.join(', ') + '). O sistema usa ID_Maquina, mas corrija a Tag.' });
  });

  var feitas = {};
  execRows.forEach(function(e) {
    var k = String(e.Chave === undefined ? '' : e.Chave).trim();
    var f = String(e.Feita_Em === undefined ? '' : e.Feita_Em).trim();
    if (k && f) feitas[k] = f;
  });

  var lista = PMMotor.pendentes(planos, hoje, feitas, antecedencia, desde);
  var ordemSit = { atrasada: 0, vencida: 1, a_vencer: 2, absorvida: 3 };
  lista.sort(function(a, b) {
    return (ordemSit[a.situacao] - ordemSit[b.situacao]) || (a.venc < b.venc ? -1 : a.venc > b.venc ? 1 : 0) || (a.maquina < b.maquina ? -1 : 1);
  });
  var resumo = { atrasada: 0, vencida: 0, a_vencer: 0, absorvida: 0 };
  lista.forEach(function(o) { resumo[o.situacao]++; });
  var itens = lista.slice(0, PM_MAX_ITENS).map(function(o) {
    var m = maq[o.maquina] || {};
    return { chave: o.chave, maquina_id: o.maquina, maquina: m.Nome || '', tag: m.Tag || '', sala: m.Sala || '',
             freq: o.freq, venc: o.venc, tolAte: o.tolAte, planos: o.planos, situacao: o.situacao };
  });
  return { ok: true, hoje: hoje, antecedencia: antecedencia, desde: desde || '', planosAtivos: planos.length,
           total: lista.length, truncado: lista.length > PM_MAX_ITENS, resumo: resumo, itens: itens, avisos: avisos };
}
// ═══ PM-CALC:FIM ═══

function pmHoje_() { return Utilities.formatDate(new Date(), PM_TZ, 'yyyy-MM-dd'); }

// GET pmPrevisao. Só lê (3 abas). antecedencia: dias à frente (0 a 60, padrão 7). desde: AAAA-MM-DD opcional.
function pmPrevisao_(antecedencia, desde) {
  var a = parseInt(antecedencia, 10);
  if (isNaN(a) || a < 0) a = 7;
  if (a > 60) a = 60;
  var d = PMMotor.dataValida(String(desde || '')) ? String(desde) : '';
  return pmPrevisaoCalc_(
    sheetToObjects(getSheet('planosPM')),
    sheetToObjects(getSheet('maquinas')),
    sheetToObjects(getSheet('execItens')),
    pmHoje_(), a, d
  );
}

// Validação de gravação em PlanosPM (chamada por validarObrigatorios). Frequência exata (Q/M/T/S/A, maiúscula).
// Em update só vale o que veio no objeto; campo ausente não é revalidado.
function pmValidarPlanoRow_(r, isUpdate) {
  var p = {
    freq: r.Freq !== undefined ? String(r.Freq).trim() : 'Q',
    primeira: r.Primeira !== undefined ? String(r.Primeira).trim() : '2000-01-03',
    ciclo: r.Ciclo_Dias, tol: r.Tol_Dias
  };
  var erro = PMMotor.validar(p);
  if (erro) return erro;
  if (r.ID_Maquina !== undefined && !pmMaquinaExiste_(r.ID_Maquina)) {
    return 'ID_Maquina não existe em Maquinas: ' + r.ID_Maquina;
  }
  return null;
}

// Validação de gravação em ModelosItens. Freq exata (Q/M/T/S/A, maiúscula; regex, não lookup em objeto).
// Recusa gravar se a aba ainda não tem a coluna Freq (senão appendRow descartaria Freq sem avisar).
function pmValidarItemRow_(r, isUpdate) {
  if (r.Freq !== undefined || !isUpdate) {
    if (!/^[QMTSA]$/.test(String(r.Freq === undefined ? '' : r.Freq))) return 'Frequência inválida (use Q, M, T, S ou A).';
    var sh = getSheet('modelosItens');
    var h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    if (h.indexOf('Freq') < 0) return 'A aba ModelosItens ainda não tem a coluna Freq. Rode pmCriarAbas() no editor.';
  }
  return null;
}

// Garante que as colunas do SCHEMAS existam no cabeçalho. Só ACRESCENTA no fim o que faltar;
// nunca remove nem reordena (dados já gravados ficam onde estão).
function pmGarantirColunas_(key) {
  var sh = getSheet(key), nome = SHEET_NAMES[key], cols = SCHEMAS[nome];
  var h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var falta = cols.filter(function(c) { return h.indexOf(c) < 0; });
  if (!falta.length) return 0;
  sh.getRange(1, h.length + 1, 1, falta.length).setValues([falta]);
  formatHeader(sh, h.length + falta.length);
  Logger.log('➕ ' + nome + ': coluna(s) acrescentada(s): ' + falta.join(', '));
  return falta.length;
}

function pmMaquinaExiste_(id) {
  var dados = getSheet('maquinas').getDataRange().getValues();
  var idx = dados[0].indexOf('ID_Maquina');
  if (idx < 0) return false;
  var alvo = String(id).trim();
  for (var i = 1; i < dados.length; i++) {
    if (String(dados[i][idx]).trim() === alvo) return true;
  }
  return false;
}

// Rodar UMA vez no editor (pode repetir sem problema): cria as 3 abas com cabeçalho, deixa as colunas de
// data como TEXTO (evita a planilha converter 2026-10-26 em data e deslocar 1 dia por fuso) e põe listas
// suspensas em Freq, Ativo e Resultado.
function pmCriarAbas() {
  var txt = { planosPM: ['Primeira'], execItens: ['Venc', 'Tol_Ate', 'Feita_Em'] };
  Object.keys(txt).forEach(function(k) {
    var sh = getSheet(k), h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    txt[k].forEach(function(c) {
      var i = h.indexOf(c);
      if (i >= 0) sh.getRange(2, i + 1, 2000, 1).setNumberFormat('@');
    });
  });
  ['planosPM', 'modelosItens', 'execItens'].forEach(pmGarantirColunas_);
  var listas = [
    ['planosPM', 'Freq', ['Q', 'M', 'T', 'S', 'A']],
    ['planosPM', 'Ativo', ['Sim', 'Nao']],
    ['modelosItens', 'Ativo', ['Sim', 'Nao']],
    ['modelosItens', 'Disciplina', ['Mecanico', 'Eletrico']],
    ['modelosItens', 'Freq', ['Q', 'M', 'T', 'S', 'A']],
    ['execItens', 'Resultado', ['OK', 'CORRIGI', 'CORRETIVA', 'PARAR']]
  ];
  listas.forEach(function(l) {
    var sh = getSheet(l[0]), h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0], i = h.indexOf(l[1]);
    if (i < 0) return;
    var regra = SpreadsheetApp.newDataValidation().requireValueInList(l[2], true).setAllowInvalid(false).build();
    sh.getRange(2, i + 1, 2000, 1).setDataValidation(regra);
  });
  Logger.log('✅ PlanosPM, ModelosItens e ExecucaoItens prontas.');
}

// ── TESTE NO EDITOR (não precisa implantar nada) ─────────────────────────────────────────────────────────
// Ordem: pmCriarAbas → pmSemearTeste → pmPrevisaoTeste (ver o Registro de execução) → pmLimparTeste.
// Só mexe em linhas de PlanosPM com ID_Plano começando por TESTE-PM-. Não gera OS e não toca em nenhuma outra aba.
var PM_PREFIXO_TESTE = 'TESTE-PM-';

function pmSomaDias_(s, n) {
  var p = s.split('-');
  return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]) + n * 864e5).toISOString().slice(0, 10);
}

// Cria planos de teste nas 3 primeiras máquinas ativas:
//   máquina 1: as 5 frequências na segunda-feira desta semana (mostra a cascata: tudo numa OS só);
//   máquina 2: quinzenal começando na segunda da semana passada (mostra atrasada e a vencer);
//   máquina 3: trimestral começando na segunda da semana que vem (mostra a vencer).
function pmSemearTeste() {
  pmCriarAbas();
  var maqs = sheetToObjects(getSheet('maquinas')).filter(function(m) {
    return String(m.ID_Maquina || '').trim() && ativoSim_(m.Ativo);
  }).slice(0, 3);
  if (maqs.length < 3) { Logger.log('❌ Precisa de pelo menos 3 máquinas ativas em Maquinas.'); return; }
  var hoje = pmHoje_();
  var segunda = pmSomaDias_(hoje, -((PMMotor.diaSemana(hoje) + 6) % 7));
  var lista = [];
  ['Q', 'M', 'T', 'S', 'A'].forEach(function(f) { lista.push([maqs[0], f, segunda]); });
  lista.push([maqs[1], 'Q', pmSomaDias_(segunda, -7)]);
  lista.push([maqs[2], 'T', pmSomaDias_(segunda, 7)]);
  var ok = 0;
  lista.forEach(function(x) {
    var m = x[0], id = PM_PREFIXO_TESTE + m.ID_Maquina + '-' + x[1];
    var r = appendRow('planosPM', {
      ID_Plano: id, ID_Maquina: String(m.ID_Maquina).trim(), Sala: m.Sala, Maquina: m.Nome, Tag: m.Tag,
      Freq: x[1], Primeira: x[2], Ativo: 'Sim', Criado_Em: hoje
    }, 'teste-editor', '');
    if (r.ok) ok++; else Logger.log('⚠ ' + id + ': ' + (r.error || r.code));
  });
  Logger.log('✅ ' + ok + ' de ' + lista.length + ' planos de teste gravados (hoje ' + hoje + ', segunda ' + segunda + ').');
  Logger.log('Próximo: rode pmPrevisaoTeste.');
}

// Mostra no Registro de execução o que o motor geraria hoje (7 dias à frente). Só lê.
function pmPrevisaoTeste() {
  var r = pmPrevisao_(7, '');
  Logger.log('Hoje ' + r.hoje + ' | planos ativos ' + r.planosAtivos + ' | OS previstas ' + r.total +
             ' | atrasada ' + r.resumo.atrasada + ', vencida ' + r.resumo.vencida +
             ', a vencer ' + r.resumo.a_vencer + ', absorvida ' + r.resumo.absorvida);
  r.itens.forEach(function(o) {
    Logger.log(o.situacao.toUpperCase() + ' | ' + o.venc + ' (tol. até ' + o.tolAte + ') | ' + o.freq +
               ' | ' + o.maquina + ' [' + o.maquina_id + '] ' + o.sala + ' | planos: ' + o.planos.join(', '));
  });
  r.avisos.forEach(function(a) { Logger.log('AVISO ' + a.tipo + ' ' + a.plano + ': ' + a.detalhe); });
  if (!r.itens.length && !r.avisos.length) Logger.log('Nada previsto. Rode pmSemearTeste primeiro ou cadastre planos em PlanosPM.');
}

// Apaga só as linhas de teste (ID_Plano começando por TESTE-PM-).
function pmLimparTeste() {
  var sh = getSheet('planosPM'), dados = sh.getDataRange().getValues();
  var idx = dados[0].indexOf('ID_Plano'), n = 0;
  for (var i = dados.length - 1; i >= 1; i--) {
    if (String(dados[i][idx]).indexOf(PM_PREFIXO_TESTE) === 0) { sh.deleteRow(i + 1); n++; }
  }
  invalidarCacheReadAll_();
  Logger.log('✅ ' + n + ' linha(s) de teste removida(s) de PlanosPM.');
}

// ═════════════════════════════════════════════════════════════════
// v18 — BAIXA NO SERVIDOR, FOLHA IMPRESSA, CHECKLIST DO PM E IMPORTADOR
// ═════════════════════════════════════════════════════════════════

// true = a baixa (Status Concluída/Executada) só entra pela action concluirOS. O 'update' genérico
// que tente concluir planejada/solicitação é recusado. Troque para false só em emergência.
var BLOQUEAR_BAIXA_GENERICA = true;
var PM_PRAZO_CORRETIVA_DIAS = 7;   // prazo da corretiva aberta por item CORRETIVA (PARAR vence hoje)
var CAMPOS_BAIXA_PROTEGIDOS = ['Baixado_Por', 'Impressa_Em', 'Impressa_Por', 'Concluido_Em'];

function vErro_(msg, code) { return { ok: false, code: code || 'VALIDATION', error: msg }; }
function normLower_(v) { return semAcento_(v).toLowerCase(); }
function ehConcluida_(st) { var s = normLower_(st); return s === 'concluida' || s === 'executada'; }
function agoraTxt_() { return Utilities.formatDate(new Date(), PM_TZ, 'yyyy-MM-dd HH:mm'); }
function minutosHora_(hhmm) { var p = String(hhmm).split(':'); return (+p[0]) * 60 + (+p[1]); }

// Cabeçalho de uma aba + índice por nome. falta = colunas pedidas que a aba ainda não tem.
function cabecalho_(sh, exigidas) {
  var h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var falta = (exigidas || []).filter(function(c) { return h.indexOf(c) < 0; });
  return { h: h, falta: falta };
}
function erroMigracao_(falta, aba) {
  return vErro_('A aba ' + aba + ' ainda não tem a(s) coluna(s) ' + falta.join(', ') + '. Rode migrarColunasV18() no editor do Apps Script.', 'MIGRACAO');
}

// Manutentor válido = usuário ATIVO de perfil administração ou manutenção. Devolve o Nome como está no cadastro.
function manutentorCanonico_(nome) {
  var alvo = normLower_(nome).replace(/\s+/g, ' ');
  if (!alvo) return '';
  var us = sheetToObjects(getSheet('usuarios'));
  for (var i = 0; i < us.length; i++) {
    var n = normLower_(us[i].Nome).replace(/\s+/g, ' ');
    if (n === alvo && ativoSim_(us[i].Ativo) && (perfilNorm_(us[i].Tipo_Acesso) === P_ADM || perfilNorm_(us[i].Tipo_Acesso) === P_MAN)) {
      return String(us[i].Nome).trim();
    }
  }
  return '';
}

function origemBaixa_(tipo, numero) {
  if (tipo === 'plan' && /^PL-\d{1,8}$/.test(numero)) return { key: 'planejadas', idCol: 'PL_Numero' };
  if (tipo === 'sol' && /^SOL-\d{1,8}$/.test(numero)) return { key: 'solicitacoes', idCol: 'SOL_Numero' };
  return null;
}

// Valida e normaliza os dados da baixa. Puro (sem planilha), testável. Devolve {erro} ou {v}.
function baixaValidar_(d, hoje) {
  var manut = String(d.manutentor === undefined ? '' : d.manutentor).trim();
  var desc  = String(d.desc === undefined ? '' : d.desc).trim();
  if (!manut || !desc) return { erro: vErro_('Preencha o manutentor e a descrição do serviço executado.') };
  if (desc.length > 2000) return { erro: vErro_('Descrição do serviço longa demais (máx. 2000 caracteres).') };
  var data = String(d.data === undefined || d.data === '' ? hoje : d.data).trim();
  if (!PMMotor.dataValida(data)) return { erro: vErro_('Data de execução inválida.') };
  if (data > hoje) return { erro: vErro_('A data de execução não pode ser futura.') };
  var ini = String(d.ini || '').trim(), fim = String(d.fim || '').trim();
  var reHora = /^([01]\d|2[0-3]):[0-5]\d$/;
  if ((ini && !reHora.test(ini)) || (fim && !reHora.test(fim))) return { erro: vErro_('Hora inválida (use HH:MM).') };
  if (!!ini !== !!fim) return { erro: vErro_('Informe a hora de início e a de fim, ou nenhuma das duas.') };
  var parada = (d.parada === undefined || d.parada === '' || d.parada === null) ? 0 : Number(d.parada);
  if (!isFinite(parada) || parada < 0 || Math.floor(parada) !== parada) return { erro: vErro_('Tempo de parada inválido.') };
  var dur = 0;
  if (ini && fim) {
    dur = minutosHora_(fim) - minutosHora_(ini);
    if (dur < 0) {
      if (d.viradaMeiaNoite !== true) return { erro: vErro_('Hora fim menor que o início: confirme que o serviço virou a meia-noite.', 'MEIA_NOITE') };
      dur += 1440;
    }
    if (!parada) parada = dur;
    if (parada > dur) return { erro: vErro_('Tempo de parada (' + parada + ' min) maior que a duração (' + dur + ' min).') };
  } else if (parada > 1440) {
    return { erro: vErro_('Tempo de parada acima de 24 h sem horários informados.') };
  }
  var fotos = [];
  if (d.fotos !== undefined && d.fotos !== null) {
    if (!Array.isArray(d.fotos) || d.fotos.length > 10) return { erro: vErro_('Lista de fotos inválida (máx. 10).') };
    for (var i = 0; i < d.fotos.length; i++) {
      var f = String(d.fotos[i] || '');
      if (!/^https:\/\//.test(f) || f.length > 500) return { erro: vErro_('Endereço de foto inválido.') };
      fotos.push(f);
    }
  }
  return { v: { manut: manut, desc: desc, data: data, ini: ini, fim: fim, dur: dur, parada: parada, fotos: fotos } };
}

function linhaOS_(linha, v, tipo, numero, usuario, agora, acao) {
  return {
    Data: v.data, Sala: linha.Sala, Maquina: linha.Maquina, Tag_Maquina: linha.Tag_Maquina || '', Tipo: linha.Tipo,
    Prioridade: linha.Prioridade, Manutentor: v.manut, Hora_Inicio: v.ini, Hora_Fim: v.fim, Duracao_Min: v.dur,
    Tempo_Parada_Min: v.parada, Problema: linha.Descricao_Planejada || linha.Descricao || '', Acao_Executada: acao,
    Foto_URL: v.fotos[0] || '', Fotos: JSON.stringify(v.fotos), Origem: tipo, OS_Origem_Ref: numero,
    Criado_Em: agora, Baixado_Por: usuario
  };
}

// POST concluirOS — a ÚNICA porta para concluir O.S. planejada ou solicitação.
// Tudo sob um lock: confere a origem, gera o número da OS no servidor, grava a OS em Ordens_Executadas
// e fecha a origem. Quem executou (Manutentor) fica separado de quem deu a baixa (Baixado_Por = sessão).
function concluirOS(sess, d) {
  var usuario = sess ? sess.nome : String(d.usuario || '');
  var tipo = String(d.tipo || ''), numero = String(d.numero || '').trim();
  var org = origemBaixa_(tipo, numero);
  if (!org) return vErro_('Tipo ou número da O.S. inválido.');
  var chk = baixaValidar_(d, pmHoje_());
  if (chk.erro) return chk.erro;
  var v = chk.v;
  var canon = manutentorCanonico_(v.manut);
  if (!canon) return vErro_('Manutentor inválido: escolha um usuário ativo de Manutenção ou Administração.');
  v.manut = canon;

  var res = comLock(function() {
    var sh = getSheet(org.key), nomeAba = SHEET_NAMES[org.key];
    var exigidas = ['Status', 'Manutentor_Exec', 'Data_Execucao', 'Servico_Executado', 'Concluido_Em', 'Baixado_Por'];
    if (tipo === 'plan') exigidas = exigidas.concat(['Hora_Inicio', 'Hora_Fim', 'Duracao_Min']);
    var c1 = cabecalho_(sh, exigidas.concat([org.idCol]));
    if (c1.falta.length) return erroMigracao_(c1.falta, nomeAba);
    var shO = getSheet('ordens');
    var c2 = cabecalho_(shO, ['OS_Numero', 'OS_Origem_Ref', 'Baixado_Por', 'Criado_Em']);
    if (c2.falta.length) return erroMigracao_(c2.falta, SHEET_NAMES.ordens);

    var dados = sh.getDataRange().getValues(), h = dados[0], idx = h.indexOf(org.idCol), li = -1;
    for (var i = 1; i < dados.length; i++) { if (String(dados[i][idx]).trim() === numero) { li = i; break; } }
    if (li < 0) return vErro_('Não encontrada: ' + numero, 'NOTFOUND');
    var linha = {}; h.forEach(function(c, j) { linha[c] = dados[li][j]; });

    // OS já gravada para esta origem (conclusão anterior, ou sobra de uma gravação interrompida)
    var oc = shO.getDataRange().getValues(), oh = oc[0], iRef = oh.indexOf('OS_Origem_Ref'), iNum = oh.indexOf('OS_Numero');
    var iBx = oh.indexOf('Baixado_Por'), iCr = oh.indexOf('Criado_Em'), osExist = null;
    for (var k = 1; k < oc.length; k++) {
      if (String(oc[k][iRef]).trim() === numero) { osExist = { numero: String(oc[k][iNum]), por: String(oc[k][iBx]), criado: String(oc[k][iCr]) }; break; }
    }
    if (ehConcluida_(linha.Status)) {
      // Reenvio da MESMA baixa (fila offline, resposta perdida), mesmo horas depois: mesmo usuário, manutentor e texto = sucesso.
      var mesma = osExist && String(linha.Baixado_Por).trim() === usuario && String(linha.Manutentor_Exec).trim() === v.manut &&
                  String(linha.Servico_Executado).trim() === v.desc;
      if (mesma) return { ok: true, duplicataEvitada: true, numero: osExist.numero };
      // Reenvio vindo da FILA OFFLINE de outra pessoa que também executou: o trabalho real não se perde.
      // Vira uma OS COMPLEMENTAR (número novo, mesma origem). A origem fica como o primeiro a concluir deixou.
      if (d.offline === true) {
        var iAc = oh.indexOf('Acao_Executada'), iMn = oh.indexOf('Manutentor');
        for (var q = 1; q < oc.length; q++) {
          var ac = String(oc[q][iAc]);
          if (String(oc[q][iRef]).trim() === numero && String(oc[q][iBx]).trim() === usuario && String(oc[q][iMn]).trim() === v.manut &&
              ac.indexOf('[Complementar') === 0 && ac.slice(-v.desc.length) === v.desc) {
            return { ok: true, duplicataEvitada: true, complementar: true, numero: String(oc[q][iNum]) }; // reenvio repetido
          }
        }
        var quem = String(linha.Baixado_Por || linha.Manutentor_Exec || '').trim() || 'outra pessoa';
        var agoraC = new Date().toISOString();
        var rc = appendComNumero_('ordens', 'OS_Numero', 'OS-', linhaOS_(linha, v, tipo, numero, usuario, agoraC,
                   '[Complementar à ' + numero + ', já concluída antes por ' + quem + '] ' + v.desc));
        if (!rc.ok) return vErro_(rc.error || 'Falha ao gravar a O.S. complementar.');
        return { ok: true, complementar: true, numero: rc.numero, origem: numero, concluidaPor: quem, concluidoEm: agoraC,
                 baixadoPor: usuario, manutentor: v.manut, durMin: v.dur, paradaMin: v.parada, data: v.data };
      }
      return { ok: false, code: 'JA_CONCLUIDA', error: 'Esta O.S. já foi concluída' + (osExist ? ' (' + osExist.numero + (osExist.por ? ' por ' + osExist.por : '') + ')' : '') + '. Atualize a tela.', numero: osExist ? osExist.numero : '' };
    }

    var agora = new Date().toISOString(), osNum;
    if (osExist) {
      osNum = osExist.numero; // sobra de gravação interrompida: reaproveita, não duplica
    } else {
      var row = linhaOS_(linha, v, tipo, numero, usuario, agora, v.desc);
      var r = appendComNumero_('ordens', 'OS_Numero', 'OS-', row);
      if (!r.ok) return vErro_(r.error || 'Falha ao gravar a O.S.');
      osNum = r.numero;
    }
    var novo = { Status: 'Concluída', Manutentor_Exec: v.manut, Data_Execucao: v.data, Servico_Executado: v.desc,
                 Concluido_Em: agora, Baixado_Por: usuario };
    if (tipo === 'plan') { novo.Hora_Inicio = v.ini; novo.Hora_Fim = v.fim; novo.Duracao_Min = v.dur; }
    if (h.indexOf('Fotos') >= 0 && v.fotos.length) novo.Fotos = JSON.stringify(v.fotos);
    var out = h.map(function(c, j) { return novo[c] !== undefined ? novo[c] : dados[li][j]; });
    sh.getRange(li + 1, 1, 1, h.length).setValues([out]);
    return { ok: true, numero: osNum, concluidoEm: agora, baixadoPor: usuario, manutentor: v.manut,
             durMin: v.dur, paradaMin: v.parada, data: v.data };
  });
  logGravacao(usuario, 'concluirOS', org.key, numero, res.ok ? 'sucesso' : 'falha', res.error || res.numero || '');
  return res;
}

// POST marcarImpressa — registra que a folha em branco da O.S. aberta foi impressa (quem e quando).
// Não conclui nada. Recusa O.S. já concluída. Reimprimir atualiza a marca.
function marcarImpressa(sess, d) {
  var usuario = sess ? sess.nome : String(d.usuario || '');
  var numero = String(d.numero || '').trim();
  var org = origemBaixa_(String(d.tipo || ''), numero);
  if (!org) return vErro_('Tipo ou número da O.S. inválido.');
  var res = comLock(function() {
    var sh = getSheet(org.key);
    var c = cabecalho_(sh, [org.idCol, 'Status', 'Impressa_Em', 'Impressa_Por']);
    if (c.falta.length) return erroMigracao_(c.falta, SHEET_NAMES[org.key]);
    var dados = sh.getDataRange().getValues(), h = dados[0], idx = h.indexOf(org.idCol);
    for (var i = 1; i < dados.length; i++) {
      if (String(dados[i][idx]).trim() !== numero) continue;
      if (ehConcluida_(dados[i][h.indexOf('Status')])) return vErro_('Esta O.S. já está concluída.', 'JA_CONCLUIDA');
      var quando = agoraTxt_(), cE = h.indexOf('Impressa_Em') + 1, cP = h.indexOf('Impressa_Por') + 1;
      sh.getRange(i + 1, cE).setNumberFormat('@').setValue(quando);
      sh.getRange(i + 1, cP).setValue(usuario);
      return { ok: true, impressaEm: quando, impressaPor: usuario };
    }
    return vErro_('Não encontrada: ' + numero, 'NOTFOUND');
  });
  logGravacao(usuario, 'marcarImpressa', org.key, numero, res.ok ? 'sucesso' : 'falha', res.error || '');
  return res;
}

// Guarda do 'update' genérico: não deixa concluir planejada/solicitação por fora de concluirOS,
// nem mexer nos campos de auditoria. Editar O.S. que JÁ está concluída (correção de admin) continua valendo.
function guardaUpdateGenerico_(sheet, id, idCol, row) {
  if (!row || typeof row !== 'object') return null;
  var ehOrigem = (sheet === 'planejadas' || sheet === 'solicitacoes');
  if (sheet === 'ordens' && own_(row, 'Baixado_Por')) return negar_('Campo Baixado_Por é gravado só pelo servidor.');
  if (!ehOrigem) return null;
  for (var i = 0; i < CAMPOS_BAIXA_PROTEGIDOS.length; i++) {
    if (own_(row, CAMPOS_BAIXA_PROTEGIDOS[i])) return negar_('Campo ' + CAMPOS_BAIXA_PROTEGIDOS[i] + ' é gravado só pelo servidor.');
  }
  if (BLOQUEAR_BAIXA_GENERICA && own_(row, 'Status') && ehConcluida_(row.Status)) {
    var sh = getSheet(sheet), dados = sh.getDataRange().getValues(), h = dados[0];
    var iId = h.indexOf(idCol), iSt = h.indexOf('Status');
    for (var j = 1; j < dados.length; j++) {
      if (String(dados[j][iId]) === String(id)) {
        if (ehConcluida_(dados[j][iSt])) return null; // já concluída: edição de correção
        break;
      }
    }
    return negar_('Para concluir use o botão Concluir (a baixa é feita pelo servidor).');
  }
  return null;
}

// ── Checklist do PM (3c) ─────────────────────────────────────────────────────
var PM_RESULTADOS = ['OK', 'CORRIGI', 'CORRETIVA', 'PARAR'];
var PM_ORDEM_FREQ = ['Q', 'M', 'T', 'S', 'A'];

// Itens que a OS da chave exige: ativos, do(s) modelo(s) dos planos da ocorrência, com Freq <= frequência da OS (cascata).
function pmItensExigidos_(modelos, freq, itensRows) {
  var r = PM_ORDEM_FREQ.indexOf(freq), out = [];
  itensRows.forEach(function(it) {
    if (!ativoSim_(it.Ativo)) return;
    if (modelos.indexOf(String(it.Modelo).trim()) < 0) return;
    var fi = PM_ORDEM_FREQ.indexOf(String(it.Freq).trim());
    if (fi < 0 || fi > r) return;
    out.push(it);
  });
  return out;
}

// Valida a lista enviada contra os itens exigidos. Puro. Devolve '' ou a mensagem.
function pmChecklistValidar_(enviados, exigidos) {
  var porId = {}, vistos = {};
  exigidos.forEach(function(it) { porId[String(it.ID_Item).trim()] = it; });
  for (var i = 0; i < enviados.length; i++) {
    var e = enviados[i] || {}, id = String(e.ID_Item === undefined ? '' : e.ID_Item).trim();
    if (!own_(porId, id)) return 'Item fora do checklist desta OS: ' + id;
    if (own_(vistos, id)) return 'Item repetido na lista: ' + id;
    vistos[id] = 1;
    if (PM_RESULTADOS.indexOf(e.Resultado) < 0) return 'Resultado inválido no item ' + id + ' (use OK, CORRIGI, CORRETIVA ou PARAR).';
    if (e.Resultado !== 'OK' && String(e.Observacao || '').trim().length < 3) return 'Descreva o problema no item ' + id + ' (observação obrigatória quando não está OK).';
    if (String(e.Observacao || '').length > 1000) return 'Observação longa demais no item ' + id + '.';
    if (e.Foto_URL && !/^https:\/\//.test(String(e.Foto_URL))) return 'Endereço de foto inválido no item ' + id + '.';
  }
  return '';
}

// POST pmGravarChecklist — única porta de escrita em ExecucaoItens (v18 tirou o append genérico).
// d: { chave:'ID_Maquina|AAAA-MM-DD', itens:[{ID_Item,Resultado,Observacao,Foto_URL}], finalizar:bool, manutentor, feitaEm?, osNumero? }
// Só a ocorrência que existe na grade de PM é aceita. CORRETIVA/PARAR abrem O.S. corretiva (PARAR = prioridade 1).
// A OS do PM só conta como feita (Feita_Em) quando finalizar=true e TODOS os itens exigidos têm resultado.
function pmGravarChecklist(sess, d) {
  var usuario = sess ? sess.nome : String(d.usuario || '');
  var m = /^(.+)\|(\d{4}-\d{2}-\d{2})$/.exec(String(d.chave || '').trim());
  if (!m || !PMMotor.dataValida(m[2])) return vErro_('Chave inválida (use ID_Maquina|AAAA-MM-DD).');
  var chave = m[1] + '|' + m[2], idMaq = m[1], venc = m[2];
  if (!Array.isArray(d.itens) || d.itens.length > 600) return vErro_('Lista de itens inválida (máx. 600).');
  var canon = manutentorCanonico_(d.manutentor);
  if (!canon) return vErro_('Manutentor inválido: escolha um usuário ativo de Manutenção ou Administração.');
  var hoje = pmHoje_(), feitaEm = String(d.feitaEm || hoje).trim();
  if (d.finalizar === true && (!PMMotor.dataValida(feitaEm) || feitaEm > hoje)) return vErro_('Data de conclusão inválida ou futura.');
  var osNum = String(d.osNumero || '').trim();
  if (osNum && !/^PL-\d{1,8}$/.test(osNum)) return vErro_('Número de O.S. inválido.');

  var res = comLock(function() {
    var shE = getSheet('execItens');
    var cE = cabecalho_(shE, SCHEMAS.ExecucaoItens);
    if (cE.falta.length) return erroMigracao_(cE.falta, 'ExecucaoItens');
    var shP = getSheet('planejadas');
    var cP = cabecalho_(shP, ['PL_Numero', 'Sala', 'Maquina', 'Tag_Maquina', 'Tipo', 'Prioridade', 'Prazo_Limite', 'Horas_Turno', 'Descricao_Planejada', 'Status', 'Criado_Em']);
    if (cP.falta.length) return erroMigracao_(cP.falta, 'OS_Planejadas');

    var maq = null;
    sheetToObjects(getSheet('maquinas')).forEach(function(x) { if (String(x.ID_Maquina).trim() === idMaq) maq = x; });
    if (!maq) return vErro_('ID_Maquina não existe em Maquinas: ' + idMaq, 'NOTFOUND');

    var planos = [];
    sheetToObjects(getSheet('planosPM')).forEach(function(r) {
      if (String(r.ID_Maquina).trim() !== idMaq || !ativoSim_(r.Ativo)) return;
      var p = { id: String(r.ID_Plano).trim(), maquina: idMaq, freq: String(r.Freq).trim().toUpperCase(), primeira: String(r.Primeira).trim(),
                ciclo: r.Ciclo_Dias, tol: r.Tol_Dias, ativo: true, modelo: String(r.Modelo || '').trim() };
      if (!PMMotor.validar(p)) planos.push(p);
    });
    var occ = null;
    PMMotor.gerar(planos, venc).forEach(function(o) { if (o.chave === chave) occ = o; });
    if (!occ) return vErro_('Esta chave não existe na grade de PM (máquina/data sem plano ativo).', 'NOTFOUND');
    var modelos = [];
    planos.forEach(function(p) { if (occ.planos.indexOf(p.id) >= 0 && p.modelo && modelos.indexOf(p.modelo) < 0) modelos.push(p.modelo); });
    if (!modelos.length) return vErro_('Os planos desta ocorrência não têm Modelo definido.');

    var exigidos = pmItensExigidos_(modelos, occ.freq, sheetToObjects(getSheet('modelosItens')));
    if (!exigidos.length) return vErro_('Nenhum item de checklist cadastrado para ' + modelos.join(', ') + ' na frequência ' + occ.freq + '.');
    var erroLista = pmChecklistValidar_(d.itens, exigidos);
    if (erroLista) return vErro_(erroLista);

    var dados = shE.getDataRange().getValues(), h = dados[0];
    var iCh = h.indexOf('Chave'), iId = h.indexOf('ID_Exec'), iFe = h.indexOf('Feita_Em'), iRes = h.indexOf('Resultado');
    var existentes = {}, linhasChave = [], jaFinal = false;
    for (var i = 1; i < dados.length; i++) {
      if (String(dados[i][iCh]).trim() !== chave) continue;
      existentes[String(dados[i][iId])] = { res: String(dados[i][iRes]), linha: i };
      linhasChave.push(i);
      if (String(dados[i][iFe]).trim()) jaFinal = true;
    }
    var novos = d.itens.filter(function(e) { return !own_(existentes, chave + '|' + String(e.ID_Item).trim()); });
    var conflito = d.itens.filter(function(e) { var x = existentes[chave + '|' + String(e.ID_Item).trim()]; return x && x.res !== e.Resultado; });
    if (conflito.length) return vErro_('Item já registrado com outro resultado: ' + String(conflito[0].ID_Item) + '. Só a administração corrige.', 'DUP');
    if (jaFinal && novos.length) return vErro_('Esta ocorrência já foi finalizada.', 'JA_FINALIZADA');

    var totalApos = linhasChave.length + novos.length;
    var faltam = [];
    if (d.finalizar === true) {
      var ja = {}; Object.keys(existentes).forEach(function(k) { ja[k] = 1; });
      novos.forEach(function(e) { ja[chave + '|' + String(e.ID_Item).trim()] = 1; });
      exigidos.forEach(function(it) { if (!ja[chave + '|' + String(it.ID_Item).trim()]) faltam.push(String(it.ID_Item).trim()); });
      if (faltam.length) return vErro_('Faltam ' + faltam.length + ' item(ns) para finalizar: ' + faltam.slice(0, 10).join(', ') + (faltam.length > 10 ? '…' : ''));
      if (jaFinal && !novos.length) return { ok: true, duplicataEvitada: true, gravados: 0, finalizada: true, corretivas: [] };
    }

    var porId = {}; exigidos.forEach(function(it) { porId[String(it.ID_Item).trim()] = it; });
    var agora = new Date().toISOString(), corretivas = [], linhasNovas = [];
    novos.forEach(function(e) {
      var id = String(e.ID_Item).trim(), it = porId[id], osCor = '';
      if (e.Resultado === 'CORRETIVA' || e.Resultado === 'PARAR') {
        var parar = e.Resultado === 'PARAR';
        var prazo = parar ? hoje : pmSomaDias_(hoje, PM_PRAZO_CORRETIVA_DIAS);
        var r = appendComNumero_('planejadas', 'PL_Numero', 'PL-', {
          Sala: maq.Sala, Maquina: maq.Nome, Tag_Maquina: maq.Tag || '', Tipo: 'Corretiva', Prioridade: parar ? '1' : '2',
          Prazo_Limite: prazo, Horas_Turno: 10, Status: 'Pendente', Criado_Em: agora,
          Descricao_Planejada: '[PM ' + chave + '] ' + String(it.Descricao).trim() + ' — ' + String(e.Observacao).trim()
        });
        if (!r.ok) throw new Error('Falha ao abrir a corretiva do item ' + id + ': ' + (r.error || ''));
        osCor = r.numero; corretivas.push({ item: id, os: r.numero, prioridade: parar ? '1' : '2' });
      }
      var reg = {
        ID_Exec: chave + '|' + id, OS_Numero: osNum, Chave: chave, ID_Maquina: idMaq, Venc: venc, Tol_Ate: occ.tolAte,
        Feita_Em: '', Manutentor: canon, Modelo: String(it.Modelo).trim(), Disciplina: String(it.Disciplina).trim(),
        Ordem: it.Ordem, Item: String(it.Descricao).trim(), Resultado: e.Resultado, Observacao: String(e.Observacao || '').trim(),
        Foto_URL: String(e.Foto_URL || ''), OS_Corretiva: osCor, Criado_Em: agora, Idempotency_Key: ''
      };
      linhasNovas.push(h.map(function(c) { return reg[c] !== undefined ? reg[c] : ''; }));
    });
    if (d.finalizar === true) {
      var cFe = iFe + 1;
      linhasNovas.forEach(function(l) { l[iFe] = feitaEm; });
      linhasChave.forEach(function(li) { shE.getRange(li + 1, cFe).setNumberFormat('@').setValue(feitaEm); });
    }
    if (linhasNovas.length) shE.getRange(shE.getLastRow() + 1, 1, linhasNovas.length, h.length).setValues(linhasNovas);
    return { ok: true, gravados: linhasNovas.length, ja_registrados: d.itens.length - novos.length, total: totalApos,
             exigidos: exigidos.length, finalizada: d.finalizar === true, corretivas: corretivas };
  });
  logGravacao(usuario, 'pmGravarChecklist', 'execItens', chave, res.ok ? 'sucesso' : 'falha', res.error || ((res.gravados || 0) + ' item(ns)'));
  return res;
}

// ── Importador dos modelos (3b) ──────────────────────────────────────────────
// Lê a planilha preenchida pelo PCM (Google Sheets, aba "Itens") e grava em ModelosItens com a MESMA regra do servidor.
// Tudo ou nada POR MODELO: um erro em qualquer linha de um modelo deixa o modelo inteiro de fora (checklist pela metade engana).
// Idempotente por ID_Item. Nunca apaga linha: "APAGAR" na Obs_PCM vira Ativo = Nao. Texto livre na Obs_PCM NÃO altera a Descricao.
var PM_IMPORT_PLANILHA_ID  = '';    // cole aqui o ID da planilha do PCM (Google Sheets) antes de rodar
var PM_IMPORT_ABA          = 'Itens';
var PM_IMPORT_OBS_VIRA_DESCRICAO = false; // true = texto da Obs_PCM (≠ APAGAR) substitui a Descricao

function pmImportarCalc_(fonte, existentes, opts) {
  opts = opts || {};
  var erros = [], avisos = [], ignoradas = [], validas = [], vistos = {}, porModelo = {};
  var ex = {}; existentes.forEach(function(r) { ex[String(r.ID_Item).trim()] = r; });
  fonte.forEach(function(r, n) {
    var linha = n + 2;
    var id = String(r.ID_Item === undefined ? '' : r.ID_Item).trim();
    var desc = String(r.Descricao === undefined ? '' : r.Descricao).replace(/\s+/g, ' ').trim();
    if (!id && !desc) return; // linha em branco
    var obs = String(r.Obs_PCM === undefined ? '' : r.Obs_PCM).trim();
    var modelo = String(r.Modelo === undefined ? '' : r.Modelo).trim();
    var falhas = [];
    if (!/^[A-Z0-9][A-Z0-9-]{2,60}$/.test(id)) falhas.push('ID_Item inválido');
    if (own_(vistos, id)) falhas.push('ID_Item repetido na planilha (linha ' + vistos[id] + ')'); else if (id) vistos[id] = linha;
    if (!modelo || modelo.length > 60) falhas.push('Modelo vazio ou longo');
    var disc = normLower_(r.Disciplina);
    disc = disc === 'mecanico' ? 'Mecanico' : disc === 'eletrico' ? 'Eletrico' : '';
    if (!disc) falhas.push('Disciplina inválida (Mecanico ou Eletrico)');
    var ordem = Number(r.Ordem);
    if (!isFinite(ordem) || Math.floor(ordem) !== ordem || ordem < 1 || ordem > 9999) falhas.push('Ordem inválida');
    var freqTxt = String(r.Freq === undefined ? '' : r.Freq).trim().toUpperCase();
    if (!freqTxt) falhas.push('Freq vazia (o PCM ainda não preencheu)'); else if (!/^[QMTSA]$/.test(freqTxt)) falhas.push('Freq inválida (' + freqTxt + ')');
    var atv = normLower_(r.Ativo === undefined || String(r.Ativo).trim() === '' ? 'sim' : r.Ativo);
    var ativo = atv === 'sim' ? 'Sim' : (atv === 'nao' ? 'Nao' : '');
    if (!ativo) falhas.push('Ativo inválido (Sim ou Nao)');
    if (obs.toUpperCase() === 'APAGAR') {
      if (own_(ex, id)) validas.push({ linha: linha, apagar: true, id: id, modelo: modelo || String(ex[id].Modelo).trim() });
      else ignoradas.push({ linha: linha, id: id, motivo: 'APAGAR: não importado' });
      return;
    }
    if (obs) {
      if (opts.obsViraDescricao) desc = obs.replace(/\s+/g, ' ');
      else avisos.push({ linha: linha, id: id, motivo: 'Obs_PCM tem texto e NÃO foi aplicada: "' + obs.substring(0, 80) + '"' });
    }
    if (desc.length < 3 || desc.length > 500) falhas.push('Descricao vazia ou acima de 500 caracteres');
    if (falhas.length) { erros.push({ linha: linha, id: id, modelo: modelo, motivo: falhas.join('; ') }); (porModelo[modelo] = porModelo[modelo] || {}).erro = true; return; }
    validas.push({ linha: linha, id: id, modelo: modelo, obj: { ID_Item: id, Modelo: modelo, Disciplina: disc, Ordem: ordem, Descricao: desc, Ativo: ativo, Freq: freqTxt } });
  });
  var modelosComErro = {};
  erros.forEach(function(e) { if (e.modelo) modelosComErro[e.modelo] = 1; });
  var novos = [], atualizar = [], apagar = [], iguais = 0, excluidos = [];
  validas.forEach(function(x) {
    if (own_(modelosComErro, x.modelo)) { excluidos.push({ linha: x.linha, id: x.id, modelo: x.modelo, motivo: 'modelo com erro em outra linha: nada deste modelo foi importado' }); return; }
    if (x.apagar) { if (normLower_(ex[x.id].Ativo) !== 'nao') apagar.push(x.id); else iguais++; return; }
    var a = ex[x.id];
    if (!a) { novos.push(x.obj); return; }
    var igual = String(a.Modelo).trim() === x.obj.Modelo && normLower_(a.Disciplina) === normLower_(x.obj.Disciplina) &&
                Number(a.Ordem) === x.obj.Ordem && String(a.Descricao).trim() === x.obj.Descricao &&
                normLower_(a.Ativo || 'sim') === normLower_(x.obj.Ativo) && String(a.Freq).trim().toUpperCase() === x.obj.Freq;
    if (igual) iguais++; else atualizar.push(x.obj);
  });
  return { novos: novos, atualizar: atualizar, apagar: apagar, iguais: iguais, erros: erros, avisos: avisos,
           ignoradas: ignoradas, excluidos: excluidos, modelosComErro: Object.keys(modelosComErro) };
}

function pmImportarLer_() {
  if (!PM_IMPORT_PLANILHA_ID) throw new Error('Preencha PM_IMPORT_PLANILHA_ID com o ID da planilha do PCM.');
  var sh = SpreadsheetApp.openById(PM_IMPORT_PLANILHA_ID).getSheetByName(PM_IMPORT_ABA);
  if (!sh) throw new Error('A planilha não tem a aba "' + PM_IMPORT_ABA + '".');
  var v = sh.getDataRange().getValues(), h = v[0].map(function(c) { return String(c).trim(); });
  ['ID_Item', 'Modelo', 'Disciplina', 'Ordem', 'Descricao', 'Freq'].forEach(function(c) {
    if (h.indexOf(c) < 0) throw new Error('Coluna ausente na planilha do PCM: ' + c);
  });
  return v.slice(1).map(function(l) { var o = {}; h.forEach(function(c, j) { o[c] = l[j]; }); return o; });
}

function pmImportarLog_(r, real) {
  Logger.log((real ? 'IMPORTAÇÃO REAL' : 'PRÉVIA (nada foi gravado)') + ' | novos ' + r.novos.length + ' | atualizar ' + r.atualizar.length +
             ' | desativar (APAGAR) ' + r.apagar.length + ' | iguais ' + r.iguais + ' | erros ' + r.erros.length +
             ' | fora por modelo com erro ' + r.excluidos.length + ' | avisos ' + r.avisos.length);
  r.modelosComErro.forEach(function(m) { Logger.log('MODELO FORA: ' + m); });
  r.erros.slice(0, 40).forEach(function(e) { Logger.log('ERRO linha ' + e.linha + ' ' + e.id + ': ' + e.motivo); });
  r.avisos.slice(0, 40).forEach(function(e) { Logger.log('AVISO linha ' + e.linha + ' ' + e.id + ': ' + e.motivo); });
}

function pmImportarModelosPreview() {
  var r = pmImportarCalc_(pmImportarLer_(), sheetToObjects(getSheet('modelosItens')), { obsViraDescricao: PM_IMPORT_OBS_VIRA_DESCRICAO });
  pmImportarLog_(r, false);
}

function pmImportarModelosReal() {
  var fonte = pmImportarLer_();
  var res = comLock(function() {
    var sh = getSheet('modelosItens'), c = cabecalho_(sh, SCHEMAS.ModelosItens);
    if (c.falta.length) return erroMigracao_(c.falta, 'ModelosItens');
    var r = pmImportarCalc_(fonte, sheetToObjects(sh), { obsViraDescricao: PM_IMPORT_OBS_VIRA_DESCRICAO });
    var dados = sh.getDataRange().getValues(), h = dados[0], iId = h.indexOf('ID_Item'), iAt = h.indexOf('Ativo'), pos = {};
    for (var i = 1; i < dados.length; i++) pos[String(dados[i][iId]).trim()] = i;
    r.atualizar.forEach(function(o) {
      var l = pos[o.ID_Item]; sh.getRange(l + 1, 1, 1, h.length).setValues([h.map(function(col, j) { return o[col] !== undefined ? o[col] : dados[l][j]; })]);
    });
    r.apagar.forEach(function(id) { sh.getRange(pos[id] + 1, iAt + 1).setValue('Nao'); });
    if (r.novos.length) {
      var rows = r.novos.map(function(o) { return h.map(function(col) { return o[col] !== undefined ? o[col] : ''; }); });
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, h.length).setValues(rows);
    }
    return { ok: true, r: r };
  });
  if (!res.ok) { Logger.log('❌ ' + res.error); return; }
  pmImportarLog_(res.r, true);
  logGravacao('editor', 'pmImportarModelos', 'modelosItens', '', 'sucesso', res.r.novos.length + ' novos, ' + res.r.atualizar.length + ' atualizados');
}

// Rodar UMA vez no editor após colar o v18 (pode repetir): acrescenta no fim as colunas novas
// (Baixado_Por, Impressa_Em, Impressa_Por) e deixa Impressa_Em como TEXTO. Não mexe nos dados.
function migrarColunasV18() {
  var n = 0;
  ['ordens', 'planejadas', 'solicitacoes', 'execItens'].forEach(function(k) { n += pmGarantirColunas_(k); });
  ['planejadas', 'solicitacoes'].forEach(function(k) {
    var sh = getSheet(k), h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0], i = h.indexOf('Impressa_Em');
    if (i >= 0) sh.getRange(2, i + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('@');
  });
  Logger.log('✅ Migração v18 concluída: ' + n + ' coluna(s) acrescentada(s).');
}
