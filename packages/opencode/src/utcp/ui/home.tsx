// UTCP home screen indicators
// Separate from MCP home UI

import { createMemo, createSignal, createEffect, Show } from "solid-js"
import { useTheme } from "@tui/context/theme"
import { Status } from "../status"

export function UTCPHomeIndicator() {
  const { theme } = useTheme()
  const [summary, setSummary] = createSignal({ connected: 0, failed: 0, disabled: 0, total: 0 })

  createEffect(() => {
    Status.summary().then(setSummary)
  })

  return (
    <Show when={summary().total > 0}>
      <box flexShrink={0} flexDirection="row" gap={1}>
        <text fg={summary().failed > 0 ? theme.error : theme.success}>
          • {summary().connected} utcp provider{summary().connected !== 1 ? "s" : ""}
        </text>
      </box>
    </Show>
  )
}
