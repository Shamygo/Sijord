import * as THREE from 'three';
import { paintPropMaterial } from '../world/materials';

/** Imported skins use the same matte, lightly textured finish as the landscape and buildings. */
export function worldCharacterMaterial(original: THREE.Material, trainer=false): THREE.Material {
  let mat: THREE.Material;
  if ((original as THREE.MeshBasicMaterial).isMeshBasicMaterial) {
    const src=original as THREE.MeshBasicMaterial;
    mat=new THREE.MeshStandardMaterial({map:src.map,color:src.color,transparent:src.transparent,opacity:src.opacity,alphaTest:src.alphaTest,side:src.side});
  } else mat=original.clone();
  const p=mat as THREE.MeshStandardMaterial;
  if (p.isMeshStandardMaterial) {
    p.metalness=0;p.metalnessMap=null;p.roughness=Math.max(.82,p.roughness);p.roughnessMap=null;
    if(trainer){p.aoMap=null;p.normalMap=null;}
    p.normalScale.multiplyScalar(.5);p.envMapIntensity=.3;p.emissiveIntensity=Math.min(p.emissiveIntensity,2.5);
    p.color.multiplyScalar(.97);p.fog=true;
    paintPropMaterial(p,'character');
  }
  return mat;
}
