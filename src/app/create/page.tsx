import CreationSelection from "@/components/creation-selection";
export default async function CreatePage({ searchParams }: { searchParams: Promise<{ run?: string; product?: string }> }) {
  const params = await searchParams;
  return <CreationSelection runId={params.run} product={params.product} />;
}
