import { useOutletContext } from 'react-router-dom';
import SectionTitle from '../components/SectionTitle';
import OperationsSection from '../components/operations/OperationsSection';
import OrderStatusPanel from '../components/sales/OrderStatusPanel';
import StatusCardsPanel from '../components/sales/StatusCardsPanel';
import DeliveryStatusPanel from '../components/sales/DeliveryStatusPanel';
import QuotationAgingPanel from '../components/sales/QuotationAgingPanel';
import LateOrdersPanel from '../components/sales/LateOrdersPanel';

// Monitor dashboard: built to be read from a distance on a 16:9 screen, with no clicking needed.
// It only puts the panels on the page; the panels live in their own folders:
//   components/operations/  Production & shipping
//   components/sales/       Sales order status: Orders by Status, then the status panels below it
//                           (counts only, no money: client request 2026-10-19)
// The period ("This Month") and today's date come from the layout (they update after midnight).
export default function DashboardPage() {
  const { range } = useOutletContext();

  return (
    <div className="mx-auto max-w-[1920px] space-y-4">
      <OperationsSection />

      <SectionTitle>Sales order status</SectionTitle>
      <OrderStatusPanel range={range} />
      <StatusCardsPanel range={range} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <DeliveryStatusPanel range={range} />
        <QuotationAgingPanel />
      </div>
      <LateOrdersPanel />
    </div>
  );
}
