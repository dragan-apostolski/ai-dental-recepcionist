
import React, { useState } from 'react';
import { auth } from '../services/storageService';
import { SUPABASE_CONFIG } from '../config';
import { Loader2, Mail, Lock, LogIn, UserPlus, Sparkles, LayoutDashboard, AlertTriangle, CheckCircle2, ArrowLeft } from 'lucide-react';

interface AuthProps {
  onSuccess: () => void;
}

const Auth: React.FC<AuthProps> = ({ onSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: authError } = isLogin
        ? await auth.signIn(email, password)
        : await auth.signUp(email, password);

      if (authError) throw authError;

      if (!isLogin) {
        // For Sign Up, Supabase usually requires email verification.
        // If there's no session returned, it means verification is pending.
        if (data?.session) {
          onSuccess();
        } else {
          setRegistrationSuccess(true);
        }
      } else {
        // Sign In success
        onSuccess();
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      // Friendly error mapping
      let msg = err.message || 'Се случи грешка при автентикација.';
      if (msg.includes('Invalid login credentials')) msg = 'Погрешен е-маил или лозинка.';
      if (msg.includes('User already registered')) msg = 'Овој корисник веќе постои.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Fix: Removed access to non-existent anonKey property on SUPABASE_CONFIG
  const isConfigured = !!(SUPABASE_CONFIG.url && SUPABASE_CONFIG.publishableKey);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Decorative Background */}
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-teal-100/30 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-slate-200/40 blur-[120px] rounded-full" />

      <div className="w-full max-w-md relative">
        <div className="text-center mb-10 space-y-3">
          <div className="inline-flex p-3 bg-slate-900 rounded-2xl shadow-xl text-white mb-4 transform -rotate-3 hover:rotate-0 transition-transform cursor-pointer">
            <LayoutDashboard size={32} />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight italic">ZABOZDRAV</h1>
          <p className="text-slate-500 text-sm font-medium">Вашиот дигитален рецепционер, подготвен за работа.</p>
        </div>

        <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 p-8 md:p-10 relative overflow-hidden min-h-[400px] flex flex-col justify-center">
          <div className="absolute top-0 left-0 w-full h-1 bg-teal-600" />

          {registrationSuccess ? (
            <div className="text-center space-y-6 animate-in fade-in zoom-in duration-300">
              <div className="w-20 h-20 bg-teal-50 text-teal-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 size={40} />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-slate-900">Профилот е креиран!</h3>
                <p className="text-sm text-slate-500 leading-relaxed px-4">
                  Ви испративме линк за верификација на <strong>{email}</strong>. Ве молиме потврдете го вашиот е-маил пред да се најавите.
                </p>
              </div>
              <button
                onClick={() => {
                  setRegistrationSuccess(false);
                  setIsLogin(true);
                }}
                className="inline-flex items-center gap-2 text-teal-600 font-bold text-xs uppercase tracking-widest hover:gap-3 transition-all"
              >
                <ArrowLeft size={14} /> Назад на најава
              </button>
            </div>
          ) : (
            <>
              {!isConfigured && (
                <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                  <AlertTriangle className="text-amber-600 shrink-0" size={18} />
                  <div className="space-y-1">
                    <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">Конфигурацијата недостасува</p>
                    <p className="text-[10px] text-amber-700 leading-relaxed">
                      Потребно е да го поставите вашиот <strong>Publishable Key</strong> во <strong>config.ts</strong> за да функционира најавата.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex bg-slate-100 p-1 rounded-2xl mb-8">
                <button
                  onClick={() => setIsLogin(true)}
                  className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${isLogin ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                >
                  Најава
                </button>
                <button
                  onClick={() => setIsLogin(false)}
                  className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${!isLogin ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                >
                  Регистрација
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">E-mail Адреса</label>
                    <div className="relative group">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-teal-600 transition-colors" size={18} />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 focus:border-teal-500 focus:bg-white p-4 pl-12 rounded-2xl outline-none transition-all text-sm font-medium"
                        placeholder="example@clinic.com"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Лозинка</label>
                    <div className="relative group">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-teal-600 transition-colors" size={18} />
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 focus:border-teal-500 focus:bg-white p-4 pl-12 rounded-2xl outline-none transition-all text-sm font-medium"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="bg-rose-50 border border-rose-100 text-rose-600 text-[11px] p-4 rounded-xl font-bold flex items-center gap-2">
                    <AlertTriangle size={14} className="shrink-0" />
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading || !isConfigured}
                  className="w-full bg-slate-900 hover:bg-black text-white font-black py-4 rounded-2xl shadow-lg flex items-center justify-center gap-3 transition-all transform active:scale-[0.98] disabled:opacity-50"
                >
                  {isLoading ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : (
                    <>
                      {isLogin ? <LogIn size={20} /> : <UserPlus size={20} />}
                      {isLogin ? 'НАЈАВИ СЕ' : 'КРЕИРАЈ ПРОФИЛ'}
                    </>
                  )}
                </button>
              </form>
            </>
          )}
        </div>

        <div className="mt-8 flex justify-center items-center gap-2 text-slate-400">
          <Sparkles size={14} className="text-teal-500" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em]">Powered by Gemini 2.5</span>
        </div>
      </div>
    </div>
  );
};

export default Auth;