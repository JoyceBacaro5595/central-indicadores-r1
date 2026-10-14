/* eslint-disable */
// @ts-nocheck
/* Leitor da planilha "R1 | Agenda 2026" (aba Calendário MKT), copiado do painel realtime (mesma lógica do lp.grupor1.com/calendario).
   Lê o xlsx publicado pelo Google no navegador; o SheetJS vem do jsDelivr, como no painel original. */
/* Leitor da planilha do Calendário R1 — copiado de lp.grupor1.com/calendario (mesma lógica). */
var SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
var FERIADO_COR = '#cccccc';
var COR_CAT = {
  '#38761d': 'mdv',     // CNE
  '#6d9eeb': 'rgv',     // RGV e RGV Processos
  '#0b5394': 'frente',  // De Frente
  '#ff00ff': 'clube',   // Clube R1
  '#9900ff': 'clube',   // reuniões do Clube
  '#b45f06': 'online',  // ZOOM
  '#45818e': 'bf'
};
var COR_IGNORA = { '#00ffff': 1, '#434343': 1, '#666666': 1 }; // gravação, Copa

var CIDADES = [
  ['Manaus', 'AM'], ['Belém', 'PA'], ['São Luís', 'MA'], ['Imperatriz', 'MA'], ['Teresina', 'PI'], ['Chapecó', 'SC'],
  ['Balneário Camboriú', 'SC', 'balneario'], ['Porto Alegre', 'RS'], ['Caxias do Sul', 'RS'], ['Vitória da Conquista', 'BA'],
  ['Vitória', 'ES'], ['Uberlândia', 'MG'], ['Belo Horizonte', 'MG', 'bh'], ['Londrina', 'PR'], ['Maringá', 'PR'], ['Cascavel', 'PR'],
  ['Pouso Alegre', 'MG', 'p alegre'], ['Passo Fundo', 'RS'], ['Criciúma', 'SC'], ['Florianópolis', 'SC'], ['Rondonópolis', 'MT'],
  ['Dourados', 'MS'], ['Caruaru', 'PE'], ['Rio de Janeiro', 'RJ'], ['Goiânia', 'GO'], ['Curitiba', 'PR'], ['Ponta Grossa', 'PR'],
  ['Petrolina (PE) e Juazeiro', 'BA', 'petrolina'], ['Salvador', 'BA'], ['Feira de Santana', 'BA'], ['Aracaju', 'SE'], ['Maceió', 'AL'],
  ['Juiz de Fora', 'MG'], ['Mossoró', 'RN'], ['Natal', 'RN'], ['Fortaleza', 'CE'], ['Campina Grande', 'PB'], ['João Pessoa', 'PB'],
  ['Palmas', 'TO'], ['Brasília', 'DF'], ['Sinop', 'MT'], ['Cuiabá', 'MT'], ['Ribeirão Preto', 'SP'], ['Rio Grande', 'RS'],
  ['Pelotas', 'RS'], ['Canoas', 'RS'], ['Itajaí', 'SC'], ['Campinas', 'SP'], ['Foz do Iguaçu', 'PR'], ['Montes Claros', 'MG'],
  ['Ipatinga', 'MG'], ['Recife', 'PE'], ['Rio Branco', 'AC'], ['Boa Vista', 'RR'], ['Porto Velho', 'RO'],
  ['Barreiras e Luís Eduardo Magalhães', 'BA', 'barreiras'], ['São Paulo', 'SP', 'sp'], ['Campo Grande', 'MS'], ['Tocantins', 'TO']
];

