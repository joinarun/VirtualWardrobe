import { SafeFailure, requireCheck } from "./policy.mjs";

// Only derived booleans/statuses leave this observer. Capability URLs and
// transport request IDs remain in memory and never enter receipts/errors.
export function bindOriginalPut({ capabilityReady, expectedBytes, origin }) {
  let active = true,
    requestId = null,
    originalRequest = null,
    result = null;
  let highLevel = null,
    resolveObservation;
  const headersById = new Map(),
    statusesById = new Map();
  const observation = new Promise((resolve) => {
    resolveObservation = resolve;
  });
  const proof = (headers) => {
    const lower = Object.fromEntries(
      Object.entries(headers || {}).map(([key, value]) => [
        key.toLowerCase(),
        String(value),
      ]),
    );
    return {
      lengthPresent: Object.hasOwn(lower, "content-length"),
      lengthMatch: lower["content-length"] === String(expectedBytes),
      originMatch: lower.origin === origin,
      cookieAbsent: !lower.cookie,
      csrfAbsent: !lower["x-csrf-token"],
    };
  };
  const complete = () => {
    if (
      !active ||
      result ||
      !requestId ||
      !headersById.has(requestId) ||
      !statusesById.has(requestId)
    )
      return;
    result = {
      originalStatus: statusesById.get(requestId),
      wireExtraInfoObserved: true,
      ...headersById.get(requestId),
    };
    resolveObservation(result);
  };
  const boundedMap = (map, id, value) => {
    if (!active || typeof id !== "string") return;
    map.set(id, value);
    if (map.size > 200) map.delete(map.keys().next().value);
    complete();
  };
  const onNetworkRequest = (event) => {
    if (!active || event.request?.method !== "PUT") return;
    Promise.resolve(capabilityReady)
      .then((capability) => {
        if (
          active &&
          !requestId &&
          capability &&
          event.request.url === capability.uploadUrl
        ) {
          requestId = event.requestId;
          complete();
        }
      })
      .catch(() => {});
  };
  const onNetworkExtraInfo = (event) =>
    boundedMap(headersById, event.requestId, proof(event.headers));
  const onNetworkResponse = (event) => {
    const status = event.response?.status;
    if (Number.isInteger(status))
      boundedMap(statusesById, event.requestId, status);
  };
  const onPlaywrightRequest = (request) => {
    if (!active || request.method() !== "PUT") return;
    Promise.resolve(capabilityReady)
      .then(async (capability) => {
        if (
          !active ||
          originalRequest ||
          !capability ||
          request.url() !== capability.uploadUrl
        )
          return;
        originalRequest = request; // Bind before awaiting; a replay cannot replace this original request.
        try {
          const headers = await request.allHeaders();
          if (active) highLevel = proof(headers);
        } catch {
          /* Wire proof remains authoritative. */
        }
      })
      .catch(() => {});
  };
  return {
    onNetworkRequest,
    onNetworkExtraInfo,
    onNetworkResponse,
    onPlaywrightRequest,
    async wait(timeoutMs = 15000) {
      let timer;
      try {
        const wire = await Promise.race([
          observation,
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new SafeFailure("ORIGINAL_PUT_OBSERVATION_TIMEOUT")),
              timeoutMs,
            );
          }),
        ]);
        requireCheck(active, "ORIGINAL_PUT_OBSERVER_CLOSED");
        return {
          ...wire,
          highLevelHeadersObserved: highLevel !== null,
          highLevelLengthPresent: highLevel?.lengthPresent ?? false,
          highLevelLengthMatch: highLevel?.lengthMatch ?? false,
        };
      } finally {
        clearTimeout(timer);
      }
    },
    dispose() {
      active = false;
      headersById.clear();
      statusesById.clear();
      originalRequest = null;
      highLevel = null;
    },
  };
}
