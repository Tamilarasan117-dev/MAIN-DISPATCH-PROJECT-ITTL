import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useOutletContext } from 'react-router-dom';
import { useToast } from '../../components/ToastProvider';
import './manager.css';

const LOAD_STATUSES = ['Loading Pending', 'Loading In Progress', 'Ready for Dispatch', 'Dispatched'];

const statusBadgeStyle = (s) => {
  const map = {
    'Loading Pending':     { background: '#feebc8', color: '#c05621' }, // amber
    'Loading In Progress': { background: '#bee3f8', color: '#2b6cb0' }, // blue
    'Ready for Dispatch':  { background: '#b2f5ea', color: '#319795' }, // teal
    'Dispatched':          { background: '#c6f6d5', color: '#276749' }, // green
  };
  return map[s] || { background: '#e2e8f0', color: '#718096' };
};

const ManagerLoadingList = () => {
  const { user } = useOutletContext();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [loadingLists, setLoadingLists] = useState([]);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');

  const [viewingLL, setViewingLL] = useState(null);

  useEffect(() => {
    fetchOverviewData();
  }, []);

  const fetchOverviewData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('loading_lists').select('*, loading_list_items(*)').order('id', { ascending: false });
      if (error) throw error;
      setLoadingLists(data || []);
    } catch (e) {
      console.error(e);
      toast('Failed to load loading lists', 'error');
    } finally {
      setLoading(false);
    }
  };

  const filteredLists = loadingLists.filter(l => {
    if (filter !== 'All' && l.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const matchNum = (l.ll_num || '').toLowerCase().includes(q);
      const matchWO = (l.wo_num || '').toLowerCase().includes(q) || 
                      (l.wos_data || []).some(w => w.wo_num?.toLowerCase().includes(q));
      return matchNum || matchWO;
    }
    return true;
  });

  const getStatusCount = (s) => loadingLists.filter(l => l.status === s).length;

  return (
    <div className="manager-dashboard">
      <div className="page-header">
        <h2>Loading Lists (Manager View)</h2>
      </div>

      {/* ── Status Pipeline Bar ── */}
      <div className="manager-pipeline">
        {LOAD_STATUSES.map((status, index) => {
          const count = getStatusCount(status);
          const isActive = filter === status || filter === 'All';
          return (
            <React.Fragment key={status}>
              <div 
                className={`manager-pipeline-stage ${isActive && count > 0 ? 'active' : ''}`}
                style={{ 
                  opacity: count === 0 ? 0.6 : 1,
                  cursor: 'pointer'
                }}
                onClick={() => setFilter(status)}
              >
                {status} <span style={{ marginLeft: '6px', fontWeight: 'bold' }}>({count})</span>
              </div>
              {index < LOAD_STATUSES.length - 1 && (
                <div className="manager-pipeline-arrow">→</div>
              )}
            </React.Fragment>
          );
        })}
        {filter !== 'All' && (
          <button 
            className="btn btn-outline" 
            style={{ marginLeft: '12px', padding: '4px 10px', fontSize: '12px' }}
            onClick={() => setFilter('All')}
          >
            Clear Filter
          </button>
        )}
      </div>

      <div className="table-wrap">
        <div style={{ padding: '15px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '15px' }}>
          <input type="text" placeholder="Search LL Number or WO Number..." value={search} onChange={e => setSearch(e.target.value)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e0', width: '300px' }} />
        </div>
        <table>
          <thead>
            <tr><th>S.NO</th><th>LOADING LIST #</th><th>WORK ORDERS</th><th>CUSTOMERS</th><th>VEHICLE</th><th>VEHICLE TYPE</th><th>DATE</th><th>STATUS</th><th>VIEW</th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="9" style={{ textAlign: 'center', padding: '24px' }}>Loading...</td></tr>
            ) : filteredLists.length === 0 ? (
              <tr><td colSpan="9" style={{ textAlign: 'center', color: '#718096', padding: '24px' }}>No loading lists found.</td></tr>
            ) : filteredLists.map((ll, idx) => {
              let woNums = ll.wo_num;
              let custNames = ll.customer_name;
              let vhNums = ll.vehicle_num || '-';
              let vhTypes = ll.vehicle_type || '-';
              if (ll.wos_data && ll.wos_data.length > 0) {
                woNums = ll.wos_data.map(w => w.wo_num).join(', ');
                custNames = [...new Set(ll.wos_data.map(w => w.customer_name).filter(Boolean))].join(', ');
                const extractedVhNums = [...new Set(ll.wos_data.map(w => w.vehicle_num).filter(Boolean))];
                if (extractedVhNums.length > 0) vhNums = extractedVhNums.join(', ');
                const extractedVhTypes = [...new Set(ll.wos_data.map(w => w.vehicle_type).filter(Boolean))];
                if (extractedVhTypes.length > 0) vhTypes = extractedVhTypes.join(', ');
              }
              
              return (
              <tr key={ll.id}>
                <td className="text-center"><strong>{idx + 1}</strong></td>
                <td><strong>{ll.ll_num}</strong></td>
                <td>{woNums}</td>
                <td>{custNames}</td>
                <td>{vhNums}</td>
                <td>{vhTypes}</td>
                <td>{ll.date_of_loading}</td>
                <td>
                  <span style={{ ...statusBadgeStyle(ll.status), padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '600' }}>
                    {ll.status}
                  </span>
                </td>
                <td>
                  <button className="icon-btn" title="View Detail" onClick={() => setViewingLL(ll)}>👁️</button>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>

      {/* ══════════ VIEW MODAL (Read-Only) ══════════ */}
      {viewingLL && (
        <div className="modal-overlay" onClick={e => { if (e.target.className === 'modal-overlay') setViewingLL(null); }}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <h3>Loading List Details</h3>
              <button className="modal-close" onClick={() => setViewingLL(null)}>×</button>
            </div>
            
            <div className="manager-view-modal-content" style={{ marginTop: '16px', gridTemplateColumns: '1fr' }}>
              
              <div className="manager-view-modal-section" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px' }}>
                <div>
                  <div className="manager-view-modal-label">Loading List Number</div>
                  <div className="manager-view-modal-value" style={{ margin: 0 }}>{viewingLL.ll_num}</div>
                </div>
                <div>
                  <div className="manager-view-modal-label">Status</div>
                  <div style={{ margin: 0 }}>
                    <span style={{ ...statusBadgeStyle(viewingLL.status), padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '600' }}>
                      {viewingLL.status}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="manager-view-modal-label">Date</div>
                  <div className="manager-view-modal-value" style={{ margin: 0 }}>{viewingLL.date_of_loading}</div>
                </div>
                <div>
                  <div className="manager-view-modal-label">Total Items</div>
                  <div className="manager-view-modal-value" style={{ margin: 0 }}>{viewingLL.loading_list_items?.length || 0}</div>
                </div>
              </div>

              {/* WO Blocks Summary */}
              {viewingLL.wos_data && viewingLL.wos_data.length > 0 ? (
                viewingLL.wos_data.map((woBlock, idx) => (
                  <div key={idx} className="manager-view-modal-section">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '15px' }}>
                      <div>
                        <div className="manager-view-modal-label">Work Order Number</div>
                        <div className="manager-view-modal-value" style={{ margin: 0 }}>{woBlock.wo_num}</div>
                      </div>
                      <div>
                        <div className="manager-view-modal-label">Customer Name</div>
                        <div className="manager-view-modal-value" style={{ margin: 0 }}>{woBlock.customer_name}</div>
                      </div>
                      <div>
                        <div className="manager-view-modal-label">Vehicle Number</div>
                        <div className="manager-view-modal-value" style={{ margin: 0 }}>{woBlock.vehicle_num || '-'}</div>
                      </div>
                      <div>
                        <div className="manager-view-modal-label">Vehicle Type</div>
                        <div className="manager-view-modal-value" style={{ margin: 0 }}>{woBlock.vehicle_type || '-'}</div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="manager-view-modal-section">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '15px' }}>
                    <div>
                      <div className="manager-view-modal-label">Work Order Number</div>
                      <div className="manager-view-modal-value" style={{ margin: 0 }}>{viewingLL.wo_num}</div>
                    </div>
                    <div>
                      <div className="manager-view-modal-label">Customer Name</div>
                      <div className="manager-view-modal-value" style={{ margin: 0 }}>{viewingLL.customer_name}</div>
                    </div>
                    <div>
                      <div className="manager-view-modal-label">Vehicle Number</div>
                      <div className="manager-view-modal-value" style={{ margin: 0 }}>{viewingLL.vehicle_num || '-'}</div>
                    </div>
                    <div>
                      <div className="manager-view-modal-label">Vehicle Type</div>
                      <div className="manager-view-modal-value" style={{ margin: 0 }}>{viewingLL.vehicle_type || '-'}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Items List */}
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                <div className="manager-view-modal-label" style={{ marginBottom: '10px' }}>Loaded Items</div>
                <div className="table-wrap" style={{ maxHeight: '250px', overflowY: 'auto' }}>
                  <table style={{ margin: 0 }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                      <tr>
                        <th>BOX / ITEM</th>
                        <th>DESCRIPTION</th>
                        <th>QTY</th>
                        <th>WEIGHT</th>
                        <th>REMARKS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(!viewingLL.loading_list_items || viewingLL.loading_list_items.length === 0) ? (
                        <tr><td colSpan="5" style={{ textAlign: 'center', color: '#718096' }}>No items loaded.</td></tr>
                      ) : (
                        viewingLL.loading_list_items.map((item, i) => (
                          <tr key={i}>
                            <td><strong>{item.box_num || '-'}</strong> / {item.item_num || '-'}</td>
                            <td>{item.description}</td>
                            <td>{item.qty}</td>
                            <td>{item.weight || '-'}</td>
                            <td>{item.remarks || '-'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

            <div className="modal-footer" style={{ marginTop: '24px', display: 'flex' }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setViewingLL(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagerLoadingList;
