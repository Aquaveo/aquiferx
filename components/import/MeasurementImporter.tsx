import React, { useState, useEffect, useMemo } from 'react';
import { X, CheckCircle2, Loader2, AlertTriangle, Download, Upload, Calendar, MapPin, Wand2, BookOpen } from 'lucide-react';
import { processUploadedFile, UploadedFile, saveFiles, parseDate, detectDateFormat, parseCSV, isInUS, freshFetch, assignWellToAquifer } from '../../services/importUtils';
import { fetchUSGSMeasurements, validateUSGSMeasurements, USGSDataQualityReport, USGSMeasurement, USGSDataSpan, computeDataSpan, filterByDateRange, getUSGSApiKey, setUSGSApiKey } from '../../services/usgsApi';
import { loadCatalog } from '../../services/catalog';
import CatalogBrowser from '../CatalogBrowser';
import {
  matchWells,
  summarizeMatches,
  generateAqxId,
  suggestDataTypesFromColumns,
  ExistingWell,
  MatchResult,
  MatchSummary,
} from '../../services/wellMatching';
import { fetchGseBatch } from '../../services/gseLookup';
import ColumnMapperModal from './ColumnMapperModal';
import ConfirmDialog from './ConfirmDialog';
import { DataType, ParameterCatalog, RegionMeta } from '../../types';

interface MeasurementImporterProps {
  regionId: string;
  regionName: string;
  lengthUnit: 'ft' | 'm';
  singleUnit: boolean;
  /** Effective set of data types for this region (WTE + catalog types with
   *  data + customs with data). Drives the type picker UI. */
  dataTypes: DataType[];
  /** The region's custom (non-catalog) types from region.json. Used when
   *  persisting new non-catalog additions to disk. */
  customDataTypes: DataType[];
  regionBounds: [number, number, number, number];
  existingWellCount: number;
  onComplete: () => void;
  onClose: () => void;
}

type ImportMode = 'append' | 'replace';
type DataSource = 'upload' | 'usgs';
type USGSMode = 'fresh' | 'quick-refresh' | 'full-refresh';
type AquiferAssignment = 'from-wells' | 'single' | 'csv-field';

