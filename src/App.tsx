import React, { useState, useEffect, useRef } from 'react';

// --- TYPE DEFINITIONS for TypeScript ---
interface Project {
  name: string;
  abbr: string;
}

interface BrandData {
  abbr: string;
  projects: Project[];
}

interface HierarchyData {
  [clientName: string]: {
    abbr: string;
    brands: {
      [brandName: string]: BrandData;
    };
  };
}

interface ListData {
  name: string;
  abbr: string;
}

interface Preset {
    name: string;
    values: {
        selectedClient: string;
        selectedBrand: string;
        selectedProject: string;
        selectedMedium: string;
        selectedMaterial: string;
        selectedYear: string;
        customTextParts: string[];
    };
}

// --- CONFIGURATION ---
const LABELS = {
  CLIENT: 'Cliente',
  BRAND: 'Marca',
  PROJECT: 'Proyecto',
  MEDIUM: 'Medio',
  MATERIAL: 'Material',
};

const GOOGLE_SHEET_ID = '1CofaP4ZhFqFBVAktX6MN48oa75YyEHDW4d8zobx3Az0';
const SHEET_NAMES = {
  HIERARCHY: 'Client-Brand-Project',
  MEDIUM: 'Mediums',
  MATERIAL: 'Materials',
};

const LOGO_URL = '/logo.png';

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
interface SearchableDropdownProps {
  options: (string | Project | ListData)[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  disabled?: boolean;
}

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
          <div className="p-2"><input type="text" placeholder="Search..." className="w-full bg-gray-100 border-gray-300 rounded-md p-2 text-gray-800" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} autoFocus /></div>
          <ul>
            {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => (
                  <li key={getOptionName(option)} className="px-4 py-2 text-gray-800 cursor-pointer hover:bg-[#eb1564] hover:text-white" onClick={() => handleSelect(option)}>{getOptionName(option)}</li>
                ))
            ) : <li className="px-4 py-2 text-gray-500">No results</li>}
          </ul>
        </div>
      )}
    </div>
  );
};

