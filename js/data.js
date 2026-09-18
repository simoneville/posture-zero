// Anthropometric and joint-range-of-motion reference data.
//
// Segment length ratios are mostly the classic "percent of stature" set
// popularized by Drillis & Contini (1966) and reproduced in Winter,
// "Biomechanics and Motor Control of Human Movement" — a standard,
// generalized-adult reference used when no individual measurements are
// available. A few measurements below (marked in their own comments) aren't
// part of that set and are typical-adult approximations instead. All of it
// is an average, not a diagnosis of any one body — see MEASUREMENT_GROUPS
// below for how to override any of it with an individual's own numbers.
//
// Joint ranges use the orthopedic "neutral-zero method" (AAOS / Norkin & White,
// "Measurement of Joint Motion"): each joint's neutral anatomical position is
// defined as 0°, and motion in each plane is recorded as two numbers either
// side of that zero (e.g. "Flexion 150° – 0 – Extension 10°"). That is exactly
// the shape used here: every slider's minimum is one extreme of a plane of
// motion, its maximum is the opposite extreme, and 0 is always neutral.
// Where a combined joint (e.g. the whole cervical spine) is split into
// several segments (C1-3 vs C4-7), the segmental split of its total range is
// an approximation based on well-documented segmental biomechanics (e.g. the
// atlantoaxial joint contributing roughly half of all cervical rotation),
// not a specific per-segment cadaveric study.

export const ANTHRO_RATIOS = {
  // ---- Head & neck (cervical spine split into two clinical groups) ----
  headHeight: 0.130,
  headBreadth: 0.130,
  // Cervical spine (C1-C7) length, split by vertebra count: C1-3 (occiput/
  // atlas/axis, "head on neck") vs C4-7 ("cervical"). Not individually
  // weighted by vertebral height — treated as roughly equal.
  headOnNeckLength: 0.0223,
  cervicalLength: 0.0297,

  // ---- Spine (thoracic + lumbar) and pelvis ----
  // The old single "trunk" length (0.288H, Drillis & Contini), split by
  // vertebra count weighted toward taller lumbar vertebrae: upper thoracic
  // (T1-4), mid thoracic (T5-12), lumbar (L1-5). The pelvis (includes the
  // sacrum) keeps its own share.
  upperThoracicLength: 0.0366,
  midThoracicLength: 0.0863,
  lumbarLength: 0.0728,
  pelvisLength: 0.0922,

  // ---- Torso width/depth ----
  // Shoulder and hip *breadth* are the torso's outer surface width — how
  // wide the box/loft is drawn. They are wider than the corresponding joint
  // centers below.
  shoulderWidth: 0.259,
  chestDepth: 0.115,
  hipWidth: 0.191,
  pelvisDepth: 0.105,
  // The natural waist is narrower than both the shoulders and the hips —
  // not part of the classic Drillis & Contini set, but a typical adult
  // proportion used to give the torso a tapered silhouette instead of a
  // uniform block.
  waistWidth: 0.174,
  waistDepth: 0.098,

  // ---- Joint centers (distinct from the torso surface above) ----
  // The shoulder (glenohumeral) and hip joint centers sit inboard of the
  // torso's outer surface, not on its edge. Biacromial breadth (shoulder
  // joint-to-joint) is a standard measurement, typically ~85-90% of
  // bideltoid (shoulder surface) breadth — used here at 0.88. Hip joint
  // centers (femoral heads) sit well inside the pelvis; clinical gait
  // analysis estimates this from regression equations (e.g. Bell/Davis),
  // which need an ASIS breadth and leg length this tool doesn't collect —
  // 0.60 of hip surface breadth is a simplified visual approximation, not a
  // clinical regression result.
  shoulderJointWidth: 0.259 * 0.88,
  hipJointWidth: 0.191 * 0.60,

  // ---- Limbs ----
  upperArmLength: 0.186,
  forearmLength: 0.146,
  handLength: 0.108,
  thighLength: 0.245,
  shankLength: 0.246,
  footHeight: 0.039,
  footLength: 0.152,
  footBreadth: 0.055,

  // ---- Joint breadths ----
  // Bony breadth across the elbow, wrist, knee and ankle — standard
  // ergonomic/anthropometric measurements (e.g. the kind tabulated for
  // glove, brace or PPE sizing), used here to size each joint and to anchor
  // where a tapered limb segment's thickness should land at each end.
  // Generalized adult figures; not a specific published table.
  elbowBreadth: 0.038,
  wristBreadth: 0.032,
  kneeBreadth: 0.056,
  ankleBreadth: 0.041,
};

