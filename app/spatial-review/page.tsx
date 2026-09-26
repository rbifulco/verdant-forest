'use client';
import {useEffect, useState} from 'react';
export default function SpatialReviewCapture() {
  const [status, setStatus] = useState('Preparing the forest for review…');
  useEffect(() => {
    const abort = new AbortController();
    let dispose: (() => void) | undefined;
    import('../forest/spatial-review').then(async ({startForestReview}) => {
      if (abort.signal.aborted) return;
      dispose = await startForestReview(abort.signal, setStatus);
      if (abort.signal.aborted) dispose();
    }).catch(error => {
      if (abort.signal.aborted) return;
      console.error('Forest review failed', error);
      setStatus('The forest could not load for review. Reload to try again.');
    });
    return () => {abort.abort(); dispose?.();};
  }, []);
  return <main className="forest" aria-label="Forest spatial review"><div className="loading" role="status">{status}</div></main>;
}
