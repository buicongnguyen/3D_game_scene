# Season Tour rendering correction

## Findings and changes

- The 0.12 m camera near plane gave approximately 4.5 cm depth steps at
  300 m with a 24-bit depth buffer. That is larger than several train/house
  trim offsets. Cinematic cameras now use 1.2 m (approximately 4.5 mm there);
  first-person and Easy Play retain 0.12 m. The reflected view copies the same
  projection. No logarithmic depth is mixed with the custom raw shaders.
- Daytime model lighting multiplied directional intensity by sun height even
  though standard materials already calculate the surface/light angle. At the
  tour's 14-degree daytime sun, direct intensity was only 0.48 and hemisphere
  fill 0.35. They now reach 2.2 and 1.25, with continuous dusk transitions and
  0.32 night fill. No emissive glow was added to train bodywork.
- Train enamel/metal had highly reflective settings but the scene has no PBR
  environment map. Runtime material copies use rougher, less metallic finishes
  while retaining baked vertex colors. Coaches share the copies; source GLBs,
  wildlife materials and geometry are not modified.
- Fine procedural stone/track grain was sampled without footprint filtering.
  It now fades to its average when smaller than a screen pixel, reducing motion
  sparkle on every quality level without another render pass.
- Desktop Medium uses 2x MSAA; High/Ultra use up to 4x. Mobile High/Ultra use
  up to 2x; lower mobile presets and desktop Ultra Low/Low keep their existing
  inexpensive path. Samples are capped by the GPU limit. Postprocessing remains.

## Regression coverage

Tests cover near-plane restoration and precision, continuous day/night light
levels, material isolation/sharing using real desktop and mobile GLBs, and
antialiasing quality/hardware limits. Browser checks are separate from these
unit tests: they cannot prove every GPU or physical phone is flicker-free.

Validation: 21 tests passed and Vite production build succeeded. Inspected the
desktop Low tour, High daytime/reflections and nighttime village, and forced
mobile Ultra Low at a 390x844 viewport with mobile GLBs. No browser errors were
reported. Ultra Low still has visibly coarse edges at its reduced resolution;
this is a performance tradeoff, not a promise of antialiased mobile output.
