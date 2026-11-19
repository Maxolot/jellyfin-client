import React, { useCallback } from 'react';

import { SettingCard, Toggle } from '../settings/controls';
import { useTonightAction, useTonightOptions } from './queries';

export default function TonightPrivacy() {
    const options = useTonightOptions();
    const { mutate, isPending, isError } = useTonightAction();
    const change = useCallback((allowTogether: boolean) => {
        mutate({ route: '/Privacy', data: { allowTogether } });
    }, [mutate]);

    return <SettingCard title='Ce soir à deux' scope='account'>
        {options.data ? <Toggle label='Autoriser les soirées à deux' checked={options.data.allowTogether} disabled={isPending}
            hint='Les autres comptes éligibles pourront choisir votre profil pour obtenir des suggestions communes. Votre historique reste privé.'
            onChange={change} /> : <p>{options.isPending ? 'Chargement…' : 'La soirée à deux est indisponible sur ce serveur.'}</p>}
        {isError && <p role='status'>Impossible d’enregistrer votre choix.</p>}
    </SettingCard>;
}
