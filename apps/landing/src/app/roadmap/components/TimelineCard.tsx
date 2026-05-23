import type { TimelineMilestone } from '../data/milestones';
import { ScissorIcon } from './ScissorIcon';

interface Props {
  milestone: TimelineMilestone;
  staggerIndex: number;
}

export function TimelineCard({ milestone, staggerIndex }: Props) {
  const { state, title, period, description, bulletPoints, isNow } = milestone;

  return (
    <div
      className={`rm-card rm-card--${state}`}
      style={{ animationDelay: `${staggerIndex * 60}ms` }}
    >
      <p className={`rm-card-period rm-card-period--${state}`}>{period}</p>

      <div className="rm-card-header">
        <ScissorIcon state={state} />
        <h3 className={`rm-card-title rm-card-title--${state}`}>{title}</h3>
        {isNow && <span className="rm-now-badge">Now</span>}
      </div>

      <p className={`rm-card-desc rm-card-desc--${state}`}>{description}</p>

      {bulletPoints && bulletPoints.length > 0 && (
        <ul className={`rm-card-bullets rm-card-bullets--${state}`}>
          {bulletPoints.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
