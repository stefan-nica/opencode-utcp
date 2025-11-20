// UTCP status management
// Separate from MCP status handling

import { UTCP } from "./client"

export namespace Status {
  export async function get() {
    return UTCP.status()
  }

  export async function summary() {
    const status = await get()
    const connected = Object.values(status).filter((s) => s.status === "connected").length
    const failed = Object.values(status).filter((s) => s.status === "failed").length
    const disabled = Object.values(status).filter((s) => s.status === "disabled").length

    return {
      connected,
      failed,
      disabled,
      total: Object.keys(status).length,
    }
  }
}
