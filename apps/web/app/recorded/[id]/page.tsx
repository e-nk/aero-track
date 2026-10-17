import { Suspense } from "react";
import { RecordedView } from "../../../components/recorded/RecordedView";

export const metadata = { title: "Recorded flight · AeroTrack" };

// Await params inside <Suspense> so Next can prerender a static shell (Cache Components).
export default function RecordedFlightPage({ params }: PageProps<"/recorded/[id]">) {
  return (
    <Suspense fallback={<main className="h-dvh bg-navy" />}>
      <Recorded params={params} />
    </Suspense>
  );
}

async function Recorded({ params }: { params: PageProps<"/recorded/[id]">["params"] }) {
  const { id } = await params;
  return <RecordedView id={id} />;
}
