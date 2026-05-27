import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';

import Layout from './components/Layout';
import { ToastProvider } from './components/ToastProvider';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import WorkOrders from './pages/WorkOrders';
import PackingList from './pages/PackingList';
import LoadingList from './pages/LoadingList';
import MasterList from './pages/MasterList';
import Vehicles from './pages/Vehicles';
import StuffList from './pages/StuffList';
import Reports from './pages/Reports';
import DispatchSlip from './pages/DispatchSlip';
import Email from './pages/Email';
import Users from './pages/Users';

import ManagerDashboard from './pages/manager/ManagerDashboard';
import ManagerWorkOrders from './pages/manager/ManagerWorkOrders';
import ManagerPackingList from './pages/manager/ManagerPackingList';
import ManagerLoadingList from './pages/manager/ManagerLoadingList';

function App() {
  const [session, setSession] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const seeded = useRef(false);

  // Listen for auth changes and store the session
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  // When session becomes available, fetch the user profile
  useEffect(() => {
    if (session && session.user) {
      fetchProfile(session.user.id);
    } else {
      setUserProfile(null);
      setLoading(false);
    }
  }, [session]);

  const fetchProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') {
          const { data: { user } } = await supabase.auth.getUser();
          const { data: newProfile, error: insertError } = await supabase
            .from('profiles')
            .insert([{ id: userId, name: user.email.split('@')[0], role: 'User' }])
            .select()
            .single();
            
          if (insertError) throw insertError;
          setUserProfile(newProfile);
          await seedMasterListIfEmpty();
          return;
        }
        throw error;
      }
      setUserProfile(data);
      await seedMasterListIfEmpty();
    } catch (error) {
      console.error('Error fetching profile:', error);
      await supabase.auth.signOut();
    } finally {
      setLoading(false);
    }
  };

  const seedMasterListIfEmpty = async () => {
    if (seeded.current) return;
    seeded.current = true;
    
    try {
      const { count } = await supabase.from('master_list').select('*', { count: 'exact', head: true });
      if (count > 0) return;

      const masterData = {
        'Transformer Ratings': ['10 MVA / 33kV','31.5 MVA / 132kV','63 MVA / 220kV','100 MVA / 220kV','125 MVA / 220kV','160 MVA / 220kV','250 MVA / 400kV','315 MVA / 400kV','500 MVA / 765kV'],
        'Transformer Types': ['Power Transformer','Distribution Transformer','Auto Transformer','Generator Transformer','Rectifier Transformer'],
        'Vehicle Types': ['Packing Vehicle','Loading Vehicle','Dispatch Vehicle','Crane Vehicle','Trailer Vehicle','Flatbed Vehicle'],
        'Shifts': ['Shift 1','Shift 2','Shift 3'],
        'Packing List Items': ['Main Transformer Body (DRY AIR FILLED with fittings & accessories)','OLTC - Reversing Type (3 Pole) - EASUN MR','OLTC - Diverter Switch','Rating & Diagram Plate','Radiators (Set)','Oil Conservator with fittings','Buchholz Relay','PRD - Pressure Relief Device','WTI - Winding Temperature Indicator','OTI - Oil Temperature Indicator','Bushings - HV','Bushings - LV','Bushings - Tertiary','Silica Gel Breather','Terminal Box','Fan Assembly','Cooler Bank','Marshalling Box','Accessories Box','Neutral Grounding Resistor'],
        'Customers': ['NTPC Ltd.','PGCIL','Tata Power','Adani Energy','KSEB','Krishna','Renew Power','NPCIL','BHEL','PGVCL']
      };

      const records = [];
      for (const [category_key, items] of Object.entries(masterData)) {
        for (const value of items) {
          records.push({ category_key, value });
        }
      }

      for (let i = 0; i < records.length; i += 20) {
        const batch = records.slice(i, i + 20);
        await supabase.from('master_list').insert(batch);
      }
      console.log('✅ Master list seeded with default data');
    } catch (e) {
      console.error('Auto-seed master list failed:', e);
      seeded.current = false;
    }
  };

  const handleLogout = async () => {
    seeded.current = false;
    await supabase.auth.signOut();
  };

  if (loading || (session && !userProfile)) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--main-bg)', flexDirection: 'column', gap: '12px' }}>
        <div style={{ width: '40px', height: '40px', border: '3px solid #e2e8f0', borderTopColor: '#e53e3e', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div>
        <div style={{ color: '#718096', fontSize: '14px' }}>Loading...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <ToastProvider>
      <Router>
        <Routes>
          <Route path="/login" element={!session ? <Login /> : <Navigate to="/" />} />
          
          {session && userProfile ? (
            userProfile.role === 'Security' ? (
              <Route element={<Layout user={userProfile} handleLogout={handleLogout} />}>
                <Route path="/vehicles" element={<Vehicles />} />
                <Route path="*" element={<Navigate to="/vehicles" />} />
              </Route>
            ) : userProfile.role === 'Dashboard User' ? (
              <Route element={<Layout user={userProfile} handleLogout={handleLogout} />}>
                <Route path="/" element={<ManagerDashboard />} />
                <Route path="/work-orders" element={<ManagerWorkOrders />} />
                <Route path="/packing-list" element={<ManagerPackingList />} />
                <Route path="/loading-list" element={<ManagerLoadingList />} />
                <Route path="*" element={<Navigate to="/" />} />
              </Route>
            ) : (
              <Route element={<Layout user={userProfile} handleLogout={handleLogout} />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/work-orders" element={<WorkOrders />} />
                <Route path="/packing-list" element={<PackingList />} />
                <Route path="/loading-list" element={<LoadingList />} />
                <Route path="/stuff-list" element={<StuffList />} />
                <Route path="/vehicles" element={<Vehicles />} />
                <Route path="/master-list" element={<MasterList />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/dispatch-slip/:wo_id" element={<DispatchSlip />} />
                <Route path="/email" element={<Email />} />
                <Route path="/users" element={<Users />} />
                <Route path="*" element={<Navigate to="/" />} />
              </Route>
            )
          ) : (
            <Route path="*" element={<Navigate to="/login" />} />
          )}
        </Routes>
      </Router>
    </ToastProvider>
  );
}

export default App;
