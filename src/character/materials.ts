import type { ShaderMaterial } from 'three';
import { createToonMaterial, PALETTE } from '../art/toon';

/** Shared character materials. All characters of a kind share one material, so
 * the paper -> color revival, sun and shadow uniforms are shared by reference.
 * - body:   vertex-colored; residents desaturate to paper until a revival wave arrives.
 * - ink:    face marks (eyes, mouth, glasses): the "pencil lines" that stay dark even on paper.
 * - player: the player's colored body (always alive).
 * - thread: the spool's wound thread/strand; its uniform color follows the held thread. */
export interface CharacterMaterials {
  body: ShaderMaterial;
  ink: ShaderMaterial;
  player: ShaderMaterial;
  thread: ShaderMaterial;
}

let shared: CharacterMaterials | undefined;

export function characterMaterials(): CharacterMaterials {
  if (!shared) {
    shared = {
      body: createToonMaterial({ vertexColors: true, name: 'CharacterBody' }),
      ink: createToonMaterial({ color: PALETTE.ink, alwaysAlive: true, name: 'CharacterInk' }),
      player: createToonMaterial({ vertexColors: true, alwaysAlive: true, name: 'CharacterPlayer' }),
      thread: createToonMaterial({ vertexColors: true, alwaysAlive: true, name: 'CharacterThread' }),
    };
  }
  return shared;
}
