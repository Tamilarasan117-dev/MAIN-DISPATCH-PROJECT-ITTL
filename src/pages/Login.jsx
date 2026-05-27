import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ShieldCheck, UserCog, HardHat, BarChart3, Lock, Mail, Key, ArrowRight, Eye, EyeOff, Loader2, ChevronLeft, CheckCircle2, AlertCircle } from 'lucide-react';

// ─── Steps: 'role_selection' | 'login' | 'signup' | 'verify' | 'forgot' | 'reset_sent'
const Login = () => {
  const [step, setStep] = useState('role_selection');
  const [selectedRole, setSelectedRole] = useState(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('User');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [animatingRole, setAnimatingRole] = useState(false);
  const navigate = useNavigate();

  // Cooldown timer for resend button
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // Check if user arrived from email verification link
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('access_token') || hash.includes('type=signup')) {
      setInfo('Email verified successfully. You can now securely log in.');
      window.history.replaceState(null, '', window.location.pathname);
    }
    if (hash.includes('type=recovery')) {
      setStep('login');
      setInfo('Password reset confirmed. Please log in with your new credentials.');
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  const reset = () => { setError(null); setInfo(null); };

  // ── Post-Login Redirect Logic
  const redirectByRole = (role) => {
    if (role === 'Security') {
      navigate('/vehicles');
      return;
    }
    navigate('/');
  };

  // ── Login
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true); reset();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.message.toLowerCase().includes('email not confirmed')) {
        setError(null);
        setStep('verify');
      } else {
        setError('Invalid login credentials. Please try again.');
      }
      setLoading(false);
      return;
    }
    
    if (data?.user) {
      const { data: prof } = await supabase.from('profiles').select('id, role').eq('id', data.user.id).single();
      
      if (!prof) {
        const roleToSet = selectedRole || 'User';
        await supabase.from('profiles').insert([{ id: data.user.id, name: email.split('@')[0], role: roleToSet }]);
        redirectByRole(roleToSet);
      } else {
        // If a role was selected on the login page, prioritize it over stored role
        const finalRole = selectedRole || prof.role;
        // Optional: update stored role if it differs from selectedRole
        if (selectedRole && selectedRole !== prof.role) {
          await supabase.from('profiles').update({ role: selectedRole }).eq('id', data.user.id);
        }
        redirectByRole(finalRole);
      }
    }
    setLoading(false);
  };

  // ── Sign Up
  const handleSignup = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('Full name is required for registration.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters for security.'); return; }
    setLoading(true); reset();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name: name.trim() },
        emailRedirectTo: window.location.origin + window.location.pathname
      }
    });

    if (error) { setError(error.message); setLoading(false); return; }

    // Pre-create profile with selected role
    if (data?.user) {
      await supabase.from('profiles').upsert([{ id: data.user.id, name: name.trim(), role: role }]);
    }

    setLoading(false);
    setStep('verify');
    setResendCooldown(60);
  };

  // ── Resend verification email
  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setLoading(true); reset();
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) { setError(error.message); }
    else { setInfo('Verification email resent. Please check your inbox.'); setResendCooldown(60); }
    setLoading(false);
  };

  // ── Forgot password
  const handleForgot = async (e) => {
    e.preventDefault();
    setLoading(true); reset();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname
    });
    if (error) { setError(error.message); setLoading(false); return; }
    setLoading(false);
    setStep('reset_sent');
  };

  // ─── Shared styles
  const bgStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: 'radial-gradient(circle at top right, #1e1b4b, #0f172a 40%, #020617 100%)',
    padding: '20px',
    color: '#f8fafc',
    position: 'relative',
    overflow: 'hidden'
  };

  // Decorative ambient glows
  const glow1 = {
    position: 'absolute', top: '-15%', right: '-10%', width: '600px', height: '600px',
    background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, rgba(0,0,0,0) 70%)',
    borderRadius: '50%', pointerEvents: 'none', zIndex: 0
  };
  const glow2 = {
    position: 'absolute', bottom: '-20%', left: '-10%', width: '500px', height: '500px',
    background: 'radial-gradient(circle, rgba(236,72,153,0.1) 0%, rgba(0,0,0,0) 70%)',
    borderRadius: '50%', pointerEvents: 'none', zIndex: 0
  };

  const glassCard = {
    background: 'rgba(255, 255, 255, 0.03)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    padding: '48px 40px',
    borderRadius: '24px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
    width: '100%',
    maxWidth: '440px',
    zIndex: 1,
    position: 'relative'
  };

  const inputWrap = {
    position: 'relative',
    marginBottom: '20px'
  };

  const inputLabel = {
    display: 'block',
    fontSize: '13px',
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: '8px',
    letterSpacing: '0.3px'
  };

  const inputField = {
    width: '100%',
    padding: '12px 16px 12px 42px',
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
    fontSize: '15px',
    color: '#f8fafc',
    outline: 'none',
    transition: 'all 0.3s ease',
    boxSizing: 'border-box'
  };

  const inputIcon = {
    position: 'absolute',
    left: '14px',
    bottom: '12px',
    color: '#64748b'
  };

  const btnPrimary = {
    width: '100%', padding: '14px', background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
    color: '#fff', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: '600',
    cursor: 'pointer', transition: 'all 0.3s ease', display: 'flex', alignItems: 'center',
    justifyContent: 'center', gap: '8px', boxShadow: '0 4px 14px rgba(79, 70, 229, 0.4)'
  };

  const linkStyle = {
    color: '#818cf8', cursor: 'pointer', fontWeight: '500', fontSize: '14px',
    textDecoration: 'none', border: 'none', background: 'none', fontFamily: 'inherit',
    transition: 'color 0.2s'
  };

  const roles = [
    { name: 'Admin', icon: ShieldCheck, color: '#f43f5e', shadow: 'rgba(244, 63, 94, 0.3)', desc: 'Full System Control' },
    { name: 'Supervisor', icon: UserCog, color: '#3b82f6', shadow: 'rgba(59, 130, 246, 0.3)', desc: 'Operations Manager' },
    { name: 'User', icon: HardHat, color: '#10b981', shadow: 'rgba(16, 185, 129, 0.3)', desc: 'Yard & Logistics' },
    { name: 'Dashboard User', icon: BarChart3, color: '#a855f7', shadow: 'rgba(168, 85, 247, 0.3)', desc: 'Analytics & Reports' },
    { name: 'Security', icon: Lock, color: '#f59e0b', shadow: 'rgba(245, 158, 11, 0.3)', desc: 'Gate Management' }
  ];

  const handleRoleSelect = (roleName) => {
  setAnimatingRole(true);
  setRole(roleName);
  setTimeout(() => {
    setSelectedRole(roleName);
    setStep('login');
    setAnimatingRole(false);
  }, 300);
};

  // ─── Render ───
  if (step === 'role_selection') {
    return (
      <div style={bgStyle}>
        <div style={glow1}></div><div style={glow2}></div>
        
        <div style={{ textAlign: 'center', marginBottom: '48px', transition: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)', opacity: animatingRole ? 0 : 1, transform: animatingRole ? 'scale(0.95)' : 'scale(1)', zIndex: 1 }}>
          <div style={{
            width: '64px', height: '64px', background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', 
            borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: '800', fontSize: '32px', margin: '0 auto 20px',
            boxShadow: '0 10px 25px rgba(79, 70, 229, 0.4)'
          }}>I</div>
          <h2 style={{ fontSize: '32px', fontWeight: '700', marginBottom: '8px', color: '#f8fafc', letterSpacing: '-0.5px' }}>Access Portal</h2>
          <p style={{ color: '#94a3b8', fontSize: '16px', fontWeight: '400' }}>Select your authorization level to proceed</p>
        </div>

        <div style={{ 
          display: 'flex', flexWrap: 'wrap', gap: '24px', justifyContent: 'center', maxWidth: '1000px', 
          transition: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)', opacity: animatingRole ? 0 : 1, 
          transform: animatingRole ? 'translateY(20px)' : 'translateY(0)', zIndex: 1 
        }}>
          {roles.map(r => {
            const Icon = r.icon;
            return (
              <div
                key={r.name}
                className="role-card"
                onClick={() => handleRoleSelect(r.name)}
                style={{
                  width: '170px', height: '200px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  backdropFilter: 'blur(12px)',
                  borderRadius: '20px', padding: '28px 20px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  cursor: 'pointer', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  position: 'relative', overflow: 'hidden'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = r.color;
                  e.currentTarget.style.background = `linear-gradient(180deg, rgba(255,255,255,0.05) 0%, ${r.color}15 100%)`;
                  e.currentTarget.style.transform = 'translateY(-6px)';
                  e.currentTarget.style.boxShadow = `0 20px 40px -10px ${r.shadow}`;
                  e.currentTarget.querySelector('.icon-wrap').style.transform = 'scale(1.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.querySelector('.icon-wrap').style.transform = 'scale(1)';
                }}
              >
                <div className="icon-wrap" style={{
                  width: '64px', height: '64px', borderRadius: '16px',
                  background: `${r.color}1a`, display: 'flex', alignItems: 'center', 
                  justifyContent: 'center', marginBottom: '20px', transition: 'transform 0.3s ease'
                }}>
                  <Icon size={32} color={r.color} strokeWidth={1.5} />
                </div>
                <div style={{ color: '#f8fafc', fontSize: '15px', fontWeight: '600', textAlign: 'center', letterSpacing: '0.3px' }}>{r.name}</div>
                <div style={{ color: '#64748b', fontSize: '12px', textAlign: 'center', marginTop: '8px', fontWeight: '500' }}>{r.desc}</div>
              </div>
            );
          })}
        </div>
        
        <div style={{ position: 'absolute', bottom: '30px', textAlign: 'center', color: '#475569', fontSize: '12px', zIndex: 1, fontWeight: '500', letterSpacing: '1px' }}>
          INDOTECH DISPATCH MANAGEMENT SYSTEM • V2.0
        </div>
      </div>
    );
  }

  return (
    <div style={bgStyle}>
      <div style={glow1}></div><div style={glow2}></div>
      
      <div style={{ width: '100%', maxWidth: '440px', zIndex: 1, animation: 'fadeIn 0.4s ease-out forwards' }}>
        
        {step !== 'role_selection' && selectedRole && (
          <button
            onClick={() => { setStep('role_selection'); setSelectedRole(null); reset(); }}
            style={{ 
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', 
              color: '#cbd5e1', cursor: 'pointer', fontSize: '13px', padding: '8px 16px', 
              borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '6px',
              marginBottom: '24px', transition: 'all 0.2s', backdropFilter: 'blur(10px)'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#cbd5e1'; }}
          >
            <ChevronLeft size={16} /> Change Role
          </button>
        )}

        <div style={glassCard}>
          {/* Logo & Header */}
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{
              width: '48px', height: '48px', background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', 
              borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: '800', fontSize: '24px', margin: '0 auto 16px',
              boxShadow: '0 8px 16px rgba(79, 70, 229, 0.3)'
            }}>I</div>
            <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '6px', color: '#f8fafc', letterSpacing: '-0.5px' }}>Welcome Back</h2>
            <p style={{ color: '#94a3b8', fontSize: '14px' }}>Please enter your credentials to access the system.</p>
          </div>

          {selectedRole && (
            <div style={{
              background: `linear-gradient(90deg, ${roles.find(r => r.name === selectedRole)?.color}22, rgba(0,0,0,0))`,
              borderLeft: `3px solid ${roles.find(r => r.name === selectedRole)?.color}`,
              color: '#e2e8f0', padding: '10px 16px', borderRadius: '4px', fontSize: '13px', 
              fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '28px'
            }}>
              {React.createElement(roles.find(r => r.name === selectedRole)?.icon || UserCog, { size: 16, color: roles.find(r => r.name === selectedRole)?.color })}
              Authenticating as <strong style={{ color: '#fff' }}>{selectedRole}</strong>
            </div>
          )}

          {/* ── Error / Info banners */}
          {error && (
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#fca5a5', padding: '12px 16px', borderRadius: '12px', marginBottom: '24px', fontSize: '13px', display: 'flex', gap: '10px', alignItems: 'center' }}>
              <AlertCircle size={18} /> <span>{error}</span>
            </div>
          )}
          {info && (
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', color: '#6ee7b7', padding: '12px 16px', borderRadius: '12px', marginBottom: '24px', fontSize: '13px', display: 'flex', gap: '10px', alignItems: 'center' }}>
              <CheckCircle2 size={18} /> <span>{info}</span>
            </div>
          )}

          {/* ════════════ LOGIN ════════════ */}
          {step === 'login' && (
            <>
              <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '4px', marginBottom: '28px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <button onClick={() => { setStep('login'); reset(); }} style={{ flex: 1, padding: '10px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', background: 'rgba(255,255,255,0.1)', color: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
                  Sign In
                </button>
                <button onClick={() => { setStep('signup'); reset(); }} style={{ flex: 1, padding: '10px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '500', background: 'transparent', color: '#94a3b8', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = '#cbd5e1'} onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}>
                  Register
                </button>
              </div>

              <form onSubmit={handleLogin}>
                <div style={inputWrap}>
                  <label style={inputLabel}>Email Address</label>
                  <Mail size={18} style={inputIcon} />
                  <input className="glass-input" style={inputField} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="professional@indotech.com" required />
                </div>
                
                <div style={inputWrap}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ ...inputLabel, marginBottom: 0 }}>Password</label>
                    <button type="button" style={linkStyle} onClick={() => { setStep('forgot'); reset(); }}>Forgot?</button>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <Key size={18} style={inputIcon} />
                    <input className="glass-input" style={inputField} type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
                    <button type="button" onClick={() => setShowPass(!showPass)} style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}>
                      {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <button type="submit" disabled={loading} style={{ ...btnPrimary, marginTop: '12px', opacity: loading ? 0.7 : 1 }}>
                  {loading ? <><Loader2 size={18} className="spin" /> Authenticating...</> : <>Secure Login <ArrowRight size={18} /></>}
                </button>
              </form>
            </>
          )}

          {/* ════════════ SIGN UP ════════════ */}
          {step === 'signup' && (
            <>
              <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '4px', marginBottom: '28px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <button onClick={() => { setStep('login'); reset(); }} style={{ flex: 1, padding: '10px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '500', background: 'transparent', color: '#94a3b8', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = '#cbd5e1'} onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}>
                  Sign In
                </button>
                <button onClick={() => { setStep('signup'); reset(); }} style={{ flex: 1, padding: '10px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', background: 'rgba(255,255,255,0.1)', color: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
                  Register
                </button>
              </div>

              <form onSubmit={handleSignup}>
                <div style={inputWrap}>
                  <label style={inputLabel}>Full Name</label>
                  <UserCog size={18} style={inputIcon} />
                  <input className="glass-input" style={inputField} type="text" value={name} onChange={e => setName(e.target.value)} placeholder="John Doe" required />
                </div>

                <div style={inputWrap}>
                  <label style={inputLabel}>Email Address</label>
                  <Mail size={18} style={inputIcon} />
                  <input className="glass-input" style={inputField} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="john.doe@indotech.com" required />
                </div>

                <div style={inputWrap}>
                  <label style={inputLabel}>Password <span style={{ color: '#64748b', fontWeight: 400 }}>(min 6 chars)</span></label>
                  <div style={{ position: 'relative' }}>
                    <Key size={18} style={inputIcon} />
                    <input className="glass-input" style={inputField} type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
                    <button type="button" onClick={() => setShowPass(!showPass)} style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}>
                      {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div style={inputWrap}>
                  <label style={inputLabel}>Authorization Level</label>
                  <ShieldCheck size={18} style={{...inputIcon, zIndex: 2}} />
                  <select className="glass-input" style={{...inputField, appearance: 'none', position: 'relative'}} value={role} onChange={e => setRole(e.target.value)} required>
                    <option value="Admin" style={{background: '#0f172a', color: '#fff'}}>Admin</option>
                    <option value="Supervisor" style={{background: '#0f172a', color: '#fff'}}>Supervisor</option>
                    <option value="User" style={{background: '#0f172a', color: '#fff'}}>User</option>
                    <option value="Security" style={{background: '#0f172a', color: '#fff'}}>Security</option>
                    <option value="Dashboard User" style={{background: '#0f172a', color: '#fff'}}>Dashboard User</option>
                  </select>
                </div>

                <button type="submit" disabled={loading} style={{ ...btnPrimary, marginTop: '20px', opacity: loading ? 0.7 : 1 }}>
                  {loading ? <><Loader2 size={18} className="spin" /> Processing...</> : 'Create Profile'}
                </button>
              </form>
            </>
          )}

          {/* ════════════ VERIFY EMAIL ════════════ */}
          {step === 'verify' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(99, 102, 241, 0.1)', color: '#818cf8', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                <Mail size={32} />
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '12px', color: '#f8fafc' }}>Verification Required</h3>
              <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: '1.6', marginBottom: '24px' }}>
                A secure link has been dispatched to<br />
                <strong style={{ color: '#e2e8f0' }}>{email}</strong>
              </p>

              <button
                onClick={handleResend}
                disabled={loading || resendCooldown > 0}
                style={{ ...btnPrimary, background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '16px', boxShadow: 'none' }}
              >
                {resendCooldown > 0 ? `Resend available in ${resendCooldown}s` : loading ? 'Sending...' : 'Resend Link'}
              </button>

              <button onClick={() => { setStep('login'); reset(); }} style={linkStyle}>
                Return to Login
              </button>
            </div>
          )}

          {/* ════════════ FORGOT PASSWORD ════════════ */}
          {step === 'forgot' && (
            <>
              <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(99, 102, 241, 0.1)', color: '#818cf8', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                  <Key size={32} />
                </div>
                <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#f8fafc', marginBottom: '8px' }}>Password Recovery</h3>
                <p style={{ color: '#94a3b8', fontSize: '14px' }}>Enter your email to receive a reset link.</p>
              </div>
              <form onSubmit={handleForgot}>
                <div style={inputWrap}>
                  <label style={inputLabel}>Email Address</label>
                  <Mail size={18} style={inputIcon} />
                  <input className="glass-input" style={inputField} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@indotech.com" required />
                </div>
                <button type="submit" disabled={loading} style={{ ...btnPrimary, marginTop: '20px', opacity: loading ? 0.7 : 1 }}>
                  {loading ? <><Loader2 size={18} className="spin" /> Sending...</> : 'Send Recovery Link'}
                </button>
              </form>
            </>
          )}

          {/* ════════════ RESET SENT ════════════ */}
          {step === 'reset_sent' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', color: '#34d399', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                <CheckCircle2 size={32} />
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '12px', color: '#f8fafc' }}>Request Processed</h3>
              <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: '1.6', marginBottom: '24px' }}>
                If an account exists for <strong style={{ color: '#e2e8f0' }}>{email}</strong>, a recovery link has been sent.
              </p>
              <button onClick={() => { setStep('login'); reset(); }} style={btnPrimary}>
                Return to Login
              </button>
            </div>
          )}

        </div>
        <p style={{ textAlign: 'center', color: '#475569', fontSize: '12px', marginTop: '32px', fontWeight: '500', letterSpacing: '1px' }}>
          INDOTECH DISPATCH MANAGEMENT SYSTEM • V2.0
        </p>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(15px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin {
          animation: spin 1s linear infinite;
        }
        .glass-input:focus {
          border-color: #6366f1 !important;
          background: rgba(15, 23, 42, 0.8) !important;
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
        }
        .glass-input::placeholder {
          color: #475569;
        }
      `}</style>
    </div>
  );
};

export default Login;
