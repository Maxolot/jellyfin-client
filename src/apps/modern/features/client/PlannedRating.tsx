import React from 'react';

import ClientIcon from './ClientIcon';

export default function PlannedRating() {
    return <div className='client-planned-rating'><span>Votre avis</span><span className='client-rating-stars' aria-label='Notation personnelle sur cinq étoiles à venir'>{[1, 2, 3, 4, 5].map(value => <ClientIcon key={value} name='star' />)}</span><small>À venir</small></div>;
}
