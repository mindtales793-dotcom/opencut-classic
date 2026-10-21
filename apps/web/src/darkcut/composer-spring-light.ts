/**
 * Lightweight analytic spring used only to sample the Composer's slide-in.
 * Keeps the Remotion runtime out of the editor's eager motion bundle.
 * The Composer Player itself continues to use Remotion.
 */
export function composerSpringProgress(frame: number, fps: number): number {
  if (frame <= 0) return 0;
  const stiffness = 120;
  const damping = 20;
  const mass = 0.85;
  const t = frame / fps;
  const omega0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  if (zeta < 1) {
    const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
    const displacement = Math.exp(-zeta * omega0 * t) *
      (Math.cos(omegaD * t) + (zeta * omega0 / omegaD) * Math.sin(omegaD * t));
    return 1 - displacement;
  }
  if (zeta === 1) return 1 - Math.exp(-omega0 * t) * (1 + omega0 * t);
  const root = Math.sqrt(zeta * zeta - 1);
  const r1 = -omega0 * (zeta - root);
  const r2 = -omega0 * (zeta + root);
  return 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1);
}
