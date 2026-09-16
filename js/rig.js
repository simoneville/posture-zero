import * as THREE from 'three';
import { ANTHRO_RATIOS } from './data.js';

const SKIN = 0xe0b295;
const SKIN_DARK = 0xcf9b74;
const PALM = 0xecc9a8;
const CLOTHING = 0x5a7d9a;
const SHORTS = 0x3c4a5c;
const JOINT_MARKER = 0x2b2f36;
const TOE_CAP = 0x1c1c1f;

// The character faces +Z (world "anterior"/forward — this is the direction
// the feet point). -Z is posterior/back, +Y is up. Right-side segments are
// built at local -X, left-side at +X, so the character's right hand ends up
// on the *viewer's* left in a front view (as when facing someone).
const SIDE_X = { R: -1, L: 1 };

// Cylinder segments that hang down from their pivot (upper arm, forearm,
// thigh, shank): the pivot is the proximal end, the mesh is shifted to
// -length/2 so it extends from y=0 down to y=-length. Distal end tapers to a
// smaller radius than the proximal end (`taper`, 0-1).
function limbDown(radiusProximal, taper, length, color) {
  const geo = new THREE.CylinderGeometry(radiusProximal, radiusProximal * taper, length, 12, 1);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
  mesh.position.y = -length / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Cylinder segments that rise up from their pivot (the neck, base at the
// chest, tapering slightly narrower toward the head).
function limbUp(radiusProximal, taper, length, color) {
  const geo = new THREE.CylinderGeometry(radiusProximal * taper, radiusProximal, length, 12, 1);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
  mesh.position.y = length / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function jointMarker(radius) {
  const geo = new THREE.SphereGeometry(radius, 12, 8);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: JOINT_MARKER, roughness: 0.5 }));
  mesh.castShadow = true;
  return mesh;
}

// A minimal face (two eyes + a nose bump) so front/back is unambiguous on
// the otherwise-symmetric head sphere. Added as children of the head mesh
// so they inherit neck/head rotation.
function addFace(head, R) {
  const eyeGeo = new THREE.SphereGeometry(R * 0.09, 8, 6);
  const eyeMat = new THREE.MeshStandardMaterial({ color: JOINT_MARKER, roughness: 0.4 });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(sx * 0.32 * R, 0.12 * R, 0.90 * R);
    head.add(eye);
  }
  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(R * 0.11, R * 0.24, 10),
    new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.6 })
  );
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, -0.06 * R, 0.90 * R);
  head.add(nose);
}

// Builds a chain of nested pivot groups, one per DOF definition, in the given
// order. Returns { attachPoint: outermost group (parent attaches here),
// tip: innermost group (children/joints attach here), pivots: {id: group} }.
function buildJointChain(defs) {
  const pivots = {};
  let attachPoint = null;
  let tip = null;
  for (const def of defs) {
    const g = new THREE.Group();
    g.userData.axis = def.axis;
    pivots[def.id] = g;
    if (!attachPoint) {
      attachPoint = g;
      tip = g;
    } else {
      tip.add(g);
      tip = g;
    }
  }
  return { attachPoint, tip, pivots };
}

