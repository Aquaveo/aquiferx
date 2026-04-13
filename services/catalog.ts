import { ParameterCatalog, CatalogParameter, DataType } from '../types';
import { freshFetch } from './importUtils';

let cachedCatalog: ParameterCatalog | null = null;

export async function loadCatalog(): Promise<ParameterCatalog> {
  if (cachedCatalog) return cachedCatalog;
  const res = await freshFetch('/data/catalog_wq.json');
  if (!res.ok) throw new Error(`Failed to load catalog_wq.json: ${res.status}`);
  cachedCatalog = (await res.json()) as ParameterCatalog;
  return cachedCatalog;
}

export function catalogToDataType(code: string, param: CatalogParameter): DataType {
  return { code, name: param.name, unit: param.unit };
}

export function groupCatalog(catalog: ParameterCatalog): Record<string, Array<{ code: string; param: CatalogParameter }>> {
  const groups: Record<string, Array<{ code: string; param: CatalogParameter }>> = {};
  for (const [code, param] of Object.entries(catalog.parameters)) {
    (groups[param.group] ||= []).push({ code, param });
  }
  for (const list of Object.values(groups)) {
    list.sort((a, b) => a.param.name.localeCompare(b.param.name));
  }
  return groups;
}
