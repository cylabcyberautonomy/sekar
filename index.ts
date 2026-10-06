import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { schema } from "./schema";

export default function (pi: ExtensionAPI) {
  pi.on("before_provider_request", (event) => {
    const body = event.payload as Record<string, unknown>;
    const output_config = { ...((body.output_config as object) ?? {}), format: { type: "json_schema", schema } };
    return { ...body, output_config };
  });
}