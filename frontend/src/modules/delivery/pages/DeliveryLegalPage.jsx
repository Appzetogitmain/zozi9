import React from 'react';
import PanelLegalPage from '@shared/components/legal/PanelLegalPage';
import { deliveryApi } from '../services/deliveryApi';

// Rendered inside DeliveryLayout (see delivery routes)
const DeliveryLegalPage = ({ type }) => (
    <div className="px-4">
        <PanelLegalPage role="DELIVERY" type={type} audience="Delivery Partners" fetchPage={deliveryApi.getLegalPage} />
    </div>
);

export default DeliveryLegalPage;
