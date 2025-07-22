import { useState, useEffect, useRef } from 'react';
// The main 'React' import was removed from the line above to fix the build error.
import type { FC } from 'react';
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth } from './firebase';

// --- TYPE DEFINITIONS for TypeScript ---
interface Project { name: string; abbr: string; }
interface BrandData { abbr:string; projects: Project[]; }
interface HierarchyData { [clientName: string]: { abbr: string; brands: { [brandName: string]: BrandData; }; }; }
interface ListData { name: string; abbr: string; }
interface Preset { name: string; values: { selectedClient: string; selectedBrand: string; selectedProject: string; selectedMedium: string; selectedMaterial: string; sizeWidth: string; sizeHeight: string; sizeUnit: string; customTextParts: string[]; }; }

// --- CONFIGURATION & TEXTS (in Spanish) ---
const TEXTS = {
  TITLE: 'Generador de Nomenclatura',
  CLIENT: 'Cliente',
  BRAND: 'Marca',
  PROJECT: 'Proyecto',
  MEDIUM: 'Medio',
  MATERIAL: 'Material',
  SIZE: 'Medidas',
  SIZE_WIDTH: 'Ancho',
  SIZE_HEIGHT: 'Alto',
  SIZE_UNIT: 'Unidad',
  VARIABLE: 'Variable',
  VARIABLE_EXAMPLE: 'Ej: editable, v2, en curvas, RGB, collect',
  PRESETS_TITLE: 'Presets',
  PRESETS_LOAD: 'Cargar Preset',
  PRESETS_SAVE: 'Guardar Preset Actual',
  PRESETS_SAVE_PLACEHOLDER: 'Nombre del nuevo preset',
  PRESETS_SAVE_BUTTON: 'Guardar',
  OUTPUT_TITLE: 'NOMBRE GENERADO',
  OUTPUT_PLACEHOLDER: '...',
  BUTTON_COPY: 'Copiar',
  STATUS_COPIED: '¡Copiado!',
  STATUS_FAILED: '¡Error al copiar!',
  SELECT_PLACEHOLDER: '-- Seleccionar --',
  SEARCH_PLACEHOLDER: 'Buscar...',
  NO_RESULTS: 'No hay resultados',
  LOADING: 'Cargando datos...',
  ERROR_LOADING: 'Error al cargar los datos. Revisa la URL de la hoja de cálculo y los permisos.',
  CHAR_LIMIT_WARNING_PREFIX: 'El nombre del archivo (',
  CHAR_LIMIT_WARNING_SUFFIX: ' caracteres) excede el límite recomendado.',
  LOGIN_TITLE: 'Acceso Restringido',
  LOGIN_PROMPT: 'Por favor, ingresa para continuar.',
  LOGIN_BUTTON: 'Ingresar con Google',
  LOGOUT_BUTTON: 'Cerrar Sesión',
  ACCESS_DENIED_TITLE: 'Acceso Denegado',
  ACCESS_DENIED_MESSAGE: 'No tienes permiso para usar esta herramienta.',
  AUTH_LOADING: 'Verificando...',
};

const GOOGLE_SHEET_ID = '1CofaP4ZhFqFBVAktX6MN48oa75YyEHDW4d8zobx3Az0';
const SHEET_NAMES = { HIERARCHY: 'Client-Brand-Project', MEDIUM: 'Mediums', MATERIAL: 'Materials', };
const LOGO_URL = '/logo.png';
const MAX_FILENAME_LENGTH = 220;
const ALLOWED_DOMAIN = '@bake.mx';

