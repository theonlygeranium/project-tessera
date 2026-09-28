// Tests run in Node, which has no `cloudflare:workers` module. @cloudflare/containers
// only needs these base classes to exist at import time; tests never start a container.
export class DurableObject { constructor(public ctx?: unknown, public env?: unknown) {} }
export class WorkerEntrypoint { constructor(public ctx?: unknown, public env?: unknown) {} }
export class WorkflowEntrypoint { constructor(public ctx?: unknown, public env?: unknown) {} }
