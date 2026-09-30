"""Extract the supplied legacy HTML data without executing HTML/JavaScript.
No inference, recalibration, spatial resampling or attribution normalization.
"""
from pathlib import Path
import argparse, base64, gzip, hashlib, json, re, zipfile
import numpy as np
from scipy import ndimage

NAMES = ['Material médico', 'Calcificação da parede arterial', 'Cardiomegalia',
 'Derrame pericárdico', 'Calcificação da parede coronariana', 'Hérnia hiatal',
 'Linfonodomegalia', 'Enfisema', 'Atelectasia', 'Nódulo pulmonar',
 'Opacidade pulmonar', 'Sequela fibrótica pulmonar', 'Derrame pleural',
 'Atenuação em mosaico', 'Espessamento peribrônquico', 'Consolidação',
 'Bronquiectasia', 'Espessamento dos septos interlobulares']

def sha(b): return hashlib.sha256(b).hexdigest()
def dump(p, data):
    p.parent.mkdir(parents=True, exist_ok=True)
    temp=p.with_name(p.name+'.tmp')
    temp.write_text(json.dumps(data, indent=2, ensure_ascii=False, allow_nan=False)+'\n', encoding='utf-8')
    temp.replace(p)

def write_array(folder, name, xyz, dtype, scale=1):
    """Binary contract: little-endian, X fastest. Values retained exactly."""
    # Avoid servers interpreting the file's gzip suffix as HTTP content encoding.
    if name.endswith('.gz'): name += '.bin'
    raw = np.asarray(xyz, dtype=dtype).transpose(2,1,0).copy().tobytes()
    packed = gzip.compress(raw, mtime=0)
    (folder/name).write_bytes(packed)
    return dict(url=name, dtype={'<i2':'int16','u1':'uint8','<f4':'float32'}[dtype],
                encoding='gzip', order='x-fastest', byte_length=len(raw),
                sha256=sha(raw), compressed_sha256=sha(packed), scale=scale, offset=0)

def body_mask(xyz):
    """Optional approximate display mask. Never applied to scientific arrays."""
    out=np.zeros(xyz.shape, dtype=np.uint8)
    for z in range(xyz.shape[2]):
        m=ndimage.binary_closing(xyz[:,:,z]>-500, iterations=2)
        labels,n=ndimage.label(m)
        if n:
            sizes=np.bincount(labels.ravel()); sizes[0]=0
            out[:,:,z]=ndimage.binary_fill_holes(labels==sizes.argmax())
    return out

def import_html(payload, folder, source_hash, source_name):
    folder.mkdir(parents=True, exist_ok=True)
    dims=payload['dims']
    ct_raw=gzip.decompress(base64.b64decode(payload['ct']))
    ct=np.frombuffer(ct_raw,dtype='<i2').reshape(dims)
    assert np.isfinite(ct).all()
    ct_desc=write_array(folder,'ct.i16.gz',ct,'<i2')
    mask=write_array(folder,'body.u8.gz',body_mask(ct),'u1')
    mask['method']='CT > -500 HU; closing (2 voxels); largest 2D component; hole filling per XY slice'
    classes=[dict(id=str(i),name_pt=n,score=None,logit=None,threshold=None,
        comparator='>=',decision=None,threshold_status='not_supplied',heatmaps=[]) for i,n in enumerate(NAMES)]
    hashes={'ct_legacy':sha(ct_raw),'ct_x_fastest':ct_desc['sha256'],'maps':{}}
    for m in payload['maps']:
        raw=gzip.decompress(base64.b64decode(m['data']))
        a=np.frombuffer(raw,dtype=np.uint8).reshape(dims)
        desc=write_array(folder,f"class-{int(m['id']):02d}.u8.gz",a,'u1',1/255)
        classes[int(m['id'])]['heatmaps'].append(dict(version='legacy-positive-u8',
            method='positive attribution, restored and quantized by supplied legacy exporter',
            normalization='Imported uint8 / 255; no renormalization by this viewer',
            data=desc,display_range=[0,1]))
        hashes['maps'][m['id']]={'legacy':sha(raw),'x_fastest':desc['sha256']}
    manifest=dict(schema_version='pacs-inrad-viewer/1.0',case_id=payload['patient'],
      title=payload['patient'],dataset='CT-RATE',
      grid=dict(dimensions=dims,space='index',spacing=None,origin=None,affine=None,
                orientation=None,geometry_verified=False),
      ct=ct_desc,body_mask=mask,classes=classes,
      provenance=dict(source_file=source_name,source_sha256=source_hash,
        source_viewer_version=payload['version'],scientific_values_changed=False,
        transformations=['Storage reorder XYZ C-order → X-fastest; lossless gzip',
          'Optional body mask derived separately; raw CT and heatmaps remain untouched'],
        inherited_limitations=['CT already downsampled (max dimension 160), clipped [-1200, 2000] HU and rounded int16 upstream',
          'Attribution already normalized per class, interpolated and quantized uint8 upstream',
          'No spacing, affine, orientation, model coverage, scores or case-linked thresholds in source HTML']),
      notices=['Geometria física ausente. Proporções em voxels; orientação anatômica não confirmada.',
        'Scores e thresholds deste exame não foram fornecidos.',
        'Raw = atribuição importada sem máscara corporal; não é o gradiente assinado original.'])
    dump(folder/'manifest.json',manifest)
    return hashes

