import { redirect } from "next/navigation";
import { HomePage } from "@/components/resource-pages";
export default async function Page({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const { run } = await searchParams;
  if (run) redirect(`/create?run=${encodeURIComponent(run)}`);
  return <HomePage />;
}
