import { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@data/clients/supabaseClient';
import { useDialog } from '@shared/hooks/useDialog';

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
  const { showAlert, dialogNode } = useDialog();

  useEffect(() => {
    const setData = async () => {
      setLoading(true);
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          // Silently handle session retrieval errors — onAuthStateChange will recover
        }
        setSession(session);
        setUser(session?.user ?? null);
      } catch (e: unknown) {
        // Session retrieval failed — will be retried by onAuthStateChange
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
      const redirectTo = window.location.origin;
      const res = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
        },
      });
      const { error } = res;
      if (error) {
        await showAlert({ title: 'Sign In', message: 'Error signing in with Google: ' + error.message });
      }
    } catch (error: unknown) {
      await showAlert({ title: 'Sign In', message: 'An unexpected error occurred during sign-in.' });
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        await showAlert({ title: 'Sign Out', message: 'Error signing out: ' + error.message });
      }
    } catch (error: unknown) {
      await showAlert({ title: 'Sign Out', message: 'An unexpected error occurred during sign-out.' });
    } finally {
      // setLoading(false); // onAuthStateChange will handle this
    }
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, signInWithGoogle, signOut }}>
      {children}
      {dialogNode}
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
