import { juno } from "./api";
import { useFeedRevision } from "./refresh";
import { useApi } from "./useApi";
import { validAddress } from "./chain";

/** Public lifecycle state for one post, re-read quietly every few seconds so bids, reveals and votes appear live. */
export function useLifecycle(post: string, account: string | null, pollMs = 5000) {
  const revision = useFeedRevision();
  return useApi(async () => validAddress(post) ? ({ post, snapshot: await juno.lifecycle(post, account) }) : null, [post, account, revision], { pollMs });
}
export type LifecycleRead = ReturnType<typeof useLifecycle>;