function sem_(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function cidade_(txt) {
  if (/paragua/i.test(txt)) return 'Paraguai';
  var n = sem_(txt.replace(/\([A-Z]{2}\)/g, ''));
  for (var i = 0; i < CIDADES.length; i++) {
    var c = CIDADES[i], k = sem_(c[0]);
    if (n === k || n.indexOf(k) === 0 || (c[2] && (n === c[2] || n.indexOf(c[2] + ' ') === 0 || n.indexOf(c[2]) === 0))) {
      return c[0] + ' (' + c[1] + ')';
    }
  }
  return txt.trim();
}

function ehData_(v) {
  if (v instanceof Date) return true;
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(T|$)/.test(v);
}

var MINUSC = { de: 1, da: 1, do: 1, das: 1, dos: 1, com: 1, e: 1, a: 1, o: 1, em: 1, no: 1, na: 1, para: 1 };
function titulo_(s) {
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().split(' ').map(function (w, i) {
    if (/^(sp|bh|rj|df|mkt|r1|rgv|cne|mdv|t8m)$/.test(w)) return w.toUpperCase();
    if (i > 0 && MINUSC[w]) return w;
    var j = w.charAt(0) === '(' ? 1 : 0;
    return w.slice(0, j) + w.charAt(j).toUpperCase() + w.slice(j + 1);
  }).join(' ');
}

function hora_(s) {
  var m = /(\d{1,2}h(?:\d{2})?)(\s*(?:[–-]|e)\s*\d{1,2}h(?:\d{2})?)?/.exec(s);
  return m ? m[0].replace(/\s+/g, ' ').trim() : '';
}

function classificar_(txt, cor) {
  var u = sem_(txt).toUpperCase();
  if (/^GRAV|GRAVACAO|COPA DO MUNDO|ANIVERSARIO/.test(u) || COR_IGNORA[cor]) return null;
  if (/^(JANEIRO|FEVEREIRO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)$/.test(u)) return null;
  if (/CHINA/.test(u)) return 'china';
  if (/BLACK FRIDAY/.test(u) && !/ZOOM/.test(u)) return 'bf';
  if (/PROCESSOS/.test(u)) return 'proc';
  if (/METODO RGV/.test(u)) return 'rgv';
  if (/DE FRENTE/.test(u)) return 'frente';
  if (/DONO COM DONO/.test(u)) return 'dono';
  if (/CLUBE|CONFRARIA|COMUNIDADE R1/.test(u)) return 'clube';
  if (/^CNE\b/.test(u)) return 'mdv';
  if (/^ZOOM|WEBINAR MDV/.test(u)) return 'online';
  if (/CAFE|PALESTRA|PODCAST|LIVE|CONAREC|ENTREVISTA|RICARDO/.test(u)) return 'ricardo';
  return COR_CAT[cor] || 'outros';
}

function montar_(txt, cat) {
  var linhas = txt.split(/\n/).map(function (l) { return l.replace(/\s*\/\s*$/, '').replace(/^\s*\/\s*/, '').trim(); }).filter(String);
  var h = hora_(txt);
  var semHora = function (l) { return h ? l.replace(h, '').replace(/\s{2,}/g, ' ').trim() : l; };
  var u = sem_(txt).toUpperCase();
  var ev = { cat: cat, titulo: '', local: '', hora: h };
  if (cat === 'mdv') {
    if (/^CNE\b/.test(u)) {
      var resto = linhas.join(' ').replace(/^CNE\s*/i, '').replace(/\s*\/\s*/g, ' ').trim();
      ev.titulo = 'Turnê Máquina de Vendas';
      ev.local = cidade_(resto);
    } else {
      ev.titulo = titulo_(linhas.join(' · '));
      if (/^BH\b/.test(u)) ev.local = 'Belo Horizonte (MG)';
    }
  } else if (cat === 'rgv') {
    ev.titulo = titulo_(linhas[0]).replace(/^Metodo/i, 'Método');
    ev.local = 'São Paulo';
  } else if (cat === 'proc') {
    ev.titulo = /WEBINAR/.test(u) ? 'Webinar ao vivo RGV Processos' : 'RGV Processos';
    if (/WEBINAR/.test(u)) ev.local = 'Online';
  } else if (cat === 'frente') {
    ev.titulo = 'De Frente com o Ricardo';
  } else if (cat === 'dono') {
    ev.titulo = 'Dono com Dono';
    var l = semHora(linhas.join(' ').replace(/dono com dono/i, '')).trim();
    ev.local = l ? titulo_(l.toUpperCase() === l ? l : l.charAt(0).toUpperCase() + l.slice(1)) : '';
  } else if (cat === 'clube') {
    ev.titulo = /^CLUBE R1$/.test(u) ? 'Encontro Clube R1' : titulo_(linhas.join(' ').replace(/\s+-\s+/, ' — '));
  } else if (cat === 'online') {
    var quem = /RODRIGO/.test(u) ? 'Rodrigo Nunes' : 'Ricardo';
    ev.titulo = /^ZOOM/.test(u) ? 'Zoom ao vivo com ' + quem + (/BLACK FRIDAY/.test(u) ? ' — Black Friday' : '') : titulo_(linhas.join(' '));
    ev.local = 'Online';
  } else if (cat === 'china') {
    ev.titulo = 'Missão China'; ev.local = 'China';
  } else if (cat === 'bf') {
    ev.titulo = titulo_(semHora(linhas.join(' ')));
  } else {
    ev.titulo = linhas.map(semHora).filter(String).map(titulo_).join(' · ');
    var m = /\b(SP|BH)\b\s*$/.exec(semHora(linhas[0]));
    if (m && linhas.length === 1) { ev.titulo = ev.titulo.replace(/\s*\b(SP|BH)\b\s*$/, ''); ev.local = m[1] === 'SP' ? 'São Paulo' : 'Belo Horizonte'; }
    ev.titulo = ev.titulo.replace(/\s*\/\s*$/, '').replace(/^LIVE\b/, 'Live');
    if (/^Café$/i.test(ev.titulo)) ev.titulo = 'Café com Ricardo';
    if (/^Live Ricardo$/i.test(ev.titulo)) ev.titulo = 'Live do Ricardo';
    if (!ev.local && /\(online\)/i.test(ev.titulo)) { ev.titulo = ev.titulo.replace(/\s*\(online\)/i, ''); ev.local = 'Online'; }
  }
  return ev;
}

export function lerGrade_(V, B, merges, fmt) {
  var R = V.length, C = R ? V[0].length : 0;
  var mTopo = {};
  merges.forEach(function (m) { mTopo[m[0] + ',' + m[1]] = m; });
  var toStr = function (v) { return v instanceof Date ? fmt(v) : String(v).slice(0, 10); };

  // blocos de mês: linhas com D S T Q Q S S
  var blocos = [];
  for (var r = 0; r < R; r++) for (var c = 0; c + 6 < C; c++) {
    var ok = true;
    for (var k = 0; k < 7; k++) if (String(V[r][c + k]).trim().toUpperCase() !== SEMANA[k]) { ok = false; break; }
    if (ok) blocos.push({ r: r, c: c });
  }
  blocos.forEach(function (b) {
    var prox = blocos.filter(function (x) { return x.c === b.c && x.r > b.r; })[0];
    b.fim = prox ? prox.r : R;
  });

  var eventos = [], feriados = {};
  blocos.forEach(function (b) {
    var dias = null;
    for (var r = b.r + 1; r < b.fim; r++) {
      var linhaDias = false;
      for (var k = 0; k < 7; k++) if (ehData_(V[r][b.c + k])) { linhaDias = true; break; }
      if (linhaDias) {
        dias = [];
        for (k = 0; k < 7; k++) {
          var v = V[r][b.c + k];
          dias[k] = ehData_(v) ? toStr(v) : null;
          if (dias[k] && String(B[r][b.c + k]).toLowerCase() === FERIADO_COR) feriados[dias[k]] = 1;
        }
        continue;
      }
      if (!dias) continue;
      for (k = 0; k < 7; k++) {
        var txt = String(V[r][b.c + k] == null ? '' : V[r][b.c + k]).trim();
        if (txt.length < 2 || !dias[k]) continue;
        var cor = String(B[r][b.c + k]).toLowerCase();
        var cat = classificar_(txt, cor);
        if (!cat) continue;
        var m = mTopo[r + ',' + (b.c + k)], kf = k;
        if (m) kf = Math.min(6, m[3] - b.c);
        while (kf > k && !dias[kf]) kf--;
        var ev = montar_(txt, cat);
        ev.inicio = dias[k]; ev.fim = dias[kf];
        eventos.push(ev);
      }
    }
  });

  eventos.sort(function (a, b) { return a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : 0; });

  // junta o mesmo evento que atravessa semanas/meses (ex.: Missão China, RGV 29/09–01/10)
  var dia = function (s, n) { var p = s.split('-'), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)); return d.toISOString().slice(0, 10); };
  var junt = [];
  eventos.forEach(function (e) {
    var ant = junt.filter(function (x) { return x.cat === e.cat && x.titulo === e.titulo && x.local === e.local && dia(x.fim, 1) === e.inicio; })[0];
    if (ant) { if (e.fim > ant.fim) ant.fim = e.fim; return; }
    junt.push(e);
  });
  // remove duplicatas exatas (mesmo evento escrito em duas células do mesmo dia)
  var vistos = {}, fin = [];
  junt.forEach(function (e) { var key = [e.cat, e.titulo, e.local, e.inicio, e.fim].join('|'); if (!vistos[key]) { vistos[key] = 1; fin.push(e); } });

  return { eventos: fin, feriados: Object.keys(feriados).sort() };
}

