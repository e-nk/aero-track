import { LiveView } from "../components/LiveView";
import { RecordingList } from "../components/recorded/RecordingList";
import { OFFLINE } from "../lib/config";

// Offline demo mode has no live data, so the home page is the list of recorded flights (SPEC 13).
export default function Home() {
  return OFFLINE ? <RecordingList /> : <LiveView />;
}
