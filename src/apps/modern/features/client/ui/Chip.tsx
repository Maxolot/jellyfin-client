import React, { type ButtonHTMLAttributes, type ReactNode } from 'react';

import './chips.scss';

/** Charte Médiathèque, Chip : un choix court en pastille. Choisie, elle est pleine. */
export function Chip({ pressed, className, children, ...rest }: Readonly<{ pressed: boolean; children: ReactNode } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed'>>) {
    return <button type='button' className={['client-chip', className].filter(Boolean).join(' ')} aria-pressed={pressed} {...rest}>{children}</button>;
}

/** Un groupe de pastilles, libellé pour les technologies d'assistance. */
export function ChipGroup({ label, className, children }: Readonly<{ label: string; className?: string; children: ReactNode }>) {
    return <div className={['client-chip-group', className].filter(Boolean).join(' ')} role='group' aria-label={label}>{children}</div>;
}
