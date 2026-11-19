import { useState } from 'react';

import { readTrackChoice, saveTrackChoice, type TrackChoice } from './trackChoice';

export function useTitleTrackChoice(basePath: string | undefined, userId: string | undefined, itemId: string | null | undefined) {
    const key = JSON.stringify([basePath, userId, itemId]);
    const [selection, setSelection] = useState<{ key: string; choice: TrackChoice }>(() => ({ key, choice: readTrackChoice(basePath, userId, itemId) }));
    const choice = selection.key === key ? selection.choice : readTrackChoice(basePath, userId, itemId);
    function chooseTracks(next: TrackChoice) {
        setSelection({ key, choice: next });
        if (itemId) saveTrackChoice(basePath, userId, itemId, next);
    }
    return { choice, chooseTracks };
}
