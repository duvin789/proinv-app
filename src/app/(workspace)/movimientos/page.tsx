import type { Metadata } from "next";

import { MovementsView } from "@/components/movements-view";

export const metadata: Metadata = { title: "Movimientos" };

export default function MovementsPage() {
  return <MovementsView />;
}
