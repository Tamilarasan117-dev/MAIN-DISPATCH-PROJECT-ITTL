import os

content = """import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useOutletContext } from 'react-router-dom';
import { useToast } from '../../components/ToastProvider';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import useCountUp from './useCountUp';
import ProgressRing from './ProgressRing';
import './manager.css';

const WO_STATUS_COLORS = {
  'Completed': '#38a169',
  'Pending': '#dd6b20',
  'In Progress': '#3182ce',
  'Delayed': '#e53e3e'
};

const PIPELINE_COLORS = {
  'Loading Pending': '#dd6b20',
  'Loading In Progress': '#3182ce',
  'Ready for Dispatch': '#319795',
  'Dispatched': '#38a169'
};

const ManagerDashboard = () => {
  const { user } = useOutletContext() || {};
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [shift, setShift] = useState('All');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [selectedWO, setSelectedWO] = useState('All');

  const [data, setData] = useState({
    woData: [], vehData: [], packData: [], loadData: [], activityData: []
  });
  
  // Packing Details Table state
  const [packingTableData, setPackingTableData] = useState([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'wo_num', direction: 'asc' });
  const [page, setPage] = useState(1);
  const ROWS_PER_PAGE = 20;

  useEffect(() => {
    fetchDashboardData();
    const timer = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(timer);
  }, [shift, dateRange, selectedWO]);

  useEffect(() => {
    fetchPackingTable();
  }, [shift, dateRange, selectedWO]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      let woQuery = supabase.from('work_orders').select('*');
      // No shift filter on work_orders because the column doesn't exist
      
      const [
        { data: wos, error: woError },
        { data: vehicles },
        { data: packItems },
        { data: loadLists },
        { data: activities }
      ] = await Promise.all([
        woQuery,
        supabase.from('vehicles').select('*'),
        supabase.from('packing_items').select('*'),
        supabase.from('loading_lists').select('*'),
        supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(10)
      ]);

      if (woError) console.error("Work Orders Fetch Error:", woError);

      setData({
        woData: wos || [],
        vehData: vehicles || [],
        packData: packItems || [],
        loadData: loadLists || [],
        activityData: activities || []
      });
    } catch (error) {
      console.error(error);
      toast('Failed to fetch dashboard data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchPackingTable = async () => {
    try {
      setTableLoading(true);
      
      let query = supabase.from('packing_items').select('*, work_orders!inner(wo_num, customer, mandatory_completion_date)');
      
      if (selectedWO !== 'All') {
         query = query.eq('wo_id', selectedWO);
      }
      if (dateRange.from) {
         query = query.gte('work_orders.mandatory_completion_date', dateRange.from);
      }
      if (dateRange.to) {
         query = query.lte('work_orders.mandatory_completion_date', dateRange.to);
      }
      
      const { data: ptData, error } = await query;
      if (error) throw error;
      
      setPackingTableData(ptData || []);
    } catch (error) {
      console.error(error);
    } finally {
      setTableLoading(false);
    }
  };

  const resetFilters = () => {
    setShift('All');
    setDateRange({ from: '', to: '' });
    setSelectedWO('All');
    toast('Filters cleared');
  };

  const today = new Date().toISOString().split('T')[0];

  // --- Filtering Data for KPIs and Charts ---
  // Apply the 3 filters to woData
  const filteredWOs = data.woData.filter(wo => {
    if (selectedWO !== 'All' && wo.id.toString() !== selectedWO) return false;
    if (dateRange.from && wo.mandatory_completion_date < dateRange.from) return false;
    if (dateRange.to && wo.mandatory_completion_date > dateRange.to) return false;
    return true;
  });
  
  const validWoIds = new Set(filteredWOs.map(w => w.id.toString()));
  const validWoNums = new Set(filteredWOs.map(w => w.wo_num));

  // Filter other tables by matching WO
  const filteredVeh = data.vehData.filter(v => {
    if (shift !== 'All' && v.shift !== Number(shift)) return false;
    if (selectedWO !== 'All' && v.wo_num !== filteredWOs[0]?.wo_num) return false;
    return validWoNums.has(v.wo_num); // date range via WO
  });

  const filteredPack = data.packData.filter(p => {
    if (selectedWO !== 'All' && p.wo_id.toString() !== selectedWO) return false;
    return validWoIds.has(p.wo_id.toString());
  });

  const filteredLoad = data.loadData.filter(l => {
    if (selectedWO !== 'All' && l.wo_id.toString() !== selectedWO) return false;
    return validWoIds.has(l.wo_id.toString());
  });

  // --- KPI Stats Calculation ---
  const woTotal = filteredWOs.length;
  const woCompleted = filteredWOs.filter(w => w.customer_inspection === 'Completed').length;
  const woInProg = filteredWOs.filter(w => w.customer_inspection === 'In Progress').length;
  const woDelayed = filteredWOs.filter(w => w.delivery_deadline && w.delivery_deadline < today && w.customer_inspection !== 'Completed').length;

  const vehTotal = filteredVeh.length;
  const vehDispatched = filteredVeh.filter(v => v.status === 'Dispatched' || v.status === 'Delivered').length;

  const packTotal = filteredPack.length;
  const packPacked = filteredPack.filter(p => p.status === 'Packed' || p.status === 'Verified').length;
  const packPct = packTotal > 0 ? Math.round((packPacked / packTotal) * 100) : 0;

  const loadListsTotal = filteredLoad.length;
  const loadDispatched = filteredLoad.filter(l => l.status === 'Dispatched' || l.status === 'Delivered').length;
  const loadPending = loadListsTotal - loadDispatched;

  const animWoTotal = useCountUp(woTotal);
  const animVehTotal = useCountUp(vehTotal);
  const animLoadTotal = useCountUp(loadListsTotal);

  // --- Chart 1: Work Order Age by Customer (Horizontal Bar) ---
  const woChartData = filteredWOs.map(wo => {
     const created = new Date(wo.created_at);
     const now = new Date();
     created.setHours(0,0,0,0);
     now.setHours(0,0,0,0);
     const diffDays = Math.max(0, Math.floor((now - created) / (1000 * 60 * 60 * 24)));
     
     const status = wo.customer_inspection || 'Pending';
     const isDelayed = wo.delivery_deadline && wo.delivery_deadline < today && status !== 'Completed';
     const finalStatus = isDelayed ? 'Delayed' : status;
     
     return {
       wo_num: wo.wo_num,
       customer: wo.customer,
       age: diffDays,
       status: finalStatus,
       created_at: wo.created_at.split('T')[0]
     };
  }).sort((a, b) => b.age - a.age);

  // --- Chart 2: Packing Donut ---
  const packNotStarted = filteredPack.filter(p => p.status === 'Not Started').length;
  const packInProg = filteredPack.filter(p => p.status === 'In Progress').length;
  const donutData = [
    { name: 'Packed', value: packPacked, color: '#38a169' },
    { name: 'In Progress', value: packInProg, color: '#3182ce' },
    { name: 'Not Started', value: packNotStarted, color: '#cbd5e0' }
  ];

  // --- Chart 3: Loading Pipeline ---
  const pipelineData = [
    { stage: 'Pending', count: filteredLoad.filter(l => l.status === 'Loading Pending').length, full: 'Loading Pending' },
    { stage: 'In Progress', count: filteredLoad.filter(l => l.status === 'Loading In Progress').length, full: 'Loading In Progress' },
    { stage: 'Ready', count: filteredLoad.filter(l => l.status === 'Ready for Dispatch').length, full: 'Ready for Dispatch' },
    { stage: 'Dispatched', count: filteredLoad.filter(l => l.status === 'Dispatched').length, full: 'Dispatched' }
  ];

  // --- Component 4: Due Date Risk Timeline ---
  const riskTimeline = filteredWOs
    .filter(wo => wo.mandatory_completion_date && wo.customer_inspection !== 'Completed')
    .map(wo => {
      const due = new Date(wo.mandatory_completion_date);
      const now = new Date();
      due.setHours(0,0,0,0);
      now.setHours(0,0,0,0);
      const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
      
      let risk = { class: 'manager-risk-on-track', label: 'On Track' };
      if (diffDays < 0) risk = { class: 'manager-risk-overdue', label: 'Overdue' };
      else if (diffDays <= 3) risk = { class: 'manager-risk-due-soon', label: 'Due Soon' };
      else if (diffDays <= 7) risk = { class: 'manager-risk-upcoming', label: 'Upcoming' };
      
      return { ...wo, diffDays, risk };
    })
    .sort((a, b) => a.diffDays - b.diffDays)
    .slice(0, 8); // Next 8 due
    
  // --- Packing Table Logic ---
  const filteredPackingTable = packingTableData.filter(p => {
    if (search && !(p.description || '').toLowerCase().includes(search.toLowerCase()) && !(p.item_num || '').toLowerCase().includes(search.toLowerCase()) && !(p.work_orders?.wo_num || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  
  const sortedPackingTable = [...filteredPackingTable].sort((a, b) => {
    let valA = a[sortConfig.key];
    let valB = b[sortConfig.key];
    if (sortConfig.key === 'wo_num') {
      valA = a.work_orders?.wo_num; valB = b.work_orders?.wo_num;
    }
    if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
    if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });
  
  const paginatedPackingTable = sortedPackingTable.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const dummySparkData = Array.from({length: 10}, () => ({ value: Math.random() * 10 + 5 }));

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div style={{ background: '#fff', border: '1px solid #ccc', padding: '10px', borderRadius: '4px', fontSize: '12px' }}>
          <p style={{ margin: 0, fontWeight: 'bold' }}>{data.wo_num}</p>
          <p style={{ margin: '4px 0' }}>Created: {data.created_at}</p>
          <p style={{ margin: '4px 0' }}>Age: {data.age} days</p>
          <p style={{ margin: 0, color: WO_STATUS_COLORS[data.status] }}>Status: {data.status}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="manager-dashboard">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h2>Manager Analytics Dashboard</h2>
          <p style={{ color: '#718096', margin: '4px 0 0 0', fontSize: '14px' }}>Read-only analytics and metrics</p>
        </div>
        
        {/* Three-Filter System */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', background: '#f7fafc', padding: '10px 15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#4a5568' }}>Filter Data:</span>
          
          <select 
            value={shift} 
            onChange={e => setShift(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e0', background: '#fff', fontSize: '13px' }}
          >
            <option value="All">All Shifts</option>
            <option value="1">Shift 1</option>
            <option value="2">Shift 2</option>
            <option value="3">Shift 3</option>
          </select>
          
          <div style={{ position: 'relative' }}>
             <button 
               onClick={() => document.getElementById('date-popover').style.display = document.getElementById('date-popover').style.display === 'block' ? 'none' : 'block'}
               style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e0', background: '#fff', fontSize: '13px', cursor: 'pointer' }}
             >
               📅 {dateRange.from || dateRange.to ? `${dateRange.from || '...'} – ${dateRange.to || '...'}` : 'All Dates'} ▼
             </button>
             <div id="date-popover" style={{ display: 'none', position: 'absolute', top: '100%', right: 0, zIndex: 10, background: '#fff', padding: '15px', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', marginTop: '5px', width: '250px' }}>
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#718096', marginBottom: '4px' }}>From (Due Date)</label>
                  <input type="date" value={dateRange.from} onChange={e => setDateRange({...dateRange, from: e.target.value})} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e0', borderRadius: '4px' }} />
                </div>
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#718096', marginBottom: '4px' }}>To (Due Date)</label>
                  <input type="date" value={dateRange.to} onChange={e => setDateRange({...dateRange, to: e.target.value})} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e0', borderRadius: '4px' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', marginBottom: '15px' }}>
                  <button onClick={() => { const t = new Date().toISOString().split('T')[0]; setDateRange({from: t, to: t})}} style={{ fontSize: '11px', padding: '4px', cursor: 'pointer' }}>Today</button>
                  <button onClick={() => { const d = new Date(); d.setDate(d.getDate()-7); setDateRange({from: d.toISOString().split('T')[0], to: new Date().toISOString().split('T')[0]})}} style={{ fontSize: '11px', padding: '4px', cursor: 'pointer' }}>Last 7 Days</button>
                  <button onClick={() => { const d = new Date(); d.setDate(1); setDateRange({from: d.toISOString().split('T')[0], to: new Date().toISOString().split('T')[0]})}} style={{ fontSize: '11px', padding: '4px', cursor: 'pointer' }}>This Month</button>
                  <button onClick={() => { const d = new Date(); d.setDate(d.getDate()-30); setDateRange({from: d.toISOString().split('T')[0], to: new Date().toISOString().split('T')[0]})}} style={{ fontSize: '11px', padding: '4px', cursor: 'pointer' }}>Last 30 Days</button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button onClick={() => setDateRange({from:'', to:''})} style={{ fontSize: '12px', cursor: 'pointer', border: 'none', background: 'none', color: '#718096' }}>Clear</button>
                  <button onClick={() => document.getElementById('date-popover').style.display = 'none'} style={{ fontSize: '12px', cursor: 'pointer', background: '#3182ce', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px' }}>Apply</button>
                </div>
             </div>
          </div>
          
          <select 
            value={selectedWO} 
            onChange={e => setSelectedWO(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e0', background: '#fff', fontSize: '13px', maxWidth: '200px' }}
          >
            <option value="All">📋 All Work Orders</option>
            {data.woData.map(wo => (
              <option key={wo.id} value={wo.id}>{wo.wo_num} — {wo.customer}</option>
            ))}
          </select>
          
          <button onClick={resetFilters} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#edf2f7', fontSize: '13px', cursor: 'pointer', color: '#4a5568' }}>
            🔄 Reset
          </button>
        </div>
      </div>

      {loading && data.woData.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center' }}>Loading dashboard...</div>
      ) : (
        <>
          <div className="manager-kpi-grid">
            <div className="manager-kpi-card">
              <div className="manager-kpi-header">
                <span>Work Orders</span>
                <span style={{ background: '#ebf8ff', padding: '4px 8px', borderRadius: '4px', fontSize: '16px' }}>📋</span>
              </div>
              <div className="manager-kpi-number">{animWoTotal}</div>
              <div className="manager-kpi-subtext">
                <span style={{ color: '#38a169', fontWeight: '600' }}>{woCompleted} Done</span> • 
                <span style={{ color: '#3182ce', fontWeight: '600' }}>{woInProg} In Prog</span> • 
                <span style={{ color: '#e53e3e', fontWeight: '600' }}>{woDelayed} Delayed</span>
              </div>
              <div className="manager-kpi-sparkline">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dummySparkData}>
                    <Area type="monotone" dataKey="value" stroke="#3182ce" fill="#ebf8ff" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="manager-kpi-card">
              <div className="manager-kpi-header">
                <span>Vehicles Today</span>
                <span style={{ background: '#fff5f5', padding: '4px 8px', borderRadius: '4px', fontSize: '16px' }}>🚛</span>
              </div>
              <div className="manager-kpi-number">{animVehTotal}</div>
              <div className="manager-kpi-subtext">
                <span style={{ color: '#38a169', fontWeight: '600' }}>{vehDispatched} Dispatched</span> • 
                <span style={{ color: '#718096', fontWeight: '600' }}>{vehTotal - vehDispatched} In Yard</span>
              </div>
              <div className="manager-kpi-sparkline">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dummySparkData}>
                    <Area type="monotone" dataKey="value" stroke="#e53e3e" fill="#fff5f5" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="manager-kpi-card" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div className="manager-kpi-header" style={{ marginBottom: '8px' }}>
                  <span>Packing Progress</span>
                </div>
                <div className="manager-kpi-number">{packPct}%</div>
                <div className="manager-kpi-subtext" style={{ marginTop: '12px' }}>
                  <span style={{ fontWeight: '600' }}>{packPacked} of {packTotal} packed</span>
                </div>
              </div>
              <div style={{ position: 'relative', width: '80px', height: '80px' }}>
                <ProgressRing percentage={packPct} size={80} strokeWidth={8} color="#38a169" />
              </div>
            </div>

            <div className="manager-kpi-card">
              <div className="manager-kpi-header">
                <span>Loading Lists</span>
                <span style={{ background: '#faf5ff', padding: '4px 8px', borderRadius: '4px', fontSize: '16px' }}>🚚</span>
              </div>
              <div className="manager-kpi-number">{animLoadTotal}</div>
              <div className="manager-kpi-subtext">
                <span style={{ color: '#38a169', fontWeight: '600' }}>{loadDispatched} Dispatched</span> • 
                <span style={{ color: '#dd6b20', fontWeight: '600' }}>{loadPending} Pending</span>
              </div>
              <div className="manager-kpi-sparkline">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dummySparkData}>
                    <Area type="monotone" dataKey="value" stroke="#805ad5" fill="#faf5ff" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '24px' }}>
            <div>
              <div className="manager-charts-grid" style={{ gridTemplateColumns: '1fr' }}>
                <div className="manager-chart-container">
                  <div className="manager-chart-title">Work Order Age by Customer</div>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={woChartData} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
                      <XAxis type="number" tickFormatter={value => Math.round(value)} label={{ value: 'Days since created', position: 'insideBottom', offset: -5 }} />
                      <YAxis dataKey="customer" type="category" width={100} tick={{ fontSize: 12 }} />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f7fafc' }} />
                      <Bar dataKey="age" radius={[0, 4, 4, 0]}>
                        {woChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={WO_STATUS_COLORS[entry.status] || '#cbd5e0'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="manager-charts-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="manager-chart-container">
                  <div className="manager-chart-title">Packing Overview</div>
                  <div className="manager-donut-wrapper">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={donutData} innerRadius={70} outerRadius={100} paddingAngle={2} dataKey="value">
                          {donutData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="manager-donut-center">
                      <div className="manager-donut-center-value">{packPct}%</div>
                      <div className="manager-donut-center-label">Packed</div>
                    </div>
                  </div>
                </div>

                <div className="manager-chart-container">
                  <div className="manager-chart-title">Loading Status Pipeline</div>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={pipelineData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                      <XAxis dataKey="stage" tick={{ fontSize: 11 }} interval={0} />
                      <YAxis allowDecimals={false} />
                      <Tooltip cursor={{ fill: '#f7fafc' }} formatter={(value, name, props) => [value, props.payload.full]} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {pipelineData.map((entry, index) => <Cell key={`cell-${index}`} fill={PIPELINE_COLORS[entry.full] || '#cbd5e0'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="manager-chart-container" style={{ minHeight: 'auto' }}>
                <div className="manager-chart-title">Due Date Risk Timeline</div>
                <div className="table-wrap">
                  <table style={{ margin: 0 }}>
                    <thead>
                      <tr><th>WO NUMBER</th><th>CUSTOMER</th><th>DUE DATE</th><th>STATUS</th><th>RISK</th></tr>
                    </thead>
                    <tbody>
                      {riskTimeline.length === 0 ? (
                        <tr><td colSpan="5" style={{ textAlign: 'center', color: '#718096' }}>No active work orders with due dates.</td></tr>
                      ) : riskTimeline.map(wo => (
                          <tr key={wo.id}>
                            <td><strong>{wo.wo_num}</strong></td>
                            <td>{wo.customer}</td>
                            <td>{wo.mandatory_completion_date}</td>
                            <td><span className={`badge badge-${(wo.customer_inspection || 'pending').toLowerCase().replace(' ', '')}`}>{wo.customer_inspection}</span></td>
                            <td><span className={`manager-risk-indicator ${wo.risk.class}`}>{wo.risk.label}</span></td>
                          </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div>
              <div className="manager-chart-container" style={{ padding: '1.25rem' }}>
                <div className="manager-chart-title" style={{ fontSize: '1rem', marginBottom: '1rem' }}>Activity Log</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  {data.activityData.length === 0 ? (
                    <div style={{ color: '#718096', fontSize: '13px' }}>No recent activity.</div>
                  ) : data.activityData.map(log => {
                      const time = new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      return (
                        <div key={log.id} style={{ display: 'flex', gap: '10px' }}>
                          <div style={{ minWidth: '8px', marginTop: '6px' }}><div style={{ width: '8px', height: '8px', background: '#3182ce', borderRadius: '50%' }}></div></div>
                          <div>
                            <div style={{ fontSize: '13px', color: '#2d3748', lineHeight: '1.4' }}>{log.text}</div>
                            <div style={{ fontSize: '11px', color: '#a0aec0', marginTop: '2px' }}>{time}</div>
                          </div>
                        </div>
                      );
                  })}
                </div>
              </div>
            </div>
          </div>
          
          <div className="manager-chart-container" style={{ minHeight: 'auto', marginTop: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#2d3748' }}>📦 Packing Items Detail</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#718096' }}>Detailed packing status per work order — read only</p>
              </div>
              <input type="text" placeholder="Search by WO, customer, or item..." value={search} onChange={e => setSearch(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #cbd5e0', borderRadius: '6px', fontSize: '13px', width: '250px' }} />
            </div>
            
            <div className="table-wrap">
              <table style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th onClick={() => requestSort('wo_num')} style={{cursor: 'pointer'}}>WO NUMBER {sortConfig.key === 'wo_num' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}</th>
                    <th>CUSTOMER</th>
                    <th>BOX #</th>
                    <th>ITEM #</th>
                    <th>DESCRIPTION</th>
                    <th>QTY</th>
                    <th>UOM</th>
                    <th>PACK TYPE</th>
                    <th onClick={() => requestSort('status')} style={{cursor: 'pointer'}}>STATUS {sortConfig.key === 'status' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}</th>
                    <th onClick={() => requestSort('packing_start_date')} style={{cursor: 'pointer'}}>START DATE {sortConfig.key === 'packing_start_date' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}</th>
                    <th onClick={() => requestSort('packing_end_date')} style={{cursor: 'pointer'}}>END DATE {sortConfig.key === 'packing_end_date' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}</th>
                  </tr>
                </thead>
                <tbody>
                  {tableLoading ? (
                    <tr><td colSpan="11" style={{ textAlign: 'center', padding: '20px' }}>Loading packing details...</td></tr>
                  ) : paginatedPackingTable.length === 0 ? (
                    <tr><td colSpan="11" style={{ textAlign: 'center', color: '#718096', padding: '20px' }}>No packing items found for the selected filters.</td></tr>
                  ) : paginatedPackingTable.map(p => {
                    const isDelayed = p.packing_end_date && p.packing_end_date < today && p.status !== 'Packed';
                    return (
                      <tr key={p.id} style={{ background: isDelayed ? '#fff5f5' : 'transparent' }}>
                        <td>{p.work_orders?.wo_num}</td>
                        <td>{p.work_orders?.customer}</td>
                        <td>{p.box_num}</td>
                        <td>{p.item_num}</td>
                        <td>{p.description}</td>
                        <td>{p.qty}</td>
                        <td>{p.uom}</td>
                        <td>{p.pack_type}</td>
                        <td>
                          <span style={{ cursor: 'default' }} className={`badge badge-${(p.status || 'notstarted').toLowerCase().replace(' ', '')}`}>
                            {p.status}
                          </span>
                          {isDelayed && <span style={{ marginLeft: '6px', fontSize: '11px', color: '#e53e3e' }}>🔴 Delayed</span>}
                        </td>
                        <td>{p.packing_start_date || '—'}</td>
                        <td>{p.packing_end_date || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            {sortedPackingTable.length > ROWS_PER_PAGE && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px', marginTop: '16px' }}>
                <button disabled={page === 1} onClick={() => setPage(page - 1)} style={{ padding: '6px 12px', border: '1px solid #cbd5e0', background: '#fff', borderRadius: '4px', cursor: page === 1 ? 'not-allowed' : 'pointer' }}>Previous</button>
                <span style={{ fontSize: '13px', color: '#4a5568' }}>Page {page} of {Math.ceil(sortedPackingTable.length / ROWS_PER_PAGE)}</span>
                <button disabled={page === Math.ceil(sortedPackingTable.length / ROWS_PER_PAGE)} onClick={() => setPage(page + 1)} style={{ padding: '6px 12px', border: '1px solid #cbd5e0', background: '#fff', borderRadius: '4px', cursor: page === Math.ceil(sortedPackingTable.length / ROWS_PER_PAGE) ? 'not-allowed' : 'pointer' }}>Next</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ManagerDashboard;
"""

with open("src/pages/manager/ManagerDashboard.jsx", "w") as f:
    f.write(content)
