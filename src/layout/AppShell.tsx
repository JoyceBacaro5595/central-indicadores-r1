import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, CalendarRange, FileText, UserCheck, ShoppingCart, Waypoints, Users, Settings, SlidersHorizontal, Menu, X,
} from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';

type Item = { to: string; rotulo: string; icone: typeof LayoutDashboard; recurso?: string; fim?: boolean; extra?: string[] };
type Secao = { titulo: string; recurso?: string; itens: Item[] };

const SECOES: Secao[] = [
  {
    titulo: 'Máquina de Vendas',
    itens: [
      { to: '/central', rotulo: 'Visão geral', icone: LayoutDashboard, fim: true, extra: ['/central/online'] },
      { to: '/central/eventos', rotulo: 'Eventos e metas', icone: CalendarRange },
      { to: '/central/relatorio', rotulo: 'Relatório', icone: FileText },
      { to: '/central/checkins', rotulo: 'Check-ins', icone: UserCheck, recurso: 'presenca' },
      { to: '/central/recuperacao', rotulo: 'Recuperação', icone: ShoppingCart, recurso: 'recuperacao' },
    ],
  },
  {
    titulo: 'Perpétuo RGV',
    itens: [
      { to: '/perpetuo/trafego', rotulo: 'Fluxo de Tráfego', icone: Waypoints },
    ],
  },
  {
    titulo: 'Usuários e Permissões',
    recurso: 'usuarios',
    itens: [{ to: '/central/usuarios', rotulo: 'Usuários e permissões', icone: Users }],
  },
  {
    titulo: 'Gerenciador',
    recurso: 'gerenciador',
    itens: [
      { to: '/central/gerenciador', rotulo: 'Integrações e logs', icone: Settings },
      { to: '/central/regras', rotulo: 'Regras de segmentação', icone: SlidersHorizontal },
    ],
  },
];

/** Casca do app no estilo SaaS: sidebar fixa à esquerda com as áreas, conteúdo à direita. */
export default function AppShell() {
  const { pode } = useAuth();
  const [aberta, setAberta] = useState(false);
  const loc = useLocation();

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
        className={`print:hidden fixed md:sticky top-0 z-40 h-screen w-60 shrink-0 flex flex-col border-r border-border bg-background transition-transform duration-200 ${
          aberta ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="flex items-center gap-3 px-5 h-[60px] border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <span className="text-primary text-sm font-black">R1</span>
          </div>
          <div>
            <p className="text-sm font-extrabold text-foreground tracking-wide leading-tight">Central R1</p>
            <p className="text-[10px] text-muted-foreground font-medium">Indicadores</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {secoes.map((s) => (
            <div key={s.titulo}>
              <p className="px-2 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{s.titulo}</p>
              <ul className="space-y-0.5">
                {s.itens.map((i) => (
                  <li key={i.to}>
                    <NavLink
                      to={i.to}
                      end={i.fim}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                          isActive || i.extra?.includes(loc.pathname) ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                        }`
                      }
                    >
                      <i.icone className="w-4 h-4 shrink-0" />
                      <span className="truncate">{i.rotulo}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <p className="px-5 py-3 text-[10px] text-muted-foreground border-t border-border">Grupo R1 · Central de Indicadores</p>
      </aside>

      <div className="flex-1 min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