export function r1GradeXlsx(XLSX, buf) {
  var wb = XLSX.read(buf, { type: 'array', cellStyles: true });
  var ws = wb.Sheets['Calendário MKT'] || wb.Sheets[wb.SheetNames[0]];
  var rg = XLSX.utils.decode_range(ws['!ref']), V = [], B = [];
  for (var r = 0; r <= rg.e.r; r++) {
    var rv = [], rb = [];
    for (var c = 0; c <= rg.e.c; c++) {
      var cell = ws[XLSX.utils.encode_cell({ r: r, c: c })], v = '', bg = '#ffffff';
      if (cell) {
        v = cell.v == null ? '' : cell.v;
        if (cell.t === 'n' && cell.z && XLSX.SSF.is_date(cell.z)) {
          var p = XLSX.SSF.parse_date_code(cell.v);
          v = p.y + '-' + String(p.m).padStart(2, '0') + '-' + String(p.d).padStart(2, '0');
        }
        if (cell.s && cell.s.patternType === 'solid' && cell.s.fgColor && cell.s.fgColor.rgb) bg = '#' + String(cell.s.fgColor.rgb).slice(-6).toLowerCase();
      }
      rv.push(v); rb.push(bg);
    }
    V.push(rv); B.push(rb);
  }
  var merges = (ws['!merges'] || []).map(function (m) { return [m.s.r, m.s.c, m.e.r, m.e.c]; });
  return { values: V, bg: B, merges: merges };
}




export const PLANILHA_ID = '1guuOpDFILzhUNXLePIpwoXNeK2IQUq22gJmZxzlQvgc';
const LIB = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.mini.min.js';

export interface EventoAgenda { cat: string; titulo: string; local: string; hora: string; inicio: string; fim: string }

function carregarLib(): Promise<any> {
  if ((window as any).XLSX) return Promise.resolve((window as any).XLSX);
  return new Promise((ok, erro) => {
    const s = document.createElement('script');
    s.src = LIB; s.onload = () => ok((window as any).XLSX); s.onerror = erro;
    document.head.appendChild(s);
  });
}

/** Baixa a planilha ao vivo e devolve os eventos já classificados (lança erro se não conseguir ler). */
export async function lerAgendaAoVivo(): Promise<EventoAgenda[]> {
  const XLSX = await carregarLib();
  const r = await fetch(`https://docs.google.com/spreadsheets/d/${PLANILHA_ID}/export?format=xlsx&t=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const g = r1GradeXlsx(XLSX, new Uint8Array(await r.arrayBuffer()));
  const o = lerGrade_(g.values, g.bg, g.merges, (d) => d);
  if (!o.eventos.length) throw new Error('planilha sem eventos');
  return o.eventos;
}
