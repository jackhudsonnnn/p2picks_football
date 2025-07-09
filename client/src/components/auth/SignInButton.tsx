import { useAuth } from '../../hooks/useAuth';

export const SignInButton = () => {
  const { user, signInWithGoogle, signOut, loading } = useAuth();

  if (loading) {
    return <button disabled>Loading...</button>;
  }

  if (user) {
    return (
      <button onClick={signOut}>Sign Out ({user.email?.split('@')[0]})</button>
    );
  }
  return <button onClick={signInWithGoogle}>Sign In with Google</button>;
};
