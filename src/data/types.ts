export type Vec3 = [number, number, number];
export interface Asset {
  url: string; dtype: 'int16' | 'float32' | 'uint8'; encoding: 'gzip' | 'raw';
  order: 'x-fastest'; byte_length: number; sha256: string;
  compressed_sha256?: string; scale: number; offset: number;
}
export interface Grid {
  dimensions: Vec3; space: 'index' | 'RAS'; spacing: Vec3 | null;
  origin: Vec3 | null; affine: number[][] | null;
  orientation: ['R', 'A', 'S'] | null; geometry_verified: boolean;
}
export interface Heatmap {
  version: string; method: string; normalization: string;
  display_range: [number, number]; data: Asset;
}
export interface Finding {
  id: string; name_pt: string; name_en?: string; score: number | null;
  logit: number | null; threshold: number | null; comparator: '>=' | '>';
  decision: boolean | null; threshold_status: string; interpretation?: string;
  heatmaps: Heatmap[];
}
export interface Manifest {
  schema_version: 'pacs-inrad-viewer/1.0'; case_id: string; title: string;
  dataset?: string; grid: Grid | null; ct: Asset | null;
  body_mask: (Asset & {method: string}) | null;
  classes: Finding[]; notices: string[]; provenance: Record<string, unknown>;
}
export interface CatalogEntry { case_id: string; title: string; manifest: string; map_count: number; has_ct: boolean }
export interface Catalog {schema_version: string; cases: CatalogEntry[]}
export type Scalars = Int16Array | Uint8Array | Float32Array;
export interface LoadedCase {manifest: Manifest; url: string; ct: Float32Array | null; body: Uint8Array | null}
export interface ViewSettings {
  anatomy: boolean; heat: boolean; anatomyOpacity: number; heatOpacity: number;
  visualThreshold: number; masked: boolean; windowCenter: number; windowWidth: number;
  anatomyPreset: 'lung' | 'bone' | 'tissue';
}
export const DEFAULT_SETTINGS: ViewSettings = {
  anatomy: true, heat: true, anatomyOpacity: .24, heatOpacity: .5,
  visualThreshold: 0, masked: false, windowCenter: -600, windowWidth: 1500,
  anatomyPreset: 'lung',
};
