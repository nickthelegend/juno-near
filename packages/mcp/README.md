# Juno MCP

Read-only tools for agents: `list_posts` and `inspect_market`. Both query the configured live NEAR testnet RPC; no fixtures or cached claims are returned. If `JUNO_FACTORY_ACCOUNT` is absent, `list_posts` returns `Setup required: JUNO_FACTORY_ACCOUNT`.

```json
{"mcpServers":{"juno-near":{"command":"pnpm","args":["--dir","/absolute/path/to/juno-near","--filter","@juno/mcp","start"],"env":{"JUNO_FACTORY_ACCOUNT":"<deployed-factory>","NEAR_TESTNET_RPC_URL":"https://test.rpc.fastnear.com"}}}}
```

The `inspect_market` tool accepts a token account such as `<slug>.juno.testnet` and returns its current phase, sealed-bid count, floor vault, curve progress, and testnet explorer address link. It cannot trade or access signing keys.
