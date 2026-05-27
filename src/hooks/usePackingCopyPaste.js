import { useState } from 'react';
import { supabase } from '../lib/supabase';

export const usePackingCopyPaste = (toast) => {
  const [copiedItems, setCopiedItems] = useState(null);
  const [copiedFromWO, setCopiedFromWO] = useState(null);
  const [pasteModalData, setPasteModalData] = useState(null);

  const handleCopy = (packingItems, woNumber) => {
    if (!packingItems || packingItems.length === 0) return;
    
    // Create deep copy with scrubbed fields
    const copy = packingItems.map(item => ({
      item_num: item.item_num,
      box_num: item.box_num,
      description: item.description,
      qty: item.qty,
      uom: item.uom,
      pack_type: item.pack_type,
    }));
    
    setCopiedItems(copy);
    setCopiedFromWO(woNumber);
    toast(`✓ Packing list copied — ${copy.length} items ready to paste`);
  };

  const clearClipboard = () => {
    setCopiedItems(null);
    setCopiedFromWO(null);
    setPasteModalData(null);
  };

  const initiatePaste = (targetWOId, targetWONumber, targetCustomerName, existingItemCount) => {
    setPasteModalData({
      targetWOId,
      targetWONumber,
      targetCustomerName,
      existingItemCount
    });
  };

  const confirmPaste = async () => {
    if (!pasteModalData || !copiedItems) return;
    const { targetWOId, targetWONumber } = pasteModalData;

    try {
      // Step 2a: Delete existing packing items
      const { error: deleteError } = await supabase
        .from('packing_items')
        .delete()
        .eq('wo_id', targetWOId);

      if (deleteError) throw deleteError;

      // Step 2b: Deduplicate
      const deduplicated = [];
      copiedItems.forEach(item => {
        const existing = deduplicated.find(d => d.item_num === item.item_num && d.box_num === item.box_num);
        if (existing) {
          existing.qty = (Number(existing.qty) || 0) + (Number(item.qty) || 0);
        } else {
          deduplicated.push({ ...item });
        }
      });

      // Step 2c: Insert
      const payloads = deduplicated.map(item => ({
        wo_id: targetWOId,
        wo_num: targetWONumber,
        item_num: item.item_num,
        box_num: item.box_num,
        description: item.description,
        qty: item.qty,
        uom: item.uom,
        pack_type: item.pack_type,
        status: 'Not Started',
        packing_start_date: null,
        packing_end_date: null
      }));

      const { error: insertError } = await supabase
        .from('packing_items')
        .insert(payloads);

      if (insertError) throw insertError;

      // Step 2d: Success
      toast(`✓ Paste complete — ${payloads.length} items added to ${targetWONumber}`);
      clearClipboard();
      return true;
    } catch (error) {
      console.error(error);
      toast('✗ Paste failed. Existing items were not deleted. Please try again.', 'error');
      return false;
    }
  };

  const cancelPaste = () => {
    setPasteModalData(null);
  };

  return {
    copiedItems,
    copiedFromWO,
    handleCopy,
    initiatePaste,
    confirmPaste,
    cancelPaste,
    clearClipboard,
    pasteModalData
  };
};