const buildSheetUrl = (sheetName: string): string => `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;

// --- DATA PARSING HELPERS ---
const parseHierarchyData = (csv: string): HierarchyData => {
  const data: HierarchyData = {};
  const rows = csv.trim().split(/\r?\n/).slice(1);
  rows.filter(row => row.trim() && !row.trim().startsWith('"#')).forEach(row => {
    const cols = (row.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || []).map(c => c.trim().replace(/^"|"$/g, ''));
    const [clientName, clientAbbr, brandName, brandAbbr, projName, projAbbr] = cols;
    if (!clientName) return;
    if (!data[clientName]) data[clientName] = { abbr: clientAbbr || clientName, brands: {} };
    if (brandName && !data[clientName].brands[brandName]) data[clientName].brands[brandName] = { abbr: brandAbbr || brandName, projects: [] };
    if (projName && projName.toUpperCase() !== 'N/A' && brandName) {
        data[clientName].brands[brandName].projects.push({ name: projName, abbr: projAbbr || projName });
    }
  });
  return data;
};
const parseListData = (csv: string): ListData[] => {
  const rows = csv.trim().split(/\r?\n/).slice(1);
  return rows.filter(row => row.trim() && !row.trim().startsWith('"#')).map(row => {
    const cols = (row.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || []).map(c => c.trim().replace(/^"|"$/g, ''));
    const [name, abbr] = cols;
    return { name: name || '', abbr: abbr || name || '' };
  }).filter(item => item.name);
};

// --- REUSABLE UI COMPONENTS ---
interface SearchableDropdownProps { options: (string | Project | ListData)[]; value: string; onChange: (value: string) => void; placeholder: string; label: string; disabled?: boolean; }
const SearchableDropdown: FC<SearchableDropdownProps> = ({ options, value, onChange, placeholder, label, disabled = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isObjectArray = options.length > 0 && typeof options[0] === 'object';
  const getOptionName = (option: string | Project | ListData) => isObjectArray ? (option as Project | ListData).name : (option as string);
  const filteredOptions = options.filter(option => getOptionName(option).toLowerCase().includes(searchTerm.toLowerCase()));

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (option: string | Project | ListData) => {
    onChange(getOptionName(option));
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div ref={dropdownRef} className="relative w-full">
      <label className="mb-2 text-sm font-medium text-gray-500">{label}</label>
      <button type="button" disabled={disabled} onClick={() => setIsOpen(!isOpen)} className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5 text-left text-gray-800 focus:ring-[#eb1564] focus:border-[#eb1564] disabled:opacity-50 flex justify-between items-center">
        <span className={value ? 'text-gray-800' : 'text-gray-400'}>{value || placeholder}</span>
        <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
      </button>

      {isOpen && (
        <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          <div className="p-2"><input type="text" placeholder={TEXTS.SEARCH_PLACEHOLDER} className="w-full bg-gray-100 border-gray-300 rounded-md p-2 text-gray-800" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} autoFocus /></div>
          <ul>
            {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => (
                  <li key={getOptionName(option)} className="px-4 py-2 text-gray-800 cursor-pointer hover:bg-[#eb1564] hover:text-white" onClick={() => handleSelect(option)}>{getOptionName(option)}</li>
                ))
            ) : <li className="px-4 py-2 text-gray-500">{TEXTS.NO_RESULTS}</li>}
          </ul>
        </div>
      )}
    </div>
  );
};

// --- MAIN GENERATOR COMPONENT ---
interface FileNameGeneratorProps { user: User; handleSignOut: () => void; }
const FileNameGenerator: FC<FileNameGeneratorProps> = ({ user, handleSignOut }) => {
  const [hierarchyData, setHierarchyData] = useState<HierarchyData>({});
  const [mediums, setMediums] = useState<ListData[]>([]);
  const [materials, setMaterials] = useState<ListData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [selectedMedium, setSelectedMedium] = useState<string>('');
  const [selectedMaterial, setSelectedMaterial] = useState<string>('');
  const [sizeWidth, setSizeWidth] = useState<string>('');
  const [sizeHeight, setSizeHeight] = useState<string>('');
  const [sizeUnit, setSizeUnit] = useState<string>('px');
  const [customTextParts, setCustomTextParts] = useState<string[]>(['']);
  const [availableBrands, setAvailableBrands] = useState<string[]>([]);
  const [availableProjects, setAvailableProjects] = useState<Project[]>([]);
  const [generatedName, setGeneratedName] = useState<string>('');
  const [copySuccess, setCopySuccess] = useState<string>('');
  const [isNameTooLong, setIsNameTooLong] = useState<boolean>(false);
  const [presets, setPresets] = useState<{ [key: string]: Preset }>({});
  const [presetName, setPresetName] = useState<string>('');
  const isLoadingPreset = useRef<boolean>(false);

  useEffect(() => {
    try {
        const savedPresets = localStorage.getItem('fileNameGeneratorPresets');
        if (savedPresets) setPresets(JSON.parse(savedPresets));
    } catch (e) { console.error("Could not load presets", e); }
    
    const fetchData = async () => {
        try {
            const responses = await Promise.all([ fetch(buildSheetUrl(SHEET_NAMES.HIERARCHY)), fetch(buildSheetUrl(SHEET_NAMES.MEDIUM)), fetch(buildSheetUrl(SHEET_NAMES.MATERIAL)), ]);
            if (responses.some(res => !res.ok)) throw new Error(TEXTS.ERROR_LOADING);
            const [hierarchyCsv, mediumCsv, materialCsv] = await Promise.all(responses.map(res => res.text()));
            setHierarchyData(parseHierarchyData(hierarchyCsv));
            setMediums(parseListData(mediumCsv));
            setMaterials(parseListData(materialCsv));
        } catch (err: any) { setError(err.message); } 
        finally { setIsLoading(false); }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (isLoadingPreset.current) return;
    setAvailableBrands(selectedClient ? Object.keys(hierarchyData[selectedClient]?.brands || {}) : []);
    setSelectedBrand('');
  }, [selectedClient, hierarchyData]);

  useEffect(() => {
    if (isLoadingPreset.current) return;
    setAvailableProjects(selectedBrand ? hierarchyData[selectedClient]?.brands[selectedBrand]?.projects || [] : []);
    setSelectedProject('');
  }, [selectedBrand, selectedClient, hierarchyData]);
  
  useEffect(() => {
    const getAbbr = (value: string, list: ListData[]) => (list.find(item => item.name === value)?.abbr || value).toUpperCase();
    const clientAbbr = (hierarchyData[selectedClient]?.abbr || selectedClient).toUpperCase();
    const brandAbbr = (hierarchyData[selectedClient]?.brands[selectedBrand]?.abbr || selectedBrand).toUpperCase();
    const projectAbbr = (availableProjects.find(p => p.name === selectedProject)?.abbr || selectedProject).toUpperCase();
    const sizeComponent = sizeWidth && sizeHeight ? `${sizeWidth}x${sizeHeight}${sizeUnit}` : '';
    const formatPart = (part: string) => (part || '').trim().replace(/\s+/g, '-').toUpperCase();
    const formattedCustomParts = customTextParts.map(formatPart).filter(p => p);
    const parts = [ clientAbbr, brandAbbr, projectAbbr, getAbbr(selectedMedium, mediums), getAbbr(selectedMaterial, materials), sizeComponent, ...formattedCustomParts, ];
    const finalName = parts.filter(p => p && p.toUpperCase() !== 'N/A').join('_');
    setGeneratedName(finalName);
    setIsNameTooLong(finalName.length > MAX_FILENAME_LENGTH);
  }, [selectedClient, selectedBrand, selectedProject, selectedMedium, selectedMaterial, sizeWidth, sizeHeight, sizeUnit, customTextParts, hierarchyData, mediums, materials, availableProjects]);

  const handleSavePreset = () => {
    if (!presetName.trim()) { alert("Por favor, ingresa un nombre para el preset."); return; }
    const newPreset: Preset = { name: presetName, values: { selectedClient, selectedBrand, selectedProject, selectedMedium, selectedMaterial, sizeWidth, sizeHeight, sizeUnit, customTextParts } };
    const updatedPresets = { ...presets, [presetName]: newPreset };
    setPresets(updatedPresets);
    localStorage.setItem('fileNameGeneratorPresets', JSON.stringify(updatedPresets));
    setPresetName('');
  };

  const handleLoadPreset = (name: string) => {
    const preset = presets[name];
    if (!preset) return;
    isLoadingPreset.current = true;
    const { values } = preset;
    setSelectedClient(values.selectedClient || '');
    setSelectedMedium(values.selectedMedium || '');
    setSelectedMaterial(values.selectedMaterial || '');
    setSizeWidth(values.sizeWidth || '');
    setSizeHeight(values.sizeHeight || '');
    setSizeUnit(values.sizeUnit || 'px');
    setCustomTextParts(values.customTextParts || ['']);
    setTimeout(() => {
        setSelectedBrand(values.selectedBrand || '');
        setTimeout(() => {
            setSelectedProject(values.selectedProject || '');
            setTimeout(() => {
                isLoadingPreset.current = false;
            }, 50);
        }, 0);
    }, 0);
  };

  const handleDeletePreset = (name: string) => {
      const { [name]: _, ...remainingPresets } = presets;
      setPresets(remainingPresets);
      localStorage.setItem('fileNameGeneratorPresets', JSON.stringify(remainingPresets));
  };
  
  const handleAddPart = () => setCustomTextParts([...customTextParts, '']);
  const handleRemovePart = (i: number) => setCustomTextParts(customTextParts.filter((_, idx) => idx !== i));
  const handlePartChange = (i: number, val: string) => setCustomTextParts(customTextParts.map((p, idx) => (idx === i ? val : p)));
  
  const handleCopy = () => {
      if (!generatedName || isNameTooLong) return;
      const textArea = document.createElement('textarea');
      textArea.value = generatedName;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try { document.execCommand('copy'); setCopySuccess(TEXTS.STATUS_COPIED); setTimeout(() => setCopySuccess(''), 2000); } 
      catch (err) { console.error('Failed to copy text: ', err); setCopySuccess(TEXTS.STATUS_FAILED); setTimeout(() => setCopySuccess(''), 2000); }
      document.body.removeChild(textArea);
  };

  if (isLoading) return <div className="flex items-center justify-center h-screen bg-white text-gray-800">{TEXTS.LOADING}</div>;
  if (error) return <div className="flex items-center justify-center h-screen bg-white text-red-600 p-8">{error}</div>;

  return (
    <div className="bg-white text-gray-800 min-h-screen font-sans flex justify-center p-4 sm:p-6">
      <div className="w-full max-w-5xl mx-auto">
        <header className="text-center mb-10 flex flex-col items-center justify-center gap-4">
          <img src={LOGO_URL} alt="Logo" className="h-24 w-auto object-contain" />
          <h1 className="text-4xl font-bold text-[#eb1564]">{TEXTS.TITLE}</h1>
        </header>
        <div className="text-right mb-4">
          <span className="text-sm text-gray-500 mr-4">Hola, {user.displayName}</span>
          <button onClick={handleSignOut} className="text-sm text-[#eb1564] hover:underline">{TEXTS.LOGOUT_BUTTON}</button>
        </div>
        <main className="bg-gray-50/50 p-6 sm:p-8 rounded-2xl shadow-lg border border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-8 mb-8">
            <SearchableDropdown label={TEXTS.CLIENT} options={Object.keys(hierarchyData)} value={selectedClient} onChange={setSelectedClient} placeholder={TEXTS.SELECT_PLACEHOLDER}/>
            <SearchableDropdown label={TEXTS.BRAND} options={availableBrands} value={selectedBrand} onChange={setSelectedBrand} placeholder={TEXTS.SELECT_PLACEHOLDER} disabled={!selectedClient}/>
            <SearchableDropdown label={TEXTS.PROJECT} options={availableProjects} value={selectedProject} onChange={setSelectedProject} placeholder={TEXTS.SELECT_PLACEHOLDER} disabled={!selectedBrand}/>
            <SearchableDropdown label={TEXTS.MEDIUM} options={mediums} value={selectedMedium} onChange={setSelectedMedium} placeholder={TEXTS.SELECT_PLACEHOLDER} />
            <SearchableDropdown label={TEXTS.MATERIAL} options={materials} value={selectedMaterial} onChange={setSelectedMaterial} placeholder={TEXTS.SELECT_PLACEHOLDER} />
            <div className="lg:col-span-3">
              <label className="mb-2 text-sm font-medium text-gray-500">{TEXTS.SIZE}</label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <input type="number" value={sizeWidth} onChange={(e) => setSizeWidth(e.target.value)} placeholder={TEXTS.SIZE_WIDTH} className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5" />
                <input type="number" value={sizeHeight} onChange={(e) => setSizeHeight(e.target.value)} placeholder={TEXTS.SIZE_HEIGHT} className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5" />
                <select value={sizeUnit} onChange={(e) => setSizeUnit(e.target.value)} className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5"><option value="px">px</option><option value="cm">cm</option><option value="mm">mm</option><option value="in">in</option></select>
              </div>
            </div>
          </div>
          <div className="mb-8">
            <label className="text-sm font-medium text-gray-500">{TEXTS.VARIABLE}</label>
            <p className="text-xs text-gray-400 mb-2">{TEXTS.VARIABLE_EXAMPLE}</p>
            {customTextParts.map((part, index) => (<div key={index} className="flex items-center gap-2 mt-2"><input type="text" value={part} onChange={(e) => handlePartChange(index, e.target.value)} placeholder={`${TEXTS.VARIABLE} ${index + 1}`} className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5" /><button onClick={index === customTextParts.length - 1 ? handleAddPart : () => handleRemovePart(index)} className={`flex-shrink-0 w-10 h-10 flex items-center justify-center font-bold rounded-lg transition-colors text-white ${index === customTextParts.length - 1 ? 'bg-[#eb1564] hover:opacity-90' : 'bg-gray-500 hover:bg-gray-600'}`}>{index === customTextParts.length - 1 ? '+' : '−'}</button></div>))}
          </div>
          <div className="bg-gray-100 p-6 rounded-xl border border-gray-200">
             <div className="flex justify-between items-center"><p className="text-sm text-gray-500 font-medium">{TEXTS.OUTPUT_TITLE}</p>{copySuccess && <p className="text-sm text-[#eb1564] font-semibold">{copySuccess}</p>}</div>
            <div className="flex items-center gap-4 mt-2">
                <p className="w-full font-mono text-lg text-[#eb1564] bg-white p-3 rounded-md border border-gray-300 break-all h-14 flex items-center">{generatedName || TEXTS.OUTPUT_PLACEHOLDER}</p>
                <button onClick={handleCopy} className="flex-shrink-0 bg-[#eb1564] hover:opacity-90 disabled:bg-gray-300 text-white font-bold py-3 px-5 rounded-lg" disabled={!generatedName || isNameTooLong}><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
            </div>
            <div className="mt-2 text-right text-xs">
                {isNameTooLong ? (<p className="text-red-500 font-semibold">{TEXTS.CHAR_LIMIT_WARNING_PREFIX}{generatedName.length}{TEXTS.CHAR_LIMIT_WARNING_SUFFIX}</p>) : (<p className="text-gray-400">{generatedName.length} / {MAX_FILENAME_LENGTH}</p>)}
            </div>
          </div>
          <div className="mt-8 p-4 bg-white rounded-lg border border-gray-200">
             <h2 className="text-lg font-semibold text-gray-700 mb-3">{TEXTS.PRESETS_TITLE}</h2>
             <div className="flex flex-col sm:flex-row flex-wrap gap-4 items-end">
                <div className="w-full sm:flex-grow"><label className="text-sm text-gray-500 block mb-1">{TEXTS.PRESETS_LOAD}</label><select onChange={(e) => handleLoadPreset(e.target.value)} value="" className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5"><option value="">{TEXTS.SELECT_PLACEHOLDER}</option>{Object.keys(presets).map(name => <option key={name} value={name}>{name}</option>)}</select></div>
                <div className="w-full sm:flex-grow"><label className="text-sm text-gray-500 block mb-1">{TEXTS.PRESETS_SAVE}</label><input type="text" value={presetName} onChange={e => setPresetName(e.target.value)} placeholder={TEXTS.PRESETS_SAVE_PLACEHOLDER} className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5" /></div>
                <button onClick={handleSavePreset} className="w-full sm:w-auto bg-[#eb1564] hover:opacity-90 text-white font-bold py-2.5 px-4 rounded-lg flex-shrink-0">{TEXTS.PRESETS_SAVE_BUTTON}</button>
             </div>
             {Object.keys(presets).length > 0 && <div className="mt-4 flex flex-wrap gap-2">{Object.keys(presets).map(name => (<div key={name} className="flex items-center bg-gray-200 text-gray-700 rounded-full px-3 py-1 text-sm"><span>{name}</span><button onClick={() => handleDeletePreset(name)} className="ml-2 text-red-500 hover:text-red-700 font-bold text-lg leading-none -translate-y-px">&times;</button></div>))}</div>}
          </div>
        </main>
      </div>
    </div>
  );
};

// --- Authentication Wrapper Component ---
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Authentication error:", error);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  if (authLoading) {
    return <div className="flex items-center justify-center h-screen bg-white text-gray-800">{TEXTS.AUTH_LOADING}</div>;
  }
  if (user && user.email?.endsWith(ALLOWED_DOMAIN)) {
    return <FileNameGenerator user={user} handleSignOut={handleSignOut} />;
  }
  if (user && !user.email?.endsWith(ALLOWED_DOMAIN)) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-white text-gray-800 p-4 text-center">
        <img src={LOGO_URL} alt="Logo" className="h-24 w-auto object-contain mb-8" />
        <h2 className="text-2xl font-bold text-red-600 mb-2">{TEXTS.ACCESS_DENIED_TITLE}</h2>
        <p className="mb-6">{TEXTS.ACCESS_DENIED_MESSAGE}</p>
        <button onClick={handleSignOut} className="bg-gray-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-gray-700">{TEXTS.LOGOUT_BUTTON}</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-white text-gray-800 p-4 text-center">
      <img src={LOGO_URL} alt="Logo" className="h-24 w-auto object-contain mb-8" />
      <h2 className="text-2xl font-bold mb-2">{TEXTS.LOGIN_TITLE}</h2>
      <p className="text-gray-600 mb-6">{TEXTS.LOGIN_PROMPT}</p>
      <button onClick={handleSignIn} className="bg-[#eb1564] text-white font-bold py-3 px-6 rounded-lg hover:opacity-90 flex items-center gap-3">
        <svg className="w-5 h-5" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path><path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path><path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.222,0-9.619-3.317-11.28-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"></path><path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.574l6.19,5.238C39.978,36.218,44,30.608,44,24C44,22.659,43.862,21.35,43.611,20.083z"></path></svg>
        {TEXTS.LOGIN_BUTTON}
      </button>
    </div>
  );
}
