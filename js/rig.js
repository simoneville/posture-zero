import * as THREE from 'three';

const SKIN = 0xe0b295;
const SKIN_DARK = 0xcf9b74;
const PALM = 0xecc9a8;
const CLOTHING = 0x5a7d9a;
const SHORTS = 0x3c4a5c;
const JOINT_MARKER = 0x2b2f36;
const TOE_CAP = 0x1c1c1f;

// The spine indicator: a rounded line running down the back at each
// vertebral level, plus a short contrasting rod at each level pointing
// straight out the back (surface-normal), so axial rotation/lateral lean of
// that section is visible even though the torso mesh itself is symmetric.
const SPINE_LINE = 0xe8b23d;
const SPINE_BEAD = 0xc6912a;
const FACING_ROD = 0xd23c33;

// A flat visual bulk-up applied to every joint-breadth-derived radius
// (elbow/wrist/knee/ankle/neck), on top of the anthropometric breadth data
// itself, since the bare bony breadth alone rendered as noticeably thin.
const LIMB_THICKNESS = 1.2;

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

// A ring of points around a rounded-rectangle cross-section (full width w,
// full depth d) at height y. Each of the 4 corners is replaced with an
// `arcSegs`-segment arc of radius `cornerFrac * min(halfWidth, halfDepth)`,
// so the lofted solid built from these rings reads as a naturally rounded
// torso instead of a sharp-edged box, and (just as importantly) so the
// silhouette stays visually continuous across a joint bend instead of
// showing the box's flat faces and corners suddenly kink apart.
function roundedRectRing(w, d, y, cornerFrac = 0.35, arcSegs = 3) {
  const hw = w / 2;
  const hd = d / 2;
  const r = Math.min(hw, hd) * cornerFrac;
  // Corner centers, one per quadrant, in perimeter order (front-right,
  // front-left, back-left, back-right) matching the original box winding.
  const centers = [
    [hw - r, hd - r],
    [-(hw - r), hd - r],
    [-(hw - r), -(hd - r)],
    [hw - r, -(hd - r)],
  ];
  const points = [];
  for (let c = 0; c < 4; c++) {
    const [cx, cz] = centers[c];
    for (let i = 0; i < arcSegs; i++) {
      const theta = THREE.MathUtils.degToRad(90 * c + (90 * i) / arcSegs);
      points.push([cx + Math.cos(theta) * r, y, cz + Math.sin(theta) * r]);
    }
  }
  return points;
}

