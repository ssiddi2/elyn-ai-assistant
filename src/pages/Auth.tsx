import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Mail, Lock, User, ArrowRight, Loader2, Check, X } from 'lucide-react';
import elynLogo from '@/assets/elyn-logo.png';
import livemedLogo from '@/assets/livemed-logo.png';
import WorkflowDemo from '@/components/auth/WorkflowDemo';
import physiciansBg from '@/assets/physicians-bg.jpg';

// Password validation requirements
const passwordRequirements = [
  { id: 'length', label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { id: 'uppercase', label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { id: 'lowercase', label: 'One lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { id: 'number', label: 'One number', test: (p: string) => /\d/.test(p) },
  { id: 'special', label: 'One special character (!@#$%^&*)', test: (p: string) => /[!@#$%^&*(),.?":{}|<>]/.test(p) },
];

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPasswordRequirements, setShowPasswordRequirements] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Password strength validation
  const passwordValidation = useMemo(() => {
    return passwordRequirements.map(req => ({
      ...req,
      passed: req.test(password)
    }));
  }, [password]);

  const isPasswordValid = useMemo(() => {
    return passwordValidation.every(req => req.passed);
  }, [passwordValidation]);

  const passwordStrength = useMemo(() => {
    const passed = passwordValidation.filter(req => req.passed).length;
    if (passed === 0) return { label: '', color: '' };
    if (passed <= 2) return { label: 'Weak', color: 'text-red-500' };
    if (passed <= 4) return { label: 'Medium', color: 'text-yellow-500' };
    return { label: 'Strong', color: 'text-green-500' };
  }, [passwordValidation]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        navigate('/');
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        navigate('/');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate password strength on signup
    if (!isLogin && !isPasswordValid) {
      toast({
        title: "Weak Password",
        description: "Please meet all password requirements for security.",
        variant: "destructive",
      });
      return;
    }
    
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        toast({
          title: "Welcome back!",
          description: "Successfully signed in.",
        });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: {
              full_name: fullName,
            },
          },
        });
        if (error) throw error;
        toast({
          title: "Account created!",
          description: "Welcome to ELYN™.",
        });
      }
    } catch (error: any) {
      let message = error.message;
      if (error.message?.includes('User already registered')) {
        message = 'This email is already registered. Please sign in instead.';
      }
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Video Background with 50% opacity */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover opacity-50"
      >
        <source src="/videos/auth-background.mp4" type="video/mp4" />
      </video>
      
      {/* Dark navy overlay */}
      <div className="absolute inset-0 bg-[hsl(222,47%,6%)]/70" />
      
      <div className="min-h-screen flex items-center justify-center p-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md"
        >
          {/* Logo Section - Large Centered Animated */}
          <div className="text-center mb-12">
            {/* Massive animated ELYN logo */}
            <motion.div
              className="relative mx-auto mb-8"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <motion.img
                src={elynLogo}
                alt="ELYN"
                className="w-48 h-48 mx-auto object-contain"
                animate={{ scale: [1, 1.02, 1] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
              />
            </motion.div>
            
            {/* ELYN text with blue gradient */}
            <motion.h1 
              className="text-6xl font-display font-bold tracking-[0.4em] text-transparent bg-clip-text bg-gradient-to-r from-blue-300 via-sky-400 to-blue-500 mb-6"
              animate={{ 
                backgroundPosition: ['0% 50%', '100% 50%', '0% 50%']
              }}
              style={{ backgroundSize: '200% 200%' }}
              transition={{ duration: 5, repeat: Infinity }}
            >
              ELYN™
            </motion.h1>
            
            {/* Tagline */}
            <motion.p
              className="text-2xl text-foreground/80 font-light tracking-[0.3em] mb-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              Clinical Rounding Intelligence
            </motion.p>
            
            {/* LiveMed branding */}
            <motion.div 
              className="flex items-center justify-center gap-3 mb-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <span className="text-xs text-foreground/50 tracking-widest uppercase">Powered by</span>
              <img src={livemedLogo} alt="LiveMed Telehealth" className="h-36 object-contain" />
            </motion.div>
            
            <motion.p 
              className="text-lg text-foreground/60 font-medium"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              {isLogin ? 'Sign in to your account' : 'Create your provider account'}
            </motion.p>
          </div>

          {/* Auth Card with dark navy glass effect */}
          <motion.div 
            className="backdrop-blur-xl bg-[hsl(222,47%,10%)]/90 border border-[hsl(222,40%,20%)] rounded-2xl p-8 shadow-2xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <form onSubmit={handleAuth} className="space-y-5">
              {!isLogin && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2"
                >
                  <Label htmlFor="fullName" className="text-foreground/80 text-sm">Full Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/50" />
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="Dr. John Smith"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="pl-10 h-12 bg-[hsl(222,45%,12%)] border-[hsl(222,40%,22%)] text-foreground placeholder:text-foreground/30 focus:border-primary/50"
                      required={!isLogin}
                    />
                  </div>
                </motion.div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground/80 text-sm">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/50" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="doctor@hospital.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 h-12 bg-[hsl(222,45%,12%)] border-[hsl(222,40%,22%)] text-foreground placeholder:text-foreground/30 focus:border-primary/50"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-foreground/80 text-sm">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/50" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => !isLogin && setShowPasswordRequirements(true)}
                    onBlur={() => setTimeout(() => setShowPasswordRequirements(false), 200)}
                    className="pl-10 h-12 bg-[hsl(222,45%,12%)] border-[hsl(222,40%,22%)] text-foreground placeholder:text-foreground/30 focus:border-primary/50"
                    required
                    minLength={8}
                  />
                </div>
                
                {/* Password strength indicator for signup */}
                {!isLogin && password.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-foreground/50">Password strength:</span>
                      <span className={passwordStrength.color}>{passwordStrength.label}</span>
                    </div>
                    
                    {/* Progress bar */}
                    <div className="h-1 bg-[hsl(222,40%,20%)] rounded-full overflow-hidden">
                      <motion.div
                        className={`h-full ${
                          passwordValidation.filter(r => r.passed).length <= 2 
                            ? 'bg-red-500' 
                            : passwordValidation.filter(r => r.passed).length <= 4 
                              ? 'bg-yellow-500' 
                              : 'bg-green-500'
                        }`}
                        initial={{ width: 0 }}
                        animate={{ 
                          width: `${(passwordValidation.filter(r => r.passed).length / passwordRequirements.length) * 100}%` 
                        }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                    
                    {/* Requirements list */}
                    {showPasswordRequirements && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-1 pt-2"
                      >
                        {passwordValidation.map(req => (
                          <div 
                            key={req.id} 
                            className={`flex items-center gap-2 text-xs ${
                              req.passed ? 'text-green-500' : 'text-foreground/40'
                            }`}
                          >
                            {req.passed ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <X className="h-3 w-3" />
                            )}
                            <span>{req.label}</span>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </motion.div>
                )}
              </div>

              <Button
                type="submit"
                className="w-full h-12 bg-gradient-to-r from-blue-500 to-sky-500 hover:from-blue-600 hover:to-sky-600 text-white font-semibold shadow-lg shadow-blue-500/25"
                disabled={loading || (!isLogin && !isPasswordValid && password.length > 0)}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    {isLogin ? 'Sign In' : 'Create Account'}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setPassword('');
                  setShowPasswordRequirements(false);
                }}
                className="text-sm text-foreground/50 hover:text-foreground/80 transition-colors"
              >
                {isLogin ? "Don't have an account? " : "Already have an account? "}
                <span className="text-primary font-medium">
                  {isLogin ? 'Sign Up' : 'Sign In'}
                </span>
              </button>
            </div>
          </motion.div>

          {/* Workflow Demo Section */}
          <WorkflowDemo />

          {/* Footer */}
          <p className="text-center text-xs text-foreground/40 mt-6">
            By continuing, you agree to ELYN™'s Terms of Service and Privacy Policy
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default Auth;
