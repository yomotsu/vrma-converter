# Unity Humanoid `.anim` Import Design

## Goal

Enable the VRMA Converter to import Unity Humanoid animation clips serialized as text `.anim` files and convert their normalized Humanoid motion into the existing `LoadedClip` / VRMA export pipeline.

The first supported target is the provided `LEMON MELON COOKIE.anim` fixture and other Unity Humanoid clips with the same native muscle-curve representation. Generic, legacy, multi-object, and arbitrary Transform-path `.anim` files are explicitly outside this feature.

## Context and constraints

- The application is a browser-only Vite/TypeScript app. Animation conversion must remain client-side.
- Existing importers return `LoadedClip[]`, which is then used for preview, timeline display, optional baking, and VRMA export.
- The reference file is Unity YAML text, not a binary asset. It stores the Humanoid pose in `m_FloatCurves`, including named muscle curves and Unity’s `RootQ` / `RootT` curves.
- The reference file declares `m_SampleRate: 30` and `m_AnimationClipSettings.m_StopTime: 14`.
- Unity also serializes a duplicate set of curves under `m_EditorCurves`. The importer must read `m_FloatCurves` and ignore the editor copy.
- Unity Humanoid hand/foot IK goal curves require Avatar-specific proportions and a runtime IK pass. The first implementation will not attempt to reproduce that solver.
- Conversion accuracy is judged by preserved timing, root motion, major humanoid pose, and successful VRMA export. Byte-for-byte parity with Unity or the paired FBX/VRMA is not required.

## Design

### Import pipeline

`parseAnimationFile` will recognize the `anim` extension and dispatch the file’s UTF-8/ASCII text to a dedicated parser. The parser will:

1. Validate the Unity YAML header and locate one `AnimationClip` document.
2. Read the clip name, sample rate, start time, and stop time.
3. Parse only the `m_FloatCurves` section. Each curve consists of a named `attribute`, an optional `path`, and `m_Curve` keyframes containing `time` and `value`.
4. Preserve every curve’s source key times and values. Curve tangents are not required by the normalized output pipeline; output tracks use the existing linear `THREE` keyframe track behavior.
5. Convert the named Humanoid curves into motion tracks.
6. Return one `LoadedClip` with the clip metadata and compatibility determined by whether at least one supported humanoid motion track was produced.

The parser will use a bounded, line-oriented state machine rather than a general YAML dependency. Unity’s file structure is regular, the fixture is approximately 21 MB, and parsing only the required scalar fields avoids adding a browser dependency or constructing a large generic YAML object graph.

### Humanoid curve conversion

The converter will maintain an explicit mapping table for Unity’s stable Humanoid muscle names. The table will cover:

- Spine, chest, upper chest, neck, and head rotation degrees of freedom.
- Jaw and eye rotation degrees of freedom when target bones exist.
- Shoulder, upper arm, lower arm, and hand rotation degrees of freedom.
- Upper leg, lower leg, foot, and toes rotation degrees of freedom.
- Finger `Stretched` and `Spread` values for the supported Unity finger names.

For each output sample time, the converter will evaluate the available scalar curves at that exact source time, convert the normalized muscle values into canonical T-pose-relative rotations, normalize the resulting quaternions, and write one quaternion track per supported VRM humanoid bone. Missing muscle axes are treated as zero. Output bone names use the existing `BoneName` union and are filtered against `targetVrm` when one is available.

`RootQ.x/y/z/w` will be combined into the `hips` rotation track. `RootT.x/y/z` will become the `hips` translation track in Unity normalized humanoid space. The existing VRMA exporter will apply its normal hips scale conversion using `restHipsY: 1`, because a standalone `.anim` does not contain the source Avatar’s physical hips height.

The importer will recognize Unity’s duplicate `m_EditorCurves` by section boundary and will never append those curves a second time. Direct IK goal curves (`LeftFootQ/T`, `RightFootQ/T`, `LeftHandQ/T`, and `RightHandQ/T`) will be parsed as known Unity data but ignored for motion output in this version. This prevents treating body-relative IK goals as local bone transforms, which would produce incorrect poses.

### Integration with existing UI

- Add `anim` to `SUPPORTED_ANIMATION_FORMATS` and update the unsupported-format message.
- Add `.anim` to the animation file input `accept` attribute and the format badges/drop-zone copy.
- Display `ANIM` as the source format in the animation queue.
- Keep the existing preview, timeline, speed, bake, restore, and VRMA download behavior unchanged.
- Use the existing asynchronous `handleAnimationFile` request token so a slow `.anim` parse cannot replace a newer import.
- Surface parser errors through the existing toast mechanism.

## Error handling

The importer will reject the file with a user-facing error when:

- The text is not a Unity `AnimationClip` document.
- No `m_FloatCurves` section or supported named Humanoid curves are present.
- The sample rate, time values, or curve values contain no finite numeric data.
- No compatible motion track is produced after optional target-bone filtering.

Malformed individual curves will be skipped when other valid supported curves remain. If all supported curves are malformed or absent, the import fails with the existing generic conversion error path.

## Testing strategy

Tests will be written before production implementation and will cover:

1. Format dispatch: `anim` is supported case-insensitively and existing format expectations remain unchanged.
2. Header and metadata parsing: clip name, sample rate, duration, and source FPS are read from a minimal fixture.
3. Curve parsing: named scalar curves produce finite keyframe times and values; duplicate editor curves are not doubled.
4. Root conversion: `RootQ` produces a hips rotation track and `RootT` produces a hips translation track with matching times.
5. Muscle conversion: representative spine, arm, leg, and finger curves produce the expected mapped tracks and normalized quaternions.
6. Failure behavior: generic/no-curve/malformed inputs reject with a useful error.
7. Reference fixture: the supplied `LEMON MELON COOKIE.anim` imports as one 14-second, 30fps compatible clip with non-empty hips and major-body tracks.
8. Regression: the complete existing test suite and TypeScript/Vite build pass.

The paired `.fbx` and `.vrma` files may be used for manual visual comparison of the reference motion, but they are not required as runtime inputs and will not be bundled into the application.

## Non-goals

- Parsing arbitrary Generic or Legacy Unity `.anim` files.
- Reconstructing Unity’s Avatar-specific pre/post rotations, custom muscle limits, center-of-mass solver, or hand/foot IK solver.
- Importing animation events, PPtr curves, material curves, blend-shape curves, or arbitrary custom properties.
- Adding a server-side conversion service or a Unity runtime dependency.

## Acceptance criteria

- Dropping the supplied `.anim` file into Motion Source adds a compatible `ANIM` clip to the queue.
- The clip reports approximately `14.00 SEC`, source FPS `30`, and a non-zero keyframe count.
- The preview shows recognizable major-body motion without duplicating curves or applying IK goal quaternions as local bone rotations.
- The clip can be speed-adjusted, baked, restored, and downloaded as `.vrma` using the existing controls.
- Existing VRMA, GLB/GLTF, FBX, BVH, and VMD workflows continue to pass their current tests.
- Unsupported Generic/Legacy `.anim` input fails clearly instead of silently producing an empty VRMA.