// A rounded torso-like solid lofted through an arbitrary number of
// width/depth cross-sections, so it can taper (e.g. narrow at the waist,
// flare at the shoulders) instead of being a uniform box. `profile` is a
// list of {t, w, d} control points ordered bottom (t=0) to top (t=1); w/d
// are the full width/depth at that height. Centered on Y like BoxGeometry,
// spanning -height/2..+height/2, so it's a drop-in replacement for one.
function loftedBox(profile, height, color) {
  const rings = profile.map(({ t, w, d }) => roundedRectRing(w, d, t * height - height / 2));
  const n = rings[0].length;
  const positions = [];
  const quad = (a, b, c, d) => positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  const tri = (a, b, c) => positions.push(...a, ...b, ...c);

  for (let i = 0; i < rings.length - 1; i++) {
    const lo = rings[i];
    const hi = rings[i + 1];
    for (let c = 0; c < n; c++) {
      const c2 = (c + 1) % n;
      quad(lo[c], lo[c2], hi[c2], hi[c]);
    }
  }
  // Fan-triangulated end caps (a flat quad-per-4-corners no longer works now
  // that a ring has more than 4 points).
  const bottom = rings[0];
  const bottomCenter = [0, bottom[0][1], 0];
  for (let c = 0; c < n; c++) tri(bottomCenter, bottom[(c + 1) % n], bottom[c]);
  const top = rings[rings.length - 1];
  const topCenter = [0, top[0][1], 0];
  for (let c = 0; c < n; c++) tri(topCenter, top[c], top[(c + 1) % n]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  // This is a lofted shell (no solid interior fill), so a face that ever
  // renders back-face-culled leaves a hole straight through to whatever's
  // mounted behind it (the spine indicator, on the opposite wall). DoubleSide
  // keeps every band opaque from any viewing angle regardless of winding.
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.8, side: THREE.DoubleSide }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// A smooth ellipsoid "collar" dropped at the shared boundary between two
// torso segments, sized to that boundary's own cross-section. The torso
// mesh is built as several independently-pivoting rigid segments, so a
// sharp bend between them (e.g. a scoliotic curve) would otherwise open a
// visible wedge-shaped gap or z-fighting seam at the joint; a soft rounded
// filler there reads as a continuous, naturally-jointed torso instead.
// `adjacentLength` is the shorter of the two segment lengths it sits
// between, so the collar stays a subtle fillet even next to a short
// segment (e.g. the upper thoracic) instead of ballooning past it.
function torsoCollar(w, d, color, adjacentLength) {
  const halfHeight = Math.min(Math.min(w, d) * 0.16, adjacentLength * 0.24);
  const geo = new THREE.SphereGeometry(1, 16, 10);
  geo.scale(w / 2, halfHeight, d / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// A small bead at a spine segment boundary (the shared attach point between
// two segments), so the gold line's rounded capsule end on one side of a
// bend has something to visually anchor against on the other side, instead
// of two separate rounded tips just floating near each other.
function addSpineBead(attachPoint, depth) {
  const bead = new THREE.Mesh(
    new THREE.SphereGeometry(0.015, 12, 8),
    new THREE.MeshStandardMaterial({ color: SPINE_BEAD, roughness: 0.35, metalness: 0.15 })
  );
  bead.position.set(0, 0, -(depth / 2 + 0.008));
  bead.castShadow = true;
  attachPoint.add(bead);
}

// Adds this spine segment's visible indicator: a rounded gold line running
// up the back (a capsule, so its ends stay rounded and read as continuous
// with the next segment's line even across a bend) plus a short contrasting
// rod pointing straight out the back — normal to the local coronal plane —
// at the segment's mid-height. Because both are children of the segment's
// own pivot chain, they inherit its flexion/lateral-flexion/rotation
// exactly, so the rod visibly swings sideways under axial rotation or
// lateral lean, making that section's true facing direction legible at a
// glance instead of being hidden inside a symmetric torso mesh.
function addSpineIndicator(tip, length, depthBase, depthTop) {
  const depth = (depthBase + depthTop) / 2;
  const backZ = -(depth / 2 + 0.008);
  const lineRadius = 0.011;
  const lineLength = Math.max(length - lineRadius * 2, 0.001);

  const line = new THREE.Mesh(
    new THREE.CapsuleGeometry(lineRadius, lineLength, 4, 8),
    new THREE.MeshStandardMaterial({ color: SPINE_LINE, roughness: 0.35, metalness: 0.15 })
  );
  line.position.set(0, length / 2, backZ);
  line.castShadow = true;
  tip.add(line);

  const rodLength = 0.05;
  const coneHeight = 0.026;
  const rod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.007, 0.009, rodLength, 8),
    new THREE.MeshStandardMaterial({ color: FACING_ROD, roughness: 0.3 })
  );
  rod.rotation.x = -Math.PI / 2;
  rod.position.set(0, length / 2, backZ - rodLength / 2);
  rod.castShadow = true;
  tip.add(rod);

  const rodTip = new THREE.Mesh(
    new THREE.ConeGeometry(0.015, coneHeight, 8),
    new THREE.MeshStandardMaterial({ color: FACING_ROD, roughness: 0.3 })
  );
  rodTip.rotation.x = -Math.PI / 2;
  rodTip.position.set(0, length / 2, backZ - rodLength - coneHeight / 2);
  rodTip.castShadow = true;
  tip.add(rodTip);
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
  // A raw positive rotateY on a rising chain swings a forward-facing point
  // (like the nose) toward +X — the character's left — while simultaneously
  // swinging their actual right side forward (the same physical rotation,
  // described from two different landmarks). Each group's labels in
  // data.js are written to match whichever of those descriptions reads
  // naturally for that segment (torso segments: "which side is forward";
  // the neck: "which way you're facing"), so this stays a raw, un-flipped
  // sign for every segment.
  joints[`${prefix}_rotation`] = { group: chain.pivots[`${prefix}_rotation`], axis: 'y', sign: 1 };
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
  // Positive rotateZ here lifts the character's left hip (see the
  // Obliquity label: "Right Up" / "Left Up").
  joints.pelvis_obliquity = { group: pelvisPivot.pivots.pelvis_obliquity, axis: 'z', sign: 1 };
  // Same raw rotateY as the spine segments (addSpineSegment) — see the
  // comment there. Positive swings the character's right hip forward
  // (see the Rotation label: "Left Forward" / "Right Forward").
  joints.pelvis_rotation = { group: pelvisPivot.pivots.pelvis_rotation, axis: 'y', sign: 1 };

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
  addSpineIndicator(pelvisPivot.tip, L.pelvisLength, L.pelvisDepth, L.waistDepth);

  // ---- Spine: lumbar -> mid thoracic -> upper thoracic -> cervical ->
  // head-on-neck -> head. Each is its own pivot (flex/ext, lateral flexion,
  // rotation) so a scoliotic curve — different bends/rotations at different
  // levels — can be posed directly, rather than one rigid "trunk" bend.
  const lumbar = addSpineSegment(joints, pelvisPivot.tip, 'lumbar', L.lumbarLength);
  lumbar.attachPoint.position.y = L.pelvisLength;
  // A rounded collar bridges the pelvis/lumbar boundary so a sharp
  // lumbar bend doesn't open a visible gap against the (separately
  // pivoting) pelvis above it.
  lumbar.attachPoint.add(torsoCollar(L.waistWidth, L.waistDepth, CLOTHING, Math.min(L.pelvisLength, L.lumbarLength)));
  addSpineBead(lumbar.attachPoint, L.waistDepth);
  lumbar.tip.add(
    loftedBox([{ t: 0, w: L.waistWidth, d: L.waistDepth }, { t: 1, w: widthAt(tLumbarTop), d: depthAt(tLumbarTop) }], L.lumbarLength, CLOTHING)
      .translateY(L.lumbarLength / 2)
  );
  addSpineIndicator(lumbar.tip, L.lumbarLength, L.waistDepth, depthAt(tLumbarTop));

  const midThoracic = addSpineSegment(joints, lumbar.tip, 'mthoracic', L.midThoracicLength);
  midThoracic.attachPoint.position.y = L.lumbarLength;
  midThoracic.attachPoint.add(torsoCollar(widthAt(tLumbarTop), depthAt(tLumbarTop), CLOTHING, Math.min(L.lumbarLength, L.midThoracicLength)));
  addSpineBead(midThoracic.attachPoint, depthAt(tLumbarTop));
  midThoracic.tip.add(
    loftedBox(
      [{ t: 0, w: widthAt(tLumbarTop), d: depthAt(tLumbarTop) }, { t: 1, w: widthAt(tMidThoracicTop), d: depthAt(tMidThoracicTop) }],
      L.midThoracicLength,
      CLOTHING
    ).translateY(L.midThoracicLength / 2)
  );
  addSpineIndicator(midThoracic.tip, L.midThoracicLength, depthAt(tLumbarTop), depthAt(tMidThoracicTop));

  const upperThoracic = addSpineSegment(joints, midThoracic.tip, 'uthoracic', L.upperThoracicLength);
  upperThoracic.attachPoint.position.y = L.midThoracicLength;
  upperThoracic.attachPoint.add(torsoCollar(widthAt(tMidThoracicTop), depthAt(tMidThoracicTop), CLOTHING, Math.min(L.midThoracicLength, L.upperThoracicLength)));
  addSpineBead(upperThoracic.attachPoint, depthAt(tMidThoracicTop));
  upperThoracic.tip.add(
    loftedBox(
      [{ t: 0, w: widthAt(tMidThoracicTop), d: depthAt(tMidThoracicTop) }, { t: 1, w: L.shoulderWidth, d: L.chestDepth }],
      L.upperThoracicLength,
      CLOTHING
    ).translateY(L.upperThoracicLength / 2)
  );
  addSpineIndicator(upperThoracic.tip, L.upperThoracicLength, depthAt(tMidThoracicTop), L.chestDepth);

  // ---- Neck: cervical -> head-on-neck -> head ----
  const neckBaseR = L.headBreadth * 0.35 * LIMB_THICKNESS;
  const neckMidR = L.headBreadth * 0.315 * LIMB_THICKNESS;
  const neckTopR = L.headBreadth * 0.287 * LIMB_THICKNESS;

  const cervical = addSpineSegment(joints, upperThoracic.tip, 'cerv', L.cervicalLength);
  cervical.attachPoint.position.y = L.upperThoracicLength;
  cervical.attachPoint.add(jointMarker(neckBaseR * 0.95));
  addSpineBead(cervical.attachPoint, L.chestDepth);
  cervical.tip.add(limbUp(neckBaseR, neckMidR, L.cervicalLength, SKIN_DARK));
  addSpineIndicator(cervical.tip, L.cervicalLength, neckBaseR * 2, neckMidR * 2);

  const headOnNeck = addSpineSegment(joints, cervical.tip, 'headneck', L.headOnNeckLength);
  headOnNeck.attachPoint.position.y = L.cervicalLength;
  addSpineBead(headOnNeck.attachPoint, neckMidR * 2);
  headOnNeck.tip.add(limbUp(neckMidR, neckTopR, L.headOnNeckLength, SKIN_DARK));
  addSpineIndicator(headOnNeck.tip, L.headOnNeckLength, neckMidR * 2, neckTopR * 2);

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
  const elbowR = (L.elbowBreadth / 2) * LIMB_THICKNESS;
  const wristR = (L.wristBreadth / 2) * LIMB_THICKNESS;
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
  const kneeR = (L.kneeBreadth / 2) * LIMB_THICKNESS;
  const ankleR = (L.ankleBreadth / 2) * LIMB_THICKNESS;
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

  return {
    root,
    joints,
    lengths: L,
    // Reference frames for the overall-orientation control (main.js): the
    // pelvis's own pivot tip and the head-on-neck segment (the eye line
    // sits in its local X-Z plane), so the whole figure can be levelled
    // against either one regardless of how the spine is posed.
    refs: { eyeline: headOnNeck.tip, pelvis: pelvisPivot.tip },
  };
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
