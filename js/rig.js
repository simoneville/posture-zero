import * as THREE from 'three';

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
// -length/2 so it extends from y=0 down to y=-length.
function limbDown(radiusProximal, radiusDistal, length, color) {
  const geo = new THREE.CylinderGeometry(radiusProximal, radiusDistal, length, 12, 1);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
  mesh.position.y = -length / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Cylinder segments that rise up from their pivot (the neck segments, base
// at the bottom near the torso, narrower end at the top).
function limbUp(radiusProximal, radiusDistal, length, color) {
  const geo = new THREE.CylinderGeometry(radiusDistal, radiusProximal, length, 12, 1);
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

// A rectangular torso-like solid lofted through an arbitrary number of
// width/depth cross-sections, so it can taper (e.g. narrow at the waist,
// flare at the shoulders) instead of being a uniform box. `profile` is a
// list of {t, w, d} control points ordered bottom (t=0) to top (t=1); w/d
// are the full width/depth at that height. Centered on Y like BoxGeometry,
// spanning -height/2..+height/2, so it's a drop-in replacement for one.
function loftedBox(profile, height, color) {
  const ring = ({ t, w, d }) => {
    const y = t * height - height / 2;
    return [
      [w / 2, y, d / 2], // front-right
      [-w / 2, y, d / 2], // front-left
      [-w / 2, y, -d / 2], // back-left
      [w / 2, y, -d / 2], // back-right
    ];
  };
  const rings = profile.map(ring);
  const positions = [];
  const quad = (a, b, c, d) => positions.push(...a, ...b, ...c, ...a, ...c, ...d);

  for (let i = 0; i < rings.length - 1; i++) {
    const lo = rings[i];
    const hi = rings[i + 1];
    for (let c = 0; c < 4; c++) {
      const c2 = (c + 1) % 4;
      quad(lo[c], lo[c2], hi[c2], hi[c]);
    }
  }
  const bottom = rings[0];
  quad(bottom[3], bottom[2], bottom[1], bottom[0]);
  const top = rings[rings.length - 1];
  quad(top[0], top[1], top[2], top[3]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
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

// Registers a rising-chain spine segment (pelvis, lumbar, mid/upper
// thoracic, cervical, head-on-neck all rise from their pivot toward the
// head), wiring flexext/latflex/rotation with the "rising chain, no sign
// flip" convention shared by all of them, and returns the built chain so
// the caller can attach a visual mesh and the next segment to `.tip`.
function addSpineSegment(joints, parent, prefix, length) {
  const chain = buildJointChain([
    { id: `${prefix}_flexext`, axis: 'x' },
    { id: `${prefix}_latflex`, axis: 'z' },
    { id: `${prefix}_rotation`, axis: 'y' },
  ]);
  parent.add(chain.attachPoint);
  joints[`${prefix}_flexext`] = { group: chain.pivots[`${prefix}_flexext`], axis: 'x', sign: 1 };
  joints[`${prefix}_latflex`] = { group: chain.pivots[`${prefix}_latflex`], axis: 'z', sign: 1 };
  // Rotating this segment to the character's actual right (the labeled
  // positive direction) needs rotateY negated: a raw positive rotateY on a
  // rising chain swings it toward +X, which is the character's LEFT.
  joints[`${prefix}_rotation`] = { group: chain.pivots[`${prefix}_rotation`], axis: 'y', sign: -1 };
  chain.length = length;
  return chain;
}

// `L` is a fully-resolved set of absolute lengths in meters (see
// data.js#computeDefaultLengths — every ANTHRO_RATIOS key scaled by height,
// then individually overridable in the Detailed Body Measurements panel).
export function buildFigure(L) {
  const joints = {}; // flat map: full id ("shoulder_flexext_R") -> {group, axis, side, ...sign flags}
  const root = new THREE.Group();
  root.position.y = L.footHeight + L.shankLength + L.thighLength + L.pelvisLength;

  // Smoothly interpolated torso cross-section between the waist (t=0) and
  // the shoulders (t=1), biased (t^1.6) to stay closer to waist width
  // through the lower back and flare out mostly through the upper back,
  // roughly matching how the ribcage actually widens.
  const torsoEase = (t) => Math.pow(t, 1.6);
  const widthAt = (t) => L.waistWidth + (L.shoulderWidth - L.waistWidth) * torsoEase(t);
  const depthAt = (t) => L.waistDepth + (L.chestDepth - L.waistDepth) * torsoEase(t);
  const chestRegion = L.lumbarLength + L.midThoracicLength + L.upperThoracicLength;
  const tLumbarTop = L.lumbarLength / chestRegion;
  const tMidThoracicTop = (L.lumbarLength + L.midThoracicLength) / chestRegion;

  // The pelvis itself is a pivot (tilt/obliquity/rotation), sitting at the
  // hip-socket level. Everything else in the figure — the pelvis mesh, the
  // spine, and both legs — is built as its children, so this one rotation
  // carries the whole body the way it would if the pelvis physically tipped
  // or hiked. There's no ground/foot-planting constraint anywhere in this
  // rig, so the legs simply move with it like every other joint here.
  const pelvisPivot = buildJointChain([
    { id: 'pelvis_tilt', axis: 'x' },
    { id: 'pelvis_obliquity', axis: 'z' },
    { id: 'pelvis_rotation', axis: 'y' },
  ]);
  root.add(pelvisPivot.attachPoint);
  joints.pelvis_tilt = { group: pelvisPivot.pivots.pelvis_tilt, axis: 'x', sign: 1 };
  joints.pelvis_obliquity = { group: pelvisPivot.pivots.pelvis_obliquity, axis: 'z', sign: 1 };
  // Same rotateY-negation as the spine segments (addSpineSegment) — see the
  // comment there.
  joints.pelvis_rotation = { group: pelvisPivot.pivots.pelvis_rotation, axis: 'y', sign: -1 };

  // The pelvis tapers from hip width at its base (where the femurs attach)
  // up to waist width at its top, matching the lumbar segment's own base
  // cross-section so the two pieces read as one continuous, waisted torso.
  const pelvis = loftedBox(
    [
      { t: 0, w: L.hipWidth, d: L.pelvisDepth },
      { t: 1, w: L.waistWidth, d: L.waistDepth },
    ],
    L.pelvisLength,
    SHORTS
  );
  pelvis.position.y = L.pelvisLength / 2;
  pelvisPivot.tip.add(pelvis);

  // ---- Spine: lumbar -> mid thoracic -> upper thoracic -> cervical ->
  // head-on-neck -> head. Each is its own pivot (flex/ext, lateral flexion,
  // rotation) so a scoliotic curve — different bends/rotations at different
  // levels — can be posed directly, rather than one rigid "trunk" bend.
  const lumbar = addSpineSegment(joints, pelvisPivot.tip, 'lumbar', L.lumbarLength);
  lumbar.attachPoint.position.y = L.pelvisLength;
  lumbar.tip.add(
    loftedBox([{ t: 0, w: L.waistWidth, d: L.waistDepth }, { t: 1, w: widthAt(tLumbarTop), d: depthAt(tLumbarTop) }], L.lumbarLength, CLOTHING)
      .translateY(L.lumbarLength / 2)
  );

  const midThoracic = addSpineSegment(joints, lumbar.tip, 'mthoracic', L.midThoracicLength);
  midThoracic.attachPoint.position.y = L.lumbarLength;
  midThoracic.tip.add(
    loftedBox(
      [{ t: 0, w: widthAt(tLumbarTop), d: depthAt(tLumbarTop) }, { t: 1, w: widthAt(tMidThoracicTop), d: depthAt(tMidThoracicTop) }],
      L.midThoracicLength,
      CLOTHING
    ).translateY(L.midThoracicLength / 2)
  );

  const upperThoracic = addSpineSegment(joints, midThoracic.tip, 'uthoracic', L.upperThoracicLength);
  upperThoracic.attachPoint.position.y = L.midThoracicLength;
  upperThoracic.tip.add(
    loftedBox(
      [{ t: 0, w: widthAt(tMidThoracicTop), d: depthAt(tMidThoracicTop) }, { t: 1, w: L.shoulderWidth, d: L.chestDepth }],
      L.upperThoracicLength,
      CLOTHING
    ).translateY(L.upperThoracicLength / 2)
  );

  // ---- Neck: cervical -> head-on-neck -> head ----
  const neckBaseR = L.headBreadth * 0.35;
  const neckMidR = L.headBreadth * 0.315;
  const neckTopR = L.headBreadth * 0.287;

  const cervical = addSpineSegment(joints, upperThoracic.tip, 'cerv', L.cervicalLength);
  cervical.attachPoint.position.y = L.upperThoracicLength;
  cervical.attachPoint.add(jointMarker(neckBaseR * 0.95));
  cervical.tip.add(limbUp(neckBaseR, neckMidR, L.cervicalLength, SKIN_DARK));

  const headOnNeck = addSpineSegment(joints, cervical.tip, 'headneck', L.headOnNeckLength);
  headOnNeck.attachPoint.position.y = L.cervicalLength;
  headOnNeck.tip.add(limbUp(neckMidR, neckTopR, L.headOnNeckLength, SKIN_DARK));

  const headR = L.headBreadth / 2;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(headR, 20, 16),
    new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.6 })
  );
  head.position.y = L.headOnNeckLength + headR * 0.92;
  head.castShadow = true;
  addFace(head, headR);
  headOnNeck.tip.add(head);

  // ---- Arms ----
  // Bony breadth at the elbow and wrist anchors both the taper of the upper
  // arm/forearm and the joint markers there, so consecutive segments meet
  // at a consistent thickness instead of an arbitrary multiplier.
  const elbowR = L.elbowBreadth / 2;
  const wristR = L.wristBreadth / 2;
  const upperArmProximalR = elbowR * 1.4;

  for (const side of ['R', 'L']) {
    const sx = SIDE_X[side];
    const shoulder = buildJointChain([
      { id: 'shoulder_flexext', axis: 'x' },
      { id: 'shoulder_abadd', axis: 'z' },
      { id: 'shoulder_rotation', axis: 'y' },
    ]);
    // The shoulder (glenohumeral) joint center sits inboard of the torso's
    // outer surface, at the biacromial width, not on the wider bideltoid
    // surface the upper-thoracic mesh above is drawn at.
    shoulder.attachPoint.position.set(sx * L.shoulderJointWidth / 2, L.upperThoracicLength, 0);
    upperThoracic.tip.add(shoulder.attachPoint);
    shoulder.attachPoint.add(jointMarker(upperArmProximalR * 1.05));
    // The upper arm hangs DOWN from the shoulder. A raw positive rotateX on
    // a hanging segment sweeps it posteriorly, so flexion (anterior, +Z)
    // needs the sign flipped.
    joints[`shoulder_flexext_${side}`] = { group: shoulder.pivots.shoulder_flexext, axis: 'x', side, sign: -1 };
    joints[`shoulder_abadd_${side}`] = { group: shoulder.pivots.shoulder_abadd, axis: 'z', side, flipLeft: true };
    joints[`shoulder_rotation_${side}`] = { group: shoulder.pivots.shoulder_rotation, axis: 'y', side, flipLeft: true };
    shoulder.tip.add(limbDown(upperArmProximalR, elbowR, L.upperArmLength, SKIN));

    const elbow = buildJointChain([
      { id: 'elbow_flex', axis: 'x' },
      { id: 'forearm_pronsup', axis: 'y' },
    ]);
    elbow.attachPoint.position.y = -L.upperArmLength;
    shoulder.tip.add(elbow.attachPoint);
    elbow.attachPoint.add(jointMarker(elbowR * 1.15));
    // Elbow flexion brings the forearm anteriorly, same hanging-segment fix.
    joints[`elbow_flex_${side}`] = { group: elbow.pivots.elbow_flex, axis: 'x', side, sign: -1 };
    joints[`forearm_pronsup_${side}`] = { group: elbow.pivots.forearm_pronsup, axis: 'y', side, flipLeft: true };
    elbow.tip.add(limbDown(elbowR, wristR, L.forearmLength, SKIN));

    const wrist = buildJointChain([
      { id: 'wrist_flexext', axis: 'x' },
      { id: 'wrist_deviation', axis: 'z' },
    ]);
    wrist.attachPoint.position.y = -L.forearmLength;
    elbow.tip.add(wrist.attachPoint);
    wrist.attachPoint.add(jointMarker(wristR * 1.2));
    // Wrist flexion (palm toward forearm) is also an anterior motion.
    joints[`wrist_flexext_${side}`] = { group: wrist.pivots.wrist_flexext, axis: 'x', side, sign: -1 };
    joints[`wrist_deviation_${side}`] = { group: wrist.pivots.wrist_deviation, axis: 'z', side, flipLeft: true };

    const hand = new THREE.Mesh(
      new THREE.BoxGeometry(wristR * 2.4, L.handLength, wristR * 0.55),
      new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.6 })
    );
    hand.position.y = -L.handLength / 2;
    hand.castShadow = true;
    const palm = new THREE.Mesh(
      new THREE.BoxGeometry(wristR * 1.9, L.handLength * 0.82, wristR * 0.15),
      new THREE.MeshStandardMaterial({ color: PALM, roughness: 0.55 })
    );
    palm.position.z = (wristR * 0.55) / 2 + wristR * 0.08;
    hand.add(palm);
    wrist.tip.add(hand);
  }

  // ---- Legs ----
  const kneeR = L.kneeBreadth / 2;
  const ankleR = L.ankleBreadth / 2;
  const thighProximalR = kneeR * 1.7;

  for (const side of ['R', 'L']) {
    const sx = SIDE_X[side];
    const hip = buildJointChain([
      { id: 'hip_flexext', axis: 'x' },
      { id: 'hip_abadd', axis: 'z' },
      { id: 'hip_rotation', axis: 'y' },
    ]);
    // Like the shoulder, the hip joint center (femoral head) sits well
    // inboard of the pelvis's outer surface.
    hip.attachPoint.position.set(sx * L.hipJointWidth / 2, 0, 0);
    pelvisPivot.tip.add(hip.attachPoint);
    hip.attachPoint.add(jointMarker(thighProximalR * 0.85));
    // Thigh hangs down from the hip; flexion (knee-up-front) is anterior,
    // same fix as the arm.
    joints[`hip_flexext_${side}`] = { group: hip.pivots.hip_flexext, axis: 'x', side, sign: -1 };
    joints[`hip_abadd_${side}`] = { group: hip.pivots.hip_abadd, axis: 'z', side, flipLeft: true };
    joints[`hip_rotation_${side}`] = { group: hip.pivots.hip_rotation, axis: 'y', side, flipLeft: true };
    hip.tip.add(limbDown(thighProximalR, kneeR, L.thighLength, SKIN_DARK));

    const knee = buildJointChain([{ id: 'knee_flex', axis: 'x' }]);
    knee.attachPoint.position.y = -L.thighLength;
    hip.tip.add(knee.attachPoint);
    knee.attachPoint.add(jointMarker(kneeR * 1.15));
    // Knee is the one hanging-segment joint where flexion is POSTERIOR
    // (heel toward the buttock) — the raw, un-flipped rotateX direction
    // already matches that, so it keeps sign +1.
    joints[`knee_flex_${side}`] = { group: knee.pivots.knee_flex, axis: 'x', side, sign: 1 };
    knee.tip.add(limbDown(kneeR, ankleR, L.shankLength, SKIN_DARK));

    const ankle = buildJointChain([
      { id: 'ankle_flexext', axis: 'x' },
      { id: 'ankle_inversion', axis: 'z' },
    ]);
    ankle.attachPoint.position.y = -L.shankLength;
    knee.tip.add(ankle.attachPoint);
    ankle.attachPoint.add(jointMarker(ankleR * 1.25));
    // The foot extends forward (+Z) from the ankle rather than hanging.
    // Raw positive rotateX tips a forward-pointing shape downward
    // (plantarflexion); dorsiflexion (toes up, +) needs the flip.
    joints[`ankle_flexext_${side}`] = { group: ankle.pivots.ankle_flexext, axis: 'x', side, sign: -1 };
    // Inversion rolls the sole to face the midline — the opposite sense
    // from "away from midline" abduction — so this one inverts the usual
    // flipLeft convention.
    joints[`ankle_inversion_${side}`] = { group: ankle.pivots.ankle_inversion, axis: 'z', side, flipLeft: true, invert: true };

    const foot = new THREE.Mesh(
      new THREE.BoxGeometry(L.footBreadth, L.footHeight, L.footLength),
      new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.9 })
    );
    foot.position.set(0, -L.footHeight / 2, L.footLength / 2 - ankleR * 0.6);
    foot.castShadow = true;
    foot.receiveShadow = true;
    const toe = new THREE.Mesh(
      new THREE.BoxGeometry(L.footBreadth * 0.86, L.footHeight * 0.92, L.footLength * 0.16),
      new THREE.MeshStandardMaterial({ color: TOE_CAP, roughness: 0.9 })
    );
    toe.position.set(0, 0, L.footLength / 2 - L.footLength * 0.08);
    foot.add(toe);
    ankle.tip.add(foot);
  }

  return { root, joints, lengths: L };
}

// Applies a slider value (degrees, already in neutral-zero convention) to a joint.
export function applyJointAngle(jointEntry, degrees) {
  let sign;
  if (jointEntry.sign !== undefined) {
    // Explicit per-joint, per-axis sign resolved in buildFigure() from the
    // segment's hanging/rising geometry and its anatomical convention (see
    // comments above) — used for every unpaired (side: null) joint,
    // whichever axis it rotates on.
    sign = jointEntry.sign;
  } else if (jointEntry.flipLeft) {
    // Side-to-side / twisting motions on a *paired* joint: right-side
    // segments sit at -X, left at +X, and a raw positive rotateZ/rotateY
    // always sweeps a hanging bone toward +X — so moving "away from the
    // midline" (abduction, external rotation, radial deviation) needs the
    // sign flipped on the right side only. `invert` flips that again for a
    // motion whose positive sense is toward the midline instead (ankle
    // inversion).
    sign = jointEntry.side === 'R' ? -1 : 1;
    if (jointEntry.invert) sign *= -1;
  } else {
    sign = 1;
  }
  const rad = THREE.MathUtils.degToRad(degrees * sign);
  const g = jointEntry.group;
  g.rotation.set(0, 0, 0);
  g.rotation[jointEntry.axis] = rad;
}
