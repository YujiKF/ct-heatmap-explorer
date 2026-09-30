import type {ViewSettings} from '../data/types';

// HU transfer functions for display only. Both vtk.js and the CPU fallback use
// these exact points; scores and source voxels are never altered.
export const CT_COLORS: number[][]=[
  [-1200,.07,.12,.16],[-750,.18,.31,.38],[-450,.28,.43,.49],
  [50,.61,.7,.75],[500,.85,.9,.92],[2000,1,.98,.9],
];
export const CT_OPACITY: Record<ViewSettings['anatomyPreset'],number[][]>={
  lung:[[-1200,0],[-1000,0],[-900,.007],[-750,.022],[-550,.032],[-350,.009],[100,.012],[250,.006],[500,.003],[2000,.002]],
  tissue:[[-1200,0],[-450,0],[-120,.012],[35,.055],[120,.065],[250,.025],[500,.008],[2000,.004]],
  bone:[[-1200,0],[120,0],[250,.015],[450,.095],[800,.32],[2000,.58]],
};
