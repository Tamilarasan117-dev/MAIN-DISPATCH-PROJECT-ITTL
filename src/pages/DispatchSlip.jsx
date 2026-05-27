import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ToastProvider';
import { QRCodeSVG } from 'qrcode.react';

const DispatchSlip = () => {
  const { wo_id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ wo: null, packingItems: [], loadingBlock: null, vehicle: null });

  useEffect(() => {
    fetchData();
  }, [wo_id]);

  const fetchData = async () => {
    try {
      setLoading(true);
      // Fetch Work Order
      const { data: woData, error: woError } = await supabase.from('work_orders').select('*').eq('id', wo_id).single();
      if (woError) throw woError;

      // Fetch Packing Items
      const { data: packData } = await supabase.from('packing_items').select('*').eq('wo_id', wo_id);
      
      // Fetch Loading Lists to find the one associated with this WO
      const { data: loadingData } = await supabase.from('loading_lists').select('*');
      
      let loadingBlock = null;
      let vehicleData = null;
      
      if (loadingData && loadingData.length > 0) {
        // Find the loading list that contains this wo_id in its wos_data
        for (const ll of loadingData) {
          const wosData = Array.isArray(ll.wos_data) ? ll.wos_data : [];
          const block = wosData.find(w => w.wo_id?.toString() === wo_id?.toString() || w.wo_num === woData.wo_num);
          if (block) {
            loadingBlock = { ...block, ll_num: ll.ll_num, ll_status: ll.status, vehicle_capacity: ll.vehicle_capacity };
            
            // Fetch the specific vehicle if present
            if (block.vehicle_id) {
              const { data: veh } = await supabase.from('vehicles').select('*').eq('id', block.vehicle_id).single();
              if (veh) vehicleData = veh;
            }
            break;
          }
        }
      }

      setData({ wo: woData, packingItems: packData || [], loadingBlock, vehicle: vehicleData });
    } catch (err) {
      console.error(err);
      toast('Failed to load dispatch data', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Loading Dispatch Document...</div>;
  }

  if (!data.wo) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h2>Work Order Not Found</h2>
        <button className="btn btn-outline" onClick={() => navigate(-1)} style={{ marginTop: '20px' }}>Go Back</button>
      </div>
    );
  }

  const { wo, packingItems, loadingBlock, vehicle } = data;
  
  // Calculations
  const totalBoxes = [...new Set(packingItems.filter(p => p.box_num).map(p => p.box_num))].length;
  const totalQty = packingItems.reduce((acc, curr) => acc + (parseInt(curr.qty) || 0), 0);
  const totalWeight = packingItems.reduce((acc, curr) => acc + (parseFloat(curr.weight) || 0), 0);

  const capacity = loadingBlock?.vehicle_capacity ? parseFloat(loadingBlock.vehicle_capacity) : 0;
  const capacityUsage = capacity > 0 ? Math.min(100, Math.round((totalWeight / capacity) * 100)) : 0;

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', background: 'white', padding: '15px 20px', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <button className="btn btn-outline" onClick={() => navigate(-1)}>← Back</button>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-red" onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>🖨️</span> Print Dispatch Slip
          </button>
        </div>
      </div>

      {/* A4 Printable Area */}
      <div className="print-a4-sheet" style={{ background: 'white', padding: '40px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #e53e3e', paddingBottom: '20px', marginBottom: '20px' }}>
          <div>
            <h1 style={{ margin: '0 0 5px 0', color: '#e53e3e', fontSize: '28px', letterSpacing: '-0.5px' }}>INDOTECH TRANSFORMERS LTD.</h1>
            <p style={{ margin: 0, color: '#4a5568', fontSize: '12px' }}>DP34, SIDCO Industrial Estate, Thirumazhisai, Chennai - 600124</p>
            <p style={{ margin: '4px 0 0 0', color: '#4a5568', fontSize: '12px' }}>Email: dispatch@indotech.com | Phone: +91 44 2681 1234</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <h2 style={{ margin: '0 0 10px 0', fontSize: '22px', textTransform: 'uppercase', color: '#2d3748' }}>Master Dispatch Slip</h2>
            {/* QR code now uses only work order number */}
            <QRCodeSVG value={`https://indotech-dispatch.system/verify/${wo.wo_num}`} size={80} level="H" />
          </div>
        </div>

        {/* Primary Details */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '25px', borderBottom: '1px solid #e2e8f0', paddingBottom: '20px' }}>
          <div>
            <h3 style={{ fontSize: '14px', textTransform: 'uppercase', color: '#a0aec0', marginBottom: '10px', margin: 0 }}>Work Order Details</h3>
            <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
              <tbody>
                <tr><td style={{ padding: '6px 0', color: '#718096', width: '120px' }}>WO Number</td><td style={{ fontWeight: 'bold' }}>{wo.wo_num}</td></tr>
                <tr><td style={{ padding: '6px 0', color: '#718096' }}>Job Serial No</td><td style={{ fontWeight: 'bold' }}>{wo.job_serial_no || '-'}</td></tr>
                <tr><td style={{ padding: '6px 0', color: '#718096' }}>Customer</td><td style={{ fontWeight: 'bold' }}>{wo.customer}</td></tr>
                <tr><td style={{ padding: '6px 0', color: '#718096' }}>Transformer</td><td style={{ fontWeight: 'bold' }}>{wo.mva || wo.rating || '-'} | {wo.voltage_range || '-'}</td></tr>
                <tr><td style={{ padding: '6px 0', color: '#718096' }}>Priority</td><td style={{ fontWeight: 'bold' }}>{wo.priority || 'Normal'}</td></tr>
              </tbody>
            </table>
          </div>
          <div>
            <h3 style={{ fontSize: '14px', textTransform: 'uppercase', color: '#a0aec0', marginBottom: '10px', margin: 0 }}>Logistics Details</h3>
            <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
              <tbody>
                <tr><td style={{ padding: '6px 0', color: '#718096', width: '120px' }}>Vehicle Number</td><td style={{ fontWeight: 'bold' }}>{loadingBlock?.vehicle_num || vehicle?.num || 'Not Assigned'}</td></tr>
                <tr><td style={{ padding: '6px 0', color: '#718096' }}>Driver Name</td><td style={{ fontWeight: 'bold' }}>{loadingBlock?.driver_name || vehicle?.driver || '-'}</td></tr>
                <tr><td style={{ padding: '6px 0', color: '#718096' }}>Driver Phone</td><td style={{ fontWeight: 'bold' }}>{loadingBlock?.phone || vehicle?.phone || '-'}</td></tr>
                <tr><td style={{ padding: '6px 0', color: '#718096' }}>Loading Date</td><td style={{ fontWeight: 'bold' }}>{loadingBlock?.date_of_loading || '-'}</td></tr>
                <tr><td style={{ padding: '6px 0', color: '#718096' }}>Shipment Type</td><td style={{ fontWeight: 'bold' }}>{wo.export_domestic || 'Domestic'}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Packing Summary Stats */}
        <h3 style={{ fontSize: '14px', textTransform: 'uppercase', color: '#2d3748', marginBottom: '10px', borderLeft: '3px solid #e53e3e', paddingLeft: '8px' }}>Packing & Load Summary</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '25px' }}>
          <div style={{ border: '1px solid #edf2f7', padding: '10px', borderRadius: '4px', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: '#718096', marginBottom: '4px' }}>Total Boxes</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#2d3748' }}>{totalBoxes}</div>
          </div>
          <div style={{ border: '1px solid #edf2f7', padding: '10px', borderRadius: '4px', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: '#718096', marginBottom: '4px' }}>Total Quantity</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#dd6b20' }}>{totalQty}</div>
          </div>
          <div style={{ border: '1px solid #edf2f7', padding: '10px', borderRadius: '4px', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: '#718096', marginBottom: '4px' }}>Total Weight</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#38a169' }}>{totalWeight} <span style={{fontSize:'12px'}}>kg</span></div>
          </div>
          <div style={{ border: '1px solid #edf2f7', padding: '10px', borderRadius: '4px', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: '#718096', marginBottom: '4px' }}>Capacity Usage</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: capacityUsage > 90 ? '#e53e3e' : '#3182ce' }}>{capacityUsage}%</div>
          </div>
        </div>

        {/* Detailed Items Table */}
        <h3 style={{ fontSize: '14px', textTransform: 'uppercase', color: '#2d3748', marginBottom: '10px', borderLeft: '3px solid #e53e3e', paddingLeft: '8px' }}>Item Manifest</h3>
        <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse', marginBottom: '30px', border: '1px solid #e2e8f0' }}>
          <thead>
            <tr style={{ background: '#f7fafc', borderBottom: '2px solid #cbd5e0' }}>
              <th style={{ padding: '8px 6px', textAlign: 'left', borderRight: '1px solid #e2e8f0' }}>Box</th>
              <th style={{ padding: '8px 6px', textAlign: 'left', borderRight: '1px solid #e2e8f0' }}>Item</th>
              <th style={{ padding: '8px 6px', textAlign: 'left', borderRight: '1px solid #e2e8f0' }}>Description</th>
              <th style={{ padding: '8px 6px', textAlign: 'center', borderRight: '1px solid #e2e8f0' }}>Qty</th>
              <th style={{ padding: '8px 6px', textAlign: 'right', borderRight: '1px solid #e2e8f0' }}>Weight (kg)</th>
              <th style={{ padding: '8px 6px', textAlign: 'center', borderRight: '1px solid #e2e8f0' }}>Dimensions (cm)</th>
              <th style={{ padding: '8px 6px', textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {packingItems.length === 0 ? (
              <tr><td colSpan="7" style={{ padding: '20px', textAlign: 'center', color: '#a0aec0' }}>No items recorded.</td></tr>
            ) : packingItems.map((item, idx) => (
              <tr key={item.id || idx} style={{ borderBottom: '1px solid #edf2f7' }}>
                <td style={{ padding: '8px 6px', borderRight: '1px solid #edf2f7', fontWeight: 'bold' }}>{item.box_num || '-'}</td>
                <td style={{ padding: '8px 6px', borderRight: '1px solid #edf2f7' }}>{item.item_num || '-'}</td>
                <td style={{ padding: '8px 6px', borderRight: '1px solid #edf2f7', maxWidth: '250px' }}>{item.description || item.custom_desc}</td>
                <td style={{ padding: '8px 6px', borderRight: '1px solid #edf2f7', textAlign: 'center' }}>{item.qty} {item.uom}</td>
                <td style={{ padding: '8px 6px', borderRight: '1px solid #edf2f7', textAlign: 'right' }}>{item.weight || '-'}</td>
                <td style={{ padding: '8px 6px', borderRight: '1px solid #edf2f7', textAlign: 'center' }}>
                  {item.length && item.width && item.height ? `${item.length}×${item.width}×${item.height}` : '-'}
                </td>
                <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                  <span style={{ 
                    display: 'inline-block', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase',
                    background: item.status === 'Packed' ? '#c6f6d5' : '#fed7d7', color: item.status === 'Packed' ? '#22543d' : '#822727'
                  }}>{item.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Approvals & Signatures */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '20px', marginTop: '60px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ borderBottom: '1px dashed #a0aec0', height: '40px', marginBottom: '8px' }}></div>
            <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#4a5568' }}>Prepared By (Dispatch)</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ borderBottom: '1px dashed #a0aec0', height: '40px', marginBottom: '8px' }}>
              <span style={{ fontSize: '14px', fontFamily: 'cursive', color: '#2b6cb0' }}>{wo.approved_by || ''}</span>
            </div>
            <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#4a5568' }}>Approved By (Manager)</div>
            {wo.approved_at && <div style={{ fontSize: '9px', color: '#718096' }}>{new Date(wo.approved_at).toLocaleString()}</div>}
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ borderBottom: '1px dashed #a0aec0', height: '40px', marginBottom: '8px' }}></div>
            <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#4a5568' }}>Driver Signature</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ borderBottom: '1px dashed #a0aec0', height: '40px', marginBottom: '8px' }}></div>
            <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#4a5568' }}>Security / Gate Pass</div>
          </div>
        </div>

      </div>

      <style>{`
        @media print {
          body { background: white !important; margin: 0; padding: 0; }
          #root { height: auto; }
          .no-print { display: none !important; }
          .sidebar, .top-header { display: none !important; }
          .main-content { padding: 0 !important; margin: 0 !important; }
          .print-a4-sheet { 
            box-shadow: none !important; 
            padding: 0 !important; 
            margin: 0 !important; 
            width: 100% !important;
          }
        }
      `}</style>
    </div>
  );
};

export default DispatchSlip;
