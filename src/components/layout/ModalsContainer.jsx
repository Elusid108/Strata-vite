import {
  COLORS,
  EMOJIS,
  BLOCK_TYPES,
  DRIVE_LOGO_URL,
  DRIVE_SERVICE_ICONS,
} from '../../lib/constants';
import { findBlockInRows, updatePageInData, COLOR_BG_CLASSES } from '../../lib/utils';
import * as GoogleAPI from '../../lib/google-api';
import * as emoji from 'node-emoji';
import {
  X,
  Settings,
  Sun,
  Moon,
  Monitor,
  Columns,
  Trash2,
  Edit3,
  AlertCircle,
  FolderOpen,
} from '../../components/icons';
import { MapConfigPopup } from '../pages';
import { useStrata } from '../../contexts/StrataContext';

export function ModalsContainer({
  rowsForEditor,
  updateTabColor,
  changeBlockType,
  updateBlockColor,
  handleUpdateBlock,
  updatePageCover,
  updateNotebookIcon,
  updateTabIcon,
  updatePageIcon,
  confirmDelete,
  addEmbedPageFromUrl,
  addGooglePage,
  addLucidPage,
  showNotification,
  driveUrlModalValue,
  setDriveUrlModalValue,
  lucidUrlValue,
  setLucidUrlValue,
  editEmbedName,
  setEditEmbedName,
  editEmbedUrl,
  setEditEmbedUrl,
  iconSearchTerm,
  setIconSearchTerm,
  mapConfigBlockId,
  mapConfigPosition,
  setMapConfigBlockId,
  setMapConfigPosition,
  blockMenu,
  setBlockMenu,
  activePageId,
  triggerContentSync,
}) {
  const {
    settings,
    setSettings,
    setShowSettings,
    setShowDriveUrlModal,
    setShowLucidModal,
    setShowEditEmbed,
    setShowCoverInput,
    setSyncConflict,
    setActiveNotebookId,
    setActiveTabId,
    setActivePageId,
    setData,
    triggerStructureSync,
    setActiveTabMenu,
    setItemToDelete,
    activeTabMenu,
    itemToDelete,
    setShowSignOutConfirm,
    handleSignOut,
    syncConflict,
    showSettings,
    showDriveUrlModal,
    showLucidModal,
    showEditEmbed,
    showCoverInput,
    notebookIconPicker,
    tabIconPicker,
    pageIconPicker,
    data,
    activeNotebookId,
    activeTabId,
    isAuthenticated,
    hasInitialLoadCompleted,
    notification,
  } = useStrata();

  return (
    <>
      {/* Tab Settings Menu */}
      {activeTabMenu && (
        <div
          className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl rounded-lg p-3 z-[9999] tab-settings-menu"
          style={{ top: activeTabMenu.top, left: activeTabMenu.left }}
        >
          <div className="text-[10px] font-bold text-gray-400 uppercase mb-2">Section Color</div>
          <div className="grid grid-cols-5 gap-2 mb-3">
            {COLORS.map(c => (
              <div
                key={c.name}
                onClick={() => updateTabColor(activeTabMenu.id, c.name)}
                className={`w-5 h-5 rounded-full cursor-pointer ${COLOR_BG_CLASSES[c.name]} hover:scale-125 transition-transform shadow-sm`}
              />
            ))}
          </div>
          <div className="border-t border-gray-100 dark:border-gray-700 my-2"></div>
          <button
            onClick={() => { setItemToDelete({ type: 'tab', id: activeTabMenu.id }); setActiveTabMenu(null); }}
            className="w-full text-left text-xs text-red-600 p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 rounded flex items-center gap-2"
          >
            <Trash2 size={12} /> Delete Section
          </button>
        </div>
      )}

      {/* Block Menu */}
      {blockMenu && (() => {
        const menuBlock = findBlockInRows(rowsForEditor, blockMenu.id);
        return menuBlock && (
          <div
            className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl rounded-lg p-2 z-[9999] block-menu"
            style={{ top: blockMenu.top, left: blockMenu.left }}
          >
            <div className="mb-2">
              <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase mb-1.5">Change type</div>
              <select
                value={menuBlock.type}
                onChange={(e) => changeBlockType(blockMenu.id, e.target.value)}
                className="w-full text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {BLOCK_TYPES.map(({ type, label }) => (
                  <option key={type} value={type}>{label}</option>
                ))}
              </select>
            </div>
            {menuBlock.type === 'map' && (
              <>
                <div className="border-t border-gray-100 dark:border-gray-700 my-2"></div>
                <button
                  onClick={() => {
                    const blockElement = document.querySelector(`[data-block-id="${blockMenu.id}"]`);
                    if (blockElement) {
                      const rect = blockElement.getBoundingClientRect();
                      setMapConfigPosition({ top: rect.top, left: rect.left });
                    } else {
                      setMapConfigPosition({ top: blockMenu.top, left: blockMenu.left });
                    }
                    setMapConfigBlockId(blockMenu.id);
                    setBlockMenu(null);
                  }}
                  className="w-full text-left text-xs text-blue-600 dark:text-blue-400 p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded flex items-center gap-2"
                >
                  <Edit3 size={12} /> Edit Map
                </button>
              </>
            )}
            <div className="border-t border-gray-100 dark:border-gray-700 my-2"></div>
            <div className="grid grid-cols-5 gap-2">
              <div
                onClick={() => updateBlockColor(blockMenu.id, null)}
                className="w-5 h-5 rounded-full border border-gray-300 dark:border-gray-500 flex items-center justify-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X size={10} />
              </div>
              {COLORS.map(c => (
                <div
                  key={c.name}
                  onClick={() => updateBlockColor(blockMenu.id, c.name)}
                  className={`w-5 h-5 rounded-full cursor-pointer ${COLOR_BG_CLASSES[c.name]} hover:scale-125 transition-transform shadow-sm`}
                />
              ))}
            </div>
          </div>
        );
      })()}

      {/* Map Config Popup */}
      {mapConfigBlockId && mapConfigPosition && (() => {
        const configBlock = findBlockInRows(rowsForEditor, mapConfigBlockId);
        return configBlock && (
          <MapConfigPopup
            blockId={mapConfigBlockId}
            currentData={configBlock.mapData}
            onSave={(mapData) => {
              handleUpdateBlock(mapConfigBlockId, { mapData });
            }}
            onClose={() => {
              setMapConfigBlockId(null);
              setMapConfigPosition(null);
            }}
            position={mapConfigPosition}
          />
        );
      })()}

      {/* Icon Pickers */}
      {notebookIconPicker && (
        <div
          className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl rounded-lg p-2 z-[9999] notebook-icon-picker w-64"
          style={{ top: notebookIconPicker.top, left: notebookIconPicker.left }}
        >
          <input
            type="text"
            placeholder="Search icons..."
            value={iconSearchTerm}
            onChange={(e) => setIconSearchTerm(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className="w-full mb-2 p-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-700 dark:text-white outline-none"
            autoFocus
          />
          <div className="h-64 overflow-y-auto">
            <div className="grid grid-cols-5 gap-1">
              {(iconSearchTerm.trim() ? (emoji.search(iconSearchTerm) || []).map(r => r.emoji) : EMOJIS).map((em, i) => (
                <div
                  key={i}
                  className="text-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 p-1 rounded text-center"
                  onClick={() => updateNotebookIcon(notebookIconPicker.id, em)}
                >
                  {em}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tabIconPicker && (
        <div
          className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl rounded-lg p-2 z-[9999] tab-icon-picker w-64"
          style={{ top: tabIconPicker.top, left: tabIconPicker.left }}
        >
          <input
            type="text"
            placeholder="Search icons..."
            value={iconSearchTerm}
            onChange={(e) => setIconSearchTerm(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className="w-full mb-2 p-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-700 dark:text-white outline-none"
            autoFocus
          />
          <div className="h-64 overflow-y-auto">
            <div className="grid grid-cols-5 gap-1">
              {(iconSearchTerm.trim() ? (emoji.search(iconSearchTerm) || []).map(r => r.emoji) : EMOJIS).map((em, i) => (
                <div
                  key={i}
                  className="text-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 p-1 rounded text-center"
                  onClick={() => updateTabIcon(tabIconPicker.id, em)}
                >
                  {em}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {pageIconPicker && (
        <div
          className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl rounded-lg p-2 z-[9999] page-icon-picker w-64"
          style={{ top: pageIconPicker.top, left: pageIconPicker.left }}
        >
          <input
            type="text"
            placeholder="Search icons..."
            value={iconSearchTerm}
            onChange={(e) => setIconSearchTerm(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className="w-full mb-2 p-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-700 dark:text-white outline-none"
            autoFocus
          />
          <div className="h-64 overflow-y-auto">
            <div className="grid grid-cols-5 gap-1">
              {(iconSearchTerm.trim() ? (emoji.search(iconSearchTerm) || []).map(r => r.emoji) : EMOJIS).map((em, i) => (
                <div
                  key={i}
                  className="text-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 p-1 rounded text-center"
                  onClick={() => updatePageIcon(pageIconPicker.pageId, em)}
                >
                  {em}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {itemToDelete && (
        <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-sm w-full p-6">
            <h3 className="font-bold text-xl mb-2 flex items-center gap-2 dark:text-white">
              <AlertCircle className="text-red-500" /> Confirm Deletion
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
              Are you sure you want to delete this {itemToDelete.type}? All contents will be lost forever.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setItemToDelete(null)}
                className="px-5 py-2 font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-5 py-2 bg-red-500 text-white font-medium rounded-lg hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sign Out Confirmation */}
      {showSignOutConfirm && (
        <div className="fixed inset-0 bg-black/50 z-[10001] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="font-bold text-lg mb-2 dark:text-white">Sign out of Google?</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">Your data will remain synced. You can sign back in anytime.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowSignOutConfirm(false)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => { handleSignOut(); setShowSignOutConfirm(false); }}
                className="px-4 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg"
              >
                Yes, Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync Conflict Modal */}
      {syncConflict && (
        <div className="fixed inset-0 bg-black/50 z-[10002] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full p-6">
            <h3 className="font-bold text-xl mb-3 flex items-center gap-2 dark:text-white">
              <AlertCircle className="text-yellow-500" /> Offline Changes Detected
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-6 leading-relaxed text-sm">
              We found local changes on this device that haven't been saved to Google Drive. Which version would you like to keep?
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  setData(syncConflict.localData);
                  triggerStructureSync();
                  setSyncConflict(null);
                }}
                className="w-full text-left p-4 rounded-lg border-2 border-blue-500 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
              >
                <div className="font-bold text-blue-700 dark:text-blue-300 mb-1">Keep Local Changes</div>
                <div className="text-xs text-blue-600 dark:text-blue-400">Overwrites Google Drive with the unsynced data currently on this device.</div>
              </button>
              <button
                onClick={() => {
                  setData(syncConflict.driveData);
                  localStorage.setItem('strata_last_synced_hash', JSON.stringify(syncConflict.driveData.notebooks));
                  setSyncConflict(null);

                  if (syncConflict.driveData.notebooks?.length > 0) {
                    const nb = syncConflict.driveData.notebooks[0];
                    setActiveNotebookId(nb.id);
                    const tab = nb.tabs[0];
                    if (tab) {
                      setActiveTabId(tab.id);
                      setActivePageId(tab.pages[0]?.id || null);
                    }
                  }
                }}
                className="w-full text-left p-4 rounded-lg border-2 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <div className="font-bold text-gray-700 dark:text-gray-300 mb-1">Discard Local & Load from Drive</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Reverts to the last safely synced state from Google Drive.</div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6 settings-modal">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-xl flex items-center gap-2 dark:text-white">
                <Settings size={20} /> Settings
              </h3>
              <button onClick={() => setShowSettings(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                <X size={20} className="dark:text-white" />
              </button>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Theme</label>
              <div className="flex gap-2">
                {[
                  { value: 'light', icon: <Sun size={16} />, label: 'Light' },
                  { value: 'dark', icon: <Moon size={16} />, label: 'Dark' },
                  { value: 'system', icon: <Monitor size={16} />, label: 'System' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setSettings(s => ({ ...s, theme: opt.value }))}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                      settings.theme === opt.value
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                        : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {opt.icon}
                    <span className="text-sm font-medium">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                <span className="flex items-center gap-2"><Columns size={16} /> Max Columns per Row</span>
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="1"
                  max="6"
                  value={settings.maxColumns}
                  onChange={(e) => setSettings(s => ({ ...s, maxColumns: parseInt(e.target.value) }))}
                  className="flex-1 accent-blue-500"
                />
                <span className="w-8 text-center font-bold text-lg dark:text-white">{settings.maxColumns}</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">Controls how many columns you can create when dragging blocks side-by-side</p>
            </div>

            <div className="border-t dark:border-gray-700 pt-4">
              <button
                onClick={() => setShowSettings(false)}
                className="w-full py-2 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600"
              >
                Done
              </button>
              <a
                href="https://chrismoore.me"
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-sm text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 mt-3 transition-colors"
              >
                chrismoore.me
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Add Drive URL Modal */}
      {showDriveUrlModal && (
        <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-xl flex items-center gap-3 dark:text-white">
                <img src={DRIVE_LOGO_URL} alt="" className="w-8 h-8 object-contain" /> Add Drive URL
              </h3>
              <button
                onClick={() => { setShowDriveUrlModal(false); setDriveUrlModalValue(''); }}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X size={20} className="dark:text-white" />
              </button>
            </div>

            <div className="mb-6">
              <button
                onClick={() => {
                  setShowDriveUrlModal(false);
                  setDriveUrlModalValue('');
                  if (typeof GoogleAPI !== 'undefined' && GoogleAPI.showDrivePicker) {
                    GoogleAPI.showDrivePicker((file) => {
                      addGooglePage(file);
                    });
                  } else {
                    showNotification('Drive Picker not available', 'error');
                  }
                }}
                className="w-full py-3 px-4 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
              >
                <FolderOpen size={18} /> Browse
              </button>
            </div>

            <div className="flex items-center gap-3 mb-6">
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-600"></div>
              <span className="text-sm text-gray-400">OR</span>
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-600"></div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Compatible types</label>
              <div className="grid grid-cols-5 gap-2">
                {DRIVE_SERVICE_ICONS.map((item) => (
                  <div key={item.type} className="flex flex-col items-center gap-1">
                    <img src={item.url} alt={item.name} className="w-10 h-10 object-contain rounded" />
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 text-center leading-tight">{item.name}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">URL</label>
              <input
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                placeholder="https://docs.google.com/... or https://drive.google.com/... or PDF URL"
                value={driveUrlModalValue}
                onChange={(e) => setDriveUrlModalValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && driveUrlModalValue) {
                    if (addEmbedPageFromUrl(driveUrlModalValue)) {
                      setShowDriveUrlModal(false);
                      setDriveUrlModalValue('');
                    }
                  } else if (e.key === 'Escape') {
                    setShowDriveUrlModal(false);
                    setDriveUrlModalValue('');
                  }
                }}
                autoFocus
              />
              <p className="text-xs text-gray-400 mt-2">
                Paste a link to a Google Doc, Sheet, Slides, Form, Drawing, Site, PDF, or any Drive file shared with you.
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowDriveUrlModal(false); setDriveUrlModalValue(''); }}
                className="px-5 py-2 font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (addEmbedPageFromUrl(driveUrlModalValue)) {
                    setShowDriveUrlModal(false);
                    setDriveUrlModalValue('');
                  }
                }}
                disabled={!driveUrlModalValue}
                className="px-5 py-2 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Page
              </button>
            </div>
          </div>
        </div>
      )}

      {showLucidModal && (() => {
        const handleAddLucid = () => {
          if (!lucidUrlValue) return;
          let finalUrl = lucidUrlValue.trim();
          const srcMatch = finalUrl.match(/src=["'](.*?)["']/);
          if (srcMatch) finalUrl = srcMatch[1];
          const uuidMatch = finalUrl.match(/lucidchart\/([a-f0-9-]+)/);
          if (uuidMatch) {
            finalUrl = `https://lucid.app/documents/embedded/${uuidMatch[1]}`;
          } else {
            finalUrl = finalUrl.replace('/documents/view/', '/documents/embedded/');
          }
          addLucidPage(finalUrl);
          setShowLucidModal(false);
          setLucidUrlValue('');
        };

        return (
          <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-xl flex items-center gap-3 dark:text-white">
                  <span className="text-2xl">📊</span> Add Lucidchart
                </h3>
                <button
                  onClick={() => { setShowLucidModal(false); setLucidUrlValue(''); }}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  <X size={20} className="dark:text-white" />
                </button>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Publish / Embed URL</label>
                <input
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  placeholder="https://lucid.app/documents/embedded/..."
                  value={lucidUrlValue}
                  onChange={(e) => setLucidUrlValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddLucid();
                    else if (e.key === 'Escape') {
                      setShowLucidModal(false);
                      setLucidUrlValue('');
                    }
                  }}
                  autoFocus
                />
                <p className="text-xs text-gray-400 mt-2">
                  In Lucidchart, go to File &gt; Publish &gt; Generate Link, and paste the URL here.
                </p>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => { setShowLucidModal(false); setLucidUrlValue(''); }}
                  className="px-5 py-2 font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddLucid}
                  disabled={!lucidUrlValue}
                  className="px-5 py-2 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add Page
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Edit Embed URL Modal */}
      {showEditEmbed && (() => {
        const handleSave = () => {
          if (!editEmbedUrl) return;
          let finalUrl = editEmbedUrl.trim();
          const activePage = data.notebooks.flatMap(n => n.tabs).flatMap(t => t.pages).find(p => p.id === activePageId);

          if (activePage?.type === 'lucidchart') {
            const srcMatch = finalUrl.match(/src=["'](.*?)["']/);
            if (srcMatch) finalUrl = srcMatch[1];
            const uuidMatch = finalUrl.match(/lucidchart\/([a-f0-9-]+)/);
            if (uuidMatch) {
              finalUrl = `https://lucid.app/documents/embedded/${uuidMatch[1]}`;
            } else {
              finalUrl = finalUrl.replace('/documents/view/', '/documents/embedded/');
              finalUrl = finalUrl.replace('/documents/edit/', '/documents/embedded/');
            }
          }

          setData(prev => updatePageInData(prev, { notebookId: activeNotebookId, tabId: activeTabId, pageId: activePageId }, p => ({
            ...p,
            name: editEmbedName || p.name,
            embedUrl: finalUrl,
            originalUrl: editEmbedUrl,
            webViewLink: finalUrl
          })));
          triggerContentSync(activePageId);
          setShowEditEmbed(false);
        };

        return (
          <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-xl flex items-center gap-2 dark:text-white">
                  <Edit3 size={20} /> Edit Embed
                </h3>
                <button onClick={() => setShowEditEmbed(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                  <X size={20} className="dark:text-white" />
                </button>
              </div>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Page Name</label>
                  <input
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
                    value={editEmbedName}
                    onChange={(e) => setEditEmbedName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">URL</label>
                  <input
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
                    value={editEmbedUrl}
                    onChange={(e) => setEditEmbedUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                    autoFocus
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowEditEmbed(false)} className="px-5 py-2 font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancel</button>
                <button onClick={handleSave} className="px-5 py-2 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 shadow-lg">Save Changes</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Cover Picker Modal */}
      {showCoverInput && (
        <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6 cover-input">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg dark:text-white">Page Cover</h3>
              <button onClick={() => setShowCoverInput(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                <X size={20} className="dark:text-white"/>
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Image URL</label>
              <input
                type="text"
                placeholder="https://..."
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-transparent dark:text-white text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    updatePageCover(activePageId, e.target.value);
                    setShowCoverInput(false);
                  }
                }}
              />
              <p className="text-[10px] text-gray-400 mt-1">Paste any image URL. Drive images must be publicly shared.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Gradients & Colors</label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  'linear-gradient(to right, #ff9a9e, #fecfef)',
                  'linear-gradient(to right, #a18cd1, #fbc2eb)',
                  'linear-gradient(to right, #84fab0, #8fd3f4)',
                  'linear-gradient(to right, #fccb90, #d57eeb)',
                  'linear-gradient(to right, #e0c3fc, #8ec5fc)',
                  'linear-gradient(to right, #4facfe, #00f2fe)',
                  '#1e293b', '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'
                ].map(bg => (
                  <div
                    key={bg}
                    onClick={() => { updatePageCover(activePageId, bg); setShowCoverInput(false); }}
                    className="h-10 rounded cursor-pointer border border-black/10 hover:scale-105 transition-transform"
                    style={{ background: bg }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {isAuthenticated && !hasInitialLoadCompleted && (
        <div className="fixed inset-0 z-[9999] bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm flex flex-col items-center justify-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">Loading Workspace</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Syncing your notebooks from Google Drive...</p>
        </div>
      )}

      {/* Notification */}
      {notification && (
        <div className="fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-2 rounded-full shadow-lg z-[10000]">
          {notification.message}
        </div>
      )}
    </>
  );
}
