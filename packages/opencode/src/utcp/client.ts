import { type Tool } from "ai"
import { UtcpClient } from "@utcp/sdk"
import { Config } from "../config/config"
import { Log } from "../util/log"
import { NamedError } from "../util/error"
import { Instance } from "../project/instance"
import { withTimeout } from "@/util/timeout"
import z from "zod"

export namespace UTCP {
  const log = Log.create({ service: "utcp" })

  export const Failed = NamedError.create(
    "UTCPFailed",
    z.object({
      name: z.string(),
    }),
  )

  type Client = {
    utcpClient: UtcpClient | null
    tools: () => Promise<Record<string, Tool>>
    close: () => Promise<void>
  }

  const state = Instance.state(
    async () => {
      const cfg = await Config.get()
      const config = cfg.utcp ?? {}
      const clients: Record<string, Client> = {}
      const status: Record<string, import("./config").Status> = {}

      log.info("Loading UTCP configuration", { providers: Object.keys(config) })

      await Promise.all(
        Object.entries(config).map(async ([key, utcp]) => {
          log.info("Creating UTCP client", { key, url: utcp.url, type: utcp.type })
          const result = await create(key, utcp).catch((error) => {
            log.error("Failed to create UTCP client", { key, error: error.message })
            return undefined
          })
          if (!result) return

          status[key] = result.status

          if (result.client) {
            clients[key] = result.client
          }
        }),
      )
      return {
        status,
        clients,
      }
    },
    async (state) => {
      await Promise.all(
        Object.values(state.clients).map((client) =>
          client.close().catch((error) => {
            log.error("Failed to close UTCP client", {
              error,
            })
          }),
        ),
      )
    },
  )

  export async function add(name: string, utcp: Config.UtcpProvider) {
    const s = await state()
    const result = await create(name, utcp)
    if (!result) {
      const status = {
        status: "failed" as const,
        error: "unknown error",
      }
      s.status[name] = status
      return {
        status,
      }
    }
    if (!result.client) {
      s.status[name] = result.status
      return {
        status: s.status,
      }
    }
    s.clients[name] = result.client
    s.status[name] = result.status

    return {
      status: s.status,
    }
  }

  async function create(key: string, utcp: Config.UtcpProvider) {
    if (utcp.enabled === false) {
      log.info("utcp provider disabled", { key })
      return
    }
    log.info("found", { key, type: utcp.type })

    let client: Client | undefined = undefined
    let status: import("./config").Status = { status: "failed", error: "Unknown error" }

    if (utcp.type === "remote") {
      try {
        // Fetch UTCP manual directly from the server
        const response = await fetch(utcp.url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            ...utcp.headers,
          },
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const manual = await response.json()

        // Validate that this is a UTCP manual
        if (!manual.utcp_version || !Array.isArray(manual.tools)) {
          throw new Error("Response is not a valid UTCP manual")
        }

        log.info("Fetched UTCP manual", {
          key,
          toolCount: manual.tools.length,
          utcpVersion: manual.utcp_version,
        })

        status = { status: "connected" }

        client = {
          utcpClient: null,
          tools: async () => {
            const tools: Record<string, Tool> = {}

            for (const utcpTool of manual.tools) {
              // Convert UTCP tool to OpenCode tool format
              tools[utcpTool.name] = {
                description: utcpTool.description || `UTCP tool: ${utcpTool.name}`,
                execute: async (args: any) => {
                  try {
                    // Check if this is a CLI tool that we need to execute locally
                    if (utcpTool.tool_call_template?.call_template_type === "cli") {
                      // Execute CLI command locally
                      const { commands, working_dir } = utcpTool.tool_call_template

                      if (!commands || commands.length === 0) {
                        throw new Error("No commands specified for CLI tool")
                      }

                      // For now, execute the first command
                      const cmd = commands[0]
                      let command = cmd.command

                      // Replace UTCP_ARG_*_UTCP_END placeholders with actual values
                      for (const [key, value] of Object.entries(args)) {
                        const placeholder = `UTCP_ARG_${key}_UTCP_END`
                        command = command.replace(new RegExp(placeholder, "g"), String(value))
                      }

                      // Execute the command
                      const { spawn } = await import("child_process")

                      const result = await new Promise<string>((resolve, reject) => {
                        const child = spawn(command, {
                          shell: true,
                          cwd: working_dir || process.cwd(),
                          stdio: "pipe",
                        })

                        let stdout = ""
                        let stderr = ""

                        child.stdout.on("data", (data) => {
                          stdout += data.toString()
                        })

                        child.stderr.on("data", (data) => {
                          stderr += data.toString()
                        })

                        child.on("close", (code) => {
                          if (code === 0) {
                            resolve(stdout)
                          } else {
                            reject(new Error(`Command failed with code ${code}: ${stderr}`))
                          }
                        })

                        child.on("error", reject)
                      })

                      return {
                        content: [
                          {
                            type: "text" as const,
                            text: result,
                          },
                        ],
                      }
                    } else {
                      throw new Error(
                        `Unsupported call template type: ${utcpTool.tool_call_template?.call_template_type}`,
                      )
                    }
                  } catch (error) {
                    return {
                      content: [
                        {
                          type: "text" as const,
                          text: `Error calling UTCP tool ${utcpTool.name}: ${error instanceof Error ? error.message : String(error)}`,
                        },
                      ],
                    }
                  }
                },
              }
            }

            log.info("Created OpenCode tools from UTCP manual", {
              key,
              toolCount: Object.keys(tools).length,
            })

            return tools
          },
          close: async () => {
            // Nothing to close since we're not using UTCP SDK client
          },
        }
      } catch (error) {
        log.error("remote utcp connection failed", {
          key,
          url: utcp.url,
          error: error instanceof Error ? error.message : String(error),
        })
        status = {
          status: "failed" as const,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }

    return {
      client,
      status,
    }
  }

  export async function status() {
    return state().then((state) => state.status)
  }

  export async function clients() {
    return state().then((state) => state.clients)
  }

  export async function tools() {
    const result: Record<string, Tool> = {}
    const s = await state()
    const clientsSnapshot = await clients()
    for (const [clientName, client] of Object.entries(clientsSnapshot)) {
      const tools = await client.tools().catch((e) => {
        log.error("failed to get tools", { clientName, error: e.message })
        const failedStatus = {
          status: "failed" as const,
          error: e instanceof Error ? e.message : String(e),
        }
        s.status[clientName] = failedStatus
        delete s.clients[clientName]
      })
      if (!tools) {
        continue
      }
      for (const [toolName, tool] of Object.entries(tools)) {
        const sanitizedClientName = clientName.replace(/[^a-zA-Z0-9_-]/g, "_")
        const sanitizedToolName = toolName.replace(/[^a-zA-Z0-9_-]/g, "_")
        result[`utcp:${sanitizedClientName}:${sanitizedToolName}`] = tool
      }
    }
    return result
  }
}
