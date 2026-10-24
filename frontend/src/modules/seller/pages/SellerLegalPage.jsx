import React from 'react';
import PanelLegalPage from '@shared/components/legal/PanelLegalPage';
import { sellerApi } from '../services/sellerApi';

// Rendered inside the seller DashboardLayout (see seller routes)
const SellerLegalPage = ({ type }) => (
    <PanelLegalPage role="SELLER" type={type} audience="Seller Partners" fetchPage={sellerApi.getLegalPage} />
);

export default SellerLegalPage;
