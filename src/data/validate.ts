import type {Asset, Manifest, Finding} from './types';
const fail = (s: string): never => {throw new Error(`Contrato inválido: ${s}`)};
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export function compareFinding(c: Finding): boolean | null {
  return c.score === null || c.threshold === null ? null : c.comparator === '>' ? c.score > c.threshold : c.score >= c.threshold;
}
function asset(a: Asset, n: number) {
  if (!a || !['int16','uint8','float32'].includes(a.dtype) || !['raw','gzip'].includes(a.encoding) || a.order !== 'x-fastest') fail('tipo/ordem de volume');
  const bytes = a.dtype === 'uint8' ? 1 : a.dtype === 'int16' ? 2 : 4;
  if (a.byte_length !== n*bytes || !/^[a-f0-9]{64}$/.test(a.sha256)) fail('tamanho ou SHA-256');
  if (!finite(a.scale) || a.scale <= 0 || !finite(a.offset)) fail('scale/offset');
  if (typeof a.url !== 'string' || !a.url || a.url.startsWith('/') || /[:\\]|(^|\/)\.\.(\/|$)/.test(a.url)) fail('asset deve ser um caminho relativo local');
}
export function validateManifest(value: unknown): Manifest {
  const m = value as Manifest;
  if (!m || m.schema_version !== 'pacs-inrad-viewer/1.0' || !m.case_id) fail('versão/case_id');
  if (!Array.isArray(m.classes) || m.classes.length===0 || !Array.isArray(m.notices)) fail('classes/notices');
  if (m.ct && !m.grid) fail('TC sem geometria');
  if (m.grid && !m.ct || m.body_mask && !m.ct) fail('Grade/máscara sem TC');
  let n=0;
  if (m.grid) {
    const g=m.grid;
    if (g.dimensions.length !== 3 || !g.dimensions.every(d=>Number.isInteger(d)&&d>1&&d<=1024)) fail('dimensões');
    n=g.dimensions.reduce((a,b)=>a*b,1);
    if(n>256**3) fail('volume excede 256³ voxels; exporte uma resolução de visualização menor');
    if(g.space !== 'index' && g.space !== 'RAS') fail('espaço de coordenadas');
    if(g.space==='RAS') {
      if(!g.geometry_verified || !g.spacing?.every(s=>finite(s)&&s>0) || g.spacing.length!==3 || g.origin?.length!==3 || !g.origin.every(finite) || g.orientation?.join('')!=='RAS') fail('geometria RAS incompleta');
      const a=g.affine;
      if(!a || a.length!==4 || a.some(r=>r.length!==4 || !r.every(finite))) fail('affine RAS');
      for(let i=0;i<4;i++)for(let j=0;j<4;j++) {
        const expected=i===3?(j===3?1:0):j===3?g.origin![i]:i===j?g.spacing![i]:0;
        if(Math.abs(a![i][j]-expected)>1e-4)fail('grade RAS deve ser alinhada aos eixos; reformate volumes oblíquos antes de exportar');
      }
    } else if(g.geometry_verified || g.spacing!==null || g.affine!==null || g.origin!==null || g.orientation!==null) fail('geometria index deve declarar metadados físicos ausentes');
    if(m.ct)asset(m.ct,n);
    if(m.body_mask)asset(m.body_mask,n);
  }
  const ids=new Set<string>();
  for(const c of m.classes) {
    if(!c.id || ids.has(c.id) || !c.name_pt)fail('classe duplicada/inválida');ids.add(c.id);
    for(const k of ['score','threshold','logit'] as const)if(c[k]!==null && !finite(c[k]))fail(`${k} não finito`);
    if(!['>=','>'].includes(c.comparator)||!Array.isArray(c.heatmaps))fail('comparador/heatmaps');
    if(c.decision!==null && c.decision!==compareFinding(c))fail('decisão diverge de score/threshold');
    const versions=new Set<string>();
    for(const h of c.heatmaps) {
      if(!n || !m.ct || !h.version || versions.has(h.version))fail('heatmap sem TC/grade ou versão duplicada');
      versions.add(h.version);asset(h.data,n);
      if(h.display_range.length!==2 || !h.display_range.every(finite) || h.display_range[0]!==0 || h.display_range[1]<=0)fail('v1 exige atribuição não negativa com display_range [0, máximo]');
    }
  }
  return m;
}
