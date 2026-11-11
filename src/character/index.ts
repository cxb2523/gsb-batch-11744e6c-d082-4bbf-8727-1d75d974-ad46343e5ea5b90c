import { Group, Matrix4, Object3D, Vector3 } from 'three';
import type { Character, CharacterPose } from '../contracts';
import type { NpcId } from '../chapter/data';
import { characterMaterials } from './materials';
import { buildHumanoid, type HumanoidId, type HumanoidSpec } from './humanoid';
import { HumanoidAnimator } from './animator';
import { CatAnimator, buildCat } from './cat';
import { SPECS } from './cast';
import type { Bone, SkinMesh } from './skin';

/** Procedural low-poly character kit. Every character is a bone rig with
 * rigidly skinned, merged geometry (a few draw calls per character) driven by
 * `update(pose)`. See humanoid.ts / animator.ts / cast/* (people) and cat.ts. */

export type { HumanoidId };

const inverse = new Matrix4();
const lookLocal = new Vector3();

interface Rigged {
  meshes: SkinMesh[];
  height: number;
  attachments: Record<string, { bone: Bone; offset: Matrix4 }>;
  /** Advance the animation; `look` is in character-local space. */
  step(pose: CharacterPose, look: Vector3 | null): void;
}

function riggedHumanoid(id: HumanoidId, variant?: Partial<HumanoidSpec>): Rigged {
  const build = buildHumanoid(variant ? { ...SPECS[id], ...variant } : SPECS[id], characterMaterials());
  const animator = new HumanoidAnimator(build);
  return {
    meshes: build.meshes, height: build.height,
    attachments: Object.fromEntries(Object.entries(build.attachments).map(([name, entry]) => [name, { bone: entry.bone, offset: entry.offset }])),
    step: (pose, look) => animator.update({ dt: pose.dt, input: pose, look }),
  };
}

function riggedCat(): Rigged {
  const build = buildCat(characterMaterials());
  const animator = new CatAnimator(build);
  return {
    meshes: build.meshes, height: build.height,
    attachments: Object.fromEntries(Object.entries(build.attachments).map(([name, entry]) => [name, { bone: entry.bone, offset: new Matrix4().makeTranslation(...entry.at) }])),
    step: (pose, look) => animator.update(pose, look),
  };
}

/** `variant` overrides spec fields (other players wear different jackets). */
export function createCharacter(id: NpcId | 'player', variant?: Partial<HumanoidSpec>): Character {
  const group = new Group();
  group.name = `Character:${id}`;
  const rigged = id === 'cat' ? riggedCat() : riggedHumanoid(id, variant);
  for (const skin of rigged.meshes) group.add(skin.mesh);
  const syncs: (() => void)[] = [];
  const attachments: NonNullable<Character['attachments']> = {};
  for (const [name, entry] of Object.entries(rigged.attachments)) {
    const object = new Object3D();
    object.name = name;
    object.matrixAutoUpdate = false;
    group.add(object);
    syncs.push(() => { object.matrix.multiplyMatrices(entry.bone.world, entry.offset); object.matrixWorldNeedsUpdate = true; });
    (attachments as Record<string, Object3D>)[name] = object;
  }
  const character: Character = {
    group,
    height: rigged.height,
    attachments,
    update(pose: CharacterPose) {
      let look: Vector3 | null = null;
      if (pose.lookAt) {
        group.updateWorldMatrix(true, false);
        lookLocal.copy(pose.lookAt).applyMatrix4(inverse.copy(group.matrixWorld).invert());
        look = lookLocal;
      }
      rigged.step(pose, look);
      for (const skin of rigged.meshes) skin.update();
      for (const sync of syncs) sync();
      // The follow camera fades the avatar out when a wall pulls it very close.
      const visibility = group.userData.cameraVisibility as number | undefined;
      if (visibility !== undefined) for (const skin of rigged.meshes) skin.mesh.visible = visibility > 0.12;
    },
  };
  character.update({ elapsed: 0, dt: 0, moving: 0, airborne: false, verticalSpeed: 0 });
  return character;
}
