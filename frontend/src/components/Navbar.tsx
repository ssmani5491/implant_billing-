import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function Navbar() {
  const { user, logout, canView } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <div className="navbar-brand">Implant Billing</div>
      <div className="navbar-links">
        {canView('invoices') && (
          <>
            <NavLink to="/invoices" className={({ isActive }) => (isActive ? 'active' : '')}>
              Invoices
            </NavLink>
            <NavLink to="/invoices/new" className={({ isActive }) => (isActive ? 'active' : '')}>
              New Invoice
            </NavLink>
          </>
        )}
        {canView('items') && (
          <NavLink to="/items" className={({ isActive }) => (isActive ? 'active' : '')}>
            Item Master
          </NavLink>
        )}
        {canView('reports') && (
          <NavLink to="/reports/vendor-documents" className={({ isActive }) => (isActive ? 'active' : '')}>
            Reports
          </NavLink>
        )}
        {canView('users') && (
          <NavLink to="/users" className={({ isActive }) => (isActive ? 'active' : '')}>
            Users
          </NavLink>
        )}
        {(canView('categories') || canView('units') || canView('vendors')) && (
          <NavLink to="/masters" className={({ isActive }) => (isActive ? 'active' : '')}>
            Masters
          </NavLink>
        )}
        {canView('approval_levels') && (
          <NavLink to="/approval-levels" className={({ isActive }) => (isActive ? 'active' : '')}>
            Approval Levels
          </NavLink>
        )}
        {canView('roles') && (
          <NavLink to="/roles" className={({ isActive }) => (isActive ? 'active' : '')}>
            Roles
          </NavLink>
        )}
        {canView('audit_log') && (
          <NavLink to="/audit-log" className={({ isActive }) => (isActive ? 'active' : '')}>
            Audit Log
          </NavLink>
        )}
      </div>
      <div className="navbar-user">
        <span>
          {user.full_name} <em>({user.role_name})</em>
        </span>
        <button onClick={handleLogout}>Logout</button>
      </div>
    </nav>
  );
}
