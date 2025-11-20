// UTCP status dialog component
// Separate from MCP status UI

import { createSignal, createEffect, Show, For } from "solid-js"
import { useTheme } from "@tui/context/theme"
import { Status } from "../status"

export function UTCPStatus() {
  const { theme } = useTheme()
  const [status, setStatus] = createSignal<Record<string, import("../config").Status>>({})

  createEffect(() => {
    Status.get().then(setStatus)
  })

  return (
    <Show when={Object.keys(status()).length > 0} fallback={<text>No UTCP Providers</text>}>
      <box>
        <text fg={theme.text}>{Object.keys(status()).length} UTCP Providers</text>
        <For each={Object.entries(status())}>
          {([name, providerStatus]) => (
            <box flexDirection="row" gap={1}>
              <text
                fg={
                  providerStatus.status === "connected"
                    ? theme.success
                    : providerStatus.status === "failed"
                      ? theme.error
                      : theme.textMuted
                }
              >
                •
              </text>
              <text fg={theme.text}>{name}</text>
              <Show when={providerStatus.status === "connected"}>
                <text fg={theme.textMuted}>Connected</text>
              </Show>
              <Show when={providerStatus.status === "failed"}>
                <text fg={theme.error}>Failed: {(providerStatus as any).error || "Unknown error"}</text>
              </Show>
              <Show when={providerStatus.status === "disabled"}>
                <text fg={theme.textMuted}>Disabled</text>
              </Show>
            </box>
          )}
        </For>
      </box>
    </Show>
  )
}
