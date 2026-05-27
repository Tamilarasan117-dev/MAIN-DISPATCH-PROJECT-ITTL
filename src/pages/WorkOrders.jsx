import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { useToast } from '../components/ToastProvider';
import { logActivity } from '../lib/activityLogger';

// ── Searchable Autocomplete Input ──────────────────────────────────
const SearchableInput = ({ label, placeholder, value, onChange, suggestions, required }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || '');
  const ref = useRef(null);

  useEffect(() => { setQuery(value || ''); }, [value]);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = suggestions.filter(s => s.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="form-group" ref={ref} style={{ position: 'relative' }}>
      <label>{label}{required && ' *'}</label>
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        style={{ width: '100%' }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1200,
          background: '#fff', border: '1.5px solid #e53e3e', borderRadius: '8px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.14)', maxHeight: '200px', overflowY: 'auto', marginTop: '2px'
        }}>
          {filtered.map((s, i) => (
            <div key={i}
              onMouseDown={() => { setQuery(s); onChange(s); setOpen(false); }}
              style={{ padding: '9px 14px', fontSize: '13px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}
              onMouseEnter={e => e.currentTarget.style.background = '#fff5f5'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────
const WorkOrders = () => {
  const { user } = useOutletContext();
  const toast = useToast();
  const navigate = useNavigate();

  const [workOrders, setWorkOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [packCounts, setPackCounts] = useState({});
  const [loadCounts, setLoadCounts] = useState({});

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWO, setEditingWO] = useState(null);
  const [viewingWO, setViewingWO] = useState(null);
  const [errors, setErrors] = useState({});

  const [formData, setFormData] = useState({
    wo_num: '', customer: '',
    mva: '',              // Transformer MVA
    customer_inspection: 'Pending',
    mandatory_completion_date: '',
    job_serial_no: '',
    remarks: '',
    // Removed reference fields (dispatch_ref, packing_ref, loading_ref)
    // No longer initializing these fields in formData
    export_domestic: 'Domestic',
    priority: 'Normal',
    delivery_deadline: ''
  });

  const [masterData, setMasterData] = useState({
    mvas: [
      '10 MVA / 33kV','31.5 MVA / 132kV','63 MVA / 220kV',
      '100 MVA / 220kV','125 MVA / 220kV','160 MVA / 220kV',
      '250 MVA / 400kV','315 MVA / 400kV','500 MVA / 765kV'
    ],
    ratings: [
      'Power Transformer','Distribution Transformer','Auto Transformer',
      'Generator Transformer','Rectifier Transformer'
    ],
    boxes: [
      'BOX-001','BOX-002','BOX-003','BOX-004','BOX-005',
      'BOX-006','BOX-007','BOX-008','BOX-009','BOX-010'
    ],
    customers: []
  });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [
        { data: wos },
        { data: packItems },
        { data: loadItems },
        { data: masterLists }
      ] = await Promise.all([
        supabase.from('work_orders').select('*').order('id', { ascending: false }),
        supabase.from('packing_items').select('wo_id'),
        supabase.from('loading_items').select('wo_id'),
        supabase.from('master_list').select('*')
      ]);

      setWorkOrders(wos || []);

      const pCounts = {};
      (packItems || []).forEach(p => pCounts[p.wo_id] = (pCounts[p.wo_id] || 0) + 1);
      setPackCounts(pCounts);

      const lCounts = {};
      (loadItems || []).forEach(l => lCounts[l.wo_id] = (lCounts[l.wo_id] || 0) + 1);
      setLoadCounts(lCounts);

      const ml = masterLists || [];
      const customers = ml.filter(m => m.category_key === 'Customers').map(m => m.value);
      // "Transformer Ratings" category = MVA values (e.g. "160 MVA / 220kV")
      const mvas = ml.filter(m => m.category_key === 'Transformer Ratings').map(m => m.value);
      // "Transformer Types" category = type names (e.g. "Power Transformer")
      const ratings = ml.filter(m => m.category_key === 'Transformer Types').map(m => m.value);

      // Build individual box list from existing WO data
      const existingBoxes = [...new Set(
        (wos || []).map(w => w.individual_box).filter(Boolean).concat([
          'BOX-001','BOX-002','BOX-003','BOX-004','BOX-005',
          'BOX-006','BOX-007','BOX-008','BOX-009','BOX-010'
        ])
      )];

      setMasterData(prev => ({
        ...prev,
        customers: customers.length ? customers : prev.customers,
        mvas:      mvas.length      ? mvas      : prev.mvas,
        ratings:   ratings.length   ? ratings   : prev.ratings,
        boxes:     existingBoxes
      }));

    } catch (error) {
      console.error(error);
      toast('Failed to fetch data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const approveWO = async (wo) => {
    if (!window.confirm(`Approve Work Order ${wo.wo_num}?`)) return;
    try {
      const { error } = await supabase.from('work_orders').update({
        approved_by: user?.name || user?.user_metadata?.name || 'Manager',
        approved_at: new Date().toISOString()
      }).eq('id', wo.id);
      if (error) throw error;
      await logActivity(user?.id, 'Work Orders', 'APPROVE', `Approved Work Order ${wo.wo_num}`);
      toast('Work Order Approved');
      fetchData();
    } catch (error) {
      console.error(error);
      toast('Failed to approve: ' + error.message, 'error');
    }
  };

  const canEdit = () => true;
  const canDelete = () => user && (user.role === 'Admin' || user.role === 'Power User');

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

  const openModal = (wo = null) => {
    setErrors({});
    if (wo) {
      setEditingWO(wo);
      setFormData({
        wo_num:                    wo.wo_num || '',
        customer:                  wo.customer || '',
        mva:                       wo.mva || '',
        voltage_range:             wo.voltage_range || '',
        job_serial_no:             wo.job_serial_no || '',
        created_by:                wo.created_by || '',
        customer_inspection:       wo.customer_inspection || 'Pending',
        mandatory_completion_date: wo.mandatory_completion_date || '',
        remarks:                   wo.remarks || '',
        export_domestic:           wo.export_domestic || 'Domestic',
        priority:                  wo.priority || 'Normal',
        delivery_deadline:         wo.delivery_deadline || ''
      });
    } else {
      const year = new Date().getFullYear();
      const rand = String(Math.floor(Math.random() * 9000) + 1000);
      setEditingWO(null);
      setFormData({
        wo_num: `WO-${year}-${rand}`,
        customer: '', mva: '', voltage_range: '', job_serial_no: '', created_by: user?.user_metadata?.name || '',
        customer_inspection: 'Pending', mandatory_completion_date: '', remarks: '',
        // Removed reference field generation
        // dispatch_ref, packing_ref, loading_ref are no longer generated
        export_domestic: 'Domestic',
        priority: 'Normal',
        delivery_deadline: ''
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => { setIsModalOpen(false); setErrors({}); };

  const validate = () => {
    const e = {};
    if (!formData.wo_num.trim())               e.wo_num               = 'WO Number is required';
    if (!formData.customer.trim())             e.customer             = 'Customer Name is required';
    if (!formData.mva.trim())                  e.mva                  = 'Transformer MVA is required';
    if (!formData.mandatory_completion_date)   e.mandatory_completion_date = 'Completion Date is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const saveWO = async () => {
    if (!validate()) { toast('Please fill all required fields', 'error'); return; }

    const payload = {
      wo_num:                    formData.wo_num.trim(),
      customer:                  formData.customer.trim(),
      mva:                       formData.mva.trim(),
      voltage_range:             formData.voltage_range?.trim() || '',
      job_serial_no:             formData.job_serial_no?.trim() || '',
      created_by:                formData.created_by?.trim() || '',
      customer_inspection:       formData.customer_inspection,
      mandatory_completion_date: formData.mandatory_completion_date,
      remarks:                   formData.remarks,
      // Removed reference fields from payload assignment
      // dispatch_ref, packing_ref, loading_ref are omitted
      export_domestic:           formData.export_domestic,
      priority:                  formData.priority,
      delivery_deadline:         formData.delivery_deadline
    };

    try {
      if (editingWO) {
        const { error } = await supabase.from('work_orders').update(payload).eq('id', editingWO.id);
        if (error) throw error;
        await logActivity(user?.id, 'Work Orders', 'UPDATE', `Updated Work Order ${payload.wo_num}`);
        toast('Work order updated successfully');
      } else {
        const { error } = await supabase.from('work_orders').insert([payload]);
        if (error) throw error;
        await logActivity(user?.id, 'Work Orders', 'CREATE', `Created Work Order ${payload.wo_num}`);
        toast('Work order created successfully');
      }
      closeModal();
      fetchData();
    } catch (error) {
      console.error(error);
      toast('Failed to save work order: ' + error.message, 'error');
    }
  };

  const deleteWO = async (id, num) => {
    if (!window.confirm(`Delete ${num}? This cannot be undone.`)) return;
    try {
      const { error } = await supabase.from('work_orders').delete().eq('id', id);
      if (error) throw error;
      await logActivity(user?.id, 'Work Orders', 'DELETE', `Deleted Work Order ${num}`);
      toast('Work order deleted');
      fetchData();
    } catch (error) {
      toast('Failed to delete work order', 'error');
    }
  };

  const errStyle = { color: '#e53e3e', fontSize: '11px', marginTop: '3px' };

  return (
    <div>
      <div className="page-header">
        <h2>Work Orders</h2>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div className="search-wrap">
            <input className="search-input" placeholder="Search WO..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {canEdit() && (
            <button className="btn btn-red" onClick={() => openModal()}>+ New Work Order</button>
          )}
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
          <div style={{ color: '#718096', fontSize: '14px', padding: '20px' }}>Loading...</div>
        ) : filteredOrders.length === 0 ? (
          <div style={{ color: '#718096', fontSize: '14px', padding: '20px' }}>No work orders found.</div>
        ) : (
          filteredOrders.map(wo => (
            <div key={wo.id} className="wo-card">
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
              {wo.mandatory_completion_date && (
                <div style={{ fontSize: '11px', color: '#718096', marginTop: '4px' }}>
                  📅 Due: {wo.mandatory_completion_date}
                </div>
              )}
              <div className="wo-card-actions">
                <button className="pack-btn">{packCounts[wo.id] || 0} pack</button>
                <button className="load-btn">{loadCounts[wo.id] || 0} load</button>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button className="icon-btn" title="View Details" onClick={() => setViewingWO(wo)}>👁️</button>
                  {!wo.approved_by && canEdit() && (
                    <button className="icon-btn" title="Approve" onClick={() => approveWO(wo)}>✅</button>
                  )}
                  {canEdit() && <button className="icon-btn edit" onClick={() => openModal(wo)}>✎</button>}
                  {canDelete() && <button className="icon-btn danger" onClick={() => deleteWO(wo.id, wo.wo_num)}>🗑</button>}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ══════════ MODAL ══════════ */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={e => { if (e.target.className === 'modal-overlay') closeModal(); }}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <h3>{editingWO ? 'Edit Work Order' : 'New Work Order'}</h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>

            {/* ROW 1 — WO Number | Customer Name */}
            <div className="form-row">
              <div className="form-group">
                <label>WO Number *</label>
                <input value={formData.wo_num} onChange={e => setFormData({ ...formData, wo_num: e.target.value })} placeholder="WO-2026-..." />
                {errors.wo_num && <div style={errStyle}>{errors.wo_num}</div>}
              </div>
              <div className="form-group">
                <label>Customer Name *</label>
                <input value={formData.customer} onChange={e => setFormData({ ...formData, customer: e.target.value })}
                  list="customerList" placeholder="e.g. NTPC Ltd." />
                <datalist id="customerList">{masterData.customers.map(c => <option key={c} value={c} />)}</datalist>
                {errors.customer && <div style={errStyle}>{errors.customer}</div>}
              </div>
            </div>

            {/* ROW 2 — Transformer MVA and Voltage Range */}
            <div className="form-row">
              <SearchableInput
                label="Transformer MVA"
                placeholder="Search or type MVA... e.g. 160 MVA"
                value={formData.mva}
                onChange={v => setFormData({ ...formData, mva: v })}
                suggestions={masterData.mvas}
                required
              />
              <div className="form-group">
                <label>Voltage Range</label>
                <input value={formData.voltage_range} onChange={e => setFormData({ ...formData, voltage_range: e.target.value })} placeholder="e.g. 220kV" />
              </div>
            </div>
            {errors.mva && <div style={{ ...errStyle, marginTop: '-20px', marginBottom: '12px' }}>{errors.mva}</div>}

            {/* ROW 3 — Export/Domestic & Priority */}
            <div className="form-row">
              <div className="form-group">
                <label>Export / Domestic</label>
                <select value={formData.export_domestic} onChange={e => setFormData({ ...formData, export_domestic: e.target.value })}>
                  {['Domestic', 'Export'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Priority</label>
                <select value={formData.priority} onChange={e => setFormData({ ...formData, priority: e.target.value })}>
                  {['Normal', 'High', 'Urgent'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* ROW 4 — Work Order Status | Mandatory Completion Date */}
            <div className="form-row">
              <div className="form-group">
                <label>Work Order Status *</label>
                <select value={formData.customer_inspection} onChange={e => setFormData({ ...formData, customer_inspection: e.target.value })}>
                  {['Pending', 'In Progress', 'Completed'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Delivery Deadline *</label>
                <input type="date" value={formData.mandatory_completion_date}
                  onChange={e => setFormData({ ...formData, mandatory_completion_date: e.target.value })} />
                {errors.mandatory_completion_date && <div style={errStyle}>{errors.mandatory_completion_date}</div>}
              </div>
            </div>

            {/* ROW 6 — Job Serial No | Created By */}
            <div className="form-row">
              <div className="form-group">
                <label>Job Serial No</label>
                <input value={formData.job_serial_no} onChange={e => setFormData({ ...formData, job_serial_no: e.target.value })} placeholder="e.g. JS-2026-01" />
              </div>
              <div className="form-group">
                <label>Created By</label>
                <input value={formData.created_by} onChange={e => setFormData({ ...formData, created_by: e.target.value })} placeholder="e.g. Admin" />
              </div>
            </div>

            {/* ROW 6 — Remarks */}
            <div className="form-group">
              <label>Remarks</label>
              <textarea rows="2" value={formData.remarks}
                onChange={e => setFormData({ ...formData, remarks: e.target.value })}
                placeholder="Additional notes..."></textarea>
            </div>

            <div className="modal-footer">
              <button className="btn btn-outline" onClick={closeModal}>Cancel</button>
              <button className="btn btn-red" onClick={saveWO}>Save Work Order</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ VIEW MODAL ══════════ */}
      {viewingWO && (
        <div className="modal-overlay" onClick={e => { if (e.target.className === 'modal-overlay') setViewingWO(null); }}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <h3>Work Order Details</h3>
              <button className="modal-close" onClick={() => setViewingWO(null)}>×</button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '10px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Work Order Number</label>
                <div style={{ background: '#f7fafc', padding: '10px 14px', borderRadius: '8px', marginTop: '6px', border: '1.5px solid #e2e8f0', color: '#2d3748', fontWeight: '600', fontSize: '14px' }}>
                  {viewingWO.wo_num}
                </div>
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Customer Name</label>
                <div style={{ background: '#f7fafc', padding: '10px 14px', borderRadius: '8px', marginTop: '6px', border: '1.5px solid #e2e8f0', color: '#2d3748', fontWeight: '600', fontSize: '14px' }}>
                  {viewingWO.customer}
                </div>
              </div>
              
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Transformer MVA</label>
                <div style={{ background: '#f7fafc', padding: '10px 14px', borderRadius: '8px', marginTop: '6px', border: '1.5px solid #e2e8f0', color: '#2d3748', fontWeight: '600', fontSize: '14px' }}>
                  {viewingWO.mva || '—'}
                </div>
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Voltage Range</label>
                <div style={{ background: '#f7fafc', padding: '10px 14px', borderRadius: '8px', marginTop: '6px', border: '1.5px solid #e2e8f0', color: '#2d3748', fontWeight: '600', fontSize: '14px' }}>
                  {viewingWO.voltage_range || '—'}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status / Progress</label>
                <div style={{ background: '#f7fafc', padding: '10px 14px', borderRadius: '8px', marginTop: '6px', border: '1.5px solid #e2e8f0', color: '#2d3748', fontWeight: '600', fontSize: '14px' }}>
                  {viewingWO.customer_inspection || 'Pending'}
                </div>
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Target Dispatch Date</label>
                <div style={{ background: '#f7fafc', padding: '10px 14px', borderRadius: '8px', marginTop: '6px', border: '1.5px solid #e2e8f0', color: '#2d3748', fontWeight: '600', fontSize: '14px' }}>
                  {viewingWO.mandatory_completion_date || '—'}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Job Serial No</label>
                <div style={{ background: '#f7fafc', padding: '10px 14px', borderRadius: '8px', marginTop: '6px', border: '1.5px solid #e2e8f0', color: '#2d3748', fontWeight: '600', fontSize: '14px' }}>
                  {viewingWO.job_serial_no || '—'}
                </div>
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Created By</label>
                <div style={{ background: '#f7fafc', padding: '10px 14px', borderRadius: '8px', marginTop: '6px', border: '1.5px solid #e2e8f0', color: '#2d3748', fontWeight: '600', fontSize: '14px' }}>
                  {viewingWO.created_by || '—'}
                </div>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Remarks</label>
                <div style={{ background: '#f7fafc', padding: '10px 14px', borderRadius: '8px', marginTop: '6px', border: '1.5px solid #e2e8f0', color: '#4a5568', fontSize: '13px', minHeight: '60px' }}>
                  {viewingWO.remarks || 'No remarks provided.'}
                </div>
              </div>
            </div>

            <div className="modal-footer" style={{ marginTop: '24px', display: 'flex', gap: '15px' }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setViewingWO(null)}>Close Details</button>
              <button className="btn btn-red" style={{ flex: 1 }} onClick={() => navigate(`/dispatch-slip/${viewingWO.id}`)}>🖨️ Print Dispatch Slip</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkOrders;
