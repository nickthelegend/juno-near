import { useEffect, useState } from "react";
import { juno } from "./api";
import { useFeedRevision } from "./refresh";
import { useApi } from "./useApi";
import { validAddress } from "./chain";

export function useLifecycle(post: string, account: string | null) {
  const revision = useFeedRevision();
  const [tick, setTick] = useState(0);
  const read = useApi(async () => validAddress(post) ? ({ post, snapshot: await juno.lifecycle(post, account) }) : null, [post, account, revision, tick]);
  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 15000);
    return () => clearInterval(id);
  }, [post, account]);
  return read;
}
export type LifecycleRead = ReturnType<typeof useLifecycle>;
