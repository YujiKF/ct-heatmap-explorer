import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const orthancId = value => typeof value === 'string' && /^[a-f0-9-]{10,80}$/i.test(value);

export function numbers(value, length) {
  const parts = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[\\,]/) : [];
  const out = parts.map(Number);
  if (out.length !== length || !out.every(Number.isFinite)) throw new Error('Metadados espaciais DICOM incompletos.');
  return out;
}

export function parseNpy(bytes, rows, cols) {
  const b = Buffer.from(bytes);
  if (b.length < 12 || b.subarray(0, 6).toString('latin1') !== '\x93NUMPY') throw new Error('Resposta NumPy inválida do Orthanc.');
  const major = b[6];
  const start = major === 1 ? 10 : 12;
  const headerLength = major === 1 ? b.readUInt16LE(8) : b.readUInt32LE(8);
  if (start + headerLength > b.length) throw new Error('Cabeçalho NumPy truncado.');
  const header = b.toString('latin1', start, start + headerLength);
  const dtype = /['"]descr['"]\s*:\s*['"]([^'"]+)['"]/.exec(header)?.[1];
  const shapeText = /['"]shape['"]\s*:\s*\(([^)]*)\)/.exec(header)?.[1];
  const shape = shapeText?.split(',').map(x => x.trim()).filter(Boolean).map(Number);
  if (!shape || shape.join(',') !== `1,${rows},${cols},1` || /['"]fortran_order['"]\s*:\s*True/.test(header)) throw new Error('Formato de imagem NumPy inesperado.');
  const count = rows * cols;
  const width = dtype === '<f4' || dtype === '|f4' ? 4 : dtype === '<f8' ? 8 : 0;
  if (!width || b.length !== start + headerLength + count * width) throw new Error('Tipo ou tamanho NumPy inesperado.');
  const data = new Float32Array(count);
  const view = new DataView(b.buffer, b.byteOffset + start + headerLength, count * width);
  for (let i = 0; i < count; i++) {
    const value = width === 4 ? view.getFloat32(i * 4, true) : view.getFloat64(i * 8, true);
    if (!Number.isFinite(value)) throw new Error('Imagem do Orthanc contém valores não finitos.');
    data[i] = value;
  }
  return data;
}

const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const near = (a, b, tol) => Math.abs(a - b) <= tol;

export function inspectSeries(instances) {
  if (instances.length < 2) throw new Error('A série precisa conter pelo menos dois cortes de TC.');
  const first = instances[0].tags;
  const rows = Number(first.Rows), cols = Number(first.Columns);
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 2 || cols < 2 || rows > 2048 || cols > 2048) throw new Error('Dimensões DICOM inválidas ou excessivas.');
  const iop = numbers(first.ImageOrientationPatient, 6);
  const row = iop.slice(0, 3), col = iop.slice(3);
  if (!near(dot(row,row),1,1e-3) || !near(dot(col,col),1,1e-3) || Math.abs(dot(row,col)) > 1e-3) throw new Error('Orientação DICOM inválida.');
  const normal = cross(row, col);
  const pixel = numbers(first.PixelSpacing, 2);
  if (!pixel.every(v => v > 0 && v < 100)) throw new Error('PixelSpacing inválido.');
  const plane = instances.map(item => {
    const tags = item.tags;
    if (Number(tags.Rows) !== rows || Number(tags.Columns) !== cols) throw new Error('A série mistura dimensões de imagem.');
    const direction = numbers(tags.ImageOrientationPatient, 6);
    if (direction.some((v,i) => !near(v,iop[i],1e-3))) throw new Error('A série mistura orientações.');
    const spacing = numbers(tags.PixelSpacing,2);
    if (spacing.some((v,i) => !near(v,pixel[i],1e-3))) throw new Error('A série mistura PixelSpacing.');
    if (tags.Modality && tags.Modality !== 'CT') throw new Error('A série contém imagem que não é TC.');
    const position = numbers(tags.ImagePositionPatient,3);
    return {...item, position, z: dot(position, normal)};
  }).sort((a,b) => a.z-b.z);
  const step = (plane.at(-1).z - plane[0].z) / (plane.length-1);
  if (!(step > 0.01 && step < 100)) throw new Error('Espaçamento entre cortes inválido.');
  for (let i=1;i<plane.length;i++) {
    if (!near(plane[i].z-plane[i-1].z,step,Math.max(.1,step*.05))) throw new Error('Cortes ausentes, duplicados ou espaçamento irregular.');
    const expected = plane[0].position.map((v,k) => v + normal[k]*step*i);
    if (plane[i].position.some((v,k) => !near(v,expected[k],Math.max(.2,step*.1)))) throw new Error('Posições dos cortes não formam uma grade regular.');
  }
  const sourceDirsLps = [row,col,normal];
  const sourceSpacing = [pixel[1],pixel[0],step];
  const sourceDims = [cols,rows,plane.length];
  const axis = [], sign = [], taken = new Set();
  for (const v of sourceDirsLps) {
    const ras = [-v[0],-v[1],v[2]];
    const best = ras.findIndex(x => Math.abs(x) > .999);
    if (best < 0 || taken.has(best) || ras.some((x,k) => k !== best && Math.abs(x) > .01)) throw new Error('Série oblíqua: o Explorer exige grade alinhada a RAS.');
    axis.push(best);sign.push(Math.sign(ras[best]));taken.add(best);
  }
  const dims = [0,0,0], spacing = [0,0,0];
  for (let i=0;i<3;i++) {dims[axis[i]]=sourceDims[i];spacing[axis[i]]=sourceSpacing[i];}
  const origin = [-plane[0].position[0],-plane[0].position[1],plane[0].position[2]];
  for (let i=0;i<3;i++) if (sign[i]<0) origin[axis[i]] -= (sourceDims[i]-1)*sourceSpacing[i];
  return {plane,rows,cols,axis,sign,sourceDims,dims,spacing,origin};
}

export async function convertSeries(geometry, fetchFrame, maxDim=160) {
  const {plane,rows,cols,axis,sign,sourceDims,dims,spacing,origin} = geometry;
  const factor = Math.min(1,maxDim/Math.max(...dims));
  const outDims = dims.map(n => Math.max(2,Math.round(n*factor)));
  if (outDims.reduce((a,b)=>a*b,1) > 256**3) throw new Error('Volume excede o limite do Explorer.');
  const ratios = dims.map((n,i) => n/outDims[i]);
  const outSpacing = spacing.map((s,i) => s*ratios[i]);
  const outOrigin = origin.map((o,i) => o+spacing[i]*(ratios[i]*.5-.5));
  const affine = [[outSpacing[0],0,0,outOrigin[0]],[0,outSpacing[1],0,outOrigin[1]],[0,0,outSpacing[2],outOrigin[2]],[0,0,0,1]];
  const output = new Float32Array(outDims[0]*outDims[1]*outDims[2]);
  const sourceOut = axis.map(a=>outDims[a]);
  const sourceRatio = axis.map(a=>ratios[a]);
  const coord = (n, ratio, max) => Math.max(0,Math.min(max,(n+.5)*ratio-.5));
  let cached = new Map();
  async function frame(k) {
    if (!cached.has(k)) cached.set(k,await fetchFrame(plane[k].id,rows,cols));
    return cached.get(k);
  }
  for (let sz=0;sz<sourceOut[2];sz++) {
    const z=coord(sz,sourceRatio[2],sourceDims[2]-1), z0=Math.floor(z), z1=Math.min(z0+1,sourceDims[2]-1), wz=z-z0;
    const a=await frame(z0), b=z1===z0?a:await frame(z1);
    cached = new Map([[z0,a],[z1,b]]);
    for (let sy=0;sy<sourceOut[1];sy++) {
      const y=coord(sy,sourceRatio[1],rows-1), y0=Math.floor(y), y1=Math.min(y0+1,rows-1), wy=y-y0;
      for (let sx=0;sx<sourceOut[0];sx++) {
        const x=coord(sx,sourceRatio[0],cols-1), x0=Math.floor(x), x1=Math.min(x0+1,cols-1), wx=x-x0;
        const i00=y0*cols+x0,i01=y0*cols+x1,i10=y1*cols+x0,i11=y1*cols+x1;
        const va=(a[i00]*(1-wx)+a[i01]*wx)*(1-wy)+(a[i10]*(1-wx)+a[i11]*wx)*wy;
        const vb=(b[i00]*(1-wx)+b[i01]*wx)*(1-wy)+(b[i10]*(1-wx)+b[i11]*wx)*wy;
        const source=[sx,sy,sz], target=[0,0,0];
        for(let q=0;q<3;q++) target[axis[q]]=sign[q]>0?source[q]:sourceOut[q]-1-source[q];
        output[target[0]+outDims[0]*(target[1]+outDims[1]*target[2])]=va*(1-wz)+vb*wz;
      }
    }
  }
  const bytes = Buffer.allocUnsafe(output.length*4);
  for(let i=0;i<output.length;i++) bytes.writeFloatLE(output[i],i*4);
  const packed = gzipSync(bytes,{level:6});
  return {grid:{dimensions:outDims,space:'RAS',spacing:outSpacing,origin:outOrigin,affine,orientation:['R','A','S'],geometry_verified:true},
    ct:{url:'ct.f32.gz.bin',dtype:'float32',encoding:'gzip',order:'x-fastest',byte_length:bytes.length,sha256:sha256(bytes),compressed_sha256:sha256(packed),scale:1,offset:0},packed};
}
