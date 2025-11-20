// UTCP tool registry
// Separate from main tool registry

import { UTCP } from "./client"

export namespace Registry {
  export async function getTools() {
    return UTCP.tools()
  }

  export async function list() {
    const tools = await getTools()
    return Object.keys(tools)
  }

  export async function get(name: string) {
    const tools = await getTools()
    return tools[name]
  }
}
