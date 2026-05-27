/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useOutletContext } from 'react-router-dom';
import { useToast } from '../components/ToastProvider';
import { logActivity } from '../lib/activityLogger';
import * as XLSX from 'xlsx';

const LOAD_STATUSES = ['Loading Pending', 'Loading In Progress', 'Ready for Dispatch', 'Dispatched'];

const statusBadgeStyle = (s) => {
  const map = {
    'Loading Pending':     { background: '#e2e8f0', color: '#4a5568' },
    'Loading In Progress': { background: '#feebc8', color: '#c05621' },
    'Ready for Dispatch':  { background: '#bee3f8', color: '#2b6cb0' },
    'Dispatched':          { background: '#c6f6d5', color: '#276749' },
  };
  return map[s] || { background: '#e2e8f0', color: '#718096' };
};

const WO_COLORS = ['#3182ce', '#38a169', '#dd6b20', '#805ad5', '#e53e3e', '#d69e2e'];

const LoadingList = () => {
  const { user } = useOutletContext();
  const toast = useToast();

  const [view, setView] = useState('overview'); // 'overview' | 'detail'
  const [loading, setLoading] = useState(true);

  // Overview State
  const [loadingLists, setLoadingLists] = useState([]);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');

  // Detail State
  const [selectedLL, setSelectedLL] = useState(null);
  const [viewingLL, setViewingLL] = useState(null);
  const [workOrders, setWorkOrders] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [packingItems, setPackingItems] = useState([]); // All fetched packing items for selected WOs
  const [llItems, setLlItems] = useState([]); // All loaded items
  
  const [formData, setFormData] = useState({
    ll_num: '', status: 'Loading Pending', vehicle_capacity: 10000
  });

  const [selectedWOs, setSelectedWOs] = useState([]); // Array of WO header objects

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

  const fetchMasterData = async () => {
    try {
      const [woRes, vehRes] = await Promise.all([
        supabase.from('work_orders').select('*').order('id', { ascending: false }),
        supabase.from('vehicles').select('*').order('id', { ascending: false })
      ]);
      setWorkOrders(woRes.data || []);
      setVehicles(vehRes.data || []);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchPackingItemsForWOs = async (woIds) => {
    if (!woIds || woIds.length === 0) {
      setPackingItems([]);
      return;
    }
    try {
      const { data, error } = await supabase.from('packing_items').select('*').in('wo_id', woIds).eq('status', 'Packed');
      if (error) throw error;
      setPackingItems(data || []);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    if (view === 'overview') {
      fetchOverviewData();
    } else {
      fetchMasterData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Sync packing items when selected WOs change
  useEffect(() => {
    if (view === 'detail') {
      const activeWoIds = selectedWOs.map(w => w.wo_id).filter(id => id);
      if (activeWoIds.length > 0) {
        fetchPackingItemsForWOs(activeWoIds);
        setLlItems(prev => prev.filter(item => activeWoIds.includes(item.wo_id?.toString())));
      } else {
        setPackingItems([]);
      }
    }
  }, [selectedWOs, view]);

  const openNewLoading = () => {
    setSelectedLL(null);
    setFormData({
      ll_num: `LL-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000) + 1000}-${Date.now().toString().slice(-3)}`,
      status: 'Loading Pending',
      vehicle_capacity: 10000
    });
    setSelectedWOs([{
      id: Date.now().toString(),
      wo_id: '', wo_num: '', customer_name: '', vehicle_id: '', vehicle_num: '', vehicle_type: '', driver_name: '', phone: '',
      date_of_loading: new Date().toISOString().split('T')[0], status: 'Loading Pending'
    }]);
    setLlItems([]);
    setView('detail');
  };

  const openEditLoading = async (ll) => {
    setSelectedLL(ll);
    setFormData({
      ll_num: ll.ll_num, status: ll.status || 'Loading Pending',
      vehicle_capacity: ll.vehicle_capacity || 10000
    });
    
    // Check if it's new structure (wos_data) or old structure (wo_id directly on loading_lists)
    let wos = [];
    if (ll.wos_data && ll.wos_data.length > 0) {
      wos = ll.wos_data.map((w, wi) => ({...w, id: w.id || `wo-edit-${wi}`}));
    } else if (ll.wo_id) {
      wos = [{
        id: 'wo-edit-0',
        wo_id: ll.wo_id.toString(), wo_num: ll.wo_num || '', customer_name: ll.customer_name || '',
        vehicle_id: ll.vehicle_id?.toString() || '', vehicle_num: ll.vehicle_num || '', vehicle_type: ll.vehicle_type || '', 
        driver_name: ll.driver_name || '', phone: ll.phone || '', date_of_loading: ll.date_of_loading || '', status: ll.status || 'Loading Pending'
      }];
    }
    
    if (wos.length === 0) {
      wos = [{
        id: 'wo-new-0',
        wo_id: '', wo_num: '', customer_name: '', vehicle_id: '', vehicle_num: '', vehicle_type: '', driver_name: '', phone: '',
        date_of_loading: new Date().toISOString().split('T')[0], status: 'Loading Pending'
      }];
    }
    
    setSelectedWOs(wos);

    // Fetch items
    try {
      const { data, error } = await supabase.from('loading_list_items').select('*, packing_items(wo_id)').eq('ll_id', ll.id);
      if (error) throw error;
      
      const mappedItems = data.map(i => ({
        ...i,
        wo_id: i.packing_items?.wo_id?.toString() || wos[0]?.wo_id // fallback
      }));
      
      setLlItems(mappedItems || []);
    } catch (error) {
      console.error(error);
    }
    setView('detail');
  };

  const deleteLoadingList = async (id) => {
    if (!window.confirm('Delete this loading list completely?')) return;
    try {
      await supabase.from('loading_lists').delete().eq('id', id);
      await logActivity(user?.id, 'Loading List', 'DELETE', `Deleted loading list ID ${id}`);
      toast('Loading list deleted');
      fetchOverviewData();
    } catch (e) {
      console.error(e);
      toast('Failed to delete', 'error');
    }
  };

  const saveLoadingList = async () => {
    const validWOs = selectedWOs.filter(w => w.wo_id);
    if (validWOs.length === 0) { toast('Please select at least one Work Order', 'error'); return; }
    
    setLoading(true);
    try {
      let currentLLId = selectedLL?.id;
      
      let final_ll_num = formData.ll_num;
      if (!currentLLId) {
        final_ll_num = `LL-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000) + 1000}-${Date.now().toString().slice(-4)}`;
      }

      // Extract primary WO details for backward compatibility columns
      const primaryWO = validWOs[0];

      const payload = {
        ll_num: final_ll_num, 
        status: primaryWO.status || formData.status,
        wos_data: validWOs,
        // Backward compatibility
        wo_id: primaryWO.wo_id || null, 
        wo_num: primaryWO.wo_num, 
        customer_name: primaryWO.customer_name,
        vehicle_id: primaryWO.vehicle_id || null, 
        vehicle_num: primaryWO.vehicle_num, 
        vehicle_type: primaryWO.vehicle_type,
        driver_name: primaryWO.driver_name, 
        date_of_loading: primaryWO.date_of_loading
      };

      if (currentLLId) {
        await supabase.from('loading_lists').update(payload).eq('id', currentLLId);
      } else {
        const { data, error } = await supabase.from('loading_lists').insert([payload]).select().single();
        if (error) throw error;
        currentLLId = data.id;
      }

      if (selectedLL) {
        await supabase.from('loading_list_items').delete().eq('ll_id', currentLLId);
      }
      
      if (llItems.length > 0) {
        const itemsPayload = llItems.map(item => ({
          ll_id: currentLLId, packing_item_id: item.packing_item_id, box_num: item.box_num, item_num: item.item_num,
          description: item.description, qty: item.qty, weight: item.weight, remarks: item.remarks
        }));
        const { error: itemsError } = await supabase.from('loading_list_items').insert(itemsPayload);
        if (itemsError) throw itemsError;
      }

      await logActivity(user?.id, 'Loading List', currentLLId ? 'UPDATE' : 'CREATE', `Saved Loading List ${payload.ll_num}`);
      toast('Loading List saved successfully');
      setView('overview');
    } catch (error) {
      toast(`Failed to save Loading List: ${error?.message || error}`, 'error');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // WO Block Management
  const addWorkOrderBlock = () => {
    setSelectedWOs([...selectedWOs, {
      id: Date.now().toString(),
      wo_id: '', wo_num: '', customer_name: '', vehicle_id: '', vehicle_num: '', vehicle_type: '', driver_name: '', phone: '',
      date_of_loading: new Date().toISOString().split('T')[0], status: 'Loading Pending'
    }]);
  };

  const removeWorkOrderBlock = (id) => {
    if (selectedWOs.length <= 1) {
      toast('Must have at least one Work Order block.', 'info');
      return;
    }
    setSelectedWOs(selectedWOs.filter(w => w.id !== id));
  };

  const updateWOBlock = (id, field, value) => {
    setSelectedWOs(selectedWOs.map(w => {
      if (w.id === id) {
        const newW = { ...w, [field]: value };
        if (field === 'wo_id') {
          const wo = workOrders.find(wo => wo.id.toString() === value);
          newW.wo_num = wo?.wo_num || '';
          newW.customer_name = wo?.customer || '';
        }
        if (field === 'vehicle_id') {
          const v = vehicles.find(vec => vec.id.toString() === value);
          newW.vehicle_num = v?.num || '';
          newW.vehicle_type = v?.type || '';
          newW.driver_name = v?.driver || '';
          newW.phone = v?.phone || '';
        }
        return newW;
      }
      return w;
    }));
  };

  const getWOColor = (woId) => {
    const idx = selectedWOs.findIndex(w => w.wo_id === woId);
    if (idx === -1) return '#cbd5e0';
    return WO_COLORS[idx % WO_COLORS.length];
  };

  // Item Management
  const addPackingItemToLoading = (packItem) => {
    if (llItems.find(i => i.packing_item_id === packItem.id)) {
      toast('Item already added', 'info');
      return;
    }
    setLlItems([...llItems, {
      packing_item_id: packItem.id, box_num: packItem.box_num, item_num: packItem.item_num,
      description: packItem.description, qty: packItem.qty, weight: packItem.weight || 0, remarks: '',
      wo_id: packItem.wo_id?.toString()
    }]);
  };

  const addAllPackingItems = (woId) => {
    const newItems = [];
    packingItems.filter(p => p.wo_id?.toString() === woId).forEach(packItem => {
      if (!llItems.find(i => i.packing_item_id === packItem.id)) {
        newItems.push({
          packing_item_id: packItem.id, box_num: packItem.box_num, item_num: packItem.item_num,
          description: packItem.description, qty: packItem.qty, weight: packItem.weight || 0, remarks: '',
          wo_id: packItem.wo_id?.toString()
        });
      }
    });
    setLlItems([...llItems, ...newItems]);
  };

  const removeLlItem = (index) => {
    const newItems = [...llItems];
    newItems.splice(index, 1);
    setLlItems(newItems);
  };

  const updateLlItem = (index, field, value) => {
    const newItems = [...llItems];
    newItems[index][field] = value;
    setLlItems(newItems);
  };

  const exportToExcel = () => {
    if (llItems.length === 0) {
      toast('No items to export', 'info');
      return;
    }
    
    const exportData = llItems.map((item, idx) => {
      const wo = selectedWOs.find(w => w.wo_id === item.wo_id);
      return {
        'S.No': idx + 1,
        'Work Order': wo ? wo.wo_num : '',
        'Box No': item.box_num || '',
        'Item No': item.item_num || '',
        'Description': item.description || '',
        'Qty': item.qty || 0,
        'Weight (kg)': item.weight || 0,
        'Remarks': item.remarks || ''
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Loaded Items");
    XLSX.writeFile(wb, `${formData.ll_num || 'Loading_List'}.xlsx`);
  };

  // Calculations
  const calculateTotalBoxes = () => {
    const boxes = new Set();
    let noBoxCount = 0;
    llItems.forEach(item => {
      if (item.box_num) boxes.add(item.box_num);
      else noBoxCount++;
    });
    return boxes.size + noBoxCount;
  };
  const totalQty = llItems.reduce((sum, item) => sum + (parseInt(item.qty) || 0), 0);
  const totalWeight = llItems.reduce((sum, item) => sum + (parseFloat(item.weight) || 0), 0);
  const capacity = parseFloat(formData.vehicle_capacity) || 0;
  const usagePct = capacity > 0 ? Math.min(100, Math.round((totalWeight / capacity) * 100)) : 0;
  const remainingSpace = capacity > 0 ? Math.max(0, capacity - totalWeight) : 0;

  const filteredLists = loadingLists.filter(ll => {
    if (filter !== 'All' && ll.status !== filter) return false;
    if (search && !ll.ll_num?.toLowerCase().includes(search.toLowerCase()) && !ll.wo_num?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      {view === 'overview' ? (
        <div className="screen-only">
          <div className="page-header">
            <h2>Loading Lists Overview</h2>
            <button className="btn btn-red" onClick={openNewLoading}>+ Add New Loading</button>
          </div>

          <div className="filter-tabs" style={{ marginBottom: '12px' }}>
            {['All', ...LOAD_STATUSES].map(f => (
              <button key={f} className={`filter-tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
                {f} {f !== 'All' && <span style={{ opacity: 0.6, marginLeft: '4px' }}>({loadingLists.filter(l => l.status === f).length})</span>}
              </button>
            ))}
          </div>

          <div className="table-wrap">
            <div style={{ padding: '15px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '15px' }}>
              <input type="text" placeholder="Search LL Number or WO Number..." value={search} onChange={e => setSearch(e.target.value)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e0', width: '300px' }} />
            </div>
            <table>
              <thead>
                <tr><th>S.NO</th><th>WORK ORDERS</th><th>CUSTOMERS</th><th>VEHICLE</th><th>VEHICLE TYPE</th><th>DATE</th><th>STATUS</th><th>ACTIONS</th></tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="7" style={{ textAlign: 'center', padding: '24px' }}>Loading...</td></tr>
                ) : filteredLists.length === 0 ? (
                  <tr><td colSpan="7" style={{ textAlign: 'center', color: '#718096', padding: '24px' }}>No loading lists found.</td></tr>
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
                    <td>{woNums}</td>
                    <td>{custNames}</td>
                    <td>{vhNums}</td>
                    <td>{vhTypes}</td>
                    <td>{ll.date_of_loading}</td>
                    <td><span style={{ ...statusBadgeStyle(ll.status), padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '600' }}>{ll.status}</span></td>
                    <td style={{ display: 'flex', gap: '4px' }}>
                      {user?.role !== 'Security' && (
                        <button className="icon-btn" title="View" onClick={() => setViewingLL(ll)}>👁️</button>
                      )}
                      <button className="icon-btn" title="Edit" onClick={() => openEditLoading(ll)}>✏️</button>
                      <button className="icon-btn danger" title="Delete" onClick={() => deleteLoadingList(ll.id)}>🗑️</button>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <>
        <div className="screen-only">
          <div className="page-header" style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <button className="btn btn-outline" onClick={() => setView('overview')}>← Back</button>
              <h2>{selectedLL ? 'Edit Loading List' : 'New Loading List'}</h2>
              <span style={{ background: '#edf2f7', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' }}>{formData.ll_num}</span>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn btn-outline" onClick={exportToExcel} style={{ color: '#38a169', borderColor: '#38a169' }}>📊 Export Excel</button>
              <button className="btn btn-outline" onClick={() => window.print()}>🖨️ Print Advise</button>
              <button className="btn btn-red" onClick={addWorkOrderBlock}>+ Add Work Order</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 3fr', gap: '20px', marginBottom: '20px' }}>
            
            {/* LEFT COLUMN: Work Orders & Available Items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {selectedWOs.map((woBlock) => {
                const blockColor = getWOColor(woBlock.wo_id);
                const woItems = packingItems.filter(p => p.wo_id?.toString() === woBlock.wo_id);
                
                return (
                  <div key={woBlock.id} style={{ background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                    {/* Block Header */}
                    <div style={{ background: `${blockColor}15`, borderLeft: `4px solid ${blockColor}`, padding: '12px 15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ fontSize: '14px', margin: 0, color: blockColor, fontWeight: '700' }}>Work Order Section</h3>
                      <button className="icon-btn danger" style={{ background: 'transparent', color: '#e53e3e' }} onClick={() => removeWorkOrderBlock(woBlock.id)}>✕</button>
                    </div>
                    
                    <div style={{ padding: '15px' }}>
                      <div className="form-group" style={{ marginBottom: '12px' }}>
                        <label>Work Order *</label>
                        <select value={woBlock.wo_id} onChange={(e) => updateWOBlock(woBlock.id, 'wo_id', e.target.value)}>
                          <option value="">-- Select Work Order --</option>
                          {workOrders.map(w => <option key={w.id} value={w.id}>{w.wo_num} — {w.customer}</option>)}
                        </select>
                      </div>
                      <div className="form-group" style={{ marginBottom: '12px' }}><label>Customer Name</label><input value={woBlock.customer_name} readOnly style={{ background: '#f7fafc', cursor: 'not-allowed' }} /></div>
                      
                      <div className="form-group" style={{ marginBottom: '12px' }}>
                        <label>Vehicle Number</label>
                        <select value={woBlock.vehicle_id} onChange={(e) => updateWOBlock(woBlock.id, 'vehicle_id', e.target.value)}>
                          <option value="">-- Select Vehicle --</option>
                          {vehicles.map(v => <option key={v.id} value={v.id}>{v.num} ({v.type})</option>)}
                        </select>
                      </div>
                      
                      <div className="form-row">
                        <div className="form-group" style={{ marginBottom: '12px' }}>
                          <label>Driver Name</label>
                          <input value={woBlock.driver_name} onChange={(e) => updateWOBlock(woBlock.id, 'driver_name', e.target.value)} />
                        </div>
                        <div className="form-group" style={{ marginBottom: '12px' }}>
                          <label>Driver Phone</label>
                          <input value={woBlock.phone} onChange={(e) => updateWOBlock(woBlock.id, 'phone', e.target.value)} />
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                        <div className="form-group" style={{ flex: 1 }}><label>Date</label><input type="date" value={woBlock.date_of_loading} onChange={(e) => updateWOBlock(woBlock.id, 'date_of_loading', e.target.value)} /></div>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label>Status</label>
                          <select value={woBlock.status} onChange={(e) => updateWOBlock(woBlock.id, 'status', e.target.value)}>
                            {LOAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                      </div>

                      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '15px', marginTop: '5px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#4a5568' }}>Available Packed Items</span>
                          <button className="btn btn-outline" style={{ padding: '2px 8px', fontSize: '11px', borderColor: blockColor, color: blockColor }} onClick={() => addAllPackingItems(woBlock.wo_id)}>Add All</button>
                        </div>
                        
                        <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '4px' }}>
                          {woBlock.wo_id ? woItems.length > 0 ? (
                            woItems.map(p => {
                              const isAdded = llItems.find(i => i.packing_item_id === p.id);
                              return (
                                <div key={p.id} style={{ padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', background: isAdded ? '#f7fafc' : 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div>
                                    <div style={{ fontSize: '11px', fontWeight: 'bold' }}>{p.box_num || '-'} / {p.item_num || '-'}</div>
                                    <div style={{ fontSize: '10px', color: '#4a5568', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }}>{p.description}</div>
                                  </div>
                                  <button className="btn" style={{ background: isAdded ? '#e2e8f0' : blockColor, color: isAdded ? '#a0aec0' : 'white', padding: '2px 8px', fontSize: '10px', borderRadius: '4px', border: 'none', cursor: isAdded ? 'not-allowed' : 'pointer' }} disabled={isAdded} onClick={() => addPackingItemToLoading(p)}>
                                    {isAdded ? 'Added' : 'Add +'}
                                  </button>
                                </div>
                              );
                            })
                          ) : <div style={{ fontSize: '11px', color: '#718096', textAlign: 'center', padding: '20px 0' }}>No packed items available.</div>
                          : <div style={{ fontSize: '11px', color: '#718096', textAlign: 'center', padding: '20px 0' }}>Select Work Order.</div>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* RIGHT COLUMN: Consolidated Loaded Items */}
            <div style={{ background: 'white', padding: '20px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '16px', color: '#2d3748', margin: 0 }}>Consolidated Loaded Items</h3>
                <span style={{ fontSize: '12px', background: '#e2e8f0', padding: '4px 10px', borderRadius: '12px', fontWeight: 'bold' }}>{llItems.length} Items Loaded</span>
              </div>
              
              <div className="table-wrap" style={{ flex: 1, maxHeight: 'calc(100vh - 350px)', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#f7fafc', zIndex: 10 }}>
                    <tr>
                      <th style={{ width: '40px' }}>#</th>
                      <th style={{ width: '120px' }}>WORK ORDER</th>
                      <th>VEHICLE TYPE</th>
                      <th>BOX / ITEM</th>
                      <th>DESCRIPTION</th>
                      <th style={{ width: '70px' }}>QTY</th>
                      <th style={{ width: '90px' }}>WEIGHT</th>
                      <th>REMARKS</th>
                      <th style={{ width: '40px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {llItems.length === 0 ? (
                      <tr><td colSpan="9" style={{ textAlign: 'center', color: '#718096', padding: '60px 0' }}>No items added to loading list yet.</td></tr>
                    ) : llItems.map((item, idx) => {
                      const woColor = getWOColor(item.wo_id);
                      const woInfo = selectedWOs.find(w => w.wo_id === item.wo_id);
                      
                      return (
                      <tr key={idx} style={{ borderLeft: `3px solid ${woColor}` }}>
                        <td className="text-center">{idx + 1}</td>
                        <td><span style={{ background: `${woColor}15`, color: woColor, padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>{woInfo?.wo_num || 'Unknown'}</span></td>
                        <td>{item.vehicle_type || '-'}</td>
                        <td><strong>{item.box_num || '-'}</strong> / {item.item_num || '-'}</td>
                        <td style={{ fontSize: '12px' }}>{item.description}</td>
                        <td><input type="number" value={item.qty} onChange={e => updateLlItem(idx, 'qty', e.target.value)} style={{ width: '50px', padding: '4px', fontSize: '12px' }} /></td>
                        <td><input type="number" value={item.weight} onChange={e => updateLlItem(idx, 'weight', e.target.value)} style={{ width: '70px', padding: '4px', fontSize: '12px' }} /></td>
                        <td><input type="text" value={item.remarks} onChange={e => updateLlItem(idx, 'remarks', e.target.value)} style={{ padding: '4px', width: '100%', fontSize: '12px' }} placeholder="Remarks..." /></td>
                        <td><button className="icon-btn danger" style={{ padding: '4px' }} onClick={() => removeLlItem(idx)}>✕</button></td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Master Summary Section */}
          <div style={{ background: 'white', padding: '20px', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '14px', marginBottom: '15px', color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Loading Session Summary</h3>
            <div className="packing-stats" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
              <div className="packing-stat"><div className="label">Total Work Orders</div><div className="value" style={{ color: '#805ad5' }}>{selectedWOs.filter(w => w.wo_id).length}</div></div>
              <div className="packing-stat"><div className="label">Total Packages / Boxes</div><div className="value">{calculateTotalBoxes()}</div></div>
              <div className="packing-stat"><div className="label">Total Loaded Items</div><div className="value val-blue">{llItems.length}</div></div>
              <div className="packing-stat"><div className="label">Total Quantity</div><div className="value val-orange">{totalQty}</div></div>
              <div className="packing-stat"><div className="label">Total Weight</div><div className="value val-green">{totalWeight} kg</div></div>
            </div>

          </div>
          
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px', marginBottom: '40px' }}>
            <button className="btn btn-outline" onClick={() => setView('overview')} style={{ padding: '12px 24px' }}>Cancel</button>
            <button className="btn btn-red" onClick={saveLoadingList} disabled={loading} style={{ padding: '12px 30px', fontSize: '16px', fontWeight: 'bold' }}>
              {loading ? 'Confirming...' : 'Confirm Loading'}
            </button>
          </div>
        </div>

        {/* ── PRINT UI (A4 Document Only) ── */}
        <div className="print-only">
          <div className="print-a4-sheet">
            <div className="print-header">
              <div className="logo-box"><h1>INDO TECH</h1></div>
              <div className="title-box"><h2>VEHICLES LOADING DETAILS / TRUCK RELEASE ADVISE</h2></div>
              <div className="meta-box">
                <div className="meta-row"><span>Format No :</span><strong>ITTL-IMS-F-IPGA-19</strong></div>
                <div className="meta-row"><span>Rev No / Date :</span><strong>00 / 08.04.2025</strong></div>
                <div className="meta-row"><span>Loading List No :</span><strong>{formData.ll_num}</strong></div>
                <div className="meta-row"><span>Print date :</span><strong>{new Date().toLocaleDateString('en-GB')}</strong></div>
              </div>
            </div>

            {/* Print Header Grid maps the first WO for backward compatibility, or summarizes */}
            <div className="print-grid-top">
              <div className="cell cell-span-1" style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000', display: 'flex', flexDirection: 'column' }}><span className="lbl">Work Order Nos:</span><span className="bold">{selectedWOs.map(w => w.wo_num).filter(Boolean).join(', ')}</span></div>
              <div className="cell cell-span-2" style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000', display: 'flex', flexDirection: 'column' }}><span className="lbl">Customer Names:</span><span className="bold">{[...new Set(selectedWOs.map(w => w.customer_name).filter(Boolean))].join(', ')}</span></div>
              <div className="cell cell-span-1 text-center" style={{ borderBottom: '1px solid #000', gridRow: 'span 2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><strong style={{ fontSize: '14px' }}>✓ DOMESTIC</strong></div>
              
              <div className="cell cell-span-1" style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000', display: 'flex', flexDirection: 'column' }}><span className="lbl">Vehicle Types:</span><span className="bold">{[...new Set(selectedWOs.map(w => w.vehicle_type).filter(Boolean))].join(', ')}</span></div>
              <div className="cell cell-span-2" style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000', display: 'flex', flexDirection: 'column' }}><span className="lbl">Vehicle Nos:</span><span className="bold">{[...new Set(selectedWOs.map(w => w.vehicle_num).filter(Boolean))].join(', ')}</span></div>
              
              <div className="cell cell-span-4" style={{ display: 'flex', borderBottom: '1px solid #000', padding: 0 }}>
                <div style={{ flex: 1, padding: '4px', borderRight: '1px solid #000', display: 'flex', alignItems: 'center' }}><span className="lbl" style={{ marginRight: '10px' }}>Driver Names:</span><span className="bold">{[...new Set(selectedWOs.map(w => w.driver_name).filter(Boolean))].join(', ')}</span></div>
                <div style={{ flex: 1, padding: '4px', borderRight: '1px solid #000', display: 'flex', alignItems: 'center' }}></div>
                <div style={{ flex: 1, padding: '4px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}><span className="lbl">Production signature with date:</span></div>
              </div>
            </div>

            <table className="print-table">
              <thead>
                <tr><th style={{ width: '40px' }}>S.No.</th><th style={{ width: '80px' }}>WO No</th><th style={{ width: '120px' }}>Box No. / Item No.</th><th style={{ width: 'auto' }}>Item Name</th><th style={{ width: '60px' }}>Quantity</th><th style={{ width: '60px' }}>Weight</th><th style={{ width: '120px' }}>Remarks</th></tr>
              </thead>
              <tbody>
                {llItems.map((item, idx) => {
                  const woInfo = selectedWOs.find(w => w.wo_id === item.wo_id);
                  return (
                  <tr key={idx}>
                    <td className="text-center bold">{idx + 1}</td>
                    <td className="text-center">{woInfo?.wo_num?.split('-').pop()}</td>
                    <td className="text-center bold">{item.box_num} / {item.item_num}</td>
                    <td className="bold">{item.description}</td>
                    <td className="text-center bold">{item.qty}</td>
                    <td className="text-center">{item.weight} kg</td>
                    <td>{item.remarks}</td>
                  </tr>
                )})}
                {Array.from({ length: Math.max(0, 10 - llItems.length) }).map((_, i) => <tr key={`blank-${i}`} className="blank-row"><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>)}
              </tbody>
            </table>

            <div className="print-footer-grid">
              <div className="footer-cell left-half" style={{ display: 'flex', justifyContent: 'flex-end', borderBottom: '1px solid #000' }}><span className="lbl" style={{ alignSelf: 'center', marginRight: '10px' }}>Total No. of packages / Boxes:</span></div>
              <div className="footer-cell right-half text-center bold" style={{ borderBottom: '1px solid #000', fontSize: '14px', alignSelf: 'center' }}>{calculateTotalBoxes()}</div>
              <div className="footer-cell left-half" style={{ borderBottom: '1px solid #000', display: 'flex', alignItems: 'center' }}></div>
              <div className="footer-cell right-half" style={{ borderBottom: '1px solid #000' }}><span className="lbl">Verified by (Production supervisor)</span></div>
              <div className="footer-cell left-half" style={{ borderBottom: '1px solid #000', display: 'flex' }}><span className="lbl" style={{ width: '160px' }}>Driver Name:</span><span className="bold">{[...new Set(selectedWOs.map(w => w.driver_name).filter(Boolean))].join(', ')}</span></div>
              <div className="footer-cell right-half" style={{ borderBottom: '1px solid #000', display: 'flex' }}><span className="lbl" style={{ width: '50px' }}>Name :</span><span></span></div>
              <div className="footer-cell left-half" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}><span className="lbl">Driver signature</span><span className="lbl" style={{ marginTop: '20px', fontSize: '10px', textTransform: 'uppercase' }}>TRUCK / VEHICLE RELEASED BY QUALITY :</span></div>
              <div className="footer-cell right-half" style={{ display: 'flex', flexDirection: 'column' }}><span className="lbl" style={{ marginBottom: '10px' }}>Signature:</span><div style={{ borderTop: '1px solid #000', paddingTop: '4px', marginTop: '10px' }}><span className="lbl">Photos taken by (Quality)</span><div style={{ display: 'flex', marginTop: '4px' }}><span className="lbl" style={{ width: '50px' }}>Name :</span><span></span></div><span className="lbl" style={{ marginTop: '15px', display: 'block' }}>Signature:</span></div></div>
            </div>
          </div>
        </div>
        </>
      )}

      {/* ══════════ VIEW MODAL ══════════ */}
      {viewingLL && (
        <div className="modal-overlay" onClick={e => { if (e.target.className === 'modal-overlay') setViewingLL(null); }}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <h3>Loading List Details</h3>
              <button className="modal-close" onClick={() => setViewingLL(null)}>×</button>
            </div>
            
            <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
              
              {/* Top Information Section */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Loading List Number</div>
                  <div style={{ background: '#f7fafc', padding: '10px 14px', borderRadius: '8px', marginTop: '6px', border: '1.5px solid #e2e8f0', color: '#2d3748', fontWeight: '600', fontSize: '14px' }}>
                    {viewingLL.ll_num || '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</div>
                  <div style={{ marginTop: '12px' }}>
                    <span style={{ ...statusBadgeStyle(viewingLL.status), padding: '6px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>
                      {viewingLL.status || 'Pending'}
                    </span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date</div>
                  <div style={{ background: '#f7fafc', padding: '10px 14px', borderRadius: '8px', marginTop: '6px', border: '1.5px solid #e2e8f0', color: '#2d3748', fontWeight: '600', fontSize: '14px' }}>
                    {viewingLL.date_of_loading || '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Items</div>
                  <div style={{ background: '#f7fafc', padding: '10px 14px', borderRadius: '8px', marginTop: '6px', border: '1.5px solid #e2e8f0', color: '#2d3748', fontWeight: '600', fontSize: '14px' }}>
                    {viewingLL.loading_list_items?.length || 0}
                  </div>
                </div>
              </div>

              {/* Vehicle & Order Section */}
              {viewingLL.wos_data && viewingLL.wos_data.length > 0 ? (
                viewingLL.wos_data.map((woBlock, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px' }}>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Work Order Number</div>
                      <div style={{ background: '#f7fafc', padding: '10px 14px', borderRadius: '8px', marginTop: '6px', border: '1.5px solid #e2e8f0', color: '#2d3748', fontWeight: '600', fontSize: '14px' }}>
                        {woBlock.wo_num || '—'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Customer Name</div>
                      <div style={{ background: '#f7fafc', padding: '10px 14px', borderRadius: '8px', marginTop: '6px', border: '1.5px solid #e2e8f0', color: '#2d3748', fontWeight: '600', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {woBlock.customer_name || '—'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Vehicle Number</div>
                      <div style={{ background: '#f7fafc', padding: '10px 14px', borderRadius: '8px', marginTop: '6px', border: '1.5px solid #e2e8f0', color: '#2d3748', fontWeight: '600', fontSize: '14px' }}>
                        {woBlock.vehicle_num || '—'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Vehicle Type</div>
                      <div style={{ background: '#f7fafc', padding: '10px 14px', borderRadius: '8px', marginTop: '6px', border: '1.5px solid #e2e8f0', color: '#2d3748', fontWeight: '600', fontSize: '14px' }}>
                        {woBlock.vehicle_type || '—'}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Work Order Number</div>
                    <div style={{ background: '#f7fafc', padding: '10px 14px', borderRadius: '8px', marginTop: '6px', border: '1.5px solid #e2e8f0', color: '#2d3748', fontWeight: '600', fontSize: '14px' }}>
                      {viewingLL.wo_num || '—'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Customer Name</div>
                    <div style={{ background: '#f7fafc', padding: '10px 14px', borderRadius: '8px', marginTop: '6px', border: '1.5px solid #e2e8f0', color: '#2d3748', fontWeight: '600', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {viewingLL.customer_name || '—'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Vehicle Number</div>
                    <div style={{ background: '#f7fafc', padding: '10px 14px', borderRadius: '8px', marginTop: '6px', border: '1.5px solid #e2e8f0', color: '#2d3748', fontWeight: '600', fontSize: '14px' }}>
                      {viewingLL.vehicle_num || '—'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Vehicle Type</div>
                    <div style={{ background: '#f7fafc', padding: '10px 14px', borderRadius: '8px', marginTop: '6px', border: '1.5px solid #e2e8f0', color: '#2d3748', fontWeight: '600', fontSize: '14px' }}>
                      {viewingLL.vehicle_type || '—'}
                    </div>
                  </div>
                </div>
              )}

              {/* Items List Table */}
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#2d3748', marginBottom: '12px' }}>Loaded Items</div>
                <div className="table-wrap" style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                  <table style={{ margin: 0, width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 1, backgroundColor: '#f7fafc' }}>
                      <tr>
                        <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1.5px solid #e2e8f0', color: '#4a5568', fontSize: '11px', textTransform: 'uppercase' }}>BOX / ITEM</th>
                        <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1.5px solid #e2e8f0', color: '#4a5568', fontSize: '11px', textTransform: 'uppercase' }}>DESCRIPTION</th>
                        <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1.5px solid #e2e8f0', color: '#4a5568', fontSize: '11px', textTransform: 'uppercase' }}>QTY</th>
                        <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1.5px solid #e2e8f0', color: '#4a5568', fontSize: '11px', textTransform: 'uppercase' }}>WEIGHT</th>
                        <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1.5px solid #e2e8f0', color: '#4a5568', fontSize: '11px', textTransform: 'uppercase' }}>REMARKS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(!viewingLL.loading_list_items || viewingLL.loading_list_items.length === 0) ? (
                        <tr><td colSpan="5" style={{ textAlign: 'center', color: '#718096', padding: '20px' }}>No items loaded.</td></tr>
                      ) : (
                        viewingLL.loading_list_items.map((item, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #edf2f7' }}>
                            <td style={{ padding: '10px', fontSize: '13px' }}><strong>{item.box_num || '-'}</strong> / {item.item_num || '-'}</td>
                            <td style={{ padding: '10px', fontSize: '13px' }}>{item.description}</td>
                            <td style={{ padding: '10px', fontSize: '13px' }}>{item.qty}</td>
                            <td style={{ padding: '10px', fontSize: '13px' }}>{item.weight || '-'}</td>
                            <td style={{ padding: '10px', fontSize: '13px', color: '#718096' }}>{item.remarks || '-'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

            <div className="modal-footer" style={{ marginTop: '24px' }}>
              <button className="btn btn-outline" style={{ width: '100%' }} onClick={() => setViewingLL(null)}>Close Details</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoadingList;
