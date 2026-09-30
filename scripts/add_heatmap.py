"""Append a new heatmap version already prepared on an existing DISPLAY grid.
Accepts a .npy XYZ array; requires exact grid descriptor and declared case identity.
This deliberately does not guess geometry from array dimensions alone.
"""
from pathlib import Path
import argparse,json,hashlib,re
import numpy as np
from import_legacy import dump,write_array

def add(manifest_path,array_path,grid_path,case_id,class_id,version,method):
    p=Path(manifest_path);m=json.loads(p.read_text());g=json.loads(Path(grid_path).read_text())
    if m['case_id']!=case_id:raise ValueError('Case identity mismatch')
    if not m['ct'] or not m['grid'] or g!=m['grid']:raise ValueError('Exact display grid required, including affine/spacing/orientation')
    c=next((x for x in m['classes'] if x['id']==str(class_id)),None)
    if not c:raise ValueError('Class not found')
    if not re.fullmatch(r'[A-Za-z0-9._-]+',version):raise ValueError('Use a simple version name')
    if any(h['version']==version for h in c['heatmaps']):raise ValueError('Version exists. Refusing overwrite')
    a=np.load(array_path,allow_pickle=False)
    if a.shape!=tuple(g['dimensions']) or not np.isfinite(a).all() or a.min()<0 or a.max()>1:raise ValueError('Expected finite XYZ display-grid array in [0,1]')
    target=f'class-{class_id}-{version}.f32.gz'
    if (p.parent/(target+'.bin')).exists():raise ValueError('Asset file already exists')
    descriptor=write_array(p.parent,target,a,'<f4')
    c['heatmaps'].append(dict(version=version,method=method,normalization='Provided [0,1]; no viewer renormalization',display_range=[0,1],data=descriptor,source_sha256=hashlib.sha256(Path(array_path).read_bytes()).hexdigest()))
    dump(p,m)
    catalog_path=p.parent.parent/'catalog.json'
    if catalog_path.exists():
        catalog=json.loads(catalog_path.read_text())
        for case in catalog['cases']:
            if case['case_id']==case_id:case['map_count']=sum(bool(c['heatmaps']) for c in m['classes'])
        dump(catalog_path,catalog)
    return p

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for arg in ['manifest','array','grid','case-id','class-id','version','method']:p.add_argument('--'+arg,required=True)
    a=p.parse_args();print(add(a.manifest,a.array,a.grid,a.case_id,a.class_id,a.version,a.method))
