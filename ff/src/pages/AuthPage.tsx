import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase, isDemoMode } from '@/lib/supabase';
import { registerUser, loginUser, isLoggedIn } from '@/lib/demo';

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    if (isDemoMode()) {
      setHasSession(isLoggedIn());
      setCheckingSession(false);
    } else {
      supabase.auth.getUser().then(({ data }) => {
        setHasSession(!!data?.user);
        setCheckingSession(false);
      });
    }
  }, []);

  if (checkingSession) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (hasSession) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isDemoMode()) {
        if (mode === 'signup') {
          registerUser(email, password, name || undefined);
          toast.success('Cuenta creada');
        } else {
          loginUser(email, password);
          toast.success('Sesión iniciada');
        }
        setHasSession(true);
      } else {
        if (mode === 'signup') {
          const { error } = await supabase.auth.signUp({ email, password });
          if (error) throw error;
          await supabase.auth.signInWithPassword({ email, password });
          toast.success('Cuenta creada');
        } else {
          const { error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) throw error;
          toast.success('Sesión iniciada');
        }
        setHasSession(true);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted/30 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground text-xl font-bold">
              $
            </div>
            <CardTitle className="text-xl">Flow Finance</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === 'login' ? 'Iniciá sesión para continuar' : 'Creá tu cuenta para empezar'}
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Nombre</label>
                  <div className="relative">
                    <UserPlus className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Tu nombre"
                      className="pl-9"
                    />
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    required
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="pl-9"
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" loading={loading}>
                {mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
              </Button>
            </form>

            <div className="mt-4 text-center text-sm text-muted-foreground">
              {mode === 'login' ? (
                <>¿No tenés cuenta?{' '}
                  <button onClick={() => setMode('signup')} className="min-h-12 px-2 py-2 font-medium text-primary hover:underline">
                    Registrate
                  </button>
                </>
              ) : (
                <>¿Ya tenés cuenta?{' '}
                  <button onClick={() => setMode('login')} className="min-h-12 px-2 py-2 font-medium text-primary hover:underline">
                    Iniciá sesión
                  </button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
