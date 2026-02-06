import { useState, useCallback, useRef } from 'react';

const MAX_HISTORY_SIZE = 30;

/**
 * Hook for managing undo/redo history
 * @param {Object} data - Current data state
 * @param {Function} setData - Function to update data state
 * @param {Function} showNotification - Function to show notifications
 * @returns {Object} History state and functions
 */
export function useHistory(data, setData, showNotification) {
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  // Ref to track if we're currently in an undo/redo operation
  const isUndoRedoRef = useRef(false);

  /**
   * Save current state to history
   * @param {Object} newData - Optional data to save (defaults to current data)
   */
  const saveToHistory = useCallback((newData) => {
    if (isUndoRedoRef.current) return;
    
    const dataToSave = newData ? newData : JSON.parse(JSON.stringify(data));
    
    setHistory(prev => {
      // Remove any future states if we're not at the end
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(dataToSave);
      
      // Limit history size
      if (newHistory.length > MAX_HISTORY_SIZE) {
        newHistory.shift();
        // Adjust historyIndex if we removed from the beginning
        setHistoryIndex(newHistory.length - 1);
        return newHistory;
      }
      
      setHistoryIndex(newHistory.length - 1);
      return newHistory;
    });
  }, [data, historyIndex]);

  /**
   * Undo to previous state
   */
  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    
    isUndoRedoRef.current = true;
    const prevData = history[historyIndex - 1];
    setData(prevData);
    setHistoryIndex(historyIndex - 1);
    showNotification?.('Undo', 'info');
    
    // Reset the flag after state updates
    setTimeout(() => {
      isUndoRedoRef.current = false;
    }, 0);
  }, [history, historyIndex, setData, showNotification]);

  /**
   * Redo to next state
   */
  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    
    isUndoRedoRef.current = true;
    const nextData = history[historyIndex + 1];
    setData(nextData);
    setHistoryIndex(historyIndex + 1);
    showNotification?.('Redo', 'info');
    
    // Reset the flag after state updates
    setTimeout(() => {
      isUndoRedoRef.current = false;
    }, 0);
  }, [history, historyIndex, setData, showNotification]);

  /**
   * Check if undo is available
   */
  const canUndo = historyIndex > 0;

  /**
   * Check if redo is available
   */
  const canRedo = historyIndex < history.length - 1;

  /**
   * Clear history
   */
  const clearHistory = useCallback(() => {
    setHistory([]);
    setHistoryIndex(-1);
  }, []);

  return {
    history,
    historyIndex,
    saveToHistory,
    undo,
    redo,
    canUndo,
    canRedo,
    clearHistory
  };
}
