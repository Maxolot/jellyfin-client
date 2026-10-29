/* eslint-disable react/jsx-no-bind -- Native dialog controls stay within this component. */
import React, { useId, useRef, useState } from 'react';
import ClientIcon from './ClientIcon';
import './detailDialogs.scss';

type Props = { label: string; title: string; subtitle?: string; buttonClassName?: string; children: React.ReactNode | ((close: () => void) => React.ReactNode) };

export default function ClientDialog({ label, title, subtitle, buttonClassName, children }: Readonly<Props>) {
    const dialog = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    const dialogId = useId();
    const [opened, setOpened] = useState(false);
    const [mounted, setMounted] = useState(false);
    const close = () => dialog.current?.close();
    return <><button type='button' className={buttonClassName} aria-haspopup='dialog' aria-expanded={opened} aria-controls={dialogId} onClick={() => {
        setMounted(true);
        dialog.current?.showModal();
        setOpened(true);
    }}>{label}</button>
    {/* Native dialog handles Escape and focus; this pointer handler only dismisses outside clicks. */}
    {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
    <dialog ref={dialog} id={dialogId} className='client-detail-dialog' aria-labelledby={titleId} onClose={() => setOpened(false)} onClick={event => {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.target === event.currentTarget && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) close();
    }}><header><div>{subtitle && <small>{subtitle}</small>}<h2 id={titleId}>{title}</h2></div><button type='button' aria-label='Fermer' onClick={close}><ClientIcon name='close' /></button></header>
        <div className='client-detail-dialog-body'>{mounted && (typeof children === 'function' ? children(close) : children)}</div>
    </dialog></>;
}

/* eslint-enable react/jsx-no-bind */