export function buildFigure(heightMeters) {
  const H = heightMeters;
  const r = ANTHRO_RATIOS;
  const L = {
    head: r.headHeight * H,
    neck: r.neckLength * H,
    trunk: r.trunkLength * H,
    thigh: r.thighLength * H,
    shank: r.shankLength * H,
    footH: r.footHeight * H,
    footL: r.footLength * H,
    footB: r.footBreadth * H,
    upperArm: r.upperArmLength * H,
    forearm: r.forearmLength * H,
    hand: r.handLength * H,
    shoulderW: r.shoulderWidth * H,
    hipW: r.hipWidth * H,
    headB: r.headBreadth * H,
    chestD: r.chestDepth * H,
    pelvisD: r.pelvisDepth * H,
  };
  const pelvisH = L.trunk * 0.32;
  const chestH = L.trunk * 0.68;

  // Proximal radius + distal taper ratio (distal = proximal * taper) for
  // each tapered limb segment.
  const RAD = {
    upperArm: { r: 0.030 * H, taper: 0.78 },
    forearm: { r: 0.027 * H, taper: 0.60 },
    thigh: { r: 0.062 * H, taper: 0.72 },
    shank: { r: 0.046 * H, taper: 0.52 },
    neck: { r: 0.046 * H, taper: 0.82 },
  };

  const joints = {}; // flat map: full id ("shoulder_flexext_R") -> {group, axis, side, ...sign flags}
  const root = new THREE.Group();
  root.position.y = L.footH + L.shank + L.thigh;

  // ---- Pelvis + spine ----
  const pelvis = new THREE.Mesh(
    new THREE.BoxGeometry(L.hipW, pelvisH, L.pelvisD),
    new THREE.MeshStandardMaterial({ color: SHORTS, roughness: 0.8 })
  );
  pelvis.position.y = pelvisH / 2;
  pelvis.castShadow = true;
  pelvis.receiveShadow = true;
  root.add(pelvis);

  const lumbar = buildJointChain([
    { id: 'trunk_flexext', axis: 'x' },
    { id: 'trunk_latflex', axis: 'z' },
    { id: 'trunk_rotation', axis: 'y' },
  ]);
  lumbar.attachPoint.position.y = pelvisH;
  root.add(lumbar.attachPoint);
  // The trunk rises from the lumbar pivot toward the head, so a raw
  // positive rotateX already tips it anteriorly (+Z) — that's flexion.
  joints.trunk_flexext = { group: lumbar.pivots.trunk_flexext, axis: 'x', xSign: 1 };
  joints.trunk_latflex = { group: lumbar.pivots.trunk_latflex, axis: 'z', xSign: 1 };
  joints.trunk_rotation = { group: lumbar.pivots.trunk_rotation, axis: 'y', xSign: 1 };

  const chest = new THREE.Mesh(
    new THREE.BoxGeometry(L.shoulderW, chestH, L.chestD),
    new THREE.MeshStandardMaterial({ color: CLOTHING, roughness: 0.8 })
  );
  chest.position.y = chestH / 2;
  chest.castShadow = true;
  chest.receiveShadow = true;
  lumbar.tip.add(chest);

  // ---- Neck + head ----
  const neckChain = buildJointChain([
    { id: 'neck_flexext', axis: 'x' },
    { id: 'neck_latflex', axis: 'z' },
    { id: 'neck_rotation', axis: 'y' },
  ]);
  neckChain.attachPoint.position.y = chestH;
  lumbar.tip.add(neckChain.attachPoint);
  neckChain.attachPoint.add(jointMarker(RAD.neck.r * 0.9));
  // Same rising-chain reasoning as the trunk: raw positive rotateX is
  // already anterior (chin-to-chest) flexion.
  joints.neck_flexext = { group: neckChain.pivots.neck_flexext, axis: 'x', xSign: 1 };
  joints.neck_latflex = { group: neckChain.pivots.neck_latflex, axis: 'z', xSign: 1 };
  joints.neck_rotation = { group: neckChain.pivots.neck_rotation, axis: 'y', xSign: 1 };

  neckChain.tip.add(limbUp(RAD.neck.r, RAD.neck.taper, L.neck, SKIN_DARK));
  const headR = L.headB / 2;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(headR, 20, 16),
    new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.6 })
  );
  head.position.y = L.neck + headR * 0.92;
  head.castShadow = true;
  addFace(head, headR);
  neckChain.tip.add(head);

  // ---- Arms ----
  for (const side of ['R', 'L']) {
    const sx = SIDE_X[side];
    const shoulder = buildJointChain([
      { id: 'shoulder_flexext', axis: 'x' },
      { id: 'shoulder_abadd', axis: 'z' },
      { id: 'shoulder_rotation', axis: 'y' },
    ]);
    shoulder.attachPoint.position.set(sx * L.shoulderW / 2, chestH, 0);
    lumbar.tip.add(shoulder.attachPoint);
    shoulder.attachPoint.add(jointMarker(RAD.upperArm.r * 1.15));
    // The upper arm hangs DOWN from the shoulder. A raw positive rotateX on
    // a hanging segment sweeps it posteriorly, so flexion (anterior, +Z)
    // needs the sign flipped.
    joints[`shoulder_flexext_${side}`] = { group: shoulder.pivots.shoulder_flexext, axis: 'x', side, xSign: -1 };
    joints[`shoulder_abadd_${side}`] = { group: shoulder.pivots.shoulder_abadd, axis: 'z', side, flipLeft: true };
    joints[`shoulder_rotation_${side}`] = { group: shoulder.pivots.shoulder_rotation, axis: 'y', side, flipLeft: true };
    shoulder.tip.add(limbDown(RAD.upperArm.r, RAD.upperArm.taper, L.upperArm, SKIN));

    const elbow = buildJointChain([
      { id: 'elbow_flex', axis: 'x' },
      { id: 'forearm_pronsup', axis: 'y' },
    ]);
    elbow.attachPoint.position.y = -L.upperArm;
    shoulder.tip.add(elbow.attachPoint);
    elbow.attachPoint.add(jointMarker(Math.max(RAD.upperArm.r * RAD.upperArm.taper, RAD.forearm.r) * 1.15));
    // Elbow flexion brings the forearm anteriorly, same hanging-segment fix.
    joints[`elbow_flex_${side}`] = { group: elbow.pivots.elbow_flex, axis: 'x', side, xSign: -1 };
    joints[`forearm_pronsup_${side}`] = { group: elbow.pivots.forearm_pronsup, axis: 'y', side, flipLeft: true };
    elbow.tip.add(limbDown(RAD.forearm.r, RAD.forearm.taper, L.forearm, SKIN));

    const wrist = buildJointChain([
      { id: 'wrist_flexext', axis: 'x' },
      { id: 'wrist_deviation', axis: 'z' },
    ]);
    wrist.attachPoint.position.y = -L.forearm;
    elbow.tip.add(wrist.attachPoint);
    wrist.attachPoint.add(jointMarker(RAD.forearm.r * RAD.forearm.taper * 1.25));
    // Wrist flexion (palm toward forearm) is also an anterior motion.
    joints[`wrist_flexext_${side}`] = { group: wrist.pivots.wrist_flexext, axis: 'x', side, xSign: -1 };
    joints[`wrist_deviation_${side}`] = { group: wrist.pivots.wrist_deviation, axis: 'z', side, flipLeft: true };

    const hand = new THREE.Mesh(
      new THREE.BoxGeometry(0.085 * H, L.hand, 0.020 * H),
      new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.6 })
    );
    hand.position.y = -L.hand / 2;
    hand.castShadow = true;
    const palm = new THREE.Mesh(
      new THREE.BoxGeometry(0.066 * H, L.hand * 0.82, 0.006 * H),
      new THREE.MeshStandardMaterial({ color: PALM, roughness: 0.55 })
    );
    palm.position.z = 0.020 * H / 2 + 0.003 * H;
    hand.add(palm);
    wrist.tip.add(hand);
  }

  // ---- Legs ----
  for (const side of ['R', 'L']) {
    const sx = SIDE_X[side];
    const hip = buildJointChain([
      { id: 'hip_flexext', axis: 'x' },
      { id: 'hip_abadd', axis: 'z' },
      { id: 'hip_rotation', axis: 'y' },
    ]);
    hip.attachPoint.position.set(sx * L.hipW / 2, 0, 0);
    root.add(hip.attachPoint);
    hip.attachPoint.add(jointMarker(RAD.thigh.r * 1.1));
    // Thigh hangs down from the hip; flexion (knee-up-front) is anterior,
    // same fix as the arm.
    joints[`hip_flexext_${side}`] = { group: hip.pivots.hip_flexext, axis: 'x', side, xSign: -1 };
    joints[`hip_abadd_${side}`] = { group: hip.pivots.hip_abadd, axis: 'z', side, flipLeft: true };
    joints[`hip_rotation_${side}`] = { group: hip.pivots.hip_rotation, axis: 'y', side, flipLeft: true };
    hip.tip.add(limbDown(RAD.thigh.r, RAD.thigh.taper, L.thigh, SKIN_DARK));

    const knee = buildJointChain([{ id: 'knee_flex', axis: 'x' }]);
    knee.attachPoint.position.y = -L.thigh;
    hip.tip.add(knee.attachPoint);
    knee.attachPoint.add(jointMarker(Math.max(RAD.thigh.r * RAD.thigh.taper, RAD.shank.r) * 1.15));
    // Knee is the one hanging-segment joint where flexion is POSTERIOR
    // (heel toward the buttock) — the raw, un-flipped rotateX direction
    // already matches that, so it keeps xSign +1.
    joints[`knee_flex_${side}`] = { group: knee.pivots.knee_flex, axis: 'x', side, xSign: 1 };
    knee.tip.add(limbDown(RAD.shank.r, RAD.shank.taper, L.shank, SKIN_DARK));

    const ankle = buildJointChain([
      { id: 'ankle_flexext', axis: 'x' },
      { id: 'ankle_inversion', axis: 'z' },
    ]);
    ankle.attachPoint.position.y = -L.shank;
    knee.tip.add(ankle.attachPoint);
    ankle.attachPoint.add(jointMarker(RAD.shank.r * RAD.shank.taper * 1.3));
    // The foot extends forward (+Z) from the ankle rather than hanging.
    // Raw positive rotateX tips a forward-pointing shape downward
    // (plantarflexion); dorsiflexion (toes up, +) needs the flip.
    joints[`ankle_flexext_${side}`] = { group: ankle.pivots.ankle_flexext, axis: 'x', side, xSign: -1 };
    // Inversion rolls the sole to face the midline — the opposite sense
    // from "away from midline" abduction — so this one inverts the usual
    // flipLeft convention.
    joints[`ankle_inversion_${side}`] = { group: ankle.pivots.ankle_inversion, axis: 'z', side, flipLeft: true, invert: true };

    const foot = new THREE.Mesh(
      new THREE.BoxGeometry(L.footB, L.footH, L.footL),
      new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.9 })
    );
    foot.position.set(0, -L.footH / 2, L.footL / 2 - 0.015 * H);
    foot.castShadow = true;
    foot.receiveShadow = true;
    const toe = new THREE.Mesh(
      new THREE.BoxGeometry(L.footB * 0.86, L.footH * 0.92, L.footL * 0.16),
      new THREE.MeshStandardMaterial({ color: TOE_CAP, roughness: 0.9 })
    );
    toe.position.set(0, 0, L.footL / 2 - L.footL * 0.08);
    foot.add(toe);
    ankle.tip.add(foot);
  }

  return { root, joints, lengths: L };
}

// Applies a slider value (degrees, already in neutral-zero convention) to a joint.
export function applyJointAngle(jointEntry, degrees) {
  let sign = 1;
  if (jointEntry.axis === 'x') {
    // Forward/back (flexion-extension) sign, resolved per-joint in
    // buildFigure() from the segment's hanging/rising geometry and its
    // anatomical convention (see comments above).
    sign = jointEntry.xSign ?? 1;
  } else if (jointEntry.flipLeft) {
    // Side-to-side / twisting motions: right-side segments sit at -X,
    // left at +X, and a raw positive rotateZ/rotateY always sweeps a
    // hanging bone toward +X — so moving "away from the midline"
    // (abduction, external rotation, radial deviation) needs the sign
    // flipped on the right side only. `invert` flips that again for a
    // motion whose positive sense is toward the midline instead (ankle
    // inversion).
    sign = jointEntry.side === 'R' ? -1 : 1;
    if (jointEntry.invert) sign *= -1;
  }
  const rad = THREE.MathUtils.degToRad(degrees * sign);
  const g = jointEntry.group;
  g.rotation.set(0, 0, 0);
  g.rotation[jointEntry.axis] = rad;
}
