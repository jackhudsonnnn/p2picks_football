import { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../shared/api/supabaseClient';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const setData = async () => {
      setLoading(true);
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('Error getting session:', error.message);
          // Potentially handle UI indication of error
        }
        setSession(session);
        setUser(session?.user ?? null);
      } catch (e: any) {
        console.error('Exception in getSession:', e.message);
      } finally {
        setLoading(false);
      }
    };

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, currentSession) => {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        setLoading(false);
      }
    );

    setData();

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin, // Or a specific callback page like window.location.origin + '/auth/callback'
        },
      });
      if (error) {
        console.error('Google sign-in error:', error.message);
        alert('Error signing in with Google: ' + error.message);
      }
      // Supabase handles redirection, loading state will be updated by onAuthStateChange
    } catch (error: any) {
      console.error('Exception during Google sign-in:', error.message);
      alert('An unexpected error occurred during sign-in.');
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Sign-out error:', error.message);
        alert('Error signing out: ' + error.message);
      }
      // Session and user will be set to null by onAuthStateChange
    } catch (error: any) {
      console.error('Exception during sign-out:', error.message);
      alert('An unexpected error occurred during sign-out.');
    } finally {
      // setLoading(false); // onAuthStateChange will handle this
    }
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
