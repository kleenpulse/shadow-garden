/* T3 acceptance: e=1, μ=0 bouncing ball — ΣE must stay within ~1% for 30 s. */
import { World, buildScene, makeCircle } from "../components/registry/physics-engine/physics-engine";

const world = new World(16, 10, "playground");
buildScene(world, 0, 0.5, () => 0.5); // bounds + zero rained bodies
world.add(makeCircle(8, world.floorY - 6, 0.3, 1)); // 6 m drop, at rest

const params = { gravity: 9.8, restitution: 1, friction: 0, trailsOn: false, noRespawn: true };

let e0 = 0;
let maxDrift = 0;
for (let step = 0; step < 3600; step++) {
	world.step(params);
	const total = world.ke + world.pe;
	if (step === 0) e0 = total;
	maxDrift = Math.max(maxDrift, Math.abs(total - e0) / e0);
	if (step % 600 === 0) console.log(`t=${(step / 120).toFixed(1)}s ΣE=${total.toFixed(3)} J drift=${(((total - e0) / e0) * 100).toFixed(2)}%`);
}
console.log(`max |drift| over 30 s: ${(maxDrift * 100).toFixed(2)}% ${maxDrift < 0.015 ? "— PASS" : "— FAIL"}`);
