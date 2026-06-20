import Icon from './Icon'

/** Brand lockup used across auth + dashboard. `inverted` for dark backgrounds. */
export default function Logo({ inverted = false, size = 'md' }) {
  return (
    <div className={`logo logo--${size} ${inverted ? 'logo--inverted' : ''}`}>
      <span className="logo__mark"><Icon name="sparkle" size={size === 'sm' ? 16 : 20} strokeWidth={2} /></span>
      <span className="logo__text">
        Event<span className="logo__accent">DIY</span>
      </span>
    </div>
  )
}
