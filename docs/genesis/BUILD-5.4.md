# Genesis 5.4 — free navigation

Removed all interior destinations, their action cards and guided touring. Atlas still provides the instruments.

Spread/pinch dollies the camera closer/back; double-tap moves closer; two-finger tap moves back; two-finger drag pans; one-finger drag looks around. The exterior also accepts these gestures, wheel input and mouse double-click. Manual movement cancels automatic entry at the current camera.

The optical membrane no longer constrains the camera. Keyboard and touch flight can travel through either side of the volume. A distant ±100-coordinate guard preserves numerical precision, and View whole object recenters the camera. Motion pause continues to allow manual movement.

Validation: 333 project tests passed, zero failures/skips. Gesture and lifecycle tests exercise pinch direction, pan, pointer lifting and cancellation, tap disambiguation, interrupted entry, paused motion, repeated exit and hidden-page completion. Source/asset/import/archive checks passed. The final runtime has 35 embedded modules and 31 chunks (707,717 bytes); a fresh local EVM deployment minted and recovered its exact bytes.

The optical kernel is unchanged from 5.3. No browser or physical touchscreen certification is claimed. Privacy and v4 launchpad work requested afterward is separate ongoing work.
