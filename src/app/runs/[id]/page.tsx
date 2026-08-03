import { RunContent } from "./RunContent";

export default async function Run({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RunContent activityId={id} />;
}
