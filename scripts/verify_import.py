"""Verify byte/value preservation against the original supplied ZIPs."""
from pathlib import Path
import argparse,base64,gzip,hashlib,json,re,zipfile
import numpy as np

def sha(b):return hashlib.sha256(b).hexdigest()
def verify(sources,data,out):
    report={'zip_integrity':[],'overlay_png_hashes':0,'ct_arrays_exact':0,'heatmaps_exact':0,'scores_exact':0,'thresholds_exact':0,'cases':[]}
    paths=list(Path(sources).glob('*.zip'))
    for path in paths:
        with zipfile.ZipFile(path) as z:
            assert z.testzip() is None
        report['zip_integrity'].append({'file':path.name,'sha256':sha(path.read_bytes()),'crc_ok':True})
    viewers=next(p for p in paths if 'Visualizadores_Interativos' in p.name)
    with zipfile.ZipFile(viewers) as z:
        for filename in sorted(z.namelist()):
            if not filename.endswith('.html'):continue
            payload=json.loads(re.search(r'const DATA=(.*?);let ct,maps=',z.read(filename).decode(),re.S)[1])
            case=payload['patient'];folder=Path(data)/case;m=json.loads((folder/'manifest.json').read_text())
            def same(a,descriptor,dtype):
                original=np.frombuffer(gzip.decompress(base64.b64decode(a)),dtype=dtype).reshape(payload['dims'])
                packed=(folder/descriptor['url']).read_bytes();raw=gzip.decompress(packed)
                assert sha(raw)==descriptor['sha256'] and sha(packed)==descriptor['compressed_sha256']
                restored=np.frombuffer(raw,dtype=dtype).reshape(tuple(reversed(payload['dims']))).transpose(2,1,0)
                assert np.array_equal(original,restored)
            same(payload['ct'],m['ct'],'<i2');report['ct_arrays_exact']+=1
            for old in payload['maps']:
                new=next(c for c in m['classes'] if c['id']==old['id'])['heatmaps'][0]
                same(old['data'],new['data'],'u1');assert new['data']['scale']==1/255
                report['heatmaps_exact']+=1
            assert all(c['score'] is None and c['threshold'] is None for c in m['classes'])
            report['cases'].append({'case_id':case,'shape':payload['dims'],'maps':len(payload['maps']),'score_association':'not supplied; left null','physical_geometry':'not supplied; index coordinates'})
    overlay=next(p for p in paths if 'Overlay_Corrigido' in p.name)
    with zipfile.ZipFile(overlay) as z:
        audit=json.loads(z.read('auditoria_overlay_corrigido.json'))
        for a in audit['items']:
            assert sha(z.read(f"mapas/{a['map_id']}/{a['plane']}.png"))==a['sha256'];report['overlay_png_hashes']+=1
    results=next(p for p in paths if 'Resultados_Leves' in p.name)
    with zipfile.ZipFile(results) as z:
        source=json.loads(z.read('achados_18.json'));m=json.loads((Path(data)/source['patient']/'manifest.json').read_text())
        for row in source['rows']:
            c=next(c for c in m['classes'] if c['id']==str(row['indice_classe']))
            assert c['score']==row['score'];report['scores_exact']+=1
            assert c['threshold']==row['threshold'];report['thresholds_exact']+=1
            assert c['decision']==row['acima_corte']
        assert (Path(data)/source['patient']/'thresholds-source.json').read_bytes()==z.read('thresholds_ativos.json')
        assert z.read('thresholds_ativos.json')==z.read('teste_reservado/politica_congelada.json')
        report['policy_file_preserved_exactly']=True
        report['policy_sha256_declared']=m['provenance']['policy_sha256']
        report['thresholds_recalibrated']=False
    report['all_passed']=True
    Path(out).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k not in ['zip_integrity','cases']},ensure_ascii=False))

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--sources',required=True,type=Path);ap.add_argument('--data',type=Path,default=Path('public/data'));ap.add_argument('--out',type=Path,default=Path('docs/validation-integrity.json'))
    a=ap.parse_args();verify(a.sources,a.data,a.out)
