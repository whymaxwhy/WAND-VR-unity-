

import React from 'react';
// FIX: WandTypes is exported from types.ts, not constants.ts.
import { 
    WBDLProtocol, 
    WBDLPayloads, 
    SPELL_LIST, 
    WAND_THRESHOLDS, 
    Houses, 
    WAND_TYPE_IDS, 
    SPELL_DETAILS_DATA,
    LOCAL_STORAGE_KEY_SAVED_VFX,
    LOCAL_STORAGE_KEY_SPELLBOOK,
    LOCAL_STORAGE_KEY_CUSTOM_SPELLS,
    LOCAL_STORAGE_KEY_CASTING_HISTORY,
    LOCAL_STORAGE_KEY_TUTORIAL
} from './constants';
// FIX: Added RawPacket to the import list from types.ts.
import { WandTypes, RawPacket, ConnectionState } from './types';
import type { 
    LogEntry, 
    LogType, 
    VfxCommand, 
    VfxCommandType, 
    Spell, 
    IMUReading, 
    GestureState, 
    DeviceType, 
    WandType, 
    WandDevice, 
    WandDeviceType, 
    House, 
    SpellDetails, 
    SpellUse, 
    ExplorerService, 
    ExplorerCharacteristic, 
    BleEvent, 
    MacroCommand, 
    ButtonThresholds, 
    CastingHistoryEntry,
    LiveEvent,
    WriteQueueItem
} from './types';
import Scripter from './Scripter';
import WizardingClass from './WizardingClass';
import { SpellEditor } from './SpellEditor';


// --- HELPER FUNCTIONS ---
const getTimestamp = () => new Date().toLocaleTimeString('en-US', { hour12: false });
const bytesToHex = (bytes: Uint8Array) => Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
// FIX: Corrected typo in TextDecoder constructor.
const textDecoder = new TextDecoder('utf-8');

const parseImuPacket = (data: Uint8Array): IMUReading[] => {
    // Assumes standard 20-byte packet structure for reverse-engineered wand
    // Byte 0: Sequence/Chunk Index
    // Byte 1-12: Data (Ax, Ay, Az, Gx, Gy, Gz) as Int16LE
    if (data.length < 13) return [];
    
    const view = new DataView(data.buffer);
    const seq = view.getUint8(0);
    
    // Scale factors (approximations for visualization)
    const accScale = 8192.0; 
    const gyroScale = 16.4; 

    const ax = view.getInt16(1, true) / accScale;
    const ay = view.getInt16(3, true) / accScale;
    const az = view.getInt16(5, true) / accScale;

    const gx = view.getInt16(7, true) / gyroScale;
    const gy = view.getInt16(9, true) / gyroScale;
    const gz = view.getInt16(11, true) / gyroScale;

    return [{
        chunk_index: seq,
        acceleration: { x: ax, y: ay, z: az },
        gyroscope: { x: gx, y: gy, z: gz }
    }];
};

/**
 * Converts a HEX color to the CIE 1931 XY color space.
 * This is a complex conversion required by the Philips Hue API.
 * The implementation is a standard, widely-used approximation.
 * Source for algorithm: https://github.com/peter-murray/node-hue-api/blob/master/lib/rgb.js
 * @param hex The hex color string (e.g., "#RRGGBB").
 * @returns An array [x, y] or null if invalid.
 */
const hexToXy = (hex: string): [number, number] | null => {
    if (!hex) return null;

    const sanitizedHex = hex.replace('#', '');
    const red = parseInt(sanitizedHex.substring(0, 2), 16) / 255;
    const green = parseInt(sanitizedHex.substring(2, 4), 16) / 255;
    const blue = parseInt(sanitizedHex.substring(4, 6), 16) / 255;

    // Apply gamma correction
    const r = (red > 0.04045) ? Math.pow((red + 0.055) / 1.055, 2.4) : (red / 12.92);
    const g = (green > 0.04045) ? Math.pow((green + 0.055) / 1.055, 2.4) : (green / 12.92);
    const b = (blue > 0.04045) ? Math.pow((blue + 0.055) / 1.055, 2.4) : (blue / 12.92);

    // Convert to XYZ
    const X = r * 0.664511 + g * 0.154324 + b * 0.162028;
    const Y = r * 0.283881 + g * 0.668433 + b * 0.047685;
    const Z = r * 0.000088 + g * 0.072310 + b * 0.986039;

    const sum = X + Y + Z;
    if (sum === 0) return [0.3227, 0.329]; // Default to neutral white on black

    const x = X / sum;
    const y = Y / sum;

    return [parseFloat(x.toFixed(4)), parseFloat(y.toFixed(4))];
}


