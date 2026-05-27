import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useOutletContext } from 'react-router-dom';
import { useToast } from '../../components/ToastProvider';
import ProgressRing from './ProgressRing';
import './manager.css';

const STATUSES = ['Not Started', 'In Progress', 'Packed'];

const ManagerPackingList = () => {
  const { user } = useOutletContext() || {};
  const toast = useToast();

  const [workOrders, setWorkOrders] = useState([]);
  const [selectedWOId, setSelectedWOId] = useState('');
  const [packingItems, setPackingItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: wos } = await supabase.from('work_orders').select('*').order('id', { ascending: false });

      const fetchedWOs = wos || [];
      setWorkOrders(fetchedWOs);
      if (fetchedWOs.length > 0 && !selectedWOId) {
        setSelectedWOId(fetchedWOs[0].id.toString());
      }
    } catch (error) {
      console.error(error);
      toast('Failed to fetch data', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedWOId, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (selectedWOId) fetchPackingItems(selectedWOId);
    else setPackingItems([]);
  }, [selectedWOId]);

  const fetchPackingItems = async (woId) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('packing_items').select('*').eq('wo_id', woId).order('id', { ascending: true });
      if (error) throw error;
      setPackingItems(data || []);
    } catch (error) { 
      console.error(error); 
    } finally {
      setLoading(false);
    }
  };

  const selectedWO = workOrders.find(w => w.id.toString() === selectedWOId);

  const filteredItems = packingItems.filter(p => {
    if (filter !== 'All' && p.status !== filter) return false;
    if (search && !(p.description || '').toLowerCase().includes(search.toLowerCase()) &&
      !(p.custom_desc || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const total = packingItems.length;
  const notStarted = packingItems.filter(p => p.status === 'Not Started').length;
  const inProgress = packingItems.filter(p => p.status === 'In Progress').length;
  const packed = packingItems.filter(p => p.status === 'Packed').length;
  const pct = total ? Math.round((packed / total) * 100) : 0;

  const statusBadge = (s) => ({
    'Not Started': 'badge-pending',
    'In Progress': 'badge-inprogress',
    'Packed': 'badge-completed'
  }[s] || 'badge-pending');

  return (
    <div className="manager-dashboard">
      <div className="page-header"><h2>Packing List (Manager View)</h2></div>

      <div className="autofill-note">
        📦 Read-only view of packing progress.
      </div>

      {/* ── Page Level WO Selector ── */}
      <div className="wo-selector-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: '#718096', fontWeight: '600' }}>WORK ORDER</span>
          <select value={selectedWOId} onChange={e => setSelectedWOId(e.target.value)} style={{ minWidth: '260px' }}>
            {workOrders.map(w => <option key={w.id} value={w.id}>{w.wo_num} — {w.customer}</option>)}
          </select>
          {selectedWO && (
            <div className="wo-detail-bar">
              {selectedWO.mva && <span className="wo-detail-tag">⚡ <strong>{selectedWO.mva}</strong></span>}
              {selectedWO.rating && <span className="wo-detail-tag">🔧 {selectedWO.rating}</span>}
              {selectedWO.individual_box && <span className="wo-detail-tag">📦 {selectedWO.individual_box}</span>}
              <span className={`badge badge-${(selectedWO.customer_inspection || 'pending').toLowerCase().replace(' ', '')}`}>
                {selectedWO.customer_inspection || 'Pending'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Stats with Progress Ring */}
      <div className="packing-stats" style={{ gridTemplateColumns: 'repeat(5, 1fr)', alignItems: 'center' }}>
        <div className="packing-stat"><div className="label">Total</div><div className="value">{total}</div><div className="sub">Items</div></div>
        <div className="packing-stat"><div className="label">Not Started</div><div className="value val-orange">{notStarted}</div><div className="sub">Pending</div></div>
        <div className="packing-stat"><div className="label">In Progress</div><div className="value val-blue">{inProgress}</div><div className="sub">Packing</div></div>
        <div className="packing-stat"><div className="label">Packed</div><div className="value val-green">{packed}</div><div className="sub">→ Loading</div></div>
        
        <div className="packing-stat" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', minHeight: '100px' }}>
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
            <div style={{ fontSize: '1.2rem', fontWeight: '700', color: '#1a202c' }}>{pct}%</div>
          </div>
          <ProgressRing percentage={pct} size={80} strokeWidth={8} color="#38a169" />
        </div>
      </div>

      {/* Filters */}
      <div className="filter-tabs" style={{ marginBottom: '12px' }}>
        {['All', ...STATUSES].map(f => (
          <button key={f} className={`filter-tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {f}{f !== 'All' && <span style={{ opacity: 0.6, marginLeft: '4px' }}>({packingItems.filter(p => p.status === f).length})</span>}
          </button>
        ))}
        <div className="search-wrap" style={{ marginLeft: 'auto' }}>
          <input className="search-input" placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Table */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>BOX #</th><th>ITEM #</th><th>DESCRIPTION</th><th>QTY</th><th>UOM</th><th>PACK TYPE</th><th>STATUS</th><th>START DATE</th><th>END DATE</th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="9" style={{ textAlign: 'center', padding: '24px' }}>Loading...</td></tr>
            ) : filteredItems.length === 0 ? (
              <tr><td colSpan="9" style={{ textAlign: 'center', color: '#718096', padding: '24px' }}>
                {packingItems.length === 0 ? 'No packing items yet.' : 'No items match the current filter.'}
              </td></tr>
            ) : filteredItems.map(p => (
              <tr key={p.id}>
                <td>{p.box_num}</td>
                <td>{p.item_num}</td>
                <td>
                  <strong style={{ fontSize: '13px' }}>{p.description}</strong>
                  {p.custom_desc && <div style={{ fontSize: '11px', color: '#718096' }}>{p.custom_desc}</div>}
                </td>
                <td>{p.qty}</td>
                <td>{p.uom}</td>
                <td>{p.pack_type}</td>
                <td>
                  <span className={`badge ${statusBadge(p.status)}`}
                    style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '600', cursor: 'default' }}>
                    {p.status}
                  </span>
                </td>
                <td>{p.packing_start_date || '—'}</td>
                <td>{p.packing_end_date || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ padding: '10px 16px', fontSize: '12px', color: '#718096', display: 'flex', justifyContent: 'space-between' }}>
          <span>{filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}</span>
          <span>{packed}/{total} packed ({pct}%)</span>
        </div>
      </div>
    </div>
  );
};

export default ManagerPackingList;
