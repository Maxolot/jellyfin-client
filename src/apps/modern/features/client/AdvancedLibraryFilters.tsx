/* eslint-disable react/jsx-no-bind -- Filter controls update the current URL. */
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { getFilterApi } from '@jellyfin/sdk/lib/utils/api/filter-api';
import { getStudioApi } from '@jellyfin/sdk/lib/utils/api/studio-api';
import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';

import { useApi } from 'hooks/useApi';

import ClientIcon from './ClientIcon';
import { countLibraryFilters, libraryFilterKeys, type LibraryFilters } from './libraryFilters';
import './advancedLibraryFilters.scss';

type Choice = Readonly<{ value: string; label: string }>;
type FilterKey = keyof LibraryFilters;

const ratings: Choice[] = Array.from({ length: 10 }, (_, index) => ({
    value: String(index + 1),
    label: `${index + 1} / 10 et plus`
}));
const watchedChoices: Choice[] = [{ value: 'played', label: 'Déjà vus' }, { value: 'unplayed', label: 'Non vus' }];

function useFilterChoices(view: string, enabled: boolean) {
    const { api, user } = useApi();
    const root = ['Client', api?.basePath, user?.Id, 'AdvancedFilters', view];
    const includeItemTypes = [view === 'series' ? BaseItemKind.Series : BaseItemKind.Movie];
    const ready = enabled && !!api && !!user?.Id;
    const metadata = useQuery({
        queryKey: [...root, 'Metadata'],
        enabled: ready,
        retry: false,
        staleTime: 300000,
        queryFn: async ({ signal }) => (await getFilterApi(api!).getQueryFiltersLegacy({ userId: user!.Id!, includeItemTypes }, { signal })).data
    });
    const studios = useQuery({
        queryKey: [...root, 'Studios'],
        enabled: ready,
        retry: false,
        staleTime: 300000,
        queryFn: async ({ signal }) => (await getStudioApi(api!).getStudios({
            userId: user!.Id!, includeItemTypes, enableImages: false,
            enableUserData: false, enableTotalRecordCount: false
        }, { signal })).data.Items || []
    });
    return { metadata, studios };
}

function FilterSelect({ label, value, empty, choices, unknownLabel, onChange }: Readonly<{
    label: string; value?: string | number; empty: string; choices: Choice[]; unknownLabel?: string; onChange: (value: string) => void;
}>) {
    const selected = value === undefined ? '' : String(value);
    return <label className='client-advanced-field'>
        <span>{label}</span>
        <select value={selected} onChange={event => onChange(event.target.value)}>
            <option value=''>{empty}</option>
            {selected && !choices.some(choice => choice.value === selected) && <option value={selected}>{unknownLabel || selected}</option>}
            {choices.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
        </select>
    </label>;
}

export default function AdvancedLibraryFilters({ view, filters, onChange }: Readonly<{
    view: string; filters: LibraryFilters; onChange: (changes: Record<string, string>) => void;
}>) {
    const [open, setOpen] = useState(false);
    const { metadata, studios } = useFilterChoices(view, open);
    const count = countLibraryFilters(filters);
    const assign = (key: FilterKey) => (value: string) => onChange({ [key]: value });
    const clear = () => onChange(Object.fromEntries(libraryFilterKeys.map(key => [key, ''])));
    const years = [...new Set(metadata.data?.Years || [])].sort((a, b) => b - a).map(year => ({ value: String(year), label: String(year) }));
    const tags = [...new Set(metadata.data?.Tags || [])].sort((a, b) => a.localeCompare(b, 'fr')).map(tag => ({ value: tag, label: tag }));
    const studioChoices = (studios.data || []).flatMap(entry => entry.Id && entry.Name ? [{ value: entry.Id, label: entry.Name }] : [])
        .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
    const error = metadata.isError || studios.isError;
    const loading = metadata.isFetching || studios.isFetching;
    return <details className='client-advanced-filters' onToggle={event => setOpen(event.currentTarget.open)}>
        <summary className='client-button'>
            Filtres avancés {count > 0 && <span aria-label={`${count} filtres actifs`}>{count}</span>}
            <ClientIcon name='down' />
        </summary>
        <div className='client-advanced-panel'>
            <div className='client-advanced-controls'>
                <FilterSelect label='Année' value={filters.year} empty='Toutes les années' choices={years} onChange={assign('year')} />
                <FilterSelect label='Note du public' value={filters.minRating} empty='Toutes les notes' choices={ratings} onChange={assign('minRating')} />
                <FilterSelect label='Studio' value={filters.studio} empty='Tous les studios' choices={studioChoices} unknownLabel='Studio sélectionné' onChange={assign('studio')} />
                <FilterSelect label='Tag' value={filters.tag} empty='Tous les tags' choices={tags} onChange={assign('tag')} />
                <FilterSelect label='Visionnage' value={filters.watched} empty='Tous les titres' choices={watchedChoices} onChange={assign('watched')} />
            </div>
            <div className='client-advanced-footer'>
                <p>Ces critères s’appliquent aux titres disponibles dans la bibliothèque.</p>
                {count > 0 && <button type='button' className='client-button' onClick={clear}>Effacer les filtres avancés</button>}
            </div>
            {loading && <p role='status'>Chargement des options…</p>}
            {error && <p role='status'>Certaines options ne sont pas disponibles. <button type='button' onClick={() => {
                if (metadata.isError) void metadata.refetch();
                if (studios.isError) void studios.refetch();
            }}>Réessayer</button></p>}
        </div>
    </details>;
}
/* eslint-enable react/jsx-no-bind */
