import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "./pages/NotFound.tsx";
import Central from "./pages/Central.tsx";
import Relatorio from "./pages/Relatorio.tsx";
import Login from "./pages/Login.tsx";
import RedefinirSenha from "./pages/RedefinirSenha.tsx";
import Conta from "./pages/Conta.tsx";
import Usuarios from "./pages/Usuarios.tsx";
import Gerenciador from "./pages/Gerenciador.tsx";
import Regras from "./pages/Regras.tsx";
import Eventos from "./pages/Eventos.tsx";
import Checkins from "./pages/Checkins.tsx";
import Recuperacao from "./pages/Recuperacao.tsx";
import Perpetuo from "./pages/Perpetuo.tsx";
import { AuthProvider } from "./auth/AuthProvider.tsx";
import RequireAuth from "./auth/RequireAuth.tsx";
import AppShell from "./layout/AppShell.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/redefinir-senha" element={<RedefinirSenha />} />
          <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<Navigate to="/central" replace />} />
            <Route path="/central" element={<Central />} />
            <Route path="/central/online" element={<Central />} />
            <Route path="/perpetuo" element={<Navigate to="/perpetuo/trafego/campanhas" replace />} />
            <Route path="/perpetuo/trafego" element={<Navigate to="/perpetuo/trafego/campanhas" replace />} />
            <Route path="/perpetuo/trafego/:aba" element={<Perpetuo />} />
            <Route path="/perpetuo/criativos" element={<Navigate to="/perpetuo/trafego/criativos" replace />} />
            <Route path="/perpetuo/lps" element={<Navigate to="/perpetuo/trafego/lps" replace />} />
            <Route path="/central/relatorio" element={<Relatorio />} />
            <Route path="/central/conta" element={<Conta />} />
            <Route path="/central/eventos" element={<Eventos />} />
          <Route element={<RequireAuth recurso="presenca" />}>
            <Route path="/central/checkins" element={<Checkins />} />
          </Route>
          <Route element={<RequireAuth recurso="recuperacao" />}>
            <Route path="/central/recuperacao" element={<Recuperacao />} />
          </Route>
          <Route element={<RequireAuth recurso="gerenciador" />}>
            <Route path="/central/gerenciador" element={<Gerenciador />} />
            <Route path="/central/regras" element={<Regras />} />
          </Route>
          <Route element={<RequireAuth recurso="usuarios" />}>
            <Route path="/central/usuarios" element={<Usuarios />} />
          </Route>
          </Route>
          </Route>
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
