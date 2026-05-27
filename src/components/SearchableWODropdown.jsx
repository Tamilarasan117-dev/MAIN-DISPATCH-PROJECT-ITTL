import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';

const SearchableWODropdown = ({ localData, selectedWO, onSelectWO }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [apiResults, setApiResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState(null);
  
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const dropdownRef = useRef(null);
  const abortControllerRef = useRef(null);

  // 1. Memoized Local Filtering
  const localResults = useMemo(() => {
    if (!searchQuery.trim()) return localData;
    const lowerQuery = searchQuery.trim().toLowerCase();
    return localData.filter(wo => 
      wo.wo_num?.toLowerCase().includes(lowerQuery) || 
      wo.customer?.toLowerCase().includes(lowerQuery)
    );
  }, [searchQuery, localData]);

  // Combined Results (Local + API fallback)
  // We prefer local results if they exist, but if API returns unique results, append them.
  const combinedResults = useMemo(() => {
    const localMap = new Map(localResults.map(wo => [wo.id, wo]));
    const appendedApi = apiResults.filter(wo => !localMap.has(wo.id));
    return [...localResults, ...appendedApi];
  }, [localResults, apiResults]);

  // 2. Hybrid Search Logic with Debounce & AbortController
  useEffect(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Reset API state
    setApiResults([]);
    setError(null);
    setFocusedIndex(-1);

    const q = searchQuery.trim();
    if (!q) {
      setIsSearching(false);
      return;
    }

    // Rule: Trigger API if local results < 5 AND query length >= 3
    if (localResults.length < 5 && q.length >= 3) {
      setIsSearching(true);
      
      const delayFn = setTimeout(async () => {
        abortControllerRef.current = new AbortController();
        try {
          const { data, error } = await supabase
            .from('work_orders')
            .select('id, wo_num, customer')
            .or(`wo_num.ilike.%${q}%,customer.ilike.%${q}%`)
            .limit(10)
            .abortSignal(abortControllerRef.current.signal);

          if (error) throw error;
          setApiResults(data || []);
        } catch (err) {
          if (err.name !== 'AbortError') {
            console.error('API Search Error:', err);
            setError("Unable to fetch results. Try again.");
          }
        } finally {
          setIsSearching(false);
        }
      }, 300);

      return () => clearTimeout(delayFn);
    } else {
      setIsSearching(false);
    }
  }, [searchQuery, localResults.length]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 3. Keyboard Navigation
  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown') setIsOpen(true);
      return;
    }

    const total = combinedResults.length + 1; // +1 for "All Work Orders"

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => (prev < total - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => (prev > 0 ? prev - 1 : 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedIndex === 0) {
          handleSelect('All');
        } else if (focusedIndex > 0 && combinedResults[focusedIndex - 1]) {
          handleSelect(combinedResults[focusedIndex - 1].id);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
      default:
        break;
    }
  };

  const handleSelect = (woId) => {
    onSelectWO(woId.toString());
    setIsOpen(false);
    setSearchQuery('');
  };

  // 4. Highlight text matching
  const renderHighlighted = (text) => {
    if (!searchQuery.trim()) return text;
    const parts = text.split(new RegExp(`(${searchQuery.trim()})`, 'gi'));
    return parts.map((part, i) => 
      part.toLowerCase() === searchQuery.trim().toLowerCase() ? 
      <mark key={i} style={{ backgroundColor: '#fefcbf', color: '#744210', padding: 0 }}>{part}</mark> : part
    );
  };

  const selectedText = selectedWO === 'All' 
    ? '📋 All Work Orders' 
    : localData.find(w => w.id.toString() === selectedWO.toString())?.wo_num || 'Work Order Selected';

  return (
    <div ref={dropdownRef} style={{ position: 'relative', width: '220px' }}>
      {/* Toggle Button */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e0', 
          background: '#fff', fontSize: '13px', cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}
      >
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {selectedText}
        </span>
        <span style={{ fontSize: '10px', color: '#a0aec0', marginLeft: '8px' }}>▼</span>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px',
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 50,
          display: 'flex', flexDirection: 'column', maxHeight: '300px'
        }}>
          {/* Search Input */}
          <div style={{ padding: '8px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center' }}>
            <span style={{ marginRight: '6px', opacity: 0.5 }}>🔍</span>
            <input
              autoFocus
              type="text"
              placeholder="Search WO or Customer..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{
                width: '100%', border: 'none', outline: 'none', fontSize: '13px', padding: '4px'
              }}
            />
            {isSearching && (
              <span className="spinner" style={{
                width: '14px', height: '14px', border: '2px solid #e2e8f0',
                borderTop: '2px solid #3182ce', borderRadius: '50%', animation: 'spin 1s linear infinite'
              }}></span>
            )}
          </div>

          {/* Results List */}
          <div style={{ overflowY: 'auto' }}>
            {error && (
              <div style={{ padding: '8px 12px', fontSize: '12px', color: '#e53e3e', textAlign: 'center' }}>
                {error}
              </div>
            )}

            {!error && combinedResults.length === 0 && !isSearching && (
              <div style={{ padding: '12px', fontSize: '12px', color: '#a0aec0', textAlign: 'center' }}>
                No Work Orders Found
              </div>
            )}

            {!error && (combinedResults.length > 0 || !searchQuery) && (
              <>
                <div 
                  onClick={() => handleSelect('All')}
                  style={{
                    padding: '8px 12px', fontSize: '13px', cursor: 'pointer',
                    background: focusedIndex === 0 ? '#edf2f7' : 'transparent',
                    borderBottom: '1px solid #f7fafc'
                  }}
                  onMouseEnter={() => setFocusedIndex(0)}
                >
                  📋 All Work Orders
                </div>
                
                {combinedResults.map((wo, i) => {
                  const idx = i + 1;
                  return (
                    <div 
                      key={wo.id}
                      onClick={() => handleSelect(wo.id)}
                      style={{
                        padding: '8px 12px', fontSize: '13px', cursor: 'pointer',
                        background: focusedIndex === idx ? '#edf2f7' : 'transparent',
                        color: '#2d3748'
                      }}
                      onMouseEnter={() => setFocusedIndex(idx)}
                    >
                      <div style={{ fontWeight: '500' }}>{renderHighlighted(wo.wo_num)}</div>
                      <div style={{ fontSize: '11px', color: '#718096' }}>{renderHighlighted(wo.customer || '')}</div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}
      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default SearchableWODropdown;
