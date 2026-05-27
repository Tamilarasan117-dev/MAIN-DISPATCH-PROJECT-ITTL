import re

with open('src/pages/PackingList.jsx', 'r') as f:
    content = f.read()

# Add state
state_code = """
  const [duplicateConflicts, setDuplicateConflicts] = useState(null);
  const [loading, setLoading] = useState(true);
"""
content = content.replace("  const [loading, setLoading] = useState(true);", state_code)

# Replace saveItem
old_save_item = """  const saveItem = async () => {
    if (!modalWOId) { toast('Please select a Work Order', 'error'); return; }

    try {
      const payloads = formData.items.map(row => {
        if (!row.description) throw new Error('Item description is required for all rows');
        return {
          wo_id: modalWOId,
          wo_num: formData.wo_num,
          box_num: row.box_num,
          item_num: row.item_num,
          description: row.description,
          custom_desc: '', 
          qty: row.qty,
          uom: row.uom,
          pack_type: row.pack_type,
          weight: row.weight,
          length: row.length,
          width: row.width,
          height: row.height,
          production_sig: row.production_sig,
          quality_sig: row.quality_sig,
          packing_start_date: canEditDatesOnly() && row.packing_start_date !== undefined ? row.packing_start_date : null,
          packing_end_date: canEditDatesOnly() && row.packing_end_date !== undefined ? row.packing_end_date : null,
          status: editingItem ? editingItem.status : 'Not Started'
        };
      });

      if (editingItem) {
        const payload = payloads[0];
        const { error } = await supabase.from('packing_items').update(payload).eq('id', editingItem.id);
        if (error) throw error;
        
        // AUTO-SYNC TO LOADING LIST (Update)
        await supabase.from('loading_items').update({
          wo_id: payload.wo_id, wo_num: payload.wo_num, item_num: payload.item_num,
          description: payload.description, qty: payload.qty, uom: payload.uom,
          box_num: payload.box_num
        }).eq('packing_item_id', editingItem.id);

        await logActivity(user?.id, 'Packing List', 'UPDATE', `Updated Packing Item ${payload.item_num || payload.description}`);
        toast('Item updated successfully');
      } else {
        const { data: insertedItems, error } = await supabase.from('packing_items').insert(payloads).select();
        if (error) throw error;

        // AUTO-SYNC TO LOADING LIST (Insert)
        const loadingPayloads = insertedItems.map(item => ({
          packing_item_id: item.id,
          wo_id: item.wo_id,
          wo_num: item.wo_num,
          item_num: item.item_num,
          description: item.description,
          qty: item.qty,
          uom: item.uom,
          weight: 0,
          status: 'Reported',
          box_num: item.box_num,
          notes: `Auto-synced from Packing`
        }));
        
        if (loadingPayloads.length > 0) {
          const { error: loadErr } = await supabase.from('loading_items').insert(loadingPayloads);
          if (loadErr) throw loadErr;
        }

        await logActivity(user?.id, 'Packing List', 'CREATE', `Added ${payloads.length} packing items to WO ${formData.wo_num}`);
        toast('Items saved successfully');
      }
      closeModal();
      fetchPackingItems(selectedWOId);
    } catch (error) {
      toast('Failed to save: ' + error.message, 'error');
    }
  };"""

new_save_item = """
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
    if (!modalWOId) { toast('Please select a Work Order', 'error'); return; }
    try {
      const payloads = formData.items.map(row => {
        if (!row.description) throw new Error('Item description is required for all rows');
        return {
          wo_id: modalWOId, wo_num: formData.wo_num, box_num: row.box_num, item_num: row.item_num,
          description: row.description, custom_desc: '', qty: row.qty, uom: row.uom, pack_type: row.pack_type,
          weight: row.weight, length: row.length, width: row.width, height: row.height,
          production_sig: row.production_sig, quality_sig: row.quality_sig,
          packing_start_date: canEditDatesOnly() && row.packing_start_date !== undefined ? row.packing_start_date : null,
          packing_end_date: canEditDatesOnly() && row.packing_end_date !== undefined ? row.packing_end_date : null,
          status: editingItem ? editingItem.status : 'Not Started'
        };
      });

      if (editingItem) {
        await executeInsert([], [{ ...payloads[0], id: editingItem.id }]);
      } else {
        const { data: existingItems } = await supabase.from('packing_items').select('*').eq('wo_id', modalWOId);
        const conflicts = [];
        const newItems = [];
        payloads.forEach(p => {
          const match = existingItems?.find(e => e.item_num === p.item_num && e.box_num === p.box_num);
          if (match) conflicts.push({ existing: match, new: p });
          else newItems.push(p);
        });

        if (conflicts.length > 0) {
          setDuplicateConflicts({ newItems, updates: [], conflicts, currentIndex: 0 });
          return; // Wait for user resolution
        }
        await executeInsert(newItems, []);
      }
    } catch (error) {
      toast('Failed to save: ' + error.message, 'error');
    }
  };
"""
content = content.replace(old_save_item, new_save_item)

# Insert resolution UI into the modal
modal_buttons_old = """          <div className="modal-actions" style={{ marginTop: '30px' }}>
            <button className="btn" style={{ background: '#e2e8f0', color: '#4a5568' }} onClick={closeModal}>Cancel</button>
            <button className="btn btn-red" onClick={saveItem}>Save Items</button>
          </div>"""

modal_buttons_new = """          {duplicateConflicts ? (
            <div style={{ marginTop: '20px', padding: '15px', background: '#fffaf0', border: '1px solid #ed8936', borderRadius: '8px' }}>
              <h4 style={{ margin: '0 0 10px 0', color: '#c05621' }}>⚠️ Duplicate Item Detected</h4>
              <p style={{ fontSize: '13px', color: '#7b341e', marginBottom: '15px' }}>
                Item {duplicateConflicts.conflicts[duplicateConflicts.currentIndex].new.item_num} (Box {duplicateConflicts.conflicts[duplicateConflicts.currentIndex].new.box_num}) already exists in this work order. What would you like to do?
              </p>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button className="btn" style={{ background: '#ed8936' }} onClick={() => resolveConflict('replace')}>Replace Existing</button>
                <button className="btn" style={{ background: '#ed8936' }} onClick={() => resolveConflict('add')}>Add to Existing Quantity</button>
                <button className="btn" style={{ background: '#e2e8f0', color: '#4a5568' }} onClick={() => resolveConflict('skip')}>Skip</button>
              </div>
            </div>
          ) : (
            <div className="modal-actions" style={{ marginTop: '30px' }}>
              <button className="btn" style={{ background: '#e2e8f0', color: '#4a5568' }} onClick={() => { closeModal(); setDuplicateConflicts(null); }}>Cancel</button>
              <button className="btn btn-red" onClick={saveItem}>Save Items</button>
            </div>
          )}"""
content = content.replace(modal_buttons_old, modal_buttons_new)

with open('src/pages/PackingList.jsx', 'w') as f:
    f.write(content)