// Multiplicative adjustments applied to a subset of ANTHRO_RATIOS keys,
// reflecting typical, well-documented average differences between adult
// male and female body proportions (relatively wider shoulders and narrower
// hips/waist for male; the reverse for female, plus smaller joint breadths).
// These are generalized tendencies with wide individual variation — not a
// rule for any one person — which is exactly why every value they touch is
// also editable in the Detailed Body Measurements panel.
export const SEX_ADJUSTMENTS = {
  male: {
    shoulderWidth: 1.04,
    shoulderJointWidth: 1.04,
    chestDepth: 1.03,
    hipWidth: 0.97,
    waistWidth: 1.02,
    elbowBreadth: 1.06,
    wristBreadth: 1.08,
    kneeBreadth: 1.05,
    ankleBreadth: 1.05,
  },
  female: {
    shoulderWidth: 0.95,
    shoulderJointWidth: 0.95,
    chestDepth: 0.96,
    hipWidth: 1.04,
    waistWidth: 0.97,
    elbowBreadth: 0.92,
    wristBreadth: 0.88,
    kneeBreadth: 0.93,
    ankleBreadth: 0.93,
  },
};

export function getAnthroRatios(sex) {
  const adjustments = sex && SEX_ADJUSTMENTS[sex];
  if (!adjustments) return { ...ANTHRO_RATIOS };
  const out = { ...ANTHRO_RATIOS };
  for (const [key, multiplier] of Object.entries(adjustments)) out[key] *= multiplier;
  return out;
}

// Every ratio in ANTHRO_RATIOS scaled by a height (in meters), producing the
// default set of absolute segment lengths (in meters) buildFigure() expects.
// The Detailed Body Measurements panel overrides individual entries of this
// on top, independent of height.
export function computeDefaultLengths(heightMeters, sex) {
  const ratios = getAnthroRatios(sex);
  const lengths = {};
  for (const [key, ratio] of Object.entries(ratios)) lengths[key] = ratio * heightMeters;
  return lengths;
}

// Describes the same lengths for the optional detailed-measurement UI,
// grouped for display. `key` matches computeDefaultLengths()'s output.
export const MEASUREMENT_GROUPS = [
  {
    id: 'head_neck',
    label: 'Head & Neck',
    fields: [
      { key: 'headHeight', label: 'Head height' },
      { key: 'headBreadth', label: 'Head breadth' },
      { key: 'headOnNeckLength', label: 'Upper neck (C1-3)' },
      { key: 'cervicalLength', label: 'Lower neck (C4-7)' },
    ],
  },
  {
    id: 'spine_pelvis',
    label: 'Spine & Pelvis',
    fields: [
      { key: 'upperThoracicLength', label: 'Upper thoracic (T1-4)' },
      { key: 'midThoracicLength', label: 'Mid thoracic (T5-12)' },
      { key: 'lumbarLength', label: 'Lumbar (L1-5)' },
      { key: 'pelvisLength', label: 'Pelvis height (incl. sacrum)' },
      { key: 'hipWidth', label: 'Hip breadth (surface)' },
      { key: 'hipJointWidth', label: 'Hip joint-center width' },
      { key: 'waistWidth', label: 'Waist width' },
      { key: 'waistDepth', label: 'Waist depth' },
      { key: 'pelvisDepth', label: 'Pelvis depth' },
    ],
  },
  {
    id: 'torso_shoulders',
    label: 'Torso & Shoulders',
    fields: [
      { key: 'shoulderWidth', label: 'Shoulder breadth (surface)' },
      { key: 'shoulderJointWidth', label: 'Shoulder joint-center width' },
      { key: 'chestDepth', label: 'Chest depth' },
    ],
  },
  {
    id: 'arms',
    label: 'Arms',
    fields: [
      { key: 'upperArmLength', label: 'Upper arm length' },
      { key: 'forearmLength', label: 'Forearm length' },
      { key: 'handLength', label: 'Hand length' },
      { key: 'elbowBreadth', label: 'Elbow breadth' },
      { key: 'wristBreadth', label: 'Wrist breadth' },
    ],
  },
  {
    id: 'legs_feet',
    label: 'Legs & Feet',
    fields: [
      { key: 'thighLength', label: 'Thigh length' },
      { key: 'shankLength', label: 'Shank length' },
      { key: 'kneeBreadth', label: 'Knee breadth' },
      { key: 'ankleBreadth', label: 'Ankle breadth' },
      { key: 'footHeight', label: 'Foot height' },
      { key: 'footLength', label: 'Foot length' },
      { key: 'footBreadth', label: 'Foot breadth' },
    ],
  },
];

