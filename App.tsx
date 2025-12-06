

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
    <path fillRule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H7v1a1 1 0 01-2 0V6H4a1 1 0 010-2h1V3a1 1 0 011-1zm6 0a1 1 0 011 1v1h1a1 1 0 010 2h-1v1a1 1 0 01-2 0V6h-1a1 1 0 010-2h1V5a1 1 0 011-1zM9 10a1 1 0 011 1v1h1a1 1 0 010 2h-1v1a1 1 0 01-2 0v-1H7a1 1 0 010-2h1v-1a1 1 0 011-1zm6-5a1 1 0 011 1v1h1a1 1 0 010 2h-1v1a1 1 0 01-2 0V8h-1a1 1 0 010-2h1V5a1 1 0 011-1zM5 15a1 1 0 011 1v1h1a1 1 0 010 2h-1v1a1 1 0 01-2 0v-1H4a1 1 0 010-2h1v-1a1 1 0 011-1z" clipRule="evenodd" />
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
                                <p className="text-slate-400">Detect casting motion in the browser based on acceleration magnitude.</p>
                            </div>
                        </div>
                        {isClientSideGestureDetectionEnabled && (
                            <div className="mt-3">
                                <label htmlFor="gesture-threshold" className="block text-sm font-medium text-slate-400">Threshold: {gestureThreshold.toFixed(1)} G</label>
                                <input type="range" id="gesture-threshold" min="0.5" max="5" step="0.1" value={gestureThreshold} onChange={e => setGestureThreshold(parseFloat(e.target.value))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer" />
                            </div>
                        )}
                         {clientSideGestureDetected && <p className="text-green-400 text-sm mt-2 animate-pulse">Motion Detected!</p>}
                    </div>
                     {/* Command Test Panel */}
                    <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                         <h4 className="text-lg font-semibold mb-3">Direct Command Tests</h4>
                         <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                             <button onClick={() => queueCommand(new Uint8Array([WBDLProtocol.CMD.HAPTIC_VIBRATE, 0x58, 0x02]))} disabled={!isConnected} className="px-2 py-2 text-xs bg-slate-600 hover:bg-slate-500 rounded disabled:bg-slate-500">Buzz (600ms)</button>
                             <button onClick={() => queueCommand(WBDLPayloads.LIGHT_CLEAR_ALL_CMD)} disabled={!isConnected} className="px-2 py-2 text-xs bg-slate-600 hover:bg-slate-500 rounded disabled:bg-slate-500">Clear Lights</button>
                             <button onClick={() => queueCommand(WBDLPayloads.MACRO_READY_TO_CAST_CMD)} disabled={!isConnected} className="px-2 py-2 text-xs bg-slate-600 hover:bg-slate-500 rounded disabled:bg-slate-500">Ready FX</button>
                             <button onClick={() => queueCommand(WBDLPayloads.FIRMWARE_REQUEST_CMD)} disabled={!isConnected} className="px-2 py-2 text-xs bg-slate-600 hover:bg-slate-500 rounded disabled:bg-slate-500">Req Firmware</button>
                         </div>
                    </div>
                </div>

                {/* Right Column */}
                <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700 flex flex-col overflow-hidden">
                    <h4 className="text-lg font-semibold mb-2">Protocol Data Logs</h4>
                    <div className="flex-grow overflow-y-auto">
                        <h5 className="font-semibold text-slate-400 mt-2">Detected Incoming Opcodes:</h5>
                        <div className="flex flex-wrap gap-1 text-xs font-mono mt-1 mb-2">
                            {sortedOpCodes.length > 0 ? sortedOpCodes.map(code => <span key={code} className="bg-slate-700 px-2 py-0.5 rounded-full">0x{code.toString(16).padStart(2, '0')}</span>) : <span className="text-slate-500">None yet</span>}
                        </div>
                         <h5 className="font-semibold text-slate-400 mt-2">Raw Packet Log (Incoming):</h5>
                         <div className="h-32 overflow-y-scroll bg-slate-950 rounded p-2 font-mono text-xs border border-slate-700">
                             {rawPacketLog.map(p => <div key={p.id}><span className="text-slate-500">{p.timestamp}</span> <span className="text-purple-400">{p.hexData}</span></div>)}
                         </div>
                         <h5 className="font-semibold text-slate-400 mt-2">BLE Event Log:</h5>
                         <div className="h-32 overflow-y-scroll bg-slate-950 rounded p-2 font-mono text-xs border border-slate-700">
                             {bleEventLog.map(e => <div key={e.id}><span className="text-slate-500">{e.timestamp}</span> <span className="text-green-400">[{e.event}]</span> <span className="text-slate-300">{e.detail}</span></div>)}
                         </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

// --- MAIN APP ---
export default function App() {
  const [logs, setLogs] = React.useState<LogEntry[]>([]);
  const [wandConnectionState, setWandConnectionState] = React.useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [wandDetails, setWandDetails] = React.useState<WandDevice | null>(null);
  const [wandBatteryLevel, setWandBatteryLevel] = React.useState<number | null>(null);
  const [rawWandProductInfo, setRawWandProductInfo] = React.useState<string | null>(null);
  const [boxConnectionState, setBoxConnectionState] = React.useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [boxDetails, setBoxDetails] = React.useState<WandDevice | null>(null);
  const [boxBatteryLevel, setBoxBatteryLevel] = React.useState<number | null>(null);
  const [rawBoxProductInfo, setRawBoxProductInfo] = React.useState<string | null>(null);
  const [buttonState, setButtonState] = React.useState<[boolean, boolean, boolean, boolean]>([false, false, false, false]);
  const [lastSpell, setLastSpell] = React.useState<{ name: string } | null>(null);
  const [spellDetails, setSpellDetails] = React.useState<SpellDetails | null>(null);
  const [gestureState, setGestureState] = React.useState<GestureState>('Idle');
  const [activeTab, setActiveTab] = React.useState<'control_hub' | 'device_manager' | 'diagnostics' | 'compendium' | 'explorer' | 'scripter' | 'wizarding_class' | 'spell_editor'>('device_manager');
  const [isScannerOpen, setIsScannerOpen] = React.useState(false);
  const [deviceToScan, setDeviceToScan] = React.useState<DeviceType | null>(null);
  const [vfxSequence, setVfxSequence] = React.useState<VfxCommand[]>([]);
  const [savedVfxSequences, setSavedVfxSequences] = React.useState<Record<string, VfxCommand[]>>({});
  const [detectedOpCodes, setDetectedOpCodes] = React.useState<Set<number>>(new Set());
  const [rawPacketLog, setRawPacketLog] = React.useState<RawPacket[]>([]);
  const [spellBook, setSpellBook] = React.useState<Spell[]>([]);
  const [castingHistory, setCastingHistory] = React.useState<CastingHistoryEntry[]>([]);
  const [spellFilter, setSpellFilter] = React.useState('');
  const [customSpells, setCustomSpells] = React.useState<Record<string, SpellDetails>>({});
  const [isImuStreaming, setIsImuStreaming] = React.useState(false);
  const [latestImuData, setLatestImuData] = React.useState<IMUReading[] | null>(null);
  const [isTvBroadcastEnabled, setIsTvBroadcastEnabled] = React.useState<boolean>(false);
  const [userHouse, setUserHouse] = React.useState<House>('GRYFFINDOR');
  const [userPatronus, setUserPatronus] = React.useState<string>('Deer');
  const [isHueEnabled, setIsHueEnabled] = React.useState(false);
  const [hueBridgeIp, setHueBridgeIp] = React.useState('');
  const [hueUsername, setHueUsername] = React.useState('');
  const [hueLightId, setHueLightId] = React.useState('1');
  const [explorerDevice, setExplorerDevice] = React.useState<BluetoothDevice | null>(null);
  const [explorerServices, setExplorerServices] = React.useState<ExplorerService[]>([]);
  const [isExploring, setIsExploring] = React.useState(false);
  const [bleEventLog, setBleEventLog] = React.useState<BleEvent[]>([]);
  const [negotiatedMtu, setNegotiatedMtu] = React.useState<number>(WBDLPayloads.MTU_PAYLOAD_SIZE);
  const [isClientSideGestureDetectionEnabled, setIsClientSideGestureDetectionEnabled] = React.useState(true);
  const [gestureThreshold, setGestureThreshold] = React.useState(2.0); 
  const [clientSideGestureDetected, setClientSideGestureDetected] = React.useState(false);
  const [buttonThresholds, setButtonThresholds] = React.useState<ButtonThresholds[]>([
    { min: null, max: null }, { min: null, max: null },
    { min: null, max: null }, { min: null, max: null },
  ]);
  const [isCompendiumModalOpen, setIsCompendiumModalOpen] = React.useState(false);
  const [selectedCompendiumSpell, setSelectedCompendiumSpell] = React.useState<string | null>(null);
  const [compendiumSpellDetails, setCompendiumSpellDetails] = React.useState<SpellDetails | null>(null);
  const [commandDelay_ms, setCommandDelay_ms] = React.useState(20);
  const [showTutorial, setShowTutorial] = React.useState(false);
  const [liveEvent, setLiveEvent] = React.useState<LiveEvent | null>(null);
  const [writeQueue, setWriteQueue] = React.useState<WriteQueueItem[]>([]);
  const isWriting = React.useRef(false);
  const [boxWriteQueue, setBoxWriteQueue] = React.useState<WriteQueueItem[]>([]);
  const isBoxWriting = React.useRef(false);
  const logCounter = React.useRef(0);
  const bleEventCounter = React.useRef(0);
  const commandIdCounter = React.useRef(0);
  const rawPacketLogCounter = React.useRef(0);
  const castingHistoryCounter = React.useRef(0);
  const keepAliveInterval = React.useRef<number | null>(null);
  const liveEventTimeout = React.useRef<number | null>(null);
  const commandCharacteristic = React.useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const boxCommandCharacteristic = React.useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const isInitialMountSpells = React.useRef(true);
  const isInitialMountHistory = React.useRef(true);
  const isInitialMountSavedVfx = React.useRef(true);
  const discoveredSpells = React.useMemo(() => new Set(spellBook.map(s => s.name.toUpperCase())), [spellBook]);
  const macroIndexes = React.useRef<Record<string, number>>({});
  const masterSpellLibrary = React.useMemo(() => {
    return { ...SPELL_DETAILS_DATA, ...customSpells };
  }, [customSpells]);

  const addLog = React.useCallback((type: LogType, message: string) => {
    setLogs(prev => [...prev, { id: logCounter.current++, timestamp: getTimestamp(), type, message }]);
  }, []);
  
  const addBleEvent = React.useCallback((event: string, detail: string = '') => {
      setBleEventLog(prev => {
          const newEntry = { id: bleEventCounter.current++, timestamp: getTimestamp(), event, detail };
          const newLog = [newEntry, ...prev];
          return newLog.slice(0, 50); 
      });
  }, []);

  React.useEffect(() => {
    try {
      const savedVFXJSON = localStorage.getItem(LOCAL_STORAGE_KEY_SAVED_VFX);
      if (savedVFXJSON) setSavedVfxSequences(JSON.parse(savedVFXJSON));
    } catch (e) { localStorage.removeItem(LOCAL_STORAGE_KEY_SAVED_VFX); }
    try {
      const savedSpellsJSON = localStorage.getItem(LOCAL_STORAGE_KEY_SPELLBOOK);
      if (savedSpellsJSON) setSpellBook(JSON.parse(savedSpellsJSON));
    } catch (e) { localStorage.removeItem(LOCAL_STORAGE_KEY_SPELLBOOK); }
    try {
        const savedCustom = localStorage.getItem(LOCAL_STORAGE_KEY_CUSTOM_SPELLS);
        if (savedCustom) setCustomSpells(JSON.parse(savedCustom));
    } catch (e) {}
    try {
        const savedHistory = localStorage.getItem(LOCAL_STORAGE_KEY_CASTING_HISTORY);
        if (savedHistory) setCastingHistory(JSON.parse(savedHistory));
    } catch (e) { localStorage.removeItem(LOCAL_STORAGE_KEY_CASTING_HISTORY); }
    try {
      const savedEnabled = localStorage.getItem('magicWandTvBroadcastEnabled');
      if (savedEnabled) setIsTvBroadcastEnabled(JSON.parse(savedEnabled));
      const savedHouse = localStorage.getItem('magicWandUserHouse');
      if (savedHouse) setUserHouse(savedHouse as House);
      const savedPatronus = localStorage.getItem('magicWandUserPatronus');
      if (savedPatronus) setUserPatronus(savedPatronus);
    } catch (e) {}
    try {
      const savedHueEnabled = localStorage.getItem('magicWandHueEnabled');
      if (savedHueEnabled) setIsHueEnabled(JSON.parse(savedHueEnabled));
      const savedHueIp = localStorage.getItem('magicWandHueIp');
      if (savedHueIp) setHueBridgeIp(savedHueIp);
      const savedHueUser = localStorage.getItem('magicWandHueUser');
      if (savedHueUser) setHueUsername(savedHueUser);
      const savedHueLight = localStorage.getItem('magicWandHueLightId');
      if (savedHueLight) setHueLightId(savedHueLight);
    } catch (e) {}
  }, []);

  React.useEffect(() => {
    try {
      const tutorialCompleted = localStorage.getItem(LOCAL_STORAGE_KEY_TUTORIAL);
      if (tutorialCompleted !== 'true') setShowTutorial(true);
    } catch (e) { setShowTutorial(true); }
  }, []);

  React.useEffect(() => {
    if (isInitialMountSpells.current) { isInitialMountSpells.current = false; return; }
    localStorage.setItem(LOCAL_STORAGE_KEY_SPELLBOOK, JSON.stringify(spellBook));
  }, [spellBook]);

  React.useEffect(() => {
      if (isInitialMountHistory.current) { isInitialMountHistory.current = false; return; }
      localStorage.setItem(LOCAL_STORAGE_KEY_CASTING_HISTORY, JSON.stringify(castingHistory));
  }, [castingHistory]);

  React.useEffect(() => {
    if (isInitialMountSavedVfx.current) { isInitialMountSavedVfx.current = false; return; }
    if (Object.keys(savedVfxSequences).length > 0) localStorage.setItem(LOCAL_STORAGE_KEY_SAVED_VFX, JSON.stringify(savedVfxSequences));
    else localStorage.removeItem(LOCAL_STORAGE_KEY_SAVED_VFX);
  }, [savedVfxSequences]);

  React.useEffect(() => {
    localStorage.setItem('magicWandTvBroadcastEnabled', JSON.stringify(isTvBroadcastEnabled));
    localStorage.setItem('magicWandUserHouse', userHouse);
    localStorage.setItem('magicWandUserPatronus', userPatronus);
  }, [isTvBroadcastEnabled, userHouse, userPatronus]);

  const saveHueSettings = React.useCallback(() => {
    localStorage.setItem('magicWandHueEnabled', JSON.stringify(isHueEnabled));
    localStorage.setItem('magicWandHueIp', hueBridgeIp);
    localStorage.setItem('magicWandHueUser', hueUsername);
    localStorage.setItem('magicWandHueLightId', hueLightId);
    addLog('SUCCESS', 'Hue settings saved.');
  }, [isHueEnabled, hueBridgeIp, hueUsername, hueLightId, addLog]);

  React.useEffect(() => {
    if (!isScannerOpen) return;
    if (deviceToScan === 'wand' && wandConnectionState === ConnectionState.CONNECTED) {
      setIsScannerOpen(false); setDeviceToScan(null);
    } else if (deviceToScan === 'box' && boxConnectionState === ConnectionState.CONNECTED) {
      setIsScannerOpen(false); setDeviceToScan(null);
    }
  }, [wandConnectionState, boxConnectionState, isScannerOpen, deviceToScan]);

  React.useEffect(() => {
    if (lastSpell?.name) {
      const details = masterSpellLibrary[lastSpell.name.toUpperCase()];
      if (details) setSpellDetails(details);
      else setSpellDetails(null);
    } else setSpellDetails(null);
  }, [lastSpell, masterSpellLibrary]);

  const clearKeepAlive = React.useCallback(() => {
    if (keepAliveInterval.current) { clearInterval(keepAliveInterval.current); keepAliveInterval.current = null; }
  }, []);
  
  const sendTvBroadcast = React.useCallback((spellName: string) => {
    if (!isTvBroadcastEnabled) return;
    const sanitizedSpell = spellName.replace(/\s/g, '');
    const sanitizedHouse = userHouse.toLowerCase();
    const sanitizedPatronus = userPatronus.replace(/\s/g, '');
    const payload = `spell:${sanitizedSpell}:${sanitizedHouse}:${sanitizedPatronus}`;
    addLog('INFO', `Smart TV Broadcast (Simulated): ${payload}`);
  }, [isTvBroadcastEnabled, userHouse, userPatronus, addLog]);
  
  const handleHueSpell = React.useCallback((spellName: string) => {
    if (!isHueEnabled || !hueBridgeIp || !hueUsername || !hueLightId) return;
    let payload: object | null = null;
    const randomColor = `#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}`;
    switch (spellName) {
        case 'LUMOS': payload = { on: true, xy: hexToXy('#FFFFFF'), bri: 254 }; break;
        case 'NOX': payload = { on: false }; break;
        case 'INCENDIO': case 'VERMILLIOUS': payload = { on: true, xy: hexToXy('#FF4500') }; break;
        case 'AGUAMENTI': payload = { on: true, xy: hexToXy('#00FFFF') }; break;
        case 'VERDIMILLIOUS': payload = { on: true, xy: hexToXy('#00FF00') }; break;
        case 'COLOVARIA': payload = { on: true, xy: hexToXy(randomColor) }; break;
        default: return;
    }
    if (payload) {
        addLog('INFO', `Hue Integration (Simulated): PUT body: ${JSON.stringify(payload)}`);
    }
  }, [isHueEnabled, hueBridgeIp, hueUsername, hueLightId, addLog]);

  const handleDisconnect = React.useCallback(() => {
    if (!wandDetails) return;
    addLog('INFO', `Wand disconnected: ${wandDetails.bleName}`);
    addBleEvent('GATT', 'Disconnected');
    setWandConnectionState(ConnectionState.DISCONNECTED);
    setWandDetails(null);
    setWandBatteryLevel(null);
    clearKeepAlive();
    commandCharacteristic.current = null;
    setIsImuStreaming(false);
    setLatestImuData(null);
    setGestureState('Idle');
    setButtonState([false, false, false, false]);
    setRawWandProductInfo(null);
    setNegotiatedMtu(WBDLPayloads.MTU_PAYLOAD_SIZE);
    setClientSideGestureDetected(false);
    setWriteQueue([]);
    isWriting.current = false;
    setLiveEvent(null);
    if (liveEventTimeout.current) clearTimeout(liveEventTimeout.current);
  }, [addLog, clearKeepAlive, wandDetails, addBleEvent]);
  
  const handleBoxDisconnect = React.useCallback(() => {
    if (!boxDetails) return;
    addLog('INFO', `Wand Box disconnected: ${boxDetails.bleName}`);
    addBleEvent('GATT', 'Box Disconnected');
    setBoxConnectionState(ConnectionState.DISCONNECTED);
    setBoxDetails(null);
    setBoxBatteryLevel(null);
    setRawBoxProductInfo(null);
    boxCommandCharacteristic.current = null;
    setBoxWriteQueue([]);
    isBoxWriting.current = false;
  }, [addLog, boxDetails, addBleEvent]);

  const queueCommand = React.useCallback((payload: Uint8Array, silent: boolean = false) => {
    setWriteQueue(prev => [...prev, { payload, silent }]);
  }, []);

  const processWriteQueue = React.useCallback(async () => {
    if (isWriting.current || writeQueue.length === 0) return;
    isWriting.current = true;
    const itemToWrite = writeQueue[0];
    if (!commandCharacteristic.current) {
        isWriting.current = false; setWriteQueue([]); return;
    }
    try {
        await commandCharacteristic.current.writeValueWithResponse(itemToWrite.payload);
        if (!itemToWrite.silent) addLog('DATA_OUT', `Sent to Wand: ${bytesToHex(itemToWrite.payload)}`);
        setTimeout(() => { setWriteQueue(prev => prev.slice(1)); isWriting.current = false; }, commandDelay_ms);
    } catch (error) {
        addLog('ERROR', `Failed to write command: ${error}`); setWriteQueue([]); isWriting.current = false;
    }
  }, [writeQueue, addLog, commandDelay_ms]);

  React.useEffect(() => { if (wandConnectionState === ConnectionState.CONNECTED) processWriteQueue(); }, [writeQueue, wandConnectionState, processWriteQueue]);

  const queueBoxCommand = React.useCallback((payload: Uint8Array, silent: boolean = false) => {
    setBoxWriteQueue(prev => [...prev, { payload, silent }]);
  }, []);

  const processBoxWriteQueue = React.useCallback(async () => {
      if (isBoxWriting.current || boxWriteQueue.length === 0) return;
      isBoxWriting.current = true;
      const itemToWrite = boxWriteQueue[0];
      if (!boxCommandCharacteristic.current) {
          isBoxWriting.current = false; setBoxWriteQueue([]); return;
      }
      try {
          await boxCommandCharacteristic.current.writeValueWithResponse(itemToWrite.payload);
          if (!itemToWrite.silent) addLog('DATA_OUT', `Sent to Box: ${bytesToHex(itemToWrite.payload)}`);
          setTimeout(() => { setBoxWriteQueue(prev => prev.slice(1)); isBoxWriting.current = false; }, commandDelay_ms);
      } catch (error) {
          addLog('ERROR', `Failed to write box command: ${error}`); setBoxWriteQueue([]); isBoxWriting.current = false;
      }
  }, [boxWriteQueue, addLog, commandDelay_ms]);
  
  React.useEffect(() => { if (boxConnectionState === ConnectionState.CONNECTED) processBoxWriteQueue(); }, [boxWriteQueue, boxConnectionState, processBoxWriteQueue]);

  const handleProductInfoPacket = React.useCallback((data: Uint8Array, forDevice: 'wand' | 'box') => {
      const updater = forDevice === 'wand' ? setWandDetails : setBoxDetails;
      if (data.length < 3) return;
      const view = new DataView(data.buffer);
      const infoType = data[1];
      const valueBytes = data.slice(2);
      const partialDetails: Partial<WandDevice> = {};
      
      try {
          // ... (simplified for brevity, logic same as before) ...
          // Using a simple switch to set properties
          switch (infoType) {
              case 0x00: partialDetails.version = view.getUint32(2, true); break;
              case 0x01: partialDetails.serialNumber = view.getUint32(2, true); break;
              case 0x02: partialDetails.sku = textDecoder.decode(valueBytes).trim().replace(/\0/g, ''); break;
              case 0x03: partialDetails.mfgId = textDecoder.decode(valueBytes).trim().replace(/\0/g, ''); break;
              case 0x04: partialDetails.deviceID = textDecoder.decode(valueBytes).trim().replace(/\0/g, ''); break;
              case 0x05: partialDetails.edition = textDecoder.decode(valueBytes).trim().replace(/\0/g, ''); break;
              case 0x06: partialDetails.deco = textDecoder.decode(valueBytes).trim().replace(/\0/g, ''); break;
              case 0x08: if (valueBytes.length === 6) partialDetails.companionAddress = Array.from(valueBytes).reverse().map(b => b.toString(16).padStart(2, '0')).join(':').toUpperCase(); break;
              case 0x09: if (valueBytes.length === 1) partialDetails.wandType = WAND_TYPE_IDS[valueBytes[0]] || 'UNKNOWN'; break;
          }
          updater(prev => prev ? { ...prev, ...partialDetails } : prev);
      } catch (e) { addLog('ERROR', `Failed to parse Product Info: ${e}`); }
  }, [addLog]);

  const sendMacroSequence = React.useCallback((commands: MacroCommand[], target: 'wand' | 'box') => {
    const isWand = target === 'wand';
    const connectionState = isWand ? wandConnectionState : boxConnectionState;
    const char = isWand ? commandCharacteristic.current : boxCommandCharacteristic.current;
    const queueFn = isWand ? queueCommand : queueBoxCommand;
    const mtu = isWand ? negotiatedMtu : WBDLPayloads.MTU_PAYLOAD_SIZE;
    if (connectionState !== ConnectionState.CONNECTED || !char) return;
    const payload: number[] = [WBDLProtocol.CMD.MACRO_EXECUTE];
    commands.forEach(cmd => {
        const loops = cmd.loops ?? 1;
        for (let i = 0; i < loops; i++) {
            if (cmd.command === 'LightClear') payload.push(WBDLProtocol.INST.MACRO_LIGHT_CLEAR);
            else if (cmd.command === 'HapticBuzz') {
                const duration = cmd.duration ?? 100;
                payload.push(WBDLProtocol.CMD.HAPTIC_VIBRATE, duration & 0xFF, (duration >> 8) & 0xFF);
            } else if (cmd.command === 'MacroDelay') {
                const duration = cmd.duration ?? 100;
                payload.push(WBDLProtocol.INST.MACRO_DELAY, duration & 0xFF, (duration >> 8) & 0xFF);
            } else if (cmd.command === 'LightTransition') {
                const hex = cmd.color ?? '#ffffff';
                const mode = cmd.group ?? 0; 
                const duration = cmd.duration ?? 1000;
                const r = parseInt(hex.substring(1, 3), 16);
                const g = parseInt(hex.substring(3, 5), 16);
                const b = parseInt(hex.substring(5, 7), 16);
                payload.push(WBDLProtocol.INST.MACRO_LIGHT_TRANSITION, mode, r, g, b, duration & 0xFF, (duration >> 8) & 0xFF);
            }
        }
    });
    const finalPayload = new Uint8Array(payload);
    if (finalPayload.length > mtu) {
        for (let i = 0; i < finalPayload.length; i += mtu) queueFn(finalPayload.slice(i, i + negotiatedMtu));
    } else queueFn(finalPayload);
  }, [wandConnectionState, boxConnectionState, queueCommand, queueBoxCommand, negotiatedMtu]);

  const reactToSpellOnBoxFromWand = React.useCallback((spellName: string) => {
    if (boxConnectionState !== ConnectionState.CONNECTED) return;
    const details = masterSpellLibrary[spellName.toUpperCase()];
    const macros = details?.config_wandbox?.macros_payoff;
    if (!macros || macros.length === 0) return;
    const nextIndex = ((macroIndexes.current['BOX'] ?? -1) + 1) % macros.length;
    macroIndexes.current['BOX'] = nextIndex;
    sendMacroSequence(macros[nextIndex], 'box');
  }, [boxConnectionState, sendMacroSequence, masterSpellLibrary]);

  const parseStreamData = React.useCallback((event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    const value = target.value;
    if (!value) return;
    const data = new Uint8Array(value.buffer);
    if (isImuStreaming) {
        const imuReadings = parseImuPacket(data);
        if (imuReadings.length > 0) {
            setLatestImuData(imuReadings);
            if (isClientSideGestureDetectionEnabled && gestureState === 'Idle' && !clientSideGestureDetected) {
                for (const reading of imuReadings) {
                    const { x, y, z } = reading.acceleration;
                    const valX: number = x ? Number(x) : 0;
                    const valY: number = y ? Number(y) : 0;
                    const valZ: number = z ? Number(z) : 0;
                    const magnitude = Math.sqrt(valX * valX + valY * valY + valZ * valZ);
                    if (magnitude > gestureThreshold) { setClientSideGestureDetected(true); break; }
                }
            }
        }
        return;
    }
    if (data[0] === WBDLProtocol.INCOMING_OPCODE.BUTTON_STATE_UPDATE && data.length === 2) {
        const mask = data[1];
        setButtonState([(mask & 1)!==0, (mask & 2)!==0, (mask & 4)!==0, (mask & 8)!==0]);
        return;
    }
    if (data[0] === WBDLProtocol.INCOMING_OPCODE.GESTURE_EVENT) {
        if (data[1] === 0x01) {
            setGestureState('Casting');
            if (liveEventTimeout.current) clearTimeout(liveEventTimeout.current);
            setLiveEvent({ message: "Gesture Started...", type: 'info' });
            queueCommand(WBDLPayloads.MACRO_READY_TO_CAST_CMD);
        } else if (data[1] === 0x00) {
            setGestureState('Processing');
            setClientSideGestureDetected(false);
            if (liveEventTimeout.current) clearTimeout(liveEventTimeout.current);
            setLiveEvent({ message: 'Gesture Stopped...', type: 'processing' });
        }
        return;
    }
    if (data[0] === 0x24) { // Spell
        const spellLength = data[3];
        if (data.length < 4 || spellLength === 0) { setGestureState('Idle'); return; }
        try {
            const rawName = textDecoder.decode(data.slice(4, 4 + spellLength)).trim();
            if (!/[a-zA-Z]/.test(rawName)) { setGestureState('Idle'); return; }
            const finalName = rawName.toUpperCase(); // Simplified normalization
            
            if (liveEventTimeout.current) clearTimeout(liveEventTimeout.current);
            setLiveEvent({ message: `Spell Decoded: ${finalName}`, type: 'success' });
            liveEventTimeout.current = window.setTimeout(() => setLiveEvent(null), 4000);
            
            addLog('SUCCESS', `SPELL DETECTED: ${finalName}`);
            setLastSpell({ name: finalName });
            if (boxConnectionState === ConnectionState.CONNECTED) reactToSpellOnBoxFromWand(finalName);
            setGestureState('Idle');
            sendTvBroadcast(finalName);
            handleHueSpell(finalName);
            setSpellBook(prev => prev.some(s => s.name === finalName) ? prev : [...prev, { name: finalName, firstSeen: new Date().toISOString() }]);
            setCastingHistory(prev => [{ id: castingHistoryCounter.current++, name: finalName, timestamp: getTimestamp() }, ...prev].slice(0, 100));
        } catch (e) { setGestureState('Idle'); }
    }
  }, [addLog, isImuStreaming, queueCommand, sendTvBroadcast, handleHueSpell, isClientSideGestureDetectionEnabled, gestureState, clientSideGestureDetected, gestureThreshold, boxConnectionState, reactToSpellOnBoxFromWand]);
  
  const parseControlData = React.useCallback((event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    const value = target.value;
    if (!value) return;
    const data = new Uint8Array(value.buffer);
    if (data.length > 0 && data[0] === WBDLProtocol.INCOMING_OPCODE.PRODUCT_INFO_RESPONSE) {
      setRawWandProductInfo(prev => `${prev ? prev + '\n' : ''}${getTimestamp()}: ${bytesToHex(data)}`);
      handleProductInfoPacket(data, 'wand');
      return;
    }
    if (data.length === 7 && data[0] === WBDLProtocol.INCOMING_OPCODE.BOX_ADDRESS_RESPONSE) {
        setWandDetails(prev => prev ? { ...prev, companionAddress: Array.from(data.slice(1)).reverse().map(b => b.toString(16).padStart(2, '0')).join(':').toUpperCase() } : prev);
        return;
    }
    if (data.length === 4 && data[0] === WBDLProtocol.INCOMING_OPCODE.BUTTON_THRESHOLD_RESPONSE) {
        setButtonThresholds(prev => { const n = [...prev]; n[data[1]] = { min: data[2], max: data[3] }; return n; });
        return;
    }
    try {
        const text = textDecoder.decode(data);
        if (text.includes("MCW")) setWandDetails(prev => prev ? { ...prev, firmware: text.trim() } : prev);
    } catch (e) {}
    if (data.length > 0) {
        setDetectedOpCodes(prev => prev.has(data[0]) ? prev : new Set(prev).add(data[0]));
        setRawPacketLog(prev => [{ id: rawPacketLogCounter.current++, timestamp: getTimestamp(), hexData: bytesToHex(data) }, ...prev].slice(0, 100));
    }
  }, [handleProductInfoPacket]);
  
  const parseBoxData = React.useCallback((event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    const value = target.value;
    if (!value) return;
    const data = new Uint8Array(value.buffer);
    if (data.length > 0) {
        if (data[0] === 0x00) {
            try { setBoxDetails(prev => prev ? { ...prev, firmware: textDecoder.decode(data.slice(1)).trim() } : prev); } catch(e){}
        } else if (data[0] === WBDLProtocol.INCOMING_OPCODE.PRODUCT_INFO_RESPONSE) {
             setRawBoxProductInfo(prev => `${prev ? prev + '\n' : ''}${getTimestamp()}: ${bytesToHex(data)}`);
             handleProductInfoPacket(data, 'box');
        }
        setDetectedOpCodes(prev => prev.has(data[0]) ? prev : new Set(prev).add(data[0]));
        setRawPacketLog(prev => [{ id: rawPacketLogCounter.current++, timestamp: getTimestamp(), hexData: bytesToHex(data) }, ...prev].slice(0, 100));
    }
  }, [handleProductInfoPacket]);

  const handleBatteryLevel = React.useCallback((event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    const value = target.value;
    if (value) setWandBatteryLevel(value.getUint8(0));
  }, []);
  
  const handleBoxBatteryLevel = React.useCallback((event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    const value = target.value;
    if (value) setBoxBatteryLevel(value.getUint8(0));
  }, []);

  const createInitialDevice = (bleDevice: BluetoothDevice, type: WandDeviceType): WandDevice => ({
    device: bleDevice, deviceType: type, address: bleDevice.id.toUpperCase(), bleName: bleDevice.name ?? 'Unknown',
    wandType: 'UNKNOWN', companionAddress: null, version: null, firmware: null, serialNumber: null, editionNumber: null, sku: null, mfgId: null, deviceID: null, edition: null, deco: null,
  });

  const connectToWand = React.useCallback(async () => {
    if (!navigator.bluetooth) { setWandConnectionState(ConnectionState.ERROR); return; }
    setWandConnectionState(ConnectionState.CONNECTING);
    try {
      const bleDevice = await navigator.bluetooth.requestDevice({ filters: [{ namePrefix: WBDLProtocol.TARGET_NAME }], optionalServices: [WBDLProtocol.SERVICE_UUID_WAND_CONTROL, WBDLProtocol.SERVICE_UUID_BATTERY] });
      setWandDetails(createInitialDevice(bleDevice, 'WAND'));
      bleDevice.addEventListener('gattserverdisconnected', () => handleDisconnect());
      const server = await bleDevice.gatt?.connect();
      if (!server) throw new Error("GATT Server not found");

      // FIX: Ensure mtu is treated as a number to avoid arithmetic type errors by using implicit casting via accessing property or default.
      // Using `as any` to bypass potentially strict type checks if `BluetoothRemoteGATTServer` type definition is missing `mtu`.
      const gattServerAny = server as any;
      if (gattServerAny.mtu) {
          const currentMtu = gattServerAny.mtu as number;
          const newMtu = currentMtu - 3;
          setNegotiatedMtu(newMtu);
          addLog('SUCCESS', `Negotiated MTU size: ${newMtu}`);
      }

      const service = await server.getPrimaryService(WBDLProtocol.SERVICE_UUID_WAND_CONTROL);
      const batteryService = await server.getPrimaryService(WBDLProtocol.SERVICE_UUID_BATTERY);
      const commandChar = await service.getCharacteristic(WBDLProtocol.CHAR_UUID_WAND_COMM_CHANNEL_1);
      commandCharacteristic.current = commandChar;
      const streamChar = await service.getCharacteristic(WBDLProtocol.CHAR_UUID_WAND_COMM_CHANNEL_2);
      const batteryChar = await batteryService.getCharacteristic(WBDLProtocol.CHAR_UUID_BATTERY_LEVEL_NOTIFY);

      if (commandChar.properties.notify) { await commandChar.startNotifications(); commandChar.addEventListener('characteristicvaluechanged', parseControlData); }
      if (streamChar.properties.notify) { await streamChar.startNotifications(); streamChar.addEventListener('characteristicvaluechanged', parseStreamData); }
      if (batteryChar.properties.notify) { await batteryChar.startNotifications(); batteryChar.addEventListener('characteristicvaluechanged', handleBatteryLevel); }

      setWandConnectionState(ConnectionState.CONNECTED);
      queueCommand(WBDLPayloads.WAND_CONNECTION_SUCCESS_CMD);
      queueCommand(WBDLPayloads.FIRMWARE_REQUEST_CMD);
      queueCommand(WBDLPayloads.PRODUCT_INFO_REQUEST_CMD);
      
      if (batteryChar.properties.read) {
        const initialBatteryLevel = await batteryChar.readValue();
        setWandBatteryLevel(initialBatteryLevel.getUint8(0));
      }
      keepAliveInterval.current = window.setInterval(() => { queueCommand(WBDLPayloads.KEEPALIVE_COMMAND, true); }, 5000);
    } catch (error) { setWandConnectionState(ConnectionState.ERROR); setWandDetails(null); }
  }, [handleDisconnect, parseControlData, parseStreamData, handleBatteryLevel, queueCommand, addLog]);

  const connectToBox = React.useCallback(async () => {
    if (!navigator.bluetooth) { setBoxConnectionState(ConnectionState.ERROR); return; }
    setBoxConnectionState(ConnectionState.CONNECTING);
    try {
      const bleDevice = await navigator.bluetooth.requestDevice({ filters: [{ namePrefix: WBDLProtocol.WAND_BOX.TARGET_NAME }], optionalServices: [WBDLProtocol.WAND_BOX.SERVICE_UUID_MAIN, WBDLProtocol.WAND_BOX.SERVICE_UUID_BATTERY] });
      setBoxDetails(createInitialDevice(bleDevice, 'BOX'));
      bleDevice.addEventListener('gattserverdisconnected', () => handleBoxDisconnect());
      const server = await bleDevice.gatt?.connect();
      if (!server) throw new Error("GATT Server not found");
      
      const service = await server.getPrimaryService(WBDLProtocol.WAND_BOX.SERVICE_UUID_MAIN);
      const batteryService = await server.getPrimaryService(WBDLProtocol.WAND_BOX.SERVICE_UUID_BATTERY);
      const commChar = await service.getCharacteristic(WBDLProtocol.WAND_BOX.CHAR_UUID_COMM);
      boxCommandCharacteristic.current = commChar;
      const notifyChar = await service.getCharacteristic(WBDLProtocol.WAND_BOX.CHAR_UUID_NOTIFY);
      const batteryChar = await batteryService.getCharacteristic(WBDLProtocol.WAND_BOX.CHAR_UUID_BATTERY_LEVEL);
      
      if (notifyChar.properties.notify) { await notifyChar.startNotifications(); notifyChar.addEventListener('characteristicvaluechanged', parseBoxData); }
      if (batteryChar.properties.notify) { await batteryChar.startNotifications(); batteryChar.addEventListener('characteristicvaluechanged', handleBoxBatteryLevel); }
      if (batteryChar.properties.read) { const initialBattery = await batteryChar.readValue(); setBoxBatteryLevel(initialBattery.getUint8(0)); }

      setBoxConnectionState(ConnectionState.CONNECTED);
      queueBoxCommand(WBDLPayloads.BOX_CONNECTION_SUCCESS_CMD);
      queueBoxCommand(WBDLPayloads.FIRMWARE_REQUEST_CMD);
      queueBoxCommand(WBDLPayloads.PRODUCT_INFO_REQUEST_CMD);
    } catch (error) { setBoxConnectionState(ConnectionState.ERROR); setBoxDetails(null); }
  }, [handleBoxDisconnect, parseBoxData, queueBoxCommand, handleBoxBatteryLevel]);

  // ... [Vfx Editor functions omitted for brevity as they are unchanged] ...
  const addVfxCommand = (type: VfxCommandType) => {
    let params: VfxCommand['params'] = {};
    if (type === 'LightTransition') params = { hex_color: '#ffffff', mode: 0, transition_ms: 1000 };
    else if (type === 'HapticBuzz' || type === 'MacroDelay') params = { duration_ms: 500 };
    else if (type === 'LoopEnd') params = { loops: 2 };
    setVfxSequence([...vfxSequence, { id: commandIdCounter.current++, type, params }]);
  };
  const updateVfxCommand = (id: number, updatedParams: VfxCommand['params']) => setVfxSequence(vfxSequence.map(cmd => cmd.id === id ? { ...cmd, params: { ...cmd.params, ...updatedParams } } : cmd));
  const removeVfxCommand = (id: number) => setVfxSequence(vfxSequence.filter(cmd => cmd.id !== id));
  const handleSaveNewVfxSequence = React.useCallback(() => {
    const name = prompt('Name:'); if (name) { setSavedVfxSequences(prev => ({ ...prev, [name.trim()]: vfxSequence })); }
  }, [vfxSequence]);
  const handleLoadVfxSequence = React.useCallback((name: string) => {
    if (savedVfxSequences[name]) {
        let currentId = commandIdCounter.current;
        setVfxSequence(savedVfxSequences[name].map(cmd => ({...cmd, id: currentId++})));
        commandIdCounter.current = currentId;
    }
  }, [savedVfxSequences]);
  const handleDeleteVfxSequence = React.useCallback((name: string) => {
    if (window.confirm(`Delete "${name}"?`)) setSavedVfxSequences(prev => { const n = { ...prev }; delete n[name]; return n; });
  }, []);
  const sendVfxSequence = React.useCallback(() => {
    if (wandConnectionState !== ConnectionState.CONNECTED) return;
    const payload: number[] = [WBDLProtocol.CMD.MACRO_EXECUTE];
    vfxSequence.forEach(cmd => {
      switch (cmd.type) {
        case 'LightClear': payload.push(WBDLProtocol.INST.MACRO_LIGHT_CLEAR); break;
        case 'HapticBuzz': payload.push(WBDLProtocol.CMD.HAPTIC_VIBRATE, (cmd.params.duration_ms ?? 100) & 0xFF, ((cmd.params.duration_ms ?? 100) >> 8) & 0xFF); break;
        case 'MacroDelay': payload.push(WBDLProtocol.INST.MACRO_DELAY, (cmd.params.duration_ms ?? 100) & 0xFF, ((cmd.params.duration_ms ?? 100) >> 8) & 0xFF); break;
        case 'LightTransition': 
            const r = parseInt((cmd.params.hex_color ?? '#ffffff').substring(1, 3), 16);
            const g = parseInt((cmd.params.hex_color ?? '#ffffff').substring(3, 5), 16);
            const b = parseInt((cmd.params.hex_color ?? '#ffffff').substring(5, 7), 16);
            payload.push(WBDLProtocol.INST.MACRO_LIGHT_TRANSITION, cmd.params.mode ?? 0, r, g, b, (cmd.params.transition_ms ?? 1000) & 0xFF, ((cmd.params.transition_ms ?? 1000) >> 8) & 0xFF);
            break;
        case 'LoopStart': payload.push(WBDLProtocol.INST.MACRO_LOOP_START); break;
        case 'LoopEnd': payload.push(WBDLProtocol.INST.MACRO_SET_LOOPS, cmd.params.loops ?? 2); break;
      }
    });
    const finalPayload = new Uint8Array(payload);
    if (finalPayload.length > negotiatedMtu) { for (let i = 0; i < finalPayload.length; i += negotiatedMtu) queueCommand(finalPayload.slice(i, i + negotiatedMtu)); }
    else queueCommand(finalPayload);
  }, [vfxSequence, wandConnectionState, queueCommand, negotiatedMtu]);

  const toggleImuStream = () => {
    if (wandConnectionState !== ConnectionState.CONNECTED) return;
    if (isImuStreaming) { queueCommand(WBDLPayloads.IMU_STOP_STREAM_CMD); setIsImuStreaming(false); setLatestImuData(null); }
    else { queueCommand(WBDLPayloads.IMU_START_STREAM_CMD); setIsImuStreaming(true); }
  };
  
  const handleImuCalibrate = React.useCallback(() => {
    if (wandConnectionState === ConnectionState.CONNECTED) { queueCommand(WBDLPayloads.FACTORY_UNLOCK_CMD); queueCommand(WBDLPayloads.IMU_CALIBRATE_CMD); }
  }, [wandConnectionState, queueCommand]);
  
  const sendButtonThresholds = React.useCallback((wandType: WandType) => {
    if (wandConnectionState !== ConnectionState.CONNECTED) return;
    const t = WAND_THRESHOLDS[wandType];
    if (t) queueCommand(new Uint8Array([WBDLProtocol.CMD.SET_BUTTON_THRESHOLD, t[0].min, t[0].max, t[1].min, t[1].max, t[2].min, t[2].max, t[3].min, t[3].max]));
  }, [wandConnectionState, queueCommand]);
  
  const handleReadButtonThresholds = React.useCallback(() => {
    if (wandConnectionState === ConnectionState.CONNECTED) for (let i = 0; i < 4; i++) queueCommand(new Uint8Array([WBDLProtocol.CMD.READ_BUTTON_THRESHOLD, i]));
  }, [wandConnectionState, queueCommand]);

  React.useEffect(() => { if (wandDetails?.wandType && wandDetails.wandType !== 'UNKNOWN') sendButtonThresholds(wandDetails.wandType); }, [wandDetails?.wandType, sendButtonThresholds]);

  const startBleExplorerScan = React.useCallback(async () => {
      if (!navigator.bluetooth) return;
      setIsExploring(true); setExplorerDevice(null); setExplorerServices([]);
      try {
          const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
          setExplorerDevice(device);
          const server = await device.gatt?.connect();
          if (server) {
              const services = await server.getPrimaryServices();
              const discoveredServices = [];
              for (const service of services) {
                  try { const characteristics = await service.getCharacteristics(); discoveredServices.push({ uuid: service.uuid, characteristics: characteristics.map(c => ({ uuid: c.uuid, properties: c.properties })) }); } catch(e){}
              }
              setExplorerServices(discoveredServices);
          }
      } catch (error) {} finally { setIsExploring(false); }
  }, []);
  
  const castSpellOnWand = React.useCallback((spellDetails: SpellDetails | null) => {
    if (wandConnectionState !== ConnectionState.CONNECTED || !spellDetails?.config_wand?.macros_payoff?.length) return;
    const nextIndex = ((macroIndexes.current['WAND'] ?? -1) + 1) % spellDetails.config_wand.macros_payoff.length;
    macroIndexes.current['WAND'] = nextIndex;
    sendMacroSequence(spellDetails.config_wand.macros_payoff[nextIndex], 'wand');
  }, [wandConnectionState, sendMacroSequence]);

  const reactToSpellOnBoxFromUI = React.useCallback((spellDetails: SpellDetails | null) => {
    if (boxConnectionState !== ConnectionState.CONNECTED || !spellDetails?.config_wandbox?.macros_payoff?.length) return;
    const nextIndex = ((macroIndexes.current['BOX'] ?? -1) + 1) % spellDetails.config_wandbox.macros_payoff.length;
    macroIndexes.current['BOX'] = nextIndex;
    sendMacroSequence(spellDetails.config_wandbox.macros_payoff[nextIndex], 'box');
  }, [boxConnectionState, sendMacroSequence]);

  const handleSelectCompendiumSpell = (spellName: string) => {
    const details = masterSpellLibrary[spellName.toUpperCase()];
    if (details) { setCompendiumSpellDetails(details); setSelectedCompendiumSpell(spellName); setIsCompendiumModalOpen(true); }
  };

  const handleFinishTutorial = React.useCallback(() => { localStorage.setItem(LOCAL_STORAGE_KEY_TUTORIAL, 'true'); setShowTutorial(false); }, []);
  const handleResetTutorial = React.useCallback(() => { localStorage.removeItem(LOCAL_STORAGE_KEY_TUTORIAL); setShowTutorial(true); }, []);
  
  const handleUnlockAllSpells = React.useCallback(() => {
    const discoveredNames = new Set(spellBook.map(s => s.name));
    const spellsToUnlock = SPELL_LIST.filter(name => !discoveredNames.has(name)).map(name => ({ name, firstSeen: new Date().toISOString() }));
    if (spellsToUnlock.length > 0) setSpellBook(prevBook => [...prevBook, ...spellsToUnlock]);
  }, [spellBook]);
  
  const handleSendBoxTestMacro = React.useCallback(() => {
    sendMacroSequence([{ command: 'LightTransition', color: '#0000FF', duration: 500, group: 0 }, { command: 'MacroDelay', duration: 200 }, { command: 'LightTransition', color: '#000000', duration: 500, group: 0 }], 'box');
  }, [sendMacroSequence]);

  const handleRequestBoxAddress = React.useCallback(() => {
    if (wandConnectionState === ConnectionState.CONNECTED) queueCommand(WBDLPayloads.BOX_ADDRESS_REQUEST_CMD);
  }, [wandConnectionState, queueCommand]);

  const handleSaveSpell = React.useCallback((key: string, data: SpellDetails) => {
    setCustomSpells(prev => { const n = { ...prev, [key]: data }; try { localStorage.setItem(LOCAL_STORAGE_KEY_CUSTOM_SPELLS, JSON.stringify(n)); } catch(e){} return n; });
  }, []);

  const handleDeleteSpell = React.useCallback((key: string) => {
    setCustomSpells(prev => { const n = { ...prev }; delete n[key]; try { localStorage.setItem(LOCAL_STORAGE_KEY_CUSTOM_SPELLS, JSON.stringify(n)); } catch(e){} return n; });
  }, []);

  const testEditorMacro = React.useCallback((macro: MacroCommand[], target: 'wand' | 'box') => sendMacroSequence(macro, target), [sendMacroSequence]);

  const renderTab = () => {
    switch (activeTab) {
      case 'control_hub': return <ControlHub lastSpell={lastSpell?.name || ''} gestureState={gestureState} clientSideGestureDetected={clientSideGestureDetected} spellDetails={spellDetails} vfxSequence={vfxSequence} addVfxCommand={addVfxCommand} updateVfxCommand={updateVfxCommand} removeVfxCommand={removeVfxCommand} sendVfxSequence={sendVfxSequence} saveVfxSequence={handleSaveNewVfxSequence} wandConnectionState={wandConnectionState} boxConnectionState={boxConnectionState} liveEvent={liveEvent} castingHistory={castingHistory} onCastOnWand={castSpellOnWand} onCastOnBox={reactToSpellOnBoxFromUI} savedVfxSequences={savedVfxSequences} loadVfxSequence={handleLoadVfxSequence} deleteVfxSequence={handleDeleteVfxSequence} />;
      case 'device_manager': return <DeviceManager wandConnectionState={wandConnectionState} boxConnectionState={boxConnectionState} wandDetails={wandDetails} boxDetails={boxDetails} wandBatteryLevel={wandBatteryLevel} boxBatteryLevel={boxBatteryLevel} onConnectWand={() => { setDeviceToScan('wand'); setIsScannerOpen(true); }} onConnectBox={() => { setDeviceToScan('box'); setIsScannerOpen(true); }} rawWandProductInfo={rawWandProductInfo} rawBoxProductInfo={rawBoxProductInfo} isTvBroadcastEnabled={isTvBroadcastEnabled} setIsTvBroadcastEnabled={setIsTvBroadcastEnabled} userHouse={userHouse} setUserHouse={setUserHouse} userPatronus={userPatronus} setUserPatronus={setUserPatronus} isHueEnabled={isHueEnabled} setIsHueEnabled={setIsHueEnabled} hueBridgeIp={hueBridgeIp} setHueBridgeIp={setHueBridgeIp} hueUsername={hueUsername} setHueUsername={setHueUsername} hueLightId={hueLightId} setHueLightId={setHueLightId} saveHueSettings={saveHueSettings} negotiatedMtu={negotiatedMtu} commandDelay_ms={commandDelay_ms} setCommandDelay_ms={setCommandDelay_ms} onResetTutorial={handleResetTutorial} onSendBoxTestMacro={handleSendBoxTestMacro} onRequestBoxAddress={handleRequestBoxAddress} />;
      case 'diagnostics': return <Diagnostics detectedOpCodes={detectedOpCodes} rawPacketLog={rawPacketLog} bleEventLog={bleEventLog} isImuStreaming={isImuStreaming} toggleImuStream={toggleImuStream} handleImuCalibrate={handleImuCalibrate} latestImuData={latestImuData} buttonState={buttonState} isClientSideGestureDetectionEnabled={isClientSideGestureDetectionEnabled} setIsClientSideGestureDetectionEnabled={setIsClientSideGestureDetectionEnabled} gestureThreshold={gestureThreshold} setGestureThreshold={setGestureThreshold} clientSideGestureDetected={clientSideGestureDetected} buttonThresholds={buttonThresholds} handleReadButtonThresholds={handleReadButtonThresholds} wandConnectionState={wandConnectionState} queueCommand={queueCommand} />;
      case 'compendium': return <SpellCompendium spellBook={spellBook} castingHistory={castingHistory} onSelectSpell={handleSelectCompendiumSpell} onUnlockAll={handleUnlockAllSpells} />;
      case 'explorer': return <BleExplorer onScan={startBleExplorerScan} isExploring={isExploring} device={explorerDevice} services={explorerServices} />;
      case 'scripter': return <Scripter addLog={addLog} />;
      case 'wizarding_class': return <WizardingClass isImuStreaming={isImuStreaming} toggleImuStream={toggleImuStream} latestImuData={latestImuData} isWandConnected={wandConnectionState === ConnectionState.CONNECTED} isBoxConnected={boxConnectionState === ConnectionState.CONNECTED} queueCommand={queueCommand} queueBoxCommand={queueBoxCommand} />;
      case 'spell_editor': return <SpellEditor spells={masterSpellLibrary} onSave={handleSaveSpell} onDelete={handleDeleteSpell} wandConnected={wandConnectionState === ConnectionState.CONNECTED} boxConnected={boxConnectionState === ConnectionState.CONNECTED} testMacro={testEditorMacro} />;
      default: return null;
    }
  }

  const handleScanRequest = () => {
    if (deviceToScan === 'wand') connectToWand();
    else if (deviceToScan === 'box') connectToBox();
  };

  return (
    <div className="min-h-screen flex flex-col p-4 bg-slate-900 text-slate-200 gap-4">
      {showTutorial && <TutorialModal onFinish={handleFinishTutorial} />}
      {isScannerOpen && (
        <Modal title={`Scan for ${deviceToScan === 'wand' ? 'Wand' : 'Wand Box'}`} onClose={() => setIsScannerOpen(false)}>
          <div className="text-center p-8">
            <ScanIcon />
            <h3 className="text-xl font-semibold mb-2">Ready to Connect</h3>
            <p className="text-slate-400 mb-6">Click the button below to open your browser's Bluetooth device picker.</p>
            <button onClick={handleScanRequest} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg shadow-lg">Scan for Devices</button>
          </div>
        </Modal>
      )}
      {isCompendiumModalOpen && selectedCompendiumSpell && (
        <Modal title={`Spell Compendium: ${selectedCompendiumSpell.replace(/_/g, ' ')}`} onClose={() => { setIsCompendiumModalOpen(false); setSelectedCompendiumSpell(null); }}>
          <SpellDetailsCard spellDetails={compendiumSpellDetails} onCastOnWand={castSpellOnWand} onCastOnBox={reactToSpellOnBoxFromUI} isWandConnected={wandConnectionState === ConnectionState.CONNECTED} isBoxConnected={boxConnectionState === ConnectionState.CONNECTED} />
        </Modal>
      )}
      <header className="flex-shrink-0"><h1 className="text-3xl font-bold text-center mb-1 text-slate-100">Magic Wand BLE Controller</h1><p className="text-center text-slate-400 text-sm">Reverse Engineering & Control Hub</p></header>
      <main className="flex-grow flex flex-col md:flex-row gap-4 overflow-hidden">
        <div className="flex-shrink-0 md:w-1/4 flex flex-col gap-4">
            <div className="flex-shrink-0 bg-slate-800 p-4 rounded-lg border border-slate-700">
                <h2 className="text-lg font-semibold mb-3">Navigation</h2>
                <div className="flex flex-col gap-2">
                    {['control_hub', 'device_manager', 'diagnostics', 'spell_editor', 'compendium', 'explorer', 'scripter', 'wizarding_class'].map(tab => (
                        <TabButton key={tab} Icon={tab==='control_hub'?MagicWandIcon:tab==='device_manager'?CubeIcon:tab==='diagnostics'?ChartBarIcon:tab==='spell_editor'?PencilAltIcon:tab==='compendium'?DocumentSearchIcon:tab==='explorer'?SearchCircleIcon:tab==='scripter'?CodeIcon:BookOpenIcon} label={tab.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} onClick={() => setActiveTab(tab as any)} isActive={activeTab === tab} />
                    ))}
                </div>
            </div>
            <div className="flex-grow min-h-0"><SpellBook spellBook={spellBook} discoveredSpells={discoveredSpells} discoveredCount={discoveredSpells.size} totalCount={SPELL_LIST.length} spellFilter={spellFilter} setSpellFilter={setSpellFilter} castingHistory={castingHistory} /></div>
        </div>
        <div className="flex-grow bg-slate-800 p-4 rounded-lg border border-slate-700 min-w-0 min-h-0">{renderTab()}</div>
        <div className="flex-shrink-0 md:w-1/3 flex flex-col gap-4"><div className="bg-slate-800 p-4 rounded-lg border border-slate-700 flex-grow"><h2 className="text-lg font-semibold mb-2">Logs</h2><LogView logs={logs} /></div></div>
      </main>
    </div>
  );
}