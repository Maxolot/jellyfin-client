/* eslint-disable react/jsx-no-bind -- Small controls own their event handlers. */
import React, { type ReactNode, useEffect, useId, useRef, useState } from 'react';

import './controls.scss';

/** Where a setting lives: it tells the person whether it follows them elsewhere. */
export type SettingScope = 'browser' | 'account' | 'device' | 'server';
const SCOPES: Record<SettingScope, string> = { browser: 'Ce navigateur', account: 'Votre compte', device: 'Cet appareil', server: 'Serveur' };

export function ScopeBadge({ scope }: Readonly<{ scope: SettingScope }>) {
    return <span className={`client-scope client-scope-${scope}`}>{SCOPES[scope]}</span>;
}

type Tone = 'ok' | 'warning' | 'off' | 'error' | 'busy';
export function StatusBadge({ tone, children }: Readonly<{ tone: Tone; children: ReactNode }>) {
    return <span className={`client-status client-status-${tone}`}><i aria-hidden='true' />{children}</span>;
}

/** A titled group of settings, the building block of every page. */
export function SettingCard({ title, description, scope, aside, children }: Readonly<{ title?: string; description?: ReactNode; scope?: SettingScope; aside?: ReactNode; children: ReactNode }>) {
    return <section className='client-setting-card'>
        {(title || scope || aside) && <header>
            <div>{title && <h3>{title}</h3>}{description && <p>{description}</p>}</div>
            <div className='client-setting-card-aside'>{aside}{scope && <ScopeBadge scope={scope} />}</div>
        </header>}
        {children}
    </section>;
}

/** One line of a card: what it is on the left, how to set it on the right. */
export function SettingRow({ label, hint, htmlFor, children, stacked = false }: Readonly<{ label: ReactNode; hint?: ReactNode; htmlFor?: string; children: ReactNode; stacked?: boolean }>) {
    return <div className={`client-setting-row${stacked ? ' is-stacked' : ''}`}>
        <div className='client-setting-label'>{htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span>{label}</span>}{hint && <small>{hint}</small>}</div>
        <div className='client-setting-control'>{children}</div>
    </div>;
}

type ToggleProps = { label: string; hint?: ReactNode; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void };

/** A switch, read by assistive technologies as one. */
export function Toggle({ label, hint, checked, disabled, onChange }: Readonly<ToggleProps>) {
    const id = useId();
    return <SettingRow label={label} hint={hint} htmlFor={id}>
        <button id={id} type='button' role='switch' aria-checked={checked} disabled={disabled} className='client-switch' onClick={() => onChange(!checked)}>
            <span aria-hidden='true' />
        </button>
    </SettingRow>;
}

export type Option<T> = readonly [T, string];

/** A few choices side by side, as one radio group. */
export function Segmented<T extends string | number | boolean>({ label, hint, value, options, disabled, onChange, stacked = false }: Readonly<{ label: string; hint?: ReactNode; value: T; options: readonly Option<T>[]; disabled?: boolean; onChange: (value: T) => void; stacked?: boolean }>) {
    const group = useRef<HTMLDivElement>(null);
    const move = (event: React.KeyboardEvent, index: number) => {
        const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
        if (!step) return;
        event.preventDefault();
        const next = (index + step + options.length) % options.length;
        onChange(options[next][0]);
        group.current?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
    };
    return <SettingRow label={label} hint={hint} stacked={stacked}>
        <div ref={group} className='client-segmented' role='radiogroup' aria-label={label}>
            {options.map(([id, name], index) => {
                const selected = id === value;
                const focusable = selected || (index === 0 && !options.some(([key]) => key === value));
                return <button key={String(id)} type='button' role='radio' aria-checked={selected} tabIndex={focusable ? 0 : -1} disabled={disabled}
                    onClick={() => onChange(id)} onKeyDown={event => move(event, index)}>{name}</button>;
            })}
        </div>
    </SettingRow>;
}

/** A list of choices that opens in place: same look on every browser, keyboard included. */
export function Select<T extends string | number>({ label, hint, value, options, disabled, onChange }: Readonly<{ label: string; hint?: ReactNode; value: T; options: readonly Option<T>[]; disabled?: boolean; onChange: (value: T) => void }>) {
    const id = useId();
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const root = useRef<HTMLDivElement>(null);
    const list = useRef<HTMLUListElement>(null);
    const index = Math.max(0, options.findIndex(([key]) => key === value));
    const current = options[index]?.[1] ?? '';
    useEffect(() => {
        if (!open) return;
        setActive(index);
        const away = (event: PointerEvent) => {
            if (!root.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', away);
        return () => document.removeEventListener('pointerdown', away);
    }, [open, index]);
    useEffect(() => {
        if (open) list.current?.children[active]?.scrollIntoView?.({ block: 'nearest' });
    }, [open, active]);
    const pick = (position: number) => {
        const option = options[position];
        if (option) onChange(option[0]);
        setOpen(false);
        root.current?.querySelector<HTMLButtonElement>('button')?.focus();
    };
    const typeAhead = (letter: string) => {
        const start = open ? active : index;
        const found = [...options.keys()].map(offset => (start + 1 + offset) % options.length).find(position => options[position][1].toLowerCase().startsWith(letter.toLowerCase()));
        if (found === undefined) return;
        if (open) setActive(found);
        else onChange(options[found][0]);
    };
    const keys = (event: React.KeyboardEvent) => {
        switch (event.key) {
            case 'Escape':
                if (!open) return;
                event.stopPropagation();
                setOpen(false);
                break;
            case 'ArrowDown':
            case 'ArrowUp':
                if (open) setActive(position => Math.min(options.length - 1, Math.max(0, position + (event.key === 'ArrowDown' ? 1 : -1))));
                else setOpen(true);
                break;
            case 'Home':
            case 'End':
                if (!open) return;
                setActive(event.key === 'Home' ? 0 : options.length - 1);
                break;
            case 'Enter':
            case ' ':
                if (!open) return;
                pick(active);
                break;
            default:
                if (event.key.length === 1 && /\S/.test(event.key)) typeAhead(event.key);
                return;
        }
        event.preventDefault();
    };
    return <SettingRow label={label} hint={hint} htmlFor={id}>
        <div ref={root} className={`client-select${open ? ' is-open' : ''}`} onBlur={event => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
        }}>
            <button id={id} type='button' role='combobox' aria-haspopup='listbox' aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open ? `${id}-option-${active}` : undefined} disabled={disabled}
                onClick={() => setOpen(!open)} onKeyDown={keys}>
                <span>{current}</span><svg aria-hidden='true' viewBox='0 0 24 24'><path d='m6 9 6 6 6-6' /></svg>
            </button>
            {open && <ul ref={list} id={`${id}-list`} role='listbox' aria-label={label} aria-activedescendant={`${id}-option-${active}`} tabIndex={-1}>
                {options.map(([key, name], position) => <li key={String(key)} id={`${id}-option-${position}`} role='option' aria-selected={key === value}
                    className={position === active ? 'is-active' : undefined} onPointerEnter={() => setActive(position)} onClick={() => pick(position)} onKeyDown={keys}>{name}</li>)}
            </ul>}
        </div>
    </SettingRow>;
}

