/* The single source for the CostAdvisor brand mark — every place the logo
 * appears in the app renders it through this component. Swapping the logo
 * later means replacing frontend/logo.png; nothing here needs to change
 * unless the aspect ratio changes.
 *
 * Imported (not a hardcoded "/logo.png" src) so Vite's build actually finds
 * it — a bare string path silently 404s in production because the build
 * moves the file into a hashed dist/assets/ path. The favicon link in
 * index.html gets rewritten too, but only because Vite's HTML transform
 * processes <link href>; it never rewrites plain string literals in JS. */
import logoUrl from '../../logo.png';

// Source image is 512x437 (not square) — fix height, let width follow the
// real aspect ratio so the mark never gets squashed.
const ASPECT = 512 / 437;

export default function Logo({ size = 32, style, className }) {
  return (
    <img
      src={logoUrl}
      alt="CostAdvisor"
      height={size}
      width={Math.round(size * ASPECT)}
      style={{ display: 'block', ...style }}
      className={className}
    />
  );
}
