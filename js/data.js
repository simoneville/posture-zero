// Anthropometric and joint-range-of-motion reference data.
//
// Segment length ratios are the classic "percent of stature" set popularized by
// Drillis & Contini (1966) and reproduced in Winter, "Biomechanics and Motor
// Control of Human Movement" — a standard, generalized-adult reference used when
// no individual measurements are available. They are averages, not a diagnosis
// of any one body.
//
// Joint ranges use the orthopedic "neutral-zero method" (AAOS / Norkin & White,
// "Measurement of Joint Motion"): each joint's neutral anatomical position is
// defined as 0°, and motion in each plane is recorded as two numbers either
// side of that zero (e.g. "Flexion 150° – 0 – Extension 10°"). That is exactly
// the shape used here: every slider's minimum is one extreme of a plane of
// motion, its maximum is the opposite extreme, and 0 is always neutral.

export const ANTHRO_RATIOS = {
  headHeight: 0.130,
  neckLength: 0.052,
  trunkLength: 0.288,
  thighLength: 0.245,
  shankLength: 0.246,
  footHeight: 0.039,
  footLength: 0.152,
  footBreadth: 0.055,
  upperArmLength: 0.186,
  forearmLength: 0.146,
  handLength: 0.108,
  shoulderWidth: 0.259,
  hipWidth: 0.191,
  headBreadth: 0.130,
  chestDepth: 0.115,
  pelvisDepth: 0.105,
  // The natural waist is narrower than both the shoulders and the hips —
  // not part of the classic Drillis & Contini set, but a typical adult
  // proportion used to give the torso a tapered silhouette instead of a
  // uniform block.
  waistWidth: 0.174,
  waistDepth: 0.098,
};

// side: null (unpaired/axial), or 'pair' (instantiated once per L/R side)
// axis: local rotation axis on the joint pivot ('x' = flex/ext, 'z' = ab/adduction
//       or lateral flexion, 'y' = internal/external rotation or axial rotation)
// flipLeft: whether the sign of the slider value is negated on the left side so
//       that, e.g., positive "abduction" always moves the limb away from midline
//       on both sides.
export const JOINT_GROUPS = [
  {
    id: 'pelvis',
    label: 'Pelvis',
    side: null,
    joints: [
      { id: 'pelvis_tilt', label: 'Anterior / Posterior Tilt', min: -30, max: 30, axis: 'x', minLabel: 'Posterior', maxLabel: 'Anterior' },
      { id: 'pelvis_obliquity', label: 'Obliquity', min: -20, max: 20, axis: 'z', minLabel: 'Left', maxLabel: 'Right' },
      { id: 'pelvis_rotation', label: 'Rotation', min: -30, max: 30, axis: 'y', minLabel: 'Left', maxLabel: 'Right' },
    ],
  },
  {
    id: 'head_neck',
    label: 'Head & Neck',
    side: null,
    joints: [
      { id: 'neck_flexext', label: 'Flexion / Extension', min: -60, max: 50, axis: 'x', minLabel: 'Extension', maxLabel: 'Flexion' },
      { id: 'neck_latflex', label: 'Lateral Flexion', min: -45, max: 45, axis: 'z', minLabel: 'Left', maxLabel: 'Right' },
      { id: 'neck_rotation', label: 'Rotation', min: -80, max: 80, axis: 'y', minLabel: 'Left', maxLabel: 'Right' },
    ],
  },
  {
    id: 'trunk',
    label: 'Trunk / Spine',
    side: null,
    joints: [
      { id: 'trunk_flexext', label: 'Flexion / Extension', min: -25, max: 80, axis: 'x', minLabel: 'Extension', maxLabel: 'Flexion' },
      { id: 'trunk_latflex', label: 'Lateral Flexion', min: -35, max: 35, axis: 'z', minLabel: 'Left', maxLabel: 'Right' },
      { id: 'trunk_rotation', label: 'Rotation', min: -45, max: 45, axis: 'y', minLabel: 'Left', maxLabel: 'Right' },
    ],
  },
  {
    id: 'shoulder',
    label: 'Shoulder',
    side: 'pair',
    joints: [
      { id: 'shoulder_flexext', label: 'Flexion / Extension', min: -60, max: 180, axis: 'x', minLabel: 'Extension', maxLabel: 'Flexion' },
      { id: 'shoulder_abadd', label: 'Abduction / Adduction', min: -50, max: 180, axis: 'z', minLabel: 'Adduction', maxLabel: 'Abduction', flipLeft: true },
      { id: 'shoulder_rotation', label: 'Internal / External Rotation', min: -70, max: 90, axis: 'y', minLabel: 'Internal', maxLabel: 'External', flipLeft: true },
    ],
  },
  {
    id: 'elbow',
    label: 'Elbow & Forearm',
    side: 'pair',
    joints: [
      { id: 'elbow_flex', label: 'Elbow Flexion', min: -10, max: 150, axis: 'x', minLabel: 'Hyperext.', maxLabel: 'Flexion' },
      { id: 'forearm_pronsup', label: 'Pronation / Supination', min: -80, max: 80, axis: 'y', minLabel: 'Pronation', maxLabel: 'Supination', flipLeft: true },
    ],
  },
  {
    id: 'wrist',
    label: 'Wrist',
    side: 'pair',
    joints: [
      { id: 'wrist_flexext', label: 'Flexion / Extension', min: -70, max: 80, axis: 'x', minLabel: 'Extension', maxLabel: 'Flexion' },
      { id: 'wrist_deviation', label: 'Radial / Ulnar Deviation', min: -30, max: 20, axis: 'z', minLabel: 'Ulnar', maxLabel: 'Radial', flipLeft: true },
    ],
  },
  {
    id: 'hip',
    label: 'Hip',
    side: 'pair',
    joints: [
      { id: 'hip_flexext', label: 'Flexion / Extension', min: -30, max: 120, axis: 'x', minLabel: 'Extension', maxLabel: 'Flexion' },
      { id: 'hip_abadd', label: 'Abduction / Adduction', min: -30, max: 45, axis: 'z', minLabel: 'Adduction', maxLabel: 'Abduction', flipLeft: true },
      { id: 'hip_rotation', label: 'Internal / External Rotation', min: -45, max: 45, axis: 'y', minLabel: 'Internal', maxLabel: 'External', flipLeft: true },
    ],
  },
  {
    id: 'knee',
    label: 'Knee',
    side: 'pair',
    joints: [
      { id: 'knee_flex', label: 'Knee Flexion', min: -10, max: 135, axis: 'x', minLabel: 'Hyperext.', maxLabel: 'Flexion' },
    ],
  },
  {
    id: 'ankle',
    label: 'Ankle & Foot',
    side: 'pair',
    joints: [
      { id: 'ankle_flexext', label: 'Dorsi / Plantarflexion', min: -50, max: 20, axis: 'x', minLabel: 'Plantar', maxLabel: 'Dorsi' },
      { id: 'ankle_inversion', label: 'Inversion / Eversion', min: -15, max: 35, axis: 'z', minLabel: 'Eversion', maxLabel: 'Inversion', flipLeft: true },
    ],
  },
];
