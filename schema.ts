export const schema = {
  type: "object",
  required: ["claims"],
  additionalProperties: false,
  properties: { claims: { type: "array", items: { type: "string" } } },
};