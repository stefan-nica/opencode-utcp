import z from "zod"

// UTCP provider schemas (duplicated from main config to avoid circular imports)
export const UtcpRemote = z
  .object({
    type: z.literal("remote").describe("Type of UTCP provider connection"),
    url: z.string().describe("URL of the remote UTCP provider"),
    enabled: z.boolean().optional().describe("Enable or disable the UTCP provider"),
    headers: z.record(z.string(), z.string()).optional().describe("Headers to send with the request"),
    variables: z.record(z.string(), z.string()).optional().describe("Variable mappings for the UTCP provider"),
    timeout: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "Timeout in ms for fetching tools from the UTCP provider. Defaults to 5000 (5 seconds) if not specified.",
      ),
  })
  .strict()

export const UtcpProvider = UtcpRemote // Start with remote only
export type UtcpProvider = z.infer<typeof UtcpProvider>
export type UtcpRemote = z.infer<typeof UtcpRemote>

// UTCP-specific status schema
export const Status = z
  .discriminatedUnion("status", [
    z
      .object({
        status: z.literal("connected"),
      })
      .meta({
        ref: "UTCPStatusConnected",
      }),
    z
      .object({
        status: z.literal("disabled"),
      })
      .meta({
        ref: "UTCPStatusDisabled",
      }),
    z
      .object({
        status: z.literal("failed"),
        error: z.string(),
      })
      .meta({
        ref: "UTCPStatusFailed",
      }),
  ])
  .meta({
    ref: "UTCPStatus",
  })

export type Status = z.infer<typeof Status>
