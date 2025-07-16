import React, { useState, useEffect, useRef, FC } from 'react';
// NEW: Import Firebase services
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, User } from 'firebase/auth';
import { auth } from './firebase'; // Your newly created firebase config file

// --- TYPE DEFINITIONS for TypeScript ---
interface Project { name: string; abbr: string; }
interface BrandData { abbr:string; projects: Project[]; }
interface HierarchyData { [clientName: string]: { abbr: string; brands: { [brandName: string]: BrandData; }; }; }
interface ListData { name: string; abbr: string; }
interface Preset { name: string; values: { selectedClient: string; selectedBrand: string; selectedProject: string; selectedMedium: string; selectedMaterial: string; sizeWidth: string; sizeHeight: string; sizeUnit: string; customTextParts: string[]; }; }

// --- CONFIGURATION & TEXTS ---
const TEXTS = {
  TITLE: 'Generador de Nombres de Archivo',
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
  CHAR_LIMIT_WARNING_SUFFIX: ' caracteres) excede el límite recomendado. Puede causar problemas en algunos sistemas.',
  LOGIN_TITLE: 'Acceso Restringido',
  LOGIN_BUTTON: 'Ingresar con Google',
  LOGOUT_BUTTON: 'Cerrar Sesión',
  ACCESS_DENIED_TITLE: 'Acceso Denegado',
  ACCESS_DENIED_MESSAGE: 'No tienes permiso para usar esta herramienta. Por favor, contacta al administrador.',
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
const SearchableDropdown: React.FC<SearchableDropdownProps> = ({ options, value, onChange, placeholder, label, disabled = false }) => {
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
interface FileNameGeneratorProps {
  user: User;
  handleSignOut: () => void;
}
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
    setSelectedMaterial(values.selectedMaterial || '