// side: null (unpaired/axial), or 'pair' (instantiated once per L/R side)
// axis: local rotation axis on the joint pivot ('x' = flex/ext, 'z' = ab/adduction
//       or lateral flexion, 'y' = internal/external rotation or axial rotation)
// flipLeft: whether the sign of the slider value is negated on the left side so
//       that, e.g., positive "abduction" always moves the limb away from midline
//       on both sides.
export const JOINT_GROUPS = [
  {
    id: 'pelvis',
    label: 'Pelvis (incl. sacrum)',
    side: null,
    joints: [
      { id: 'pelvis_tilt', label: 'Anterior / Posterior Tilt', min: -30, max: 30, axis: 'x', minLabel: 'Posterior', maxLabel: 'Anterior' },
      { id: 'pelvis_obliquity', label: 'Obliquity', min: -20, max: 20, axis: 'z', minLabel: 'Right Up', maxLabel: 'Left Up' },
      { id: 'pelvis_rotation', label: 'Rotation', min: -30, max: 30, axis: 'y', minLabel: 'Left Forward', maxLabel: 'Right Forward' },
    ],
  },
  {
    id: 'lumbar',
    label: 'Lumbar (L1-L5)',
    side: null,
    joints: [
      { id: 'lumbar_flexext', label: 'Flexion / Extension', min: -15, max: 40, axis: 'x', minLabel: 'Extension', maxLabel: 'Flexion' },
      { id: 'lumbar_latflex', label: 'Lateral Flexion', min: -10, max: 10, axis: 'z', minLabel: 'Left', maxLabel: 'Right' },
      { id: 'lumbar_rotation', label: 'Rotation', min: -8, max: 8, axis: 'y', minLabel: 'Left Forward', maxLabel: 'Right Forward' },
    ],
  },
  {
    id: 'mid_thoracic',
    label: 'Mid Thoracic (T5-T12)',
    side: null,
    joints: [
      { id: 'mthoracic_flexext', label: 'Flexion / Extension', min: -10, max: 25, axis: 'x', minLabel: 'Extension', maxLabel: 'Flexion' },
      { id: 'mthoracic_latflex', label: 'Lateral Flexion', min: -15, max: 15, axis: 'z', minLabel: 'Left', maxLabel: 'Right' },
      { id: 'mthoracic_rotation', label: 'Rotation', min: -15, max: 15, axis: 'y', minLabel: 'Left Forward', maxLabel: 'Right Forward' },
    ],
  },
  {
    id: 'upper_thoracic',
    label: 'Upper Thoracic (T1-T4)',
    side: null,
    joints: [
      { id: 'uthoracic_flexext', label: 'Flexion / Extension', min: -5, max: 15, axis: 'x', minLabel: 'Extension', maxLabel: 'Flexion' },
      { id: 'uthoracic_latflex', label: 'Lateral Flexion', min: -10, max: 10, axis: 'z', minLabel: 'Left', maxLabel: 'Right' },
      { id: 'uthoracic_rotation', label: 'Rotation', min: -20, max: 20, axis: 'y', minLabel: 'Left Forward', maxLabel: 'Right Forward' },
    ],
  },
  {
    id: 'cervical',
    label: 'Cervical (C4-C7)',
    side: null,
    joints: [
      { id: 'cerv_flexext', label: 'Flexion / Extension', min: -45, max: 38, axis: 'x', minLabel: 'Extension', maxLabel: 'Flexion' },
      { id: 'cerv_latflex', label: 'Lateral Flexion', min: -35, max: 35, axis: 'z', minLabel: 'Left', maxLabel: 'Right' },
      { id: 'cerv_rotation', label: 'Rotation', min: -38, max: 38, axis: 'y', minLabel: 'Right', maxLabel: 'Left' },
    ],
  },
  {
    id: 'head_on_neck',
    label: 'Head on Neck (C1-C3)',
    side: null,
    joints: [
      { id: 'headneck_flexext', label: 'Flexion / Extension', min: -15, max: 12, axis: 'x', minLabel: 'Extension', maxLabel: 'Flexion' },
      { id: 'headneck_latflex', label: 'Lateral Flexion', min: -10, max: 10, axis: 'z', minLabel: 'Left', maxLabel: 'Right' },
      { id: 'headneck_rotation', label: 'Rotation', min: -42, max: 42, axis: 'y', minLabel: 'Right', maxLabel: 'Left' },
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
      { id: 'forearm_pronsup', label: 'Pronation / Supination', min: -180, max: 0, axis: 'y', minLabel: 'Pronation', maxLabel: 'Supination', flipLeft: true },
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
