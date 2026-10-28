import SectionTitle from '../SectionTitle';
import { useApi } from '../../hooks/useApi';
import CbmPanel from './CbmPanel';
import LeadTimePanel from './LeadTimePanel';
import ManufacturingPanel from './ManufacturingPanel';
import MoCbmPanel from './MoCbmPanel';
import OpenOrdersSection from './OpenOrdersSection';

// The "Production & shipping" part of the monitor dashboard (the client's main focus, 2026-10-16).
// ("Open Shipments" was removed on 2026-10-19; "Open Sales Ordered" will take its place.)
export default function OperationsSection() {
  const status = useApi('/operations/status');
  const ownCustomerOnly = status.data?.customerScope === 'own_company';

  return (
    <>
      <SectionTitle>Production &amp; shipping</SectionTitle>
      {ownCustomerOnly && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Customer filter is ON: orders, deliveries and CBM shipped include only orders whose customer is SAWO INC. itself.
          Orders for sister companies and outside customers are not counted.
        </p>
      )}
      <CbmPanel />
      <LeadTimePanel />
      <ManufacturingPanel />
      <MoCbmPanel />
      <OpenOrdersSection />
    </>
  );
}
