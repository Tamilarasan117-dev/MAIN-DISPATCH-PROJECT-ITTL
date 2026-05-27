import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useOutletContext } from 'react-router-dom';
import { useToast } from '../components/ToastProvider';
import { logActivity } from '../lib/activityLogger';
import { getPackingDateUpdates } from '../lib/packingDateRules';
import { usePackingCopyPaste } from "../hooks/usePackingCopyPaste";
import { SmartItemInput } from '../components/SmartItemInput';
import { processLearnedItems } from '../lib/masterListLearning';
const STATUSES = ['Not Started', 'In Progress', 'Packed'];

// ── Reusable Searchable Dropdown ───────────────────────────────────
const SearchableDropdown = ({ value, onChange, options, placeholder, displayKey, valueKey }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  const filtered = (options || []).filter(o => {
    const label = displayKey ? (o[displayKey] || '') : (o || '');
    return String(label).toLowerCase().includes(q.toLowerCase());
  });

  const getDisplay = (val) => {
    if (!val) return '';
    if (displayKey) {
      const found = options.find(o => o[valueKey] === val);
      return found ? found[displayKey] : val;
    }
    return val;
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        value={open ? q : getDisplay(value)}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => { setQ(''); setOpen(true); }}
        placeholder={placeholder}
        autoComplete="off"
        style={{ width: '100%' }}
        readOnly={false}
      />
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1100,
          background: '#fff', border: '1.5px solid #e53e3e', borderRadius: '8px',
          boxShadow: '0 8px 28px rgba(0,0,0,0.14)', maxHeight: '200px',
          overflowY: 'auto', marginTop: '2px'
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '10px 14px', fontSize: '12px', color: '#999' }}>No results found</div>
          ) : filtered.map((o, i) => {
            const label = displayKey ? o[displayKey] : o;
            const val = valueKey ? o[valueKey] : o;
            return (
              <div key={i}
                onMouseDown={() => { onChange(val); setQ(''); setOpen(false); }}
                style={{ padding: '9px 14px', fontSize: '13px', cursor: 'pointer', borderBottom: '1px solid #f5f5f5', transition: 'background .1s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#fff5f5'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                {label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── Read-only display field ────────────────────────────────────────
const ReadField = ({ label, value }) => (
  <div>
    <label style={{ fontSize: '11px', fontWeight: '700', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>{label}</label>
    <div style={{ background: '#f7fafc', border: '1.5px solid #e2e8f0', borderRadius: '7px', padding: '9px 12px', fontSize: '13px', color: '#4a5568', minHeight: '38px' }}>
      {value || <span style={{ color: '#cbd5e0' }}>—</span>}
    </div>
  </div>
);

// ── Main Component ─────────────────────────────────────────────────
const PackingList = () => {
  const { user } = useOutletContext() || {};
  const toast = useToast();

  const {
    copiedItems,
    copiedFromWO,
    handleCopy,
    initiatePaste,
    confirmPaste,
    cancelPaste,
    pasteModalData
  } = usePackingCopyPaste(toast);

  const [workOrders, setWorkOrders] = useState([]);
  const [selectedWOId, setSelectedWOId] = useState('');
  const [packingItems, setPackingItems] = useState([]);
  const [masterItems, setMasterItems] = useState([]);


  const [duplicateConflicts, setDuplicateConflicts] = useState(null);
  const [duplicateBoxErrorIndexes, setDuplicateBoxErrorIndexes] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  // Modal WO selection (separate from page-level WO selector)
  const [modalWOId, setModalWOId] = useState('');

  const getEmptyItemRow = () => ({ 
    box_num: '', item_num: '', description: '', qty: 1, uom: 'No.', pack_type: 'Open Type',
    weight: 0, length: 0, width: 0, height: 0, production_sig: '', quality_sig: '' 
  });

  // ISSUE 6: Single source of truth — dates are at formData level, not per-row
  const [formData, setFormData] = useState({
    wo_num: '', customer: '', mva: '', voltage_range: '',
    packing_start_date: '', packing_end_date: '',
    items: [getEmptyItemRow()]
  });

  // Auto-focus ref for newly added rows
  const lastRowRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [
        { data: wos },
        { data: masterLists }
      ] = await Promise.all([
        supabase.from('work_orders').select('*').order('id', { ascending: false }),
        supabase.from('master_list').select('*').eq('category_key', 'Packing list items').order('value', { ascending: true })
      ]);

      const fetchedWOs = wos || [];
      const mappedMasterItems = (masterLists || []).map(m => ({ name: m.value, usage_count: 0 }));
      setWorkOrders(fetchedWOs);
      setMasterItems(mappedMasterItems);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWOId]);

  const fetchPackingItems = async (woId) => {
    try {
      const { data, error } = await supabase
        .from('packing_items').select('*').eq('wo_id', woId).order('id', { ascending: true });
      if (error) throw error;
      setPackingItems(data || []);
    } catch (error) { console.error(error); }
  };

  const selectedWO = workOrders.find(w => w.id.toString() === selectedWOId);
  // WO selected inside modal
  const modalWO = workOrders.find(w => w.id.toString() === modalWOId);
  // ISSUE 4: Total boxes auto-calculated — never asked from user
  const modalTotalBoxes = modalWO
    ? packingItems.filter(p => p.wo_id?.toString() === modalWOId).map(p => p.box_num).filter(Boolean)
    : [];
  const uniqueBoxCount = [...new Set(modalTotalBoxes)].length;

  // ISSUE 7: Compute whether Save should be disabled
  const isSaveDisabled = !modalWOId || formData.items.some(r => !r.description || !r.box_num);

  const canEdit = () => true;
  const canDelete = () => user && (user?.role === 'Admin' || user?.role === 'Supervisor');
  const canEditDates = () => user && (user?.role === 'Admin' || user?.role === 'Supervisor');
  const canEditDatesOnly = () => user && (user?.role === 'Admin' || user?.role === 'Supervisor' || user?.role === 'User');

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

  // Sync happens perfectly on create/update now.
  const syncToLoadingList = async (item, newStatus) => {};

  const cycleStatus = async (item) => {
    const idx = STATUSES.indexOf(item.status);
    const newStatus = STATUSES[(idx + 1) % STATUSES.length];
    try {
      const dateUpdates = getPackingDateUpdates(item.status, newStatus, user?.role);
      const { error } = await supabase.from('packing_items').update({ status: newStatus, ...dateUpdates }).eq('id', item.id);
      if (error) throw error;
      await syncToLoadingList(item, newStatus);
      await logActivity(user?.id, 'Packing List', 'UPDATE', `Changed status of Item ${item.item_num || item.description} to ${newStatus}`);
      setPackingItems(packingItems.map(p => p.id === item.id ? { ...p, status: newStatus, ...dateUpdates } : p));
      if (newStatus === 'Packed') toast(`Packed → added to Loading List`);
    } catch (error) {
      toast('Failed to update status', 'error');
    }
  };

  const openModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setModalWOId(item.wo_id?.toString() || selectedWOId);
      // ISSUE 6: Dates at formData level (shared state)
      setFormData({
        wo_num: item.wo_num || '', customer: item.customer || '', mva: item.mva || '', voltage_range: item.voltage_range || item.rating || '',
        packing_start_date: item.packing_start_date || '',
        packing_end_date: item.packing_end_date || '',
        items: [{
          box_num: item.box_num || '', item_num: item.item_num || '',
          description: item.custom_desc || item.description || '',
          qty: item.qty || 1, uom: item.uom || 'No.', pack_type: item.pack_type || 'Open Type',
          weight: item.weight || 0, length: item.length || 0, width: item.width || 0, height: item.height || 0,
          production_sig: item.production_sig || '', quality_sig: item.quality_sig || ''
        }]
      });
    } else {
      setEditingItem(null);
      setModalWOId(selectedWOId);
      const selectedWO = workOrders.find(w => w.id.toString() === selectedWOId?.toString());
      // ISSUE 1 & 5: Default start date to today, WO metadata always filled
      const today = new Date().toISOString().split('T')[0];
      setFormData({
        wo_num: selectedWO?.wo_num || '', 
        customer: selectedWO?.customer || '', 
        mva: selectedWO?.mva || '', 
        voltage_range: selectedWO?.voltage_range || '', 
        packing_start_date: today,
        packing_end_date: '',
        items: [getEmptyItemRow()]
      });
    }
    setIsModalOpen(true);
  };

  const handleWOSelect = (woId) => {
    setModalWOId(woId);
    const selectedWO = workOrders.find(w => w.id.toString() === woId?.toString());
    if (selectedWO) {
      setFormData(prev => ({
        ...prev,
        wo_num: selectedWO.wo_num || '',
        customer: selectedWO.customer || '',
        mva: selectedWO.mva || '',
        voltage_range: selectedWO.voltage_range || ''
      }));
    } else {
      setFormData(prev => ({ ...prev, wo_num: '', customer: '', mva: '', voltage_range: '' }));
    }
  };

  const closeModal = () => setIsModalOpen(false);


  const executeInsert = async (itemsToInsert, itemsToUpdate) => {
    try {
      if (itemsToInsert.length > 0) {
        const { data: insertedItems, error } = await supabase.from('packing_items').insert(itemsToInsert).select();
        if (error) throw error;
        const loadingPayloads = insertedItems.map(item => ({
          packing_item_id: item.id, wo_id: item.wo_id, wo_num: item.wo_num, item_num: item.item_num,
          description: item.description, qty: item.qty, uom: item.uom, weight: 0, status: 'Reported',
          box_num: item.box_num, notes: `Auto-synced from Packing`
        }));
        if (loadingPayloads.length > 0) await supabase.from('loading_items').insert(loadingPayloads);
        await logActivity(user?.id, 'Packing List', 'CREATE', `Added ${itemsToInsert.length} packing items to WO ${formData.wo_num}`);
      }

      for (const updatePayload of itemsToUpdate) {
        const { error } = await supabase.from('packing_items').update(updatePayload).eq('id', updatePayload.id);
        if (error) throw error;
        await supabase.from('loading_items').update({
          wo_id: updatePayload.wo_id, wo_num: updatePayload.wo_num, item_num: updatePayload.item_num,
          description: updatePayload.description, qty: updatePayload.qty, uom: updatePayload.uom,
          box_num: updatePayload.box_num
        }).eq('packing_item_id', updatePayload.id);
      }

      if (itemsToUpdate.length > 0) {
         await logActivity(user?.id, 'Packing List', 'UPDATE', `Updated ${itemsToUpdate.length} packing items in WO ${formData.wo_num}`);
      }

      toast('Items saved successfully');
      closeModal();
      fetchPackingItems(selectedWOId);
    } catch (error) {
      toast('Failed to save: ' + error.message, 'error');
    }
  };

  const resolveConflict = async (resolution) => {
    const { newItems, updates, conflicts, currentIndex } = duplicateConflicts;
    const currentConflict = conflicts[currentIndex];
    
    let nextNewItems = [...newItems];
    let nextUpdates = [...updates];

    if (resolution === 'replace') {
      nextUpdates.push({ ...currentConflict.new, id: currentConflict.existing.id });
    } else if (resolution === 'add') {
      nextUpdates.push({ 
        ...currentConflict.new, 
        id: currentConflict.existing.id,
        qty: (Number(currentConflict.existing.qty) || 0) + (Number(currentConflict.new.qty) || 0)
      });
    } // if 'skip', do nothing

    if (currentIndex + 1 < conflicts.length) {
      setDuplicateConflicts({ ...duplicateConflicts, newItems: nextNewItems, updates: nextUpdates, currentIndex: currentIndex + 1 });
    } else {
      setDuplicateConflicts(null);
      await executeInsert(nextNewItems, nextUpdates);
    }
  };

  const saveItem = async () => {
    // ISSUE 8: Full validation layer
    if (!modalWOId) { toast('Please select a Work Order', 'error'); return; }
    if (!formData.wo_num) { toast('Work Order data is missing. Please re-select.', 'error'); return; }

    try {
      // ISSUE 1, 2, 3, 8: Shared date with fallback to today
      const today = new Date().toISOString().split('T')[0];
      const sharedStartDate = formData.packing_start_date || today;
      const sharedEndDate = formData.packing_end_date || null;

      const payloads = formData.items.map(row => {
        if (!row.description) throw new Error('Item description is required for all rows');
        if (!row.box_num) throw new Error('Box Number is required for all rows');
        return {
          // ISSUE 5: WO metadata always included
          wo_id: modalWOId, wo_num: formData.wo_num,
          box_num: row.box_num, item_num: row.item_num,
          description: row.description, custom_desc: '', qty: row.qty, uom: row.uom, pack_type: row.pack_type,
          weight: row.weight, length: row.length, width: row.width, height: row.height,
          production_sig: row.production_sig, quality_sig: row.quality_sig,
          // ISSUE 1, 2, 8: Every row gets the shared date — never null on insert
          packing_start_date: canEditDatesOnly() ? sharedStartDate : null,
          packing_end_date: canEditDatesOnly() ? sharedEndDate : null,
          status: editingItem ? editingItem.status : 'Not Started'
        };
      });

      // Validations
      const emptyBoxIndexes = formData.items.map((r, i) => !r.box_num ? i : -1).filter(i => i !== -1);
      if (emptyBoxIndexes.length > 0) {
        setDuplicateBoxErrorIndexes(emptyBoxIndexes);
        toast('Box Number is required for all rows', 'error');
        return;
      }

      const boxItemKeys = formData.items.map(r => `${r.box_num}-${r.item_num || ''}`);
      const uniqueBoxItemKeys = new Set(boxItemKeys);
      if (uniqueBoxItemKeys.size !== boxItemKeys.length) {
         toast('Duplicate Box/Item combinations entered in the form.', 'error');
         return;
      }

      const boxNums = formData.items.map(r => r.box_num);
      const { data: existingGlobalBoxes, error: globalBoxError } = await supabase
        .from('packing_items')
        .select('box_num, item_num, id')
        .eq('wo_num', formData.wo_num)
        .in('box_num', boxNums);
        
      if (globalBoxError) throw globalBoxError;

      const actualExistingBoxes = existingGlobalBoxes.filter(e => !(editingItem && e.id === editingItem.id));
      if (actualExistingBoxes.length > 0) {
        const dupes = [];
        const errorIndexes = [];
        
        formData.items.forEach((row, i) => {
          const isDupe = actualExistingBoxes.some(
            e => e.box_num === row.box_num && (e.item_num || '') === (row.item_num || '')
          );
          if (isDupe) {
            dupes.push(`Box ${row.box_num} Item ${row.item_num || ''}`.trim());
            errorIndexes.push(i);
          }
        });

        if (dupes.length > 0) {
          setDuplicateBoxErrorIndexes(errorIndexes);
          toast(`Items already exist in this Work Order: ${dupes.join(', ')}.`, 'error');
          return;
        }
      }

      setDuplicateBoxErrorIndexes([]);

      if (editingItem) {
        await executeInsert([], [{ ...payloads[0], id: editingItem.id }]);
      } else {
        await executeInsert(payloads, []);
        // Trigger smart auto-learning AFTER successful save
        await processLearnedItems(formData.items);
        fetchData(); // Refresh master list to show newly learned items immediately
      }
    } catch (error) {
      toast('Failed to save: ' + error.message, 'error');
    }
  };


  const deleteItem = async (id) => {
    if (!window.confirm('Delete this item?')) return;
    try {
      const { error } = await supabase.from('packing_items').delete().eq('id', id);
      if (error) throw error;
      // Auto-remove from loading list
      await supabase.from('loading_items').delete().eq('packing_item_id', id);
      await logActivity(user?.id, 'Packing List', 'DELETE', `Deleted packing item ID ${id}`);
      setPackingItems(packingItems.filter(p => p.id !== id));
      toast('Item deleted');
    } catch (error) { toast('Failed to delete item', 'error'); }
  };

  const statusBadge = s => ({
    'Not Started': 'badge-pending',
    'In Progress': 'badge-inprogress',
    'Packed': 'badge-completed'
  }[s] || 'badge-normal');

  // Build WO display options for searchable dropdown
  const woOptions = workOrders.map(w => ({
    id: w.id.toString(),
    label: `${w.wo_num} — ${w.customer}`
  }));

  return (
    <div>
      <div className="page-header"><h2>Packing List</h2></div>

      <div className="autofill-note">
        📦 Items marked as <strong>"Packed"</strong> are automatically added to the <strong>Loading List</strong>. Click status badge to cycle.
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
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {(user?.role === 'User' || user?.role === 'Supervisor') && (
            <>
              <button 
                className="btn" 
                style={{ background: 'transparent', border: '1px solid #cbd5e0', color: '#4a5568' }}
                disabled={packingItems.length === 0}
                title="Copy all packing items from this work order"
                onClick={() => {
                  const currentWO = workOrders.find(wo => wo.id.toString() === selectedWOId);
                  handleCopy(packingItems, currentWO?.wo_num);
                }}
              >
                📋 Copy List
              </button>
              
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                <button 
                  className="btn" 
                  style={{ background: 'transparent', border: '1px solid #cbd5e0', color: '#4a5568', opacity: copiedItems ? 1 : 0.5 }}
                  disabled={!copiedItems}
                  title="Paste copied packing items into this work order"
                  onClick={async () => {
                    const currentWO = workOrders.find(wo => wo.id.toString() === selectedWOId);
                    if (currentWO) {
                      initiatePaste(currentWO.id, currentWO.wo_num, currentWO.customer, packingItems.length);
                    }
                  }}
                >
                  📌 Paste List
                </button>
                {copiedItems && (
                  <span style={{ position: 'absolute', top: '100%', fontSize: '10px', color: '#718096', whiteSpace: 'nowrap', marginTop: '2px' }}>
                    Copied from: {copiedFromWO}
                  </span>
                )}
              </div>
            </>
          )}
          {canEdit() && <button className="btn btn-red" onClick={() => openModal()}>+ Add Item</button>}
        </div>
      </div>

      {/* Stats */}
      <div className="packing-stats">
        <div className="packing-stat"><div className="label">Total</div><div className="value">{total}</div><div className="sub">Items</div></div>
        <div className="packing-stat"><div className="label">Not Started</div><div className="value val-orange">{notStarted}</div><div className="sub">Pending</div></div>
        <div className="packing-stat"><div className="label">In Progress</div><div className="value val-blue">{inProgress}</div><div className="sub">Packing</div></div>
        <div className="packing-stat"><div className="label">Packed</div><div className="value val-green">{packed}</div><div className="sub">→ Loading</div></div>
        <div className="packing-stat">
          <div className="label">Progress</div>
          <div className="value val-green">{pct}%</div>
          <div style={{ width: '80%', height: '4px', background: '#e2e8f0', borderRadius: '2px', margin: '6px auto 0' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: '#38a169', borderRadius: '2px' }}></div>
          </div>
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
            <tr><th>BOX #</th><th>ITEM #</th><th>DESCRIPTION</th><th>QTY</th><th>UOM</th><th>PACK TYPE</th><th>STATUS</th><th>START DATE</th><th>END DATE</th><th>ACTIONS</th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="10" style={{ textAlign: 'center', padding: '24px' }}>Loading...</td></tr>
            ) : filteredItems.length === 0 ? (
              <tr><td colSpan="10" style={{ textAlign: 'center', color: '#718096', padding: '24px' }}>
                {packingItems.length === 0 ? 'No packing items yet. Click "+ Add Item" to start.' : 'No items match the current filter.'}
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
                  <button className={`badge ${statusBadge(p.status)}`}
                    onClick={() => cycleStatus(p)}
                    style={{ cursor: 'pointer', border: 'none', padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '600' }}
                    title="Click to cycle status">
                    {p.status}
                  </button>
                </td>
                <td>{p.packing_start_date || '—'}</td>
                <td>{p.packing_end_date || '—'}</td>
                <td style={{ display: 'flex', gap: '4px' }}>
                  {canEdit() && <button className="icon-btn" onClick={() => openModal(p)}>✏️</button>}
                  {canDelete() && <button className="icon-btn danger" onClick={() => deleteItem(p.id)}>🗑️</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ padding: '10px 16px', fontSize: '12px', color: '#718096', display: 'flex', justifyContent: 'space-between' }}>
          <span>{filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}</span>
          <span>{packed}/{total} packed ({pct}%)</span>
        </div>
      </div>

      {/* ══════════ ADD / EDIT MODAL ══════════ */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={e => { if (e.target.className === 'modal-overlay') closeModal(); }}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <h3>{editingItem ? 'Edit Packing Item' : 'Add Packing Item'}</h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>


            {/* ── SECTION 1: Work Order Info ── */}
            <div className="form-row">
              <div className="form-group">
                <label>Work Order Number</label>
                <select value={modalWOId || ''} onChange={e => handleWOSelect(e.target.value)}>
                  <option value="">-- Select Work Order --</option>
                  {workOrders.map(wo => (
                    <option key={wo.id} value={wo.id}>{wo.wo_num}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Customer Name</label>
                <input value={formData.customer} readOnly style={{ background: '#f7fafc', cursor: 'not-allowed' }} placeholder="Auto-filled" />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Transformer MVA</label>
                <input value={formData.mva} readOnly style={{ background: '#f7fafc', cursor: 'not-allowed' }} placeholder="Auto-filled" />
              </div>
              <div className="form-group">
                <label>Voltage Range</label>
                <input value={formData.voltage_range} readOnly style={{ background: '#f7fafc', cursor: 'not-allowed' }} placeholder="Auto-filled" />
              </div>
            </div>

            {/* ISSUE 4: Total Boxes — auto-calculated, shown read-only */}
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', background: '#f0fff4', border: '1px solid #c6f6d5', borderRadius: '8px', padding: '8px 14px', marginBottom: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: '600', color: '#276749' }}>📦 Total Unique Boxes (this WO): <strong>{uniqueBoxCount}</strong></span>
              {formData.items.filter(r => r.box_num).length > 0 && (
                <span style={{ fontSize: '11px', color: '#718096' }}>+ {[...new Set(formData.items.map(r => r.box_num).filter(Boolean))].length} new in this batch</span>
              )}
            </div>

            {/* ISSUE 1, 3: Shared date inputs — enter ONCE, apply to ALL rows */}
            {canEditDatesOnly() && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '12px 14px', marginBottom: '6px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: '700', color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>📅 Packing Start Date (all items)</label>
                  <input type="date" value={formData.packing_start_date || ''} onChange={e => {
                    setFormData(prev => ({ ...prev, packing_start_date: e.target.value }));
                  }} style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #93c5fd', fontSize: '13px' }} />
                  {!formData.packing_start_date && (
                    <div style={{ fontSize: '10px', color: '#b45309', marginTop: '3px' }}>⚠ Will default to today if left empty</div>
                  )}
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: '700', color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>📅 Packing End Date (all items)</label>
                  <input type="date" value={formData.packing_end_date || ''} onChange={e => {
                    setFormData(prev => ({ ...prev, packing_end_date: e.target.value }));
                  }} style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #93c5fd', fontSize: '13px' }} />
                  <div style={{ fontSize: '10px', color: '#718096', marginTop: '3px' }}>Optional — leave empty if packing is ongoing</div>
                </div>
              </div>
            )}

            {/* ── SECTION 2: Packing Items (Multi-Row Support) ── */}
            <div style={{ marginTop: '20px', marginBottom: '10px', fontSize: '11px', fontWeight: '700', color: '#92400e', letterSpacing: '1px', textTransform: 'uppercase' }}>
              📦 Packing Items
            </div>
            
            <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', background: '#f7fafc' }}>
              {formData.items.map((row, idx) => (
                <div key={idx} style={{ position: 'relative', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px', marginBottom: '10px' }}>
                  {!editingItem && formData.items.length > 1 && (
                    <button onClick={() => {
                      const newItems = [...formData.items];
                      newItems.splice(idx, 1);
                      setFormData({...formData, items: newItems});
                    }} style={{ position: 'absolute', top: '8px', right: '8px', background: 'transparent', border: 'none', color: '#e53e3e', cursor: 'pointer', fontWeight: 'bold' }}>✕ Remove</button>
                  )}
                  <div className="form-row">
                    <div className="form-group" style={{ marginBottom: '10px' }}>
                      <label>Box Number <span style={{ color: '#e53e3e' }}>*</span></label>
                      <input ref={idx === formData.items.length - 1 ? lastRowRef : null} value={row.box_num} onChange={e => {
                        const newItems = [...formData.items]; newItems[idx].box_num = e.target.value; setFormData({...formData, items: newItems});
                      }} placeholder="e.g. BOX-001" style={{ borderColor: duplicateBoxErrorIndexes?.includes(idx) ? 'red' : '' }} />
                    </div>
                    <div className="form-group" style={{ marginBottom: '10px' }}>
                      <label>Item Number</label>
                      <input value={row.item_num} onChange={e => {
                        const newItems = [...formData.items]; newItems[idx].item_num = e.target.value; setFormData({...formData, items: newItems});
                      }} placeholder="e.g. 1" />
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: '10px' }}>
                    <label>Item Description *</label>
                    <SmartItemInput
                      value={row.description}
                      onChange={val => {
                        const newItems = [...formData.items]; newItems[idx].description = val; setFormData({...formData, items: newItems});
                      }}
                      masterList={masterItems}
                      placeholder="Search from list or type manually..."
                    />
                  </div>

                  <div className="form-row-3" style={{ marginBottom: 0 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Quantity</label>
                      <input type="number" value={row.qty} onChange={e => {
                        const newItems = [...formData.items]; newItems[idx].qty = e.target.value; setFormData({...formData, items: newItems});
                      }} min="1" />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>UOM</label>
                      <select value={row.uom} onChange={e => {
                        const newItems = [...formData.items]; newItems[idx].uom = e.target.value; setFormData({...formData, items: newItems});
                      }}>
                        {['No.', 'Set', 'Nos'].map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Packing Type</label>
                      <select value={row.pack_type} onChange={e => {
                        const newItems = [...formData.items]; newItems[idx].pack_type = e.target.value; setFormData({...formData, items: newItems});
                      }}>
                        {['Open Type', 'Wooden Box', 'Steel Box', 'Loose Packing'].map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>


                </div>
              ))}
              
              {!editingItem && (
                <button className="btn btn-outline" style={{ width: '100%', marginTop: '4px' }} onClick={() => {
                  // ISSUE 2: New rows inherit — no date reset, no data loss
                  setFormData(prev => ({...prev, items: [...prev.items, getEmptyItemRow()]}));
                  // ISSUE 7: Auto-focus the new row's first input
                  setTimeout(() => { if (lastRowRef.current) lastRowRef.current.focus(); }, 50);
                }}>+ Add Another Row</button>
              )}
            </div>

            
            {duplicateConflicts ? (
              <div style={{ marginTop: '20px', padding: '15px', background: '#fffaf0', border: '1px solid #ed8936', borderRadius: '8px' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#c05621' }}>⚠️ Duplicate Item Detected</h4>
                <p style={{ fontSize: '13px', color: '#7b341e', marginBottom: '15px' }}>
                  Item {duplicateConflicts.conflicts[duplicateConflicts.currentIndex].new.item_num} (Box {duplicateConflicts.conflicts[duplicateConflicts.currentIndex].new.box_num}) already exists in this work order. What would you like to do?
                </p>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button className="btn" style={{ background: '#ed8936', color: '#fff' }} onClick={() => resolveConflict('replace')}>Replace Existing</button>
                  <button className="btn" style={{ background: '#ed8936', color: '#fff' }} onClick={() => resolveConflict('add')}>Add to Existing Quantity</button>
                  <button className="btn" style={{ background: '#e2e8f0', color: '#4a5568' }} onClick={() => resolveConflict('skip')}>Skip</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px', alignItems: 'center' }}>
                {/* ISSUE 7: Warning if start date is empty */}
                {!formData.packing_start_date && canEditDatesOnly() && (
                  <span style={{ fontSize: '11px', color: '#b45309', marginRight: 'auto' }}>⚠ Start date empty — will default to today</span>
                )}
                <button className="btn btn-outline" onClick={() => { closeModal(); setDuplicateConflicts(null); }}>Cancel</button>
                <button className="btn btn-red" onClick={saveItem} disabled={isSaveDisabled} style={{ opacity: isSaveDisabled ? 0.5 : 1, cursor: isSaveDisabled ? 'not-allowed' : 'pointer' }}>{editingItem ? 'Save Changes' : 'Save Items'}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PASTE CONFIRMATION MODAL */}
      {pasteModalData && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Replace Packing List?</h3>
            <p>
              {pasteModalData.existingItemCount > 0 
                ? `You are about to replace ALL existing packing items in:\n${pasteModalData.targetWONumber} — ${pasteModalData.targetCustomerName}\n\nThis will permanently delete ${pasteModalData.existingItemCount} existing item(s) and replace them with ${copiedItems.length} item(s) copied from ${copiedFromWO}.\n\n⚠ This action cannot be undone.`
                : `This work order has no existing items. ${copiedItems.length} items will be added from ${copiedFromWO}.`}
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button className="btn" style={{ background: '#e2e8f0', color: '#4a5568' }} onClick={cancelPaste}>Cancel</button>
              <button className="btn btn-red" onClick={async () => {
                const success = await confirmPaste();
                if (success) await fetchData();
              }}>Replace & Paste</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default PackingList;
