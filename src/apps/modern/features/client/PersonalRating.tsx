/* eslint-disable react/jsx-no-bind -- Rating controls are local to their media surface. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import React, { useRef, useState } from 'react';

import { useApi } from 'hooks/useApi';

import ClientIcon from './ClientIcon';
import { personalStars, ratedItems, savePersonalStars } from './ratings';
import { clientRequest } from './session';

function RatingControl({ item }: { readonly item: BaseItemDto }) {
    const { api, user } = useApi();
    const cache = useQueryClient();
    const [hovered, setHovered] = useState<number>();
    const [focused, setFocused] = useState<number>();
    const saving = useRef(false);
    const stars = personalStars(item);
    const preview = hovered ?? focused ?? stars ?? 0;
    const scope = ['Client', api?.basePath, user?.Id];
    const mutation = useMutation({
        mutationFn: (value: number | null) => clientRequest(() => savePersonalStars(api!, user!.Id!, item.Id!, value)),
        retry: false,
        onSuccess: data => {
            const withScore = (target: BaseItemDto) => ({ ...target, UserData: { ...target.UserData,
                Key: target.UserData?.Key || data.Key, Rating: data.Rating ?? null,
                ...(data.Likes === undefined ? {} : { Likes: data.Likes }) } });
            const detailKey = [...scope, 'Detail', item.Id];
            cache.setQueryData<BaseItemDto>(detailKey, previous => previous ? withScore(previous) : previous);
            const updated = cache.getQueryData<BaseItemDto>(detailKey) || withScore(item);
            cache.setQueryData<BaseItemDto[]>([...scope, 'Rated'], previous => previous ? ratedItems([
                ...previous.filter(entry => entry.Id !== item.Id),
                ...(personalStars(updated) === null ? [] : [updated])
            ]) : previous);
            void cache.invalidateQueries({ queryKey: [...scope, 'Rated'] });
        }
    });
    async function save(value: number | null) {
        if (saving.current) return;
        saving.current = true;
        try {
            await mutation.mutateAsync(value);
        } catch { /* The inline message preserves the last server-confirmed score. */ } finally { saving.current = false; }
    }
    return <div className='client-personal-rating'>
        <div className='client-rating-control'><span>Votre avis</span>
            <div className='client-rating-stars' role='group' aria-label='Votre note sur cinq étoiles' onPointerLeave={() => setHovered(undefined)} onBlur={event => {
                if (!event.currentTarget.contains(event.relatedTarget)) setFocused(undefined);
            }}>{[1, 2, 3, 4, 5].map(value => <button key={value} className='client-rating-star' aria-label={`Noter ${value} sur 5`} aria-pressed={stars === value} disabled={mutation.isPending} onPointerEnter={event => {
                    if (event.pointerType !== 'touch') setHovered(value);
                }} onFocus={() => setFocused(value)} onClick={() => { void save(value); }}>
                    <ClientIcon name='star' /><span className='client-rating-fill' style={{ clipPath: `inset(0 ${100 - Math.max(0, Math.min(1, preview - value + 1)) * 100}% 0 0)` }}><ClientIcon name='star' /></span>
                </button>)}</div>
            <span className='client-rating-value' aria-live='polite'>{stars === null ? 'Non noté' : `${stars.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}/5`}</span>
            {stars !== null && <button className='client-rating-clear' disabled={mutation.isPending} onClick={() => { void save(null); }}>Effacer ma note</button>}
        </div>
        {mutation.isPending && <small role='status'>Enregistrement…</small>}
        {mutation.isError && <small role='alert'>Impossible d’enregistrer votre note. Réessayez.</small>}
    </div>;
}

export default function PersonalRating({ item }: { readonly item: BaseItemDto }) {
    const { api, user } = useApi();
    if (!api || !user?.Id || !item.Id || !['Movie', 'Series'].includes(item.Type || '')) return null;
    return <RatingControl key={`${api.basePath}/${user.Id}/${item.Id}`} item={item} />;
}
/* eslint-enable react/jsx-no-bind */
