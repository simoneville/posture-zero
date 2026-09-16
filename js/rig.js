import * as THREE from 'three';
import { ANTHRO_RATIOS } from './data.js';

const SKIN = 0xe0b295;
const SKIN_DARK = 0xcf9b74;
const CLOTHING = 0x5a7d9a;
const SHORTS = 0x3c4a5c;
const JOINT_MARKER = 0x2b2f36;

const SIDE_X = { R: -1, L: 1 }; // character faces +Z (toward camera); their right hand appears on the viewer's left

function capsule(radius, length, color) {
  const cylLength = Math.max(length - 2 * radius, 0.001);
  const geo = new THREE.CapsuleGeometry(radius, cylLength, 6, 12);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
  mesh.position.y = -length / 2;
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

// Builds a chain of nested pivot groups, one per DOF definition, in the given
// order. Returns { attachPoint: outermost group (parent attaches here),
// tip: innermost group (children/meshes attach here), pivots: {id: group} }.
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

  const RAD = {
    upperArm: 0.028 * H,
    forearm: 0.023 * H,
    thigh: 0.055 * H,
    shank: 0.040 * H,
    neck: 0.034 * H,
  };

  const joints = {}; // flat map: full id ("shoulder_flexext_R") -> {group, axis, def}
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
  for (const [id, group] of Object.entries(lumbar.pivots)) {
    joints[id] = { group, axis: group.userData.axis };
  }

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
  for (const [id, group] of Object.entries(neckChain.pivots)) {
    joints[id] = { group, axis: group.userData.axis };
  }
  neckChain.tip.add(capsule(RAD.neck, L.neck, SKIN_DARK));
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(L.headB / 2, 16, 12),
    new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.6 })
  );
  head.position.y = L.neck + L.headB / 2 * 0.85;
  head.castShadow = true;
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
    shoulder.attachPoint.add(jointMarker(RAD.upperArm * 1.15));
    for (const [id, group] of Object.entries(shoulder.pivots)) {
      const key = `${id}_${side}`;
      joints[key] = { group, axis: group.userData.axis, side, flipLeft: true };
    }
    shoulder.tip.add(capsule(RAD.upperArm, L.upperArm, SKIN));

    const elbow = buildJointChain([
      { id: 'elbow_flex', axis: 'x' },
      { id: 'forearm_pronsup', axis: 'y' },
    ]);
    elbow.attachPoint.position.y = -L.upperArm;
    shoulder.tip.add(elbow.attachPoint);
    elbow.attachPoint.add(jointMarker(RAD.forearm * 1.15));
    for (const [id, group] of Object.entries(elbow.pivots)) {
      const key = `${id}_${side}`;
      joints[key] = { group, axis: group.userData.axis, side, flipLeft: id === 'forearm_pronsup' };
    }
    elbow.tip.add(capsule(RAD.forearm, L.forearm, SKIN));

    const wrist = buildJointChain([
      { id: 'wrist_flexext', axis: 'x' },
      { id: 'wrist_deviation', axis: 'z' },
    ]);
    wrist.attachPoint.position.y = -L.forearm;
    elbow.tip.add(wrist.attachPoint);
    for (const [id, group] of Object.entries(wrist.pivots)) {
      const key = `${id}_${side}`;
      joints[key] = { group, axis: group.userData.axis, side, flipLeft: id === 'wrist_deviation' };
    }
    const hand = new THREE.Mesh(
      new THREE.BoxGeometry(0.085 * H, L.hand, 0.022 * H),
      new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.6 })
    );
    hand.position.y = -L.hand / 2;
    hand.castShadow = true;
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
    hip.attachPoint.add(jointMarker(RAD.thigh * 1.1));
    for (const [id, group] of Object.entries(hip.pivots)) {
      const key = `${id}_${side}`;
      joints[key] = { group, axis: group.userData.axis, side, flipLeft: true };
    }
    hip.tip.add(capsule(RAD.thigh, L.thigh, SKIN_DARK));

    const knee = buildJointChain([{ id: 'knee_flex', axis: 'x' }]);
    knee.attachPoint.position.y = -L.thigh;
    hip.tip.add(knee.attachPoint);
    knee.attachPoint.add(jointMarker(RAD.shank * 1.15));
    joints[`knee_flex_${side}`] = { group: knee.pivots.knee_flex, axis: 'x', side };
    knee.tip.add(capsule(RAD.shank, L.shank, SKIN_DARK));

    const ankle = buildJointChain([
      { id: 'ankle_flexext', axis: 'x' },
      { id: 'ankle_inversion', axis: 'z' },
    ]);
    ankle.attachPoint.position.y = -L.shank;
    knee.tip.add(ankle.attachPoint);
    for (const [id, group] of Object.entries(ankle.pivots)) {
      const key = `${id}_${side}`;
      joints[key] = { group, axis: group.userData.axis, side, flipLeft: id === 'ankle_inversion' };
    }
    const foot = new THREE.Mesh(
      new THREE.BoxGeometry(L.footB, L.footH, L.footL),
      new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.9 })
    );
    foot.position.set(0, -L.footH / 2, L.footL / 2 - 0.015 * H);
    foot.castShadow = true;
    foot.receiveShadow = true;
    ankle.tip.add(foot);
  }

  return { root, joints, lengths: L };
}

// Applies a slider value (degrees, already in neutral-zero convention) to a joint.
export function applyJointAngle(jointEntry, degrees) {
  // Right-side segments sit at -X, left-side at +X (character faces the
  // camera). A positive local rotateZ/rotateY always sweeps a hanging bone
  // toward +X, so "away from the midline" (abduction, external rotation,
  // radial deviation, inversion) needs a sign flip on the right side only.
  const sign = jointEntry.flipLeft ? (jointEntry.side === 'R' ? -1 : 1) : 1;
  const rad = THREE.MathUtils.degToRad(degrees * sign);
  const g = jointEntry.group;
  g.rotation.set(0, 0, 0);
  g.rotation[jointEntry.axis] = rad;
}
