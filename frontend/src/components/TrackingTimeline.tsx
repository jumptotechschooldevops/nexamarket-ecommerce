import type { TrackingEvent } from '../types';

export function TrackingTimeline({ timeline }: { timeline: TrackingEvent[] }) {
  return (
    <div className="tracking-timeline">
      {timeline.map((step) => (
        <div key={step.status} className={`tracking-step ${step.completed ? 'completed' : ''}`}>
          <span className="dot">{step.completed ? '✓' : ''}</span>
          {step.label}
        </div>
      ))}
    </div>
  );
}
