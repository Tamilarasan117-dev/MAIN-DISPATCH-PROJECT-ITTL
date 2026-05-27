import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useOutletContext } from 'react-router-dom';
import { useToast } from '../../components/ToastProvider';
import './manager.css';

const ManagerWorkOrders = () => {
  const { user } = useOutletContext();
  const toast = useToast();

  const [workOrders, setWorkOrders] = useState([]);
  const [packCounts, setPackCounts] = useState({});
  const [loadCounts, setLoadCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  
  const [viewingWO, setViewingWO] = useState(null);
  // Session-only approved state (Set of WO IDs)
  const [approvedWOs, setApprovedWOs] = useState(new Set());

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [
        { data: wos },
        { data: packItems },
        { data: loadItems }
      ] = await Promise.all([
        supabase.from('work_orders').select('*').order('id', { ascending: false }),
        supabase.from('packing_items').select('wo_id, status'),
        supabase.from('loading_list_items').select('ll_id, packing_item_id, packing_items(wo_id), loading_lists(status)')
      ]);

      setWorkOrders(wos || []);

      // Calculate packing counts (packed / total)
      const pCounts = {};
      (packItems || []).forEach(p => {
        if (!pCounts[p.wo_id]) pCounts[p.wo_id] = { packed: 0, total: 0 };
        pCounts[p.wo_id].total += 1;
        if (p.status === 'Packed') pCounts[p.wo_id].packed += 1;
      });
      setPackCounts(pCounts);

      // Calculate loading counts (dispatched / total loaded items)
      // For a WO, count how many loading_list_items it has, and how many are in a 'Dispatched' loading list
      const lCounts = {};
      (loadItems || []).forEach(l => {
        const woId = l.packing_items?.wo_id;
        if (woId) {
          if (!lCounts[woId]) lCounts[woId] = { dispatched: 0, total: 0 };
          lCounts[woId].total += 1;
          if (l.loading_lists?.status === 'Dispatched') lCounts[woId].dispatched += 1;
        }
      });
      setLoadCounts(lCounts);

    } catch (error) {
      console.error(error);
      toast('Failed to fetch data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const approveWO = (e, wo) => {
    e.stopPropagation(); // Prevent opening modal if clicking button
    if (!window.confirm(`Approve Work Order ${wo.wo_num}?`)) return;
    
    // Session-only update
    setApprovedWOs(prev => {
      const next = new Set(prev);
      next.add(wo.id);
      return next;
    });
    
    toast('Work Order Approved (Session Only)');
  };

  const filteredOrders = workOrders.filter(w => {
    if (filter !== 'All' && w.customer_inspection !== filter) return false;
    if (search && !String(w.wo_num || '').toLowerCase().includes(search.toLowerCase()) &&
        !String(w.customer || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total:     workOrders.length,
    pending:   workOrders.filter(w => w.customer_inspection === 'Pending').length,
    inProg:    workOrders.filter(w => w.customer_inspection === 'In Progress').length,
    completed: workOrders.filter(w => w.customer_inspection === 'Completed').length,
  };

  const inspectionColor = (s) => ({
    'Pending':     'badge-pending',
    'In Progress': 'badge-inprogress',
    'Completed':   'badge-completed'
  }[s] || 'badge-normal');

  // Left border color based on status
  const getBorderColor = (s) => {
    if (s === 'In Progress') return '#3182ce'; // blue
    if (s === 'Completed') return '#38a169'; // green
    if (s === 'Pending') return '#dd6b20'; // amber
    return '#e2e8f0';
  };

  // Due date risk calculation
  const getRiskIndicator = (dueDateStr) => {
    if (!dueDateStr) return null;
    const due = new Date(dueDateStr);
    const now = new Date();
    // Reset time for accurate day calculation
    due.setHours(0,0,0,0);
    now.setHours(0,0,0,0);
    
    const diffTime = due - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return { class: 'manager-risk-overdue', label: 'Overdue' };
    if (diffDays <= 3) return { class: 'manager-risk-due-soon', label: 'Due Soon' };
    if (diffDays <= 7) return { class: 'manager-risk-upcoming', label: 'Upcoming' };
    return { class: 'manager-risk-on-track', label: 'On Track' };
  };

  return (
    <div className="manager-dashboard">
      <div className="page-header">
        <h2>Work Orders (Manager View)</h2>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div className="search-wrap">
            <input className="search-input" placeholder="Search WO..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: '20px' }}>
        <div className="stat-card"><div className="label">Total WOs</div><div className="value">{stats.total}</div></div>
        <div className="stat-card"><div className="label">Pending Inspection</div><div className="value val-orange">{stats.pending}</div></div>
        <div className="stat-card"><div className="label">In Progress</div><div className="value val-blue">{stats.inProg}</div></div>
        <div className="stat-card"><div className="label">Completed</div><div className="value val-green">{stats.completed}</div></div>
      </div>

      <div className="filter-tabs">
        {['All', 'Pending', 'In Progress', 'Completed'].map(f => (
          <button key={f} className={`filter-tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>

      <div className="wo-grid">
        {loading ? (
          Array(4).fill(0).map((_, i) => (
            <div key={i} className="wo-card manager-skeleton" style={{ height: '180px' }}></div>
          ))
        ) : filteredOrders.length === 0 ? (
          <div style={{ color: '#718096', fontSize: '14px', padding: '20px' }}>No work orders found.</div>
        ) : (
          filteredOrders.map(wo => {
            const risk = getRiskIndicator(wo.mandatory_completion_date);
            const isApproved = approvedWOs.has(wo.id) || wo.approved_by;
            
            return (
              <div key={wo.id} className="wo-card" style={{ borderLeft: `4px solid ${getBorderColor(wo.customer_inspection)}` }}>
                <div className="wo-card-header">
                  <span className="wo-card-id">{wo.wo_num}</span>
                  <div className="wo-card-badges">
                    <span className={`badge ${inspectionColor(wo.customer_inspection)}`}>{wo.customer_inspection || 'Pending'}</span>
                  </div>
                </div>
                <div className="wo-card-customer">{wo.customer}</div>
                <div className="wo-card-meta">
                  {wo.mva && <span>⚡ {wo.mva}</span>}
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                  {wo.mandatory_completion_date ? (
                    <div style={{ fontSize: '11px', color: '#718096' }}>
                      📅 Due: {wo.mandatory_completion_date}
                    </div>
                  ) : <div></div>}
                  {risk && (
                    <span className={`manager-risk-indicator ${risk.class}`}>{risk.label}</span>
                  )}
                </div>

                <div className="wo-card-actions" style={{ marginTop: '16px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="pack-btn" style={{ cursor: 'default' }}>{packCounts[wo.id]?.packed || 0}/{packCounts[wo.id]?.total || 0} pack</button>
                    <button className="load-btn" style={{ cursor: 'default' }}>{loadCounts[wo.id]?.dispatched || 0}/{loadCounts[wo.id]?.total || 0} load</button>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button className="icon-btn" title="View Details" onClick={() => setViewingWO(wo)}>👁️</button>
                    
                    <button 
                      className={`manager-approve-btn ${isApproved ? 'approved' : ''}`}
                      onClick={(e) => isApproved ? e.preventDefault() : approveWO(e, wo)}
                    >
                      {isApproved ? '✓ Approved' : '✓ Approve'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ══════════ VIEW MODAL (Read-Only) ══════════ */}
      {viewingWO && (
        <div className="modal-overlay" onClick={e => { if (e.target.className === 'modal-overlay') setViewingWO(null); }}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <h3>Work Order Details</h3>
              <button className="modal-close" onClick={() => setViewingWO(null)}>×</button>
            </div>
            
            <div className="manager-view-modal-content" style={{ marginTop: '16px' }}>
              <div className="manager-view-modal-section">
                <div className="manager-view-modal-label">Work Order Number</div>
                <div className="manager-view-modal-value">{viewingWO.wo_num}</div>
                
                <div className="manager-view-modal-label">Customer Name</div>
                <div className="manager-view-modal-value">{viewingWO.customer}</div>
                
                <div className="manager-view-modal-label">Transformer MVA</div>
                <div className="manager-view-modal-value">{viewingWO.mva || '—'}</div>
                
                <div className="manager-view-modal-label">Target Dispatch Date</div>
                <div className="manager-view-modal-value">{viewingWO.mandatory_completion_date || '—'}</div>
              </div>
              
              <div className="manager-view-modal-section">
                <div className="manager-view-modal-label">Status</div>
                <div style={{ marginBottom: '1rem' }}>
                  <span className={`badge ${inspectionColor(viewingWO.customer_inspection)}`}>
                    {viewingWO.customer_inspection || 'Pending'}
                  </span>
                </div>
                
                <div className="manager-view-modal-label">Packing Progress</div>
                <div className="manager-view-modal-value">
                  {packCounts[viewingWO.id]?.packed || 0} / {packCounts[viewingWO.id]?.total || 0} items packed
                </div>
                
                <div className="manager-view-modal-label">Loading Summary</div>
                <div className="manager-view-modal-value">
                  {loadCounts[viewingWO.id]?.dispatched || 0} / {loadCounts[viewingWO.id]?.total || 0} items dispatched
                </div>
              </div>
            </div>

            <div className="modal-footer" style={{ marginTop: '24px', display: 'flex', gap: '15px' }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setViewingWO(null)}>Close</button>
              
              {!approvedWOs.has(viewingWO.id) && !viewingWO.approved_by && (
                <button 
                  className="manager-approve-btn" 
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={(e) => { approveWO(e, viewingWO); setViewingWO(null); }}
                >
                  ✓ Approve
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagerWorkOrders;
