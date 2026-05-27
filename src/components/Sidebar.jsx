import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, Briefcase, PackageSearch, Truck, Box, 
  Settings, LogOut, FileText, Mail, Users, Car, ShieldCheck
} from 'lucide-react';

const Sidebar = ({ user, handleLogout }) => {
  const navigate = useNavigate();

  const onLogout = async () => {
    await handleLogout();
    navigate('/login');
  };

  const isAdmin = user?.role === 'Admin';
  const isSupervisor = user?.role === 'Admin' || user?.role === 'Supervisor';

  const sections = user?.role === 'Security' ? [
    {
      label: 'VEHICLE MANAGEMENT',
      show: true,
      items: [
        { name: 'Vehicles', path: '/vehicles', icon: Car },
      ]
    }
  ] : [
    {
      label: 'MAIN',
      items: [
        { name: 'Dashboard',    path: '/',             icon: LayoutDashboard },
        { name: 'Work Orders',  path: '/work-orders',  icon: Briefcase },
        { name: 'Packing List', path: '/packing-list', icon: PackageSearch },
        { name: 'Loading List', path: '/loading-list', icon: Truck },
      ]
    },
    {
      label: 'MANAGEMENT',
      show: isSupervisor,
      items: [
        { name: 'Master List', path: '/master-list', icon: Settings },
        { name: 'Vehicles',    path: '/vehicles',    icon: Car },
        ...(isAdmin ? [{ name: 'Stuff List',  path: '/stuff-list',  icon: Box }] : [])
      ]
    },
    {
      label: 'OUTPUT',
      show: isSupervisor,
      items: [
        { name: 'Reports', path: '/reports', icon: FileText },
        ...(isAdmin ? [
          { name: 'Email',   path: '/email',   icon: Mail },
          { name: 'Users', path: '/users', icon: Users }
        ] : [])
      ]
    }
  ];

  return (
    <div style={{
      width: '240px',
      background: 'var(--sidebar-bg)',
      color: 'var(--sidebar-text)',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      flexShrink: 0
    }}>
      {/* Logo */}
      <div style={{
        padding: '20px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
      }}>
        <div style={{
          width: '34px', height: '34px', background: 'var(--primary)',
          borderRadius: '8px', display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: 'white', fontWeight: '800', fontSize: '16px'
        }}>I</div>
        <div>
          <div style={{ color: '#fff', fontSize: '13px', fontWeight: '700', letterSpacing: '0.3px' }}>INDOTECH</div>
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1px' }}>Dispatch System</div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding: '8px 10px', flex: 1, overflowY: 'auto' }}>
        {sections.map(section => {
          if (section.show === false) return null;
          if (section.items.length === 0) return null;

          return (
            <div key={section.label}>
              <div style={{
                fontSize: '10px', fontWeight: '700',
                color: 'rgba(255,255,255,0.28)',
                letterSpacing: '1.4px',
                padding: '14px 14px 6px',
                textTransform: 'uppercase'
              }}>
                {section.label}
              </div>
              {section.items.map(item => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  style={({ isActive }) => ({
                    display: 'flex',
                    alignItems: 'center',
                    padding: '9px 14px',
                    borderRadius: '8px',
                    marginBottom: '2px',
                    fontWeight: 500,
                    fontSize: '13px',
                    color: isActive ? '#ffffff' : 'rgba(255,255,255,0.55)',
                    background: isActive ? 'var(--sidebar-active)' : 'transparent',
                    textDecoration: 'none',
                    transition: 'all 0.15s'
                  })}
                >
                  <item.icon size={15} style={{ marginRight: '10px', flexShrink: 0 }} />
                  {item.name}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>

      {/* User footer */}
      <div style={{ padding: '14px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '50%',
            background: '#e53e3e',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: '700', fontSize: '13px', flexShrink: 0
          }}>
            {user?.name?.charAt(0)?.toUpperCase() || 'A'}
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ color: '#fff', fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.name || 'Admin'}
            </div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {user?.role || 'Admin'}
            </div>
          </div>
        </div>
        <button
          onClick={onLogout}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '6px', padding: '7px', background: 'transparent',
            color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '7px', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit'
          }}
        >
          <LogOut size={13} /> Sign out
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
