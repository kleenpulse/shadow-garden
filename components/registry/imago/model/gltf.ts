"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  AnimationMixer,
  TextureLoader,
  type AnimationAction,
  type AnimationClip,
  type Group,
  type Object3D,
  type Texture,
} from "three";

// The three hooks this template used from `@react-three/drei`, rebuilt on
// `@react-three/fiber` and `three` — both of which it already depends on.
//
// drei is an excellent library and this is not a criticism of it. But a template
// is a thing someone pastes into their own project, and every package on the
// install line is a decision they have to agree to before they can use the page.
// Three hooks in one file is not worth a dependency, and writing them out makes
// the model's loading and animation behaviour legible instead of magic.

interface LoadedGltf {
  scene: Group;
  animations: AnimationClip[];
}

export function useGLTF(url: string): LoadedGltf {
  const gltf = useLoader(GLTFLoader, url) as unknown as LoadedGltf;
  return gltf;
}

/** Warm the cache before the component that needs it mounts. */
useGLTF.preload = (url: string): void => {
  useLoader.preload(GLTFLoader, url);
};

export function useTexture(urls: string[]): Texture[] {
  return useLoader(TextureLoader, urls) as unknown as Texture[];
}

/**
 * Bind a clip set to a root object and hand back the actions.
 *
 * Deliberately WITHOUT an internal `useFrame` that advances the mixer, which is
 * the one place this differs from drei. The consumer here drives the mixer by
 * hand — `mixer.update(delta)` while the wings should beat, `mixer.update(0)` to
 * apply the current pose without advancing it — and an automatic update running
 * alongside that would advance the animation on exactly the frames the component
 * is trying to hold it still. Ownership of the clock belongs to whoever is making
 * decisions with it.
 */
export function useAnimations(
  clips: AnimationClip[],
  root: RefObject<Object3D | null>,
): { actions: Record<string, AnimationAction>; mixer: AnimationMixer | null } {
  const [mixer, setMixer] = useState<AnimationMixer | null>(null);
  const actionsRef = useRef<Record<string, AnimationAction>>({});
  // Identity of the clip array is stable per loaded GLTF, but guard anyway: a
  // remount that rebuilt actions against a stale mixer would silently animate
  // nothing.
  const clipKey = useMemo(() => clips.map((c) => c.name).join("|"), [clips]);

  useEffect(() => {
    const target = root.current;
    if (!target || clips.length === 0) return;

    const nextMixer = new AnimationMixer(target);
    const actions: Record<string, AnimationAction> = {};
    for (const clip of clips) {
      actions[clip.name] = nextMixer.clipAction(clip, target);
    }
    actionsRef.current = actions;
    setMixer(nextMixer);

    return () => {
      nextMixer.stopAllAction();
      for (const clip of clips) nextMixer.uncacheClip(clip);
      actionsRef.current = {};
      setMixer(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipKey, root]);

  return { actions: actionsRef.current, mixer };
}