const MeasurementImporter: React.FC<MeasurementImporterProps> = ({
  regionId, regionName, lengthUnit, singleUnit, dataTypes, customDataTypes, regionBounds, existingWellCount, onComplete, onClose
}) => {
  const [dataSource, setDataSource] = useState<DataSource>('upload');
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [showMapper, setShowMapper] = useState(false);
  const [dateFormat, setDateFormat] = useState('iso');
  const [importMode, setImportMode] = useState<ImportMode>('append');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);

  // Multi-type selection
  const [selectedTypes, setSelectedTypes] = useState<string[]>([dataTypes[0]?.code || 'wte']);
  const [isMultiType, setIsMultiType] = useState(false);
  const [typeColumnMapping, setTypeColumnMapping] = useState<Record<string, string>>({});

  // Auto-match CSV columns to data types when multi-type mode is active
  useEffect(() => {
    if (!isMultiType || !file) return;
    const cols = file.columns;
    const mapping: Record<string, string> = {};
    for (const dt of dataTypes) {
      // Try exact match on code, then case-insensitive match on code or name
      const match = cols.find(c => c === dt.code)
        || cols.find(c => c.toLowerCase() === dt.code.toLowerCase())
        || cols.find(c => c.toLowerCase() === dt.name.toLowerCase())
        // Partial: column contains code or code contains column
        || cols.find(c => c.toLowerCase().includes(dt.code.toLowerCase()) && c.toLowerCase() !== 'well_id' && c.toLowerCase() !== 'date' && c.toLowerCase() !== 'aquifer_id');
      if (match) mapping[dt.code] = match;
    }
    setTypeColumnMapping(prev => ({ ...prev, ...mapping }));
  }, [isMultiType, file, dataTypes]);

  // WTE depth-below-GSE option
  const [wteIsDepth, setWteIsDepth] = useState(false);
  const [wellGseMap, setWellGseMap] = useState<Record<string, number>>({});

  // Aquifer assignment
  const [aquiferAssignment, setAquiferAssignment] = useState<AquiferAssignment>('from-wells');
  const [selectedAquiferId, setSelectedAquiferId] = useState('');
  const [aquiferList, setAquiferList] = useState<{ id: string; name: string }[]>([]);
  const [wellAquiferMap, setWellAquiferMap] = useState<Record<string, string>>({});

  // USGS scope
  const [usgsScope, setUsgsScope] = useState<'region' | 'aquifer'>('region');
  const [usgsScopeAquiferId, setUsgsScopeAquiferId] = useState('');
  const [apiKey, setApiKey] = useState(getUSGSApiKey());

  // USGS download
  const [usgsMode, setUsgsMode] = useState<USGSMode>('quick-refresh');
  const [usgsIsLoading, setUsgsIsLoading] = useState(false);
  const [usgsProgress, setUsgsProgress] = useState({ completed: 0, total: 0, done: false });
  const [qualityReport, setQualityReport] = useState<USGSDataQualityReport | null>(null);
  const [dataSpan, setDataSpan] = useState<USGSDataSpan | null>(null);
  const [trimStartDate, setTrimStartDate] = useState('');
  const [trimEndDate, setTrimEndDate] = useState('');
  const [isTrimmed, setIsTrimmed] = useState(false);
  const [quickRefreshCutoff, setQuickRefreshCutoff] = useState('');
  const [rawUSGSMeasurements, setRawUSGSMeasurements] = useState<USGSMeasurement[]>([]);

  // Phase 3: smart well discovery + column detection
  // Toggle: does the CSV include per-row well locations (name / lat / lng)?
  // Default ON when the region has no wells (bootstrap case), off otherwise.
  const [hasWellColumns, setHasWellColumns] = useState(existingWellCount === 0);
  const [existingWellsFull, setExistingWellsFull] = useState<ExistingWell[]>([]);
  const [aquifersGeojson, setAquifersGeojson] = useState<any>(null);
  const [catalog, setCatalog] = useState<ParameterCatalog | null>(null);
  const [otherRegionTypes, setOtherRegionTypes] = useState<DataType[]>([]);
  const [matchResults, setMatchResults] = useState<MatchResult[] | null>(null);
  const [matchSummary, setMatchSummary] = useState<MatchSummary | null>(null);
  const [proximityMeters, setProximityMeters] = useState(100);
  const [isMatching, setIsMatching] = useState(false);
  const [newWellsGseProgress, setNewWellsGseProgress] = useState({ done: 0, total: 0 });
  const [showCatalogBrowser, setShowCatalogBrowser] = useState(false);

  const regionOverlapsUS = isInUS(
    (regionBounds[0] + regionBounds[2]) / 2,
    (regionBounds[1] + regionBounds[3]) / 2
  );

  // Load aquifer list and well->aquifer mapping
  useEffect(() => {
    (async () => {
      // Load aquifers geojson (kept for point-in-polygon assignment of new wells,
      // even for single-unit regions we may still have it for display)
      try {
        const res = await freshFetch(`/data/${regionId}/aquifers.geojson`);
        if (res.ok) {
          const gj = await res.json();
          setAquifersGeojson(gj);
          if (!singleUnit) {
            const features = gj.type === 'FeatureCollection' ? gj.features : [gj];
            setAquiferList(features.map((f: any) => ({
              id: String(f.properties?.aquifer_id || ''),
              name: f.properties?.aquifer_name || ''
            })));
          }
        }
      } catch {}

      // Load wells for aquifer lookup, GSE, and full well records for matching
      try {
        const res = await freshFetch(`/data/${regionId}/wells.csv`);
        if (res.ok) {
          const text = await res.text();
          const { rows } = parseCSV(text);
          const aqMap: Record<string, string> = {};
          const gseMap: Record<string, number> = {};
          const fullWells: ExistingWell[] = [];
          for (const r of rows) {
            if (r.well_id) {
              aqMap[r.well_id] = r.aquifer_id || '0';
              const gse = parseFloat(r.gse);
              if (!isNaN(gse)) gseMap[r.well_id] = gse;
              fullWells.push({
                well_id: r.well_id,
                well_name: r.well_name || '',
                lat: parseFloat(r.lat),
                lng: parseFloat(r.long),
                aquifer_id: r.aquifer_id || '0',
                gse: isNaN(gse) ? 0 : gse,
              });
            }
          }
          setWellAquiferMap(aqMap);
          setWellGseMap(gseMap);
          setExistingWellsFull(fullWells);
        }
      } catch {}

      // Load catalog + cross-region data types for column detection
      try {
        const cat = await loadCatalog();
        setCatalog(cat);
      } catch {}
      try {
        const res = await fetch('/api/regions');
        if (res.ok) {
          const all: any[] = await res.json();
          const types: DataType[] = [];
          const seen = new Set<string>();
          for (const r of all) {
            if (r.id === regionId) continue;
            const others: DataType[] = Array.isArray(r.customDataTypes)
              ? r.customDataTypes
              : Array.isArray(r.dataTypes)
                ? r.dataTypes
                : [];
            for (const dt of others) {
              if (!seen.has(dt.code)) { seen.add(dt.code); types.push(dt); }
            }
          }
          setOtherRegionTypes(types);
        }
      } catch {}
    })();
  }, [regionId, singleUnit]);

  // Check if any selected types already have data
  const [existingCounts, setExistingCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    (async () => {
      const counts: Record<string, number> = {};
      for (const dt of dataTypes) {
        try {
          const res = await freshFetch(`/data/${regionId}/data_${dt.code}.csv`);
          if (res.ok) {
            const text = await res.text();
            counts[dt.code] = Math.max(0, text.split('\n').filter(l => l.trim()).length - 1);
          }
        } catch {}
      }
      setExistingCounts(counts);
    })();
  }, [regionId, dataTypes]);

  const hasExistingData = selectedTypes.some(code => (existingCounts[code] || 0) > 0);

  // Well ID is required for the legacy strict-matching case. When the
  // toggle "file includes well locations" is on, we run the smart-matching
  // pipeline and at least one of {well_id, well_name, lat+long} suffices.
  const wellIdRequired = dataSource !== 'upload' || (existingWellCount > 0 && !hasWellColumns);
  const smartFields = dataSource === 'upload' && hasWellColumns
    ? [
        { key: 'well_name', label: 'Well Name', required: false },
        { key: 'lat', label: 'Latitude', required: false },
        { key: 'long', label: 'Longitude', required: false },
      ]
    : [];
  const fieldDefs = isMultiType
    ? [
        { key: 'well_id', label: 'Well ID', required: wellIdRequired },
        ...smartFields,
        { key: 'date', label: 'Date', required: true },
        ...(!singleUnit && aquiferAssignment === 'csv-field'
          ? [{ key: 'aquifer_id', label: 'Aquifer ID', required: false }] : []),
      ]
    : [
        { key: 'well_id', label: 'Well ID', required: wellIdRequired },
        ...smartFields,
        { key: 'date', label: 'Date', required: true },
        { key: 'value', label: 'Value', required: true },
        ...(!singleUnit && aquiferAssignment === 'csv-field'
          ? [{ key: 'aquifer_id', label: 'Aquifer ID', required: false }] : []),
      ];

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const uploaded = await processUploadedFile(f, 'measurements');
      setFile(uploaded);
      setMatchResults(null);
      setMatchSummary(null);

      if (uploaded.mapping['date'] && Array.isArray(uploaded.data)) {
        const detected = detectDateFormat(uploaded.data as Record<string, string>[], uploaded.mapping['date']);
        setDateFormat(detected);
      }

      setShowMapper(true);
    } catch (err) {
      setError(`Failed to process: ${err}`);
    }
  };

  // --- Per-column mapping editor (Phase 3.5d) ------------------------
  // Each CSV column that isn't a well_id/date/lat/etc. gets a mapping row
  // with an explicit Target. Users can override the auto-match to handle
  // typos and variant spellings, or opt out of columns entirely.

  type MappingTarget =
    | { kind: 'catalog'; code: string }
    | { kind: 'existingCustom'; code: string }
    | { kind: 'new'; code: string; name: string; unit: string };

  interface ColumnMapping {
    column: string;
    headerUnit: string | null;
    include: boolean;
    target: MappingTarget;
  }

  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);

  const catalogCodes = useMemo(
    () => new Set(Object.keys(catalog?.parameters || {})),
    [catalog]
  );

  // Derive initial mappings from auto-match when the file or catalog changes
  useEffect(() => {
    if (!file || dataSource !== 'upload') { setColumnMappings([]); return; }
    const suggestions = suggestDataTypesFromColumns(file.columns, catalog, customDataTypes, otherRegionTypes);
    const initial: ColumnMapping[] = suggestions.map(s => {
      let target: MappingTarget;
      if (s.source === 'catalog') {
        target = { kind: 'catalog', code: s.code };
      } else if (s.source === 'existingCustom') {
        target = { kind: 'existingCustom', code: s.code };
      } else {
        // otherRegionCustom or custom: treat as a new custom, carry prefilled values
        target = { kind: 'new', code: s.code, name: s.name, unit: s.unit };
      }
      return {
        column: s.column,
        headerUnit: s.headerUnit,
        include: s.include,
        target,
      };
    });
    setColumnMappings(initial);
  }, [file?.columns, catalog, customDataTypes, otherRegionTypes, dataSource]);

  const setMappingInclude = (column: string, include: boolean) => {
    setColumnMappings(prev => prev.map(m => m.column === column ? { ...m, include } : m));
  };

  // Handle Target dropdown change. The value encodes kind + code:
  //   "catalog:nitrate", "existingCustom:bod5", "new"
  const setMappingTarget = (column: string, value: string) => {
    setColumnMappings(prev => prev.map(m => {
      if (m.column !== column) return m;
      if (value.startsWith('catalog:')) {
        return { ...m, target: { kind: 'catalog', code: value.slice('catalog:'.length) } };
      }
      if (value.startsWith('existingCustom:')) {
        return { ...m, target: { kind: 'existingCustom', code: value.slice('existingCustom:'.length) } };
      }
      if (value === 'new') {
        // Seed from the column header if we don't already have new-custom values
        if (m.target.kind === 'new') return m;
        const slug = m.column.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 20) || 'custom';
        return {
          ...m,
          target: { kind: 'new', code: slug, name: m.column, unit: m.headerUnit || '' },
        };
      }
      return m;
    }));
  };

  const updateNewCustom = (column: string, field: 'code' | 'name' | 'unit', value: string) => {
    setColumnMappings(prev => prev.map(m => {
      if (m.column !== column || m.target.kind !== 'new') return m;
      return { ...m, target: { ...m.target, [field]: value } };
    }));
  };

  const setAllMappingsInclude = (filter: 'all' | 'catalogOnly' | 'none') => {
    setColumnMappings(prev => prev.map(m => {
      if (filter === 'none') return { ...m, include: false };
      if (filter === 'all') return { ...m, include: true };
      // catalogOnly
      return { ...m, include: m.target.kind === 'catalog' };
    }));
  };

  // Resolve the effective DataType for a mapping — the thing that drives
  // the resulting data_{code}.csv file.
  const mappingResolvedType = (m: ColumnMapping): DataType | null => {
    if (m.target.kind === 'catalog') {
      const param = catalog?.parameters[m.target.code];
      if (!param) return null;
      return { code: m.target.code, name: param.name, unit: param.unit };
    }
    if (m.target.kind === 'existingCustom') {
      const dt = customDataTypes.find(d => d.code === m.target.code);
      if (!dt) return null;
      return dt;
    }
    // new
    return { code: m.target.code, name: m.target.name, unit: m.target.unit };
  };

  const includedMappings = useMemo(
    () => columnMappings.filter(m => m.include),
    [columnMappings]
  );

  // Custom types that will be newly added to the region's customDataTypes
  // (distinct codes from rows whose target is 'new' and whose code isn't
  // already a custom or a catalog entry).
  const newCustomTypesToAdd = useMemo(() => {
    const existing = new Set(customDataTypes.map(d => d.code));
    const seen = new Set<string>();
    const result: DataType[] = [];
    for (const m of includedMappings) {
      if (m.target.kind !== 'new') continue;
      if (!m.target.code) continue;
      if (existing.has(m.target.code)) continue;
      if (catalogCodes.has(m.target.code)) continue; // collision prevented by UI validation
      if (seen.has(m.target.code)) continue;
      seen.add(m.target.code);
      result.push({ code: m.target.code, name: m.target.name || m.target.code, unit: m.target.unit });
    }
    return result;
  }, [includedMappings, customDataTypes, catalogCodes]);

  // Keep typeColumnMapping + selectedTypes in sync with the included mappings
  // so doSave's existing multi-type path can consume them directly.
  useEffect(() => {
    if (includedMappings.length === 0) return;
    const newMapping: Record<string, string> = { ...typeColumnMapping };
    const codes: string[] = [];
    for (const m of includedMappings) {
      const type = mappingResolvedType(m);
      if (!type || !type.code) continue;
      newMapping[type.code] = m.column;
      if (!codes.includes(type.code)) codes.push(type.code);
    }
    if (codes.length === 0) return;
    setTypeColumnMapping(newMapping);
    setSelectedTypes(codes);
    // Auto-enable multi-type when we have 2+ included mappings so doSave
    // iterates them as separate data files. Single-column imports can use
    // either path since the multi-type loop handles length=1 the same way.
    if (codes.length > 1 && !isMultiType) setIsMultiType(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includedMappings]);

  // Validation: a new-custom row is invalid when its code collides with
  // the catalog. UI blocks save when any row has this error.
  const mappingErrors = useMemo(() => {
    const errs: Record<string, string> = {};
    for (const m of columnMappings) {
      if (!m.include || m.target.kind !== 'new') continue;
      if (!m.target.code) { errs[m.column] = 'Code required'; continue; }
      if (!/^[a-z0-9_]{1,20}$/.test(m.target.code)) {
        errs[m.column] = 'Code must be lowercase alphanumeric + underscore, max 20 chars';
        continue;
      }
      if (catalogCodes.has(m.target.code)) {
        errs[m.column] = `"${m.target.code}" is a catalog code — pick the catalog entry instead`;
        continue;
      }
    }
    return errs;
  }, [columnMappings, catalogCodes]);

  const hasMappingErrors = Object.keys(mappingErrors).length > 0;

  const updateMapping = (key: string, value: string) => {
    if (!file) return;
    setFile({ ...file, mapping: { ...file.mapping, [key]: value } });
  };

  // Build an UploadedFile from validated USGS measurements
  const buildUSGSFile = (measurements: USGSMeasurement[], label: string) => {
    const rows = measurements.map(m => {
      const gse = wellGseMap[m.siteId] || 0;
      const wteValue = gse > 0 ? Math.round((gse - Math.abs(m.value)) * 100) / 100 : m.value;
      return {
        well_id: m.siteId,
        date: m.date,
        value: String(wteValue),
        aquifer_id: singleUnit ? '0' : (wellAquiferMap[m.siteId] || '')
      };
    });
    setFile({
      name: label,
      data: rows,
      columns: ['well_id', 'date', 'value', 'aquifer_id'],
      mapping: { well_id: 'well_id', date: 'date', value: 'value', aquifer_id: 'aquifer_id' },
      type: 'csv'
    });
    const span = computeDataSpan(measurements);
    setDataSpan(span);
    setTrimStartDate(span.minDate);
    setTrimEndDate(span.maxDate);
    setIsTrimmed(false);
  };

  // USGS measurement download — shared across all three modes
  const handleUSGSDownload = async () => {
    setUsgsIsLoading(true);
    setError('');
    setFile(null);
    setDataSpan(null);
    setIsTrimmed(false);
    setQuickRefreshCutoff('');
    setUsgsProgress({ completed: 0, total: 0, done: false });
    try {
      // Get well IDs from wells.csv
      const wellRes = await freshFetch(`/data/${regionId}/wells.csv`);
      if (!wellRes.ok) throw new Error('No wells found. Import wells first.');
      const wellText = await wellRes.text();
      const { rows: wellRows } = parseCSV(wellText);
      const wellIds = wellRows
        .filter(r => usgsScope === 'aquifer' ? r.aquifer_id === usgsScopeAquiferId : true)
        .map(r => r.well_id).filter(Boolean);

      if (wellIds.length === 0) throw new Error('No well IDs found in wells.csv');

      // Filter to USGS site IDs: accept "USGS-" prefixed or bare numeric (8-15 digit) IDs
      // Build mapping from API-format siteId → wells.csv well_id
      const apiToWellId: Record<string, string> = {};
      for (const id of wellIds) {
        if (id.startsWith('USGS-')) {
          apiToWellId[id] = id;
        } else if (/^\d{8,15}$/.test(id)) {
          apiToWellId[`USGS-${id}`] = id;
        }
      }
      const usgsSiteIds = Object.keys(apiToWellId);
      if (usgsSiteIds.length === 0) throw new Error('No USGS site IDs found. Wells must have "USGS-" prefix or be 8-15 digit numeric IDs.');

      setUsgsProgress({ completed: 0, total: usgsSiteIds.length, done: false });

      const rawMeasurements = await fetchUSGSMeasurements(usgsSiteIds, (completed, total) => {
        setUsgsProgress({ completed, total, done: false });
      });

      // Remap siteIds back to wells.csv well_id format
      for (const m of rawMeasurements) {
        m.siteId = apiToWellId[m.siteId] || m.siteId;
      }

      // Validate and clean data
      const { measurements, report } = validateUSGSMeasurements(rawMeasurements);
      setQualityReport(report);
      setRawUSGSMeasurements(measurements);

      // Mode-specific post-processing
      let filtered = measurements;

      if (usgsMode === 'quick-refresh') {
        // Find max existing date for USGS wells
        try {
          const dataRes = await freshFetch(`/data/${regionId}/data_wte.csv`);
          if (dataRes.ok) {
            const dataText = await dataRes.text();
            const { rows: dataRows } = parseCSV(dataText);
            const usgsDateSet = new Set(Object.values(apiToWellId));
            const usgsRows = dataRows.filter(r => usgsDateSet.has(r.well_id));
            if (usgsRows.length > 0) {
              const dates = usgsRows.map(r => r.date).filter(Boolean).sort();
              const cutoff = dates[dates.length - 1];
              setQuickRefreshCutoff(cutoff);
              filtered = measurements.filter(m => m.date > cutoff);
            }
          }
        } catch {}
      }
      // full-refresh: no filtering — all records go to merge at save time
      // fresh: no filtering

      const label = !hasExistingData || usgsMode === 'fresh' ? 'USGS Measurements' : `USGS ${usgsMode === 'quick-refresh' ? 'Quick' : 'Full'} Refresh`;
      buildUSGSFile(filtered, label);
      setSelectedTypes(['wte']);
      setIsMultiType(false);
      setUsgsProgress({ completed: usgsSiteIds.length, total: usgsSiteIds.length, done: true });
    } catch (err) {
      setError(`USGS download failed: ${err}`);
    }
    setUsgsIsLoading(false);
  };

  // Apply date range trim to USGS data
  const handleTrim = () => {
    if (rawUSGSMeasurements.length === 0) return;
    let filtered = rawUSGSMeasurements;

    // Re-apply mode filter first (quick-refresh cutoff)
    if (usgsMode === 'quick-refresh' && quickRefreshCutoff) {
      filtered = filtered.filter(m => m.date > quickRefreshCutoff);
    }

    // Then apply date range
    filtered = filterByDateRange(filtered, trimStartDate || null, trimEndDate || null);

    buildUSGSFile(filtered, 'USGS Measurements (Trimmed)');
    setIsTrimmed(true);
  };

  // Build SourceWellRow[] by deduplicating the CSV on well identity.
  // One match decision per unique well, not per measurement row.
  const buildSourceWells = () => {
    if (!file) return [];
    const rows = file.data as Record<string, string>[];
    const wellIdCol = file.mapping['well_id'];
    const wellNameCol = file.mapping['well_name'];
    const latCol = file.mapping['lat'];
    const longCol = file.mapping['long'];
    const seen = new Map<string, { sourceIndex: number; wellId?: string; wellName?: string; lat?: number; lng?: number }>();
    rows.forEach((r, i) => {
      const wellId = wellIdCol ? (r[wellIdCol] || '').trim() : '';
      const wellName = wellNameCol ? (r[wellNameCol] || '').trim() : '';
      const latRaw = latCol ? r[latCol] : '';
      const lngRaw = longCol ? r[longCol] : '';
      const lat = latRaw ? parseFloat(latRaw) : undefined;
      const lng = lngRaw ? parseFloat(lngRaw) : undefined;
      // Dedup key: prefer id, then name, then coord pair
      const key = wellId || wellName || (lat !== undefined && lng !== undefined ? `${lat.toFixed(5)}|${lng.toFixed(5)}` : '');
      if (!key || seen.has(key)) return;
      seen.set(key, {
        sourceIndex: i,
        wellId: wellId || undefined,
        wellName: wellName || undefined,
        lat: lat !== undefined && !isNaN(lat) ? lat : undefined,
        lng: lng !== undefined && !isNaN(lng) ? lng : undefined,
      });
    });
    return Array.from(seen.values());
  };

  const runWellMatching = () => {
    if (!file) return;
    setIsMatching(true);
    try {
      const sources = buildSourceWells();
      const results = matchWells(sources, existingWellsFull, { proximityMeters });
      setMatchResults(results);
      setMatchSummary(summarizeMatches(results));
    } finally {
      setIsMatching(false);
    }
  };

  // Toggle rejection of a single proximity match (user wants it treated as new)
  const toggleRejectMatch = (sourceIndex: number) => {
    if (!matchResults) return;
    const updated = matchResults.map(r => {
      if (r.sourceRow.sourceIndex !== sourceIndex) return r;
      const rejected = !r.rejected;
      return {
        ...r,
        rejected,
        // When rejected a proximity match becomes a "new" well if it has coords
        kind: rejected ? ('new' as const) : r.kind,
        resolvedWellId: rejected ? null : (r.existingWell?.well_id ?? null),
      };
    });
    setMatchResults(updated);
    setMatchSummary(summarizeMatches(updated));
  };

  const resolveAquiferId = (row: Record<string, string>): string => {
    if (singleUnit) return '0';
    switch (aquiferAssignment) {
      case 'from-wells': {
        const wellId = row[file?.mapping['well_id'] || 'well_id'];
        return wellAquiferMap[wellId] || '';
      }
      case 'single':
        return selectedAquiferId;
      case 'csv-field': {
        const col = file?.mapping['aquifer_id'];
        return col ? row[col] || '' : '';
      }
      default: return '';
    }
  };

  const doSave = async () => {
    if (!file) return;
    setIsSaving(true);
    setError('');
    try {
      const allRows = file.data as Record<string, string>[];
      const wellIdCol = file.mapping['well_id'];
      const wellNameCol = file.mapping['well_name'];
      const latCol = file.mapping['lat'];
      const longCol = file.mapping['long'];
      const dateCol = file.mapping['date'];

      // --- Well resolution: build a per-row wellId that accounts for match
      // results (existing wells) and new wells created during import ----
      const filesToSave: { path: string; content: string }[] = [];
      const rowIdentityKey = (r: Record<string, string>): string => {
        const id = wellIdCol ? (r[wellIdCol] || '').trim() : '';
        if (id) return id;
        const name = wellNameCol ? (r[wellNameCol] || '').trim() : '';
        if (name) return name;
        const lat = latCol ? r[latCol] : '';
        const lng = longCol ? r[longCol] : '';
        if (lat && lng) return `${parseFloat(lat).toFixed(5)}|${parseFloat(lng).toFixed(5)}`;
        return '';
      };

      // Compose identityKey → final wellId (and track aquifer lookup)
      const identityToWellId = new Map<string, string>();
      const newWellRecords: ExistingWell[] = [];
      const takenIds = new Set<string>(existingWellsFull.map(w => w.well_id));

      if (matchResults && matchResults.length > 0) {
        // For rows with existing matches, use the existing well_id
        for (const r of matchResults) {
          const srcKey = r.sourceRow.wellId || r.sourceRow.wellName || (r.sourceRow.lat !== undefined && r.sourceRow.lng !== undefined ? `${r.sourceRow.lat.toFixed(5)}|${r.sourceRow.lng.toFixed(5)}` : '');
          if (!srcKey) continue;
          if (r.resolvedWellId && !r.rejected) {
            identityToWellId.set(srcKey, r.resolvedWellId);
          }
        }

        // Collect new wells (kind='new' or rejected proximity) and
        // create aqx- records for them
        const newRows = matchResults.filter(r => (r.kind === 'new' || r.rejected) && r.sourceRow.lat !== undefined && r.sourceRow.lng !== undefined);
        if (newRows.length > 0) {
          const gseInput = newRows.map((r, i) => ({
            id: `__new_${i}`,
            lat: r.sourceRow.lat!,
            lng: r.sourceRow.lng!,
          }));
          setNewWellsGseProgress({ done: 0, total: newRows.length });
          const gse = await fetchGseBatch(gseInput, {
            lengthUnit,
            onProgress: (done, total) => setNewWellsGseProgress({ done, total }),
          });

          newRows.forEach((r, i) => {
            const srcKey = r.sourceRow.wellId || r.sourceRow.wellName || `${r.sourceRow.lat!.toFixed(5)}|${r.sourceRow.lng!.toFixed(5)}`;
            const aqx = generateAqxId(r.sourceRow.wellName || null, r.sourceRow.lat!, r.sourceRow.lng!, takenIds);
            takenIds.add(aqx);
            const aquiferId = singleUnit
              ? '0'
              : (aquifersGeojson ? (assignWellToAquifer(r.sourceRow.lat!, r.sourceRow.lng!, aquifersGeojson) || '') : '');
            const elev = gse.values.get(`__new_${i}`) ?? 0;
            const rec: ExistingWell = {
              well_id: aqx,
              well_name: r.sourceRow.wellName || aqx,
              lat: r.sourceRow.lat!,
              lng: r.sourceRow.lng!,
              aquifer_id: aquiferId,
              gse: elev,
            };
            newWellRecords.push(rec);
            identityToWellId.set(srcKey, aqx);
          });
        }
      }

      // Fallback for rows not touched by matching: trust the CSV well_id
      // (original behavior). This covers the happy path where wells already
      // exist and the user didn't run matching.
      const knownWellIds = new Set([
        ...Object.keys(wellAquiferMap),
        ...newWellRecords.map(w => w.well_id),
      ]);

      // If matching ran, expand the known set with the resolved IDs so rows pass the filter
      for (const wid of identityToWellId.values()) knownWellIds.add(wid);

      // Per-row resolver: take original well_id, fall back to identity lookup
      const rowToWellId = (r: Record<string, string>): string => {
        const rawId = wellIdCol ? (r[wellIdCol] || '').trim() : '';
        if (rawId && knownWellIds.has(rawId)) return rawId;
        const key = rowIdentityKey(r);
        return identityToWellId.get(key) || rawId;
      };

      // Filter out measurements whose wells can't be resolved to a real well
      const rows = knownWellIds.size > 0
        ? allRows.filter(r => {
            const wid = rowToWellId(r);
            return wid && knownWellIds.has(wid);
          })
        : allRows;

      // --- Build extended aquifer lookup including new wells
      const effectiveWellAquiferMap: Record<string, string> = { ...wellAquiferMap };
      for (const w of newWellRecords) effectiveWellAquiferMap[w.well_id] = w.aquifer_id || '0';

      // Override resolveAquiferId's 'from-wells' path via a closure replacement
      const resolveAquifer = (row: Record<string, string>): string => {
        if (singleUnit) return '0';
        switch (aquiferAssignment) {
          case 'from-wells': {
            const wid = rowToWellId(row);
            return effectiveWellAquiferMap[wid] || '';
          }
          case 'single':
            return selectedAquiferId;
          case 'csv-field': {
            const col = file.mapping['aquifer_id'];
            return col ? row[col] || '' : '';
          }
          default: return '';
        }
      };

      // Effective GSE lookup used by depth→elevation conversion (new wells
      // included)
      const effectiveGseMap: Record<string, number> = { ...wellGseMap };
      for (const w of newWellRecords) if (w.gse) effectiveGseMap[w.well_id] = w.gse;

      if (isMultiType && selectedTypes.length > 1) {
        for (const typeCode of selectedTypes) {
          const valueCol = typeColumnMapping[typeCode];
          if (!valueCol) continue;

          const isWteDepth = typeCode === 'wte' && wteIsDepth;

          let processed = rows
            .filter(r => rowToWellId(r) && r[dateCol] && r[valueCol])
            .map(r => {
              const wid = rowToWellId(r);
              let val = r[valueCol];
              if (isWteDepth) {
                const gse = effectiveGseMap[wid] || 0;
                const raw = parseFloat(val);
                if (!isNaN(raw) && gse > 0) {
                  val = String(Math.round((gse - Math.abs(raw)) * 100) / 100);
                }
              }
              return {
                well_id: wid,
                date: parseDate(r[dateCol], dateFormat),
                value: val,
                aquifer_id: resolveAquifer(r),
              };
            });

          if (importMode === 'append') {
            processed = await mergeWithExisting(typeCode, processed);
          }

          const csv = 'well_id,date,value,aquifer_id\n' +
            processed.map(m => `${m.well_id},${m.date},${m.value},${m.aquifer_id}`).join('\n');
          filesToSave.push({ path: `${regionId}/data_${typeCode}.csv`, content: csv });
        }
      } else {
        // Single type
        const typeCode = selectedTypes[0] || 'wte';
        const valueCol = file.mapping['value'];
        const isWteDepth = typeCode === 'wte' && wteIsDepth;

        let processed = rows
          .filter(r => rowToWellId(r) && r[dateCol] && r[valueCol])
          .map(r => {
            const wid = rowToWellId(r);
            let val = r[valueCol];
            if (isWteDepth) {
              const gse = effectiveGseMap[wid] || 0;
              const raw = parseFloat(val);
              if (!isNaN(raw) && gse > 0) {
                val = String(Math.round((gse - Math.abs(raw)) * 100) / 100);
              }
            }
            return {
              well_id: wid,
              date: parseDate(r[dateCol], dateFormat),
              value: val,
              aquifer_id: resolveAquifer(r),
            };
          });

        // Merge/overwrite logic depends on source and mode
        if (dataSource === 'usgs') {
          if (usgsMode === 'fresh' && importMode === 'replace') {
            // Overwrite — no merge needed
          } else if (usgsMode === 'full-refresh') {
            processed = await mergeWithExistingFullRefresh(typeCode, processed);
          } else {
            processed = await mergeWithExisting(typeCode, processed);
          }
        } else if (importMode === 'append') {
          processed = await mergeWithExisting(typeCode, processed);
        }

        const csv = 'well_id,date,value,aquifer_id\n' +
          processed.map(m => `${m.well_id},${m.date},${m.value},${m.aquifer_id}`).join('\n');
        filesToSave.push({ path: `${regionId}/data_${typeCode}.csv`, content: csv });
      }

      // --- Persist new wells (if any) by appending to wells.csv ---
      if (newWellRecords.length > 0) {
        // Read existing wells.csv to preserve header/columns; fall back to building from existingWellsFull
        let existingText = '';
        try {
          const res = await freshFetch(`/data/${regionId}/wells.csv`);
          if (res.ok) existingText = await res.text();
        } catch {}
        const header = 'well_id,well_name,lat,long,gse,aquifer_id,aquifer_name';
        const existingLines = existingText.trim().split('\n').filter(Boolean);
        const bodyLines = existingLines.length > 0 ? existingLines.slice(1) : [];
        const aquiferNameById = new Map<string, string>(aquiferList.map(a => [a.id, a.name]));
        const newLines = newWellRecords.map(w => {
          const aquiferName = aquiferNameById.get(w.aquifer_id) || '';
          return `${w.well_id},"${(w.well_name || '').replace(/"/g, '""')}",${w.lat},${w.lng},${w.gse},${w.aquifer_id},"${aquiferName.replace(/"/g, '""')}"`;
        });
        filesToSave.push({
          path: `${regionId}/wells.csv`,
          content: [header, ...bodyLines, ...newLines].join('\n'),
        });
      }

      // --- Persist new custom data types (if any) by updating region.json.
      // Catalog-backed types don't need to be recorded — they become
      // effective automatically when their CSV file exists.
      if (newCustomTypesToAdd.length > 0) {
        const updatedCustom = [...customDataTypes, ...newCustomTypesToAdd];
        const meta: RegionMeta = { id: regionId, name: regionName, lengthUnit, singleUnit, customDataTypes: updatedCustom };
        filesToSave.push({ path: `${regionId}/region.json`, content: JSON.stringify(meta, null, 2) });
      }

      await saveFiles(filesToSave);
      onComplete();
    } catch (err) {
      setError(`Failed to save: ${err}`);
    }
    setIsSaving(false);
  };

  const mergeWithExisting = async (
    typeCode: string,
    newRows: { well_id: string; date: string; value: string; aquifer_id: string }[]
  ) => {
    try {
      const res = await freshFetch(`/data/${regionId}/data_${typeCode}.csv`);
      if (res.ok) {
        const text = await res.text();
        const { rows: existingRows } = parseCSV(text);
        const existingKeys = new Set(
          existingRows.map(r => `${r.well_id}|${r.date}|${r.aquifer_id}`)
        );
        const toAdd = newRows.filter(r => !existingKeys.has(`${r.well_id}|${r.date}|${r.aquifer_id}`));

        return [
          ...existingRows.map(r => ({
            well_id: r.well_id,
            date: r.date,
            value: r.value,
            aquifer_id: r.aquifer_id || ''
          })),
          ...toAdd
        ];
      }
    } catch {}
    return newRows;
  };

  const mergeWithExistingFullRefresh = async (
    typeCode: string,
    newRows: { well_id: string; date: string; value: string; aquifer_id: string }[]
  ) => {
    try {
      const res = await freshFetch(`/data/${regionId}/data_${typeCode}.csv`);
      if (res.ok) {
        const text = await res.text();
        const { rows: existingRows } = parseCSV(text);

        // Build lookup from new data for fast matching
        const newLookup = new Map<string, { value: string; aquifer_id: string }>();
        for (const r of newRows) {
          newLookup.set(`${r.well_id}|${r.date}`, { value: r.value, aquifer_id: r.aquifer_id });
        }

        // Update existing rows if matching key found in new data
        const usedKeys = new Set<string>();
        const merged = existingRows.map(r => {
          const key = `${r.well_id}|${r.date}`;
          const update = newLookup.get(key);
          if (update) {
            usedKeys.add(key);
            return { well_id: r.well_id, date: r.date, value: update.value, aquifer_id: r.aquifer_id || update.aquifer_id };
          }
          return { well_id: r.well_id, date: r.date, value: r.value, aquifer_id: r.aquifer_id || '' };
        });

        // Append new rows not already in existing data (backfills)
        for (const r of newRows) {
          const key = `${r.well_id}|${r.date}`;
          if (!usedKeys.has(key)) {
            merged.push(r);
          }
        }

        return merged;
      }
    } catch {}
    return newRows;
  };

  const handleSave = () => {
    if (importMode === 'replace' && hasExistingData) {
      setShowReplaceConfirm(true);
    } else {
      doSave();
    }
  };

  const toggleType = (code: string) => {
    setSelectedTypes(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  // Compute unmatched well info — only surfaces warnings for IDs that
  // weren't handled by the smart-matching pipeline.
  const unmatchedInfo = useMemo(() => {
    if (!file) return null;
    const rows = file.data as Record<string, string>[];
    const wellIdCol = file.mapping['well_id'];
    if (!wellIdCol || rows.length === 0) return null;

    const knownWellIds = new Set(Object.keys(wellAquiferMap));
    if (knownWellIds.size === 0) return null;

    // If matching ran, consider wells resolved via match results (existing + new) as "known"
    const resolvedFromMatch = new Set<string>();
    if (matchResults) {
      for (const r of matchResults) {
        if (r.rejected) continue;
        if (r.resolvedWellId) resolvedFromMatch.add(r.resolvedWellId);
        if (r.sourceRow.wellId) resolvedFromMatch.add(r.sourceRow.wellId); // source id covered
      }
    }

    const unmatchedWellIds = new Set<string>();
    let unmatchedCount = 0;
    let matchedCount = 0;

    for (const row of rows) {
      const wellId = row[wellIdCol];
      if (!wellId) continue;
      if (knownWellIds.has(wellId) || resolvedFromMatch.has(wellId)) {
        matchedCount++;
      } else {
        unmatchedWellIds.add(wellId);
        unmatchedCount++;
      }
    }

    if (unmatchedCount === 0) return null;

    return {
      unmatchedWellIds: Array.from(unmatchedWellIds),
      unmatchedCount,
      matchedCount,
    };
  }, [file, wellAquiferMap, matchResults]);

  const hasSmartColumns = !!(file && (file.mapping['lat'] || file.mapping['long'] || file.mapping['well_name']));
  const hasMatchResults = !!matchResults && matchResults.length > 0;
  const isBootstrap = existingWellCount === 0;

  // Row identity: legacy flow needs a well_id column; smart flow accepts
  // any of well_id / well_name / (lat + long).
  const hasRowIdentity = !!file && (
    !!file.mapping['well_id'] ||
    (hasWellColumns && (!!file.mapping['well_name'] || (!!file.mapping['lat'] && !!file.mapping['long'])))
  );

  const isReady = file && file.mapping['date'] &&
    (hasRowIdentity || hasMatchResults || isBootstrap) &&
    (isMultiType ? selectedTypes.every(code => typeColumnMapping[code]) : file.mapping['value']) &&
    selectedTypes.length > 0 &&
    (singleUnit || aquiferAssignment !== 'single' || selectedAquiferId) &&
    (!unmatchedInfo || unmatchedInfo.matchedCount > 0 || hasMatchResults) &&
    !hasMappingErrors;

  return (
    <div className="fixed inset-0 z-[105] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Add Measurements</h2>
            <p className="text-sm text-slate-500">{regionName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        {/* Data source */}
        {regionOverlapsUS && existingWellCount > 0 && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Data Source</label>
            <div className="flex gap-2">
              <button
                onClick={() => { setDataSource('upload'); setFile(null); }}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  dataSource === 'upload' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Upload size={14} /> Upload CSV
              </button>
              <button
                onClick={() => { setDataSource('usgs'); setFile(null); }}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  dataSource === 'usgs' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Download size={14} /> USGS Download
              </button>
            </div>
          </div>
        )}

        {/* Data type selection — legacy single/multi picker. Only appears
            when the detection panel has no candidate columns (e.g. a CSV
            with just well_id/date/value). When the detection panel has
            candidates it drives type selection and this picker is hidden. */}
        {dataSource === 'upload' && dataTypes.length > 0 && file && columnMappings.length === 0 && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Data Type(s)</label>
            {dataTypes.length > 1 && (
              <label className="flex items-center gap-2 mb-2 cursor-pointer">
                <input type="checkbox" checked={isMultiType}
                  onChange={e => {
                    setIsMultiType(e.target.checked);
                    if (!e.target.checked) setSelectedTypes([selectedTypes[0] || dataTypes[0]?.code || 'wte']);
                  }}
                  className="text-blue-600 rounded" />
                <span className="text-xs text-slate-600">Import multiple data types from one CSV</span>
              </label>
            )}
            {isMultiType ? (
              <div className="space-y-2">
                {dataTypes.length > 2 && (
                  <button
                    onClick={() => setSelectedTypes(
                      selectedTypes.length === dataTypes.length ? [] : dataTypes.map(dt => dt.code)
                    )}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    {selectedTypes.length === dataTypes.length ? 'Deselect All' : 'Select All'}
                  </button>
                )}
                {dataTypes.map(dt => (
                  <div key={dt.code}>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={selectedTypes.includes(dt.code)}
                        onChange={() => toggleType(dt.code)} className="text-blue-600 rounded" />
                      <span className="text-sm text-slate-700">{dt.name} ({dt.unit})</span>
                    </label>
                    {selectedTypes.includes(dt.code) && file && (
                      <select
                        value={typeColumnMapping[dt.code] || ''}
                        onChange={e => setTypeColumnMapping(prev => ({ ...prev, [dt.code]: e.target.value }))}
                        className="ml-6 mt-1 w-[calc(100%-1.5rem)] px-3 py-1.5 border border-slate-300 rounded-lg text-sm"
                      >
                        <option value="">-- Value column for {dt.code} --</option>
                        {file.columns.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {dataTypes.map(dt => (
                  <button
                    key={dt.code}
                    onClick={() => setSelectedTypes([dt.code])}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      selectedTypes[0] === dt.code
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {dt.name} ({dt.unit})
                  </button>
                ))}
              </div>
            )}

            {/* WTE depth option */}
            {selectedTypes.includes('wte') && (
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input type="checkbox" checked={wteIsDepth}
                  onChange={e => setWteIsDepth(e.target.checked)}
                  className="text-blue-600 rounded" />
                <span className="text-xs text-slate-600">Values are depth below ground surface (will convert to WTE using GSE)</span>
              </label>
            )}
          </div>
        )}

        {/* Import mode — show for upload and USGS when existing data */}
        {hasExistingData && (dataSource === 'upload' || dataSource === 'usgs') && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Import Mode</label>
            <div className="flex gap-2">
              <button
                onClick={() => { setImportMode('append'); if (dataSource === 'usgs') setUsgsMode('quick-refresh'); }}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  importMode === 'append' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                }`}
              >
                Append
              </button>
              <button
                onClick={() => { setImportMode('replace'); if (dataSource === 'usgs') setUsgsMode('fresh'); }}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  importMode === 'replace' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                }`}
              >
                Replace
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {importMode === 'append'
                ? 'New measurements will be added. Duplicates (by well_id + date) are skipped.'
                : `Replaces data for selected type(s): ${selectedTypes.join(', ')}`}
            </p>
          </div>
        )}

        {/* Aquifer assignment */}
        {!singleUnit && aquiferList.length > 0 && dataSource === 'upload' && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Aquifer Assignment</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="meas-aq" checked={aquiferAssignment === 'from-wells'}
                  onChange={() => setAquiferAssignment('from-wells')} className="text-blue-600" />
                <span className="text-sm text-slate-700">Look up from wells (by well_id)</span>
              </label>
              {aquiferList.length > 1 && (
                <>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="meas-aq" checked={aquiferAssignment === 'single'}
                      onChange={() => setAquiferAssignment('single')} className="text-blue-600" />
                    <span className="text-sm text-slate-700">Assign all to one aquifer</span>
                  </label>
                  {aquiferAssignment === 'single' && (
                    <select value={selectedAquiferId} onChange={e => setSelectedAquiferId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm ml-6">
                      <option value="">-- Select Aquifer --</option>
                      {aquiferList.map(a => (
                        <option key={a.id} value={a.id}>{a.name || a.id}</option>
                      ))}
                    </select>
                  )}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="meas-aq" checked={aquiferAssignment === 'csv-field'}
                      onChange={() => setAquiferAssignment('csv-field')} className="text-blue-600" />
                    <span className="text-sm text-slate-700">Use aquifer_id column from CSV</span>
                  </label>
                </>
              )}
            </div>
          </div>
        )}

        {/* Upload flow */}
        {dataSource === 'upload' && (
          <>
            <p className="text-sm text-slate-500 mb-3">Upload a CSV file with measurement data.</p>

            {/* Well location toggle — gates the smart well matching pipeline */}
            <label className="flex items-start gap-2 mb-3 p-3 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={hasWellColumns}
                onChange={e => { setHasWellColumns(e.target.checked); setMatchResults(null); setMatchSummary(null); }}
                className="mt-0.5 text-blue-600 rounded"
              />
              <div className="flex-1">
                <span className="text-sm font-medium text-slate-700">Measurements file includes well locations</span>
                <p className="text-xs text-slate-500 mt-0.5">
                  Turn on if your CSV has per-row well names or latitude/longitude columns. The importer will match rows to existing wells (by ID, name, or proximity) and can create new wells for unmatched coordinates. Leave off for simple well_id + date + value files.
                </p>
              </div>
            </label>

            <label className="block mb-4">
              <input type="file" accept=".csv,.txt" onChange={handleUpload}
                className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </label>
          </>
        )}

        {/* USGS mode selector */}
        {dataSource === 'usgs' && !file && (
          <div className="mb-4">
            <p className="text-sm text-slate-500 mb-3">
              Download water level measurements from USGS for wells with USGS site IDs. Depth values will be converted to water table elevation using GSE.
            </p>
            {/* Scope selector — only when multiple aquifers */}
            {aquiferList.length > 1 && (
              <div className="mb-3">
                <label className="block text-sm font-medium text-slate-700 mb-2">Download Scope</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="usgs-meas-scope" checked={usgsScope === 'region'}
                      onChange={() => { setUsgsScope('region'); setUsgsScopeAquiferId(''); }}
                      className="text-blue-600" />
                    <span className="text-sm text-slate-700">All wells in region</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="usgs-meas-scope" checked={usgsScope === 'aquifer'}
                      onChange={() => setUsgsScope('aquifer')}
                      className="text-blue-600" />
                    <span className="text-sm text-slate-700">Wells in selected aquifer</span>
                  </label>
                  {usgsScope === 'aquifer' && (
                    <select value={usgsScopeAquiferId} onChange={e => setUsgsScopeAquiferId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm ml-6">
                      <option value="">-- Select Aquifer --</option>
                      {aquiferList.map(a => (
                        <option key={a.id} value={a.id}>{a.name || a.id}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            )}
            {hasExistingData && importMode === 'append' && (
              <>
              <label className="block text-sm font-medium text-slate-700 mb-2">Refresh Mode</label>
              <div className="space-y-2 mb-4">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="radio" name="usgs-mode" checked={usgsMode === 'quick-refresh'}
                    onChange={() => setUsgsMode('quick-refresh')} className="text-blue-600 mt-0.5" />
                  <div>
                    <span className="text-sm text-slate-700 font-medium">Quick Refresh</span>
                    <p className="text-xs text-slate-500">Fetch all, keep only records newer than latest existing date.</p>
                  </div>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="radio" name="usgs-mode" checked={usgsMode === 'full-refresh'}
                    onChange={() => setUsgsMode('full-refresh')} className="text-blue-600 mt-0.5" />
                  <div>
                    <span className="text-sm text-slate-700 font-medium">Full Refresh</span>
                    <p className="text-xs text-slate-500">Fetch all, merge/deduplicate with existing data. Catches backfills.</p>
                  </div>
                </label>
              </div>
              </>
            )}
            {/* API key */}
            <div className="mb-3">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                API Key {!apiKey && <span className="text-amber-600 font-normal">(required for bulk downloads)</span>}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  onBlur={() => setUSGSApiKey(apiKey)}
                  placeholder="Paste your api.data.gov key"
                  className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-mono"
                />
              </div>
              {!apiKey && (
                <p className="text-xs text-slate-400 mt-1">
                  Without a key: 30 req/hour. With a key: 1,000 req/hour.{' '}
                  <a href="https://api.waterdata.usgs.gov/signup/" target="_blank" rel="noopener noreferrer"
                    className="text-blue-600 underline hover:text-blue-700">Get a free key</a>
                </p>
              )}
            </div>
            <button
              onClick={handleUSGSDownload}
              disabled={usgsIsLoading || (usgsScope === 'aquifer' && !usgsScopeAquiferId)}
              className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {usgsIsLoading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Downloading... ({usgsProgress.completed}/{usgsProgress.total} wells)
                </>
              ) : (
                <>
                  <Download size={14} /> Download USGS Measurements
                </>
              )}
            </button>
          </div>
        )}

        {/* Detected data types panel — per-column mapping editor */}
        {file && dataSource === 'upload' && columnMappings.length > 0 && (
          <div className="mb-4 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Wand2 size={14} className="text-indigo-600" />
                <span className="text-sm font-medium text-indigo-800">Map data columns</span>
              </div>
              <button
                onClick={() => setShowCatalogBrowser(true)}
                className="inline-flex items-center gap-1 text-xs text-indigo-700 hover:text-indigo-900 font-medium"
              >
                <BookOpen size={12} /> View Catalog
              </button>
            </div>
            <p className="text-xs text-indigo-700 mb-3">
              Each column from your CSV that looks like measurement data is listed below. Pick a target for each — a catalog parameter, an existing custom type, or a new custom. Uncheck anything you don't want to import.
            </p>
            <div className="flex items-center gap-2 mb-3 text-xs">
              <span className="text-slate-500">Bulk:</span>
              <button onClick={() => setAllMappingsInclude('all')} className="px-2 py-0.5 bg-white border border-indigo-200 rounded hover:bg-indigo-100 text-indigo-700">Include all</button>
              <button onClick={() => setAllMappingsInclude('catalogOnly')} className="px-2 py-0.5 bg-white border border-indigo-200 rounded hover:bg-indigo-100 text-indigo-700">Only catalog matches</button>
              <button onClick={() => setAllMappingsInclude('none')} className="px-2 py-0.5 bg-white border border-indigo-200 rounded hover:bg-indigo-100 text-indigo-700">None</button>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {columnMappings.map(m => {
                const resolved = mappingResolvedType(m);
                const targetValue = m.target.kind === 'catalog'
                  ? `catalog:${m.target.code}`
                  : m.target.kind === 'existingCustom'
                    ? `existingCustom:${m.target.code}`
                    : 'new';
                const unitMismatch = m.target.kind === 'catalog' && m.headerUnit && resolved && m.headerUnit.toLowerCase() !== resolved.unit.toLowerCase();
                const err = mappingErrors[m.column];
                return (
                  <div key={m.column} className={`p-2 rounded border ${m.include ? 'border-indigo-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-70'}`}>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={m.include}
                        onChange={e => setMappingInclude(m.column, e.target.checked)}
                        className="text-indigo-600 rounded"
                      />
                      <span className="flex-1 text-xs font-mono text-slate-700 truncate" title={m.column}>{m.column}</span>
                      <select
                        value={targetValue}
                        onChange={e => setMappingTarget(m.column, e.target.value)}
                        className="text-xs px-2 py-1 border border-slate-300 rounded bg-white max-w-[180px]"
                      >
                        <optgroup label="Catalog parameters">
                          {catalog && Object.keys(catalog.parameters)
                            .sort((a, b) => catalog.parameters[a].name.localeCompare(catalog.parameters[b].name))
                            .map(code => (
                              <option key={code} value={`catalog:${code}`}>{catalog.parameters[code].name}</option>
                            ))}
                        </optgroup>
                        {customDataTypes.length > 0 && (
                          <optgroup label="Region custom types">
                            {customDataTypes.map(dt => (
                              <option key={dt.code} value={`existingCustom:${dt.code}`}>{dt.name}</option>
                            ))}
                          </optgroup>
                        )}
                        <optgroup label="Other">
                          <option value="new">+ New custom type</option>
                        </optgroup>
                      </select>
                      {/* Unit display */}
                      {m.target.kind === 'catalog' && resolved && (
                        <span className="text-xs text-slate-500 min-w-[3rem] text-right">{resolved.unit || '—'}</span>
                      )}
                      {m.target.kind === 'existingCustom' && resolved && (
                        <span className="text-xs text-slate-500 min-w-[3rem] text-right">{resolved.unit || '—'}</span>
                      )}
                    </div>
                    {/* Warnings / errors / badges */}
                    {unitMismatch && (
                      <p className="mt-1 ml-6 text-[11px] text-amber-700">
                        header says <span className="font-mono">{m.headerUnit}</span>, catalog is <span className="font-mono">{resolved?.unit}</span> — verify your values before importing
                      </p>
                    )}
                    {m.target.kind === 'new' && (
                      <div className="mt-1 ml-6 space-y-1">
                        <div className="flex gap-2 items-center text-xs">
                          <label className="text-slate-500 w-10">Code</label>
                          <input
                            value={m.target.code}
                            onChange={e => updateNewCustom(m.column, 'code', e.target.value)}
                            className="flex-1 px-2 py-0.5 border border-slate-300 rounded font-mono"
                            placeholder="e.g. bod5"
                          />
                          <label className="text-slate-500 w-8">Name</label>
                          <input
                            value={m.target.name}
                            onChange={e => updateNewCustom(m.column, 'name', e.target.value)}
                            className="flex-1 px-2 py-0.5 border border-slate-300 rounded"
                            placeholder="e.g. BOD5"
                          />
                          <label className="text-slate-500 w-8">Unit</label>
                          <input
                            value={m.target.unit}
                            onChange={e => updateNewCustom(m.column, 'unit', e.target.value)}
                            className="w-16 px-2 py-0.5 border border-slate-300 rounded"
                            placeholder="mg/L"
                          />
                        </div>
                      </div>
                    )}
                    {err && <p className="mt-1 ml-6 text-[11px] text-red-600">{err}</p>}
                  </div>
                );
              })}
            </div>
            {newCustomTypesToAdd.length > 0 && (
              <p className="text-xs text-indigo-700 mt-2">
                {newCustomTypesToAdd.length} new custom type{newCustomTypesToAdd.length !== 1 ? 's' : ''} will be added to the region.
              </p>
            )}
          </div>
        )}

        {/* Smart well matching panel — only when lat/lng are mapped */}
        {file && dataSource === 'upload' && hasSmartColumns && (
          <div className="mb-4 p-4 bg-sky-50 border border-sky-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <MapPin size={14} className="text-sky-600" />
              <span className="text-sm font-medium text-sky-800">Well matching</span>
            </div>
            <p className="text-xs text-sky-700 mb-3">
              Match source rows to existing wells by ID, name, or proximity. Unmatched rows with coordinates become new wells.
            </p>
            <div className="flex items-center gap-2 mb-3">
              <label className="text-xs text-slate-600">Proximity threshold (m):</label>
              <input
                type="number"
                value={proximityMeters}
                min={1}
                max={5000}
                onChange={e => setProximityMeters(Math.max(1, parseInt(e.target.value || '100', 10)))}
                className="w-20 px-2 py-1 border border-sky-200 rounded text-xs"
              />
              <button
                onClick={runWellMatching}
                disabled={isMatching}
                className="ml-auto px-3 py-1.5 bg-sky-600 text-white rounded text-xs font-medium hover:bg-sky-700 disabled:opacity-50 flex items-center gap-1"
              >
                {isMatching && <Loader2 size={12} className="animate-spin" />}
                {matchResults ? 'Re-match' : 'Match wells'}
              </button>
            </div>
            {matchSummary && (
              <div className="space-y-2">
                <div className="grid grid-cols-5 gap-1 text-center text-xs">
                  <div className="p-1.5 bg-white rounded border border-slate-200"><div className="font-bold text-slate-800">{matchSummary.byId}</div><div className="text-[10px] text-slate-500">by ID</div></div>
                  <div className="p-1.5 bg-white rounded border border-slate-200"><div className="font-bold text-slate-800">{matchSummary.byName}</div><div className="text-[10px] text-slate-500">by name</div></div>
                  <div className="p-1.5 bg-white rounded border border-slate-200"><div className="font-bold text-slate-800">{matchSummary.byProximity}</div><div className="text-[10px] text-slate-500">by proximity</div></div>
                  <div className="p-1.5 bg-white rounded border border-slate-200"><div className="font-bold text-green-700">{matchSummary.newWells}</div><div className="text-[10px] text-slate-500">new</div></div>
                  <div className="p-1.5 bg-white rounded border border-slate-200"><div className={`font-bold ${matchSummary.unmatched > 0 ? 'text-red-600' : 'text-slate-400'}`}>{matchSummary.unmatched}</div><div className="text-[10px] text-slate-500">unmatched</div></div>
                </div>
                {matchResults && matchResults.some(r => r.kind === 'proximity' && !r.rejected) && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-sky-700 hover:text-sky-800">Review proximity matches ({matchResults.filter(r => r.kind === 'proximity' && !r.rejected).length})</summary>
                    <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                      {matchResults.filter(r => r.kind === 'proximity' && !r.rejected).map(r => (
                        <div key={r.sourceRow.sourceIndex} className="flex items-center gap-2 py-1 border-b border-sky-100 last:border-0">
                          <span className="flex-1 text-[11px] text-slate-700">
                            "{r.sourceRow.wellName || r.sourceRow.wellId || '(no name)'}" → <span className="font-medium">{r.existingWell?.well_name || r.existingWell?.well_id}</span>
                            <span className="text-slate-400"> · {Math.round(r.distanceMeters || 0)}m</span>
                          </span>
                          <button
                            onClick={() => toggleRejectMatch(r.sourceRow.sourceIndex)}
                            className="text-[10px] text-red-600 hover:text-red-800 font-medium"
                          >
                            Treat as new
                          </button>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
                {newWellsGseProgress.total > 0 && newWellsGseProgress.done < newWellsGseProgress.total && (
                  <p className="text-xs text-sky-700 flex items-center gap-1">
                    <Loader2 size={10} className="animate-spin" />
                    Fetching elevation for new wells ({newWellsGseProgress.done}/{newWellsGseProgress.total})
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {file && (
          <div className="mb-4">
            <div className="flex items-center gap-2 text-sm text-green-700 mb-2">
              <CheckCircle2 size={16} />
              {dataSource === 'usgs'
                ? `${(file.data as any[]).length} USGS measurements loaded`
                : `${file.name} (${(file.data as any[]).length} rows)`}
            </div>
            {dataSource === 'upload' && (
              <button onClick={() => setShowMapper(true)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                Edit Column Mapping
              </button>
            )}
            {unmatchedInfo && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg mt-2">
                <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-800">
                    {unmatchedInfo.unmatchedCount} measurement{unmatchedInfo.unmatchedCount !== 1 ? 's' : ''} from {unmatchedInfo.unmatchedWellIds.length} well{unmatchedInfo.unmatchedWellIds.length !== 1 ? 's' : ''} not found in wells.csv
                  </p>
                  <p className="text-xs text-amber-700 mt-1">
                    Unmatched well IDs: {unmatchedInfo.unmatchedWellIds.slice(0, 5).join(', ')}
                    {unmatchedInfo.unmatchedWellIds.length > 5 && ` and ${unmatchedInfo.unmatchedWellIds.length - 5} more`}
                  </p>
                  {unmatchedInfo.matchedCount > 0 ? (
                    <p className="text-xs text-green-700 mt-1">
                      {unmatchedInfo.matchedCount} matched measurement{unmatchedInfo.matchedCount !== 1 ? 's' : ''} will be imported.
                    </p>
                  ) : (
                    <p className="text-xs text-red-700 mt-1 font-medium">
                      No measurements match existing wells. Import cannot proceed.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Data Span Preview + Date Trimmer */}
        {dataSpan && dataSource === 'usgs' && file && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Calendar size={14} className="text-blue-600" />
              <span className="text-sm font-medium text-blue-800">Data Range</span>
            </div>
            <p className="text-sm text-slate-700 mb-1">
              {dataSpan.minDate} to {dataSpan.maxDate} — {dataSpan.totalRecords.toLocaleString()} measurements across {dataSpan.wellCount} wells
            </p>
            {usgsMode === 'quick-refresh' && quickRefreshCutoff && (
              <p className="text-xs text-amber-700 mb-2">Cutoff: showing only records after {quickRefreshCutoff}</p>
            )}
            <div className="flex items-end gap-2 mt-2">
              <div className="flex-1">
                <label className="block text-xs text-slate-500 mb-1">Start Date</label>
                <input type="date" value={trimStartDate} onChange={e => setTrimStartDate(e.target.value)}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm" />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-slate-500 mb-1">End Date</label>
                <input type="date" value={trimEndDate} onChange={e => setTrimEndDate(e.target.value)}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm" />
              </div>
              <button onClick={handleTrim}
                className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700">
                Trim
              </button>
            </div>
            {isTrimmed && (
              <p className="text-xs text-green-700 mt-2">Trimmed to {(file.data as any[]).length.toLocaleString()} measurements</p>
            )}
          </div>
        )}

        {/* USGS Data Quality Report */}
        {qualityReport && dataSource === 'usgs' && (
          <div className="mb-4 p-4 bg-slate-50 border border-slate-200 rounded-lg text-sm">
            <h4 className="font-semibold text-slate-700 mb-2">Data Quality Report</h4>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="text-center p-2 bg-white rounded border">
                <p className="text-lg font-bold text-slate-800">{qualityReport.totalRaw}</p>
                <p className="text-xs text-slate-500">Raw records</p>
              </div>
              <div className="text-center p-2 bg-white rounded border">
                <p className="text-lg font-bold text-green-600">{qualityReport.kept}</p>
                <p className="text-xs text-slate-500">Kept</p>
              </div>
              <div className="text-center p-2 bg-white rounded border">
                <p className={`text-lg font-bold ${qualityReport.dropped.count > 0 ? 'text-red-600' : 'text-slate-400'}`}>{qualityReport.dropped.count}</p>
                <p className="text-xs text-slate-500">Dropped</p>
              </div>
            </div>
            {qualityReport.fixed.count > 0 && (
              <div className="mb-2">
                <p className="text-xs font-medium text-amber-700 mb-1">
                  Fixed {qualityReport.fixed.count} record(s):
                </p>
                <ul className="text-xs text-slate-600 space-y-0.5 max-h-24 overflow-y-auto">
                  {qualityReport.fixed.details.map((d, i) => (
                    <li key={i} className="pl-2 border-l-2 border-amber-300">{d}</li>
                  ))}
                </ul>
              </div>
            )}
            {qualityReport.dropped.count > 0 && (
              <div>
                <p className="text-xs font-medium text-red-700 mb-1">
                  Dropped {qualityReport.dropped.count} record(s):
                </p>
                <ul className="text-xs text-slate-600 space-y-0.5 max-h-24 overflow-y-auto">
                  {qualityReport.dropped.details.map((d, i) => (
                    <li key={i} className="pl-2 border-l-2 border-red-300">{d}</li>
                  ))}
                </ul>
              </div>
            )}
            {qualityReport.fixed.count === 0 && qualityReport.dropped.count === 0 && (
              <p className="text-xs text-green-600">All records passed validation.</p>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={!isReady || isSaving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {isSaving && <Loader2 size={14} className="animate-spin" />}
            {isSaving ? 'Saving...' : 'Save Measurements'}
          </button>
        </div>
      </div>

      {showMapper && file && (
        <ColumnMapperModal
          file={file}
          fieldDefinitions={fieldDefs}
          onUpdateMapping={updateMapping}
          onClose={() => setShowMapper(false)}
          dateFormat={dateFormat}
          onDateFormatChange={setDateFormat}
          title="Map Measurement Columns"
        />
      )}

      {showReplaceConfirm && (
        <ConfirmDialog
          title="Replace Measurements?"
          message={`This will replace all existing measurement data for: ${selectedTypes.join(', ')}. This cannot be undone.`}
          confirmLabel="Replace"
          variant="danger"
          onConfirm={() => { setShowReplaceConfirm(false); doSave(); }}
          onCancel={() => setShowReplaceConfirm(false)}
        />
      )}

      {showCatalogBrowser && <CatalogBrowser onClose={() => setShowCatalogBrowser(false)} />}
    </div>
  );
};

export default MeasurementImporter;
