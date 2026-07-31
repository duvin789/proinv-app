import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { InventoryProvider } from "@/components/inventory-provider";
import { getWorkspaceData } from "@/lib/data";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  const workspace = await getWorkspaceData();

  return (
    <InventoryProvider initialWorkspace={workspace}>
      <AppShell>{children}</AppShell>
    </InventoryProvider>
  );
}
