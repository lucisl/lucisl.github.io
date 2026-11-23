declare module 'react-native-fetch-api' {
  interface StreamingResponse {
    ok: boolean
    status: number
    headers: { get(name: string): string | null }
    body: { getReader(): { read(): Promise<{ done: boolean; value: ArrayBuffer | Uint8Array }>; cancel(): Promise<unknown> } } | null
    arrayBuffer(): Promise<ArrayBuffer>
    text(): Promise<string>
  }
  export default function fetch(url: string, options?: Record<string, unknown>): Promise<StreamingResponse>
}
