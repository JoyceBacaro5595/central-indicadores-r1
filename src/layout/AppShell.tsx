import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, CalendarRange, FileText, UserCheck, ShoppingCart, Waypoints, Users, Settings, SlidersHorizontal, Menu, X, ChevronDown, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';

type Item = { to: string; rotulo: string; icone: typeof LayoutDashboard; recurso?: string; fim?: boolean; extra?: string[] };
type Secao = { titulo: string; recurso?: string; itens: Item[] };

const SECOES: Secao[] = [
  {
    titulo: 'Máquina de Vendas',
    itens: [
      { to: '/central', rotulo: 'Visão geral', icone: LayoutDashboard, fim: true, extra: ['/central/online'], recurso: 'painel' },
      { to: '/central/eventos', rotulo: 'Eventos e metas', icone: CalendarRange, recurso: 'eventos' },
      { to: '/central/relatorio', rotulo: 'Relatório', icone: FileText, recurso: 'relatorio' },
      { to: '/central/checkins', rotulo: 'Check-ins', icone: UserCheck, recurso: 'presenca' },
      { to: '/central/recuperacao', rotulo: 'Recuperação', icone: ShoppingCart, recurso: 'recuperacao' },
    ],
  },
  {
    titulo: 'Perpétuo RGV',
    itens: [
      { to: '/perpetuo/trafego', rotulo: 'Fluxo Marketing', icone: Waypoints, recurso: 'perpetuo' },
    ],
  },
  {
    titulo: 'Usuários e Permissões',
    recurso: 'usuarios',
    itens: [{ to: '/central/usuarios', rotulo: 'Usuários e permissões', icone: Users }],
  },
  {
    titulo: 'Gerenciador',
    itens: [
      { to: '/central/gerenciador', rotulo: 'Integrações e logs', icone: Settings, recurso: 'gerenciador' },
      { to: '/central/regras', rotulo: 'Regras de segmentação', icone: SlidersHorizontal, recurso: 'regras' },
    ],
  },
];

/* Sidebar recolhível no desktop (pedido da Joyce, 09/10): só ícones quando compacta; a escolha fica no navegador. */
const CHAVE_COMPACTA = 'central.sidebarCompacta';
const lerCompacta = () => { try { return localStorage.getItem(CHAVE_COMPACTA) === '1'; } catch { return false; } };

/** Casca do app no estilo SaaS: sidebar fixa à esquerda com as áreas, conteúdo à direita. */
export default function AppShell() {
  const { pode } = useAuth();
  const [aberta, setAberta] = useState(false);
  const [compacta, setCompacta] = useState<boolean>(() => lerCompacta());
  const alternarCompacta = () => setCompacta((v) => { const novo = !v; try { localStorage.setItem(CHAVE_COMPACTA, novo ? '1' : '0'); } catch { /* preferência só desta sessão */ } return novo; });
  const loc = useLocation();
  const [recolhidas, setRecolhidas] = useState<Record<string, boolean>>(() => Object.fromEntries(SECOES.map(s => [s.titulo, true])));

  useEffect(() => { setAberta(false); }, [loc.pathname]);

  const secoes = SECOES
    .filter((s) => !s.recurso || pode(s.recurso))
    .map((s) => ({ ...s, itens: s.itens.filter((i) => !i.recurso || pode(i.recurso)) }))
    .filter((s) => s.itens.length > 0);

  return (
    <div className="min-h-screen bg-background md:flex">
      <button
        onClick={() => setAberta((v) => !v)}
        className="md:hidden print:hidden fixed top-3 left-3 z-50 w-9 h-9 rounded-lg surface-elevated flex items-center justify-center text-foreground"
        title={aberta ? 'Fechar menu' : 'Abrir menu'}
      >
        {aberta ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
      </button>
      {aberta && <div className="md:hidden fixed inset-0 z-30 bg-black/50" onClick={() => setAberta(false)} />}

      <aside
        className={`print:hidden fixed md:sticky top-0 z-40 h-screen shrink-0 flex flex-col border-r border-border bg-background transition-[transform,width] duration-200 ${compacta ? 'w-60 md:w-16' : 'w-60'} ${
          aberta ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
        data-compacta={compacta ? 'true' : undefined}
      >
        <div className={`flex items-center gap-3 h-[60px] border-b border-border ${compacta ? 'px-5 md:px-0 md:justify-center' : 'px-5'}`}>
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0" title="Central R1 · Indicadores">
            <span className="text-primary text-sm font-black">R1</span>
          </div>
          <div className={compacta ? 'md:hidden' : ''}>
            <p className="text-sm font-extrabold text-foreground tracking-wide leading-tight">Central R1</p>
            <p className="text-[10px] text-muted-foreground font-medium">Indicadores</p>
          </div>
        </div>
        <nav className={`flex-1 overflow-y-auto py-4 ${compacta ? 'px-3 md:px-2 space-y-5 md:space-y-3' : 'px-3 space-y-5'}`}>
          {secoes.map((s) => (
            <div key={s.titulo}>
              <button type="button" aria-expanded={!recolhidas[s.titulo]} aria-controls={`secao-${SECOES.findIndex(secao => secao.titulo === s.titulo)}`} onClick={() => setRecolhidas(atual => ({ ...atual, [s.titulo]: !atual[s.titulo] }))} className={`w-full flex items-center justify-between gap-2 px-2 py-2 mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 rounded ${compacta ? 'md:hidden' : ''}`}>
                <span>{s.titulo}</span><ChevronDown className={`w-3.5 h-3.5 transition-transform ${recolhidas[s.titulo] ? '-rotate-90' : ''}`} aria-hidden="true" />
              </button>
              {compacta && <div className="hidden md:block mx-2 mb-2 border-t border-border" aria-hidden="true" />}
              <ul id={`secao-${SECOES.findIndex(secao => secao.titulo === s.titulo)}`} hidden={!!recolhidas[s.titulo] && !compacta} className="space-y-0.5">
                {s.itens.map((i) => (
                  <li key={i.to}>
                    <NavLink
                      to={i.to}
                      end={i.fim}
                      title={i.rotulo}
                      aria-label={i.rotulo}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors ${compacta ? 'md:justify-center md:px-0' : ''} ${
                          isActive || i.extra?.includes(loc.pathname) ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                        }`
                      }
                    >
                      <i.icone className="w-4 h-4 shrink-0" />
                      <span className={`truncate ${compacta ? 'md:hidden' : ''}`}>{i.rotulo}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className={`border-t border-border flex items-center ${compacta ? 'px-5 md:px-0 md:justify-center' : 'px-3'} py-2`}>
          <p className={`flex-1 px-2 text-[10px] text-muted-foreground ${compacta ? 'md:hidden' : ''}`}>Grupo R1 · Central de Indicadores</p>
          <button type="button" onClick={alternarCompacta} className="hidden md:flex w-8 h-8 rounded-lg items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary focus-visible:outline focus-visible:outline-2" title={compacta ? 'Expandir menu' : 'Recolher menu'} aria-label={compacta ? 'Expandir menu' : 'Recolher menu'} aria-pressed={compacta}>
            {compacta ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <Suspense fallback={<div role="status" className="p-8 text-sm text-muted-foreground">Carregando conteúdo…</div>}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  );
}
