import React, { type AnchorHTMLAttributes, type ButtonHTMLAttributes, forwardRef, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

import ClientIcon, { type ClientIconName } from '../ClientIcon';
import './actions.scss';

/** Charte Médiathèque, ActionButton : la pilule d'action, principale (lecture) ou secondaire. */
export type ActionLook = {
    /** Une seule action principale par groupe ; sur un titre, c'est la lecture. */
    variant?: 'primary' | 'secondary';
    /** 48, 40 ou 32 px. Sans taille, le groupe décide : 48 dans les actions d'un titre, 40 ailleurs. */
    size?: 'large' | 'medium' | 'small';
    /** Bouton rond sans libellé visible : il garde un aria-label. */
    round?: boolean;
    icon?: ClientIconName;
};

/** Les classes d'une action, pour un élément qui ne peut pas être un ActionButton (déclencheur de dialogue…). */
export function actionClassName({ variant = 'secondary', size, round }: ActionLook = {}, extra?: string) {
    return [variant === 'primary' ? 'client-play' : 'client-button', size && `is-${size}`, round && 'client-action-circle', extra].filter(Boolean).join(' ');
}

function content(icon: ClientIconName | undefined, children: ReactNode) {
    return <>{icon && <ClientIcon name={icon} />}{children}</>;
}

type ButtonProps = ActionLook & ButtonHTMLAttributes<HTMLButtonElement>;

export const ActionButton = forwardRef<HTMLButtonElement, ButtonProps>(function ActionButtonElement({ variant, size, round, icon, className, type = 'button', children, ...rest }, ref) {
    return <button ref={ref} type={type} className={actionClassName({ variant, size, round }, className)} {...rest}>{content(icon, children)}</button>;
});

type LinkActionProps = ActionLook & LinkProps;

/** Une action qui change de page : même pilule, lien du routeur. */
export const ActionLink = forwardRef<HTMLAnchorElement, LinkActionProps>(function ActionLinkElement({ variant, size, round, icon, className, children, ...rest }, ref) {
    return <Link ref={ref} className={actionClassName({ variant, size, round }, className)} {...rest}>{content(icon, children)}</Link>;
});

type AnchorActionProps = ActionLook & AnchorHTMLAttributes<HTMLAnchorElement>;

/** Une action vers un site extérieur. */
export const ActionAnchor = forwardRef<HTMLAnchorElement, AnchorActionProps>(function ActionAnchorElement({ variant, size, round, icon, className, children, ...rest }, ref) {
    return <a ref={ref} className={actionClassName({ variant, size, round }, className)} {...rest}>{content(icon, children)}</a>;
});
