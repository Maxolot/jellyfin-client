/* eslint-disable react/jsx-no-bind -- Events belong to the search form. */
import React, { useRef } from 'react';

import ClientIcon from './ClientIcon';

type Props = Readonly<{
    value: string;
    onChange: (value: string) => void;
    onSubmit: (value: string) => void;
}>;

export default function SearchBar({ value, onChange, onSubmit }: Props) {
    const field = useRef<HTMLInputElement>(null);
    const clear = () => {
        onChange('');
        onSubmit('');
        field.current?.focus();
    };

    return <form className='client-search-form' role='search' onSubmit={event => {
        event.preventDefault();
        onSubmit(value.trim());
    }}>
        <span className='client-search-magnifier'><ClientIcon name='search' /></span>
        <input ref={field} type='search' aria-label='Titre d’un film ou d’une série' placeholder='Chercher un titre…'
            autoComplete='off' enterKeyHint='search' value={value} onChange={event => onChange(event.target.value)} />
        {value && <button className='client-search-clear' type='button' aria-label='Effacer la recherche' onClick={clear}><ClientIcon name='close' /></button>}
        <button className='client-search-submit' type='submit' aria-label='Rechercher'>
            <span>Rechercher</span><ClientIcon name='search' />
        </button>
    </form>;
}
/* eslint-enable react/jsx-no-bind */