// --- MAIN APP COMPONENT ---
export default function App() {
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
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [customTextParts, setCustomTextParts] = useState<string[]>(['']);
  const [availableBrands, setAvailableBrands] = useState<string[]>([]);
  const [availableProjects, setAvailableProjects] = useState<Project[]>([]);
  const [generatedName, setGeneratedName] = useState<string>('');
  const [copySuccess, setCopySuccess] = useState<string>('');
  const [presets, setPresets] = useState<{ [key: string]: Preset }>({});
  const [presetName, setPresetName] = useState<string>('');

  useEffect(() => {
    try {
        const savedPresets = localStorage.getItem('fileNameGeneratorPresets');
        if (savedPresets) setPresets(JSON.parse(savedPresets));
    } catch (e) { console.error("Could not load presets", e); }
    
    const fetchData = async () => {
        try {
            const responses = await Promise.all([ fetch(buildSheetUrl(SHEET_NAMES.HIERARCHY)), fetch(buildSheetUrl(SHEET_NAMES.MEDIUM)), fetch(buildSheetUrl(SHEET_NAMES.MATERIAL)), ]);
            if (responses.some(res => !res.ok)) throw new Error("Failed to fetch one or more data sheets. Check Sheet names and sharing permissions.");
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
    setAvailableBrands(selectedClient ? Object.keys(hierarchyData[selectedClient]?.brands || {}) : []);
    setSelectedBrand('');
  }, [selectedClient, hierarchyData]);

  useEffect(() => {
    setAvailableProjects(selectedBrand ? hierarchyData[selectedClient]?.brands[selectedBrand]?.projects || [] : []);
    setSelectedProject('');
  }, [selectedBrand, selectedClient, hierarchyData]);
  
  useEffect(() => {
    const getAbbr = (value: string, list: ListData[]) => (list.find(item => item.name === value)?.abbr || value).toUpperCase();
    const clientAbbr = (hierarchyData[selectedClient]?.abbr || selectedClient).toUpperCase();
    const brandAbbr = (hierarchyData[selectedClient]?.brands[selectedBrand]?.abbr || selectedBrand).toUpperCase();
    const projectAbbr = (availableProjects.find(p => p.name === selectedProject)?.abbr || selectedProject).toUpperCase();
    const formatPart = (part: string) => (part || '').trim().replace(/\s+/g, '-').toUpperCase();
    const formattedCustomParts = customTextParts.map(formatPart).filter(p => p);
    const parts = [ clientAbbr, brandAbbr, projectAbbr, selectedYear, getAbbr(selectedMedium, mediums), getAbbr(selectedMaterial, materials), ...formattedCustomParts, ];
    setGeneratedName(parts.filter(p => p && p.toUpperCase() !== 'N/A').join('_'));
  }, [selectedClient, selectedBrand, selectedProject, selectedYear, selectedMedium, selectedMaterial, customTextParts, hierarchyData, mediums, materials, availableProjects]);

  const handleSavePreset = () => {
    if (!presetName.trim()) { alert("Please enter a name for the preset."); return; }
    const newPreset: Preset = { name: presetName, values: { selectedClient, selectedBrand, selectedProject, selectedMedium, selectedMaterial, selectedYear, customTextParts } };
    const updatedPresets = { ...presets, [presetName]: newPreset };
    setPresets(updatedPresets);
    localStorage.setItem('fileNameGeneratorPresets', JSON.stringify(updatedPresets));
    setPresetName('');
  };

  const handleLoadPreset = (name: string) => {
    const preset = presets[name];
    if (!preset) return;
    const { values } = preset;
    setSelectedClient(values.selectedClient || '');
    setTimeout(() => {
        setSelectedBrand(values.selectedBrand || '');
        setTimeout(() => {
            setSelectedProject(values.selectedProject || '');
        }, 0);
    }, 0);
    setSelectedMedium(values.selectedMedium || '');
    setSelectedMaterial(values.selectedMaterial || '');
    setSelectedYear(values.selectedYear || new Date().getFullYear().toString());
    setCustomTextParts(values.customTextParts || ['']);
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
      if (!generatedName) return;
      const textArea = document.createElement('textarea');
      textArea.value = generatedName;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopySuccess('Copied!');
        setTimeout(() => setCopySuccess(''), 2000);
      } catch (err) { 
        console.error('Failed to copy text: ', err);
        setCopySuccess('Failed!');
        setTimeout(() => setCopySuccess(''), 2000);
      }
      document.body.removeChild(textArea);
  };

  if (isLoading) return <div className="flex items-center justify-center h-screen bg-white text-gray-800">Loading data...</div>;
  if (error) return <div className="flex items-center justify-center h-screen bg-white text-red-600 p-8">{error}</div>;

  return (
    <div className="bg-white text-gray-800 min-h-screen font-sans flex justify-center p-4 sm:p-6">
      <div className="w-full max-w-5xl mx-auto">
        <header className="text-center mb-10 flex items-center justify-center gap-4">
          <img src={LOGO_URL} alt="Logo" className="h-12 w-12 object-contain" />
          <h1 className="text-4xl font-bold text-gray-800">Filename Generator</h1>
        </header>
        
        <main className="bg-gray-50/50 p-6 sm:p-8 rounded-2xl shadow-lg border border-gray-200">
          <div className="mb-8 p-4 bg-white rounded-lg border border-gray-200">
             <h2 className="text-lg font-semibold text-gray-700 mb-3">Presets</h2>
             <div className="flex flex-col sm:flex-row flex-wrap gap-4 items-end">
                <div className="w-full sm:flex-grow"><label className="text-sm text-gray-500 block mb-1">Load Preset</label><select onChange={(e) => handleLoadPreset(e.target.value)} value="" className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5"><option value="">-- Select a Preset --</option>{Object.keys(presets).map(name => <option key={name} value={name}>{name}</option>)}</select></div>
                <div className="w-full sm:flex-grow"><label className="text-sm text-gray-500 block mb-1">Save Current as Preset</label><input type="text" value={presetName} onChange={e => setPresetName(e.target.value)} placeholder="New Preset Name" className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5" /></div>
                <button onClick={handleSavePreset} className="w-full sm:w-auto bg-[#eb1564] hover:opacity-90 text-white font-bold py-2.5 px-4 rounded-lg flex-shrink-0">Save</button>
             </div>
             {Object.keys(presets).length > 0 && <div className="mt-4 flex flex-wrap gap-2">{Object.keys(presets).map(name => (<div key={name} className="flex items-center bg-gray-200 text-gray-700 rounded-full px-3 py-1 text-sm"><span>{name}</span><button onClick={() => handleDeletePreset(name)} className="ml-2 text-red-500 hover:text-red-700 font-bold text-lg leading-none -translate-y-px">&times;</button></div>))}</div>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-8 mb-8">
            <SearchableDropdown label={LABELS.CLIENT} options={Object.keys(hierarchyData)} value={selectedClient} onChange={setSelectedClient} placeholder="-- Select Client --"/>
            <SearchableDropdown label={LABELS.BRAND} options={availableBrands} value={selectedBrand} onChange={setSelectedBrand} placeholder="-- Select Brand --" disabled={!selectedClient}/>
            <SearchableDropdown label={LABELS.PROJECT} options={availableProjects} value={selectedProject} onChange={setSelectedProject} placeholder="-- Select Project --" disabled={!selectedBrand}/>
            <SearchableDropdown label={LABELS.MEDIUM} options={mediums} value={selectedMedium} onChange={setSelectedMedium} placeholder="-- Select Medium --" />
            <SearchableDropdown label={LABELS.MATERIAL} options={materials} value={selectedMaterial} onChange={setSelectedMaterial} placeholder="-- Select Material --" />
            <div><label className="mb-2 text-sm font-medium text-gray-500">Year</label><select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5">{[...Array(8)].map((_, i) => new Date().getFullYear() + 2 - i).map(y => <option key={y} value={y}>{y}</option>)}</select></div>
          </div>
          
          <div className="mb-8">
            <label className="text-sm font-medium text-gray-500">Description Components</label>
            {customTextParts.map((part, index) => (<div key={index} className="flex items-center gap-2 mt-2"><input type="text" value={part} onChange={(e) => handlePartChange(index, e.target.value)} placeholder={`Component ${index + 1}`} className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5" /><button onClick={index === customTextParts.length - 1 ? handleAddPart : () => handleRemovePart(index)} className={`flex-shrink-0 w-10 h-10 flex items-center justify-center font-bold rounded-lg transition-colors text-white ${index === customTextParts.length - 1 ? 'bg-[#eb1564] hover:opacity-90' : 'bg-gray-500 hover:bg-gray-600'}`}>{index === customTextParts.length - 1 ? '+' : '−'}</button></div>))}
          </div>

          <div className="bg-gray-100 p-6 rounded-xl border border-gray-200">
             <div className="flex justify-between items-center"><p className="text-sm text-gray-500 font-medium">GENERATED NAME</p>{copySuccess && <p className="text-sm text-[#eb1564] font-semibold">{copySuccess}</p>}</div>
            <div className="flex items-center gap-4 mt-2">
                <p className="w-full font-mono text-lg text-[#eb1564] bg-white p-3 rounded-md border border-gray-300 break-all h-14 flex items-center">{generatedName || '...'}</p>
                <button onClick={handleCopy} className="flex-shrink-0 bg-[#eb1564] hover:opacity-90 disabled:bg-gray-300 text-white font-bold py-3 px-5 rounded-lg" disabled={!generatedName}><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