// --- ICONS ---
const MagicWandIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
    <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
  </svg>
);
const CubeIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V4a2 2 0 00-2-2h-8zM2 8a2 2 0 012-2h4v12H4a2 2 0 01-2-2V8z" />
    </svg>
);
const StatusOnlineIcon = () => <svg className="h-4 w-4 text-green-400" fill="currentColor" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" /></svg>;
const StatusOfflineIcon = () => <svg className="h-4 w-4 text-red-400" fill="currentColor" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" /></svg>;
const BatteryIcon = ({ level }: { level: number | null }) => {
  if (level === null) return null;
  
  let levelClass = 'text-green-400'; // Default to HIGH
  let pulseAnimation = '';
  
  // Thresholds based on WandStatus$a.smali enums (HIGH, MEDIUM, LOW, CRITICAL)
  if (level <= 15) { // CRITICAL
    levelClass = 'text-red-400';
    pulseAnimation = 'animate-pulse';
  } else if (level <= 40) { // LOW
    levelClass = 'text-yellow-400';
  } else if (level <= 70) { // MEDIUM
    levelClass = 'text-lime-400';
  } 
  // else HIGH (already set)

  const barWidth = Number(level) / 10;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${levelClass} ${pulseAnimation}`} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm12 1H5a1 1 0 00-1 1v8a1 1 0 001 1h10a1 1 0 001-1V6a1 1 0 00-1-1z" clipRule="evenodd" />
      {level > 10 && <rect x="5" y="7" width={barWidth} height="6" rx="0.5" />}
    </svg>
  );
};
const PlusCircleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" /></svg>;
const TrashIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>;
const SaveIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3m-1 4-3 3m0 0-3-3m3 3V4" /></svg>;
const FolderOpenIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" /></svg>;
const ScanIcon = () => (
  <svg className="w-24 h-24 text-indigo-400 mx-auto mb-4" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <g>
      <circle fill="none" stroke="currentColor" strokeWidth="2" cx="50" cy="50" r="1">
        <animate attributeName="r" from="1" to="40" dur="2s" begin="0s" repeatCount="indefinite"/>
        <animate attributeName="opacity" from="1" to="0" dur="2s" begin="0s" repeatCount="indefinite"/>
      </circle>
       <circle fill="none" stroke="currentColor" strokeWidth="2" cx="50" cy="50" r="1">
        <animate attributeName="r" from="1" to="40" dur="2s" begin="0.5s" repeatCount="indefinite"/>
        <animate attributeName="opacity" from="1" to="0" dur="2s" begin="0.5s" repeatCount="indefinite"/>
      </circle>
    </g>
    <path stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" d="M40 60 l 20 -20 m -5 -15 l 10 10"/>
  </svg>
);
const ChartBarIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M3 3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3zm2 12a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v-5a1 1 0 0 1-1-1H6a1 1 0 0 1-1 1v5zm5-8a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V7z" clipRule="evenodd" />
    </svg>
);
const CodeIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        {/* FIX: Corrected malformed SVG path data which could cause parsing errors. */}
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
);
const SearchCircleIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
    </svg>
);
const LinkIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 0 0-5.656 0l-4 4a4 4 0 1 0 5.656 5.656l1.102-1.101m-.758-4.899a4 4 0 0 0 5.656 0l4-4a4 4 0 0 0-5.656-5.656l-1.1 1.1" />
    </svg>
);
const LinkBreakIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 0 0-5.656 0l-4 4a4 4 0 1 0 5.656 5.656l1.102-1.101m-.758-4.899a4 4 0 0 0 5.656 0l4-4a4 4 0 0 0-5.656-5.656l-1.1 1.1M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
);
const DocumentSearchIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 21h7a2 2 0 0 0 2-2V9.414a1 1 0 0 0-.293-.707l-5.414-5.414A1 1 0 0 0 12.586 3H7a2 2 0 0 0-2 2v11m0 5 4.879-4.879m0 0a3 3 0 1 0 4.243-4.242 3 3 0 0 0-4.243 4.242Z" />
    </svg>
);
const SpinnerIcon = () => (
  <svg className="animate-spin h-4 w-4 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);
const ExclamationCircleIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0zM9 4a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-1 9a1 1 0 0 0 1-1V6a1 1 0 1 0-2 0v6a1 1 0 0 0 1 1z" clipRule="evenodd" />
    </svg>
);
const CheckCircleIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm3.707-9.293a1 1 0 0 0-1.414-1.414L9 10.586 7.707 9.293a1 1 0 0 0-1.414 1.414l2 2a1 1 0 0 0 1.414 0l4-4z" clipRule="evenodd" />
    </svg>
);
const SparklesIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H7v1a1 1 0 01-2 0V6H4a1 1 0 010-2h1V3a1 1 0 011-1zm6 0a1 1 0 011 1v1h1a1 1 0 010 2h-1v1a1 1 0 01-2 0v-1H7a1 1 0 010-2h1v-1a1 1 0 011-1zm6-5a1 1 0 011 1v1h1a1 1 0 010 2h-1v1a1 1 0 01-2 0V8h-1a1 1 0 010-2h1V5a1 1 0 011-1zM5 15a1 1 0 011 1v1h1a1 1 0 010 2h-1v1a1 1 0 01-2 0v-1H4a1 1 0 010-2h1v-1a1 1 0 011-1z" clipRule="evenodd" />
  </svg>
);
const BookOpenIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
);
const PencilAltIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
);


// --- UI COMPONENTS ---

const Modal = ({ title, onClose, children }: any) => (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="bg-slate-800 rounded-lg p-6 max-w-lg w-full m-4 border border-slate-700 shadow-xl">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-white">{title}</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-white">&times;</button>
      </div>
      <div>{children}</div>
    </div>
  </div>
);

const TutorialModal = ({ onFinish }: { onFinish: () => void }) => (
    <Modal title="Welcome to Wand Controller" onClose={onFinish}>
        <div className="space-y-4 text-slate-300">
            <p>Connect your BLE Wand and Box to get started.</p>
            <p>Use the <strong>Device Manager</strong> to scan and pair.</p>
            <p>Explore <strong>Wizarding Class</strong> to practice spells.</p>
            <button onClick={onFinish} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded">Got it!</button>
        </div>
    </Modal>
);

const SpellDetailsCard = ({ spellDetails, onCastOnWand, onCastOnBox, isWandConnected, isBoxConnected }: any) => {
    if(!spellDetails) return null;
    return (
        <div className="text-slate-300 space-y-4">
            <p className="italic text-slate-400">{spellDetails.description}</p>
            <div className="grid grid-cols-2 gap-4">
                <button 
                    disabled={!isWandConnected}
                    onClick={() => onCastOnWand(spellDetails)}
                    className="bg-indigo-600/50 hover:bg-indigo-600 p-2 rounded disabled:opacity-50">
                    Cast on Wand
                </button>
                <button 
                     disabled={!isBoxConnected}
                     onClick={() => onCastOnBox(spellDetails)}
                     className="bg-purple-600/50 hover:bg-purple-600 p-2 rounded disabled:opacity-50">
                    Cast on Box
                </button>
            </div>
            {spellDetails.spell_uses && (
                <div>
                    <h4 className="font-semibold text-white mb-1">Uses:</h4>
                    <ul className="list-disc pl-5">
                        {spellDetails.spell_uses.map((use: any, i: number) => <li key={i}>{use.name}</li>)}
                    </ul>
                </div>
            )}
        </div>
    );
};

const TabButton = ({ Icon, label, onClick, isActive }: any) => (
    <button
        onClick={onClick}
        className={`flex items-center w-full px-4 py-3 text-sm font-medium rounded-md transition-colors ${isActive ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}
    >
        <Icon />
        <span>{label}</span>
    </button>
);

