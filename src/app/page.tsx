import { PwaBoot } from "@/components/PwaBoot";
import { WeekplannerApp } from "@/components/WeekplannerApp";
import { getPinStatus } from "@/lib/auth/pin-status";

export default async function Home() {
  const initialPinStatus = await getPinStatus().catch(() => null);

  return (
    <>
      <PwaBoot />
      <WeekplannerApp initialPinStatus={initialPinStatus} />
    </>
  );
}