def run(viewers, results, out):
    out.mkdir(parents=True,exist_ok=True); cases=[]; checks={}
    with zipfile.ZipFile(viewers) as z:
        assert z.testzip() is None
        for name in sorted(z.namelist()):
            if not name.endswith('.html'):continue
            raw=z.read(name);text=raw.decode('utf-8')
            payload=json.loads(re.search(r'const DATA=(.*?);let ct,maps=',text,re.S)[1])
            case=payload['patient'];assert re.fullmatch(r'[A-Za-z0-9_-]+',case)
            checks[case]=import_html(payload,out/case,sha(raw),name)
            cases.append(dict(case_id=case,title=case,manifest=f'{case}/manifest.json',
                              map_count=len(payload['maps']),has_ct=True))
            dump(out/'inferno.json',payload['lut'])
    with zipfile.ZipFile(results) as z:
        assert z.testzip() is None
        score_bytes=z.read('achados_18.json');res=json.loads(score_bytes)
        case=res['patient'];folder=out/case;folder.mkdir(exist_ok=True)
        meta=json.loads(z.read('mapas/arterial_wall_calcification/mapa.json'))
        classes=[dict(id=str(row['indice_classe']),name_pt=row['achado'],name_en=row['classe'],
          score=row['score'],logit=meta['method']['target_logit'] if row['indice_classe']==1 else None,
          threshold=row['threshold'],comparator='>=',decision=row['acima_corte'],
          threshold_status=row['status_limiar'],interpretation=row['interpretacao'],heatmaps=[])
          for row in res['rows']]
        dump(folder/'manifest.json',dict(schema_version='pacs-inrad-viewer/1.0',case_id=case,title=case,
          dataset='CT-RATE',grid=None,ct=None,body_mask=None,classes=classes,
          provenance=dict(source_file='achados_18.json',source_sha256=sha(score_bytes),
            policy_sha256=res['rows'][0]['policy_sha256'],scientific_values_changed=False,
            transformations=[],native_affine_reference=meta['native_affine']),
          notices=['Somente resultados: TC e heatmap restaurado não incluídos no ZIP leve.',
            'O grid de tokens 24³ não foi sobreposto sem a TC e a transformação de crop/pad.']))
        cases.append(dict(case_id=case,title=case+' · resultados',manifest=f'{case}/manifest.json',map_count=0,has_ct=False))
        (folder/'scores-source.json').write_bytes(score_bytes)
        (folder/'thresholds-source.json').write_bytes(z.read('thresholds_ativos.json'))
    dump(out/'catalog.json',dict(schema_version='pacs-inrad-catalog/1.0',cases=cases))
    dump(out/'import-integrity.json',checks)
    print(f'Imported {len(cases)} cases; 4 CTs, 24 maps, 18 exact scores for {case}.')

if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--viewers',type=Path,required=True)
    ap.add_argument('--results',type=Path,required=True);ap.add_argument('--out',type=Path,default=Path('public/data'))
    a=ap.parse_args();run(a.viewers,a.results,a.out)
