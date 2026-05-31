import { useEffect, useState } from 'react';
import { differenceInSeconds, formatDistanceToNow } from 'date-fns';

interface CountdownProps {
  deadline: Date | string;
  className?: string;
}

export function Countdown({ deadline, className }: CountdownProps) {
  const [secsLeft, setSecsLeft] = useState(() =>
    differenceInSeconds(new Date(deadline), new Date())
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setSecsLeft(differenceInSeconds(new Date(deadline), new Date()));
    }, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  if (secsLeft <= 0) {
    return <span className={`countdown expired ${className ?? ''}`}>Deadline passed</span>;
  }

  const urgencyClass = secsLeft < 3600 ? 'urgent' : secsLeft < 86400 ? 'warning' : 'ok';

  return (
    <span className={`countdown ${urgencyClass} ${className ?? ''}`}>
      {secsLeft < 3600
        ? `${Math.floor(secsLeft / 60)}m ${secsLeft % 60}s`
        : formatDistanceToNow(new Date(deadline), { addSuffix: true })}
    </span>
  );
}