/** A slider with its value written next to it. */
export function Slider({ label, hint, value, min, max, step = 1, unit = '', disabled, onChange }: Readonly<{ label: string; hint?: ReactNode; value: number; min: number; max: number; step?: number; unit?: string; disabled?: boolean; onChange: (value: number) => void }>) {
    const id = useId();
    const percent = ((value - min) / Math.max(1, max - min)) * 100;
    return <SettingRow label={label} hint={hint} htmlFor={id}>
        <div className='client-slider'>
            <input id={id} type='range' min={min} max={max} step={step} value={value} disabled={disabled} style={{ '--fill': `${percent}%` } as React.CSSProperties}
                onChange={event => onChange(Number(event.target.value))} />
            <output htmlFor={id}>{value}{unit}</output>
        </div>
    </SettingRow>;
}

type FieldProps = { label: string; hint?: ReactNode; value: string; type?: 'text' | 'url' | 'password' | 'number'; placeholder?: string; autoComplete?: string;
    inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']; maxLength?: number; disabled?: boolean; onChange: (value: string) => void };

export function TextField({ label, hint, value, type = 'text', placeholder, autoComplete = 'off', inputMode, maxLength, disabled, onChange }: Readonly<FieldProps>) {
    const id = useId();
    return <SettingRow label={label} hint={hint} htmlFor={id} stacked>
        <input id={id} className='client-field' type={type} inputMode={inputMode ?? (type === 'url' ? 'url' : undefined)} placeholder={placeholder} autoComplete={autoComplete}
            maxLength={maxLength} value={value} disabled={disabled} spellCheck={false} onChange={event => onChange(event.target.value)} />
    </SettingRow>;
}

type Picture<T> = { value: T; label: string; preview?: ReactNode };

/** Larger choices with a drawing of the result, as one radio group. */
export function PictureChoice<T extends string | boolean>({ label, hint, value, options, onChange }: Readonly<{ label: string; hint?: ReactNode; value: T; options: readonly Picture<T>[]; onChange: (value: T) => void }>) {
    const group = useRef<HTMLDivElement>(null);
    const move = (event: React.KeyboardEvent, index: number) => {
        const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
        if (!step) return;
        event.preventDefault();
        const next = (index + step + options.length) % options.length;
        onChange(options[next].value);
        group.current?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
    };
    return <div className='client-picture-choice'>
        <div className='client-setting-label'><span>{label}</span>{hint && <small>{hint}</small>}</div>
        <div ref={group} role='radiogroup' aria-label={label} style={{ '--choices': options.length } as React.CSSProperties}>
            {options.map((option, index) => {
                const selected = option.value === value;
                return <button key={String(option.value)} type='button' role='radio' aria-checked={selected} tabIndex={selected ? 0 : -1}
                    onClick={() => onChange(option.value)} onKeyDown={event => move(event, index)}>
                    {option.preview}<span>{option.label}</span>
                </button>;
            })}
        </div>
    </div>;
}

/** A folded group of rarely needed settings. */
export function Collapsible({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
    const id = useId();
    const [open, setOpen] = useState(false);
    return <div className={`client-collapsible${open ? ' is-open' : ''}`}>
        <button type='button' aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
            <span>{title}</span><svg aria-hidden='true' viewBox='0 0 24 24'><path d='m6 9 6 6 6-6' /></svg>
        </button>
        <div id={id} hidden={!open}>{children}</div>
    </div>;
}

/** Text written in the same place after an action: saved, failed, in progress. */
export function SaveNote({ state, error = 'Le changement n’a pas été enregistré. Réessayez.' }: Readonly<{ state: { isPending: boolean; isError: boolean; isSuccess: boolean }; error?: string }>) {
    let text = '';
    if (state.isPending) text = 'Enregistrement…';
    else if (state.isError) text = error;
    else if (state.isSuccess) text = 'Enregistré';
    return <p className={`client-save-note${state.isError ? ' is-error' : ''}`} role='status'>{text}</p>;
}
/* eslint-enable react/jsx-no-bind */
