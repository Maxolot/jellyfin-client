import React, { type ReactNode } from 'react';

import ClientIcon, { type ClientIconName } from './ClientIcon';
import './actionLabel.scss';

export default function ActionLabel({ icon, children, hint }: Readonly<{ icon: ClientIconName; children: ReactNode; hint?: string }>) {
    return <span className='client-menu-label'><ClientIcon name={icon} /><span className='client-more-text'>{children}{hint && <span className='client-menu-hint'>{hint}</span>}</span></span>;
}
