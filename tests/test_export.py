"""Asymmetric synthetic phantoms for export geometry, never demo patient data."""
import gzip,json,sys,tempfile,unittest
from pathlib import Path
import numpy as np
import nibabel as nib
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from export_case import export_case
from add_heatmap import add

class ExportGeometry(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        x,y,z=np.indices((16,18,20));self.array=(100*x+10*y+z).astype(np.float32)
        self.affine=np.diag([-2.,-3.,4.,1.]);self.affine[:3,3]=[40,50,-60]
        self.ct=self.root/'ct.nii.gz';self.heat=self.root/'heat.nii.gz'
        nib.save(nib.Nifti1Image(self.array,self.affine),self.ct)
        nib.save(nib.Nifti1Image(self.array/self.array.max(),self.affine),self.heat)
        self.result=self.root/'results.json';self.result.write_text(json.dumps({'patient':'phantom','rows':[{'indice_classe':1,'score':.42,'threshold':.5,'acima_corte':False}]}))
    def tearDown(self):self.temp.cleanup()
    def run_export(self,max_dim=160):
        return export_case(self.ct,{1:self.heat},self.result,'phantom','v1',self.root/'out',max_dim)
    def test_ras_reorientation_preserves_asymmetric_landmarks(self):
        p=self.run_export();m=json.loads(p.read_text());g=m['grid'];shape=g['dimensions']
        a=np.frombuffer(gzip.decompress((p.parent/m['ct']['url']).read_bytes()),'<f4').reshape(shape[::-1]).transpose(2,1,0)
        np.testing.assert_array_equal(a,self.array[::-1,::-1,:])
        np.testing.assert_allclose(g['origin'],[10,-1,-60]);np.testing.assert_allclose(g['spacing'],[2,3,4])
        self.assertEqual(m['classes'][1]['score'],.42);self.assertEqual(m['classes'][1]['threshold'],.5)
    def test_downsample_updates_voxel_centres_and_heat_alignment(self):
        p=self.run_export(16);m=json.loads(p.read_text());g=m['grid'];new=np.array(g['dimensions']);ratio=np.array(self.array.shape)/new
        np.testing.assert_allclose(g['origin'],np.array([10,-1,-60])+(ratio*.5-.5)*[2,3,4])
        np.testing.assert_allclose(g['spacing'],ratio*[2,3,4])
        a=np.frombuffer(gzip.decompress((p.parent/m['ct']['url']).read_bytes()),'<f4')
        h=m['classes'][1]['heatmaps'][0]['data'];b=np.frombuffer(gzip.decompress((p.parent/h['url']).read_bytes()),'<f4')
        np.testing.assert_allclose(a/self.array.max(),b,atol=1e-7)
    def test_mismatched_map_affine_is_rejected(self):
        wrong=self.affine.copy();wrong[0,3]+=2
        nib.save(nib.Nifti1Image(self.array/self.array.max(),wrong),self.heat)
        with self.assertRaisesRegex(ValueError,'not registered'):self.run_export()
    def test_oblique_volume_and_wrong_patient_are_rejected(self):
        a=self.affine.copy();a[0,1]=.2;nib.save(nib.Nifti1Image(self.array,a),self.ct)
        with self.assertRaisesRegex(ValueError,'Oblique'):self.run_export()
        nib.save(nib.Nifti1Image(self.array,self.affine),self.ct)
        self.result.write_text(json.dumps({'patient':'other','rows':[]}))
        with self.assertRaisesRegex(ValueError,'patient'):self.run_export()
    def test_new_version_preserves_tc_scores_and_old_map(self):
        p=self.run_export();before=json.loads(p.read_text());g=self.root/'grid.json';g.write_text(json.dumps(before['grid']))
        a=self.root/'v2.npy';np.save(a,np.ones(before['grid']['dimensions'],dtype=np.float32)*.25)
        add(p,a,g,'phantom',1,'v2','test-only phantom')
        after=json.loads(p.read_text());self.assertEqual(before['ct'],after['ct']);self.assertEqual(before['classes'][1]['heatmaps'][0],after['classes'][1]['heatmaps'][0])
        self.assertEqual(before['classes'][1]['score'],after['classes'][1]['score']);self.assertEqual(before['classes'][1]['threshold'],after['classes'][1]['threshold'])
        self.assertEqual(len(after['classes'][1]['heatmaps']),2)
        with self.assertRaisesRegex(ValueError,'Version exists'):add(p,a,g,'phantom',1,'v2','duplicate')

if __name__=='__main__':unittest.main()
