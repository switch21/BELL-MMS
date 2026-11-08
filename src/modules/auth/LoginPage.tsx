import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Shield, ArrowRight, CheckCircle2, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { login, usersList } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/dashboard';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const success = await login(email, password);
      if (success) {
        navigate(from, { replace: true });
      } else {
        setError('Identifiants non reconnus ou compte inactif.');
      }
    } catch {
      setError('Une erreur réseau ou système est survenue.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = async (targetEmail: string) => {
    setIsLoading(true);
    setError(null);
    setEmail(targetEmail);
    setPassword('••••••••');
    const success = await login(targetEmail);
    setIsLoading(false);
    if (success) {
      navigate(from, { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-executive-light dark:bg-executive-darkBg flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Logo / Badge */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-executive-dark dark:bg-executive-emerald flex items-center justify-center text-white font-bold text-2xl shadow-lg mb-4">
          BM
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          BELL-MMS
        </h2>
        <p className="mt-1 text-xs text-executive-emerald dark:text-executive-soft font-semibold uppercase tracking-wider">
          Système Intégré de Gestion d'Entreprise — Cameroun
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white dark:bg-executive-darkSurface py-8 px-6 shadow-xl rounded-2xl border border-slate-200 dark:border-executive-darkBorder sm:px-10">
          <form className="space-y-4" onSubmit={handleSubmit}>
            {error && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            <div>
              <Input
                label="Adresse Email professionnelle"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ex: dg@bell-mms.cm"
              />
            </div>

            <div>
              <Input
                label="Mot de passe"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                className="w-full justify-center"
                isLoading={isLoading}
              >
                <Lock className="w-4 h-4 mr-2" />
                Se connecter à l'espace sécurisé
              </Button>
            </div>
          </form>

          {/* Section de sélection rapide pour la recette et démonstration */}
          <div className="mt-8 border-t border-slate-200 dark:border-executive-darkBorder pt-6">
            <p className="text-xs font-semibold text-slate-500 dark:text-executive-darkMuted uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-executive-emerald" />
              Accès directs configurés pour la démonstration :
            </p>
            <div className="grid grid-cols-1 gap-2">
              {usersList.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => handleQuickLogin(user.email)}
                  className="w-full text-left p-2.5 rounded-lg border border-slate-200 dark:border-executive-darkBorder hover:border-executive-emerald dark:hover:border-executive-emerald hover:bg-slate-50 dark:hover:bg-executive-darkBg transition-all flex items-center justify-between group"
                >
                  <div>
                    <p className="text-xs font-semibold text-slate-800 dark:text-executive-darkText group-hover:text-executive-emerald">
                      {user.first_name} {user.last_name}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {user.job_title} ({user.email})
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-executive-emerald group-hover:translate-x-0.5 transition-all" />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-slate-500 dark:text-executive-darkMuted">
          <p className="flex items-center justify-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-executive-emerald" />
            Environnement de production BELL ENTERPRISE — Douala
          </p>
        </div>
      </div>
    </div>
  );
};
