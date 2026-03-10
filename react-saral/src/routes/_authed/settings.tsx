import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { apiKeysApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { Check, X } from "lucide-react"

export const Route = createFileRoute("/_authed/settings")({
  component: SettingsPage,
})

function SettingsPage() {
  const [llmKey, setLlmKey] = useState("")
  const [sarvam, setSarvam] = useState("")

  const statusQuery = useQuery({
    queryKey: ["api-keys-status"],
    queryFn: () => apiKeysApi.status().then((r) => r.data),
  })

  const saveMutation = useMutation({
    mutationFn: () =>
      apiKeysApi.save({
        llm_key: llmKey || undefined,
        sarvam_key: sarvam || undefined,
      }),
    onSuccess: () => {
      statusQuery.refetch()
      setLlmKey("")
      setSarvam("")
    },
  })

  const status = statusQuery.data

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-8 text-3xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>API Keys</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            Your API keys are encrypted and stored securely. Enter a key for
            your chosen LLM provider (Gemini, OpenAI, Anthropic, Groq, etc.) and
            Sarvam AI for TTS.
          </p>

          {status && (
            <div className="mb-4 flex gap-4">
              <StatusBadge label="LLM" active={status.llm_configured} />
              <StatusBadge label="Sarvam" active={status.sarvam_configured} />
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">
                LLM API Key
              </label>
              <Input
                type="password"
                placeholder="API key for your LLM provider (Gemini, OpenAI, Anthropic, Groq...)"
                value={llmKey}
                onChange={(e) => setLlmKey(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Sarvam API Key
              </label>
              <Input
                type="password"
                placeholder="Enter Sarvam API key (for TTS)"
                value={sarvam}
                onChange={(e) => setSarvam(e.target.value)}
              />
            </div>
          </div>

          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || (!llmKey && !sarvam)}
          >
            {saveMutation.isPending ? <Spinner size="sm" /> : "Save Keys"}
          </Button>

          {saveMutation.error && (
            <p className="text-sm text-red-500">
              {(saveMutation.error as Error).message}
            </p>
          )}
          {saveMutation.isSuccess && (
            <p className="text-sm text-green-600">Keys saved successfully!</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatusBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="flex items-center gap-1 text-sm">
      {active ? (
        <Check className="h-4 w-4 text-green-500" />
      ) : (
        <X className="h-4 w-4 text-gray-400" />
      )}
      <span className={active ? "text-green-600" : "text-gray-400"}>
        {label}
      </span>
    </div>
  )
}
