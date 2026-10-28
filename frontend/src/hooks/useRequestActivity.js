import { useSyncExternalStore } from 'react';
import { requestActivity } from '../services/api';

// True while at least one backend request is in progress.
export function useRequestActivity() {
  return useSyncExternalStore(requestActivity.subscribe, requestActivity.getSnapshot) > 0;
}
