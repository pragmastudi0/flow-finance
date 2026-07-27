import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';

import { LanguageProvider } from './i18n/LanguageProvider.tsx';
import { NavBar } from './components/layout/NavBar.tsx';
import { ROUTES } from './lib/routes.ts';
import { useRequireAuth } from './hooks/useAuth.ts';
import Home from './pages/Home.tsx';
import AuthPage from './pages/AuthPage.tsx';
import Reports from './pages/Reports.tsx';
import Savings from './pages/Savings.tsx';
import Settings from './pages/Settings.tsx';
import CategoriesPage from './pages/CategoriesPage.tsx';
import FixedExpenses from './pages/FixedExpenses.tsx';
import ExchangeRate from './pages/ExchangeRate.tsx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      {/* The single scroll container of the app: pages lay themselves out with
          `min-h-full` and never open a second nested scroller. */}
      <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {children}
      </main>
      <NavBar />
    </div>
  );
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { needsAuth, loading } = useRequireAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (needsAuth) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'ff:session') {
        window.location.reload();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route
        path={ROUTES.home}
        element={
          <AuthGuard>
            <Layout>
              <Home />
            </Layout>
          </AuthGuard>
        }
      />
      <Route path="/Home" element={<Navigate to={ROUTES.home} replace />} />
      <Route
        path={ROUTES.reports}
        element={
          <AuthGuard>
            <Layout>
              <Reports />
            </Layout>
          </AuthGuard>
        }
      />
      <Route
        path={ROUTES.savings}
        element={
          <AuthGuard>
            <Layout>
              <Savings />
            </Layout>
          </AuthGuard>
        }
      />
      <Route
        path={ROUTES.settings}
        element={
          <AuthGuard>
            <Layout>
              <Settings />
            </Layout>
          </AuthGuard>
        }
      />
      <Route
        path={ROUTES.categories}
        element={
          <AuthGuard>
            <Layout>
              <CategoriesPage />
            </Layout>
          </AuthGuard>
        }
      />
      <Route
        path={ROUTES.fixedExpenses}
        element={
          <AuthGuard>
            <Layout>
              <FixedExpenses />
            </Layout>
          </AuthGuard>
        }
      />
      <Route
        path={ROUTES.exchangeRate}
        element={
          <AuthGuard>
            <Layout>
              <ExchangeRate />
            </Layout>
          </AuthGuard>
        }
      />
      <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
        {/* Short-lived: it sits over the header on phones. */}
        <Toaster position="top-center" richColors toastOptions={{ duration: 2000 }} />
      </LanguageProvider>
    </QueryClientProvider>
  );
}
