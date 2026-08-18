"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Mycelium, {
  type MyceliumAgents,
  type MyceliumSpawn,
} from "./mycelium";

export default function MyceliumPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <Mycelium
      agentCount={values.agentCount as MyceliumAgents}
      speed={values.speed as number}
      sensorDistance={values.sensorDistance as number}
      sensorAngle={values.sensorAngle as number}
      turnSpeed={values.turnSpeed as number}
      wander={values.wander as number}
      decay={values.decay as number}
      diffuse={values.diffuse as number}
      deposit={values.deposit as number}
      attract={values.attract as number}
      spawn={values.spawn as MyceliumSpawn}
      trailColor={values.trailColor as string}
      background={values.background as string}
      glow={values.glow as number}
      paused={paused}
      reducedMotion={reducedMotion}
    />
  );
}
