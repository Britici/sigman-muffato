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
if (typeof module !== 'undefined') module.exports = PMMotor;
