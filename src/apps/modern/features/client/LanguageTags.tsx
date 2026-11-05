import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React from 'react';

import { useLocalLanguages, type FileLanguage } from './languageTags';

const TAGS: Record<FileLanguage, { text: string; title: string }> = {
    multi: { text: 'MULTI', title: 'Plusieurs langues audio dont le français' },
    vf: { text: 'VF', title: 'Piste audio française' },
    vo: { text: 'VO', title: 'Version originale uniquement' },
    vostfr: { text: 'VOSTFR', title: 'Version originale avec sous-titres français' }
};

/** Languages the files of a film or series in the library actually offer. */
export default function LanguageTags({ item }: Readonly<{ item: BaseItemDto }>) {
    const languages = useLocalLanguages(item);
    if (!languages.length) return null;
    return <span className='client-source-badge is-found is-button client-button client-availability-action' role='status' aria-label='Langues disponibles dans votre bibliothèque'>
        <span>Dans votre bibliothèque</span>{languages.map(tag => <b key={tag} className={`client-source-lang is-${tag}`} title={TAGS[tag].title}>{TAGS[tag].text}</b>)}
    </span>;
}