const SpellBook = ({ spellBook, spellFilter, setSpellFilter, castingHistory }: any) => (
    <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 h-full flex flex-col">
        <h2 className="text-lg font-semibold mb-2">Spellbook</h2>
        <input 
            type="text" 
            placeholder="Filter spells..." 
            value={spellFilter}
            onChange={e => setSpellFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded p-2 mb-2 text-sm w-full"
        />
        <div className="flex-grow overflow-y-auto space-y-1">
            {spellBook.filter((s:any) => s.name.toLowerCase().includes(spellFilter.toLowerCase())).map((s:any, i:number) => (
                <div key={i} className="text-sm p-2 bg-slate-700/50 rounded flex justify-between">
                    <span>{s.name}</span>
                </div>
            ))}
            {spellBook.length === 0 && <p className="text-slate-500 text-sm">No spells discovered yet.</p>}
        </div>
    </div>
);

const LogView = ({ logs }: { logs: LogEntry[] }) => (
    <div className="h-64 overflow-y-auto font-mono text-xs space-y-1 bg-slate-900 p-2 rounded">
        {logs.slice().reverse().map(log => (
            <div key={log.id} className={
                log.type === 'ERROR' ? 'text-red-400' :
                log.type === 'SUCCESS' ? 'text-green-400' :
                log.type === 'DATA_IN' ? 'text-blue-300' :
                log.type === 'DATA_OUT' ? 'text-orange-300' : 'text-slate-300'
            }>
                <span className="opacity-50">[{log.timestamp}]</span> {log.message}
            </div>
        ))}
    </div>
);

const DeviceManager = ({ wandConnectionState, onConnectWand, boxConnectionState, onConnectBox, wandBatteryLevel, boxBatteryLevel, wandDetails, boxDetails, isTvBroadcastEnabled, setIsTvBroadcastEnabled, userHouse, setUserHouse, userPatronus, setUserPatronus, isHueEnabled, setIsHueEnabled, hueBridgeIp, setHueBridgeIp, hueUsername, setHueUsername, hueLightId, setHueLightId, saveHueSettings, onResetTutorial, onSendBoxTestMacro, onRequestBoxAddress }: any) => (
    <div className="space-y-6 overflow-y-auto p-2">
        <h3 className="text-xl font-semibold">Device Manager</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-900/50 p-4 rounded border border-slate-700">
                <h4 className="font-bold text-lg mb-2">Wand</h4>
                <div className="flex items-center justify-between mb-4">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${wandConnectionState === 'Connected' ? 'bg-green-900 text-green-300' : 'bg-slate-700 text-slate-400'}`}>
                        {wandConnectionState}
                    </span>
                    <BatteryIcon level={wandBatteryLevel} />
                </div>
                {wandDetails && (
                    <div className="text-xs space-y-1 text-slate-400 mb-4">
                        <p>Name: {wandDetails.bleName}</p>
                        <p>Type: {wandDetails.wandType}</p>
                    </div>
                )}
                <button onClick={onConnectWand} disabled={wandConnectionState === 'Connected'} className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-600 text-white py-2 rounded">
                    {wandConnectionState === 'Connected' ? 'Connected' : 'Connect Wand'}
                </button>
            </div>

            <div className="bg-slate-900/50 p-4 rounded border border-slate-700">
                <h4 className="font-bold text-lg mb-2">Box</h4>
                 <div className="flex items-center justify-between mb-4">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${boxConnectionState === 'Connected' ? 'bg-green-900 text-green-300' : 'bg-slate-700 text-slate-400'}`}>
                        {boxConnectionState}
                    </span>
                    <BatteryIcon level={boxBatteryLevel} />
                </div>
                <button onClick={onConnectBox} disabled={boxConnectionState === 'Connected'} className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-600 text-white py-2 rounded">
                    {boxConnectionState === 'Connected' ? 'Connected' : 'Connect Box'}
                </button>
            </div>
        </div>

        {/* Settings Area */}
        <div className="bg-slate-900/50 p-4 rounded border border-slate-700 space-y-4">
            <h4 className="font-bold">Integration Settings</h4>
             <div className="flex items-center space-x-2">
                <input type="checkbox" checked={isTvBroadcastEnabled} onChange={e => setIsTvBroadcastEnabled(e.target.checked)} />
                <label>Enable TV Broadcast</label>
             </div>
             <div>
                <label className="block text-xs">House</label>
                <select value={userHouse} onChange={e => setUserHouse(e.target.value)} className="bg-slate-800 p-1 rounded w-full">
                    {Houses.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
             </div>
        </div>
    </div>
);

const ControlHub = ({ lastSpell, gestureState, liveEvent, spellDetails }: any) => (
    <div className="text-center space-y-8 py-8">
        <h3 className="text-2xl font-bold text-white">Control Hub</h3>
        <div className="bg-slate-900/50 inline-block p-8 rounded-full border-4 border-indigo-500/30">
             <div className="text-sm text-slate-400 uppercase tracking-widest mb-2">Status</div>
             <div className="text-3xl font-bold text-indigo-300 animate-pulse">{gestureState}</div>
        </div>

        {lastSpell && (
            <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 max-w-md mx-auto">
                <h4 className="text-slate-400 text-sm mb-1">Last Spell Cast</h4>
                <div className="text-4xl font-serif text-yellow-400 mb-2">{lastSpell}</div>
                {spellDetails && <p className="text-slate-300 italic">{spellDetails.description}</p>}
            </div>
        )}
        
        {liveEvent && (
            <div className={`p-4 rounded-lg inline-block ${liveEvent.type === 'success' ? 'bg-green-900/50 text-green-300' : 'bg-slate-800 text-white'}`}>
                {liveEvent.message}
            </div>
        )}
    </div>
);

const SpellCompendium = ({ spellBook, onSelectSpell }: any) => (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 overflow-y-auto h-full p-2">
        {SPELL_LIST.map(spell => {
            const isDiscovered = spellBook.some((s:any) => s.name === spell.toUpperCase());
            return (
                <div key={spell} onClick={() => onSelectSpell(spell)} className={`p-4 rounded border cursor-pointer hover:bg-slate-700 transition ${isDiscovered ? 'bg-indigo-900/30 border-indigo-500/50' : 'bg-slate-900 border-slate-700 opacity-50'}`}>
                    <div className="font-bold text-sm truncate">{spell.replace(/_/g, ' ')}</div>
                    <div className="text-xs text-slate-400">{isDiscovered ? 'Discovered' : 'Unknown'}</div>
                </div>
            );
        })}
    </div>
);

const BleExplorer = ({ onScan, isExploring, device, services }: any) => (
    <div className="h-full flex flex-col p-2">
        <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold">BLE Explorer</h3>
            <button onClick={onScan} disabled={isExploring} className="bg-blue-600 px-4 py-2 rounded">{isExploring ? 'Scanning...' : 'Scan Any Device'}</button>
        </div>
        {device && (
            <div className="bg-slate-900 p-4 rounded border border-slate-700 overflow-auto">
                <h4 className="font-bold text-lg text-green-400 mb-4">{device.name || 'Unknown Device'} ({device.id})</h4>
                {services.map((s: any, i: number) => (
                    <div key={i} className="mb-4 ml-4">
                        <div className="text-yellow-200 font-mono text-sm">Service: {s.uuid}</div>
                        {s.characteristics.map((c: any, j: number) => (
                            <div key={j} className="ml-4 text-xs font-mono text-slate-400">
                                - Char: {c.uuid} {Object.keys(c.properties).filter(k=>c.properties[k]).map(k => `[${k}]`).join('')}
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        )}
        {!device && <div className="text-slate-500 text-center mt-10">Scan to inspect raw BLE services.</div>}
    </div>
);

// FIX: Define a props interface for the Diagnostics component to avoid using `any` and fix type errors.
interface DiagnosticsProps {
  detectedOpCodes: Set<number>;
  rawPacketLog: RawPacket[];
  bleEventLog: BleEvent[];
  isImuStreaming: boolean;
  toggleImuStream: () => void;
  handleImuCalibrate: () => void;
  latestImuData: IMUReading[] | null;
  buttonState: [boolean, boolean, boolean, boolean];
  isClientSideGestureDetectionEnabled: boolean;
  setIsClientSideGestureDetectionEnabled: (enabled: boolean) => void;
  gestureThreshold: number;
  setGestureThreshold: (threshold: number) => void;
  clientSideGestureDetected: boolean;
  buttonThresholds: ButtonThresholds[];
  handleReadButtonThresholds: () => void;
  wandConnectionState: ConnectionState;
  queueCommand: (payload: Uint8Array, silent?: boolean) => void;
}

const Diagnostics: React.FC<DiagnosticsProps> = ({
  detectedOpCodes, rawPacketLog, bleEventLog, isImuStreaming, toggleImuStream, handleImuCalibrate,
  latestImuData, buttonState, isClientSideGestureDetectionEnabled, setIsClientSideGestureDetectionEnabled,
  gestureThreshold, setGestureThreshold, clientSideGestureDetected, buttonThresholds, handleReadButtonThresholds,
  wandConnectionState, queueCommand
}) => {
    // FIX: Explicitly type 'a' and 'b' as numbers to avoid arithmetic errors on potentially inferred 'unknown' types.
    const sortedOpCodes = React.useMemo(() => Array.from(detectedOpCodes).sort((a: number, b: number) => a - b), [detectedOpCodes]);
    const isConnected = wandConnectionState === ConnectionState.CONNECTED;

    return (
        <div className="h-full flex flex-col space-y-4">
            <h3 className="text-xl font-semibold">Diagnostics &amp; Raw Data</h3>
            <div className="flex-grow grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-hidden">
                
                {/* Left Column */}
                <div className="flex flex-col space-y-4 overflow-hidden">
                    {/* IMU & Buttons Panel */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         {/* IMU Panel */}
                        <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                            <h4 className="text-lg font-semibold mb-3">IMU &amp; Sensors</h4>
                             <div className="flex space-x-2 mb-3">
                                <button onClick={toggleImuStream} disabled={!isConnected} className="flex-1 px-3 py-2 text-sm bg-blue-600 hover:bg-blue-500 rounded font-semibold disabled:bg-slate-500">{isImuStreaming ? 'Stop Stream' : 'Start Stream'}</button>
                                <button onClick={handleImuCalibrate} disabled={!isConnected} className="flex-1 px-3 py-2 text-sm bg-yellow-600 hover:bg-yellow-500 rounded font-semibold disabled:bg-slate-500">Calibrate</button>
                            </div>
                             <div className="font-mono text-xs space-y-1 text-slate-400">
                                {latestImuData ? latestImuData.slice(-1).map(d => (
                                    <div key={d.chunk_index}>
                                        <p>Acc: {d.acceleration.x.toFixed(2)}, {d.acceleration.y.toFixed(2)}, {d.acceleration.z.toFixed(2)}</p>
                                        <p>Gyr: {d.gyroscope.x.toFixed(2)}, {d.gyroscope.y.toFixed(2)}, {d.gyroscope.z.toFixed(2)}</p>
                                    </div>
                                )) : <p>IMU stream is off.</p>}
                            </div>
                        </div>

                        {/* Button Panel */}
                        <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                           <div className="flex justify-between items-center mb-2">
                             <h4 className="text-lg font-semibold">Grip &amp; Thresholds</h4>
                             <button onClick={handleReadButtonThresholds} disabled={!isConnected} className="px-2 py-1 text-xs bg-slate-600 hover:bg-slate-500 rounded disabled:bg-slate-500">Read</button>
                           </div>
                            <div className="flex justify-around items-center h-16">
                                {buttonState.map((pressed, i) => (
                                    <div key={i} className="flex flex-col items-center">
                                        <div className={`w-8 h-8 rounded-full border-2 ${pressed ? 'bg-indigo-500 border-indigo-300' : 'bg-slate-700 border-slate-600'}`}></div>
                                        <span className="text-xs mt-1 text-slate-400">B{i+1}</span>
                                        <span className="text-xs font-mono text-slate-500">
                                            {buttonThresholds[i].min !== null ? `${buttonThresholds[i].min}-${buttonThresholds[i].max}` : 'N/A'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    {/* Gesture Detection Panel */}
                    <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                         <div className="relative flex items-start">
                            <div className="flex h-5 items-center">
                                <input id="gesture-toggle" type="checkbox" checked={isClientSideGestureDetectionEnabled} onChange={e => setIsClientSideGestureDetectionEnabled(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                            </div>
                            <div className="ml-3 text-sm">
                                <label htmlFor="gesture-toggle" className="font-medium text-slate-300">Client-Side Gesture Detection</label>
                                <p className="text-slate-400">Detect casting motion in the browser