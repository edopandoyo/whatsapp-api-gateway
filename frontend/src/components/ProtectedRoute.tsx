import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100dvh' }}>
        <div className="animate-spin" style={{ width:32, height:32, border:'3px solid var(--c-border)', borderTopColor:'var(--c-brand-500)', borderRadius:'50%' }} />
      </div>
    );
  }

  return user ? <Outlet /> : <Navigate to="/login" replace />;
}
