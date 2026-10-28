import logoUrl from '../assets/sawo-logo.png';

// The SAWO Finland logo (400 x 255 px image with its own white background and black frame).
// Pass a number for a fixed height, or height={null} plus a className (e.g. "h-10 xl:h-14") for a responsive one.
export default function Logo({ height = 48, className = '' }) {
  return (
    <img
      src={logoUrl}
      alt="SAWO Finland"
      height={height ?? undefined}
      style={height == null ? { width: 'auto' } : { height, width: 'auto' }}
      className={`rounded-sm ${className}`}
    />
  );
}
