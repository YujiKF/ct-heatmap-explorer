"""Export an ALREADY COMPUTED CT + native-grid attribution to the viewer contract.

No CT-LiPro import. No model execution. No threshold tuning. Positive heatmaps
must already be spatially restored to the CT's native grid (including crop/pad).
"""
from pathlib import Path
import argparse, json, re, hashlib
import numpy as np
from scipy import ndimage
from import_legacy import NAMES, write_array, body_mask, dump

def export_case(ct_path, map_paths, results_path, case_id, version, out, max_dim=160,
                normalization='Provided positive attribution in [0, 1]', method='Provided upstream', make_mask=True):
    import nibabel as nib
    if not re.fullmatch(r'[A-Za-z0-9_-]+',case_id): raise ValueError('Invalid case ID')
    if not version: raise ValueError('heatmap version is required')
    if max_dim<16 or max_dim>256: raise ValueError('max_dim must be 16–256')
    result=json.loads(Path(results_path).read_text()) if results_path else None
    if result and result.get('patient')!=case_id: raise ValueError('Results patient differs from case_id')
    ref=nib.load(ct_path)
    if len(ref.shape)!=3: raise ValueError('Expected a 3D CT')
    if not np.isfinite(ref.affine).all():raise ValueError('Nonfinite affine')
    canonical=nib.as_closest_canonical(ref)
    mat=canonical.affine[:3,:3]
    if np.max(np.abs(mat-np.diag(np.diag(mat))))>1e-4 or np.any(np.diag(mat)<=0):
        raise ValueError('Oblique/sheared CT: resample CT and maps together onto an axis-aligned RAS grid first. Do not discard the affine.')
    native=nib.orientations.io_orientation(ref.affine)
    transform=nib.orientations.ornt_transform(native,nib.orientations.axcodes2ornt(('R','A','S')))
    ct=canonical.get_fdata(dtype=np.float32)
    if not np.isfinite(ct).all():raise ValueError('Nonfinite CT')
    old_shape=np.array(ct.shape);new_shape=np.maximum(2,np.rint(old_shape*min(1.,max_dim/old_shape.max())).astype(int))
    ratio=old_shape/new_shape
    # Half-voxel mapping, align_corners=False. Account for the shift in the affine.
    def prepare(a):
        if tuple(new_shape)==a.shape:return a.astype(np.float32,copy=False)
        return ndimage.zoom(a,new_shape/old_shape,order=1,mode='nearest',grid_mode=True,prefilter=False).astype(np.float32)
    step=np.eye(4);step[:3,:3]=np.diag(ratio);step[:3,3]=.5*ratio-.5
    affine=canonical.affine@step
    folder=Path(out)/case_id
    catalog_path=Path(out)/'catalog.json'
    catalog=json.loads(catalog_path.read_text()) if catalog_path.exists() else dict(schema_version='pacs-inrad-catalog/1.0',cases=[])
    if any(c['case_id']==case_id for c in catalog['cases']):raise ValueError('Duplicate case in catalog')
    if (folder/'manifest.json').exists():raise FileExistsError('Case already exists. Use a new output directory, or add a version with add_heatmap.py.')
    folder.mkdir(parents=True,exist_ok=True)
    prepared=prepare(ct)
    classes=[dict(id=str(i),name_pt=n,score=None,logit=None,threshold=None,comparator='>=',decision=None,threshold_status='not_supplied',heatmaps=[]) for i,n in enumerate(NAMES)]
    if result:
        seen=set()
        for row in result['rows']:
            i=row['indice_classe']
            if i not in range(18) or i in seen:raise ValueError('Invalid or duplicate class index')
            seen.add(i)
            score=row['score'];threshold=row['threshold']
            if not np.isfinite(score) or not np.isfinite(threshold):raise ValueError('Nonfinite score/threshold')
            decision=score>=threshold
            if row.get('acima_corte',decision)!=decision:raise ValueError('Saved decision differs from score >= threshold')
            classes[i].update(name_pt=row.get('achado',NAMES[i]),name_en=row.get('classe'),score=score,threshold=threshold,
              logit=row.get('logit'),decision=decision,threshold_status=row.get('status_limiar','provided'),interpretation=row.get('interpretacao'))
    hashes={'ct_native_sha256':hashlib.sha256(Path(ct_path).read_bytes()).hexdigest(),'heatmaps':{}}
    for i,path in map_paths.items():
        if i not in range(18):raise ValueError('Invalid class index')
        h=nib.load(path)
        if h.shape!=ref.shape or not np.allclose(h.affine,ref.affine,atol=1e-4,rtol=0):
            raise ValueError(f'Class {i}: heatmap is not registered to the CT. Never resize a token grid directly to the CT.')
        raw=h.get_fdata(dtype=np.float32)
        if not np.isfinite(raw).all() or raw.min()<0 or raw.max()>1:raise ValueError('This exporter expects positive heatmaps in [0,1] without renormalization')
        values=prepare(nib.orientations.apply_orientation(raw,transform))
        classes[i]['heatmaps'].append(dict(version=version,method=method,normalization=normalization,
          display_range=[0,1],data=write_array(folder,f'class-{i:02d}.f32.gz',values,'<f4')))
        hashes['heatmaps'][str(i)]=hashlib.sha256(Path(path).read_bytes()).hexdigest()
    manifest=dict(schema_version='pacs-inrad-viewer/1.0',case_id=case_id,title=case_id,dataset='Provided',
      grid=dict(dimensions=[int(v) for v in new_shape],space='RAS',spacing=np.diag(affine[:3,:3]).tolist(),
                origin=affine[:3,3].tolist(),affine=affine.tolist(),orientation=['R','A','S'],geometry_verified=True),
      ct=write_array(folder,'ct.f32.gz',prepared,'<f4'),body_mask=None,classes=classes,
      provenance=dict(**hashes,source_affine=ref.affine.tolist(),source_shape=list(ref.shape),
        scores_and_thresholds_changed=False,heatmap_version=version,source_results_sha256=hashlib.sha256(Path(results_path).read_bytes()).hexdigest() if results_path else None,
        transformations=['Joint orientation to RAS by axis permutation/flips',
          f'Display downsampling {old_shape.tolist()} -> {new_shape.tolist()}; trilinear, half-voxel mapping; affine updated',
          'Float32 X-fastest binary; lossless gzip; no intensity clipping or normalization']),
      notices=['TC e atribuição reformatadas conjuntamente para exibição RAS.',
               'Interpolação para exibição não acrescenta resolução anatômica.'])
    if make_mask:
        mask=write_array(folder,'body.u8.gz',body_mask(prepared),'u1');mask['method']='CT > -500 HU; 2D closing, largest component, hole filling; display only';manifest['body_mask']=mask
    dump(folder/'manifest.json',manifest)
    catalog['cases'].append(dict(case_id=case_id,title=case_id,manifest=f'{case_id}/manifest.json',map_count=len(map_paths),has_ct=True))
    dump(catalog_path,catalog)
    return folder/'manifest.json'

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--ct',required=True,type=Path);p.add_argument('--case-id',required=True)
    p.add_argument('--heatmap',action='append',default=[],help='class index=path to restored NIfTI, repeatable')
    p.add_argument('--results',type=Path);p.add_argument('--heatmap-version',required=True)
    p.add_argument('--out',type=Path,default=Path('public/data'));p.add_argument('--max-dim',type=int,default=160)
    p.add_argument('--method',default='Provided upstream');p.add_argument('--no-body-mask',action='store_true')
    a=p.parse_args();maps={}
    for v in a.heatmap:
        k,path=v.split('=',1);i=int(k)
        if i in maps:raise ValueError('Repeated class')
        maps[i]=Path(path)
    print(export_case(a.ct,maps,a.results,a.case_id,a.heatmap_version,a.out,a.max_dim,method=a.method,make_mask=not a.no_body_mask))
